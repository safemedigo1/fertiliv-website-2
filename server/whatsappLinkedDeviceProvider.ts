import { createHash } from "crypto";
import { normalizeInboxDirectPhone, UNIFIED_INBOX_MEDIA_MAX_BASE64_LENGTH, UNIFIED_INBOX_MEDIA_LIMIT_MESSAGE, UNIFIED_INBOX_TEXT_LIMIT, UNIFIED_INBOX_TEXT_LIMIT_MESSAGE, type UnifiedInboxDirectSendFailureCategory } from "../shared/unifiedInbox";
import type { LinkedDeviceRuntimeBinding } from "./linkedDeviceRuntime";

/**
 * Linked Device adapters describe an engine boundary only. Production traffic
 * remains disabled. The sandbox status bridge talks to a separately running,
 * synthetic-only diagnostic harness and never persists QR/session material.
 */
export type LinkedDeviceProviderKind = "wppconnect";

export type WppConnectInboundSourceKind =
  | "private_chat"
  | "status"
  | "broadcast"
  | "group"
  | "channel"
  | "system"
  | "unknown_non_private";

export type LinkedDeviceProviderEvent = {
  providerMessageId: string;
  senderEndpointId: string;
  // A provider identity such as a WhatsApp LID is retained as transport
  // evidence. It does not identify or link a CRM person on its own.
  providerIdentityId?: string;
  lineProviderId: string;
  timestamp: Date;
  text: string;
  media?: {
    providerMediaId?: string | null;
    mediaType: "image" | "audio" | "video" | "document" | "sticker";
    mimeType: string;
    filename?: string | null;
    sha256?: string | null;
    caption?: string | null;
  };
  /** Optional server-side media bytes passed only into canonical custody. */
  mediaBase64?: string;
  /** @deprecated Historical isolated harness compatibility only. */
  syntheticMediaBase64?: string;
  // Required for inbound provider events at the signed ingress boundary.
  // Outbound synthetic echoes may omit it because their source is created by
  // Fertiliv itself and never comes from a WPPConnect inbound callback.
  sourceKind?: WppConnectInboundSourceKind;
  direction?: "inbound" | "outbound";
  /**
   * The existing isolated harness sets this marker. WPPConnect Server events
   * use `origin: "wppconnect_server"` and follow the same canonical path.
   */
  synthetic?: true;
  origin?: "sandbox" | "wppconnect_server";
};

export type WppConnectSandboxOutboundResult = {
  providerMessageId: string;
  timestamp: Date;
  messageType: string;
  peerIdentityId: string | null;
  replayed: boolean;
  correlationId?: string | null;
};

export type WppConnectSandboxDiagnostic = {
  stage: "readiness_probe" | "provider_send" | "recipient_approval" | "worker_response_contract";
  probe: string;
  outcome: string;
  timestamp: string;
  correlationId?: string | null;
  outboundAttemptId?: number | null;
  approvalReason?: string | null;
  lineId?: number | null;
  sessionName?: string | null;
  runtimeMode?: "sandbox" | "persistent_worker" | null;
  gateValue?: boolean | null;
  secretSelector?: "jwt_secret" | "persistent_worker_approval_secret" | null;
};

export type WppConnectRuntimeSelection = {
  slot: string;
  endpointHost: string;
  runtimeMode: "sandbox" | "persistent_worker";
  gateValue: boolean;
  secretSelector: "jwt_secret" | "persistent_worker_approval_secret";
  sessionId: string | null;
  sessionName: string | null;
  runtimeGeneration: string | null;
};

export const WORKER_CONTRACT_VERSION = "wppconnect-worker-contract-v1";
export const OUTBOUND_DIAGNOSTICS_VERSION = "wppconnect-outbound-diagnostics-v1";

const WORKER_RESPONSE_ERROR_CODES = new Set([
  "worker_request_rejected",
  "wpp_worker_allocation_unbound",
  "wpp_probe_timeout",
  "wpp_probe_not_ready",
  "wpp_send_rejected_before_provider_id",
  "wpp_send_uncertain_after_provider_call",
  "wpp_recipient_proof_rejected",
]);

const WORKER_RESPONSE_STAGES = new Set([
  "request_validation",
  "readiness_probe",
  "recipient_approval",
  "provider_send",
  "idempotency_replay",
]);

export type WppConnectApprovalRejectionReason =
  | "missing"
  | "malformed"
  | "signature_mismatch"
  | "expired"
  | "recipient_mismatch"
  | "line_mismatch"
  | "session_mismatch"
  | "scope_mismatch"
  | "unsupported_version"
  | "other_safe_rejection";

