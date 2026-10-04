import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  normalizeInboxDirectPhone,
  UNIFIED_INBOX_MEDIA_MAX_BASE64_LENGTH,
  UNIFIED_INBOX_TEXT_LIMIT,
  UNIFIED_INBOX_TEXT_LIMIT_MESSAGE,
} from "../shared/unifiedInbox";
import { and, eq } from "drizzle-orm";
import {
  whatsappLinkedDeviceCredentials,
  whatsappLinkedDeviceSessions,
} from "../drizzle/schema";
import { getDb } from "./db";
import type { LinkedDeviceRuntimeBinding } from "./linkedDeviceRuntime";
import {
  decryptServerCredential,
  encryptServerCredential,
} from "./serverCredentialCrypto";
import type {
  LinkedDeviceProviderEvent,
  WppConnectInboundSourceKind,
  WppConnectSandboxIdentity,
} from "./whatsappLinkedDeviceProvider";
import { WppConnectSandboxError } from "./whatsappLinkedDeviceProvider";

/**
 * WPPConnect Server is a disabled-by-default transport implementation. It does
 * not create its own line, session, Inbox, message, or media data model. Every
 * call receives a current durable Linked Device ownership binding from the
 * application lifecycle and emits only canonical provider events.
 */
export const WPPCONNECT_SERVER_INGRESS_PATH =
  "/api/internal/wppconnect-server-event";

export type WppConnectServerOwnership = {
  lineId: number;
  providerLineId: string;
  sessionId: string;
  runtimeGeneration: string;
  sessionName: string;
};

export type WppConnectServerWebhookBinding = WppConnectServerOwnership;

export type WppConnectServerWebhookClassification = {
  sourceKind: WppConnectInboundSourceKind;
  reason:
    | "private_identity"
    | "status_indicator"
    | "broadcast_indicator"
    | "group_indicator"
    | "channel_indicator"
    | "system_event_type"
    | "malformed_event"
    | "missing_private_identity";
};

type JsonRecord = Record<string, unknown>;

type WppConnectServerConfig = {
  baseUrl: string;
  secretKey: string;
  webhookUrl: string;
  webhookSecret: string;
};

const PRIVATE_IDENTITY = /@(lid|c\.us|s\.whatsapp\.net)$/i;
const STATUS_ID = /(?:^|[^a-z])(?:false_)?status@broadcast(?:_|$)/i;
const BROADCAST_ID = /@broadcast(?:$|[_:])/i;
const GROUP_ID = /@g\.us$/i;
const CHANNEL_ID = /@(newsletter|channel)$/i;
const SYSTEM_TYPES = new Set([
  "system",
  "protocol",
  "notification",
  "e2e_notification",
  "call_log",
  "ciphertext",
]);
const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker"]);
const SECRET_NAMES = [
  "WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SERVER_ADAPTER",
  "WPPCONNECT_BASE_URL",
  "WPPCONNECT_SECRET_KEY",
  "WPPCONNECT_WEBHOOK_URL",
  "WPPCONNECT_WEBHOOK_SECRET",
] as const;

function boundedString(value: unknown, max: number) {
  return typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= max
    ? value.trim()
    : null;
}

