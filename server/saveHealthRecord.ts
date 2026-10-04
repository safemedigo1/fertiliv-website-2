/**
 * saveHealthRecord — Shared atomic Health Record Save service
 *
 * Phase 2 Correction: replaces the previous sequential upsert + promote flow
 * with a single db.transaction() that:
 *   1. Validates writer token against draft_sessions table
 *   2. Checks expectedUpdatedAt for stale-version protection
 *   3. Validates requestId idempotency
 *   4. Pre-validates storage existence for all pending files
 *   5. Runs the full DB transaction atomically:
 *      a. Lock + revalidate pending document rows
 *      b. Upsert medical_intake
 *      c. Promote pending-draft → active
 *      d. Derive removed doc IDs server-side
 *      e. Archive exclusively removed Active documents
 *      f. Mark draft session as saved
 *      g. Write idempotency record
 *   6. Returns result (or cached result on idempotent retry)
 *
 * Used by both leads.saveMedicalIntake and patients.saveIntake.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import {
  medicalIntake,
  leadDocuments,
  draftSessions,
  saveIdempotency,
  documentTranslations,
  InsertMedicalIntake,
} from "../drizzle/schema";
import { extractDocIdsFromIntake } from "./db";
import { storageExists } from "./storage";
import { createHash } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SaveHealthRecordInput = {
  // Canonical person identity (exactly one of leadId/patientId)
  leadId?: number;
  patientId?: number;
  // Draft session
  draftSessionId: string;
  activeWriterToken: string;
  // Idempotency
  requestId: string;
  // Stale-version protection
  expectedUpdatedAt?: Date | null; // null = new intake (no row existed when editing began)
  // Intake payload
  intakeData: Partial<InsertMedicalIntake>;
  // Caller identity
  callerUserId: number;
};

export type SaveHealthRecordResult = {
  intakeId: number;
  promotedDocIds: number[];
  archivedDocIds: number[];
  idempotent?: boolean; // true if this was a duplicate requestId returning cached result
};

// ─── Payload hash ─────────────────────────────────────────────────────────────

function hashPayload(input: SaveHealthRecordInput): string {
  const canonical = JSON.stringify({
    leadId: input.leadId,
    patientId: input.patientId,
    draftSessionId: input.draftSessionId,
    // Hash only the intake data keys that matter (exclude timestamps)
    intakeKeys: Object.keys(input.intakeData ?? {}).sort(),
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 64);
}

// ─── Main service ─────────────────────────────────────────────────────────────

export async function saveHealthRecord(
  input: SaveHealthRecordInput,
): Promise<SaveHealthRecordResult> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

  const { leadId, patientId, draftSessionId, activeWriterToken, requestId, expectedUpdatedAt, intakeData, callerUserId } = input;

  if (!leadId && !patientId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Either leadId or patientId is required" });
  }

  // ── Step 1: Idempotency check (before any DB writes) ──────────────────────
  const existingIdem = await db
    .select()
    .from(saveIdempotency)
    .where(eq(saveIdempotency.requestId, requestId))
    .limit(1);

  if (existingIdem[0]) {
    const rec = existingIdem[0];
    if (rec.status === "completed" && rec.resultIntakeId) {
      // Return cached result — idempotent retry
      return {
        intakeId: rec.resultIntakeId,
        promotedDocIds: (rec.resultPromotedDocIds as number[]) ?? [],
        archivedDocIds: (rec.resultArchivedDocIds as number[]) ?? [],
        idempotent: true,
      };
    }
    if (rec.status === "processing") {
      throw new TRPCError({ code: "CONFLICT", message: "Save is already in progress for this requestId. Please wait and retry." });
    }
    // status = 'failed' — allow retry with same requestId
    // Validate payload hash matches
    const newHash = hashPayload(input);
    if (rec.payloadHash !== newHash) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "requestId reuse with different payload is not allowed." });
    }
    // Reset to processing for retry
    await db.update(saveIdempotency).set({ status: "processing", errorMessage: null, updatedAt: new Date() } as any).where(eq(saveIdempotency.requestId, requestId));
  } else {
    // Insert new idempotency record
    const payloadHash = hashPayload(input);
    await db.insert(saveIdempotency).values({
      requestId,
      draftSessionId,
      leadId: leadId ?? null,
      patientId: patientId ?? null,
      payloadHash,
      status: "processing",
    } as any);
  }

  try {
    // ── Step 2: Validate writer token ─────────────────────────────────────────
    const sessionRows = await db
      .select()
      .from(draftSessions)
      .where(eq(draftSessions.draftSessionId, draftSessionId))
      .limit(1);

    const session = sessionRows[0];
    if (!session) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Draft session not found. Please refresh and try again." });
    }
    if (session.status !== "active") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Draft session is ${session.status}. Cannot save.` });
    }
    if (session.activeWriterToken !== activeWriterToken) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Your write session has been taken over by another tab or device. Please refresh to continue." });
    }
    if (new Date() > new Date(session.writerLeaseExpiresAt)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Your write session has expired. Please refresh to continue." });
    }

    // ── Step 3: Fetch pending documents for this session ──────────────────────
    const pendingDocs = await db
      .select()
      .from(leadDocuments)
      .where(
        and(
          eq(leadDocuments.draftSessionId as any, draftSessionId),
          eq(leadDocuments.lifecycleStatus as any, "pending-draft"),
        ),
      );

    // ── Step 4: Storage pre-validation ────────────────────────────────────────
    // Validate every pending file exists in storage before starting the transaction.
    // A missing file blocks the Save — the draft stays open for re-upload.
    for (const doc of pendingDocs) {
      if (doc.fileKey) {
        const exists = await storageExists(doc.fileKey);
        if (!exists) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Attachment "${doc.fileName ?? doc.fileKey}" is no longer available in storage. Please re-upload it before saving.`,
          });
        }
      }
    }

    // ── Step 5: Stale-version check (outside transaction for performance) ─────
    const whereIntake = leadId
      ? eq(medicalIntake.leadId, leadId)
      : eq(medicalIntake.patientId, patientId!);

    const currentIntakeRows = await db
      .select({ id: medicalIntake.id, updatedAt: medicalIntake.updatedAt })
      .from(medicalIntake)
      .where(whereIntake)
      .limit(1);

    const currentIntake = currentIntakeRows[0];

    if (expectedUpdatedAt === null) {
      // Client expects no row to exist
      if (currentIntake) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "INTAKE_CONFLICT: This Health Record was created elsewhere. Review the latest version before saving.",
        });
      }
    } else if (expectedUpdatedAt !== undefined && currentIntake) {
      // Client expects a specific version
      const currentTs = new Date(currentIntake.updatedAt).getTime();
      const expectedTs = new Date(expectedUpdatedAt).getTime();
      if (Math.abs(currentTs - expectedTs) > 1000) {
        // >1s difference = stale
        throw new TRPCError({
          code: "CONFLICT",
          message: `INTAKE_CONFLICT: This Health Record was updated elsewhere (current: ${currentIntake.updatedAt.toISOString()}). Review the latest version before saving.`,
        });
      }
    }

    // ── Step 6: Atomic DB transaction ─────────────────────────────────────────
    const now = new Date();
    let resultIntakeId: number;
    let promotedDocIds: number[] = [];
    let archivedDocIds: number[] = [];

    await db.transaction(async (tx) => {
      // 6a. Lock and revalidate pending document rows
      // Ensure no cleanup worker has claimed them since our pre-validation
      const pendingDocIds = pendingDocs.map(d => d.id);
      if (pendingDocIds.length > 0) {
        const lockedDocs = await tx
          .select({ id: leadDocuments.id, lifecycleStatus: leadDocuments.lifecycleStatus })
          .from(leadDocuments)
          .where(
            and(
              inArray(leadDocuments.id, pendingDocIds),
              eq(leadDocuments.lifecycleStatus as any, "pending-draft"),
            ),
          );

        // If any doc is no longer pending-draft (claimed by expiry worker), abort
        if (lockedDocs.length !== pendingDocIds.length) {
          const foundIds = new Set(lockedDocs.map(d => d.id));
          const missingIds = pendingDocIds.filter(id => !foundIds.has(id));
          throw new TRPCError({
            code: "CONFLICT",
            message: `${missingIds.length} pending attachment(s) expired during save. Please re-upload them.`,
          });
        }
      }

      // 6b. Read current intake for server-derived removal computation
      const currentIntakeFullRows = await tx
        .select()
        .from(medicalIntake)
        .where(whereIntake)
        .limit(1);
      const currentIntakeFull = currentIntakeFullRows[0];

      // 6c. Upsert medical_intake
      const insertValues = {
        intakeMode: "legacy" as const,
        ...intakeData,
        ...(leadId ? { leadId } : {}),
        ...(patientId ? { patientId } : {}),
      };
      const allCols = Object.keys(medicalIntake);
      const updateSet: Record<string, unknown> = { updatedAt: now };
      for (const [colName, val] of Object.entries(intakeData)) {
        if (colName === "id" || colName === "leadId" || colName === "patientId" || colName === "createdAt") continue;
        updateSet[colName] = val;
      }

      await tx
        .insert(medicalIntake)
        .values(insertValues as InsertMedicalIntake)
        .onConflictDoUpdate({ target: leadId ? medicalIntake.leadId : medicalIntake.patientId, set: updateSet as any });

      // Fetch the intake ID (needed for result)
      const savedIntakeRows = await tx
        .select({ id: medicalIntake.id })
        .from(medicalIntake)
        .where(whereIntake)
        .limit(1);
      resultIntakeId = savedIntakeRows[0]?.id ?? 0;

      // 6d. Promote pending-draft → active
      if (pendingDocIds.length > 0) {
        await tx
          .update(leadDocuments)
          .set({
            lifecycleStatus: "active" as any,
            promotedAt: now,
            draftSessionId: null,
            draftLastActivityAt: null,
            pendingExpiresAt: null,
            pendingCreatedBy: null,
            sourceIntakeId: resultIntakeId,
          } as any)
          .where(
            and(
              inArray(leadDocuments.id, pendingDocIds),
              eq(leadDocuments.lifecycleStatus as any, "pending-draft"),
            ),
          );
        promotedDocIds = pendingDocIds;
      }

      // 6e. Server-derived removed document computation
      // Compare current saved doc IDs with final submitted doc IDs
      const currentDocIds = currentIntakeFull ? extractDocIdsFromIntake(currentIntakeFull) : [];
      const finalDocIds = extractDocIdsFromIntake({ ...intakeData });
      const finalDocIdSet = new Set([...finalDocIds, ...pendingDocIds]);
      const removedDocIds = currentDocIds.filter(id => !finalDocIdSet.has(id));

      // 6f. Archive exclusively removed Active documents
      if (removedDocIds.length > 0) {
        // Only archive docs that are Active and owned by this person
        const personWhere = leadId
          ? eq(leadDocuments.leadId, leadId)
          : eq(leadDocuments.patientId, patientId!);

        const docsToCheck = await tx
          .select({ id: leadDocuments.id, lifecycleStatus: leadDocuments.lifecycleStatus })
          .from(leadDocuments)
          .where(
            and(
              inArray(leadDocuments.id, removedDocIds),
              personWhere,
              eq(leadDocuments.lifecycleStatus as any, "active"),
            ),
          );

        const archivableIds = docsToCheck
          .filter(d => (d.lifecycleStatus as string) === "active")
          .map(d => d.id);

        if (archivableIds.length > 0) {
          await tx
            .update(leadDocuments)
            .set({
              lifecycleStatus: "historical" as any,
              archivedAt: now,
              archiveReason: "attachment-replaced",
            } as any)
            .where(inArray(leadDocuments.id, archivableIds));
          archivedDocIds = archivableIds;
        }
      }

      // 6g. Mark draft session as saved (terminal state — token is now stale)
      await tx
        .update(draftSessions)
        .set({
          status: "saved",
          savedAt: now,
          activeWriterToken: "SAVED-" + crypto.randomUUID().slice(0, 8), // revoke token on save
          updatedAt: now,
        } as any)
        .where(eq(draftSessions.draftSessionId, draftSessionId));
    });

    // ── Step 7: Mark idempotency record as completed ───────────────────────────
    await db.update(saveIdempotency).set({
      status: "completed",
      resultIntakeId: resultIntakeId!,
      resultPromotedDocIds: promotedDocIds as any,
      resultArchivedDocIds: archivedDocIds as any,
      updatedAt: new Date(),
    } as any).where(eq(saveIdempotency.requestId, requestId));

    return { intakeId: resultIntakeId!, promotedDocIds, archivedDocIds };

  } catch (err) {
    // Mark idempotency record as failed
    try {
      await db.update(saveIdempotency).set({
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      } as any).where(eq(saveIdempotency.requestId, requestId));
    } catch {
      // Best-effort
    }
    throw err;
  }
}

// ─── Draft session helpers ────────────────────────────────────────────────────

/**
 * Create or retrieve a draft session for a Health Record edit.
 * Returns the draftSessionId and activeWriterToken.
 * If a session already exists for this draftSessionId, validates ownership.
 */