const APPROVAL_REASON_DIAGNOSTIC_CODES: Record<WppConnectApprovalRejectionReason, string> = {
  missing: "approval_proof_missing",
  malformed: "approval_proof_malformed",
  signature_mismatch: "approval_proof_signature_invalid",
  expired: "approval_proof_expired",
  recipient_mismatch: "approval_proof_recipient_mismatch",
  line_mismatch: "approval_proof_line_mismatch",
  session_mismatch: "approval_proof_session_mismatch",
  scope_mismatch: "approval_proof_scope_mismatch",
  unsupported_version: "approval_proof_version_mismatch",
  other_safe_rejection: "approval_proof_rejected",
};

function safeCorrelationId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{8,128}$/.test(value.trim()) ? value.trim() : null;
}

const APPROVAL_REASON_CODES = new Set([
  "approval_proof_missing",
  "approval_proof_malformed",
  "approval_proof_signature_invalid",
  "approval_proof_expired",
  "approval_proof_recipient_mismatch",
  "approval_proof_line_mismatch",
  "approval_proof_session_mismatch",
  "approval_proof_scope_mismatch",
  "approval_proof_version_mismatch",
  "approval_proof_rejected",
]);

function safeApprovalReasonCode(value: unknown) {
  return typeof value === "string" && APPROVAL_REASON_CODES.has(value) ? value : null;
}

function safeWorkerLineId(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function safeWorkerLineProviderId(value: unknown) {
  if (typeof value !== "string") return null;
  const candidate = value.trim();
  return /^[A-Za-z0-9._:-]{1,128}$/.test(candidate) ? candidate : null;
}

function safeWorkerSessionId(value: unknown) {
  const candidate = typeof value === "number" && Number.isInteger(value)
    ? String(value)
    : typeof value === "string" ? value.trim() : "";
  return /^[1-9][0-9]{0,18}$/.test(candidate) ? candidate : null;
}

function safeWorkerRuntimeGeneration(value: unknown) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9._-]{8,64}$/.test(candidate) ? candidate : null;
}

export class WppConnectSandboxError extends Error {
  readonly category: UnifiedInboxDirectSendFailureCategory;
  readonly diagnostic?: WppConnectSandboxDiagnostic;

  constructor(category: UnifiedInboxDirectSendFailureCategory, message: string, diagnostic?: WppConnectSandboxDiagnostic) {
    super(message);
    this.name = "WppConnectSandboxError";
    this.category = category;
    this.diagnostic = diagnostic;
  }
}

export type WppConnectSandboxIdentity = {
  accountHint: string | null;
  pushname: string | null;
  platform: string | null;
};

export type WppConnectSandboxStatus = {
  enabled: boolean;
  available: boolean;
  baseUrl: string | null;
  workerLineId: number | null;
  workerLineProviderId: string | null;
  workerSessionId: string | null;
  runtimeGeneration: string | null;
  phase: string;
  status: string;
  connectionState: string | null;
  outboundReady: boolean;
  sessionName: string | null;
  qrAvailable: boolean;
  qrDataUrl: string | null;
  qrUpdatedAt: string | null;
  identity: WppConnectSandboxIdentity | null;
  lastActivityAt: string | null;
  lastInbound: { id: string | null; timestamp: number | null; type: string | null; fromMe: boolean; hasBody: boolean; hasMedia: boolean; isGroup: boolean; participantHint: string | null } | null;
  lastOutbound: { id: string | null; timestamp: number | null; type: string | null; fromMe: boolean; hasBody: boolean; hasMedia: boolean; isGroup: boolean; participantHint: string | null } | null;
  error: string | null;
};

export type WppConnectSandboxTarget = "diagnostic" | "inapp";

type SandboxRawState = {
  lineId?: number | null;
  lineProviderId?: string | null;
  sessionId?: string | number | null;
  runtimeGeneration?: string | null;
  sessionName?: string;
  phase?: string;
  status?: string;
  connectionState?: string | null;
  outboundReady?: boolean;
  qrDataUrl?: string | null;
  qrUpdatedAt?: string | null;
  identity?: WppConnectSandboxIdentity | null;
  lastInbound?: WppConnectSandboxStatus["lastInbound"];
  lastOutbound?: WppConnectSandboxStatus["lastOutbound"];
  events?: Array<{ at?: string }>;
  error?: string | null;
};

type SandboxOutboundResponse = {
  ok?: boolean;
  workerContractVersion?: string;
  outboundDiagnosticsVersion?: string;
  correlationId?: string | null;
  outboundAttemptId?: number | null;
  stage?: string;
  outcome?: string;
  message?: { id?: string | null; timestamp?: number | null; type?: string | null; peerIdentityId?: string | null } | null;
  replayed?: boolean;
  error?: string;
  errorCode?: string;
  rejectionReason?: WppConnectApprovalRejectionReason;
  approvalReason?: string;
  diagnostic?: Partial<WppConnectSandboxDiagnostic>;
};