function objectValue(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function scalarProviderValue(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number")
    return String(value).trim() || null;
  const record = objectValue(value);
  if (!record) return null;
  return (
    scalarProviderValue(record._serialized) ??
    scalarProviderValue(record.user) ??
    scalarProviderValue(record.id)
  );
}

function responseData(payload: JsonRecord): JsonRecord {
  return objectValue(payload.response) ?? objectValue(payload.data) ?? payload;
}

function messageData(payload: JsonRecord): JsonRecord {
  const data = responseData(payload);
  return objectValue(data.message) ?? objectValue(payload.message) ?? data;
}

function collectProviderValues(value: JsonRecord) {
  const values: string[] = [];
  const add = (candidate: unknown) => {
    const normalized = scalarProviderValue(candidate);
    if (normalized) values.push(normalized);
  };
  [
    value.id,
    value.key,
    value.msgId,
    value.messageId,
    value.from,
    value.author,
    value.chatId,
    value.remoteJid,
    value.remoteJidAlt,
    value.to,
    value.sender,
    value.chat,
    value.participant,
    value.wid,
  ].forEach(add);
  return values;
}

function boolIndicator(value: JsonRecord, names: string[]) {
  return names.some(
    name => value[name] === true || value[name] === 1 || value[name] === "true"
  );
}

/** Classifies before message-body or media extraction. Non-private is fail-closed. */
export function classifyWppConnectServerSource(
  value: unknown
): WppConnectServerWebhookClassification {
  const raw = objectValue(value);
  if (!raw)
    return { sourceKind: "unknown_non_private", reason: "malformed_event" };
  const values = collectProviderValues(raw);
  const lowerValues = values.map(item => item.toLowerCase());
  const type =
    typeof raw.type === "string" ? raw.type.trim().toLowerCase() : "";

  if (
    boolIndicator(raw, [
      "isStatus",
      "isStatusV3",
      "isStatusV2",
      "isWhatsAppStatus",
      "isStatusMessage",
    ]) ||
    lowerValues.some(item => STATUS_ID.test(item))
  ) {
    return { sourceKind: "status", reason: "status_indicator" };
  }
  if (
    boolIndicator(raw, ["isNewsletter", "isChannel", "isChannelMessage"]) ||
    lowerValues.some(item => CHANNEL_ID.test(item))
  ) {
    return { sourceKind: "channel", reason: "channel_indicator" };
  }
  if (
    boolIndicator(raw, ["isGroupMsg", "isGroup", "isGroupMessage"]) ||
    lowerValues.some(item => GROUP_ID.test(item))
  ) {
    return { sourceKind: "group", reason: "group_indicator" };
  }
  if (
    boolIndicator(raw, ["isBroadcast", "isBroadcastMsg", "isBroadcastList"]) ||
    lowerValues.some(item => BROADCAST_ID.test(item))
  ) {
    return { sourceKind: "broadcast", reason: "broadcast_indicator" };
  }
  if (
    SYSTEM_TYPES.has(type) ||
    boolIndicator(raw, ["isProtocolMessage", "isSystemMessage"])
  ) {
    return { sourceKind: "system", reason: "system_event_type" };
  }
  if (values.some(item => PRIVATE_IDENTITY.test(item))) {
    return { sourceKind: "private_chat", reason: "private_identity" };
  }
  return {
    sourceKind: "unknown_non_private",
    reason: "missing_private_identity",
  };
}

function eventSessionName(payload: JsonRecord) {
  const data = responseData(payload);
  return boundedString(
    payload.session ?? payload.sessionName ?? data.session ?? data.sessionName,
    128
  );
}

function messageId(raw: JsonRecord) {
  return boundedString(
    scalarProviderValue(raw.id) ??
      scalarProviderValue(raw.msgId) ??
      scalarProviderValue(raw.messageId),
    128
  );
}

function messageTimestamp(raw: JsonRecord): Date | null {
  const candidate = raw.timestamp ?? raw.t ?? raw.time;
  if (candidate instanceof Date && !Number.isNaN(candidate.getTime()))
    return candidate;
  if (typeof candidate === "string" && !/^\d+$/.test(candidate)) {
    const parsed = new Date(candidate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const numeric = Number(candidate);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = new Date(millis);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function chatId(raw: JsonRecord) {
  const fromMe = Boolean(raw.fromMe ?? objectValue(raw.id)?.fromMe);
  return (
    scalarProviderValue(raw.chatId) ??
    scalarProviderValue(objectValue(raw.id)?.remote) ??
    scalarProviderValue(fromMe ? raw.to : raw.from) ??
    scalarProviderValue(fromMe ? raw.from : raw.to)
  );
}

function endpointFromChatId(value: string) {
  const normalized = value.trim();
  if (/@(c\.us|s\.whatsapp\.net)$/i.test(normalized)) {
    const digits = normalized.split("@")[0]?.replace(/\D/g, "") ?? "";
    return digits && digits.length <= 32 ? digits : null;
  }
  return boundedString(normalized, 128);
}

function providerIdentity(raw: JsonRecord, fallbackChatId: string) {
  const values = [raw.author, raw.wid, raw.sender, raw.from, fallbackChatId]
    .map(item => scalarProviderValue(item))
    .filter((item): item is string => Boolean(item));
  return values.find(item => /@lid$/i.test(item)) ?? null;
}

function mediaShape(raw: JsonRecord, providerMessageId: string) {
  const rawType =
    typeof raw.type === "string" ? raw.type.trim().toLowerCase() : "";
  const rawMime =
    boundedString(raw.mimetype ?? raw.mimeType, 128)?.toLowerCase() ?? null;
  const inferred =
    rawType === "ptt" || rawType === "voice"
      ? "audio"
      : MEDIA_TYPES.has(rawType)
        ? rawType
        : rawMime?.startsWith("image/")
          ? "image"
          : rawMime?.startsWith("video/")
            ? "video"
            : rawMime?.startsWith("audio/")
              ? "audio"
              : rawMime
                ? "document"
                : null;
  if (!inferred || !MEDIA_TYPES.has(inferred)) return null;
  const candidateBase64 =
    typeof raw.base64 === "string"
      ? raw.base64
      : typeof objectValue(raw.mediaData)?.data === "string"
        ? (objectValue(raw.mediaData)?.data as string)
        : typeof objectValue(raw.media)?.base64 === "string"
          ? (objectValue(raw.media)?.base64 as string)
          : "";
  const base64 = candidateBase64
    .replace(/^data:[^,]+,/, "")
    .replace(/\s+/g, "");
  if (
    base64 &&
    (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) ||
      base64.length > UNIFIED_INBOX_MEDIA_MAX_BASE64_LENGTH)
  ) {
    return { invalid: true as const };
  }
  const bytes = base64 ? Buffer.from(base64, "base64") : null;
  if (bytes && (!bytes.length || bytes.length > 15 * 1024 * 1024))
    return { invalid: true as const };
  const filename = boundedString(raw.filename ?? raw.fileName, 256);
  const digest = bytes
    ? createHash("sha256").update(bytes).digest("hex")
    : null;
  return {
    invalid: false as const,
    base64: base64 || null,
    media: {
      providerMediaId:
        boundedString(raw.mediaId ?? raw.id, 128) ??
        `${providerMessageId}:media`,
      mediaType: inferred as
        | "image"
        | "audio"
        | "video"
        | "document"
        | "sticker",
      mimeType: rawMime ?? "application/octet-stream",
      filename,
      sha256: digest,
      caption: boundedString(raw.caption, UNIFIED_INBOX_TEXT_LIMIT),
    },
  };
}

export type WppConnectServerWebhookNormalization =
  | {
      kind: "ignored";
      sourceKind: Exclude<WppConnectInboundSourceKind, "private_chat">;
      reason: string;
    }
  | {
      kind: "rejected";
      reason: "session_mismatch" | "malformed_event" | "invalid_media";
    }
  | { kind: "event"; event: LinkedDeviceProviderEvent };

/**
 * Converts a WPPConnect Server webhook into the existing provider-event shape.
 * No message body or media is persisted here; optional media bytes are passed
 * only to the canonical custody path after source-first classification.
 */
export function normalizeWppConnectServerWebhook(input: {
  payload: unknown;
  ownership: WppConnectServerOwnership;
}): WppConnectServerWebhookNormalization {
  const payload = objectValue(input.payload);
  if (!payload) return { kind: "rejected", reason: "malformed_event" };
  if (eventSessionName(payload) !== input.ownership.sessionName)
    return { kind: "rejected", reason: "session_mismatch" };

  const raw = messageData(payload);
  const classification = classifyWppConnectServerSource(raw);
  if (classification.sourceKind !== "private_chat") {
    return {
      kind: "ignored",
      sourceKind: classification.sourceKind,
      reason: classification.reason,
    };
  }

  const providerMessageId = messageId(raw);
  const remoteChatId = chatId(raw);
  const senderEndpointId = remoteChatId
    ? endpointFromChatId(remoteChatId)
    : null;
  const timestamp = messageTimestamp(raw);
  if (!providerMessageId || !remoteChatId || !senderEndpointId || !timestamp) {
    return { kind: "rejected", reason: "malformed_event" };
  }
  const media = mediaShape(raw, providerMessageId);
  if (media?.invalid) return { kind: "rejected", reason: "invalid_media" };
  const text =
    boundedString(
      raw.body ?? raw.content ?? raw.caption,
      UNIFIED_INBOX_TEXT_LIMIT
    ) ?? "";
  if (!text && !media) return { kind: "rejected", reason: "malformed_event" };
  const fromMe = Boolean(raw.fromMe ?? objectValue(raw.id)?.fromMe);

  return {
    kind: "event",
    event: {
      providerMessageId,
      senderEndpointId,
      ...(providerIdentity(raw, remoteChatId)
        ? { providerIdentityId: providerIdentity(raw, remoteChatId)! }
        : {}),
      lineProviderId: input.ownership.providerLineId,
      timestamp,
      text,
      ...(media
        ? {
            media: media.media,
            ...(media.base64 ? { mediaBase64: media.base64 } : {}),
          }
        : {}),
      sourceKind: "private_chat",
      direction: fromMe ? "outbound" : "inbound",
      origin: "wppconnect_server",
    },
  };
}

export function validateWppConnectServerOwnership(
  value: Partial<WppConnectServerOwnership>
): value is WppConnectServerOwnership {
  return (
    Number.isInteger(value.lineId) &&
    Number(value.lineId) > 0 &&
    typeof value.providerLineId === "string" &&
    value.providerLineId === `wppconnect-line-${value.lineId}` &&
    typeof value.sessionId === "string" &&
    /^[1-9][0-9]{0,18}$/.test(value.sessionId) &&
    typeof value.runtimeGeneration === "string" &&
    /^[A-Za-z0-9._-]{8,64}$/.test(value.runtimeGeneration) &&
    typeof value.sessionName === "string" &&
    /^[A-Za-z0-9._-]{1,128}$/.test(value.sessionName)
  );
}

export function ownershipFromRuntime(input: {
  lineId: number;
  providerLineId: string;
  runtime: LinkedDeviceRuntimeBinding;
}): WppConnectServerOwnership | null {
  const ownership: WppConnectServerOwnership = {
    lineId: input.lineId,
    providerLineId: input.providerLineId,
    sessionId: input.runtime.sessionId ?? "",
    runtimeGeneration: input.runtime.generation,
    sessionName: input.runtime.sessionName,
  };
  return validateWppConnectServerOwnership(ownership) ? ownership : null;
}

function canonicalBinding(value: WppConnectServerWebhookBinding) {
  return [
    value.lineId,
    value.providerLineId,
    value.sessionId,
    value.runtimeGeneration,
    value.sessionName,
  ].join("\n");
}

/** Produces an opaque signed query value for the WPPConnect Server callback URL. */
export function signWppConnectServerWebhookBinding(
  value: WppConnectServerWebhookBinding,
  secret: string
) {
  if (!validateWppConnectServerOwnership(value) || secret.length < 16)
    throw new Error("WPPConnect Server webhook binding is invalid.");
  const encoded = Buffer.from(JSON.stringify(value)).toString("base64url");
  const signature = createHmac(
    "sha256",
    `fertiliv-wppconnect-server-webhook-v1:${secret}`
  )
    .update(canonicalBinding(value))
    .digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyWppConnectServerWebhookBinding(
  value: unknown,
  secret: string
): WppConnectServerWebhookBinding | null {
  if (typeof value !== "string" || secret.length < 16) return null;
  const [encoded, signature, ...extra] = value.split(".");
  if (!encoded || !signature || extra.length > 0 || signature.length > 128)
    return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !objectValue(decoded) ||
    !validateWppConnectServerOwnership(
      decoded as Partial<WppConnectServerOwnership>
    )
  )
    return null;
  const binding = decoded as WppConnectServerWebhookBinding;
  const expected = createHmac(
    "sha256",
    `fertiliv-wppconnect-server-webhook-v1:${secret}`
  )
    .update(canonicalBinding(binding))
    .digest("base64url");
  return signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
    ? binding
    : null;
}

export function buildWppConnectServerWebhookUrl(input: {
  webhookUrl: string;
  ownership: WppConnectServerWebhookBinding;
  secret: string;
}) {
  const url = new URL(input.webhookUrl);
  if (
    url.protocol !== "https:" &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "localhost"
  ) {
    throw new Error(
      "WPPConnect Server webhook URL must use HTTPS outside localhost."
    );
  }
  if (url.pathname !== WPPCONNECT_SERVER_INGRESS_PATH) {
    throw new Error(
      "WPPConnect Server webhook URL must target the canonical ingress path."
    );
  }
  url.searchParams.set(
    "binding",
    signWppConnectServerWebhookBinding(input.ownership, input.secret)
  );
  return url.toString();
}

export function isWppConnectServerAdapterEnabled() {
  return (
    process.env.WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SERVER_ADAPTER ===
    "true"
  );
}

export function isWppConnectServerIngressEnabled() {
  return isWppConnectServerAdapterEnabled();
}

/**
 * A provider rollout is deliberately line-scoped. An unset or malformed value
 * selects no line, so enabling the adapter cannot redirect a historical line.
 */
export function wppConnectServerControlledLineId() {
  const raw = (process.env.WHATSAPP_LINKED_DEVICE_WPPCONNECT_SERVER_LINE_ID ?? "").trim();
  return /^[1-9][0-9]{0,18}$/.test(raw) ? Number(raw) : null;
}

export function isWppConnectServerControlledLine(lineId: number) {
  return isWppConnectServerAdapterEnabled() &&
    Number.isInteger(lineId) &&
    lineId > 0 &&
    wppConnectServerControlledLineId() === lineId;
}

export function wppConnectServerRequiredSecretNames() {
  return [...SECRET_NAMES];
}

export type WppConnectServerPreflightResult = {
  state:
    | "provider_ready"
    | "provider_unreachable"
    | "provider_auth_failed"
    | "provider_contract_invalid"
    | "provider_not_configured";
  transportEnabled: boolean;
  callbackRoute: "registered_but_disabled" | "ready_when_enabled";
  requiredSecretNames: readonly string[];
};

type WppConnectServerPreflightConfig = WppConnectServerConfig & {
  valid: boolean;
};

function preflightConfig(): WppConnectServerPreflightConfig | null {
  const baseUrl = (process.env.WPPCONNECT_BASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  const secretKey = (process.env.WPPCONNECT_SECRET_KEY ?? "").trim();
  const webhookUrl = (process.env.WPPCONNECT_WEBHOOK_URL ?? "").trim();
  const webhookSecret = (process.env.WPPCONNECT_WEBHOOK_SECRET ?? "").trim();
  if (!baseUrl || !secretKey || !webhookUrl || webhookSecret.length < 16) {
    return null;
  }
  try {
    const provider = new URL(baseUrl);
    const callback = new URL(webhookUrl);
    const providerIsLocal = ["127.0.0.1", "localhost"].includes(provider.hostname);
    if (
      (provider.protocol !== "https:" && !providerIsLocal) ||
      callback.protocol !== "https:" ||
      callback.pathname !== WPPCONNECT_SERVER_INGRESS_PATH
    ) {
      return { baseUrl, secretKey, webhookUrl, webhookSecret, valid: false };
    }
  } catch {
    return { baseUrl, secretKey, webhookUrl, webhookSecret, valid: false };
  }
  return { baseUrl, secretKey, webhookUrl, webhookSecret, valid: true };
}

/**
 * Read-only provider preflight. It intentionally does not call generate-token,
 * start-session, qrcode-session, logout-session, or any message endpoint.
 * The adapter may stay disabled while this validates a future HTTPS provider.
 */
export async function preflightWppConnectServerProvider(): Promise<WppConnectServerPreflightResult> {
  const transportEnabled = isWppConnectServerAdapterEnabled();
  const base = {
    transportEnabled,
    callbackRoute: transportEnabled
      ? ("ready_when_enabled" as const)
      : ("registered_but_disabled" as const),
    requiredSecretNames: wppConnectServerRequiredSecretNames(),
  };
  const config = preflightConfig();
  if (!config) return { state: "provider_not_configured", ...base };
  if (!config.valid) return { state: "provider_contract_invalid", ...base };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const health = await fetch(`${config.baseUrl}/healthz`, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!health.ok) return { state: "provider_unreachable", ...base };

    // WPPConnect documents this master-secret session-list route as a GET.
    // Its response body is intentionally discarded: it may list other sessions.
    const auth = await fetch(
      `${config.baseUrl}/api/${encodeURIComponent(config.secretKey)}/show-all-sessions`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${config.secretKey}`,
        },
        cache: "no-store",
        signal: controller.signal,
      }
    );
    if (auth.status === 401 || auth.status === 403) {
      return { state: "provider_auth_failed", ...base };
    }
    if (!auth.ok) return { state: "provider_contract_invalid", ...base };
    const contentType = auth.headers.get("content-type") ?? "";
    if (!/application\/json/i.test(contentType)) {
      return { state: "provider_contract_invalid", ...base };
    }
    try {
      await auth.json();
    } catch {
      return { state: "provider_contract_invalid", ...base };
    }
    return { state: "provider_ready", ...base };
  } catch {
    return { state: "provider_unreachable", ...base };
  } finally {
    clearTimeout(timeout);
  }
}

function serverConfig(): WppConnectServerConfig {
  const baseUrl = (process.env.WPPCONNECT_BASE_URL ?? "")
    .trim()
    .replace(/\/$/, "");
  const secretKey = (process.env.WPPCONNECT_SECRET_KEY ?? "").trim();
  const webhookUrl = (process.env.WPPCONNECT_WEBHOOK_URL ?? "").trim();
  const webhookSecret = (process.env.WPPCONNECT_WEBHOOK_SECRET ?? "").trim();
  if (
    !isWppConnectServerAdapterEnabled() ||
    !baseUrl ||
    !secretKey ||
    !webhookUrl ||
    webhookSecret.length < 16
  ) {
    throw new WppConnectSandboxError(
      "feature_disabled",
      "The WPPConnect Server transport is disabled or incomplete."
    );
  }
  try {
    const url = new URL(baseUrl);
    if (
      url.protocol !== "https:" &&
      !["127.0.0.1", "localhost"].includes(url.hostname)
    )
      throw new Error("invalid");
  } catch {
    throw new WppConnectSandboxError(
      "feature_disabled",
      "The WPPConnect Server transport endpoint is invalid."
    );
  }
  return { baseUrl, secretKey, webhookUrl, webhookSecret };
}

function redactedEndpointPath(path: string, secretKey: string) {
  return path
    .replace(encodeURIComponent(secretKey), "[redacted]")
    .replace(
      /(\/api\/[^/]+\/)[^/]+(\/generate-token(?:\?|$))/,
      "$1[redacted]$2"
    );
}

async function requestServer(input: {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  sessionToken?: string;
  timeoutMs?: number;
}) {
  const config = serverConfig();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? 15_000
  );
  try {
    const response = await fetch(`${config.baseUrl}${input.path}`, {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(input.body ? { "content-type": "application/json" } : {}),
        ...(input.sessionToken
          ? {
              authorization: input.sessionToken.startsWith("Bearer ")
                ? input.sessionToken
                : `Bearer ${input.sessionToken}`,
            }
          : {}),
      },
      ...(input.body ? { body: JSON.stringify(input.body) } : {}),
      cache: "no-store",
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: JsonRecord = {};
    try {
      payload = text ? (JSON.parse(text) as JsonRecord) : {};
    } catch {
      payload = {};
    }
    if (!response.ok) {
      throw new WppConnectSandboxError(
        response.status === 401 || response.status === 403
          ? "session_unavailable"
          : "provider_temporarily_unavailable",
        "The WPPConnect Server request was not accepted.",
        {
          stage: "provider_send",
          probe: redactedEndpointPath(input.path, config.secretKey).slice(
            0,
            64
          ),
          outcome: "rejected",
          timestamp: new Date().toISOString(),
        }
      );
    }
    return payload;
  } catch (error) {
    if (error instanceof WppConnectSandboxError) throw error;
    throw new WppConnectSandboxError(
      "wpp_send_uncertain_after_provider_call",
      "The provider send result is uncertain. Do not send the same message again yet.",
      {
        stage: "provider_send",
        probe: "wppconnect_server_request",
        outcome: "transport_error",
        timestamp: new Date().toISOString(),
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function generatedWppConnectServerToken(
  payload: unknown,
  expectedSessionName: string
) {
  const record = objectValue(payload);
  const data = record ? responseData(record) : null;
  const returnedSession = boundedString(data?.session ?? record?.session, 128);
  if (returnedSession && returnedSession !== expectedSessionName)
    throw new Error(
      "WPPConnect Server returned a token for a different session."
    );
  const token = boundedString(data?.token ?? record?.token, 4096);
  if (!token)
    throw new Error("WPPConnect Server did not return a session token.");
  return token;
}

export async function generateWppConnectServerSessionToken(
  sessionName: string
) {
  const config = serverConfig();
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(sessionName))
    throw new Error("WPPConnect Server session name is invalid.");
  const payload = await requestServer({
    path: `/api/${encodeURIComponent(sessionName)}/${encodeURIComponent(config.secretKey)}/generate-token`,
    method: "POST",
  });
  return generatedWppConnectServerToken(payload, sessionName);
}

async function persistWppConnectServerSessionToken(
  lineId: number,
  token: string
) {
  const db = await getDb();
  if (!db) throw new Error("Linked Device credential storage is unavailable.");
  const now = new Date();
  await db
    .insert(whatsappLinkedDeviceCredentials)
    .values({
      lineId,
      credentialKind: "wppconnect_server_token",
      encryptedCredential: encryptServerCredential(token),
      lastValidatedAt: now,
    })
    .onConflictDoUpdate({ target: whatsappLinkedDeviceCredentials.lineId,
      set: {
        credentialKind: "wppconnect_server_token",
        encryptedCredential: encryptServerCredential(token),
        lastValidatedAt: now,
        updatedAt: now,
      },
    });
}

async function currentWppConnectServerSessionToken(
  input: WppConnectServerOwnership
) {
  const db = await getDb();
  if (!db) throw new Error("Linked Device credential storage is unavailable.");
  const [row] = await db
    .select({
      sessionId: whatsappLinkedDeviceSessions.id,
      sessionName: whatsappLinkedDeviceSessions.sessionName,
      generation: whatsappLinkedDeviceSessions.runtimeGeneration,
      credential: whatsappLinkedDeviceCredentials.encryptedCredential,
      credentialKind: whatsappLinkedDeviceCredentials.credentialKind,
    })
    .from(whatsappLinkedDeviceSessions)
    .leftJoin(
      whatsappLinkedDeviceCredentials,
      eq(
        whatsappLinkedDeviceCredentials.lineId,
        whatsappLinkedDeviceSessions.lineId
      )
    )
    .where(
      and(
        eq(whatsappLinkedDeviceSessions.lineId, input.lineId),
        eq(whatsappLinkedDeviceSessions.id, Number(input.sessionId))
      )
    )
    .limit(1);
  if (
    !row ||
    row.sessionName !== input.sessionName ||
    row.generation !== input.runtimeGeneration
  ) {
    throw new WppConnectSandboxError(
      "session_unavailable",
      "The current WPPConnect Server session could not be verified."
    );
  }
  if (row.credential && row.credentialKind === "wppconnect_server_token") {
    try {
      return decryptServerCredential(row.credential);
    } catch {
      // An expired or rotated token is refreshed below through WPPConnect
      // Server. Its plaintext remains server-only throughout the operation.
    }
  }
  const token = await generateWppConnectServerSessionToken(input.sessionName);
  await persistWppConnectServerSessionToken(input.lineId, token);
  return token;
}

export async function startWppConnectServerSession(input: {
  ownership: WppConnectServerOwnership;
}) {
  if (!validateWppConnectServerOwnership(input.ownership)) {
    throw new WppConnectSandboxError(
      "session_unavailable",
      "The WPPConnect Server session ownership could not be verified."
    );
  }
  const config = serverConfig();
  const sessionToken = await currentWppConnectServerSessionToken(
    input.ownership
  );
  const webhook = buildWppConnectServerWebhookUrl({
    webhookUrl: config.webhookUrl,
    ownership: input.ownership,
    secret: config.webhookSecret,
  });
  return requestServer({
    path: `/api/${encodeURIComponent(input.ownership.sessionName)}/start-session`,
    method: "POST",
    sessionToken,
    body: { webhook, waitQrCode: false },
    timeoutMs: 30_000,
  });
}

function qrDataUrlFromProviderPayload(payload: JsonRecord) {
  const data = responseData(payload);
  const candidate = [
    data.qrcode,
    data.qrCode,
    data.qr,
    payload.qrcode,
    payload.qrCode,
    payload.qr,
  ].find(value => typeof value === "string" && value.trim().length > 0);
  if (typeof candidate !== "string") return null;
  const value = candidate.trim();
  if (value.startsWith("data:image/")) return value.slice(0, 2_000_000);
  const base64 = value.replace(/^data:[^,]+,/, "").replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length > 2_000_000)
    return null;
  return `data:image/png;base64,${base64}`;
}

/** Retrieves a fresh QR only for the already verified current server session; QR bytes are never persisted. */
export async function getWppConnectServerQrDataUrl(input: {
  ownership: WppConnectServerOwnership;
}) {
  if (!validateWppConnectServerOwnership(input.ownership)) {
    throw new WppConnectSandboxError(
      "session_unavailable",
      "The WPPConnect Server session ownership could not be verified."
    );
  }
  const sessionToken = await currentWppConnectServerSessionToken(input.ownership);
  const config = serverConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(
      `${config.baseUrl}/api/${encodeURIComponent(input.ownership.sessionName)}/qrcode-session`,
      {
        method: "GET",
        headers: {
          accept: "image/png, application/json",
          authorization: sessionToken.startsWith("Bearer ") ? sessionToken : `Bearer ${sessionToken}`,
        },
        cache: "no-store",
        signal: controller.signal,
      }
    );
    if (!response.ok) {
      throw new WppConnectSandboxError(
        response.status === 401 || response.status === 403 ? "session_unavailable" : "provider_temporarily_unavailable",
        "The WPPConnect Server QR request was not accepted."
      );
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (/^image\/png/i.test(contentType)) {
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 2_000_000) return null;
      return `data:image/png;base64,${bytes.toString("base64")}`;
    }
    const text = await response.text();
    try {
      return qrDataUrlFromProviderPayload(JSON.parse(text) as JsonRecord);
    } catch {
      return null;
    }
  } catch (error) {
    if (error instanceof WppConnectSandboxError) throw error;
    throw new WppConnectSandboxError(
      "provider_temporarily_unavailable",
      "The WPPConnect Server QR request could not be completed."
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function logoutWppConnectServerSession(input: {
  ownership: WppConnectServerOwnership;
}) {
  if (!validateWppConnectServerOwnership(input.ownership)) {
    throw new WppConnectSandboxError(
      "session_unavailable",
      "The WPPConnect Server session ownership could not be verified."
    );
  }
  const sessionToken = await currentWppConnectServerSessionToken(
    input.ownership
  );
  await requestServer({
    path: `/api/${encodeURIComponent(input.ownership.sessionName)}/logout-session`,
    method: "POST",
    sessionToken,
  });
  return { ok: true as const };
}

function connectedFromPayload(payload: JsonRecord) {
  const data = responseData(payload);
  const values = [
    data.status,
    data.state,
    data.message,
    payload.status,
    payload.message,
  ]
    .map(value => String(value ?? "").toUpperCase())
    .join(" ");
  if (/\b(DISCONNECTED|NOT_CONNECTED|CLOSED|LOGGED_OUT)\b/.test(values))
    return false;
  return (
    /\b(CONNECTED|ISLOGGED|INCHAT|SUCCESS)\b/.test(values) ||
    data.connected === true ||
    data.status === true ||
    payload.status === true
  );
}

/**
 * WPPConnect Server's host-device response can include unmasked provider
 * identifiers. This projection keeps only a masked account hint and bounded,
 * non-secret display metadata; raw payloads never leave this adapter.
 */
function maskedAccountHint(value: unknown) {
  const raw = scalarProviderValue(value);
  const digits = raw?.replace(/\D/g, "") ?? "";
  if (digits.length < 4 || digits.length > 32) return null;
  return `${digits.slice(0, 2)}••••${digits.slice(-2)}`;
}

function hostDeviceIdentityFromPayload(
  payload: JsonRecord
): WppConnectSandboxIdentity {
  const data = responseData(payload);
  return {
    accountHint: maskedAccountHint(data.phoneNumber ?? data.wid ?? data.me),
    pushname: boundedString(data.pushname, 128),
    platform: boundedString(data.platform, 64),
  };
}

function assertOutboundInput(input: {
  ownership: WppConnectServerOwnership;
  recipient: string;
  approvalProof: string;
  text?: string;
  fileBase64?: string;
  mimeType?: string;
  filename?: string;
}) {
  if (!validateWppConnectServerOwnership(input.ownership)) {
    throw new WppConnectSandboxError(
      "session_unavailable",
      "The linked-device runtime ownership could not be verified."
    );
  }
  const recipient = normalizeInboxDirectPhone(input.recipient);
  if (!recipient)
    throw new WppConnectSandboxError(
      "recipient_invalid",
      "Choose an explicitly approved private test recipient before sending."
    );
  if (!input.approvalProof || input.approvalProof.length > 1024) {
    throw new WppConnectSandboxError(
      "wpp_recipient_proof_rejected",
      "Message not sent. Recipient authorization could not be verified.",
      {
        stage: "recipient_approval",
        probe: "approval_proof_missing",
        outcome: "rejected",
        timestamp: new Date().toISOString(),
      }
    );
  }
  if (
    input.text !== undefined &&
    (!input.text.trim() || input.text.trim().length > UNIFIED_INBOX_TEXT_LIMIT)
  ) {
    throw new WppConnectSandboxError(
      "recipient_invalid",
      input.text.trim()
        ? UNIFIED_INBOX_TEXT_LIMIT_MESSAGE
        : "Enter a message before sending."
    );
  }
  if (
    input.fileBase64 !== undefined &&
    (!input.mimeType?.trim() ||
      !input.filename?.trim() ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(input.fileBase64))
  ) {
    throw new WppConnectSandboxError(
      "recipient_invalid",
      "Choose a valid attachment before sending."
    );
  }
  return recipient.replace(/^\+/, "");
}

export async function getWppConnectServerConnectionStatus(input: {
  ownership: WppConnectServerOwnership;
  sessionToken?: string;
}) {
  if (!validateWppConnectServerOwnership(input.ownership)) {
    throw new WppConnectSandboxError(
      "session_unavailable",
      "The WPPConnect Server session ownership could not be verified."
    );
  }
  const sessionToken =
    input.sessionToken ??
    (await currentWppConnectServerSessionToken(input.ownership));
  const payload = await requestServer({
    path: `/api/${encodeURIComponent(input.ownership.sessionName)}/check-connection-session`,
    sessionToken,
  });
  const connected = connectedFromPayload(payload);
  if (!connected) return { connected, identity: null };
  try {
    const hostDevice = await requestServer({
      path: `/api/${encodeURIComponent(input.ownership.sessionName)}/host-device`,
      sessionToken,
    });
    return { connected, identity: hostDeviceIdentityFromPayload(hostDevice) };
  } catch {
    // A display-hint lookup must never downgrade an independently verified
    // connected session or expose a provider error to Settings.
    return { connected, identity: null };
  }
}

export async function sendWppConnectServerText(input: {
  ownership: WppConnectServerOwnership;
  sessionToken?: string;
  recipient: string;
  approvalProof: string;
  text: string;
  correlationId: string;
  outboundAttemptId: number;
}) {
  const phone = assertOutboundInput(input);
  const sessionToken =
    input.sessionToken ??
    (await currentWppConnectServerSessionToken(input.ownership));
  const status = await getWppConnectServerConnectionStatus({
    ownership: input.ownership,
    sessionToken,
  });
  if (!status.connected) {
    throw new WppConnectSandboxError(
      "wpp_probe_not_ready",
      "The test line was not ready. The message was not submitted.",
      {
        stage: "readiness_probe",
        probe: "check-connection-session",
        outcome: "not_ready",
        timestamp: new Date().toISOString(),
        correlationId: input.correlationId,
        outboundAttemptId: input.outboundAttemptId,
      }
    );
  }
  const payload = await requestServer({
    path: `/api/${encodeURIComponent(input.ownership.sessionName)}/send-message`,
    method: "POST",
    sessionToken,
    body: { phone, isGroup: false, isLid: false, message: input.text.trim() },
  });
  const data = responseData(payload);
  const providerMessageId = messageId(data) ?? messageId(payload);
  if (!providerMessageId) {
    throw new WppConnectSandboxError(
      "wpp_send_rejected_before_provider_id",
      "The provider rejected this message before issuing a message ID.",
      {
        stage: "provider_send",
        probe: "send-message",
        outcome: "rejected_before_provider_id",
        timestamp: new Date().toISOString(),
        correlationId: input.correlationId,
        outboundAttemptId: input.outboundAttemptId,
      }
    );
  }
  return {
    providerMessageId,
    timestamp: new Date(),
    messageType: "text" as const,
    peerIdentityId: null,
    replayed: false,
  };
}

export async function sendWppConnectServerMedia(input: {
  ownership: WppConnectServerOwnership;
  sessionToken?: string;
  recipient: string;
  approvalProof: string;
  fileBase64: string;
  mimeType: string;
  filename: string;
  caption?: string;
  correlationId: string;
  outboundAttemptId: number;
}) {
  const phone = assertOutboundInput(input);
  const sessionToken =
    input.sessionToken ??
    (await currentWppConnectServerSessionToken(input.ownership));
  const status = await getWppConnectServerConnectionStatus({
    ownership: input.ownership,
    sessionToken,
  });
  if (!status.connected) {
    throw new WppConnectSandboxError(
      "wpp_probe_not_ready",
      "The test line was not ready. The attachment was not submitted.",
      {
        stage: "readiness_probe",
        probe: "check-connection-session",
        outcome: "not_ready",
        timestamp: new Date().toISOString(),
        correlationId: input.correlationId,
        outboundAttemptId: input.outboundAttemptId,
      }
    );
  }
  const payload = await requestServer({
    path: `/api/${encodeURIComponent(input.ownership.sessionName)}/send-image`,
    method: "POST",
    sessionToken,
    timeoutMs: 30_000,
    body: {
      phone,
      isGroup: false,
      isLid: false,
      filename: input.filename.trim(),
      caption: input.caption?.trim() ?? "",
      base64: `data:${input.mimeType.trim().toLowerCase()};base64,${input.fileBase64}`,
    },
  });
  const data = responseData(payload);
  const providerMessageId = messageId(data) ?? messageId(payload);
  if (!providerMessageId) {
    throw new WppConnectSandboxError(
      "wpp_send_rejected_before_provider_id",
      "The provider rejected this attachment before issuing a message ID.",
      {
        stage: "provider_send",
        probe: "send-image",
        outcome: "rejected_before_provider_id",
        timestamp: new Date().toISOString(),
        correlationId: input.correlationId,
        outboundAttemptId: input.outboundAttemptId,
      }
    );
  }
  return {
    providerMessageId,
    timestamp: new Date(),
    messageType: "document" as const,
    peerIdentityId: null,
    replayed: false,
  };
}

export function wppConnectServerEventKey(
  lineId: number,
  providerMessageId: string
) {
  if (
    !Number.isInteger(lineId) ||
    lineId <= 0 ||
    !boundedString(providerMessageId, 128)
  ) {
    throw new Error("WPPConnect Server event identity is invalid.");
  }
  return createHash("sha256")
    .update(`wppconnect:server:${lineId}:${providerMessageId}`)
    .digest("hex");
}

export const wppConnectServerTestHelpers = {
  classifyWppConnectServerSource,
  connectedFromPayload,
  eventSessionName,
  generatedWppConnectServerToken,
  hostDeviceIdentityFromPayload,
  messageId,
  normalizeWppConnectServerWebhook,
  qrDataUrlFromProviderPayload,
  signWppConnectServerWebhookBinding,
  isWppConnectServerControlledLine,
  validateWppConnectServerOwnership,
  verifyWppConnectServerWebhookBinding,
};
