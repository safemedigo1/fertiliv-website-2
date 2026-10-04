import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  LINKED_DEVICE_FEASIBILITY_GATE,
  buildBlockedLinkedDeviceQrResult,
  canManageLinkedDeviceLineStaff,
  computeAuthorizedStaffDelta,
  hasActiveWppConnectIdentity,
  linkedDeviceSessionStates,
  projectWppConnectCurrentIdentity,
  sandboxStartIsProviderAvailable,
  linkedDeviceRuntimeFromSession,
  workerAllocationMatchesLinkedDeviceLine,
  workerAllocationSnapshotMatchesLinkedDeviceLine,
} from "./whatsappLinkedDevice";
import { allocateLinkedDeviceRuntime } from "./linkedDeviceRuntime";
import { isLinkedDeviceLineDeletable } from "../shared/whatsappLinkedDeviceLifecycle";

const root = path.resolve(import.meta.dirname, "..");
const schema = fs.readFileSync(path.join(root, "drizzle/schema.ts"), "utf8");
const linkedDeviceSource = fs.readFileSync(path.join(root, "server/whatsappLinkedDevice.ts"), "utf8");
const operationalInboxSource = fs.readFileSync(path.join(root, "server/operationalInbox.ts"), "utf8");
const routerSource = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");
const connectionSource = fs.readFileSync(path.join(root, "server/whatsappConnection.ts"), "utf8");

function tableSection(name: string, nextName: string) {
  const start = schema.indexOf(`export const ${name}`);
  const end = schema.indexOf(`export const ${nextName}`, start + 1);
  return schema.slice(start, end === -1 ? undefined : end);
}

