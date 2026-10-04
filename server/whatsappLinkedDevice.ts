import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  auditLogs,
  users,
  whatsappConnections,
  whatsappLinkedDeviceLineStaff,
  whatsappLinkedDeviceLines,
  whatsappLinkedDeviceSessions,
  whatsappLinkedDeviceCredentials,
  whatsappSyntheticTestRecipients,
} from "../drizzle/schema";
import {
  FERTILIV_CLINIC_SCOPE,
  type ResolvedWhatsAppConnection,
} from "../shared/whatsappPhase1Contracts";
import { isLinkedDeviceLineDeletable } from "../shared/whatsappLinkedDeviceLifecycle";
import {
  allocateLinkedDeviceRuntime,
  restoreLinkedDeviceRuntimeBinding,
  type LinkedDeviceRuntimeBinding,
} from "./linkedDeviceRuntime";
import {
  allocateIsolatedLinkedDeviceRuntime,
  isIsolatedLinkedDeviceControllerEnabled,
  startIsolatedLinkedDeviceWorker,
} from "./linkedDeviceRuntimeController";
import { getDb, getStaffUsers, logAudit } from "./db";

export type { LinkedDeviceRuntimeBinding } from "./linkedDeviceRuntime";
import {
  wppConnectSandboxAdapter,
  type LinkedDeviceProviderEvent,
  type WppConnectSandboxStatus,
} from "./whatsappLinkedDeviceProvider";
import {
  getWppConnectServerConnectionStatus,
  getWppConnectServerQrDataUrl,
  isWppConnectServerAdapterEnabled,
  isWppConnectServerIngressEnabled,
  ownershipFromRuntime,
  preflightWppConnectServerProvider,
  startWppConnectServerSession,
  validateWppConnectServerOwnership,
  wppConnectServerEventKey,
  type WppConnectServerOwnership,
} from "./wppConnectServerAdapter";
import { emitInboxNotification } from "./whatsappOperationalNotifications";

/**
 * Linked Device is intentionally an adapter boundary, not a live transport.
 * The feasibility gate found no supported Meta API for generic WhatsApp Web QR
 * linking. Until an approved provider, contract, and compliance review exist,
 * all QR requests fail closed before a provider call, QR payload, or credential
 * envelope can be created.
 */
export const LINKED_DEVICE_FEASIBILITY_GATE = {
  approvedForProduction: false,
  adapterKind: "wppconnect_sandbox_poc",
  reason:
    "WPPConnect completed an isolated synthetic QR, session, inbound, outbound, restart, reconnect, media, group-list, and history-availability POC. It remains sandbox-only.",
  productionBlocker:
    "WPPConnect uses unofficial WhatsApp Web browser automation. Legal, privacy, security, operational, licensing, and clinical approval are still required before any production traffic.",
} as const;

export const linkedDeviceSessionStates = [
  "not_started",
  "creating_session",
  "waiting_for_qr",
  "qr_ready",
  "qr_expired",
  "linking",
  "connected",
  "reconnecting",
  "disconnected",
  "logged_out",
  "session_invalid",
  "failed",
  "disabled",
] as const;
export type LinkedDeviceSessionState =
  (typeof linkedDeviceSessionStates)[number];

export type LinkedDeviceActor = {
  id: number;
  name: string | null;
  role: string;
};

export type SafeLinkedDeviceLine = {
  id: number;
  lineName: string;
  displayPhone: string | null;
  providerApprovalState: "blocked" | "approved";
  adapterKind: string;
  lifecycleState: LinkedDeviceSessionState;
  healthState: "unknown" | "healthy" | "degraded" | "unavailable";
  connectedAt: Date | null;
  lastSeenAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  disconnectedAt: Date | null;
  sessionState: LinkedDeviceSessionState;
  sessionFailureCategory: string | null;
  runtimeAllocationVerified: boolean;
  authorizedStaffCount: number;
  authorizedStaffIds: number[];
};

type LinkedDeviceRuntimeSessionFields = {
  id?: number | null;
  sessionId?: number | null;
  runtimeSlot: string | null;
  runtimeEndpoint: string | null;
  runtimeMode: "sandbox" | "persistent_worker" | null;
  runtimeGeneration: string | null;
  runtimeProfileRef: string | null;
  sessionName: string | null;
};

export function linkedDeviceRuntimeFromSession(
  session: LinkedDeviceRuntimeSessionFields | null | undefined
) {
  if (!session) return null;
  return restoreLinkedDeviceRuntimeBinding({
    sessionId:
      session.sessionId != null
      ? String(session.sessionId)
        : session.id != null
          ? String(session.id)
          : null,
    slot: session.runtimeSlot,
    endpointUrl: session.runtimeEndpoint,
    mode: session.runtimeMode,
    generation: session.runtimeGeneration,
    profileRef: session.runtimeProfileRef,
    sessionName: session.sessionName,
  });
}

export function hasActiveWppConnectIdentity(
  status: Pick<WppConnectSandboxStatus, "status" | "outboundReady" | "identity">
) {
  return (
    status.status === "CONNECTED" &&
    status.outboundReady === true &&
    Boolean(status.identity?.accountHint)
  );
}

export function projectWppConnectCurrentIdentity(
  status: Pick<WppConnectSandboxStatus, "status" | "outboundReady" | "identity">
) {
  const active = hasActiveWppConnectIdentity(status);
  return {
    displayPhone: active ? (status.identity?.accountHint ?? null) : null,
    // WPPConnect exposes only a masked account hint, never a normalized full phone.
    normalizedDisplayPhone: null,
    providerAccountHint: active ? (status.identity?.accountHint ?? null) : null,
    providerPushName: active ? (status.identity?.pushname ?? null) : null,
    providerPlatform: active ? (status.identity?.platform ?? null) : null,
  };
}

export function sandboxStartIsProviderAvailable(
  status: Pick<
    WppConnectSandboxStatus,
    | "available"
    | "status"
    | "outboundReady"
    | "identity"
    | "qrAvailable"
    | "error"
  >
) {
  if (!status.available || status.error) return false;
  if (status.status === "QR_READY") return status.qrAvailable === true;
  return (
    status.status === "CONNECTED" &&
    status.outboundReady === true &&
    Boolean(status.identity?.accountHint)
  );
}

/**
 * A connected browser alone is not sufficient to authorize a direct send.
 * The worker must explicitly identify the same persistent line and current
 * disposable session selected by Fertiliv. This prevents a legacy worker
 * profile from accepting a proof minted for a different line.
 */
export function workerAllocationMatchesLinkedDeviceLine(input: {
  lineId: number;
  providerLineId: string;
  runtime: LinkedDeviceRuntimeBinding | null;
  status: Pick<
    WppConnectSandboxStatus,
    | "workerLineId"
    | "workerLineProviderId"
    | "workerSessionId"
    | "sessionName"
    | "runtimeGeneration"
  >;
}) {
  return Boolean(
    input.runtime &&
      input.runtime.sessionId &&
      input.status.workerLineId === input.lineId &&
      input.status.workerLineProviderId === input.providerLineId &&
      input.status.workerSessionId === input.runtime.sessionId &&
      input.status.sessionName === input.runtime.sessionName &&
      input.status.runtimeGeneration === input.runtime.generation
  );
}

/** A stale DB Connected flag is never sufficient without a matching worker snapshot. */
export function workerAllocationSnapshotMatchesLinkedDeviceLine(input: {
  lineId: number;
  sessionId: number | string | null | undefined;
  sessionName: string | null | undefined;
  runtimeGeneration: string | null | undefined;
  snapshot: unknown;
}) {
  if (!input.sessionId || !input.sessionName || !input.runtimeGeneration)
    return false;
  if (
    !input.snapshot ||
    typeof input.snapshot !== "object" ||
    Array.isArray(input.snapshot)
  )
    return false;
  const snapshot = input.snapshot as Record<string, unknown>;
  return (
    snapshot.status === "CONNECTED" &&
    snapshot.outboundReady === true &&
    snapshot.workerLineId === input.lineId &&
    snapshot.workerLineProviderId === `wppconnect-line-${input.lineId}` &&
    String(snapshot.workerSessionId ?? "") === String(input.sessionId) &&
    snapshot.sessionName === input.sessionName &&
    snapshot.runtimeGeneration === input.runtimeGeneration
  );
}

function safeLineProjection(input: {
  id: number;
  lineName: string;
  displayPhone: string | null;
  providerApprovalState: "blocked" | "approved";
  adapterKind: string;
  lifecycleState: LinkedDeviceSessionState;
  healthState: "unknown" | "healthy" | "degraded" | "unavailable";
  connectedAt: Date | null;
  lastSeenAt: Date | null;
  lastSuccessfulSyncAt: Date | null;
  disconnectedAt: Date | null;
  sessionState: LinkedDeviceSessionState | null;
  sessionFailureCategory: string | null;
  runtimeAllocationVerified: boolean;
  authorizedStaffCount: number;
  authorizedStaffIds: number[];
}): SafeLinkedDeviceLine {
  const allocationVerified =
    input.lifecycleState !== "connected" || input.runtimeAllocationVerified;
  const effectiveLifecycleState = allocationVerified
    ? input.lifecycleState
    : "failed";
  const effectiveSessionState = allocationVerified
    ? (input.sessionState ?? "not_started")
    : "failed";
  return {
    id: input.id,
    lineName: input.lineName,
    displayPhone:
      input.lifecycleState === "connected" &&
      input.sessionState === "connected" &&
      input.runtimeAllocationVerified
      ? input.displayPhone
      : null,
    providerApprovalState: input.providerApprovalState,
    adapterKind: input.adapterKind,
    lifecycleState: effectiveLifecycleState,
    healthState: allocationVerified ? input.healthState : "unavailable",
    connectedAt: input.connectedAt,
    lastSeenAt: input.lastSeenAt,
    lastSuccessfulSyncAt: input.lastSuccessfulSyncAt,
    disconnectedAt: input.disconnectedAt,
    sessionState: effectiveSessionState,
    sessionFailureCategory: input.sessionFailureCategory,
    runtimeAllocationVerified: input.runtimeAllocationVerified,
    authorizedStaffCount: input.authorizedStaffCount,
    authorizedStaffIds: input.authorizedStaffIds,
  };
}

function normalizeStaffIds(staffIds: number[]): number[] {
  return Array.from(
    new Set(staffIds.filter(id => Number.isInteger(id) && id > 0))
  );
}

async function validateAuthorizedStaffIds(staffIds: number[]) {
  const db = await getDb();
  if (!db)
    throw new Error("Linked Device setup requires an available database.");

  const normalized = normalizeStaffIds(staffIds);
  if (normalized.length === 0) {
    throw new Error(
      "Select at least one authorized staff member for this line."
    );
  }

  const staff = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
      inArray(users.id, normalized),
      inArray(users.role, ["staff", "admin", "manager", "doctor"]),
      eq(users.status, "active"),
      eq(users.isActive, true),
      )
    );

  if (staff.length !== normalized.length) {
    throw new Error(
      "One or more authorized staff members are no longer eligible."
    );
  }
  return normalized;
}

function audit(
  actor: LinkedDeviceActor,
  action: string,
  lineId: number,
  description: string
) {
  return logAudit({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action,
    category: "other",
    recordId: lineId,
    recordType: "whatsapp_linked_device_line",
    page: "/settings?tab=whatsapp",
    description,
  });
}

/** Lists active users that can be assigned to a line without exposing credentials. */
export async function listEligibleLinkedDeviceStaff() {
  return getStaffUsers();
}

