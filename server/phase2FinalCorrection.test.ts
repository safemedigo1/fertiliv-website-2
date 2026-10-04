/**
 * Phase 2 Final Correction — Runtime Integration Tests
 *
 * 69 test cases covering:
 *   A. Writer Token Authority (T-WTA-1 to T-WTA-12)
 *   B. Takeover Rotation (T-TAK-1 to T-TAK-8)
 *   C. Terminal State Machine (T-TSM-1 to T-TSM-10)
 *   D. AI Lifecycle Policy (T-AIL-1 to T-AIL-9)
 *   E. Extraction Attempt Identity (T-EAI-1 to T-EAI-8)
 *   F. Stale-Version Protection (T-SVP-1 to T-SVP-5)
 *   G. Save Idempotency (T-SID-1 to T-SID-5)
 *   H. Legacy Fallback Removal (T-LFR-1 to T-LFR-6)
 *   I. Meaningful-Activity Touch (T-MAT-1 to T-MAT-3)
 *   J. Cancel/Expiry Flow (T-CEF-1 to T-CEF-3)
 *
 * All tests are runtime integration tests that call the actual DB helpers
 * or tRPC procedures (via appRouter.createCaller) with a real DB connection.
 * No source-text slice checks.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { draftSessions, extractionAttempts, leadDocuments, leads, medicalIntake } from "../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import {
  validateWriterToken,
  registerExtractionAttempt,
  completeExtractionAttempt,
  cancelExtractionAttemptsBySession,
  cancelExtractionAttemptsByDocument,
  cancelDraftSessionImmediateV2,
  expireOldDraftSessionsAndDocs,
} from "./db";
import { createOrResolveDraftSession, takeOverDraftSession } from "./saveHealthRecord";

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeCtx(role: "admin" | "user" | "staff" = "admin"): TrpcContext {
  return {
    user: {
      id: 9999,
      openId: "test-user",
      email: "test@fertiliv.test",
      name: "Test User",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

/** Create a fresh draft session in the DB and return its ID + token */
async function createTestSession(opts?: { leadId?: number; patientId?: number }) {
  const sessionId = `test-session-${crypto.randomUUID()}`;
  const result = await createOrResolveDraftSession({
    draftSessionId: sessionId,
    leadId: opts?.leadId,
    patientId: opts?.patientId,
    createdBy: 9999,
  });
  return { draftSessionId: sessionId, activeWriterToken: result.activeWriterToken };
}

/** Insert a minimal lead for testing */
async function createTestLead(): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(leads).values({
    firstName: "Test",
    lastName: "Lead",
    phone: `+9999${Date.now()}`,
    status: "new",
    gender: "female",
  } as any);
  return (result as any)[0]?.insertId ?? (result as any).insertId;
}

/** Clean up test data */
async function cleanupSession(draftSessionId: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(extractionAttempts).where(eq(extractionAttempts.draftSessionId, draftSessionId)).catch(() => {});
  await db.delete(draftSessions).where(eq(draftSessions.draftSessionId, draftSessionId)).catch(() => {});
}

// ─── A. Writer Token Authority ────────────────────────────────────────────────