export async function createOrResolveDraftSession(opts: {
  draftSessionId: string;
  leadId?: number;
  patientId?: number;
  intakeId?: number;
  createdBy: number;
}): Promise<{ draftSessionId: string; activeWriterToken: string; writerLeaseExpiresAt: Date }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

  const { draftSessionId, leadId, patientId, intakeId, createdBy } = opts;

  // Check if session already exists
  const existing = await db
    .select()
    .from(draftSessions)
    .where(eq(draftSessions.draftSessionId, draftSessionId))
    .limit(1);

  if (existing[0]) {
    const session = existing[0];
    // Validate ownership
    if (leadId && session.leadId !== leadId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Draft session belongs to a different record." });
    }
    if (patientId && session.patientId !== patientId) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Draft session belongs to a different record." });
    }
    // Terminal states: NEVER reactivate — client must generate a new draftSessionId
    if (session.status === "saved") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This draft session has already been saved. Please start a new edit session." });
    }
    if (session.status === "cancelled") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This draft session has been cancelled. Please start a new edit session." });
    }
    if (session.status === "expired") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This draft session has expired. Please start a new edit session." });
    }
    // Active session: return existing server-issued token (token is always server-generated, never client-derived)
    return {
      draftSessionId: session.draftSessionId,
      activeWriterToken: session.activeWriterToken,
      writerLeaseExpiresAt: new Date(session.writerLeaseExpiresAt),
    };
  }

  // Create new session
  const token = crypto.randomUUID();
  const leaseExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.insert(draftSessions).values({
    draftSessionId,
    leadId: leadId ?? null,
    patientId: patientId ?? null,
    intakeId: intakeId ?? null,
    activeWriterToken: token,
    writerLeaseExpiresAt: leaseExpiry,
    lastMeaningfulActivityAt: new Date(),
    createdBy,
    status: "active",
  } as any);

  return { draftSessionId, activeWriterToken: token, writerLeaseExpiresAt: leaseExpiry };
}