export type LinkedDeviceProviderAdapter = {
  kind: LinkedDeviceProviderKind;
  transportClassification: "unofficial_whatsapp_web_puppeteer";
  productionApproved: false;
  isSandboxIngressEnabled(): boolean;
  isSandboxUiEnabled(): boolean;
  isSandboxComposerEnabled(): boolean;
  getSandboxStatus(options?: { includeQr?: boolean; target?: WppConnectSandboxTarget; runtime?: LinkedDeviceRuntimeBinding }): Promise<WppConnectSandboxStatus>;
  logoutSandbox(input?: { target?: WppConnectSandboxTarget; runtime?: LinkedDeviceRuntimeBinding }): Promise<{ ok: true }>;
  sendSandboxText(input: { text: string; recipient?: string; approvalProof?: string; idempotencyKey?: string; intentDigest?: string; correlationId?: string; outboundAttemptId?: number; target?: WppConnectSandboxTarget; runtime?: LinkedDeviceRuntimeBinding }): Promise<WppConnectSandboxOutboundResult>;
  sendSandboxMedia(input: { fileBase64: string; mimeType: string; filename: string; caption?: string; recipient?: string; approvalProof?: string; idempotencyKey?: string; intentDigest?: string; correlationId?: string; outboundAttemptId?: number; target?: WppConnectSandboxTarget; runtime?: LinkedDeviceRuntimeBinding }): Promise<WppConnectSandboxOutboundResult>;
  toNormalizedSandboxValue(event: LinkedDeviceProviderEvent): Record<string, unknown>;
  eventKey(lineId: number, event: LinkedDeviceProviderEvent): string;
};

function requireBounded(value: string, label: string, max = 128) {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) throw new Error(`Synthetic WPPConnect ${label} is invalid.`);
  return normalized;
}

function providerTimestamp(timestamp: Date) {
  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
    throw new Error("Synthetic WPPConnect timestamp is invalid.");
  }
  return Math.floor(timestamp.getTime() / 1000);
}

function sandboxBaseUrl(target: WppConnectSandboxTarget = "diagnostic", runtime?: LinkedDeviceRuntimeBinding) {
  if (target === "inapp" && runtime) return runtime.endpointUrl;
  const persistentWorkerEnabled = process.env.WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED === "true";
  const configured = target === "inapp" && persistentWorkerEnabled
    ? process.env.WHATSAPP_LINKED_DEVICE_WORKER_URL
    : target === "inapp"
      ? process.env.WHATSAPP_LINKED_DEVICE_INAPP_SANDBOX_URL
      : process.env.WHATSAPP_LINKED_DEVICE_SANDBOX_URL;
  if (target === "inapp" && persistentWorkerEnabled && !configured) {
    throw new Error("The persistent Linked Device worker URL is not configured.");
  }
  return (configured ?? (target === "inapp" ? "http://127.0.0.1:8899" : "http://127.0.0.1:8787")).replace(/\/$/, "");
}

export function getWppConnectRuntimeSelection(target: WppConnectSandboxTarget = "inapp", runtime?: LinkedDeviceRuntimeBinding): WppConnectRuntimeSelection {
  const gateValue = target === "inapp" && (runtime?.mode === "persistent_worker" || process.env.WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED === "true");
  const baseUrl = sandboxBaseUrl(target, runtime);
  let endpointHost = "invalid_endpoint";
  try {
    endpointHost = new URL(baseUrl).host || endpointHost;
  } catch {
    // Do not expose a malformed endpoint value in diagnostics.
  }
  return {
    slot: runtime?.slot ?? "linked-device-default",
    endpointHost,
    runtimeMode: gateValue ? "persistent_worker" : "sandbox",
    gateValue,
    secretSelector: gateValue ? "persistent_worker_approval_secret" : "jwt_secret",
    sessionId: runtime?.sessionId ?? null,
    sessionName: runtime?.sessionName ?? null,
    runtimeGeneration: runtime?.generation ?? null,
  };
}

function workerAuthorizationHeaders(target: WppConnectSandboxTarget, runtime?: LinkedDeviceRuntimeBinding): Record<string, string> {
  const persistentWorkerEnabled = target === "inapp" && (runtime?.mode === "persistent_worker" || process.env.WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED === "true");
  const secret = process.env.WHATSAPP_LINKED_DEVICE_WORKER_API_SECRET?.trim() ?? "";
  if (persistentWorkerEnabled && secret.length < 32) {
    throw new Error("The persistent Linked Device worker authentication is not configured.");
  }
  return persistentWorkerEnabled && secret ? { authorization: `Bearer ${secret}` } : {};
}