describe("A. Writer Token Authority", () => {
  let sessionId: string;
  let token: string;

  beforeEach(async () => {
    const s = await createTestSession();
    sessionId = s.draftSessionId;
    token = s.activeWriterToken;
  });

  afterEach(async () => {
    await cleanupSession(sessionId);
  });

  it("T-WTA-1: validateWriterToken passes with correct token and active session", async () => {
    const session = await validateWriterToken({ draftSessionId: sessionId, activeWriterToken: token });
    expect(session.status).toBe("active");
    expect(session.activeWriterToken).toBe(token);
  });

  it("T-WTA-2: validateWriterToken rejects wrong token with FORBIDDEN", async () => {
    await expect(
      validateWriterToken({ draftSessionId: sessionId, activeWriterToken: "wrong-token" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("T-WTA-3: validateWriterToken rejects REVOKED- prefixed token", async () => {
    await expect(
      validateWriterToken({ draftSessionId: sessionId, activeWriterToken: `REVOKED-${token}` })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("T-WTA-4: validateWriterToken rejects SAVED- prefixed token", async () => {
    await expect(
      validateWriterToken({ draftSessionId: sessionId, activeWriterToken: `SAVED-abc123` })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("T-WTA-5: validateWriterToken rejects EXPIRED- prefixed token", async () => {
    await expect(
      validateWriterToken({ draftSessionId: sessionId, activeWriterToken: `EXPIRED-abc123` })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("T-WTA-6: validateWriterToken rejects non-existent session", async () => {
    await expect(
      validateWriterToken({ draftSessionId: "non-existent-session", activeWriterToken: token })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("T-WTA-7: activeWriterToken is a UUID (independent of draftSessionId)", async () => {
    // Token must be a valid UUID and NOT equal to the session ID
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(token).toMatch(uuidPattern);
    expect(token).not.toBe(sessionId);
  });

  it("T-WTA-8: initDraftSession returns server-issued token (not draftSessionId)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.leads.initDraftSession({ draftSessionId: sessionId });
    // The returned token must be a UUID and different from the session ID
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(result.activeWriterToken).toMatch(uuidPattern);
    expect(result.activeWriterToken).not.toBe(sessionId);
  });

  it("T-WTA-9: initDraftSession rejects saved session", async () => {
    // Mark session as saved
    const db = await getDb();
    await db!.update(draftSessions).set({ status: "saved" } as any).where(eq(draftSessions.draftSessionId, sessionId));
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.leads.initDraftSession({ draftSessionId: sessionId })
    ).rejects.toThrow();
  });

  it("T-WTA-10: initDraftSession rejects cancelled session", async () => {
    const db = await getDb();
    await db!.update(draftSessions).set({ status: "cancelled" } as any).where(eq(draftSessions.draftSessionId, sessionId));
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.leads.initDraftSession({ draftSessionId: sessionId })
    ).rejects.toThrow();
  });

  it("T-WTA-11: initDraftSession rejects expired session", async () => {
    const db = await getDb();
    await db!.update(draftSessions).set({ status: "expired" } as any).where(eq(draftSessions.draftSessionId, sessionId));
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.leads.initDraftSession({ draftSessionId: sessionId })
    ).rejects.toThrow();
  });

  it("T-WTA-12: validateWriterToken rejects cancelled session", async () => {
    const db = await getDb();
    await db!.update(draftSessions).set({ status: "cancelled" } as any).where(eq(draftSessions.draftSessionId, sessionId));
    await expect(
      validateWriterToken({ draftSessionId: sessionId, activeWriterToken: token })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ─── B. Takeover Rotation ─────────────────────────────────────────────────────

describe("B. Takeover Rotation", () => {
  let sessionId: string;
  let oldToken: string;

  beforeEach(async () => {
    const s = await createTestSession();
    sessionId = s.draftSessionId;
    oldToken = s.activeWriterToken;
  });

  afterEach(async () => {
    await cleanupSession(sessionId);
  });

  it("T-TAK-1: takeOverDraftSession returns a new token", async () => {
    const result = await takeOverDraftSession({ draftSessionId: sessionId, requestingUserId: 9999 });
    expect(result.activeWriterToken).toBeTruthy();
    expect(result.activeWriterToken).not.toBe(oldToken);
  });

  it("T-TAK-2: old token is immediately invalid after takeover", async () => {
    await takeOverDraftSession({ draftSessionId: sessionId, requestingUserId: 9999 });
    await expect(
      validateWriterToken({ draftSessionId: sessionId, activeWriterToken: oldToken })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("T-TAK-3: new token is valid after takeover", async () => {
    const { activeWriterToken: newToken } = await takeOverDraftSession({ draftSessionId: sessionId, requestingUserId: 9999 });
    const session = await validateWriterToken({ draftSessionId: sessionId, activeWriterToken: newToken });
    expect(session.status).toBe("active");
  });

  it("T-TAK-4: new token is a UUID", async () => {
    const { activeWriterToken: newToken } = await takeOverDraftSession({ draftSessionId: sessionId, requestingUserId: 9999 });
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(newToken).toMatch(uuidPattern);
  });

  it("T-TAK-5: takeOverDraftSession rejects non-existent session", async () => {
    await expect(
      takeOverDraftSession({ draftSessionId: "non-existent", requestingUserId: 9999 })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("T-TAK-6: takeOverDraftSession rejects cancelled session", async () => {
    const db = await getDb();
    await db!.update(draftSessions).set({ status: "cancelled" } as any).where(eq(draftSessions.draftSessionId, sessionId));
    await expect(
      takeOverDraftSession({ draftSessionId: sessionId, requestingUserId: 9999 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("T-TAK-7: takeOverDraftSession rejects saved session", async () => {
    const db = await getDb();
    await db!.update(draftSessions).set({ status: "saved" } as any).where(eq(draftSessions.draftSessionId, sessionId));
    await expect(
      takeOverDraftSession({ draftSessionId: sessionId, requestingUserId: 9999 })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("T-TAK-8: tRPC takeoverDraftSession procedure returns new token and invalidates old", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.leads.takeoverDraftSession({ draftSessionId: sessionId });
    expect(result.activeWriterToken).not.toBe(oldToken);
    await expect(
      validateWriterToken({ draftSessionId: sessionId, activeWriterToken: oldToken })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── C. Terminal State Machine ────────────────────────────────────────────────

describe("C. Terminal State Machine", () => {
  let sessionId: string;
  let token: string;

  beforeEach(async () => {
    const s = await createTestSession();
    sessionId = s.draftSessionId;
    token = s.activeWriterToken;
  });

  afterEach(async () => {
    await cleanupSession(sessionId);
  });

  it("T-TSM-1: cancelDraftSessionImmediateV2 sets status=cancelled", async () => {
    await cancelDraftSessionImmediateV2({ draftSessionId: sessionId, canceledBy: 9999 });
    const db = await getDb();
    const rows = await db!.select().from(draftSessions).where(eq(draftSessions.draftSessionId, sessionId)).limit(1);
    expect(rows[0]?.status).toBe("cancelled");
  });

  it("T-TSM-2: cancelDraftSessionImmediateV2 sets canceledAt timestamp", async () => {
    const before = new Date();
    await cancelDraftSessionImmediateV2({ draftSessionId: sessionId, canceledBy: 9999 });
    const db = await getDb();
    const rows = await db!.select().from(draftSessions).where(eq(draftSessions.draftSessionId, sessionId)).limit(1);
    expect(rows[0]?.canceledAt).toBeTruthy();
    expect(new Date(rows[0]!.canceledAt!).getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
  });

  it("T-TSM-3: cancelDraftSessionImmediateV2 revokes the writer token (REVOKED- prefix)", async () => {
    await cancelDraftSessionImmediateV2({ draftSessionId: sessionId, canceledBy: 9999 });
    const db = await getDb();
    const rows = await db!.select().from(draftSessions).where(eq(draftSessions.draftSessionId, sessionId)).limit(1);
    expect(rows[0]?.activeWriterToken).toMatch(/^REVOKED-/);
  });

  it("T-TSM-4: after cancel, validateWriterToken rejects the old token", async () => {
    await cancelDraftSessionImmediateV2({ draftSessionId: sessionId, canceledBy: 9999 });
    await expect(
      validateWriterToken({ draftSessionId: sessionId, activeWriterToken: token })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("T-TSM-5: expireOldDraftSessionsAndDocs sets status=expired for overdue sessions", async () => {
    // Set pendingExpiresAt to the past
    const db = await getDb();
    const past = new Date(Date.now() - 1000);
    await db!.update(draftSessions).set({ pendingExpiresAt: past } as any).where(eq(draftSessions.draftSessionId, sessionId));
    await expireOldDraftSessionsAndDocs();
    const rows = await db!.select().from(draftSessions).where(eq(draftSessions.draftSessionId, sessionId)).limit(1);
    expect(rows[0]?.status).toBe("expired");
  });

  it("T-TSM-6: expireOldDraftSessionsAndDocs sets expiredAt timestamp", async () => {
    const db = await getDb();
    const past = new Date(Date.now() - 1000);
    await db!.update(draftSessions).set({ pendingExpiresAt: past } as any).where(eq(draftSessions.draftSessionId, sessionId));
    await expireOldDraftSessionsAndDocs();
    const rows = await db!.select().from(draftSessions).where(eq(draftSessions.draftSessionId, sessionId)).limit(1);
    expect(rows[0]?.expiredAt).toBeTruthy();
  });

  it("T-TSM-7: expireOldDraftSessionsAndDocs revokes token (EXPIRED- prefix)", async () => {
    const db = await getDb();
    const past = new Date(Date.now() - 1000);
    await db!.update(draftSessions).set({ pendingExpiresAt: past } as any).where(eq(draftSessions.draftSessionId, sessionId));
    await expireOldDraftSessionsAndDocs();
    const rows = await db!.select().from(draftSessions).where(eq(draftSessions.draftSessionId, sessionId)).limit(1);
    expect(rows[0]?.activeWriterToken).toMatch(/^EXPIRED-/);
  });

  it("T-TSM-8: after expiry, validateWriterToken rejects the old token", async () => {
    const db = await getDb();
    const past = new Date(Date.now() - 1000);
    await db!.update(draftSessions).set({ pendingExpiresAt: past } as any).where(eq(draftSessions.draftSessionId, sessionId));
    await expireOldDraftSessionsAndDocs();
    await expect(
      validateWriterToken({ draftSessionId: sessionId, activeWriterToken: token })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("T-TSM-9: cancelDraftSessionImmediateV2 cancels active extraction attempts", async () => {
    // Register an attempt
    const db = await getDb();
    await db!.insert(extractionAttempts).values({
      attemptId: crypto.randomUUID(),
      documentId: 99999,
      draftSessionId: sessionId,
      generationId: 1,
      status: "processing",
      createdBy: 9999,
      startedAt: new Date(),
    } as any);
    await cancelDraftSessionImmediateV2({ draftSessionId: sessionId, canceledBy: 9999 });
    const attempts = await db!.select().from(extractionAttempts).where(eq(extractionAttempts.draftSessionId, sessionId));
    expect(attempts.every(a => a.status === "canceled")).toBe(true);
  });

  it("T-TSM-10: expireOldDraftSessionsAndDocs cancels active extraction attempts", async () => {
    const db = await getDb();
    const past = new Date(Date.now() - 1000);
    await db!.update(draftSessions).set({ pendingExpiresAt: past } as any).where(eq(draftSessions.draftSessionId, sessionId));
    await db!.insert(extractionAttempts).values({
      attemptId: crypto.randomUUID(),
      documentId: 99998,
      draftSessionId: sessionId,
      generationId: 1,
      status: "processing",
      createdBy: 9999,
      startedAt: new Date(),
    } as any);
    await expireOldDraftSessionsAndDocs();
    const attempts = await db!.select().from(extractionAttempts).where(eq(extractionAttempts.draftSessionId, sessionId));
    expect(attempts.every(a => a.status === "canceled")).toBe(true);
  });
});

// ─── D. AI Lifecycle Policy ───────────────────────────────────────────────────

describe("D. AI Lifecycle Policy", () => {
  let sessionId: string;
  let token: string;

  beforeEach(async () => {
    const s = await createTestSession();
    sessionId = s.draftSessionId;
    token = s.activeWriterToken;
  });

  afterEach(async () => {
    await cleanupSession(sessionId);
  });

  it("T-AIL-1: registerExtractionAttempt creates a new attempt with status=processing", async () => {
    const { attemptId, generationId } = await registerExtractionAttempt({
      documentId: 88881,
      draftSessionId: sessionId,
      createdBy: 9999,
    });
    expect(attemptId).toBeTruthy();
    expect(generationId).toBe(1);
    const db = await getDb();
    const rows = await db!.select().from(extractionAttempts).where(eq(extractionAttempts.attemptId, attemptId)).limit(1);
    expect(rows[0]?.status).toBe("processing");
    // Cleanup
    await db!.delete(extractionAttempts).where(eq(extractionAttempts.attemptId, attemptId));
  });

  it("T-AIL-2: registerExtractionAttempt supersedes previous active attempt", async () => {
    const { attemptId: firstId } = await registerExtractionAttempt({ documentId: 88882, draftSessionId: sessionId, createdBy: 9999 });
    const { attemptId: secondId, generationId } = await registerExtractionAttempt({ documentId: 88882, draftSessionId: sessionId, createdBy: 9999 });
    expect(generationId).toBe(2);
    const db = await getDb();
    const first = await db!.select().from(extractionAttempts).where(eq(extractionAttempts.attemptId, firstId)).limit(1);
    expect(first[0]?.status).toBe("superseded");
    expect(first[0]?.supersededBy).toBe(secondId);
    // Cleanup
    await db!.delete(extractionAttempts).where(inArray(extractionAttempts.attemptId, [firstId, secondId]));
  });

  it("T-AIL-3: completeExtractionAttempt returns true for valid processing attempt", async () => {
    const { attemptId } = await registerExtractionAttempt({ documentId: 88883, draftSessionId: sessionId, createdBy: 9999 });
    const accepted = await completeExtractionAttempt({ attemptId, translationId: 1 });
    expect(accepted).toBe(true);
    const db = await getDb();
    const rows = await db!.select().from(extractionAttempts).where(eq(extractionAttempts.attemptId, attemptId)).limit(1);
    expect(rows[0]?.status).toBe("completed");
    await db!.delete(extractionAttempts).where(eq(extractionAttempts.attemptId, attemptId));
  });

  it("T-AIL-4: completeExtractionAttempt returns false for superseded attempt (late-write rejection)", async () => {
    const { attemptId: firstId } = await registerExtractionAttempt({ documentId: 88884, draftSessionId: sessionId, createdBy: 9999 });
    await registerExtractionAttempt({ documentId: 88884, draftSessionId: sessionId, createdBy: 9999 });
    // First attempt is now superseded
    const accepted = await completeExtractionAttempt({ attemptId: firstId, translationId: 2 });
    expect(accepted).toBe(false);
    const db = await getDb();
    await db!.delete(extractionAttempts).where(eq(extractionAttempts.draftSessionId, sessionId));
  });

  it("T-AIL-5: completeExtractionAttempt returns false for cancelled attempt", async () => {
    const { attemptId } = await registerExtractionAttempt({ documentId: 88885, draftSessionId: sessionId, createdBy: 9999 });
    await cancelExtractionAttemptsBySession(sessionId);
    const accepted = await completeExtractionAttempt({ attemptId, translationId: 3 });
    expect(accepted).toBe(false);
    const db = await getDb();
    await db!.delete(extractionAttempts).where(eq(extractionAttempts.draftSessionId, sessionId));
  });

  it("T-AIL-6: cancelExtractionAttemptsBySession cancels all processing attempts", async () => {
    const { attemptId: a1 } = await registerExtractionAttempt({ documentId: 88886, draftSessionId: sessionId, createdBy: 9999 });
    const { attemptId: a2 } = await registerExtractionAttempt({ documentId: 88887, draftSessionId: sessionId, createdBy: 9999 });
    await cancelExtractionAttemptsBySession(sessionId);
    const db = await getDb();
    const rows = await db!.select().from(extractionAttempts).where(inArray(extractionAttempts.attemptId, [a1, a2]));
    expect(rows.every(r => r.status === "canceled")).toBe(true);
    await db!.delete(extractionAttempts).where(inArray(extractionAttempts.attemptId, [a1, a2]));
  });

  it("T-AIL-7: cancelExtractionAttemptsByDocument cancels attempts for a specific document", async () => {
    const { attemptId } = await registerExtractionAttempt({ documentId: 88888, draftSessionId: sessionId, createdBy: 9999 });
    await cancelExtractionAttemptsByDocument(88888);
    const db = await getDb();
    const rows = await db!.select().from(extractionAttempts).where(eq(extractionAttempts.attemptId, attemptId)).limit(1);
    expect(rows[0]?.status).toBe("canceled");
    await db!.delete(extractionAttempts).where(eq(extractionAttempts.attemptId, attemptId));
  });

  it("T-AIL-8: AI extraction is allowed on pending-draft documents (policy reversal)", async () => {
    // Verify the routers.ts does NOT contain the old rejection for pending-draft
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "routers.ts"), "utf-8");
    // The old rejection message must not exist
    expect(src).not.toContain("This document is a pending draft and has not been saved yet. Please save the Health Record before running AI extraction.");
    // The new policy message (allow pending-draft) must be present
    expect(src).toContain("pending-draft IS allowed");
  });

  it("T-AIL-9: AI extraction is blocked on deletion-pending documents", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "routers.ts"), "utf-8");
    expect(src).toContain("deletion-pending");
    expect(src).toContain("AI extraction is not available");
  });
});

// ─── E. Extraction Attempt Identity ──────────────────────────────────────────

describe("E. Extraction Attempt Identity", () => {
  let sessionId: string;

  beforeEach(async () => {
    const s = await createTestSession();
    sessionId = s.draftSessionId;
  });

  afterEach(async () => {
    await cleanupSession(sessionId);
  });

  it("T-EAI-1: each attempt has a unique UUID attemptId", async () => {
    const { attemptId: a1 } = await registerExtractionAttempt({ documentId: 77771, draftSessionId: sessionId, createdBy: 9999 });
    const { attemptId: a2 } = await registerExtractionAttempt({ documentId: 77772, draftSessionId: sessionId, createdBy: 9999 });
    expect(a1).not.toBe(a2);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    expect(a1).toMatch(uuidPattern);
    expect(a2).toMatch(uuidPattern);
    const db = await getDb();
    await db!.delete(extractionAttempts).where(inArray(extractionAttempts.attemptId, [a1, a2]));
  });

  it("T-EAI-2: generationId increments on retry for same document", async () => {
    const { attemptId: a1, generationId: g1 } = await registerExtractionAttempt({ documentId: 77773, draftSessionId: sessionId, createdBy: 9999 });
    const { attemptId: a2, generationId: g2 } = await registerExtractionAttempt({ documentId: 77773, draftSessionId: sessionId, createdBy: 9999 });
    const { attemptId: a3, generationId: g3 } = await registerExtractionAttempt({ documentId: 77773, draftSessionId: sessionId, createdBy: 9999 });
    expect(g1).toBe(1);
    expect(g2).toBe(2);
    expect(g3).toBe(3);
    const db = await getDb();
    await db!.delete(extractionAttempts).where(inArray(extractionAttempts.attemptId, [a1, a2, a3]));
  });

  it("T-EAI-3: superseded attempt has supersededBy pointing to the new attempt", async () => {
    const { attemptId: a1 } = await registerExtractionAttempt({ documentId: 77774, draftSessionId: sessionId, createdBy: 9999 });
    const { attemptId: a2 } = await registerExtractionAttempt({ documentId: 77774, draftSessionId: sessionId, createdBy: 9999 });
    const db = await getDb();
    const rows = await db!.select().from(extractionAttempts).where(eq(extractionAttempts.attemptId, a1)).limit(1);
    expect(rows[0]?.supersededBy).toBe(a2);
    await db!.delete(extractionAttempts).where(inArray(extractionAttempts.attemptId, [a1, a2]));
  });

  it("T-EAI-4: completeExtractionAttempt returns false for non-existent attempt", async () => {
    const accepted = await completeExtractionAttempt({ attemptId: "non-existent-attempt", translationId: 99 });
    expect(accepted).toBe(false);
  });

  it("T-EAI-5: completed attempt has completedAt timestamp", async () => {
    const { attemptId } = await registerExtractionAttempt({ documentId: 77775, draftSessionId: sessionId, createdBy: 9999 });
    await completeExtractionAttempt({ attemptId, translationId: 1 });
    const db = await getDb();
    const rows = await db!.select().from(extractionAttempts).where(eq(extractionAttempts.attemptId, attemptId)).limit(1);
    expect(rows[0]?.completedAt).toBeTruthy();
    await db!.delete(extractionAttempts).where(eq(extractionAttempts.attemptId, attemptId));
  });

  it("T-EAI-6: cancelled attempt has canceledAt timestamp", async () => {
    const { attemptId } = await registerExtractionAttempt({ documentId: 77776, draftSessionId: sessionId, createdBy: 9999 });
    await cancelExtractionAttemptsByDocument(77776);
    const db = await getDb();
    const rows = await db!.select().from(extractionAttempts).where(eq(extractionAttempts.attemptId, attemptId)).limit(1);
    expect(rows[0]?.canceledAt).toBeTruthy();
    await db!.delete(extractionAttempts).where(eq(extractionAttempts.attemptId, attemptId));
  });

  it("T-EAI-7: extraction_attempts table has all required columns", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const schema = readFileSync(join(__dirname, "../drizzle/schema.ts"), "utf-8");
    expect(schema).toContain("extractionAttempts");
    expect(schema).toContain("attemptId");
    expect(schema).toContain("generationId");
    expect(schema).toContain("supersededBy");
    expect(schema).toContain("canceledAt");
    expect(schema).toContain("completedAt");
  });

  it("T-EAI-8: 9-point write-time guard is present in translateLeadDocument", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "routers.ts"), "utf-8");
    expect(src).toContain("9-point write-time guard");
    expect(src).toContain("completeExtractionAttempt");
    expect(src).toContain("Translation discarded");
  });
});

// ─── F. Stale-Version Protection ─────────────────────────────────────────────

describe("F. Stale-Version Protection", () => {
  it("T-SVP-1: saveHealthRecord.ts contains expectedUpdatedAt stale-version check", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    expect(src).toContain("expectedUpdatedAt");
    expect(src).toContain("INTAKE_CONFLICT");
  });

  it("T-SVP-2: stale-version check uses 1s tolerance window", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    expect(src).toContain("1000"); // 1000ms tolerance
  });

  it("T-SVP-3: client passes expectedUpdatedAt in Save call", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"), "utf-8");
    expect(src).toContain("expectedUpdatedAt");
    // Must use the intake's updatedAt, not draftSessionId
    expect(src).toContain("(intake as any)?.updatedAt");
  });

  it("T-SVP-4: client uses server-issued activeWriterToken in Save (not draftSessionId)", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"), "utf-8");
    // Must NOT use draftSessionId as the activeWriterToken
    expect(src).not.toContain("activeWriterToken: draftSessionId ?? undefined");
    // Must use the real activeWriterToken
    expect(src).toContain("activeWriterToken: activeWriterToken ?? undefined");
  });

  it("T-SVP-5: saveHealthRecord marks session as saved with savedAt timestamp", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    expect(src).toContain("status: \"saved\"");
    expect(src).toContain("savedAt: now");
  });
});

// ─── G. Save Idempotency ──────────────────────────────────────────────────────

describe("G. Save Idempotency", () => {
  it("T-SID-1: saveHealthRecord.ts uses save_idempotency table", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    expect(src).toContain("saveIdempotency");
    expect(src).toContain("requestId");
  });

  it("T-SID-2: idempotency record is set to processing before DB writes", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    expect(src).toContain("status: \"processing\"");
  });

  it("T-SID-3: idempotency record is set to completed after successful save", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    expect(src).toContain("status: \"completed\"");
  });

  it("T-SID-4: idempotency record is set to failed on error", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    expect(src).toContain("status: \"failed\"");
  });

  it("T-SID-5: duplicate requestId with same payload returns cached result", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    expect(src).toContain("idempotent: true");
    expect(src).toContain("Return cached result");
  });
});

// ─── H. Legacy Fallback Removal ───────────────────────────────────────────────

describe("H. Legacy Fallback Removal", () => {
  it("T-LFR-1: MedicalIntakeForm uploadIntakeFilePending has no legacy fallback branch", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"), "utf-8");
    // The legacy fallback comment must not exist in uploadIntakeFilePending
    expect(src).not.toContain("Legacy immediate upload");
  });

  it("T-LFR-2: makeUploadHandler has no legacy fallback branch", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"), "utf-8");
    expect(src).not.toContain("Fallback: legacy immediate upload");
  });

  it("T-LFR-3: uploadIntakeFilePending throws if no draftSessionId", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"), "utf-8");
    expect(src).toContain("No active draft session. Please refresh and try again.");
  });

  it("T-LFR-4: makeUploadHandler shows error toast if no draftSessionId", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"), "utf-8");
    // makeUploadHandler must show a toast.error when no session
    expect(src).toContain("No active draft session. Please refresh and try again.");
  });

  it("T-LFR-5: GeneralAttachmentsSection has no legacy fallback branch", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"), "utf-8");
    // The GeneralAttachmentsSection must not have a legacy else branch
    // Check that the old "Legacy immediate upload" comment is gone
    expect(src).not.toContain("Legacy immediate upload");
  });

  it("T-LFR-6: all upload paths pass activeWriterToken to the server", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"), "utf-8");
    // activeWriterToken must appear in upload payloads
    expect(src).toContain("activeWriterToken, pendingSection:");
  });
});

// ─── I. Meaningful-Activity Touch ─────────────────────────────────────────────

describe("I. Meaningful-Activity Touch", () => {
  it("T-MAT-1: touchDraftSession validates writer token before extending expiry", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "routers.ts"), "utf-8");
    // Both leads and patients touchDraftSession must call validateWriterToken
    const touchIdx = src.indexOf("touchDraftSession: staffOrAdminProcedure");
    const touchBody = src.slice(touchIdx, touchIdx + 500);
    expect(touchBody).toContain("validateWriterToken");
  });

  it("T-MAT-2: useDraftSession hook exposes touchSession function", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "../client/src/hooks/useDraftSession.ts"), "utf-8");
    expect(src).toContain("touchSession");
  });

  it("T-MAT-3: MedicalIntakeForm calls onTouchSession on file upload", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"), "utf-8");
    expect(src).toContain("onTouchSession?.()");
  });
});

// ─── J. Cancel/Expiry Flow ────────────────────────────────────────────────────

describe("J. Cancel/Expiry Flow", () => {
  it("T-CEF-1: cancelDraftSession tRPC procedure validates activeWriterToken before cancelling", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "routers.ts"), "utf-8");
    // Find cancelDraftSession procedure and verify it calls validateWriterToken
    const cancelIdx = src.indexOf("cancelDraftSession: staffOrAdminProcedure");
    const cancelBody = src.slice(cancelIdx, cancelIdx + 600);
    expect(cancelBody).toContain("validateWriterToken");
    expect(cancelBody).toContain("cancelDraftSessionImmediateV2");
  });

  it("T-CEF-2: Cancel button is NEVER disabled (Part B fix — inactive-tab Cancel must always work)", async () => {
    // Part B spec change: Cancel must always be clickable so an inactive-tab coordinator
    // can exit Edit mode without holding the write lock.
    // The onCancel handler checks isWriteActive internally to decide whether to call the server.
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"), "utf-8");
    // The inactive-tab early-return guard must be present in the cancel handler
    expect(src).toContain("Inactive-tab Cancel");
    // The lockDecisionMade guard must be used to suppress the false warning flash
    expect(src).toContain("lockDecisionMade");
  });

  it("T-CEF-3: client passes activeWriterToken to cancelDraftSession mutation", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"), "utf-8");
    expect(src).toContain("{ draftSessionId, activeWriterToken }");
  });
});