function createStaffContext(): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 77,
      openId: "linked-device-staff-test",
      name: "Ordinary Staff",
      email: "staff@example.test",
      passwordHash: null,
      loginMethod: "manus",
      role: "staff",
      status: "active",
      avatarUrl: null,
      phone: null,
      firstName: null,
      secondName: null,
      thirdName: null,
      isActive: true,
      bio: null,
      jobTitle: null,
      languages: null,
      primaryLanguage: null,
      weeklySchedule: null,
      slotDurationMinutes: 30,
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("Linked Device / QR safe foundation", () => {
  it("keeps the feasibility gate production-blocked while recording the sandbox-proven adapter", () => {
    expect(LINKED_DEVICE_FEASIBILITY_GATE).toMatchObject({
      approvedForProduction: false,
      adapterKind: "wppconnect_sandbox_poc",
    });
    expect(LINKED_DEVICE_FEASIBILITY_GATE.reason).toMatch(/isolated synthetic/i);
    expect(LINKED_DEVICE_FEASIBILITY_GATE.productionBlocker).toMatch(/unofficial WhatsApp Web/i);
  });

  it("models every required session lifecycle state without claiming a generic connection", () => {
    expect(linkedDeviceSessionStates).toEqual(expect.arrayContaining([
      "not_started", "creating_session", "waiting_for_qr", "qr_ready", "qr_expired",
      "linking", "connected", "reconnecting", "disconnected", "logged_out",
      "session_invalid", "failed", "disabled",
    ]));
  });

  it("fails QR generation closed without returning a QR, token, secret, or session credential", () => {
    const result = buildBlockedLinkedDeviceQrResult(73);
    expect(result).toEqual({
      lineId: 73,
      outcome: "blocked",
      state: "disabled",
      reason: LINKED_DEVICE_FEASIBILITY_GATE.reason,
    });
    expect(Object.keys(result).join(" ").toLowerCase()).not.toMatch(/qr|token|secret|credential|payload/);
  });

  it("does not provide a schema field in which to persist a QR payload", () => {
    const sessionTable = tableSection("whatsappLinkedDeviceSessions", "whatsappLinkedDeviceCredentials");
    expect(sessionTable).toContain('failureCategory: varchar("failureCategory"');
    expect(sessionTable).not.toMatch(/qrPayload|qrCode|qrImage|sessionToken|authToken/i);
  });

  it("reserves encrypted server-side credential storage rather than plaintext session fields", () => {
    const credentialTable = tableSection("whatsappLinkedDeviceCredentials", "whatsappSendAttempts");
    expect(credentialTable).toContain('encryptedCredential: text("encryptedCredential").notNull()');
    expect(credentialTable).toContain('encryptionVersion: varchar("encryptionVersion"');
    expect(credentialTable).not.toMatch(/plaintext|rawSession|sessionSecret/i);
  });

  it("scopes future line access through the existing user identity model", () => {
    expect(schema).toContain('export const whatsappLinkedDeviceLineStaff');
    expect(schema).toContain('uniqueIndex("whatsapp_linked_device_line_staff_uq").on(table.lineId, table.userId)');
    expect(linkedDeviceSource).toContain('if (input.userRole === "admin") return true');
    expect(linkedDeviceSource).toContain('eq(whatsappLinkedDeviceLineStaff.userId, input.userId)');
  });

  it("blocks before any QR provider call or credential envelope can be created", () => {
    const requestStart = linkedDeviceSource.indexOf("export async function requestLinkedDeviceQr");
    const requestSource = linkedDeviceSource.slice(requestStart);
    expect(requestSource).toContain('failureCategory: "unapproved_provider"');
    expect(requestSource).toContain('return buildBlockedLinkedDeviceQrResult(line.id)');
    expect(requestSource).not.toMatch(/fetch\(|WebSocket|puppeteer|playwright|baileys|green-api/i);
  });

  it("leaves the existing Meta Cloud API resolution path untouched", () => {
    expect(connectionSource).toContain('provider: "meta"');
    expect(connectionSource).toContain('return { ...legacy, accessToken: token }');
    expect(routerSource).toContain('linkedDeviceStatus: adminProcedure.query');
    expect(routerSource).toContain('requestLinkedDeviceQr: adminProcedure');
    expect(routerSource).toContain('completeEmbeddedSignup: adminProcedure');
  });

  it("retains the dedicated in-app adapter classification when an explicitly synthetic event is processed", () => {
    const ingestionStart = linkedDeviceSource.indexOf("export async function ingestWppConnectSyntheticEvent");
    const ingestionSource = linkedDeviceSource.slice(ingestionStart);
    expect(ingestionSource).toMatch(/adapterKind:\s*line\.adapterKind === "wppconnect_in_app_sandbox"/);
    expect(ingestionSource).toContain('? "wppconnect_in_app_sandbox"');
    expect(ingestionSource).toContain(': "wppconnect_sandbox"');
  });

  it("synchronizes line, session, and connection eligibility from the same current sandbox status", () => {
    const syncStart = linkedDeviceSource.indexOf("async function syncWppConnectSandboxLine");
    const syncSource = linkedDeviceSource.slice(syncStart, linkedDeviceSource.indexOf("export async function startWppConnectSandboxSession", syncStart));
    expect(syncSource).toContain("connectionLifecycleState");
    expect(syncSource).toContain("providerStateSnapshot");
    expect(syncSource).toContain("directRecipientEnabled");
    expect(syncSource).toContain("outboundReady: input.status.outboundReady");
    expect(linkedDeviceSource).toContain('status.status === "CONNECTED" && status.outboundReady');
    expect(syncSource).toContain("lastProviderStatusAt");
    expect(syncSource).toContain("lifecycleStatus: connectionLifecycleState");
    expect(syncSource).toContain("healthState: providerHealthState");
    const statusStart = linkedDeviceSource.indexOf("export async function getWppConnectSandboxStatus");
    const statusSource = linkedDeviceSource.slice(statusStart);
    expect(statusSource).toContain("includeQr: input.includeQr");
  });

  it("treats only a fully connected runtime identity as current", () => {
    const connected = {
      status: "CONNECTED",
      outboundReady: true,
      identity: { accountHint: "90••••60", pushname: "Quartzdent", platform: "android" },
    };
    expect(hasActiveWppConnectIdentity(connected)).toBe(true);
    expect(projectWppConnectCurrentIdentity(connected)).toEqual({
      displayPhone: "90••••60",
      normalizedDisplayPhone: null,
      providerAccountHint: "90••••60",
      providerPushName: "Quartzdent",
      providerPlatform: "android",
    });
    expect(projectWppConnectCurrentIdentity({ ...connected, identity: { ...connected.identity, accountHint: "91••••61" } }).providerAccountHint).toBe("91••••61");
  });

  it("never treats a stale Connected snapshot as current without all four ownership values", () => {
    const input = {
      lineId: 150001,
      sessionId: 150001,
      sessionName: "fertiliv-inapp-wppconnect",
      runtimeGeneration: "generation-f4-current",
    };
    const valid = {
      status: "CONNECTED",
      outboundReady: true,
      workerLineId: 150001,
      workerLineProviderId: "wppconnect-line-150001",
      workerSessionId: "150001",
      sessionName: "fertiliv-inapp-wppconnect",
      runtimeGeneration: "generation-f4-current",
    };
    expect(workerAllocationSnapshotMatchesLinkedDeviceLine({ ...input, snapshot: valid })).toBe(true);
    expect(workerAllocationSnapshotMatchesLinkedDeviceLine({ ...input, snapshot: { ...valid, workerLineId: 120002 } })).toBe(false);
    expect(workerAllocationSnapshotMatchesLinkedDeviceLine({ ...input, snapshot: { ...valid, runtimeGeneration: "stale-generation" } })).toBe(false);
    expect(workerAllocationSnapshotMatchesLinkedDeviceLine({ ...input, snapshot: { status: "CONNECTED", outboundReady: true } })).toBe(false);
  });

  it("requires confirmed worker availability before reporting a sandbox start success", () => {
    const qrReady = {
      available: true,
      error: null,
      status: "QR_READY",
      outboundReady: false,
      qrAvailable: true,
      identity: null,
    } as const;
    expect(sandboxStartIsProviderAvailable(qrReady)).toBe(true);
    expect(sandboxStartIsProviderAvailable({ ...qrReady, available: false })).toBe(false);
    expect(sandboxStartIsProviderAvailable({ ...qrReady, qrAvailable: false })).toBe(false);
    expect(sandboxStartIsProviderAvailable({ ...qrReady, error: "sandbox_unavailable" })).toBe(false);
  });

  it("keeps unavailable start failures truthful instead of showing a success toast", () => {
    const startSource = linkedDeviceSource.slice(linkedDeviceSource.indexOf("export async function startWppConnectSandboxSession"));
    expect(startSource).toContain("const synchronized = await syncWppConnectSandboxLine");
    expect(startSource).toContain("if (!sandboxStartIsProviderAvailable(status))");
    expect(startSource).toContain("could not be started");
  });

  it("persists an isolated runtime before starting its child and fails closed rather than using Ferti2 fallback", () => {
    const startSource = linkedDeviceSource.slice(linkedDeviceSource.indexOf("export async function startWppConnectSandboxSession"));
    const persistIndex = startSource.search(/await db\.transaction\(async\s*\(?tx\)?\s*=>\s*\{/);
    const childStartIndex = startSource.indexOf("await startIsolatedLinkedDeviceWorker({");
    expect(persistIndex).toBeGreaterThan(-1);
    expect(childStartIndex).toBeGreaterThan(persistIndex);
    const statusSource = linkedDeviceSource.slice(linkedDeviceSource.indexOf("export async function getWppConnectSandboxStatus"));
    expect(statusSource).toContain("This Linked Device line has no active isolated runtime");
    expect(statusSource).toMatch(/line\.adapterKind === "wppconnect_in_app_sandbox"\s*\|\|\s*line\.adapterKind === "unselected"/);
  });

  it("clears current identity for QR, logout, unavailable, and failed states", () => {
    const identity = { accountHint: "90••••60", pushname: "Quartzdent", platform: "android" };
    for (const status of ["QR_READY", "LOGGED_OUT", "DISCONNECTED", "FAILED", "UNAVAILABLE"]) {
      expect(hasActiveWppConnectIdentity({ status, outboundReady: false, identity })).toBe(false);
      expect(projectWppConnectCurrentIdentity({ status, outboundReady: false, identity })).toEqual({
        displayPhone: null,
        normalizedDisplayPhone: null,
        providerAccountHint: null,
        providerPushName: null,
        providerPlatform: null,
      });
    }
  });

  it("removes only the disposable session and recreates it on the same persistent line", () => {
    expect(linkedDeviceSource).toContain("export async function logoutWppConnectSandboxSession");
    expect(linkedDeviceSource).toContain('lifecycleState: "logged_out"');
    expect(linkedDeviceSource).toMatch(/tx\s*\.delete\(whatsappLinkedDeviceSessions\)/);
    expect(linkedDeviceSource).toContain("if (!existingSession)");
    expect(linkedDeviceSource).toContain('lineId: input.lineId');
    expect(linkedDeviceSource).not.toContain("tx.delete(whatsappLinkedDeviceLines)");
    expect(linkedDeviceSource).toContain("requiresQr: true");
    expect(linkedDeviceSource).toContain('displayPhone: null');
    expect(linkedDeviceSource).toContain('providerAccountHint: currentIdentity.providerAccountHint');
    expect(routerSource).toContain("logoutLinkedDeviceSandbox: adminProcedure");
  });

  it("does not allow a late event to recreate a deleted disposable session", () => {
    expect(linkedDeviceSource).toContain('if (!session || session.state !== "connected")');
    expect(linkedDeviceSource).toContain('The disposable Linked Device session is not active.');
    expect(linkedDeviceSource).not.toContain("delete(whatsappConversations)");
    expect(linkedDeviceSource).not.toContain("delete(whatsappConversationMessages)");
  });

  it("allows Delete line only when both line and session are non-active", () => {
    expect(isLinkedDeviceLineDeletable("logged_out", "logged_out")).toBe(true);
    expect(isLinkedDeviceLineDeletable("not_started", "not_started")).toBe(true);
    expect(isLinkedDeviceLineDeletable("failed", null)).toBe(true);
    expect(isLinkedDeviceLineDeletable("connected", "connected")).toBe(false);
    expect(isLinkedDeviceLineDeletable("reconnecting", "reconnecting")).toBe(false);
    expect(isLinkedDeviceLineDeletable("logged_out", "creating_session")).toBe(false);
  });

  it("archives a deleted line instead of deleting historical data or allowing reactivation", () => {
    expect(linkedDeviceSource).toContain("export async function deleteUnusedLinkedDeviceLine");
    expect(linkedDeviceSource).toContain(".for(\"update\")");
    expect(linkedDeviceSource).toContain("isLinkedDeviceLineDeletable(line.lifecycleState, session?.state)");
    expect(linkedDeviceSource).toContain('lifecycleState: "disabled"');
    expect(linkedDeviceSource).toContain('adapterKind: "archived_deleted"');
    expect(linkedDeviceSource).toMatch(/tx\s*\.delete\(whatsappLinkedDeviceSessions\)/);
    expect(linkedDeviceSource).toMatch(/tx\s*\.update\(whatsappSyntheticTestRecipients\)/);
    expect(linkedDeviceSource).toContain("historyPreserved: true");
    expect(linkedDeviceSource).not.toContain("tx.delete(whatsappLinkedDeviceLines)");
    expect(linkedDeviceSource).not.toContain("tx.delete(whatsappConversations)");
    expect(linkedDeviceSource).not.toContain("tx.delete(whatsappConversationMessages)");
    expect(linkedDeviceSource).toContain('This WhatsApp line was deleted from Settings');
    expect(routerSource).toContain("deleteUnusedLinkedDeviceLine: adminProcedure");
  });

  it("keeps removed lines out of active Settings while preserving the line row for history joins", () => {
    expect(linkedDeviceSource).toContain('ne(whatsappLinkedDeviceLines.lifecycleState, "disabled")');
    expect(routerSource).toContain("deleteUnusedLinkedDeviceLine");
    expect(connectionSource).toContain("provider: \"meta\"");
  });

  it("computes only the added and removed staff IDs while preserving the same line scope", () => {
    expect(computeAuthorizedStaffDelta([11, 12], [12, 13, 13])).toEqual({
      requestedStaffIds: [12, 13],
      addedUserIds: [13],
      removedUserIds: [11],
    });
    expect(computeAuthorizedStaffDelta([11, 12], [11, 12])).toEqual({
      requestedStaffIds: [11, 12],
      addedUserIds: [],
      removedUserIds: [],
    });
  });

  it("keeps staff management administrator-only and records a line-scoped audit delta", () => {
    expect(canManageLinkedDeviceLineStaff({ role: "admin" })).toBe(true);
    expect(canManageLinkedDeviceLineStaff({ role: "staff" })).toBe(false);
    const updateStart = linkedDeviceSource.indexOf("export async function updateLinkedDeviceLineStaff");
    const updateSource = linkedDeviceSource.slice(updateStart, linkedDeviceSource.indexOf("export function buildBlockedLinkedDeviceQrResult", updateStart));
    expect(updateSource).toContain("whatsapp_linked_device_line_staff_updated");
    expect(updateSource).toContain("result.lineId");
    expect(updateSource).toContain("Added:");
    expect(updateSource).toContain("Removed:");
    expect(updateSource).toContain('.for("update")');
    expect(updateSource).toContain("whatsappLinkedDeviceLineStaff");
    expect(updateSource).not.toContain("whatsappLinkedDeviceSessions).set");
    expect(updateSource).not.toContain("wppConnectSandboxAdapter");
    expect(routerSource).toContain("updateLinkedDeviceLineStaff: adminProcedure");
  });

  it("rejects a non-admin staff mutation before any line or provider operation", async () => {
    const caller = appRouter.createCaller(createStaffContext());
    await expect(caller.whatsapp.updateLinkedDeviceLineStaff({ lineId: 90002, authorizedStaffIds: [120001] }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps current assignments in the safe line projection so the editor can refresh its count", () => {
    expect(linkedDeviceSource).toContain("authorizedStaffIds: number[]");
    expect(linkedDeviceSource).toContain("authorizedStaffIdsByLine");
    expect(linkedDeviceSource).toContain("authorizedStaffCount: Number(row.authorizedStaffCount ?? 0)");
  });

  it("allocates runtime infrastructure to a disposable session without using a line ID, phone identity, or port as business identity", () => {
    const runtime = allocateLinkedDeviceRuntime({ sessionName: "fresh-session-a", generation: "generation-a1" });
    expect(runtime).toMatchObject({
      slot: "linked-device-default",
      sessionName: "fresh-session-a",
      generation: "generation-a1",
      mode: "sandbox",
    });
    expect(runtime.endpointUrl).toMatch(/^https?:\/\//);
    expect(JSON.stringify(runtime)).not.toContain("30001");
    expect(JSON.stringify(runtime)).not.toContain("90••••60");
  });

  it("restores a persisted binding only when every safe session-runtime field is valid", () => {
    expect(linkedDeviceRuntimeFromSession({
      sessionId: 120002,
      runtimeSlot: "worker-a",
      runtimeEndpoint: "http://127.0.0.1:8899",
      runtimeMode: "sandbox",
      runtimeGeneration: "generation-a1",
      runtimeProfileRef: "linked-device/1/a",
      sessionName: "fresh-session-a",
    })).toMatchObject({ slot: "worker-a", sessionName: "fresh-session-a" });
    expect(linkedDeviceRuntimeFromSession({
      runtimeSlot: "worker-a",
      runtimeEndpoint: null,
      runtimeMode: "sandbox",
      runtimeGeneration: "generation-a1",
      runtimeProfileRef: null,
      sessionName: "fresh-session-a",
    })).toBeNull();
  });

  it("persists runtime ownership on new sessions and removes business-level hardcoding from start, ingress, and worker paths", () => {
    const startSource = linkedDeviceSource.slice(linkedDeviceSource.indexOf("export async function startWppConnectSandboxSession"));
    expect(startSource).toContain("allocateLinkedDeviceRuntime");
    expect(startSource).toContain("runtimeGeneration: runtime.generation");
    expect(startSource).toContain("runtime.sessionId");
    expect(startSource).toContain("runtimeProfileRef: runtime.profileRef");
    expect(startSource).not.toContain('sessionName: "fertiliv-inapp-wppconnect"');
    const ingress = fs.readFileSync(path.join(root, "server/wppConnectSandboxIngress.ts"), "utf8");
    expect(ingress).not.toContain("INAPP_SESSION_NAME");
    expect(ingress).toContain("line.sessionName !== sessionName");
    expect(ingress).toContain("line.sessionState");
    const workerPath = path.join(root, "..", "linked-device-poc/wppconnect/wppconnect-poc.cjs");
    if (!fs.existsSync(workerPath)) return;
    const worker = fs.readFileSync(workerPath, "utf8");
    expect(worker).toContain("const lineId = Number(process.env.POC_LINE_ID || 0)");
    expect(worker).toContain("POC_INBOUND_BRIDGE_ENABLED");
    expect(worker).toContain("POC_OUTBOUND_ENABLED");
    expect(worker).not.toContain("wppconnect-line-30001");
  });

  it("routes a missing or logged-out in-app session to a fresh isolated allocator, never a stale 8899 fallback", () => {
    const startSource = linkedDeviceSource.slice(linkedDeviceSource.indexOf("export async function startWppConnectSandboxSession"));
    expect(startSource).toContain("!existingLine.sessionState");
    expect(startSource).toContain('"logged_out", "failed", "session_invalid"');
    expect(startSource).toContain("await allocateIsolatedLinkedDeviceRuntime()");
    expect(startSource).not.toContain("persistedRuntime ?? await allocateIsolatedLinkedDeviceRuntime()");
    expect(startSource).toContain("await startIsolatedLinkedDeviceWorker");
  });

  it("routes only a newly created server-classified clean line to WPPConnect Server before legacy sandbox startup and keeps four-way ownership durable", () => {
    const startSource = linkedDeviceSource.slice(linkedDeviceSource.indexOf("export async function startWppConnectSandboxSession"));
    expect(startSource.indexOf("await isWppConnectServerSelectedLine(input.lineId)")).toBeLessThan(
      startSource.indexOf("wppConnectSandboxAdapter.isSandboxUiEnabled()")
    );
    const serverStartAt = linkedDeviceSource.indexOf("export async function startWppConnectServerLinkedDeviceSession");
    const serverStart = linkedDeviceSource.slice(serverStartAt, linkedDeviceSource.indexOf("export async function startWppConnectSandboxSession", serverStartAt));
    expect(serverStart).toContain("preflightWppConnectServerProvider");
    expect(serverStart).toContain('line.adapterKind !== "wppconnect_server"');
    expect(serverStart).toContain("runtimeGeneration: generation");
    expect(serverStart).toContain('runtimeSlot: "wppconnect-server-cloud"');
    expect(serverStart).toContain("startWppConnectServerSession({ ownership })");
    expect(serverStart).toContain("getWppConnectServerQrDataUrl({ ownership })");
    expect(serverStart).not.toContain("allocateLinkedDeviceRuntime");
    expect(serverStart).not.toContain("startIsolatedLinkedDeviceWorker");
  });

  it("classifies only newly created clean lines for the enabled Server rollout and preserves historical adapters", () => {
    const creationStart = linkedDeviceSource.indexOf("export async function createLinkedDeviceLine");
    const creationSource = linkedDeviceSource.slice(creationStart, linkedDeviceSource.indexOf("export function canManageLinkedDeviceLineStaff", creationStart));
    expect(creationSource).toContain('const initialAdapterKind = isWppConnectServerAdapterEnabled()');
    expect(creationSource).toContain('? "wppconnect_server"');
    expect(creationSource).toContain(': "unselected"');
    expect(creationSource).toContain('adapterKind: initialAdapterKind');
    expect(creationSource).not.toContain("wppConnectSandboxAdapter.getSandboxStatus");
    expect(linkedDeviceSource).toContain("async function isWppConnectServerSelectedLine");
  });

  it("provides a narrow admin-only stale F4 cleanup that never calls provider logout or deletes history", () => {
    expect(linkedDeviceSource).toContain("export async function clearStaleLinkedDeviceDisposableState");
    const cleanupStart = linkedDeviceSource.indexOf("export async function clearStaleLinkedDeviceDisposableState");
    const cleanupSource = linkedDeviceSource.slice(cleanupStart, linkedDeviceSource.indexOf("export async function deleteUnusedLinkedDeviceLine", cleanupStart));
    expect(cleanupSource).toContain('input.lineId !== 150001');
    expect(cleanupSource).toContain('eq(whatsappLinkedDeviceLines.id, input.lineId)');
    expect(cleanupSource).toMatch(/tx\s*\.delete\(whatsappLinkedDeviceSessions\)/);
    expect(cleanupSource).toContain('lifecycleState: "not_started"');
    expect(cleanupSource).toContain('providerLogoutCalled: false');
    expect(cleanupSource).not.toContain("logoutSandbox");
    expect(cleanupSource).not.toContain("tx.delete(whatsappLinkedDeviceLines)");
    expect(cleanupSource).not.toContain("tx.delete(whatsappConversations)");
    expect(cleanupSource).not.toContain("tx.delete(whatsappConversationMessages)");
    expect(routerSource).toContain("clearStaleF4LinkedDeviceState: adminProcedure");
    expect(routerSource).toContain("z.literal(150001)");
  });

  it("allocates a runtime only from Connect and never mutates a live legacy session during status polling", () => {
    const syncStart = linkedDeviceSource.indexOf("async function syncWppConnectSandboxLine");
    const connectStart = linkedDeviceSource.indexOf("export async function startWppConnectSandboxSession");
    const statusStart = linkedDeviceSource.indexOf("export async function getWppConnectSandboxStatus");
    const syncSource = linkedDeviceSource.slice(syncStart, connectStart);
    const statusSource = linkedDeviceSource.slice(statusStart);
    expect(syncSource).toContain("Only an explicit Connect action allocates a binding.");
    expect(syncSource).not.toContain("allocateLinkedDeviceRuntime(");
    expect(statusSource).not.toContain("allocateLinkedDeviceRuntime(");
  });

  it("requires the current worker allocation to match the persistent line and disposable session before direct authorization", () => {
    const runtime = allocateLinkedDeviceRuntime({
      sessionId: 120002,
      sessionName: "line-120002-session",
      generation: "generation-120002",
    });
    const valid = {
      workerLineId: 120002,
      workerLineProviderId: "wppconnect-line-120002",
      workerSessionId: "120002",
      sessionName: "line-120002-session",
      runtimeGeneration: "generation-120002",
    };
    expect(workerAllocationMatchesLinkedDeviceLine({
      lineId: 120002,
      providerLineId: "wppconnect-line-120002",
      runtime,
      status: valid,
    })).toBe(true);
    expect(workerAllocationMatchesLinkedDeviceLine({
      lineId: 120002,
      providerLineId: "wppconnect-line-120002",
      runtime,
      status: { ...valid, workerLineId: 30001 },
    })).toBe(false);
    expect(workerAllocationMatchesLinkedDeviceLine({
      lineId: 120002,
      providerLineId: "wppconnect-line-120002",
      runtime,
      status: { ...valid, workerLineProviderId: "wppconnect-line-30001" },
    })).toBe(false);
    expect(workerAllocationMatchesLinkedDeviceLine({
      lineId: 120002,
      providerLineId: "wppconnect-line-120002",
      runtime,
      status: { ...valid, sessionName: "old-disposable-session" },
    })).toBe(false);
    expect(workerAllocationMatchesLinkedDeviceLine({
      lineId: 120002,
      providerLineId: "wppconnect-line-120002",
      runtime: null,
      status: valid,
    })).toBe(false);
    expect(workerAllocationMatchesLinkedDeviceLine({
      lineId: 120002,
      providerLineId: "wppconnect-line-120002",
      runtime,
      status: { ...valid, runtimeGeneration: "stale-previous-generation" },
    })).toBe(false);
    expect(workerAllocationMatchesLinkedDeviceLine({
      lineId: 120002,
      providerLineId: "wppconnect-line-120002",
      runtime,
      status: { ...valid, runtimeGeneration: null },
    })).toBe(false);
    expect(workerAllocationMatchesLinkedDeviceLine({
      lineId: 120002,
      providerLineId: "wppconnect-line-120002",
      runtime,
      status: { ...valid, sessionName: "line-120002-session", runtimeGeneration: "generation-other" },
    })).toBe(false);
  });

  it("checks worker allocation before proof generation so a stale worker cannot consume a line-scoped approval", () => {
    const authorizationStart = operationalInboxSource.indexOf("async function authorizedDirectConversationLine");
    const authorizationSource = operationalInboxSource.slice(authorizationStart, operationalInboxSource.indexOf("async function existingDirectConversation", authorizationStart));
    expect(authorizationSource).toContain("workerAllocationMatchesLinkedDeviceLine");
    expect(authorizationSource).toContain("not allocated to this line");
    expect(operationalInboxSource.indexOf("workerAllocationMatchesLinkedDeviceLine")).toBeLessThan(
      operationalInboxSource.indexOf("const approval = buildSyntheticRecipientApprovalProof"),
    );
  });
});
