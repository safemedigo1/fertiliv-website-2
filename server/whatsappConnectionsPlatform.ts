import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  whatsappConnectionCredentials,
  whatsappConnections,
  whatsappEmbeddedSignupSessions,
  whatsappLinkedDeviceLineStaff,
  whatsappLinkedDeviceLines,
  whatsappLinkedDeviceSessions,
  users,
} from "../drizzle/schema";
import { getDb, logAudit } from "./db";
import { canUserAccessLinkedDeviceLine, getWppConnectSandboxStatus } from "./whatsappLinkedDevice";

export type PlatformActor = { id: number; role: string; name?: string | null };
export type ConnectionMethod = "meta_cloud_api" | "meta_embedded_signup" | "meta_coexistence" | "linked_device" | "manual_cloud_api";

export type ConnectedNumberCard = {
  id: string;
  lineId: number | null;
  connectionId: number | null;
  lineName: string;
  fullPhone: string | null;
  method: ConnectionMethod;
  methodLabel: string;
  provider: "meta" | "wppconnect";
  status: string;
  inboundHealth: string;
  outboundHealth: string;
  sessionHealth: string;
  lastActivityAt: Date | null;
  authorizedStaff: Array<{ id: number; name: string | null; role: string }>;
  businessAccount: string | null;
  diagnosticAvailable: boolean;
  relinkAvailable: boolean;
  productionApproved: boolean;
  nonProductionNotice: string | null;
};

export type LinkedDeviceSessionMonitorRow = {
  lineId: number;
  lineName: string;
  sessionId: number | null;
  sessionState: string;
  lifecycleState: string;
  providerStatus: string;
  health: string;
  lastConnectedAt: Date | null;
  lastActivityAt: Date | null;
  lastHealthCheckedAt: Date | null;
  reconnectCount: number;
  recentError: string | null;
  recentErrorAt: Date | null;
  maskedIdentity: string | null;
  providerPushName: string | null;
  providerPlatform: string | null;
  authorizedStaff: Array<{ id: number; name: string | null; role: string }>;
  nonProduction: true;
};

const metaMethodLabel: Record<string, { method: ConnectionMethod; label: string }> = {
  manual_cloud_api: { method: "manual_cloud_api", label: "Manual Cloud API — Advanced" },
  meta_embedded_signup: { method: "meta_embedded_signup", label: "Meta Embedded Signup" },
  meta_coexistence: { method: "meta_coexistence", label: "Meta Coexistence" },
};

function isAdmin(actor: PlatformActor) {
  return actor.role === "admin" || actor.role === "manager";
}

async function staffForLine(lineId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: users.id, name: users.name, role: users.role })
    .from(whatsappLinkedDeviceLineStaff)
    .innerJoin(users, eq(users.id, whatsappLinkedDeviceLineStaff.userId))
    .where(eq(whatsappLinkedDeviceLineStaff.lineId, lineId));
}

function safeHealth(value: string | null | undefined) {
  return value === "healthy" ? "Healthy" : value === "degraded" ? "Degraded" : value === "unavailable" ? "Unavailable" : "Unknown";
}

export function hasCurrentLinkedIdentity(lifecycleState: string | null | undefined, sessionState: string | null | undefined) {
  return lifecycleState === "connected" && sessionState === "connected";
}

export function linkedDeviceProviderStatus(adapterKind: string, lifecycleState: string) {
  if (adapterKind === "wppconnect_server") return "WPPConnect Server";
  if (adapterKind === "unselected") return "Not configured";
  if (lifecycleState === "qr_ready") return "WPPConnect sandbox ready";
  return "WPPConnect sandbox";
}

const SESSION_HEALTH_STALE_MS = 15 * 60 * 1000;

export function monitoredHealth(input: { health: string | null | undefined; lifecycle: string; lastCheckedAt: Date | null | undefined }, nowMs = Date.now()) {
  const checkedAtMs = input.lastCheckedAt?.getTime() ?? 0;
  if (input.lifecycle === "connected" && (!input.lastCheckedAt || nowMs - checkedAtMs > SESSION_HEALTH_STALE_MS)) {
    return "Stale — refresh required";
  }
  if (input.lifecycle === "qr_ready" && input.health === "unknown") return "Ready";
  return safeHealth(input.health);
}