/** Lists line state and diagnostics only; no session material is selected. */
export async function listSafeLinkedDeviceLines(): Promise<
  SafeLinkedDeviceLine[]
> {
  const db = await getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: whatsappLinkedDeviceLines.id,
      lineName: whatsappLinkedDeviceLines.lineName,
      displayPhone: whatsappLinkedDeviceLines.displayPhone,
      providerApprovalState: whatsappLinkedDeviceLines.providerApprovalState,
      adapterKind: whatsappLinkedDeviceLines.adapterKind,
      lifecycleState: whatsappLinkedDeviceLines.lifecycleState,
      healthState: whatsappLinkedDeviceLines.healthState,
      connectedAt: whatsappLinkedDeviceLines.connectedAt,
      lastSeenAt: whatsappLinkedDeviceLines.lastSeenAt,
      lastSuccessfulSyncAt: whatsappLinkedDeviceLines.lastSuccessfulSyncAt,
      disconnectedAt: whatsappLinkedDeviceLines.disconnectedAt,
      providerStateSnapshot: whatsappConnections.providerStateSnapshot,
      sessionId: whatsappLinkedDeviceSessions.id,
      sessionState: whatsappLinkedDeviceSessions.state,
      sessionFailureCategory: whatsappLinkedDeviceSessions.failureCategory,
      sessionName: whatsappLinkedDeviceSessions.sessionName,
      runtimeGeneration: whatsappLinkedDeviceSessions.runtimeGeneration,
      authorizedStaffCount: sql<number>`count(${whatsappLinkedDeviceLineStaff.id})`,
    })
    .from(whatsappLinkedDeviceLines)
    .leftJoin(
      whatsappLinkedDeviceSessions,
      eq(whatsappLinkedDeviceSessions.lineId, whatsappLinkedDeviceLines.id)
    )
    .leftJoin(
      whatsappConnections,
      eq(whatsappConnections.id, whatsappLinkedDeviceLines.connectionId)
    )
    .leftJoin(
      whatsappLinkedDeviceLineStaff,
      eq(whatsappLinkedDeviceLineStaff.lineId, whatsappLinkedDeviceLines.id)
    )
    .where(
      and(
      eq(whatsappLinkedDeviceLines.clinicScope, FERTILIV_CLINIC_SCOPE),
        ne(whatsappLinkedDeviceLines.lifecycleState, "disabled")
      )
    )
    .groupBy(
      whatsappLinkedDeviceLines.id,
      whatsappLinkedDeviceSessions.id,
      whatsappLinkedDeviceSessions.state,
      whatsappLinkedDeviceSessions.failureCategory,
      whatsappLinkedDeviceSessions.sessionName,
      whatsappLinkedDeviceSessions.runtimeGeneration,
      whatsappConnections.providerStateSnapshot
    )
    .orderBy(desc(whatsappLinkedDeviceLines.updatedAt));

  const lineIds = rows.map(row => Number(row.id));
  const staffRows =
    lineIds.length === 0
    ? []
    : await db
          .select({
            lineId: whatsappLinkedDeviceLineStaff.lineId,
            userId: whatsappLinkedDeviceLineStaff.userId,
          })
      .from(whatsappLinkedDeviceLineStaff)
      .where(inArray(whatsappLinkedDeviceLineStaff.lineId, lineIds));
  const authorizedStaffIdsByLine = new Map<number, number[]>();
  for (const row of staffRows) {
    const ids = authorizedStaffIdsByLine.get(Number(row.lineId)) ?? [];
    ids.push(Number(row.userId));
    authorizedStaffIdsByLine.set(Number(row.lineId), ids);
  }

  return rows.map(row =>
    safeLineProjection({
    ...row,
      providerApprovalState: row.providerApprovalState as
        | "blocked"
        | "approved",
    lifecycleState: row.lifecycleState as LinkedDeviceSessionState,
      healthState: row.healthState as
        | "unknown"
        | "healthy"
        | "degraded"
        | "unavailable",
    sessionState: row.sessionState as LinkedDeviceSessionState | null,
      runtimeAllocationVerified:
        workerAllocationSnapshotMatchesLinkedDeviceLine({
      lineId: Number(row.id),
      sessionId: row.sessionId,
      sessionName: row.sessionName,
      runtimeGeneration: row.runtimeGeneration,
      snapshot: row.providerStateSnapshot,
    }),
    authorizedStaffCount: Number(row.authorizedStaffCount ?? 0),
    authorizedStaffIds: authorizedStaffIdsByLine.get(Number(row.id)) ?? [],
    })
  );
}

/**
 * Creates an isolated line/access-list record and a non-secret session lifecycle
 * record. It neither creates a provider session nor stores credentials.
 */
export async function createLinkedDeviceLine(input: {
  lineName: string;
  authorizedStaffIds: number[];
  actor: LinkedDeviceActor;
}) {
  const db = await getDb();
  if (!db)
    throw new Error("Linked Device setup requires an available database.");

  const lineName = input.lineName.trim().replace(/\s+/g, " ");
  if (lineName.length < 2 || lineName.length > 128) {
    throw new Error("Line name must contain between 2 and 128 characters.");
  }
  const authorizedStaffIds = await validateAuthorizedStaffIds(
    input.authorizedStaffIds
  );
  // During the controlled Server rollout, only lines created after the gate is
  // enabled receive the server adapter classification. Historical lines retain
  // their existing adapter and can never be redirected by this path.
  const initialAdapterKind = isWppConnectServerAdapterEnabled()
    ? "wppconnect_server"
    : "unselected";

  const lineId = await db.transaction(async tx => {
    const [created] = await tx.insert(whatsappLinkedDeviceLines).values({
      clinicScope: FERTILIV_CLINIC_SCOPE,
      lineName,
      providerApprovalState: "blocked",
      adapterKind: initialAdapterKind,
      lifecycleState: "not_started",
      healthState: "unknown",
      createdById: input.actor.id,
      updatedById: input.actor.id,
    });
    const id = Number((created as any).insertId);
    if (!id) throw new Error("Linked Device line could not be created.");

    await tx.insert(whatsappLinkedDeviceLineStaff).values(
      authorizedStaffIds.map(userId => ({
      lineId: id,
      userId,
      grantedById: input.actor.id,
      }))
    );
    await tx.insert(whatsappLinkedDeviceSessions).values({
      lineId: id,
      state: "not_started",
      createdById: input.actor.id,
    });
    return id;
  });

  await audit(
    input.actor,
    "whatsapp_linked_device_line_created",
    lineId,
    "Linked Device line foundation created without provider session or credentials."
  );
  return {
    id: lineId,
    state: "not_started" as const,
    approvalState: "blocked" as const,
    adapterKind: initialAdapterKind,
  };
}

/**
 * The Server rollout uses durable line classification, not an environment ID.
 * This makes the next newly created clean line eligible while preserving every
 * historical Sandbox binding—including Qu1—as outside the Server path.
 */
async function isWppConnectServerSelectedLine(lineId: number) {
  if (!isWppConnectServerAdapterEnabled() || !Number.isInteger(lineId) || lineId <= 0) {
    return false;
  }
  const db = await getDb();
  if (!db) return false;
  const [line] = await db.select({
    adapterKind: whatsappLinkedDeviceLines.adapterKind,
    lifecycleState: whatsappLinkedDeviceLines.lifecycleState,
  }).from(whatsappLinkedDeviceLines)
    .where(and(
      eq(whatsappLinkedDeviceLines.id, lineId),
      eq(whatsappLinkedDeviceLines.clinicScope, FERTILIV_CLINIC_SCOPE)
    ))
    .limit(1);
  return line?.adapterKind === "wppconnect_server" && line.lifecycleState !== "disabled";
}

export function canManageLinkedDeviceLineStaff(
  actor: Pick<LinkedDeviceActor, "role">
) {
  return actor.role === "admin";
}

export function computeAuthorizedStaffDelta(
  currentStaffIds: number[],
  requestedStaffIds: number[]
) {
  const current = normalizeStaffIds(currentStaffIds);
  const requested = normalizeStaffIds(requestedStaffIds);
  const currentSet = new Set(current);
  const requestedSet = new Set(requested);
  return {
    requestedStaffIds: requested,
    addedUserIds: requested.filter(userId => !currentSet.has(userId)),
    removedUserIds: current.filter(userId => !requestedSet.has(userId)),
  };
}

/** Updates only the persistent line access list; it never touches a provider session. */
export async function updateLinkedDeviceLineStaff(input: {
  lineId: number;
  authorizedStaffIds: number[];
  actor: LinkedDeviceActor;
}) {
  if (!canManageLinkedDeviceLineStaff(input.actor)) {
    throw new Error(
      "Administrator access is required to manage Linked Device staff."
    );
  }
  const db = await getDb();
  if (!db)
    throw new Error(
      "Linked Device staff management requires an available database."
    );

  const requestedStaffIds = await validateAuthorizedStaffIds(
    input.authorizedStaffIds
  );
  const result = await db.transaction(async tx => {
    const [line] = await tx
      .select({
        id: whatsappLinkedDeviceLines.id,
        lifecycleState: whatsappLinkedDeviceLines.lifecycleState,
      })
      .from(whatsappLinkedDeviceLines)
      .where(
        and(
        eq(whatsappLinkedDeviceLines.id, input.lineId),
          eq(whatsappLinkedDeviceLines.clinicScope, FERTILIV_CLINIC_SCOPE)
        )
      )
      .limit(1)
      .for("update");
    if (!line) throw new Error("Linked Device line was not found.");
    if (line.lifecycleState === "disabled")
      throw new Error("This WhatsApp line is no longer active.");

    const currentRows = await tx
      .select({ userId: whatsappLinkedDeviceLineStaff.userId })
      .from(whatsappLinkedDeviceLineStaff)
      .where(eq(whatsappLinkedDeviceLineStaff.lineId, line.id))
      .for("update");
    const delta = computeAuthorizedStaffDelta(
      currentRows.map(row => Number(row.userId)),
      requestedStaffIds
    );

    if (delta.removedUserIds.length > 0) {
      await tx
        .delete(whatsappLinkedDeviceLineStaff)
        .where(
          and(
        eq(whatsappLinkedDeviceLineStaff.lineId, line.id),
            inArray(whatsappLinkedDeviceLineStaff.userId, delta.removedUserIds)
          )
        );
    }
    if (delta.addedUserIds.length > 0) {
      await tx.insert(whatsappLinkedDeviceLineStaff).values(
        delta.addedUserIds.map(userId => ({
        lineId: line.id,
        userId,
        grantedById: input.actor.id,
        }))
      );
    }

    const changed =
      delta.addedUserIds.length > 0 || delta.removedUserIds.length > 0;
    if (changed) {
      const affectedIds = [...delta.addedUserIds, ...delta.removedUserIds];
      const staffRows =
        affectedIds.length === 0
        ? []
          : await tx
              .select({ id: users.id, name: users.name })
              .from(users)
              .where(inArray(users.id, affectedIds));
      const names = new Map(
        staffRows.map(staff => [
          Number(staff.id),
          staff.name?.trim() || `User ${staff.id}`,
        ])
      );
      const describe = (ids: number[]) =>
        ids.length === 0
        ? "none"
          : ids
              .map(id => `${names.get(id) ?? `User ${id}`} (#${id})`)
              .join(", ");
      await tx.insert(auditLogs).values({
        userId: input.actor.id,
        userName: input.actor.name,
        userRole: input.actor.role,
        action: "whatsapp_linked_device_line_staff_updated",
        category: "other",
        recordId: line.id,
        recordType: "whatsapp_linked_device_line",
        page: "/settings?tab=whatsapp",
        description: `Authorized staff updated for Linked Device line ${line.id}. Added: ${describe(delta.addedUserIds)}. Removed: ${describe(delta.removedUserIds)}.`,
      });
    }

    return { lineId: line.id, ...delta, changed };
  });

  return {
    lineId: result.lineId,
    authorizedStaffIds: result.requestedStaffIds,
    authorizedStaffCount: result.requestedStaffIds.length,
    addedUserIds: result.addedUserIds,
    removedUserIds: result.removedUserIds,
    changed: result.changed,
  };
}