function safeActivityDate(message: SandboxRawState["lastInbound"] | SandboxRawState["lastOutbound"]) {
  if (!message?.timestamp || !Number.isFinite(message.timestamp)) return null;
  const value = new Date(message.timestamp * 1000);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

function safeSandboxDiagnostic(value: unknown): WppConnectSandboxDiagnostic | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const stage = record.stage === "readiness_probe" || record.stage === "provider_send" || record.stage === "recipient_approval" ? record.stage : null;
  const probe = typeof record.probe === "string" ? record.probe.trim().slice(0, 64) : "";
  const outcome = typeof record.outcome === "string" ? record.outcome.trim().slice(0, 96) : "";
  const timestamp = typeof record.timestamp === "string" && !Number.isNaN(Date.parse(record.timestamp))
    ? new Date(record.timestamp).toISOString()
    : "";
  if (!stage || !probe || !outcome || !timestamp) return undefined;
  const correlationId = safeCorrelationId(record.correlationId);
  const outboundAttemptId = Number.isInteger(record.outboundAttemptId) && Number(record.outboundAttemptId) > 0 ? Number(record.outboundAttemptId) : null;
  const approvalReason = safeApprovalReasonCode(record.approvalReason);
  const lineId = Number.isInteger(record.lineId) && Number(record.lineId) > 0 ? Number(record.lineId) : null;
  const sessionName = typeof record.sessionName === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(record.sessionName) ? record.sessionName : null;
  const runtimeMode = record.runtimeMode === "sandbox" || record.runtimeMode === "persistent_worker" ? record.runtimeMode : null;
  const gateValue = typeof record.gateValue === "boolean" ? record.gateValue : null;
  const secretSelector = record.secretSelector === "jwt_secret" || record.secretSelector === "persistent_worker_approval_secret" ? record.secretSelector : null;
  return {
    stage,
    probe,
    outcome,
    timestamp,
    ...(correlationId ? { correlationId } : {}),
    ...(outboundAttemptId ? { outboundAttemptId } : {}),
    ...(approvalReason ? { approvalReason } : {}),
    ...(lineId ? { lineId } : {}),
    ...(sessionName ? { sessionName } : {}),
    ...(runtimeMode ? { runtimeMode } : {}),
    ...(gateValue !== null ? { gateValue } : {}),
    ...(secretSelector ? { secretSelector } : {}),
  };
}

async function fetchSandboxState(baseUrl: string, target: WppConnectSandboxTarget, runtime?: LinkedDeviceRuntimeBinding): Promise<SandboxRawState> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${baseUrl}/state`, {
      headers: { accept: "application/json", ...workerAuthorizationHeaders(target, runtime) },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("sandbox_state_unavailable");
    return await response.json() as SandboxRawState;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSandboxQr(baseUrl: string, target: WppConnectSandboxTarget, runtime?: LinkedDeviceRuntimeBinding) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${baseUrl}/qr.png?v=${Date.now()}`, {
      headers: { accept: "image/png", ...workerAuthorizationHeaders(target, runtime) },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 32 || bytes.readUInt32BE(0) !== 0x89504e47) return null;
    return `data:image/png;base64,${bytes.toString("base64")}`;
  } finally {
    clearTimeout(timeout);
  }
}

function workerResponseContractMismatch(): WppConnectSandboxError {
  return new WppConnectSandboxError(
    "worker_response_contract_mismatch",
    "Message not sent. The WhatsApp worker response could not be verified.",
    {
      stage: "worker_response_contract",
      probe: "validate_response",
      outcome: "mismatch",
      timestamp: new Date().toISOString(),
    },
  );
}