export async function listConnectedWhatsAppNumbers(actor: PlatformActor): Promise<ConnectedNumberCard[]> {
  const db = await getDb();
  if (!db) return [];

  const [connections, lines] = await Promise.all([
    db.select().from(whatsappConnections).orderBy(desc(whatsappConnections.updatedAt)),
    db.select({
      line: whatsappLinkedDeviceLines,
      session: whatsappLinkedDeviceSessions,
    }).from(whatsappLinkedDeviceLines)
      .leftJoin(whatsappLinkedDeviceSessions, eq(whatsappLinkedDeviceSessions.lineId, whatsappLinkedDeviceLines.id))
      .where(ne(whatsappLinkedDeviceLines.lifecycleState, "disabled"))
      .orderBy(desc(whatsappLinkedDeviceLines.updatedAt)),
  ]);

  const result: ConnectedNumberCard[] = [];
  for (const connection of connections.filter((row) => row.provider === "meta")) {
    const detail = metaMethodLabel[connection.onboardingMethod] ?? { method: "meta_cloud_api" as const, label: "Meta Cloud API" };
    result.push({
      id: `connection-${connection.id}`,
      lineId: null,
      connectionId: connection.id,
      lineName: connection.displayName || connection.displayPhone || "WhatsApp connection",
      fullPhone: connection.displayPhone,
      method: detail.method,
      methodLabel: detail.label,
      provider: "meta",
      status: connection.lifecycleStatus,
      inboundHealth: safeHealth(connection.healthState),
      outboundHealth: safeHealth(connection.healthState),
      sessionHealth: safeHealth(connection.healthState),
      lastActivityAt: connection.lastInboundEventAt ?? connection.lastOutboundAcceptedAt ?? connection.lastProviderStatusAt,
      authorizedStaff: [],
      businessAccount: connection.wabaId ? `Messaging account ${connection.wabaId.slice(-6)}` : null,
      diagnosticAvailable: false,
      relinkAvailable: connection.lifecycleStatus === "needs_attention" || connection.lifecycleStatus === "disconnected",
      productionApproved: true,
      nonProductionNotice: null,
    });
  }

  for (const row of lines) {
    const allowed = await canUserAccessLinkedDeviceLine({ lineId: row.line.id, userId: actor.id, userRole: actor.role });
    if (!allowed) continue;
    const staff = await staffForLine(row.line.id);
    const session = row.session;
    const currentIdentityActive = hasCurrentLinkedIdentity(row.line.lifecycleState, session?.state);
    const lastActivityAt = session?.lastActivityAt ?? row.line.lastSuccessfulSyncAt ?? row.line.lastSeenAt;
    result.push({
      id: `line-${row.line.id}`,
      lineId: row.line.id,
      connectionId: row.line.connectionId,
      lineName: row.line.lineName,
      fullPhone: currentIdentityActive ? row.line.displayPhone : null,
      method: "linked_device",
      methodLabel: "Linked Device / QR",
      provider: "wppconnect",
      status: row.line.lifecycleState,
      inboundHealth: monitoredHealth({ health: row.line.healthState, lifecycle: row.line.lifecycleState, lastCheckedAt: session?.lastHealthCheckedAt }),
      outboundHealth: monitoredHealth({ health: row.line.healthState, lifecycle: row.line.lifecycleState, lastCheckedAt: session?.lastHealthCheckedAt }),
      sessionHealth: monitoredHealth({ health: row.line.healthState, lifecycle: row.line.lifecycleState, lastCheckedAt: session?.lastHealthCheckedAt }),
      lastActivityAt,
      authorizedStaff: staff,
      businessAccount: null,
      diagnosticAvailable: true,
      relinkAvailable: ["disconnected", "logged_out", "session_invalid", "failed"].includes(row.line.lifecycleState),
      productionApproved: false,
      nonProductionNotice: "Synthetic/test account only. WPPConnect remains non-production and is not a Meta Cloud API fallback.",
    });
  }

  return result.sort((a, b) => Number(b.lastActivityAt?.getTime() ?? 0) - Number(a.lastActivityAt?.getTime() ?? 0));
}