export function buildBlockedLinkedDeviceQrResult(lineId: number) {
  return {
    lineId,
    outcome: "blocked" as const,
    state: "disabled" as const,
    reason: LINKED_DEVICE_FEASIBILITY_GATE.reason,
  };
}

/**
 * Explicitly fails closed. There is no provider call, QR payload, temporary QR
 * storage, or session credential in this code path.
 */
export async function requestLinkedDeviceQr(input: {
  lineId: number;
  actor: LinkedDeviceActor;
}) {
  const db = await getDb();
  if (!db)
    throw new Error("Linked Device setup requires an available database.");

  const [line] = await db
    .select({
      id: whatsappLinkedDeviceLines.id,
      providerApprovalState: whatsappLinkedDeviceLines.providerApprovalState,
      lifecycleState: whatsappLinkedDeviceLines.lifecycleState,
    })
    .from(whatsappLinkedDeviceLines)
    .where(
      and(
      eq(whatsappLinkedDeviceLines.id, input.lineId),
        eq(whatsappLinkedDeviceLines.clinicScope, FERTILIV_CLINIC_SCOPE)
      )
    )
    .limit(1);
  if (!line) throw new Error("Linked Device line was not found.");
  if (line.lifecycleState === "disabled")
    throw new Error(
      "This WhatsApp line was deleted from Settings. Create a new line to connect again."
    );

  // No approval mutation is exposed by this workstream. Treat any state as
  // blocked until a future adapter review explicitly implements that boundary.
  await db.transaction(async tx => {
    await tx
      .update(whatsappLinkedDeviceLines)
      .set({
      lifecycleState: "disabled",
      healthState: "unavailable",
      updatedById: input.actor.id,
      })
      .where(eq(whatsappLinkedDeviceLines.id, line.id));
    await tx
      .update(whatsappLinkedDeviceSessions)
      .set({
      state: "disabled",
      failureCategory: "unapproved_provider",
      lastRequestedAt: new Date(),
      lastStateChangedAt: new Date(),
      })
      .where(eq(whatsappLinkedDeviceSessions.lineId, line.id));
  });

  await audit(
    input.actor,
    "whatsapp_linked_device_qr_blocked",
    line.id,
    "QR generation blocked because no provider mechanism is approved for production."
  );
  return buildBlockedLinkedDeviceQrResult(line.id);
}

/** Admins retain the current global administration model; other staff must be listed on the line. */
export async function canUserAccessLinkedDeviceLine(input: {
  lineId: number;
  userId: number;
  userRole: string;
}) {
  if (input.userRole === "admin") return true;
  const db = await getDb();
  if (!db) return false;
  const [grant] = await db
    .select({ id: whatsappLinkedDeviceLineStaff.id })
    .from(whatsappLinkedDeviceLineStaff)
    .where(
      and(
      eq(whatsappLinkedDeviceLineStaff.lineId, input.lineId),
        eq(whatsappLinkedDeviceLineStaff.userId, input.userId)
      )
    )
    .limit(1);
  return Boolean(grant);
}