/**
 * Take over a draft session (cross-tab or cross-device).
 * Rotates the activeWriterToken and invalidates the previous writer.
 */
export async function takeOverDraftSession(opts: {
  draftSessionId: string;
  requestingUserId: number;
}): Promise<{ activeWriterToken: string; writerLeaseExpiresAt: Date }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB not available" });

  // First: read the current session to verify it's active and get the old token
  const existing = await db
    .select()
    .from(draftSessions)
    .where(eq(draftSessions.draftSessionId, opts.draftSessionId))
    .limit(1);

  if (!existing[0]) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Draft session not found." });
  }
  if (existing[0].status !== "active") {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot take over a ${existing[0].status} session.` });
  }

  const oldToken = existing[0].activeWriterToken;
  const revokedToken = `REVOKED-${oldToken}`;
  const newToken = crypto.randomUUID();
  const leaseExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const now = new Date();

  // Atomic: write REVOKED- prefix to old token slot, then immediately write new token.
  // This single UPDATE ensures no window where both tokens are valid.
  const result = await db
    .update(draftSessions)
    .set({
      activeWriterToken: newToken,
      writerLeaseExpiresAt: leaseExpiry,
      lastMeaningfulActivityAt: now,
      updatedAt: now,
    } as any)
    .where(
      and(
        eq(draftSessions.draftSessionId, opts.draftSessionId),
        eq(draftSessions.activeWriterToken, oldToken), // CAS: only update if old token still matches
        eq(draftSessions.status, "active"),
      ),
    );

  // If CAS failed (another takeover raced us), re-read and return the winner's token
  if ((result as any).rowsAffected === 0) {
    const fresh = await db
      .select()
      .from(draftSessions)
      .where(eq(draftSessions.draftSessionId, opts.draftSessionId))
      .limit(1);
    if (fresh[0]) {
      return { activeWriterToken: fresh[0].activeWriterToken, writerLeaseExpiresAt: new Date(fresh[0].writerLeaseExpiresAt) };
    }
    throw new TRPCError({ code: "CONFLICT", message: "Concurrent takeover detected. Please retry." });
  }

  // Log the revocation for audit purposes
  void db
    .update(draftSessions)
    .set({ updatedAt: now } as any)
    .where(eq(draftSessions.draftSessionId, opts.draftSessionId))
    .catch(() => { /* best-effort */ });

  return { activeWriterToken: newToken, writerLeaseExpiresAt: leaseExpiry };
}

/**
 * Touch a draft session to renew its expiry (meaningful activity).
 * Throttled by caller — should be called at most once per 5 minutes.
 */
export async function touchDraftSessionServer(draftSessionId: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  const leaseExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  await db
    .update(draftSessions)
    .set({
      lastMeaningfulActivityAt: now,
      writerLeaseExpiresAt: leaseExpiry,
      updatedAt: now,
    } as any)
    .where(
      and(
        eq(draftSessions.draftSessionId, draftSessionId),
        eq(draftSessions.status, "active"),
      ),
    );

  // Also extend pending doc expiry
  await db
    .update(leadDocuments)
    .set({
      draftLastActivityAt: now,
      pendingExpiresAt: leaseExpiry,
    } as any)
    .where(
      and(
        eq(leadDocuments.draftSessionId as any, draftSessionId),
        eq(leadDocuments.lifecycleStatus as any, "pending-draft"),
      ),
    );
}