function validateWorkerResponseContract(
  payload: SandboxOutboundResponse,
  expectedCorrelationId?: string,
  expectedAttemptId?: number,
) {
  const correlationId = safeCorrelationId(payload.correlationId);
  const outboundAttemptId = Number.isInteger(payload.outboundAttemptId) && Number(payload.outboundAttemptId) > 0
    ? Number(payload.outboundAttemptId)
    : null;
  const expectedCorrelation = safeCorrelationId(expectedCorrelationId);
  const expectedAttempt = Number.isInteger(expectedAttemptId) && Number(expectedAttemptId) > 0 ? Number(expectedAttemptId) : null;
  if (
    payload.workerContractVersion !== WORKER_CONTRACT_VERSION
    || payload.outboundDiagnosticsVersion !== OUTBOUND_DIAGNOSTICS_VERSION
    || !("correlationId" in payload)
    || !("outboundAttemptId" in payload)
    || correlationId !== expectedCorrelation
    || outboundAttemptId !== expectedAttempt
    || typeof payload.stage !== "string"
    || !WORKER_RESPONSE_STAGES.has(payload.stage)
    || typeof payload.outcome !== "string"
    || !payload.outcome.trim()
  ) {
    throw workerResponseContractMismatch();
  }

  const isSuccess = payload.ok === true;
  if (isSuccess) {
    if (payload.errorCode || !["provider_send", "idempotency_replay"].includes(payload.stage) || !["accepted", "replayed"].includes(payload.outcome)) {
      throw workerResponseContractMismatch();
    }
  } else {
    if (!payload.errorCode || !WORKER_RESPONSE_ERROR_CODES.has(payload.errorCode)) throw workerResponseContractMismatch();
    const expectedStage = payload.errorCode === "wpp_recipient_proof_rejected"
      ? "recipient_approval"
      : payload.errorCode === "wpp_probe_timeout" || payload.errorCode === "wpp_probe_not_ready"
        ? "readiness_probe"
        : payload.errorCode === "wpp_worker_allocation_unbound"
          ? "readiness_probe"
        : payload.errorCode === "worker_request_rejected"
          ? "request_validation"
          : "provider_send";
    const validOutcomes: Record<string, string[]> = {
      worker_request_rejected: ["rejected"],
      wpp_probe_timeout: ["timeout"],
      wpp_probe_not_ready: ["not_ready", "exception"],
      wpp_worker_allocation_unbound: ["unbound"],
      wpp_send_rejected_before_provider_id: ["rejected_before_provider_id"],
      wpp_send_uncertain_after_provider_call: ["exception", "missing_provider_timestamp", "transport_error"],
      wpp_recipient_proof_rejected: ["rejected"],
    };
    if (payload.stage !== expectedStage || !validOutcomes[payload.errorCode]?.includes(payload.outcome)) {
      throw workerResponseContractMismatch();
    }
    if (payload.errorCode === "wpp_recipient_proof_rejected" && !safeApprovalReasonCode(payload.approvalReason)) {
      throw workerResponseContractMismatch();
    }
    if (payload.errorCode !== "wpp_recipient_proof_rejected" && payload.approvalReason) throw workerResponseContractMismatch();
  }
  return {
    correlationId,
    outboundAttemptId,
    diagnostic: safeSandboxDiagnostic({
      ...(payload.diagnostic ?? {}),
      correlationId,
      outboundAttemptId,
    }),
  };
}