async function ensureWppConnectSandboxConnection(input: {
  lineId: number;
  actor: LinkedDeviceActor;
}): Promise<ResolvedWhatsAppConnection> {
  const db = await getDb();
  if (!db)
    throw new Error(
      "Linked Device sandbox bridge requires an available database."
    );
  const providerPhoneNumberId = `wppconnect-line-${input.lineId}`;
  let [connection] = await db
    .select()
    .from(whatsappConnections)
    .where(
      and(
    eq(whatsappConnections.provider, "wppconnect"),
        eq(whatsappConnections.providerPhoneNumberId, providerPhoneNumberId)
      )
    )
    .limit(1);

  if (!connection) {
    await db.insert(whatsappConnections).values({
      clinicScope: FERTILIV_CLINIC_SCOPE,
      provider: "wppconnect",
      onboardingMethod: "linked_device_wppconnect_sandbox",
      providerPhoneNumberId,
      displayName: "WPPConnect synthetic sandbox line",
      providerMetadata: {
        sandboxOnly: true,
        transportClassification:
          wppConnectSandboxAdapter.transportClassification,
      },
      credentialSource: "secret_reference",
      credentialRef: "secret://wppconnect/sandbox-not-configured",
      lifecycleStatus: "onboarding",
      healthState: "unknown",
      createdById: input.actor.id,
      updatedById: input.actor.id,
    });
    [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(
        and(
      eq(whatsappConnections.provider, "wppconnect"),
          eq(whatsappConnections.providerPhoneNumberId, providerPhoneNumberId)
        )
      )
      .limit(1);
  }
  if (!connection)
    throw new Error("Linked Device sandbox connection could not be confirmed.");

  return {
    id: connection.id,
    clinicScope: connection.clinicScope,
    provider: "wppconnect",
    onboardingMethod: "linked_device_wppconnect_sandbox",
    phoneNumberId: connection.providerPhoneNumberId,
    wabaId: null,
    businessPortfolioId: null,
    displayPhone: connection.displayPhone,
    normalizedDisplayPhone: connection.normalizedDisplayPhone,
    displayName: connection.displayName,
    credentialSource: "secret_reference",
    credentialRef: connection.credentialRef,
    lifecycleStatus: connection.lifecycleStatus,
    route: "persisted",
  };
}

function sandboxLifecycleState(
  status: WppConnectSandboxStatus
): LinkedDeviceSessionState {
  if (status.status === "CONNECTED" && status.outboundReady) return "connected";
  if (status.status === "QR_READY") return "qr_ready";
  if (status.status === "LOGGED_OUT") return "logged_out";
  if (status.status === "UNAVAILABLE") return "failed";
  if (status.phase === "waiting_for_qr") return "waiting_for_qr";
  if (status.phase === "creating_session") return "creating_session";
  return "reconnecting";
}

async function syncWppConnectSandboxLine(input: {
  lineId: number;
  actor: LinkedDeviceActor;
  connectionId?: number | null;
  status: WppConnectSandboxStatus;
  adapterKind?: "wppconnect_sandbox" | "wppconnect_in_app_sandbox";
  runtime?: LinkedDeviceRuntimeBinding | null;
}) {
  const db = await getDb();
  if (!db)
    throw new Error(
      "Linked Device sandbox bridge requires an available database."
    );
  const now = new Date();
  const lifecycleState = sandboxLifecycleState(input.status);
  const currentIdentity = projectWppConnectCurrentIdentity(input.status);
  const healthState =
    input.status.status === "CONNECTED" && input.status.outboundReady
      ? "healthy"
      : input.status.available
        ? "unknown"
        : "unavailable";
  const providerHealthState =
    input.status.available && !input.status.error && input.status.outboundReady
    ? "healthy"
      : "unavailable";
  const connectionLifecycleState =
    lifecycleState === "connected"
    ? "connected"
    : ["disconnected", "logged_out", "failed"].includes(lifecycleState)
        ? lifecycleState === "disconnected"
          ? "disconnected"
          : "error"
      : "onboarding";
  const providerStateSnapshot = {
    sandboxOnly: true,
    transportClassification: wppConnectSandboxAdapter.transportClassification,
    phase: input.status.phase,
    status: input.status.status,
    connectionState: input.status.connectionState,
    outboundReady: input.status.outboundReady,
    workerLineId: input.status.workerLineId,
    workerLineProviderId: input.status.workerLineProviderId,
    workerSessionId: input.status.workerSessionId,
    sessionName: input.status.sessionName,
    sessionId: input.runtime?.sessionId ?? input.status.workerSessionId,
    directRecipientEnabled:
      input.adapterKind === "wppconnect_in_app_sandbox" &&
      lifecycleState === "connected",
    runtimeSlot: input.runtime?.slot ?? null,
    runtimeMode: input.runtime?.mode ?? null,
    runtimeGeneration: input.runtime?.generation ?? null,
  };
  const [current] = await db
    .select({
    connectedAt: whatsappLinkedDeviceLines.connectedAt,
    healthState: whatsappLinkedDeviceLines.healthState,
    lifecycleState: whatsappLinkedDeviceLines.lifecycleState,
    sessionState: whatsappLinkedDeviceSessions.state,
    reconnectCount: whatsappLinkedDeviceSessions.reconnectCount,
    runtimeSlot: whatsappLinkedDeviceSessions.runtimeSlot,
    runtimeEndpoint: whatsappLinkedDeviceSessions.runtimeEndpoint,
    runtimeMode: whatsappLinkedDeviceSessions.runtimeMode,
    runtimeGeneration: whatsappLinkedDeviceSessions.runtimeGeneration,
    runtimeProfileRef: whatsappLinkedDeviceSessions.runtimeProfileRef,
    runtimeAllocatedAt: whatsappLinkedDeviceSessions.runtimeAllocatedAt,
  })
    .from(whatsappLinkedDeviceLines)
    .leftJoin(
      whatsappLinkedDeviceSessions,
      eq(whatsappLinkedDeviceSessions.lineId, whatsappLinkedDeviceLines.id)
    )
    .where(
      and(
      eq(whatsappLinkedDeviceLines.id, input.lineId),
        eq(whatsappLinkedDeviceLines.clinicScope, FERTILIV_CLINIC_SCOPE)
      )
    )
    .limit(1);
  if (!current) throw new Error("Linked Device line was not found.");
  if (current.lifecycleState === "disabled")
    throw new Error("This WhatsApp line was deleted from Settings.");
  // Only an explicit Connect action allocates a binding. Status polling must
  // never silently migrate or take ownership of an already-live legacy session.
  const runtime = input.runtime ?? null;
  if (
    runtime &&
    input.status.sessionName &&
    input.status.sessionName !== runtime.sessionName
  ) {
    throw new Error(
      "The worker responded for a different Linked Device session."
    );
  }

  await db.transaction(async tx => {
    await tx
      .update(whatsappLinkedDeviceLines)
      .set({
      connectionId: input.connectionId ?? undefined,
      adapterKind: input.adapterKind ?? "wppconnect_in_app_sandbox",
      lifecycleState,
      healthState,
      displayPhone: currentIdentity.displayPhone,
      normalizedDisplayPhone: currentIdentity.normalizedDisplayPhone,
        connectedAt:
          lifecycleState === "connected"
            ? current.sessionState === "connected"
              ? current.connectedAt
              : now
        : current.connectedAt,
      lastSeenAt: input.status.available ? now : undefined,
      lastSuccessfulSyncAt: lifecycleState === "connected" ? now : undefined,
        disconnectedAt: ["disconnected", "logged_out", "failed"].includes(
          lifecycleState
        )
          ? now
          : undefined,
      updatedById: input.actor.id,
      })
      .where(eq(whatsappLinkedDeviceLines.id, input.lineId));
    await tx
      .update(whatsappLinkedDeviceSessions)
      .set({
      state: lifecycleState,
      failureCategory: input.status.error ? "sandbox_unavailable" : null,
        sessionName:
          runtime?.sessionName ?? input.status.sessionName ?? undefined,
      providerAccountHint: currentIdentity.providerAccountHint,
      providerPushName: currentIdentity.providerPushName,
      providerPlatform: currentIdentity.providerPlatform,
        ...(runtime
          ? {
        runtimeSlot: runtime.slot,
        runtimeEndpoint: runtime.endpointUrl,
        runtimeMode: runtime.mode,
        runtimeGeneration: runtime.generation,
        runtimeProfileRef: runtime.profileRef,
        runtimeAllocatedAt: current.runtimeAllocatedAt ?? now,
        runtimeReleasedAt: null,
            }
          : {}),
        reconnectCount:
          lifecycleState === "reconnecting" &&
          current.sessionState !== "reconnecting"
        ? Number(current.reconnectCount ?? 0) + 1
        : Number(current.reconnectCount ?? 0),
        lastActivityAt: input.status.lastActivityAt
          ? new Date(input.status.lastActivityAt)
          : undefined,
      lastHealthCheckedAt: now,
      lastErrorCategory: input.status.error ? "sandbox_unavailable" : null,
      lastErrorAt: input.status.error ? now : undefined,
      lastStateChangedAt: now,
      })
      .where(eq(whatsappLinkedDeviceSessions.lineId, input.lineId));
    if (input.connectionId) {
      await tx
        .update(whatsappConnections)
        .set({
        lifecycleStatus: connectionLifecycleState,
        healthState: providerHealthState,
        providerMetadata: {
          sandboxOnly: true,
            transportClassification:
              wppConnectSandboxAdapter.transportClassification,
            directRecipientEnabled:
              input.adapterKind === "wppconnect_in_app_sandbox" &&
              lifecycleState === "connected",
        },
        providerStateSnapshot,
        lastHealthCheckedAt: now,
        lastProviderStatusAt: now,
        lastTransitionAt: now,
          lastInboundEventAt: input.status.lastInbound?.timestamp
            ? new Date(input.status.lastInbound.timestamp * 1000)
            : undefined,
          lastOutboundAcceptedAt: input.status.lastOutbound?.timestamp
            ? new Date(input.status.lastOutbound.timestamp * 1000)
            : undefined,
        updatedAt: now,
        })
        .where(eq(whatsappConnections.id, input.connectionId));
    }
  });
  // Alert only on unhealthy state transitions. The message is intentionally
  // metadata-only and state-bucket deduplicated, so it cannot leak provider
  // errors, account identifiers, QR material, or session credentials.
  if (
    (healthState === "unavailable" ||
      lifecycleState === "failed" ||
      lifecycleState === "logged_out") &&
    (current.healthState !== healthState ||
      current.lifecycleState !== lifecycleState)
  ) {
    await emitInboxNotification({
      lineId: input.lineId,
      conversationId: null,
      kind: "line_health",
      title: "WhatsApp line needs attention",
      message: `The linked-device line entered ${lifecycleState.replace(/_/g, " ")}. Review the non-production session monitor.`,
      dedupeKey: `${input.lineId}:${lifecycleState}:${Math.floor(now.getTime() / (15 * 60 * 1000))}`,
    });
  }
  return {
    ...input.status,
    lineId: input.lineId,
    lifecycleState,
    healthState,
    providerHealthState,
    runtime,
  };
}

type WppConnectServerLineStatus = {
  connected: boolean;
  qrDataUrl: string | null;
  ownership: WppConnectServerOwnership;
  identity: WppConnectSandboxStatus["identity"];
};

function projectWppConnectServerStatus(input: WppConnectServerLineStatus): WppConnectSandboxStatus {
  return {
    enabled: true,
    available: true,
    baseUrl: process.env.WPPCONNECT_BASE_URL ?? null,
    workerLineId: input.ownership.lineId,
    workerLineProviderId: input.ownership.providerLineId,
    workerSessionId: input.ownership.sessionId,
    runtimeGeneration: input.ownership.runtimeGeneration,
    phase: input.connected ? "connected" : "waiting_for_qr",
    status: input.connected ? "CONNECTED" : "QR_READY",
    connectionState: input.connected ? "CONNECTED" : "QR_READY",
    outboundReady: input.connected,
    sessionName: input.ownership.sessionName,
    qrAvailable: !input.connected && Boolean(input.qrDataUrl),
    qrDataUrl: input.qrDataUrl,
    qrUpdatedAt: input.qrDataUrl ? new Date().toISOString() : null,
    identity: input.identity,
    lastActivityAt: new Date().toISOString(),
    lastInbound: null,
    lastOutbound: null,
    error: null,
  };
}

function wppConnectServerRuntime(input: {
  sessionId: number;
  sessionName: string;
  runtimeGeneration: string;
}) {
  return {
    slot: "wppconnect-server-cloud",
    endpointUrl: process.env.WPPCONNECT_BASE_URL ?? "",
    endpointHost: new URL(process.env.WPPCONNECT_BASE_URL ?? "https://invalid.local").host,
    mode: "persistent_worker" as const,
    sessionId: String(input.sessionId),
    sessionName: input.sessionName,
    generation: input.runtimeGeneration,
    profileRef: `wppconnect-server/${input.sessionName}`,
  } satisfies LinkedDeviceRuntimeBinding;
}

async function ensureWppConnectServerConnection(input: {
  lineId: number;
  actor: LinkedDeviceActor;
}): Promise<ResolvedWhatsAppConnection> {
  const db = await getDb();
  if (!db) throw new Error("Linked Device provider requires an available database.");
  const providerPhoneNumberId = `wppconnect-line-${input.lineId}`;
  let [connection] = await db
    .select()
    .from(whatsappConnections)
    .where(and(
      eq(whatsappConnections.provider, "wppconnect"),
      eq(whatsappConnections.providerPhoneNumberId, providerPhoneNumberId)
    ))
    .limit(1);
  if (!connection) {
    await db.insert(whatsappConnections).values({
      clinicScope: FERTILIV_CLINIC_SCOPE,
      provider: "wppconnect",
      onboardingMethod: "linked_device_wppconnect_server",
      providerPhoneNumberId,
      displayName: "WPPConnect Server controlled test line",
      providerMetadata: { serverManaged: true, directRecipientEnabled: false },
      credentialSource: "secret_reference",
      credentialRef: "secret://wppconnect-server/session-token",
      lifecycleStatus: "onboarding",
      healthState: "unknown",
      createdById: input.actor.id,
      updatedById: input.actor.id,
    });
    [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(and(
        eq(whatsappConnections.provider, "wppconnect"),
        eq(whatsappConnections.providerPhoneNumberId, providerPhoneNumberId)
      ))
      .limit(1);
  }
  if (!connection) throw new Error("WPPConnect Server connection could not be confirmed.");
  if (connection.onboardingMethod !== "linked_device_wppconnect_server") {
    await db.update(whatsappConnections).set({
      onboardingMethod: "linked_device_wppconnect_server",
      providerMetadata: { serverManaged: true, directRecipientEnabled: false },
      credentialSource: "secret_reference",
      credentialRef: "secret://wppconnect-server/session-token",
      lifecycleStatus: "onboarding",
      healthState: "unknown",
      updatedById: input.actor.id,
    }).where(eq(whatsappConnections.id, connection.id));
    [connection] = await db.select().from(whatsappConnections)
      .where(eq(whatsappConnections.id, connection.id)).limit(1);
  }
  if (!connection) throw new Error("WPPConnect Server connection could not be confirmed.");
  return {
    id: connection.id,
    clinicScope: connection.clinicScope,
    provider: "wppconnect",
    onboardingMethod: "linked_device_wppconnect_server",
    phoneNumberId: connection.providerPhoneNumberId,
    wabaId: null,
    businessPortfolioId: null,
    displayPhone: connection.displayPhone,
    normalizedDisplayPhone: connection.normalizedDisplayPhone,
    displayName: connection.displayName,
    credentialSource: "secret_reference",
    credentialRef: connection.credentialRef,
    lifecycleStatus: connection.lifecycleStatus,
    route: "persisted",
  };
}

async function syncWppConnectServerLine(input: {
  lineId: number;
  actor: LinkedDeviceActor;
  connectionId: number;
  status: WppConnectServerLineStatus;
}) {
  const db = await getDb();
  if (!db) throw new Error("Linked Device provider requires an available database.");
  const now = new Date();
  const safeStatus = projectWppConnectServerStatus(input.status);
  const currentIdentity = projectWppConnectCurrentIdentity(safeStatus);
  const lifecycleState: LinkedDeviceSessionState = safeStatus.outboundReady ? "connected" : "qr_ready";
  const snapshot = {
    status: safeStatus.status,
    connectionState: safeStatus.connectionState,
    outboundReady: safeStatus.outboundReady,
    workerLineId: safeStatus.workerLineId,
    workerLineProviderId: safeStatus.workerLineProviderId,
    workerSessionId: safeStatus.workerSessionId,
    sessionName: safeStatus.sessionName,
    runtimeGeneration: safeStatus.runtimeGeneration,
    directRecipientEnabled: safeStatus.outboundReady,
    transport: "wppconnect_server",
  };
  await db.transaction(async tx => {
    await tx.update(whatsappLinkedDeviceLines).set({
      adapterKind: "wppconnect_server",
      connectionId: input.connectionId,
      lifecycleState,
      healthState: safeStatus.outboundReady ? "healthy" : "unknown",
      displayPhone: currentIdentity.displayPhone,
      normalizedDisplayPhone: null,
      connectedAt: safeStatus.outboundReady ? now : undefined,
      lastSeenAt: now,
      lastSuccessfulSyncAt: safeStatus.outboundReady ? now : undefined,
      updatedById: input.actor.id,
    }).where(eq(whatsappLinkedDeviceLines.id, input.lineId));
    await tx.update(whatsappLinkedDeviceSessions).set({
      state: lifecycleState,
      failureCategory: null,
      lastHealthCheckedAt: now,
      lastStateChangedAt: now,
      lastRequestedAt: now,
      lastErrorCategory: null,
      lastErrorAt: null,
      providerAccountHint: currentIdentity.providerAccountHint,
      providerPushName: currentIdentity.providerPushName,
      providerPlatform: currentIdentity.providerPlatform,
    }).where(eq(whatsappLinkedDeviceSessions.lineId, input.lineId));
    await tx.update(whatsappConnections).set({
      lifecycleStatus: safeStatus.outboundReady ? "connected" : "onboarding",
      healthState: safeStatus.outboundReady ? "healthy" : "unknown",
      providerMetadata: { serverManaged: true, directRecipientEnabled: safeStatus.outboundReady },
      displayPhone: currentIdentity.displayPhone,
      normalizedDisplayPhone: null,
      providerStateSnapshot: snapshot,
      lastHealthCheckedAt: now,
      lastProviderStatusAt: now,
      lastTransitionAt: now,
      updatedAt: now,
    }).where(eq(whatsappConnections.id, input.connectionId));
  });
  return {
    ...safeStatus,
    lifecycleState,
    healthState: safeStatus.outboundReady ? "healthy" as const : "unknown" as const,
    providerHealthState: safeStatus.outboundReady ? "healthy" as const : "unknown" as const,
    runtime: wppConnectServerRuntime({
      sessionId: Number(input.status.ownership.sessionId),
      sessionName: input.status.ownership.sessionName,
      runtimeGeneration: input.status.ownership.runtimeGeneration,
    }),
    providerStateSnapshot: snapshot,
  };
}

export async function startWppConnectServerLinkedDeviceSession(input: {
  lineId: number;
  actor: LinkedDeviceActor;
}) {
  if (!(await isWppConnectServerSelectedLine(input.lineId))) {
    throw new Error("This line is not authorized for the controlled WPPConnect Server provider.");
  }
  const preflight = await preflightWppConnectServerProvider();
  if (preflight.state !== "provider_ready") {
    throw new Error("The controlled WPPConnect Server provider is not ready. No WhatsApp session was created.");
  }
  const db = await getDb();
  if (!db) throw new Error("Linked Device provider requires an available database.");
  const connection = await ensureWppConnectServerConnection(input);
  if (!connection.id) throw new Error("WPPConnect Server connection could not be confirmed.");
  const now = new Date();
  const prepared = await db.transaction(async tx => {
    const [line] = await tx.select({
      id: whatsappLinkedDeviceLines.id,
      lineName: whatsappLinkedDeviceLines.lineName,
      adapterKind: whatsappLinkedDeviceLines.adapterKind,
      lifecycleState: whatsappLinkedDeviceLines.lifecycleState,
    }).from(whatsappLinkedDeviceLines)
      .where(and(eq(whatsappLinkedDeviceLines.id, input.lineId), eq(whatsappLinkedDeviceLines.clinicScope, FERTILIV_CLINIC_SCOPE)))
      .limit(1).for("update");
    if (!line) throw new Error("Linked Device line was not found.");
    if (line.lifecycleState === "disabled") throw new Error("This WhatsApp line was deleted from Settings.");
    if (line.adapterKind !== "wppconnect_server") throw new Error("The controlled WPPConnect Server line could not be confirmed.");
    const [existing] = await tx.select({ id: whatsappLinkedDeviceSessions.id, state: whatsappLinkedDeviceSessions.state })
      .from(whatsappLinkedDeviceSessions).where(eq(whatsappLinkedDeviceSessions.lineId, line.id)).limit(1).for("update");
    if (existing && !["not_started", "failed", "logged_out", "session_invalid"].includes(existing.state)) {
      throw new Error("This Linked Device line already has an active disposable session.");
    }
    if (existing) {
      await tx.delete(whatsappLinkedDeviceCredentials).where(eq(whatsappLinkedDeviceCredentials.lineId, line.id));
      await tx.delete(whatsappLinkedDeviceSessions).where(eq(whatsappLinkedDeviceSessions.lineId, line.id));
    }
    const generation = randomUUID();
    const sessionName = `fertiliv-server-${line.id}-${generation.slice(0, 12)}`;
    const inserted = await tx.insert(whatsappLinkedDeviceSessions).values({
      lineId: line.id,
      state: "creating_session",
      sessionName,
      runtimeSlot: "wppconnect-server-cloud",
      runtimeEndpoint: process.env.WPPCONNECT_BASE_URL ?? null,
      runtimeMode: "persistent_worker",
      runtimeGeneration: generation,
      runtimeProfileRef: `wppconnect-server/${sessionName}`,
      runtimeAllocatedAt: now,
      lastRequestedAt: now,
      lastStateChangedAt: now,
      createdById: input.actor.id,
    });
    const sessionId = Number((inserted as any)[0]?.insertId ?? (inserted as any).insertId ?? 0);
    if (!sessionId) throw new Error("Linked Device session identity could not be created.");
    await tx.update(whatsappLinkedDeviceLines).set({
      connectionId: connection.id,
      adapterKind: "wppconnect_server",
      lifecycleState: "creating_session",
      healthState: "unknown",
      displayPhone: null,
      normalizedDisplayPhone: null,
      updatedById: input.actor.id,
    }).where(eq(whatsappLinkedDeviceLines.id, line.id));
    return { sessionId, sessionName, runtimeGeneration: generation };
  });
  const runtime = wppConnectServerRuntime(prepared);
  const ownership = ownershipFromRuntime({
    lineId: input.lineId,
    providerLineId: `wppconnect-line-${input.lineId}`,
    runtime,
  });
  if (!ownership) throw new Error("The controlled WPPConnect Server ownership binding could not be created.");
  try {
    await startWppConnectServerSession({ ownership });
    let connected = await getWppConnectServerConnectionStatus({ ownership });
    let qrDataUrl: string | null = null;
    for (let attempt = 0; attempt < 20 && !connected.connected && !qrDataUrl; attempt += 1) {
      qrDataUrl = await getWppConnectServerQrDataUrl({ ownership });
      if (!qrDataUrl) {
        await new Promise(resolve => setTimeout(resolve, 750));
        connected = await getWppConnectServerConnectionStatus({ ownership });
      }
    }
    if (!connected.connected && !qrDataUrl) throw new Error("The controlled WPPConnect Server did not provide a fresh QR.");
    const synchronized = await syncWppConnectServerLine({
      lineId: input.lineId,
      actor: input.actor,
      connectionId: connection.id,
      status: { connected: connected.connected, qrDataUrl, ownership, identity: connected.identity },
    });
    await audit(input.actor, "whatsapp_linked_device_wppconnect_server_started", input.lineId,
      "Created a fresh controlled WPPConnect Server disposable session after provider preflight. No legacy sandbox worker was selected.");
    return synchronized;
  } catch (error) {
    await db.transaction(async tx => {
      await tx.update(whatsappLinkedDeviceLines).set({ lifecycleState: "failed", healthState: "unavailable", updatedById: input.actor.id }).where(eq(whatsappLinkedDeviceLines.id, input.lineId));
      await tx.update(whatsappLinkedDeviceSessions).set({ state: "failed", failureCategory: "wppconnect_server_start_failed", lastErrorCategory: "wppconnect_server_start_failed", lastErrorAt: new Date(), lastStateChangedAt: new Date() }).where(eq(whatsappLinkedDeviceSessions.id, prepared.sessionId));
    });
    throw error;
  }
}

export async function getWppConnectServerLinkedDeviceStatus(input: {
  lineId: number;
  actor: LinkedDeviceActor;
  includeQr?: boolean;
}) {
  if (!(await isWppConnectServerSelectedLine(input.lineId))) {
    throw new Error("This line is not authorized for the controlled WPPConnect Server provider.");
  }
  const db = await getDb();
  if (!db) throw new Error("Linked Device provider requires an available database.");
  const [row] = await db.select({
    connectionId: whatsappLinkedDeviceLines.connectionId,
    adapterKind: whatsappLinkedDeviceLines.adapterKind,
    sessionId: whatsappLinkedDeviceSessions.id,
    sessionName: whatsappLinkedDeviceSessions.sessionName,
    runtimeGeneration: whatsappLinkedDeviceSessions.runtimeGeneration,
  }).from(whatsappLinkedDeviceLines)
    .leftJoin(whatsappLinkedDeviceSessions, eq(whatsappLinkedDeviceSessions.lineId, whatsappLinkedDeviceLines.id))
    .where(and(eq(whatsappLinkedDeviceLines.id, input.lineId), eq(whatsappLinkedDeviceLines.clinicScope, FERTILIV_CLINIC_SCOPE)))
    .limit(1);
  if (!row || row.adapterKind !== "wppconnect_server" || !row.sessionId || !row.sessionName || !row.runtimeGeneration || !row.connectionId) {
    throw new Error("This Linked Device line has no active WPPConnect Server runtime. Connect it again to create a fresh QR.");
  }
  const runtime = wppConnectServerRuntime({ sessionId: Number(row.sessionId), sessionName: row.sessionName, runtimeGeneration: row.runtimeGeneration });
  const ownership = ownershipFromRuntime({ lineId: input.lineId, providerLineId: `wppconnect-line-${input.lineId}`, runtime });
  if (!ownership) throw new Error("The controlled WPPConnect Server ownership binding could not be verified.");
  const connected = await getWppConnectServerConnectionStatus({ ownership });
  const qrDataUrl = input.includeQr && !connected.connected ? await getWppConnectServerQrDataUrl({ ownership }) : null;
  return syncWppConnectServerLine({ lineId: input.lineId, actor: input.actor, connectionId: Number(row.connectionId), status: { connected: connected.connected, qrDataUrl, ownership, identity: connected.identity } });
}

export async function startWppConnectSandboxSession(input: {
  lineId: number;
  actor: LinkedDeviceActor;
}) {
  if (await isWppConnectServerSelectedLine(input.lineId)) {
    return startWppConnectServerLinkedDeviceSession(input);
  }
  if (!wppConnectSandboxAdapter.isSandboxUiEnabled()) {
    throw new Error("The non-production WPPConnect Settings flow is disabled.");
  }
  const db = await getDb();
  if (!db)
    throw new Error(
      "Linked Device sandbox bridge requires an available database."
    );
  const [existingLine] = await db
    .select({
    adapterKind: whatsappLinkedDeviceLines.adapterKind,
    lifecycleState: whatsappLinkedDeviceLines.lifecycleState,
    sessionState: whatsappLinkedDeviceSessions.state,
  })
    .from(whatsappLinkedDeviceLines)
    .leftJoin(
      whatsappLinkedDeviceSessions,
      eq(whatsappLinkedDeviceSessions.lineId, whatsappLinkedDeviceLines.id)
    )
    .where(
      and(
      eq(whatsappLinkedDeviceLines.id, input.lineId),
        eq(whatsappLinkedDeviceLines.clinicScope, FERTILIV_CLINIC_SCOPE)
      )
    )
    .limit(1);
  if (!existingLine) throw new Error("Linked Device line was not found.");
  if (existingLine.lifecycleState === "disabled")
    throw new Error(
      "This WhatsApp line was deleted from Settings. Create a new line to connect again."
    );
  const connection = await ensureWppConnectSandboxConnection(input);
  const [existingRuntimeSession] = await db
    .select({
    sessionId: whatsappLinkedDeviceSessions.id,
    runtimeSlot: whatsappLinkedDeviceSessions.runtimeSlot,
    runtimeEndpoint: whatsappLinkedDeviceSessions.runtimeEndpoint,
    runtimeMode: whatsappLinkedDeviceSessions.runtimeMode,
    runtimeGeneration: whatsappLinkedDeviceSessions.runtimeGeneration,
    runtimeProfileRef: whatsappLinkedDeviceSessions.runtimeProfileRef,
    sessionName: whatsappLinkedDeviceSessions.sessionName,
    })
    .from(whatsappLinkedDeviceSessions)
    .where(eq(whatsappLinkedDeviceSessions.lineId, input.lineId))
    .limit(1);
  const persistedRuntime = linkedDeviceRuntimeFromSession(
    existingRuntimeSession
  );
  const controllerEligible =
    isIsolatedLinkedDeviceControllerEnabled() &&
    (existingLine.adapterKind === "unselected" ||
      !existingLine.sessionState ||
      ["not_started", "logged_out", "failed", "session_invalid"].includes(
        existingLine.sessionState
      ));
  let runtime: LinkedDeviceRuntimeBinding;
  runtime = controllerEligible
    ? await allocateIsolatedLinkedDeviceRuntime()
    : (persistedRuntime ??
      allocateLinkedDeviceRuntime({
        profileRef: `linked-device/${input.lineId}/${Date.now()}`,
      }));
  const now = new Date();
  try {
    await db.transaction(async tx => {
      const [existingSession] = await tx
        .select({ id: whatsappLinkedDeviceSessions.id })
        .from(whatsappLinkedDeviceSessions)
        .where(eq(whatsappLinkedDeviceSessions.lineId, input.lineId))
        .limit(1);
      if (!runtime.sessionId && existingSession?.id) {
        runtime = { ...runtime, sessionId: String(existingSession.id) };
      }
      if (!existingSession) {
        const inserted = await tx.insert(whatsappLinkedDeviceSessions).values({
          lineId: input.lineId,
          state: "creating_session",
          sessionName: runtime.sessionName,
          runtimeSlot: runtime.slot,
          runtimeEndpoint: runtime.endpointUrl,
          runtimeMode: runtime.mode,
          runtimeGeneration: runtime.generation,
          runtimeProfileRef: runtime.profileRef,
          runtimeAllocatedAt: now,
          lastRequestedAt: now,
          lastStateChangedAt: now,
          createdById: input.actor.id,
        });
        const insertedSessionId = Number(
          (inserted as any)[0]?.insertId ?? (inserted as any).insertId ?? 0
        );
        if (!insertedSessionId)
          throw new Error(
            "Linked Device session identity could not be created."
          );
        runtime = { ...runtime, sessionId: String(insertedSessionId) };
      }
      await tx
        .update(whatsappLinkedDeviceLines)
        .set({
        connectionId: connection.id,
        adapterKind: "wppconnect_sandbox",
        lifecycleState: "creating_session",
        healthState: "unknown",
        updatedById: input.actor.id,
        })
        .where(eq(whatsappLinkedDeviceLines.id, input.lineId));
      await tx
        .update(whatsappLinkedDeviceSessions)
        .set({
        state: "creating_session",
        lastRequestedAt: now,
        lastStateChangedAt: now,
        failureCategory: null,
        sessionName: runtime.sessionName,
        runtimeSlot: runtime.slot,
        runtimeEndpoint: runtime.endpointUrl,
        runtimeMode: runtime.mode,
        runtimeGeneration: runtime.generation,
        runtimeProfileRef: runtime.profileRef,
        runtimeAllocatedAt: now,
        runtimeReleasedAt: null,
        })
        .where(eq(whatsappLinkedDeviceSessions.lineId, input.lineId));
    });
    if (controllerEligible) {
      await startIsolatedLinkedDeviceWorker({
        lineId: input.lineId,
        binding: runtime,
      });
    }
    const status = await wppConnectSandboxAdapter.getSandboxStatus({
      includeQr: true,
      target: "inapp",
      runtime,
    });
    const synchronized = await syncWppConnectSandboxLine({
      lineId: input.lineId,
      actor: input.actor,
      connectionId: connection.id,
      status,
      adapterKind: "wppconnect_in_app_sandbox",
      runtime,
    });
    if (!sandboxStartIsProviderAvailable(status)) {
      throw new Error(
        "The non-production WPPConnect session could not be started. Verify the approved sandbox worker is reachable and try again."
      );
    }
    return synchronized;
  } catch (error) {
    if (controllerEligible) {
      const { stopIsolatedLinkedDeviceWorker } = await import(
        "./linkedDeviceRuntimeController"
      );
      await stopIsolatedLinkedDeviceWorker(runtime).catch(() => undefined);
    }
    throw error;
  }
}

export async function getWppConnectSandboxStatus(input: {
  lineId: number;
  actor: LinkedDeviceActor;
  includeQr?: boolean;
}) {
  if (await isWppConnectServerSelectedLine(input.lineId)) {
    return getWppConnectServerLinkedDeviceStatus(input);
  }
  if (!wppConnectSandboxAdapter.isSandboxUiEnabled()) {
    throw new Error("The non-production WPPConnect Settings flow is disabled.");
  }
  const db = await getDb();
  if (!db)
    throw new Error(
      "Linked Device sandbox bridge requires an available database."
    );
  const [line] = await db
    .select({
      adapterKind: whatsappLinkedDeviceLines.adapterKind,
      connectionId: whatsappLinkedDeviceLines.connectionId,
      lifecycleState: whatsappLinkedDeviceLines.lifecycleState,
    })
    .from(whatsappLinkedDeviceLines)
    .where(
      and(
      eq(whatsappLinkedDeviceLines.id, input.lineId),
        eq(whatsappLinkedDeviceLines.clinicScope, FERTILIV_CLINIC_SCOPE)
      )
    )
    .limit(1);
  if (!line) throw new Error("Linked Device line was not found.");
  if (line.lifecycleState === "disabled")
    throw new Error("This WhatsApp line was deleted from Settings.");
  const target =
    line.adapterKind === "wppconnect_sandbox" ? "diagnostic" : "inapp";
  const [session] = await db
    .select({
    sessionId: whatsappLinkedDeviceSessions.id,
    runtimeSlot: whatsappLinkedDeviceSessions.runtimeSlot,
    runtimeEndpoint: whatsappLinkedDeviceSessions.runtimeEndpoint,
    runtimeMode: whatsappLinkedDeviceSessions.runtimeMode,
    runtimeGeneration: whatsappLinkedDeviceSessions.runtimeGeneration,
    runtimeProfileRef: whatsappLinkedDeviceSessions.runtimeProfileRef,
    sessionName: whatsappLinkedDeviceSessions.sessionName,
    })
    .from(whatsappLinkedDeviceSessions)
    .where(eq(whatsappLinkedDeviceSessions.lineId, input.lineId))
    .limit(1);
  const runtime = linkedDeviceRuntimeFromSession(session);
  if (
    (line.adapterKind === "wppconnect_in_app_sandbox" ||
      line.adapterKind === "unselected") &&
    !runtime
  ) {
    return syncWppConnectSandboxLine({
      lineId: input.lineId,
      actor: input.actor,
      connectionId: null,
      status: {
        enabled: true,
        available: false,
        baseUrl: null,
        workerLineId: null,
        workerLineProviderId: null,
        workerSessionId: null,
        runtimeGeneration: null,
        phase: "unavailable",
        status: "UNAVAILABLE",
        connectionState: null,
        outboundReady: false,
        sessionName: null,
        qrAvailable: false,
        qrDataUrl: null,
        qrUpdatedAt: null,
        identity: null,
        lastActivityAt: null,
        lastInbound: null,
        lastOutbound: null,
        error:
          "This Linked Device line has no active isolated runtime. Connect it again to create a fresh QR.",
      },
      adapterKind: "wppconnect_in_app_sandbox",
      runtime: null,
    });
  }
  const status = await wppConnectSandboxAdapter.getSandboxStatus({
    includeQr: input.includeQr,
    target,
    runtime: runtime ?? undefined,
  });
  return syncWppConnectSandboxLine({
    lineId: input.lineId,
    actor: input.actor,
    connectionId: line.connectionId,
    status,
    adapterKind:
      line.adapterKind === "wppconnect_sandbox"
        ? "wppconnect_sandbox"
        : "wppconnect_in_app_sandbox",
    runtime,
  });
}

export async function logoutWppConnectSandboxSession(input: {
  lineId: number;
  actor: LinkedDeviceActor;
}) {
  if (!wppConnectSandboxAdapter.isSandboxUiEnabled()) {
    throw new Error("The non-production Linked Device control is disabled.");
  }
  const db = await getDb();
  if (!db)
    throw new Error(
      "Linked Device sandbox bridge requires an available database."
    );
  const [line] = await db
    .select({
    id: whatsappLinkedDeviceLines.id,
    connectionId: whatsappLinkedDeviceLines.connectionId,
    adapterKind: whatsappLinkedDeviceLines.adapterKind,
    sessionId: whatsappLinkedDeviceSessions.id,
    runtimeSlot: whatsappLinkedDeviceSessions.runtimeSlot,
    runtimeEndpoint: whatsappLinkedDeviceSessions.runtimeEndpoint,
    runtimeMode: whatsappLinkedDeviceSessions.runtimeMode,
    runtimeGeneration: whatsappLinkedDeviceSessions.runtimeGeneration,
    runtimeProfileRef: whatsappLinkedDeviceSessions.runtimeProfileRef,
    sessionName: whatsappLinkedDeviceSessions.sessionName,
    })
    .from(whatsappLinkedDeviceLines)
    .leftJoin(
      whatsappLinkedDeviceSessions,
      eq(whatsappLinkedDeviceSessions.lineId, whatsappLinkedDeviceLines.id)
    )
    .where(
      and(
    eq(whatsappLinkedDeviceLines.id, input.lineId),
        eq(whatsappLinkedDeviceLines.clinicScope, FERTILIV_CLINIC_SCOPE)
      )
    )
    .limit(1);
  if (!line) throw new Error("Linked Device line was not found.");
  if (line.adapterKind !== "wppconnect_in_app_sandbox") {
    throw new Error(
      "Only the in-app synthetic test line can be disconnected here."
    );
  }
  const runtime = linkedDeviceRuntimeFromSession(line);
  await wppConnectSandboxAdapter.logoutSandbox({
    target: "inapp",
    runtime: runtime ?? undefined,
  });
  const now = new Date();
  await db.transaction(async tx => {
    await tx
      .update(whatsappLinkedDeviceLines)
      .set({
      lifecycleState: "logged_out",
      healthState: "unavailable",
      displayPhone: null,
      normalizedDisplayPhone: null,
      disconnectedAt: now,
      updatedById: input.actor.id,
      })
      .where(eq(whatsappLinkedDeviceLines.id, input.lineId));
    await tx
      .update(whatsappLinkedDeviceSessions)
      .set({
      state: "logged_out",
      runtimeReleasedAt: now,
      providerAccountHint: null,
      providerPushName: null,
      providerPlatform: null,
      })
      .where(eq(whatsappLinkedDeviceSessions.lineId, input.lineId));
    await tx
      .delete(whatsappLinkedDeviceSessions)
      .where(eq(whatsappLinkedDeviceSessions.lineId, input.lineId));
    if (line.connectionId) {
      await tx
        .update(whatsappConnections)
        .set({
        lifecycleStatus: "error",
        healthState: "unavailable",
          providerStateSnapshot: {
            sandboxOnly: true,
            status: "LOGGED_OUT",
            directRecipientEnabled: false,
          },
        lastHealthCheckedAt: now,
        lastTransitionAt: now,
        updatedAt: now,
        })
        .where(eq(whatsappConnections.id, line.connectionId));
    }
  });
  await audit(
    input.actor,
    "whatsapp_linked_device_logged_out",
    input.lineId,
    "Administrator explicitly logged out the synthetic Linked Device session. A new QR link is required before reconnecting."
  );
  return {
    lineId: input.lineId,
    lifecycleState: "logged_out" as const,
    requiresQr: true,
  };
}

/**
 * Clears a stale disposable binding without contacting any provider endpoint.
 * This narrow operational helper is deliberately restricted to the authorized
 * F4 line; it preserves the persistent line, staff, recipient policy, and all
 * historical transport/CRM/clinical records.
 */
export async function clearStaleLinkedDeviceDisposableState(input: {
  lineId: number;
  actor: LinkedDeviceActor;
}) {
  if (input.actor.role !== "admin") {
    throw new Error(
      "Administrator access is required to clear stale Linked Device state."
    );
  }
  if (input.lineId !== 150001) {
    throw new Error(
      "This operational cleanup is authorized only for the F4 Linked Device line."
    );
  }
  const db = await getDb();
  if (!db)
    throw new Error("Linked Device cleanup requires an available database.");

  const now = new Date();
  const result = await db.transaction(async tx => {
    const [line] = await tx
      .select({
      id: whatsappLinkedDeviceLines.id,
      lineName: whatsappLinkedDeviceLines.lineName,
      connectionId: whatsappLinkedDeviceLines.connectionId,
      adapterKind: whatsappLinkedDeviceLines.adapterKind,
      lifecycleState: whatsappLinkedDeviceLines.lifecycleState,
      healthState: whatsappLinkedDeviceLines.healthState,
      displayPhone: whatsappLinkedDeviceLines.displayPhone,
    })
      .from(whatsappLinkedDeviceLines)
      .where(
        and(
        eq(whatsappLinkedDeviceLines.id, input.lineId),
          eq(whatsappLinkedDeviceLines.clinicScope, FERTILIV_CLINIC_SCOPE)
        )
      )
      .limit(1)
      .for("update");
    if (!line) throw new Error("Linked Device line was not found.");
    if (line.lineName !== "F4")
      throw new Error("The authorized F4 line could not be confirmed.");

    const [session] = await tx
      .select({
      id: whatsappLinkedDeviceSessions.id,
      state: whatsappLinkedDeviceSessions.state,
      sessionName: whatsappLinkedDeviceSessions.sessionName,
      runtimeSlot: whatsappLinkedDeviceSessions.runtimeSlot,
      runtimeEndpoint: whatsappLinkedDeviceSessions.runtimeEndpoint,
      runtimeMode: whatsappLinkedDeviceSessions.runtimeMode,
      runtimeGeneration: whatsappLinkedDeviceSessions.runtimeGeneration,
      runtimeProfileRef: whatsappLinkedDeviceSessions.runtimeProfileRef,
      providerAccountHint: whatsappLinkedDeviceSessions.providerAccountHint,
      providerPushName: whatsappLinkedDeviceSessions.providerPushName,
      providerPlatform: whatsappLinkedDeviceSessions.providerPlatform,
    })
      .from(whatsappLinkedDeviceSessions)
      .where(eq(whatsappLinkedDeviceSessions.lineId, line.id))
      .limit(1)
      .for("update");
    if (!session)
      throw new Error("The stale F4 disposable session could not be found.");

    await tx
      .update(whatsappLinkedDeviceLines)
      .set({
      adapterKind: "wppconnect_in_app_sandbox",
      lifecycleState: "not_started",
      healthState: "unavailable",
      displayPhone: null,
      normalizedDisplayPhone: null,
      lastSeenAt: null,
      lastSuccessfulSyncAt: null,
      disconnectedAt: now,
      updatedById: input.actor.id,
      })
      .where(eq(whatsappLinkedDeviceLines.id, line.id));
    await tx
      .delete(whatsappLinkedDeviceSessions)
      .where(eq(whatsappLinkedDeviceSessions.lineId, line.id));
    if (line.connectionId) {
      await tx
        .update(whatsappConnections)
        .set({
        lifecycleStatus: "disconnected",
        healthState: "unavailable",
        providerMetadata: {
          sandboxOnly: true,
            transportClassification:
              wppConnectSandboxAdapter.transportClassification,
          directRecipientEnabled: false,
        },
        providerStateSnapshot: {
          sandboxOnly: true,
          status: "UNAVAILABLE",
          connectionState: null,
          outboundReady: false,
          directRecipientEnabled: false,
          staleRuntimeCleared: true,
        },
        lastHealthCheckedAt: now,
        lastTransitionAt: now,
        updatedAt: now,
        })
        .where(eq(whatsappConnections.id, line.connectionId));
    }
    await tx.insert(auditLogs).values({
      userId: input.actor.id,
      userName: input.actor.name,
      userRole: input.actor.role,
      action: "whatsapp_linked_device_stale_disposable_state_cleared",
      category: "other",
      recordId: line.id,
      recordType: "whatsapp_linked_device_line",
      page: "/settings?tab=whatsapp",
      description: `Cleared stale disposable state for authorized F4 line ${line.id}. Preserved persistent line and historical records; removed session ${session.id}, generation ${session.runtimeGeneration ?? "unknown"}, and profile reference ${session.runtimeProfileRef ?? "unknown"}. No provider logout was called.`,
    });

    return {
      lineId: line.id,
      lineName: line.lineName,
      connectionId: line.connectionId,
      previousLineState: {
        lifecycleState: line.lifecycleState,
        healthState: line.healthState,
        displayPhone: line.displayPhone,
      },
      clearedSession: session,
      lifecycleState: "not_started" as const,
      providerLogoutCalled: false as const,
      persistentStatePreserved: true as const,
    };
  });

  return result;
}

/**
 * Removes an unused line from active Settings without deleting transport history.
 * The line remains as a disabled tombstone so historical Conversations, messages,
 * media, send attempts, audit, and CRM/clinical records retain their provenance.
 */
export async function deleteUnusedLinkedDeviceLine(input: {
  lineId: number;
  actor: LinkedDeviceActor;
}) {
  if (input.actor.role !== "admin") {
    throw new Error(
      "Administrator access is required to delete a WhatsApp line."
    );
  }
  const db = await getDb();
  if (!db)
    throw new Error("WhatsApp line deletion requires an available database.");

  const result = await db.transaction(async tx => {
    const [line] = await tx
      .select({
      id: whatsappLinkedDeviceLines.id,
      lifecycleState: whatsappLinkedDeviceLines.lifecycleState,
      connectionId: whatsappLinkedDeviceLines.connectionId,
    })
      .from(whatsappLinkedDeviceLines)
      .where(
        and(
        eq(whatsappLinkedDeviceLines.id, input.lineId),
          eq(whatsappLinkedDeviceLines.clinicScope, FERTILIV_CLINIC_SCOPE)
        )
      )
      .limit(1)
      .for("update");
    if (!line) throw new Error("Linked Device line was not found.");

    const [session] = await tx
      .select({ state: whatsappLinkedDeviceSessions.state })
      .from(whatsappLinkedDeviceSessions)
      .where(eq(whatsappLinkedDeviceSessions.lineId, line.id))
      .limit(1)
      .for("update");
    if (!isLinkedDeviceLineDeletable(line.lifecycleState, session?.state)) {
      throw new Error(
        "Disconnect the Linked Device first. Delete line is available only when no session is active."
      );
    }

    const now = new Date();
    await tx
      .update(whatsappLinkedDeviceLines)
      .set({
      lifecycleState: "disabled",
      healthState: "unavailable",
      adapterKind: "archived_deleted",
      displayPhone: null,
      normalizedDisplayPhone: null,
      disconnectedAt: now,
      updatedById: input.actor.id,
      })
      .where(eq(whatsappLinkedDeviceLines.id, line.id));
    await tx
      .delete(whatsappLinkedDeviceSessions)
      .where(eq(whatsappLinkedDeviceSessions.lineId, line.id));
    await tx
      .update(whatsappSyntheticTestRecipients)
      .set({
      status: "revoked",
      revokedById: input.actor.id,
      revokedAt: now,
      updatedAt: now,
      })
      .where(
        and(
      eq(whatsappSyntheticTestRecipients.lineId, line.id),
          eq(whatsappSyntheticTestRecipients.status, "active")
        )
      );
    if (line.connectionId) {
      await tx
        .update(whatsappConnections)
        .set({
        lifecycleStatus: "disconnected",
        healthState: "unavailable",
          providerStateSnapshot: {
            sandboxOnly: true,
            archived: true,
            directRecipientEnabled: false,
          },
        lastHealthCheckedAt: now,
        lastTransitionAt: now,
        updatedAt: now,
        })
        .where(eq(whatsappConnections.id, line.connectionId));
    }
    return { lineId: line.id, state: "disabled" as const };
  });

  await audit(
    input.actor,
    "whatsapp_linked_device_line_deleted",
    input.lineId,
    "Administrator removed an unused Linked Device line from active Settings. Historical transport, Inbox, audit, and clinical records were preserved."
  );
  return {
    ...result,
    removedFromSettings: true as const,
    historyPreserved: true as const,
  };
}

/**
 * Accepts a deliberately synthetic WPPConnect message only when the explicit
 * sandbox feature flag is enabled. It feeds the existing retained-provider
 * evidence → normalized message → endpoint → Conversation pipeline and never
 * creates a Patient, Lead, MRN, treatment case, or clinical record.
 */
export async function ingestWppConnectSyntheticEvent(input: {
  lineId: number;
  actor: LinkedDeviceActor;
  event: LinkedDeviceProviderEvent;
}) {
  if (!wppConnectSandboxAdapter.isSandboxIngressEnabled()) {
    throw new Error(
      "WPPConnect sandbox ingestion is disabled. Production Linked Device traffic remains blocked."
    );
  }
  if (input.event.synthetic !== true) {
    throw new Error(
      "Only explicitly synthetic WPPConnect events may enter the sandbox bridge."
    );
  }
  if (
    input.event.direction !== "outbound" &&
    input.event.sourceKind !== "private_chat"
  ) {
    throw new Error(
      "Only explicitly classified private-chat inbound events may enter the normal sandbox pipeline."
    );
  }
  if (
    input.event.direction !== "outbound" &&
    [
    input.event.providerMessageId,
    input.event.providerIdentityId,
    input.event.senderEndpointId,
    ].some(value =>
      /(?:^|[^a-z])(?:false_)?status@broadcast(?:_|$)|@broadcast(?:$|[_:])|@g\.us$|@(newsletter|channel)$/i.test(
        value ?? ""
      )
    )
  ) {
    throw new Error(
      "Known non-private WPPConnect source markers cannot enter the normal sandbox pipeline."
    );
  }
  const db = await getDb();
  if (!db)
    throw new Error(
      "Linked Device sandbox bridge requires an available database."
    );

  const [line] = await db
    .select({
    id: whatsappLinkedDeviceLines.id,
    adapterKind: whatsappLinkedDeviceLines.adapterKind,
    lifecycleState: whatsappLinkedDeviceLines.lifecycleState,
  })
    .from(whatsappLinkedDeviceLines)
    .where(
      and(
      eq(whatsappLinkedDeviceLines.id, input.lineId),
        eq(whatsappLinkedDeviceLines.clinicScope, FERTILIV_CLINIC_SCOPE)
      )
    )
    .limit(1);
  if (!line) throw new Error("Linked Device line was not found.");
  if (line.lifecycleState === "disabled")
    throw new Error("This WhatsApp line was deleted from Settings.");

  const [session] = await db
    .select({ state: whatsappLinkedDeviceSessions.state })
    .from(whatsappLinkedDeviceSessions)
    .where(eq(whatsappLinkedDeviceSessions.lineId, line.id))
    .limit(1);
  if (!session || session.state !== "connected") {
    throw new Error("The disposable Linked Device session is not active.");
  }

  const connection = await ensureWppConnectSandboxConnection({
    lineId: line.id,
    actor: input.actor,
  });
  const value = wppConnectSandboxAdapter.toNormalizedSandboxValue(input.event);
  const { buildWU05NormalizationPlan } = await import(
    "./whatsappNormalization"
  );
  const { retainWhatsAppProviderEvents } = await import(
    "./whatsappPhase1Store"
  );
  const normalizationPlan = buildWU05NormalizationPlan({
    providerField: "messages",
    value,
    connection,
    routingState: "resolved",
    existingFailureCategory: null,
  });
  const providerEventKey = wppConnectSandboxAdapter.eventKey(
    line.id,
    input.event
  );
  const result = await retainWhatsAppProviderEvents({
    rawPayload: JSON.stringify({
      sandbox: true,
      provider: "wppconnect",
      value,
    }),
    events: [
      {
      provider: "wppconnect",
      providerField: "messages",
      providerEventKey,
      wabaId: null,
      phoneNumberId: connection.phoneNumberId,
      value,
      connection,
      routingState: "resolved",
      processingState: normalizationPlan.processingState,
      failureCategory: normalizationPlan.normalizationFailureCategory,
      normalizationPlan,
        mediaPayloads:
          input.event.syntheticMediaBase64 && input.event.media
            ? [
                {
                  sourceMessageItemKey:
                    normalizationPlan.messages[0]?.providerItemKey ?? "",
            base64: input.event.syntheticMediaBase64,
            mediaType: input.event.media.mediaType,
            mimeType: input.event.media.mimeType,
            filename: input.event.media.filename ?? null,
            sha256: input.event.media.sha256 ?? null,
                },
              ]
        : undefined,
      },
    ],
  });

  const now = new Date();
  await db.transaction(async tx => {
    await tx
      .update(whatsappLinkedDeviceLines)
      .set({
      connectionId: connection.id,
        adapterKind:
          line.adapterKind === "wppconnect_in_app_sandbox"
        ? "wppconnect_in_app_sandbox"
        : "wppconnect_sandbox",
      lifecycleState: "connected",
      healthState: "healthy",
      connectedAt: now,
      lastSeenAt: now,
      lastSuccessfulSyncAt: now,
      updatedById: input.actor.id,
      })
      .where(eq(whatsappLinkedDeviceLines.id, line.id));
    await tx
      .update(whatsappLinkedDeviceSessions)
      .set({
      state: "connected",
      failureCategory: null,
      lastActivityAt: now,
      lastHealthCheckedAt: now,
      lastErrorCategory: null,
      lastStateChangedAt: now,
      })
      .where(eq(whatsappLinkedDeviceSessions.lineId, line.id));
  });
  await audit(
    input.actor,
    "whatsapp_linked_device_wppconnect_sandbox_event",
    line.id,
    "Synthetic WPPConnect event retained through the existing evidence and Conversation pipeline; production traffic remains disabled."
  );
  if (result.insertedEvents > 0 && input.event.direction !== "outbound") {
    const { emitInboxNotification } = await import(
      "./whatsappOperationalNotifications"
    );
    const { whatsappConversationMessages, whatsappConversations } =
      await import("../drizzle/schema");
    const [message] = await db
      .select({ conversationId: whatsappConversationMessages.conversationId })
      .from(whatsappConversationMessages)
      .where(
        eq(
          whatsappConversationMessages.providerMessageId,
          input.event.providerMessageId
        )
      )
      .orderBy(desc(whatsappConversationMessages.createdAt))
      .limit(1);
    if (message?.conversationId) {
      const [conversation] = await db
        .select({ createdAt: whatsappConversations.createdAt })
        .from(whatsappConversations)
        .where(eq(whatsappConversations.id, message.conversationId))
        .limit(1);
      const isNewConversation =
        conversation &&
        now.getTime() - conversation.createdAt.getTime() < 90_000;
      await emitInboxNotification({
        lineId: line.id,
        conversationId: message.conversationId,
        kind: isNewConversation ? "new_conversation" : "new_message",
        title: isNewConversation
          ? "New unresolved WhatsApp conversation"
          : "New WhatsApp message",
        message:
          "A synthetic Linked Device message is ready for authorized staff review in the Unified Inbox.",
        dedupeKey: input.event.providerMessageId,
      });
    }
  }
  return {
    lineId: line.id,
    provider: "wppconnect" as const,
    sandboxOnly: true as const,
    providerEventKey,
    normalizedMessageCount: normalizationPlan.messages.length,
    normalizedStatusCount: normalizationPlan.statuses.length,
    normalizationState: normalizationPlan.normalizationState,
    ...result,
  };
}

/**
 * Optional WPPConnect Server ingress. The signed HTTP route classifies and
 * authenticates first; this durable boundary repeats exact ownership checks
 * before reusing the same evidence → normalization → endpoint → Conversation
 * path as the isolated sandbox. No parallel message model is introduced.
 */
export async function ingestWppConnectServerEvent(input: {
  lineId: number;
  actor: LinkedDeviceActor;
  ownership: WppConnectServerOwnership;
  event: LinkedDeviceProviderEvent;
}) {
  if (!isWppConnectServerIngressEnabled()) {
    throw new Error("The WPPConnect Server transport is disabled.");
  }
  if (
    !validateWppConnectServerOwnership(input.ownership) ||
    input.event.origin !== "wppconnect_server"
  ) {
    throw new Error("The WPPConnect Server event ownership is invalid.");
  }
  if (
    input.event.direction !== "outbound" &&
    input.event.sourceKind !== "private_chat"
  ) {
    throw new Error(
      "Only explicitly classified private-chat WPPConnect Server events may enter the Inbox pipeline."
    );
  }
  if (
    input.event.direction !== "outbound" &&
    [
      input.event.providerMessageId,
      input.event.providerIdentityId,
      input.event.senderEndpointId,
    ].some(value =>
      /(?:^|[^a-z])(?:false_)?status@broadcast(?:_|$)|@broadcast(?:$|[_:])|@g\.us$|@(newsletter|channel)$/i.test(
        value ?? ""
      )
    )
  ) {
    throw new Error(
      "Known non-private WPPConnect source markers cannot enter the Inbox pipeline."
    );
  }

  const db = await getDb();
  if (!db)
    throw new Error(
      "Linked Device WPPConnect Server ingress requires an available database."
    );
  const [record] = await db
    .select({
      line: whatsappLinkedDeviceLines,
      connection: whatsappConnections,
      sessionId: whatsappLinkedDeviceSessions.id,
      sessionState: whatsappLinkedDeviceSessions.state,
      sessionName: whatsappLinkedDeviceSessions.sessionName,
      runtimeGeneration: whatsappLinkedDeviceSessions.runtimeGeneration,
    })
    .from(whatsappLinkedDeviceLines)
    .innerJoin(
      whatsappConnections,
      eq(whatsappConnections.id, whatsappLinkedDeviceLines.connectionId)
    )
    .innerJoin(
      whatsappLinkedDeviceSessions,
      eq(whatsappLinkedDeviceSessions.lineId, whatsappLinkedDeviceLines.id)
    )
    .where(
      and(
        eq(whatsappLinkedDeviceLines.id, input.lineId),
        eq(whatsappLinkedDeviceLines.clinicScope, FERTILIV_CLINIC_SCOPE)
      )
    )
    .limit(1);
  if (
    !record ||
    record.line.adapterKind !== "wppconnect_server" ||
    record.line.lifecycleState === "disabled" ||
    record.connection.provider !== "wppconnect" ||
    record.sessionState !== "connected" ||
    String(record.sessionId) !== input.ownership.sessionId ||
    record.sessionName !== input.ownership.sessionName ||
    record.runtimeGeneration !== input.ownership.runtimeGeneration ||
    record.connection.providerPhoneNumberId !==
      input.ownership.providerLineId ||
    input.event.lineProviderId !== input.ownership.providerLineId
  ) {
    throw new Error(
      "The WPPConnect Server event does not match the current linked-device runtime."
    );
  }

  const connection: ResolvedWhatsAppConnection = {
    id: record.connection.id,
    clinicScope: record.connection.clinicScope,
    provider: "wppconnect",
    onboardingMethod: "linked_device_wppconnect_sandbox",
    phoneNumberId: record.connection.providerPhoneNumberId,
    wabaId: record.connection.wabaId,
    businessPortfolioId: record.connection.businessPortfolioId,
    displayPhone: record.connection.displayPhone,
    normalizedDisplayPhone: record.connection.normalizedDisplayPhone,
    displayName: record.connection.displayName,
    credentialSource: record.connection.credentialSource,
    credentialRef: record.connection.credentialRef,
    lifecycleStatus: record.connection.lifecycleStatus,
    route: "persisted",
  };
  const value = wppConnectSandboxAdapter.toNormalizedSandboxValue(input.event);
  const { buildWU05NormalizationPlan } = await import(
    "./whatsappNormalization"
  );
  const { retainWhatsAppProviderEvents } = await import(
    "./whatsappPhase1Store"
  );
  const normalizationPlan = buildWU05NormalizationPlan({
    providerField: "messages",
    value,
    connection,
    routingState: "resolved",
    existingFailureCategory: null,
  });
  const canonicalMediaBase64 =
    input.event.mediaBase64 ?? input.event.syntheticMediaBase64;
  const result = await retainWhatsAppProviderEvents({
    rawPayload: JSON.stringify({
      linkedDevice: true,
      provider: "wppconnect",
      origin: "wppconnect_server",
      value,
    }),
    events: [
      {
        provider: "wppconnect",
        providerField: "messages",
        providerEventKey: wppConnectServerEventKey(
          record.line.id,
          input.event.providerMessageId
        ),
        wabaId: null,
        phoneNumberId: connection.phoneNumberId,
        value,
        connection,
        routingState: "resolved",
        processingState: normalizationPlan.processingState,
        failureCategory: normalizationPlan.normalizationFailureCategory,
        normalizationPlan,
        mediaPayloads:
          canonicalMediaBase64 && input.event.media
            ? [
                {
                  sourceMessageItemKey:
                    normalizationPlan.messages[0]?.providerItemKey ?? "",
                  base64: canonicalMediaBase64,
                  mediaType: input.event.media.mediaType,
                  mimeType: input.event.media.mimeType,
                  filename: input.event.media.filename ?? null,
                  sha256: input.event.media.sha256 ?? null,
                },
              ]
            : undefined,
      },
    ],
  });
  const now = new Date();
  await db.transaction(async tx => {
    await tx
      .update(whatsappLinkedDeviceLines)
      .set({
        lifecycleState: "connected",
        healthState: "healthy",
        lastSeenAt: now,
        lastSuccessfulSyncAt: now,
        updatedById: input.actor.id,
      })
      .where(eq(whatsappLinkedDeviceLines.id, record.line.id));
    await tx
      .update(whatsappLinkedDeviceSessions)
      .set({
        state: "connected",
        lastActivityAt: now,
        lastHealthCheckedAt: now,
        lastErrorCategory: null,
        lastStateChangedAt: now,
      })
      .where(eq(whatsappLinkedDeviceSessions.id, record.sessionId));
  });
  await audit(
    input.actor,
    "whatsapp_linked_device_wppconnect_server_event",
    record.line.id,
    "WPPConnect Server event retained through the existing evidence and Conversation pipeline; no CRM or clinical identity was created."
  );
  if (result.insertedEvents > 0 && input.event.direction !== "outbound") {
    const { whatsappConversationMessages, whatsappConversations } =
      await import("../drizzle/schema");
    const [message] = await db
      .select({ conversationId: whatsappConversationMessages.conversationId })
      .from(whatsappConversationMessages)
      .where(
        eq(
          whatsappConversationMessages.providerMessageId,
          input.event.providerMessageId
        )
      )
      .orderBy(desc(whatsappConversationMessages.createdAt))
      .limit(1);
    if (message?.conversationId) {
      const [conversation] = await db
        .select({ createdAt: whatsappConversations.createdAt })
        .from(whatsappConversations)
        .where(eq(whatsappConversations.id, message.conversationId))
        .limit(1);
      const isNewConversation = Boolean(
        conversation &&
          now.getTime() - conversation.createdAt.getTime() < 90_000
      );
      await emitInboxNotification({
        lineId: record.line.id,
        conversationId: message.conversationId,
        kind: isNewConversation ? "new_conversation" : "new_message",
        title: isNewConversation
          ? "New unresolved WhatsApp conversation"
          : "New WhatsApp message",
        message:
          "A Linked Device message is ready for authorized staff review in the Unified Inbox.",
        dedupeKey: input.event.providerMessageId,
      });
    }
  }
  return {
    lineId: record.line.id,
    provider: "wppconnect" as const,
    origin: "wppconnect_server" as const,
    providerEventKey: wppConnectServerEventKey(
      record.line.id,
      input.event.providerMessageId
    ),
    normalizedMessageCount: normalizationPlan.messages.length,
    normalizedStatusCount: normalizationPlan.statuses.length,
    normalizationState: normalizationPlan.normalizationState,
    ...result,
  };
}