export async function listLinkedDeviceSessionMonitoring(actor: PlatformActor): Promise<LinkedDeviceSessionMonitorRow[]> {
  if (!isAdmin(actor)) throw new Error("Administrator access is required for session monitoring.");
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select({ line: whatsappLinkedDeviceLines, session: whatsappLinkedDeviceSessions })
    .from(whatsappLinkedDeviceLines)
    .leftJoin(whatsappLinkedDeviceSessions, eq(whatsappLinkedDeviceSessions.lineId, whatsappLinkedDeviceLines.id))
    .where(ne(whatsappLinkedDeviceLines.lifecycleState, "disabled"))
    .orderBy(desc(whatsappLinkedDeviceLines.updatedAt));
  const result: LinkedDeviceSessionMonitorRow[] = [];
  for (const row of rows) {
    const staff = await staffForLine(row.line.id);
    const currentIdentityActive = hasCurrentLinkedIdentity(row.line.lifecycleState, row.session?.state);
    result.push({
      lineId: row.line.id,
      lineName: row.line.lineName,
      sessionId: row.session?.id ?? null,
      sessionState: row.session?.state ?? "not_started",
      lifecycleState: row.line.lifecycleState,
      providerStatus: linkedDeviceProviderStatus(row.line.adapterKind, row.line.lifecycleState),
      health: monitoredHealth({ health: row.line.healthState, lifecycle: row.line.lifecycleState, lastCheckedAt: row.session?.lastHealthCheckedAt }),
      lastConnectedAt: row.line.connectedAt,
      lastActivityAt: row.session?.lastActivityAt ?? row.line.lastSuccessfulSyncAt ?? row.line.lastSeenAt,
      lastHealthCheckedAt: row.session?.lastHealthCheckedAt ?? null,
      reconnectCount: Number(row.session?.reconnectCount ?? 0),
      recentError: row.session?.lastErrorCategory ?? row.session?.failureCategory ?? null,
      recentErrorAt: row.session?.lastErrorAt ?? null,
      maskedIdentity: currentIdentityActive ? row.session?.providerAccountHint ?? row.line.displayPhone ?? null : null,
      providerPushName: currentIdentityActive ? row.session?.providerPushName ?? null : null,
      providerPlatform: currentIdentityActive ? row.session?.providerPlatform ?? null : null,
      authorizedStaff: staff,
      nonProduction: true,
    });
  }
  return result;
}

export async function refreshLinkedDeviceMonitor(lineId: number, actor: PlatformActor) {
  if (!isAdmin(actor)) throw new Error("Administrator access is required to refresh session health.");
  const status = await getWppConnectSandboxStatus({ lineId, actor: { ...actor, name: actor.name ?? null }, includeQr: false });
  await logAudit({
    userId: actor.id,
    userName: actor.name ?? null,
    userRole: actor.role,
    action: "whatsapp_linked_device_health_refresh",
    category: "other",
    recordId: lineId,
    recordType: "whatsapp_linked_device_line",
    page: "/whatsapp-sessions",
    description: `Refreshed non-production Linked Device health: ${status.lifecycleState}.`,
  });
  return status;
}

export async function getEmbeddedSignupReadiness() {
  const db = await getDb();
  if (!db) return { v4Required: true, configured: false, lastAttempt: null, blocked: ["Database unavailable"] };
  const [latest] = await db.select({
    id: whatsappEmbeddedSignupSessions.id,
    state: whatsappEmbeddedSignupSessions.state,
    currentStep: whatsappEmbeddedSignupSessions.currentStep,
    failureCategory: whatsappEmbeddedSignupSessions.failureCategory,
    createdAt: whatsappEmbeddedSignupSessions.createdAt,
  }).from(whatsappEmbeddedSignupSessions).orderBy(desc(whatsappEmbeddedSignupSessions.createdAt)).limit(1);
  const configured = Boolean(process.env.VITE_META_APP_ID && process.env.VITE_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID && process.env.WHATSAPP_APP_SECRET);
  return {
    v4Required: true,
    configured,
    lastAttempt: latest ?? null,
    blocked: configured
      ? ["Production cutover remains manual. Confirm Meta v4 partner role, Advanced Access, webhook/session logging, billing, and account eligibility before a controlled test."]
      : ["Meta App ID, Embedded Signup v4 Config ID, and server-side App Secret must be configured before test launch."],
  };
}

export async function acknowledgeCoexistenceResearch(actor: PlatformActor) {
  if (!isAdmin(actor)) throw new Error("Administrator access is required.");
  await logAudit({
    userId: actor.id,
    userName: actor.name ?? null,
    userRole: actor.role,
    action: "whatsapp_coexistence_research_acknowledged",
    category: "other",
    recordId: null,
    recordType: "whatsapp_connection",
    page: "/whatsapp-connections",
    description: "Reviewed Meta Coexistence prerequisites. No onboarding, routing, session, or production number was changed.",
  });
  return { ok: true };
}

export async function countStoredConnectionCredentials() {
  const db = await getDb();
  if (!db) return 0;
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(whatsappConnectionCredentials);
  return Number(row?.count ?? 0);
}