async function sendSandboxRequest(
  path: string,
  body?: Record<string, unknown>,
  target: WppConnectSandboxTarget = "inapp",
  timeoutMs = 7000,
  correlationId?: string,
  outboundAttemptId?: number,
  runtime?: LinkedDeviceRuntimeBinding,
): Promise<WppConnectSandboxOutboundResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetch(`${sandboxBaseUrl(target, runtime)}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", ...workerAuthorizationHeaders(target, runtime) },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: controller.signal,
      });
    } catch {
      // A network failure can happen after the harness accepted the request.
      // Callers must reconcile the durable idempotency key, not auto-resend.
      throw new WppConnectSandboxError(
        "wpp_send_uncertain_after_provider_call",
        "The provider send result is uncertain. Do not send the same message again yet.",
        {
          stage: "provider_send",
          probe: path === "/send-synthetic-media" ? "sendFile" : "sendText",
          outcome: "transport_error",
          timestamp: new Date().toISOString(),
        },
      );
    }
    const payload = await response.json().catch(() => ({})) as SandboxOutboundResponse;
    const contract = validateWorkerResponseContract(payload, correlationId, outboundAttemptId);
    if (!response.ok || payload.ok !== true || !payload.message?.id || !payload.message.timestamp) {
      const diagnostic = contract.diagnostic;
      switch (payload.errorCode) {
        case "wpp_probe_timeout":
          throw new WppConnectSandboxError("wpp_probe_timeout", "The synthetic test line readiness check timed out. No provider send was submitted.", diagnostic);
        case "wpp_probe_not_ready":
          throw new WppConnectSandboxError("wpp_probe_not_ready", "The synthetic test line was not ready. No provider send was submitted.", diagnostic);
        case "wpp_worker_allocation_unbound":
          throw new WppConnectSandboxError("session_unavailable", "The connected WhatsApp worker could not be verified for this line. No provider send was submitted.", diagnostic);
        case "wpp_send_rejected_before_provider_id":
          throw new WppConnectSandboxError("wpp_send_rejected_before_provider_id", "The provider rejected this message before issuing a message ID. It was not accepted.", diagnostic);
        case "wpp_send_uncertain_after_provider_call":
          throw new WppConnectSandboxError("wpp_send_uncertain_after_provider_call", "The provider send result is uncertain. Do not send the same message again yet.", diagnostic);
        case "wpp_recipient_proof_rejected": {
          const approvalReason = safeApprovalReasonCode(payload.approvalReason);
          if (!approvalReason) throw workerResponseContractMismatch();
          throw new WppConnectSandboxError(
            "wpp_recipient_proof_rejected",
            "Message not sent. Recipient authorization could not be verified.",
            safeSandboxDiagnostic({
              ...(diagnostic ?? {}),
              stage: "recipient_approval",
              probe: approvalReason,
              outcome: "rejected",
              timestamp: diagnostic?.timestamp ?? new Date().toISOString(),
              approvalReason,
              correlationId: contract.correlationId,
              outboundAttemptId: contract.outboundAttemptId,
            }),
          );
        }
        default:
          throw workerResponseContractMismatch();
      }
    }
    const timestamp = new Date(payload.message.timestamp * 1000);
    if (Number.isNaN(timestamp.getTime())) {
      throw new WppConnectSandboxError("provider_temporarily_unavailable", "The synthetic WhatsApp provider returned an invalid response. Try again in a moment.");
    }
    return {
      providerMessageId: requireBounded(payload.message.id, "outbound message ID"),
      timestamp,
      messageType: requireBounded(payload.message.type || "chat", "outbound message type", 64),
      peerIdentityId: payload.message.peerIdentityId
        ? requireBounded(payload.message.peerIdentityId, "outbound peer identity")
        : null,
      replayed: payload.replayed === true,
      correlationId: contract.correlationId,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function logoutSandboxRequest(target: WppConnectSandboxTarget = "inapp", runtime?: LinkedDeviceRuntimeBinding): Promise<{ ok: true }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7_000);
  try {
    const response = await fetch(`${sandboxBaseUrl(target, runtime)}/logout`, {
      method: "POST",
      headers: { accept: "application/json", ...workerAuthorizationHeaders(target, runtime) },
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean };
    if (!response.ok || payload.ok !== true) {
      throw new WppConnectSandboxError("session_unavailable", "The synthetic WhatsApp session could not be disconnected. Try again from administrator settings.");
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof WppConnectSandboxError) throw error;
    throw new WppConnectSandboxError("session_unavailable", "The synthetic WhatsApp session could not be reached. Try again from administrator settings.");
  } finally {
    clearTimeout(timeout);
  }
}

async function readSandboxStatus(includeQr: boolean, target: WppConnectSandboxTarget, runtime?: LinkedDeviceRuntimeBinding): Promise<WppConnectSandboxStatus> {
  const baseUrl = sandboxBaseUrl(target, runtime);
  try {
    const raw = await fetchSandboxState(baseUrl, target, runtime);
    const inboundAt = safeActivityDate(raw.lastInbound);
    const outboundAt = safeActivityDate(raw.lastOutbound);
    const eventActivityAt = (raw.events ?? [])
      .map((event) => event.at)
      .filter((value): value is string => Boolean(value && !Number.isNaN(Date.parse(value))))
      .sort()
      .at(-1) ?? null;
    const activityValues = [inboundAt, outboundAt, eventActivityAt].filter((value): value is string => Boolean(value)).sort();
    const lastActivityAt = activityValues.at(-1) ?? null;
    const qrDataUrl = includeQr && raw.status === "QR_READY" && raw.qrDataUrl ? await fetchSandboxQr(baseUrl, target, runtime) : null;
    return {
      enabled: true,
      available: true,
      baseUrl: null,
      workerLineId: safeWorkerLineId(raw.lineId),
      workerLineProviderId: safeWorkerLineProviderId(raw.lineProviderId),
      workerSessionId: safeWorkerSessionId(raw.sessionId),
      runtimeGeneration: safeWorkerRuntimeGeneration(raw.runtimeGeneration),
      phase: raw.phase ?? "unknown",
      status: raw.status ?? "UNKNOWN",
      connectionState: raw.connectionState ?? null,
      outboundReady: raw.outboundReady === true,
      sessionName: raw.sessionName ?? null,
      qrAvailable: Boolean(raw.qrDataUrl && raw.status === "QR_READY" && (includeQr ? qrDataUrl : true)),
      qrDataUrl,
      qrUpdatedAt: raw.qrUpdatedAt ?? null,
      identity: raw.identity ? {
        accountHint: raw.identity.accountHint ?? null,
        pushname: raw.identity.pushname ?? null,
        platform: raw.identity.platform ?? null,
      } : null,
      lastActivityAt,
      lastInbound: raw.lastInbound ?? null,
      lastOutbound: raw.lastOutbound ?? null,
      error: raw.error ?? null,
    };
  } catch {
    return {
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
      error: "The non-production WPPConnect sandbox is unavailable. Start the approved diagnostic harness and try again.",
    };
  }
}

export const wppConnectSandboxAdapter: LinkedDeviceProviderAdapter = {
  kind: "wppconnect",
  transportClassification: "unofficial_whatsapp_web_puppeteer",
  productionApproved: false,
  isSandboxIngressEnabled() {
    return process.env.WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_ADAPTER === "true";
  },
  isSandboxUiEnabled() {
    // The Settings test flow is explicitly enabled by a separate flag. This
    // may be enabled in a hosted runtime for a synthetic account, while the
    // production approval and message-ingress gates remain independently off.
    return process.env.WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI === "true";
  },
  isSandboxComposerEnabled() {
    return this.isSandboxUiEnabled()
      && process.env.WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER === "true";
  },
  getSandboxStatus(options = {}) {
    if (!this.isSandboxUiEnabled()) {
      return Promise.resolve({
        enabled: false,
        available: false,
        baseUrl: null,
        workerLineId: null,
        workerLineProviderId: null,
        workerSessionId: null,
        runtimeGeneration: null,
        phase: "disabled",
        status: "DISABLED",
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
        error: "The non-production WPPConnect Settings flow is disabled by the environment flag.",
      });
    }
    return readSandboxStatus(Boolean(options.includeQr), options.target ?? "diagnostic", options.runtime);
  },
  logoutSandbox(input = {}) {
    if (!this.isSandboxUiEnabled()) {
      return Promise.reject(new WppConnectSandboxError("feature_disabled", "The non-production Linked Device control is disabled."));
    }
    return logoutSandboxRequest(input.target ?? "inapp", input.runtime);
  },
  async sendSandboxText(input) {
    if (!this.isSandboxComposerEnabled()) {
      throw new WppConnectSandboxError("feature_disabled", "The non-production synthetic WhatsApp composer is disabled.");
    }
    const text = input.text.trim();
    if (!text) throw new Error("Enter a message before sending.");
    if (text.length > UNIFIED_INBOX_TEXT_LIMIT) throw new Error(UNIFIED_INBOX_TEXT_LIMIT_MESSAGE);
    const target = input.target ?? "inapp";
    const recipient = input.recipient ? normalizeInboxDirectPhone(input.recipient) : null;
    if (!recipient) {
      throw new WppConnectSandboxError("recipient_invalid", "Choose the explicitly approved private test recipient before sending.");
    }
    if (target !== "inapp") {
      throw new WppConnectSandboxError("sending_line_unavailable", "Direct recipient messaging is available only on the connected in-app synthetic test line.");
    }
    if (typeof input.approvalProof !== "string" || !input.approvalProof) {
      throw new WppConnectSandboxError(
        "wpp_recipient_proof_rejected",
        "Message not sent. Recipient authorization could not be verified.",
        {
          stage: "recipient_approval",
          probe: APPROVAL_REASON_DIAGNOSTIC_CODES.missing,
          outcome: "rejected",
          timestamp: new Date().toISOString(),
          correlationId: safeCorrelationId(input.correlationId),
          outboundAttemptId: input.outboundAttemptId ?? null,
          approvalReason: APPROVAL_REASON_DIAGNOSTIC_CODES.missing,
        },
      );
    }
    if (input.approvalProof.length > 1024) {
      throw new WppConnectSandboxError(
        "wpp_recipient_proof_rejected",
        "Message not sent. Recipient authorization could not be verified.",
        {
          stage: "recipient_approval",
          probe: APPROVAL_REASON_DIAGNOSTIC_CODES.malformed,
          outcome: "rejected",
          timestamp: new Date().toISOString(),
          correlationId: safeCorrelationId(input.correlationId),
          outboundAttemptId: input.outboundAttemptId ?? null,
          approvalReason: APPROVAL_REASON_DIAGNOSTIC_CODES.malformed,
        },
      );
    }
    return sendSandboxRequest("/send-synthetic-text", {
      text,
      ...(recipient ? { recipient: recipient.replace(/^\+/, "") } : {}),
      ...(recipient ? { approvalProof: input.approvalProof } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(input.intentDigest ? { intentDigest: input.intentDigest } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.outboundAttemptId ? { outboundAttemptId: input.outboundAttemptId } : {}),
    }, target, 7000, input.correlationId, input.outboundAttemptId, input.runtime);
  },
  async sendSandboxMedia(input) {
    if (!this.isSandboxComposerEnabled()) {
      throw new WppConnectSandboxError("feature_disabled", "The non-production synthetic WhatsApp composer is disabled.");
    }
    const fileBase64 = input.fileBase64.replace(/^data:[^,]+,/, "").replace(/\s+/g, "");
    if (!fileBase64 || fileBase64.length > UNIFIED_INBOX_MEDIA_MAX_BASE64_LENGTH) {
      throw new WppConnectSandboxError("provider_temporarily_unavailable", UNIFIED_INBOX_MEDIA_LIMIT_MESSAGE);
    }
    if (!input.mimeType.trim() || !input.filename.trim()) {
      throw new WppConnectSandboxError("recipient_invalid", "Choose a valid attachment before sending.");
    }
    const caption = input.caption?.trim() ?? "";
    if (caption.length > UNIFIED_INBOX_TEXT_LIMIT) throw new WppConnectSandboxError("recipient_invalid", UNIFIED_INBOX_TEXT_LIMIT_MESSAGE);
    const target = input.target ?? "inapp";
    const recipient = input.recipient ? normalizeInboxDirectPhone(input.recipient) : null;
    if (!recipient) throw new WppConnectSandboxError("recipient_invalid", "Choose the explicitly approved private test recipient before sending.");
    if (target !== "inapp") throw new WppConnectSandboxError("sending_line_unavailable", "Direct recipient messaging is available only on the connected in-app synthetic test line.");
    if (typeof input.approvalProof !== "string" || !input.approvalProof) {
      throw new WppConnectSandboxError(
        "wpp_recipient_proof_rejected",
        "Message not sent. Recipient authorization could not be verified.",
        {
          stage: "recipient_approval",
          probe: APPROVAL_REASON_DIAGNOSTIC_CODES.missing,
          outcome: "rejected",
          timestamp: new Date().toISOString(),
          correlationId: safeCorrelationId(input.correlationId),
          outboundAttemptId: input.outboundAttemptId ?? null,
          approvalReason: APPROVAL_REASON_DIAGNOSTIC_CODES.missing,
        },
      );
    }
    if (input.approvalProof.length > 1024) {
      throw new WppConnectSandboxError(
        "wpp_recipient_proof_rejected",
        "Message not sent. Recipient authorization could not be verified.",
        {
          stage: "recipient_approval",
          probe: APPROVAL_REASON_DIAGNOSTIC_CODES.malformed,
          outcome: "rejected",
          timestamp: new Date().toISOString(),
          correlationId: safeCorrelationId(input.correlationId),
          outboundAttemptId: input.outboundAttemptId ?? null,
          approvalReason: APPROVAL_REASON_DIAGNOSTIC_CODES.malformed,
        },
      );
    }
    return sendSandboxRequest("/send-synthetic-media", {
      fileBase64,
      mimeType: input.mimeType.trim().toLowerCase(),
      filename: input.filename.trim(),
      caption,
      ...(recipient ? { recipient: recipient.replace(/^\+/, ""), approvalProof: input.approvalProof } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      ...(input.intentDigest ? { intentDigest: input.intentDigest } : {}),
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...(input.outboundAttemptId ? { outboundAttemptId: input.outboundAttemptId } : {}),
    }, target, 30_000, input.correlationId, input.outboundAttemptId, input.runtime);
  },
  toNormalizedSandboxValue(event) {
    const providerMessageId = requireBounded(event.providerMessageId, "message ID");
    const senderEndpointId = requireBounded(event.senderEndpointId, "sender endpoint");
    const providerIdentityId = event.providerIdentityId
      ? requireBounded(event.providerIdentityId, "peer identity")
      : null;
    const lineProviderId = requireBounded(event.lineProviderId, "line identity");
    const text = event.text.trim();
    if (!text && !event.media) throw new Error("Synthetic WPPConnect message must contain text or media.");
    if (text.length > UNIFIED_INBOX_TEXT_LIMIT) throw new Error(UNIFIED_INBOX_TEXT_LIMIT_MESSAGE);
    const media = event.media ? {
      id: event.media.providerMediaId
        ? requireBounded(event.media.providerMediaId, "media ID")
        : `${providerMessageId}:media`,
      mime_type: requireBounded(event.media.mimeType, "media MIME type", 128),
      filename: event.media.filename ? requireBounded(event.media.filename, "media filename", 256) : null,
      sha256: event.media.sha256 ? requireBounded(event.media.sha256, "media digest", 128) : null,
      caption: event.media.caption ? requireBounded(event.media.caption, "media caption", UNIFIED_INBOX_TEXT_LIMIT) : null,
    } : null;
    const messageType = event.media?.mediaType ?? "text";
    return {
      messages: [{
        id: providerMessageId,
        // WU-07 keys private conversations by remote endpoint. Keep that
        // endpoint in `from` for synthetic outbound echoes, and convey the
        // actual direction through the isolated synthetic marker below.
        from: senderEndpointId,
        to: lineProviderId,
        ...(providerIdentityId ? { wppconnect_provider_identity: providerIdentityId } : {}),
        ...(event.sourceKind ? { wppconnect_source_kind: event.sourceKind } : {}),
        ...(event.direction === "outbound" ? { wppconnect_synthetic_direction: "outbound_echo" } : {}),
        timestamp: providerTimestamp(event.timestamp),
        type: messageType,
        ...(messageType === "text" ? { text: { body: text } } : { [messageType]: media }),
        identity: { name: "Synthetic test sender" },
      }],
      contacts: [{ wa_id: senderEndpointId, profile: { name: "Synthetic test sender" } }],
    };
  },
  eventKey(lineId, event) {
    if (!Number.isInteger(lineId) || lineId <= 0) throw new Error("Synthetic WPPConnect line is invalid.");
    const messageId = requireBounded(event.providerMessageId, "message ID");
    return createHash("sha256").update(`wppconnect:sandbox:${lineId}:${messageId}`).digest("hex");
  },
};
