import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import {
  whatsappAllowedChats,
  whatsappLinkedDeviceCredentials,
  whatsappLinkedDeviceLines,
  whatsappLinkedDeviceLineStaff,
  whatsappLinkedDeviceMessages,
  whatsappLinkedDeviceSessions,
} from "../drizzle/schema";
import { getDb, logAudit } from "./db";
import { decryptServerCredential, encryptServerCredential } from "./serverCredentialCrypto";
import { storageGetBytes, storagePut } from "./storage";
import { buildMediaFilename } from "../shared/mediaFilename";
import { listEligibleLinkedDeviceStaff, updateLinkedDeviceLineStaff } from "./whatsappLinkedDevice";

export type WppActor = { id: number; role: string; name?: string | null };
type JsonRecord = Record<string, any>;
type WppSessionAuth = {
  lineId: number;
  sessionName: string;
  encryptedCredential?: string | null;
  token?: string;
};

type WppResponseMode = "json" | "media";
type GoldConversationEvent = {
  kind: "message" | "ack";
  allowedChatId: number;
  externalMessageId: string;
};
type GoldConversationListener = (event: GoldConversationEvent) => void;

const ADAPTER_KIND = "wppconnect_server";
const MAX_HISTORY_PAGES = 50;
const HISTORY_PAGE_SIZE = 100;
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const IDENTITY_UNAVAILABLE = "WhatsApp identity unavailable";
const goldConversationListeners = new Map<string, Set<GoldConversationListener>>();

type GoldMedia = {
  mediaType: "image" | "audio" | "video" | "document";
  mimeType: string;
  filename: string;
  size: number;
  sha256: string;
  base64: string;
};

async function auditGoldWppAction(actor: WppActor, action: string, lineId: number, description: string) {
  await logAudit({
    userId: actor.id,
    userName: actor.name ?? null,
    userRole: actor.role,
    action,
    category: "other",
    description,
    recordId: lineId,
    recordType: "gold_whatsapp_line",
    page: "/whatsapp-connections",
  });
}

function config() {
  const baseUrl = (process.env.WPPCONNECT_BASE_URL ?? "").replace(/\/$/, "");
  const secretKey = process.env.WPPCONNECT_SECRET_KEY ?? "";
  const webhookUrl = process.env.WPPCONNECT_WEBHOOK_URL ?? "";
  const webhookSecret = process.env.WPPCONNECT_WEBHOOK_SECRET ?? "";
  if (!baseUrl || !secretKey || !webhookUrl || !webhookSecret) {
    throw new Error("WPPConnect is not configured. Set WPPCONNECT_BASE_URL, WPPCONNECT_SECRET_KEY, WPPCONNECT_WEBHOOK_URL, and WPPCONNECT_WEBHOOK_SECRET.");
  }
  return { baseUrl, secretKey, webhookUrl, webhookSecret };
}

function safeSessionPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

function providerValue(value: any): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value?._serialized === "string" && value._serialized.trim()) return value._serialized;
  const user = value?.user ?? value?.id;
  const server = value?.server ?? value?.id?.server;
  if (user != null && server != null && String(server).trim()) return `${user}@${server}`;
  return String(user ?? "");
}

function normalizeChatId(value: any) {
  return providerValue(value).trim();
}

function phoneFromChatId(value: string) {
  const normalized = value.trim().toLowerCase();
  const match = /^([1-9]\d{5,14})@(c\.us|s\.whatsapp\.net)$/.exec(normalized);
  return match ? `+${match[1]}` : null;
}

function accountPhoneFromValue(value: string) {
  const normalized = value.trim().toLowerCase();
  if (/^[1-9]\d{5,14}$/.test(normalized)) return `+${normalized}`;
  return phoneFromChatId(normalized);
}

function safeChatIdentity(value: string) {
  return phoneFromChatId(value) ?? IDENTITY_UNAVAILABLE;
}

function isPrivateChatId(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.includes("status@broadcast") || normalized.endsWith("@g.us") || normalized.includes("@broadcast") || normalized.includes("@newsletter")) return false;
  return normalized.endsWith("@c.us") || normalized.endsWith("@s.whatsapp.net") || normalized.endsWith("@lid");
}

function providerRecipient(chatId: string) {
  if (!isPrivateChatId(chatId)) throw new Error("Only an explicitly selected private WhatsApp chat can receive a message.");
  if (chatId.endsWith("@c.us") || chatId.endsWith("@s.whatsapp.net")) return chatId.split("@")[0]!;
  return chatId;
}

function responseData(payload: any): any {
  return payload?.response ?? payload?.data ?? payload;
}

function asArray(payload: any): JsonRecord[] {
  const value = responseData(payload);
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.chats)) return value.chats;
  if (Array.isArray(value?.messages)) return value.messages;
  return [];
}

function boundedRaw(value: any) {
  if (!value || typeof value !== "object") return null;
  const sensitive = /^(body|content|caption|file|base64|deprecatedMms3Url|thumbnail|jpegThumbnail|mediaData|media|data)$/i;
  const redact = (entry: any, depth: number): any => {
    if (entry == null || typeof entry !== "object") return entry;
    if (depth > 4) return "[omitted]";
    if (Array.isArray(entry)) return entry.slice(0, 20).map((item) => redact(item, depth + 1));
    return Object.fromEntries(Object.entries(entry).map(([key, child]) => [key, sensitive.test(key) ? "[omitted]" : redact(child, depth + 1)]));
  };
  const clone = redact(value, 0) as JsonRecord;
  const serialized = JSON.stringify(clone);
  return serialized.length <= 32_000 ? clone : { id: clone.id, type: clone.type, timestamp: clone.timestamp, truncated: true };
}

function messageId(message: JsonRecord) {
  return providerValue(message.id || message.msgId || message.messageId);
}

function messageTimestamp(message: JsonRecord) {
  const raw = message.timestamp ?? message.t ?? message.time ?? Date.now();
  if (raw instanceof Date) return raw;
  if (typeof raw === "string" && !/^\d+$/.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const numeric = Number(raw);
  const millis = numeric < 10_000_000_000 ? numeric * 1000 : numeric;
  const parsed = new Date(millis);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function messageChatId(message: JsonRecord) {
  const fromMe = Boolean(message.fromMe ?? message.id?.fromMe);
  return normalizeChatId(message.chatId || message.id?.remote || (fromMe ? message.to : message.from) || (fromMe ? message.from : message.to));
}

function normalizedMime(value: unknown) {
  const mime = typeof value === "string" ? value.trim().toLowerCase().split(";", 1)[0] : "";
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime) ? mime : "";
}

function declaredMediaType(message: JsonRecord): GoldMedia["mediaType"] | null {
  const type = String(message.type ?? message.messageType ?? "").toLowerCase();
  if (/image|sticker/.test(type)) return "image";
  if (/audio|ptt|voice/.test(type)) return "audio";
  if (/video/.test(type)) return "video";
  if (/document|file/.test(type)) return "document";
  return null;
}

function mimeMediaType(mimeType: string): GoldMedia["mediaType"] | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return mimeType ? "document" : null;
}

function mediaTypeFor(message: JsonRecord, mimeType: string): GoldMedia["mediaType"] | null {
  const declared = declaredMediaType(message);
  const fromMime = mimeMediaType(mimeType);
  if (declared && declared !== "document" && fromMime && declared !== fromMime) return null;
  return declared ?? fromMime;
}

function canonicalBase64(value: unknown) {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/^data:[^;,]+;base64,/i, "").replace(/\s/g, "");
  if (!raw || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 === 1) return null;
  const padded = raw.padEnd(Math.ceil(raw.length / 4) * 4, "=");
  const bytes = Buffer.from(padded, "base64");
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) return null;
  const comparable = padded.replace(/=+$/, "");
  if (bytes.toString("base64").replace(/=+$/, "") !== comparable) return null;
  return { base64: bytes.toString("base64"), bytes };
}

function mediaFromMessage(message: JsonRecord): GoldMedia | null {
  const mimeType = normalizedMime(message.mimetype ?? message.mimeType ?? message.media?.mimetype ?? message.media?.mimeType);
  const mediaType = mediaTypeFor(message, mimeType);
  if (!mediaType) return null;
  const values = [message.base64, message.mediaData, message.file, message.media?.base64, message.media?.data, message.body, message.content];
  for (const value of values) {
    const decoded = canonicalBase64(value);
    if (!decoded) continue;
    const filename = buildMediaFilename({
      originalFilename: message.filename ?? message.fileName ?? message.media?.filename,
      mimeType: mimeType || "application/octet-stream",
      mediaType,
      seed: messageId(message),
    });
    return {
      mediaType,
      mimeType: mimeType || "application/octet-stream",
      filename,
      size: decoded.bytes.length,
      sha256: createHash("sha256").update(decoded.bytes).digest("hex"),
      base64: decoded.base64,
    };
  }
  return null;
}

function mediaFromProviderResponse(payload: any, message: JsonRecord): GoldMedia | null {
  const response = payload && typeof payload === "object" ? payload as JsonRecord : {};
  const candidates = [response, response.response, response.data, response.media, response.file].filter(
    (candidate): candidate is JsonRecord => Boolean(candidate) && typeof candidate === "object" && !Array.isArray(candidate),
  );
  const mimeType = candidates.map((candidate) => normalizedMime(candidate.mimetype ?? candidate.mimeType ?? candidate.type)).find(Boolean) ?? "";
  const mediaType = mediaTypeFor(message, mimeType);
  if (!mediaType) return null;
  const values = candidates.flatMap((candidate) => [candidate.base64, candidate.base64Data, candidate.data, candidate.file, candidate.body]);
  for (const value of values) {
    const decoded = canonicalBase64(value);
    if (!decoded) continue;
    const resolvedMime = mimeType || normalizedMime(message.mimetype ?? message.mimeType) || "application/octet-stream";
    const filename = buildMediaFilename({
      originalFilename: candidates.map((candidate) => candidate.filename ?? candidate.fileName).find((value) => typeof value === "string") ?? message.filename ?? message.fileName,
      mimeType: resolvedMime,
      mediaType,
      seed: messageId(message),
    });
    return {
      mediaType,
      mimeType: resolvedMime,
      filename,
      size: decoded.bytes.length,
      sha256: createHash("sha256").update(decoded.bytes).digest("hex"),
      base64: decoded.base64,
    };
  }
  return null;
}

function mediaFromDownloadedBytes(bytes: Buffer, contentType: string, filename: string | null, message: JsonRecord): GoldMedia | null {
  if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) return null;
  const responseMime = normalizedMime(contentType);
  const mimeType = responseMime && responseMime !== "application/octet-stream"
    ? responseMime
    : normalizedMime(message.mimetype ?? message.mimeType) || "application/octet-stream";
  const mediaType = mediaTypeFor(message, mimeType);
  if (!mediaType) return null;
  const normalizedFilename = filename?.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i)?.[1] ?? filename;
  const safeFilename = buildMediaFilename({
    originalFilename: normalizedFilename ?? message.filename ?? message.fileName,
    mimeType,
    mediaType,
    seed: messageId(message),
  });
  return {
    mediaType,
    mimeType,
    filename: safeFilename,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    base64: bytes.toString("base64"),
  };
}

function isMediaBody(message: JsonRecord, media: GoldMedia | null) {
  if (!media) return false;
  return canonicalBase64(message.body)?.base64 === media.base64 || canonicalBase64(message.content)?.base64 === media.base64;
}

function messageRecord(message: JsonRecord, lineId: number, allowedChatId: number, ownerUserId: number, mediaOverride?: GoldMedia | null) {
  const fromMe = Boolean(message.fromMe ?? message.id?.fromMe);
  const externalMessageId = messageId(message);
  if (!externalMessageId) return null;
  const type = String(message.type || message.mimetype || "chat").slice(0, 64);
  const media = mediaOverride === undefined ? mediaFromMessage(message) : mediaOverride;
  const declaredMime = normalizedMime(message.mimetype ?? message.mimeType ?? message.media?.mimetype ?? message.media?.mimeType);
  const statedMediaType = declaredMediaType(message) ?? mimeMediaType(declaredMime);
  const caption = String(message.caption ?? "").slice(0, 65_535);
  // WPPConnect auto-download can place media Base64 in body. A media-shaped
  // payload is never eligible to become timeline text, even if decoding fails.
  const content = statedMediaType || isMediaBody(message, media) ? caption : String(message.body ?? message.content ?? caption).slice(0, 65_535);
  return {
    lineId,
    allowedChatId,
    ownerUserId,
    externalMessageId,
    direction: fromMe ? "outgoing" as const : "incoming" as const,
    messageType: type,
    text: content || null,
    // Provider URLs and bytes are deliberately never treated as Gold custody.
    mediaUrl: null,
    mediaMetadata: media
      ? { mediaType: media.mediaType, mimeType: media.mimeType, filename: media.filename, size: media.size, sha256: media.sha256, storageState: "pending_custody" }
      : statedMediaType
        ? { mediaType: statedMediaType, mimeType: declaredMime || null, filename: buildMediaFilename({ originalFilename: message.filename ?? message.fileName, mimeType: declaredMime || "application/octet-stream", mediaType: statedMediaType, seed: externalMessageId }), storageState: "unavailable" }
        : type === "chat" ? null : boundedRaw({ mimetype: message.mimetype, filename: message.filename, size: message.size, duration: message.duration, storageState: "metadata_only" }),
    sentByMe: fromMe,
    deliveryStatus: String(message.ackName ?? message.status ?? message.ack ?? "").slice(0, 64) || null,
    messageTimestamp: messageTimestamp(message),
    rawMetadata: boundedRaw(message),
  };
}

function parsedMediaMetadata(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

const mediaCustodyWrites = new Map<string, Promise<void>>();

async function ensureGoldMediaCustody(input: {
  lineId: number;
  externalMessageId: string;
  message: JsonRecord;
  media?: GoldMedia | null;
}) {
  const media = input.media === undefined ? mediaFromMessage(input.message) : input.media;
  if (!media) return;
  const key = `${input.lineId}:${input.externalMessageId}`;
  const existing = mediaCustodyWrites.get(key);
  if (existing) return existing;
  const write = (async () => {
    const db = await getDb();
    if (!db) return;
    const [row] = await db.select({ id: whatsappLinkedDeviceMessages.id, mediaMetadata: whatsappLinkedDeviceMessages.mediaMetadata })
      .from(whatsappLinkedDeviceMessages)
      .where(and(eq(whatsappLinkedDeviceMessages.lineId, input.lineId), eq(whatsappLinkedDeviceMessages.externalMessageId, input.externalMessageId)))
      .limit(1);
    if (!row) return;
    const previous = parsedMediaMetadata(row.mediaMetadata) ?? {};
    if (typeof previous.storageKey === "string" && previous.storageState === "available") return;
    try {
      const stored = await storagePut(
        `gold-whatsapp/line-${input.lineId}/${createHash("sha256").update(input.externalMessageId).digest("hex").slice(0, 24)}-${media.filename}`,
        Buffer.from(media.base64, "base64"),
        media.mimeType,
        media.filename,
      );
      await db.update(whatsappLinkedDeviceMessages).set({
        mediaUrl: null,
        mediaMetadata: {
          mediaType: media.mediaType,
          mimeType: media.mimeType,
          filename: media.filename,
          size: media.size,
          sha256: media.sha256,
          storageKey: stored.key,
          storageState: "available",
        },
        updatedAt: new Date(),
      }).where(eq(whatsappLinkedDeviceMessages.id, row.id));
    } catch {
      await db.update(whatsappLinkedDeviceMessages).set({
        mediaUrl: null,
        mediaMetadata: {
          mediaType: media.mediaType,
          mimeType: media.mimeType,
          filename: media.filename,
          size: media.size,
          sha256: media.sha256,
          storageState: "unavailable",
        },
        updatedAt: new Date(),
      }).where(eq(whatsappLinkedDeviceMessages.id, row.id));
      console.warn("[gold-wppconnect-media] custody unavailable", { lineId: input.lineId, reason: "storage_write_failed" });
    }
  })().finally(() => mediaCustodyWrites.delete(key));
  mediaCustodyWrites.set(key, write);
  return write;
}

async function upsertWppMessage(record: NonNullable<ReturnType<typeof messageRecord>>, message: JsonRecord, media?: GoldMedia | null) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const result = await db.insert(whatsappLinkedDeviceMessages).values(record).onConflictDoUpdate({ target: [whatsappLinkedDeviceMessages.lineId, whatsappLinkedDeviceMessages.externalMessageId],
    set: { deliveryStatus: record.deliveryStatus, updatedAt: new Date() },
  });
  await ensureGoldMediaCustody({ lineId: record.lineId, externalMessageId: record.externalMessageId, message, media });
  return result;
}

function safeMediaProjection(value: unknown) {
  const media = parsedMediaMetadata(value);
  if (!media) return null;
  return {
    mediaType: typeof media.mediaType === "string" ? media.mediaType : "document",
    mimeType: typeof media.mimeType === "string" ? media.mimeType : null,
    filename: typeof media.filename === "string" ? media.filename : null,
    size: typeof media.size === "number" ? media.size : null,
    state: media.storageState === "available" ? "available" : media.storageState === "unavailable" ? "unavailable" : "metadata_only",
  };
}

function verifyGoldMediaIntegrity(data: Buffer, media: JsonRecord) {
  if (typeof media.size === "number" && data.length !== media.size) return false;
  if (typeof media.sha256 === "string" && createHash("sha256").update(data).digest("hex") !== media.sha256) return false;
  return true;
}

class WppRequestError extends Error {
  constructor(message: string, readonly status: number, readonly endpointPath: string) {
    super(message);
    this.name = "WppRequestError";
  }
}

function redactedEndpointPath(path: string) {
  const { secretKey } = config();
  const encodedSecret = encodeURIComponent(secretKey);
  return path
    .replace(encodedSecret, "[redacted]")
    .replace(/(\/api\/[^/]+\/)[^/]+(\/generate-token(?:\?|$))/, "$1[redacted]$2")
    .replace(/(\/(?:get-messages|all-messages-in-chat|get-media-by-message)\/)[^/?]+/g, "$1[redacted]");
}

async function wppRequest(path: string, init: RequestInit = {}, token?: string, sessionName = "unknown", responseMode: WppResponseMode = "json") {
  const { baseUrl } = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    let payload: any = null;
    if (response.ok && ((responseMode === "media" && !contentType.includes("json")) || contentType.startsWith("image/"))) {
      const image = Buffer.from(await response.arrayBuffer());
      payload = responseMode === "media"
        ? { bytes: image, contentType: contentType || "application/octet-stream", filename: response.headers.get("content-disposition") }
        : { qrcode: `data:${contentType};base64,${image.toString("base64")}` };
    } else {
      const text = await response.text();
      try { payload = text ? JSON.parse(text) : null; } catch { payload = { message: text }; }
    }
    console.info("[wppconnect-request]", {
      sessionName,
      endpointPath: redactedEndpointPath(path),
      tokenExists: Boolean(token),
      httpStatus: response.status,
    });
    if (!response.ok) throw new WppRequestError(payload?.message || payload?.error || `WPPConnect request failed (${response.status}).`, response.status, redactedEndpointPath(path));
    return payload;
  } catch (error) {
    if (!(error instanceof WppRequestError)) {
      console.info("[wppconnect-request]", {
        sessionName,
        endpointPath: redactedEndpointPath(path),
        tokenExists: Boolean(token),
        httpStatus: "network_error",
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function generatedTokenFromPayload(payload: any, expectedSession: string) {
  const data = responseData(payload);
  const returnedSession = String(data?.session ?? payload?.session ?? "");
  if (returnedSession && returnedSession !== expectedSession) {
    throw new Error("WPPConnect returned a token for a different session.");
  }
  // WPPConnect Server 2.10.18 also returns `full` as `session:JWT`.
  // Protected endpoints require only the JWT from `token` as the Bearer value.
  const token = data?.token ?? payload?.token;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("WPPConnect did not return a session token.");
  }
  return token.trim();
}

function isSessionAuthError(error: unknown) {
  if (error instanceof WppRequestError && (error.status === 401 || error.status === 403)) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /check that the session and token are correct|invalid (?:session|token)|unauthori[sz]ed|jwt/i.test(message);
}

function safeProviderError(error: unknown) {
  if (isSessionAuthError(error)) return "WhatsApp connection is unavailable.";
  if (error instanceof WppRequestError) return "WhatsApp provider rejected the request.";
  return "WhatsApp provider is temporarily unavailable.";
}

async function generateSessionToken(sessionName: string) {
  const { secretKey } = config();
  const payload = await wppRequest(
    `/api/${encodeURIComponent(sessionName)}/${encodeURIComponent(secretKey)}/generate-token`,
    { method: "POST" },
    undefined,
    sessionName,
  );
  return generatedTokenFromPayload(payload, sessionName);
}

async function persistSessionToken(lineId: number, token: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const now = new Date();
  const encryptedCredential = encryptServerCredential(token);
  await db.insert(whatsappLinkedDeviceCredentials).values({
    lineId,
    credentialKind: "wppconnect_server_token",
    encryptedCredential,
    lastValidatedAt: now,
  }).onConflictDoUpdate({ target: whatsappLinkedDeviceCredentials.lineId,
    set: {
      credentialKind: "wppconnect_server_token",
      encryptedCredential,
      lastValidatedAt: now,
      updatedAt: now,
    },
  });
}

const sessionTokenRefreshes = new Map<number, Promise<string>>();

async function regenerateSessionToken(auth: WppSessionAuth) {
  const active = sessionTokenRefreshes.get(auth.lineId);
  if (active) return active;
  const refresh = (async () => {
    const token = await generateSessionToken(auth.sessionName);
    await persistSessionToken(auth.lineId, token);
    auth.token = token;
    auth.encryptedCredential = null;
    return token;
  })().finally(() => sessionTokenRefreshes.delete(auth.lineId));
  sessionTokenRefreshes.set(auth.lineId, refresh);
  return refresh;
}

function storedSessionToken(auth: WppSessionAuth) {
  if (auth.token) return auth.token;
  if (!auth.encryptedCredential) return null;
  try {
    return decryptServerCredential(auth.encryptedCredential);
  } catch {
    return null;
  }
}

async function wppSessionRequest(auth: WppSessionAuth, path: string, init: RequestInit = {}, responseMode: WppResponseMode = "json") {
  let token = storedSessionToken(auth) ?? await regenerateSessionToken(auth);
  try {
    return await wppRequest(path, init, token, auth.sessionName, responseMode);
  } catch (error) {
    if (!isSessionAuthError(error)) throw error;
    token = await regenerateSessionToken(auth);
    return wppRequest(path, init, token, auth.sessionName, responseMode);
  }
}

function goldConversationKey(lineId: number, allowedChatId: number) {
  return `${lineId}:${allowedChatId}`;
}

function emitGoldConversationEvent(lineId: number, event: GoldConversationEvent) {
  const listeners = goldConversationListeners.get(goldConversationKey(lineId, event.allowedChatId));
  if (!listeners) return;
  for (const listener of Array.from(listeners)) {
    try {
      listener(event);
    } catch {
      // A disconnected browser must not affect webhook persistence.
    }
  }
}

async function requireLineAccess(lineId: number, actor: WppActor) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const access = actor.role === "admin"
    ? undefined
    : or(eq(whatsappLinkedDeviceLines.ownerUserId, actor.id), eq(whatsappLinkedDeviceLineStaff.userId, actor.id));
  const rows = await db.select({
    line: whatsappLinkedDeviceLines,
    session: whatsappLinkedDeviceSessions,
    credential: whatsappLinkedDeviceCredentials,
  }).from(whatsappLinkedDeviceLines)
    .leftJoin(whatsappLinkedDeviceSessions, eq(whatsappLinkedDeviceSessions.lineId, whatsappLinkedDeviceLines.id))
    .leftJoin(whatsappLinkedDeviceLineStaff, eq(whatsappLinkedDeviceLineStaff.lineId, whatsappLinkedDeviceLines.id))
    .leftJoin(whatsappLinkedDeviceCredentials, eq(whatsappLinkedDeviceCredentials.lineId, whatsappLinkedDeviceLines.id))
    .where(and(eq(whatsappLinkedDeviceLines.id, lineId), eq(whatsappLinkedDeviceLines.adapterKind, ADAPTER_KIND), access))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("WhatsApp connection was not found or is not available to this user.");
  return row;
}

export async function assertGoldConversationAccess(lineId: number, allowedChatId: number, actor: WppActor) {
  await requireLineAccess(lineId, actor);
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const [allowed] = await db.select({ id: whatsappAllowedChats.id }).from(whatsappAllowedChats)
    .where(and(eq(whatsappAllowedChats.id, allowedChatId), eq(whatsappAllowedChats.lineId, lineId), eq(whatsappAllowedChats.enabled, true)))
    .limit(1);
  if (!allowed) throw new Error("Selected WhatsApp chat is not enabled.");
}

export async function subscribeGoldConversation(lineId: number, allowedChatId: number, actor: WppActor, listener: GoldConversationListener) {
  await assertGoldConversationAccess(lineId, allowedChatId, actor);
  const key = goldConversationKey(lineId, allowedChatId);
  const listeners = goldConversationListeners.get(key) ?? new Set<GoldConversationListener>();
  listeners.add(listener);
  goldConversationListeners.set(key, listeners);
  return () => {
    const current = goldConversationListeners.get(key);
    current?.delete(listener);
    if (current && current.size === 0) goldConversationListeners.delete(key);
  };
}

function sessionAuthFor(row: Awaited<ReturnType<typeof requireLineAccess>>): WppSessionAuth {
  const sessionName = row.session?.sessionName;
  if (!sessionName) throw new Error("WPPConnect session name is missing.");
  return { lineId: row.line.id, sessionName, encryptedCredential: row.credential?.encryptedCredential };
}

async function retrieveGoldMedia(auth: WppSessionAuth, message: JsonRecord) {
  const externalMessageId = messageId(message);
  if (!externalMessageId) return null;
  const requests: Array<{ path: string; init?: RequestInit; mode: WppResponseMode }> = [
    { path: `/api/${encodeURIComponent(auth.sessionName)}/get-media-by-message/${encodeURIComponent(externalMessageId)}`, mode: "media" },
    { path: `/api/${encodeURIComponent(auth.sessionName)}/download-media`, init: { method: "POST", body: JSON.stringify({ messageId: externalMessageId }) }, mode: "media" },
  ];
  for (const request of requests) {
    try {
      const payload = await wppSessionRequest(auth, request.path, request.init, request.mode);
      if (payload?.bytes instanceof Buffer) {
        const media = mediaFromDownloadedBytes(payload.bytes, payload.contentType, payload.filename, message);
        if (media) return media;
      }
      const media = mediaFromProviderResponse(payload, message);
      if (media) return media;
    } catch {
      // The documented endpoints are provider/version dependent; try the next
      // documented contract and fail closed if neither returns usable bytes.
    }
  }
  return null;
}

export async function listWppConnections(actor: WppActor) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const access = actor.role === "admin"
    ? undefined
    : or(eq(whatsappLinkedDeviceLines.ownerUserId, actor.id), eq(whatsappLinkedDeviceLineStaff.userId, actor.id));
  const rows = await db.select({
    id: whatsappLinkedDeviceLines.id,
    lineName: whatsappLinkedDeviceLines.lineName,
    ownerUserId: whatsappLinkedDeviceLines.ownerUserId,
    displayPhone: whatsappLinkedDeviceLines.displayPhone,
    status: whatsappLinkedDeviceLines.lifecycleState,
    connectedAt: whatsappLinkedDeviceLines.connectedAt,
    lastSyncAt: whatsappLinkedDeviceLines.lastSuccessfulSyncAt,
    sessionName: whatsappLinkedDeviceSessions.sessionName,
    sessionState: whatsappLinkedDeviceSessions.state,
    lastError: whatsappLinkedDeviceSessions.lastErrorCategory,
  }).from(whatsappLinkedDeviceLines)
    .leftJoin(whatsappLinkedDeviceSessions, eq(whatsappLinkedDeviceSessions.lineId, whatsappLinkedDeviceLines.id))
    .leftJoin(whatsappLinkedDeviceLineStaff, eq(whatsappLinkedDeviceLineStaff.lineId, whatsappLinkedDeviceLines.id))
    .where(and(eq(whatsappLinkedDeviceLines.adapterKind, ADAPTER_KIND), access))
    .orderBy(desc(whatsappLinkedDeviceLines.updatedAt));
  return Array.from(new Map(rows.map((row) => [row.id, row])).values());
}

export async function createWppConnection(input: { lineName?: string; actor: WppActor }) {
  config();
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const suffix = randomUUID().slice(0, 8);
  const requestedName = input.lineName?.trim().replace(/\s+/g, " ");
  const lineName = (requestedName || `WhatsApp ${suffix}`).slice(0, 128);
  const lineId = await db.transaction(async (tx) => {
    const [created] = await tx.insert(whatsappLinkedDeviceLines).values({
      lineName,
      providerApprovalState: "approved",
      adapterKind: ADAPTER_KIND,
      lifecycleState: "creating_session",
      healthState: "unknown",
      ownerUserId: input.actor.id,
      ownerRole: input.actor.role,
      createdById: input.actor.id,
      updatedById: input.actor.id,
    });
    const id = Number((created as any).insertId);
    if (!id) throw new Error("WhatsApp connection could not be created.");
    const sessionName = safeSessionPart(`crm-user-${input.actor.id}-${id}`);
    await tx.insert(whatsappLinkedDeviceLineStaff).values({ lineId: id, userId: input.actor.id, grantedById: input.actor.id });
    await tx.insert(whatsappLinkedDeviceSessions).values({ lineId: id, state: "creating_session", sessionName, createdById: input.actor.id, lastRequestedAt: new Date() });
    return { id, sessionName };
  });

  try {
    const { webhookUrl, webhookSecret } = config();
    const token = await generateSessionToken(lineId.sessionName);
    await persistSessionToken(lineId.id, token);
    const hook = new URL(webhookUrl);
    hook.searchParams.set("secret", webhookSecret);
    const started = await wppSessionRequest({ lineId: lineId.id, sessionName: lineId.sessionName, token }, `/api/${encodeURIComponent(lineId.sessionName)}/start-session`, {
      method: "POST",
      body: JSON.stringify({ webhook: hook.toString(), waitQrCode: true }),
    });
    await db.update(whatsappLinkedDeviceLines).set({ lifecycleState: "waiting_for_qr", updatedById: input.actor.id }).where(eq(whatsappLinkedDeviceLines.id, lineId.id));
    await db.update(whatsappLinkedDeviceSessions).set({ state: "waiting_for_qr", lastStateChangedAt: new Date() }).where(eq(whatsappLinkedDeviceSessions.lineId, lineId.id));
    await auditGoldWppAction(input.actor, "gold_whatsapp_connection_created", lineId.id, "Gold WhatsApp connection session created; manual QR pairing may be required.");
    return { connectionId: lineId.id, status: "waiting_for_qr" as const, qrDataUrl: qrFromPayload(started) };
  } catch (error) {
    await db.update(whatsappLinkedDeviceLines).set({ lifecycleState: "failed", healthState: "unavailable" }).where(eq(whatsappLinkedDeviceLines.id, lineId.id));
    await db.update(whatsappLinkedDeviceSessions).set({ state: "failed", lastErrorCategory: "session_start_failed", lastErrorAt: new Date() }).where(eq(whatsappLinkedDeviceSessions.lineId, lineId.id));
    throw error;
  }
}

function qrFromPayload(payload: any): string | null {
  const value = responseData(payload);
  const qr = typeof value === "string" ? value
    : payload?.qrcode || payload?.qrCode || payload?.urlcode || payload?.urlCode || payload?.base64Qr || value?.qrcode || value?.qrCode || value?.urlcode || value?.urlCode || value?.base64Qr;
  if (typeof qr !== "string" || !qr.trim()) return null;
  if (qr.startsWith("data:image/")) return qr;
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(qr) && qr.length > 100) return `data:image/png;base64,${qr.replace(/\s/g, "")}`;
  return null;
}

function connectedFromPayload(payload: any) {
  const data = responseData(payload);
  const state = [data?.status, data?.state, data?.message, payload?.status, payload?.message].map((value) => String(value ?? "").toUpperCase()).join(" ");
  if (/\b(DISCONNECTED|NOT_CONNECTED|CLOSED|LOGGED_OUT)\b/.test(state)) return false;
  return /\b(CONNECTED|ISLOGGED|INCHAT|SUCCESS)\b/.test(state) || data?.connected === true || data?.status === true || payload?.status === true;
}

function identityFromPayload(payload: any) {
  const data = responseData(payload);
  if (typeof data === "string" || typeof data === "number") {
    const primitive = providerValue(data);
    return primitive ? accountPhoneFromValue(primitive) : null;
  }
  const raw = providerValue(data?.wid || data?.me || data?.phone || data?.id || data?.hostDevice);
  return raw ? accountPhoneFromValue(raw) : null;
}

export async function getWppConnectionStatus(lineId: number, actor: WppActor) {
  const row = await requireLineAccess(lineId, actor);
  const auth = sessionAuthFor(row);
  const db = await getDb();
  try {
    const payload = await wppSessionRequest(auth, `/api/${encodeURIComponent(auth.sessionName)}/check-connection-session`);
    const connected = connectedFromPayload(payload);
    let qrDataUrl: string | null = null;
    if (!connected) {
      const qrPayload = await wppSessionRequest(auth, `/api/${encodeURIComponent(auth.sessionName)}/qrcode-session`).catch(() => null);
      qrDataUrl = qrFromPayload(qrPayload);
    }
    const phonePayload = connected
      ? await wppSessionRequest(auth, `/api/${encodeURIComponent(auth.sessionName)}/get-phone-number`).catch(() => null)
      : null;
    const phone = identityFromPayload(phonePayload) || identityFromPayload(payload) || phoneFromChatId(row.line.displayPhone ?? "");
    const state = connected ? "connected" : qrDataUrl ? "qr_ready" : "connecting";
    if (db) {
      await db.update(whatsappLinkedDeviceLines).set({
        lifecycleState: connected ? "connected" : qrDataUrl ? "qr_ready" : "waiting_for_qr",
        healthState: connected ? "healthy" : "unknown",
        displayPhone: phone,
        normalizedDisplayPhone: phone?.replace(/\D/g, "") || null,
        connectedAt: connected ? (row.line.connectedAt ?? new Date()) : row.line.connectedAt,
        lastSeenAt: connected ? new Date() : row.line.lastSeenAt,
      }).where(eq(whatsappLinkedDeviceLines.id, lineId));
      await db.update(whatsappLinkedDeviceSessions).set({ state: connected ? "connected" : qrDataUrl ? "qr_ready" : "waiting_for_qr", lastHealthCheckedAt: new Date() }).where(eq(whatsappLinkedDeviceSessions.lineId, lineId));
    }
    return { status: state, connected, phoneNumber: phone, qrDataUrl, lastSyncAt: row.line.lastSuccessfulSyncAt };
  } catch (error) {
    return { status: "error" as const, connected: false, phoneNumber: row.line.displayPhone, qrDataUrl: null, lastSyncAt: row.line.lastSuccessfulSyncAt, error: "WPPConnect is unavailable." };
  }
}

export async function reconnectWppConnection(lineId: number, actor: WppActor) {
  const row = await requireLineAccess(lineId, actor);
  const auth = sessionAuthFor(row);
  const { webhookUrl, webhookSecret } = config();
  const hook = new URL(webhookUrl);
  hook.searchParams.set("secret", webhookSecret);
  const payload = await wppSessionRequest(auth, `/api/${encodeURIComponent(auth.sessionName)}/start-session`, { method: "POST", body: JSON.stringify({ webhook: hook.toString(), waitQrCode: true }) });
  return { ok: true, qrDataUrl: qrFromPayload(payload) };
}

export async function disconnectWppConnection(lineId: number, actor: WppActor) {
  const row = await requireLineAccess(lineId, actor);
  const auth = sessionAuthFor(row);
  await wppSessionRequest(auth, `/api/${encodeURIComponent(auth.sessionName)}/logout-session`, { method: "POST" });
  const db = await getDb();
  await db!.update(whatsappLinkedDeviceLines).set({ lifecycleState: "disconnected", healthState: "unavailable", disconnectedAt: new Date(), displayPhone: null, normalizedDisplayPhone: null }).where(eq(whatsappLinkedDeviceLines.id, lineId));
  await db!.update(whatsappLinkedDeviceSessions).set({ state: "logged_out", lastStateChangedAt: new Date() }).where(eq(whatsappLinkedDeviceSessions.lineId, lineId));
  await auditGoldWppAction(actor, "gold_whatsapp_connection_disconnected", lineId, "Gold WhatsApp connection disconnected by an authorized user.");
  return { ok: true };
}

export async function discoverWppChats(lineId: number, actor: WppActor) {
  const row = await requireLineAccess(lineId, actor);
  const auth = sessionAuthFor(row);
  const payload = await wppSessionRequest(auth, `/api/${encodeURIComponent(auth.sessionName)}/all-chats`);
  return asArray(payload).flatMap((chat) => {
    const externalChatId = normalizeChatId(chat.id || chat.chatId);
    if (!isPrivateChatId(externalChatId)) return [];
    return [{
      externalChatId,
      phone: safeChatIdentity(externalChatId),
      name: String(chat.name || chat.contact?.name || chat.contact?.pushname || chat.formattedTitle || safeChatIdentity(externalChatId)).slice(0, 256),
      timestamp: chat.t || chat.timestamp || null,
    }];
  });
}

async function importHistory(lineId: number, allowedChatId: number, externalChatId: string, ownerUserId: number, auth: WppSessionAuth) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  let cursor: string | undefined;
  let imported = 0;
  for (let page = 0; page < MAX_HISTORY_PAGES; page++) {
    const query = new URLSearchParams({ count: String(HISTORY_PAGE_SIZE), direction: "before" });
    if (cursor) query.set("id", cursor);
    const payload = await wppSessionRequest(auth, `/api/${encodeURIComponent(auth.sessionName)}/get-messages/${encodeURIComponent(externalChatId)}?${query}`)
      .catch(() => wppSessionRequest(auth, `/api/${encodeURIComponent(auth.sessionName)}/all-messages-in-chat/${encodeURIComponent(externalChatId)}`));
    const messages = asArray(payload);
    if (!messages.length) break;
    for (const message of messages) {
      const inlineMedia = mediaFromMessage(message);
      const recoveredMedia = inlineMedia ?? (declaredMediaType(message) || normalizedMime(message.mimetype ?? message.mimeType) ? await retrieveGoldMedia(auth, message) : null);
      const record = messageRecord(message, lineId, allowedChatId, ownerUserId, recoveredMedia);
      if (!record) continue;
      const result = await upsertWppMessage(record, message, recoveredMedia);
      if (Number((result[0] as any)?.affectedRows ?? 0) === 1) imported++;
    }
    const oldest = messages[messages.length - 1];
    const next = messageId(oldest);
    if (messages.length < HISTORY_PAGE_SIZE || !next || next === cursor || page > 0 && payload?.response == null) break;
    cursor = next;
  }
  const now = new Date();
  await db.update(whatsappAllowedChats).set({ lastSyncedAt: now }).where(eq(whatsappAllowedChats.id, allowedChatId));
  await db.update(whatsappLinkedDeviceLines).set({ lastSuccessfulSyncAt: now }).where(eq(whatsappLinkedDeviceLines.id, lineId));
  return imported;
}

export async function addWppChats(lineId: number, chats: Array<{ externalChatId: string; phone: string; name?: string }>, actor: WppActor) {
  const row = await requireLineAccess(lineId, actor);
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const auth = sessionAuthFor(row);
  const imports: Array<{ allowedChatId: number; externalChatId: string }> = [];
  for (const candidate of chats) {
    const externalChatId = normalizeChatId(candidate.externalChatId);
    if (!isPrivateChatId(externalChatId)) continue;
    await db.insert(whatsappAllowedChats).values({
      lineId,
      externalChatId,
      phone: (phoneFromChatId(externalChatId) ?? IDENTITY_UNAVAILABLE).slice(0, 32),
      name: candidate.name?.trim().slice(0, 256) || safeChatIdentity(externalChatId),
      enabled: true,
      addedById: actor.id,
    }).onConflictDoUpdate({ target: [whatsappAllowedChats.lineId, whatsappAllowedChats.externalChatId], set: { phone: (phoneFromChatId(externalChatId) ?? IDENTITY_UNAVAILABLE).slice(0, 32), name: candidate.name?.trim().slice(0, 256) || safeChatIdentity(externalChatId), enabled: true, updatedAt: new Date() } });
    const allowed = await db.select().from(whatsappAllowedChats).where(and(eq(whatsappAllowedChats.lineId, lineId), eq(whatsappAllowedChats.externalChatId, externalChatId))).limit(1);
    imports.push({ allowedChatId: allowed[0]!.id, externalChatId });
  }
  // History import is intentionally detached from the request so a large chat
  // never blocks the selection UI. It remains safe to retry because every page
  // upserts against (lineId, externalMessageId).
  setImmediate(() => {
    void Promise.allSettled(imports.map((item) => importHistory(lineId, item.allowedChatId, item.externalChatId, row.line.ownerUserId ?? actor.id, auth)))
      .then((results) => results.forEach((result) => { if (result.status === "rejected") console.error("[wppconnect-history] background import failed", { lineId, reason: "provider_or_storage_failure" }); }));
  });
  await auditGoldWppAction(actor, "gold_whatsapp_chats_selected", lineId, `Authorized selected-chat set updated (${imports.length} chat${imports.length === 1 ? "" : "s"}).`);
  return { added: imports.length, syncStarted: true as const };
}

export async function listAllowedWppChats(lineId: number, actor: WppActor) {
  await requireLineAccess(lineId, actor);
  const db = await getDb();
  return db!.select().from(whatsappAllowedChats).where(and(eq(whatsappAllowedChats.lineId, lineId), eq(whatsappAllowedChats.enabled, true))).orderBy(desc(whatsappAllowedChats.updatedAt));
}

export async function getWppConnectionStaff(lineId: number, actor: WppActor) {
  await requireLineAccess(lineId, actor);
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const staff = await db.select({ userId: whatsappLinkedDeviceLineStaff.userId })
    .from(whatsappLinkedDeviceLineStaff)
    .where(eq(whatsappLinkedDeviceLineStaff.lineId, lineId));
  return {
    authorizedStaffIds: staff.map((entry) => Number(entry.userId)),
    authorizedStaffCount: staff.length,
    eligibleStaff: actor.role === "admin" ? await listEligibleLinkedDeviceStaff() : [],
  };
}

export async function updateWppConnectionStaff(lineId: number, authorizedStaffIds: number[], actor: WppActor) {
  if (actor.role !== "admin") throw new Error("Administrator access is required to manage Gold WhatsApp staff.");
  await requireLineAccess(lineId, actor);
  const linkedActor = { id: actor.id, role: actor.role, name: actor.name ?? null };
  const result = await updateLinkedDeviceLineStaff({ lineId, authorizedStaffIds, actor: linkedActor });
  await auditGoldWppAction(actor, "gold_whatsapp_line_staff_updated", lineId, "Gold WhatsApp line staff assignments were updated without changing the provider session.");
  return result;
}

export async function syncAllowedWppChat(lineId: number, allowedChatId: number, actor: WppActor) {
  const row = await requireLineAccess(lineId, actor);
  const db = await getDb();
  const chats = await db!.select().from(whatsappAllowedChats).where(and(eq(whatsappAllowedChats.id, allowedChatId), eq(whatsappAllowedChats.lineId, lineId), eq(whatsappAllowedChats.enabled, true))).limit(1);
  if (!chats[0]) throw new Error("Selected WhatsApp chat is not enabled.");
  const imported = await importHistory(lineId, allowedChatId, chats[0].externalChatId, row.line.ownerUserId ?? actor.id, sessionAuthFor(row));
  await auditGoldWppAction(actor, "gold_whatsapp_chat_history_synced", lineId, "Gold WhatsApp selected-chat history synchronization completed.");
  return { imported };
}

export async function listWppMessages(lineId: number, allowedChatId: number, actor: WppActor, limit = 100) {
  await requireLineAccess(lineId, actor);
  const db = await getDb();
  const allowed = await db!.select({ id: whatsappAllowedChats.id }).from(whatsappAllowedChats).where(and(eq(whatsappAllowedChats.id, allowedChatId), eq(whatsappAllowedChats.lineId, lineId), eq(whatsappAllowedChats.enabled, true))).limit(1);
  if (!allowed[0]) throw new Error("Selected WhatsApp chat is not enabled.");
  return db!.select().from(whatsappLinkedDeviceMessages).where(and(eq(whatsappLinkedDeviceMessages.lineId, lineId), eq(whatsappLinkedDeviceMessages.allowedChatId, allowedChatId))).orderBy(desc(whatsappLinkedDeviceMessages.messageTimestamp)).limit(Math.min(Math.max(limit, 1), 250)).then((rows) => rows.reverse().map(({ mediaMetadata, mediaUrl: _mediaUrl, rawMetadata: _rawMetadata, ...row }) => ({
    ...row,
    media: safeMediaProjection(mediaMetadata),
  })));
}

export async function getAuthorizedWppMediaBytes(messageIdValue: number, action: "open" | "download", actor: WppActor) {
  const db = await getDb();
  if (!db) throw new Error("Media service is temporarily unavailable.");
  const [message] = await db.select().from(whatsappLinkedDeviceMessages)
    .where(eq(whatsappLinkedDeviceMessages.id, messageIdValue)).limit(1);
  if (!message) throw new Error("Media was not found.");
  await requireLineAccess(message.lineId, actor);
  const media = parsedMediaMetadata(message.mediaMetadata);
  const storageKey = typeof media?.storageKey === "string" ? media.storageKey : null;
  if (!storageKey || media?.storageState !== "available") throw new Error("Media is not available.");
  const file = await storageGetBytes(storageKey);
  if (!verifyGoldMediaIntegrity(file.data, media)) throw new Error("Media integrity check failed.");
  const mediaType = typeof media.mediaType === "string" ? media.mediaType : "document";
  const mimeType = typeof media.mimeType === "string" ? media.mimeType : file.contentType;
  const filename = buildMediaFilename({ originalFilename: typeof media.filename === "string" ? media.filename : null, mimeType, mediaType, seed: message.id });
  await auditGoldWppAction(actor, `gold_whatsapp_media_${action}`, message.lineId, `Authorized Gold WhatsApp media ${action} completed through the application proxy.`);
  return { data: file.data, contentType: mimeType || file.contentType || "application/octet-stream", filename };
}

export async function sendWppText(lineId: number, allowedChatId: number, text: string, actor: WppActor) {
  const row = await requireLineAccess(lineId, actor);
  const db = await getDb();
  const chats = await db!.select().from(whatsappAllowedChats).where(and(eq(whatsappAllowedChats.id, allowedChatId), eq(whatsappAllowedChats.lineId, lineId), eq(whatsappAllowedChats.enabled, true))).limit(1);
  const chat = chats[0];
  if (!chat) throw new Error("Selected WhatsApp chat is not enabled.");
  const pendingId = `pending:${randomUUID()}`;
  const [created] = await db!.insert(whatsappLinkedDeviceMessages).values({
    lineId,
    allowedChatId,
    ownerUserId: row.line.ownerUserId ?? actor.id,
    externalMessageId: pendingId,
    direction: "outgoing",
    messageType: "chat",
    text,
    sentByMe: true,
    deliveryStatus: "pending",
    messageTimestamp: new Date(),
  });
  const localId = Number((created as any).insertId);
  try {
    const auth = sessionAuthFor(row);
    const payload = await wppSessionRequest(auth, `/api/${encodeURIComponent(auth.sessionName)}/send-message`, {
      method: "POST",
      body: JSON.stringify({ phone: providerRecipient(chat.externalChatId), isGroup: false, isNewsletter: false, isLid: chat.externalChatId.endsWith("@lid"), message: text }),
    });
    const data = responseData(payload);
    const externalMessageId = messageId(data) || messageId(payload) || pendingId;
    await db!.update(whatsappLinkedDeviceMessages).set({ externalMessageId, deliveryStatus: "sent", rawMetadata: boundedRaw(data), updatedAt: new Date() }).where(eq(whatsappLinkedDeviceMessages.id, localId));
    await auditGoldWppAction(actor, "gold_whatsapp_text_accepted", lineId, "Gold WhatsApp text was accepted by the provider; message content is not recorded in audit metadata.");
    return { id: localId, externalMessageId, status: "sent" as const };
  } catch (error) {
    await db!.update(whatsappLinkedDeviceMessages).set({ deliveryStatus: "error", rawMetadata: { error: safeProviderError(error) }, updatedAt: new Date() }).where(eq(whatsappLinkedDeviceMessages.id, localId));
    throw new Error(safeProviderError(error));
  }
}

const SUPPORTED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const SUPPORTED_FILE_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
  "text/plain",
  "text/markdown",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

function outboundMediaEndpoint(mimeType: string, mode: "file" | "ptt" = "file") {
  if (mode === "ptt") return mimeType === "audio/ogg" ? "send-voice-base64" : null;
  if (SUPPORTED_IMAGE_MIME.has(mimeType)) return "send-image";
  if (SUPPORTED_FILE_MIME.has(mimeType)) return "send-file-base64";
  return null;
}

export async function sendWppMedia(input: { lineId: number; allowedChatId: number; fileBase64: string; mimeType: string; filename: string; caption?: string; mode?: "file" | "ptt"; actor: WppActor }) {
  const row = await requireLineAccess(input.lineId, input.actor);
  const db = await getDb();
  const chats = await db!.select().from(whatsappAllowedChats).where(and(eq(whatsappAllowedChats.id, input.allowedChatId), eq(whatsappAllowedChats.lineId, input.lineId), eq(whatsappAllowedChats.enabled, true))).limit(1);
  const chat = chats[0];
  if (!chat) throw new Error("Selected WhatsApp chat is not enabled.");
  const mimeType = normalizedMime(input.mimeType);
  const mode = input.mode ?? "file";
  const endpoint = outboundMediaEndpoint(mimeType, mode);
  if (!endpoint) throw new Error(mode === "ptt" ? "Voice notes require an OGG/Opus recording supported by this browser." : "This attachment type is not supported. Use an image, PDF, document, audio, or video file.");
  if (endpoint === "send-voice-base64" && chat.externalChatId.endsWith("@lid")) throw new Error("Voice notes are unavailable for unresolved WhatsApp identities.");
  const decoded = canonicalBase64(input.fileBase64);
  if (!decoded || decoded.bytes.length > MAX_MEDIA_BYTES) throw new Error("Attachment must be a valid file no larger than 15 MB.");
  const filename = buildMediaFilename({ originalFilename: input.filename, mimeType, mediaType: mimeType.split("/", 1)[0], seed: randomUUID() });
  const pendingId = `pending:${randomUUID()}`;
  const [created] = await db!.insert(whatsappLinkedDeviceMessages).values({
    lineId: input.lineId,
    allowedChatId: input.allowedChatId,
    ownerUserId: row.line.ownerUserId ?? input.actor.id,
    externalMessageId: pendingId,
    direction: "outgoing",
    messageType: mode === "ptt" ? "ptt" : mimeType.slice(0, 64),
    text: input.caption?.trim() || null,
    mediaMetadata: { filename, mimeType, size: decoded.bytes.length, storageState: "outbound_provider" },
    sentByMe: true,
    deliveryStatus: "pending",
    messageTimestamp: new Date(),
  });
  const localId = Number((created as any).insertId);
  try {
    const auth = sessionAuthFor(row);
    const payload = await wppSessionRequest(auth, `/api/${encodeURIComponent(auth.sessionName)}/${endpoint}`, {
      method: "POST",
      body: JSON.stringify(endpoint === "send-voice-base64"
        ? { phone: providerRecipient(chat.externalChatId), isGroup: false, base64Ptt: decoded.base64 }
        : {
          phone: providerRecipient(chat.externalChatId),
          isGroup: false,
          isNewsletter: false,
          isLid: chat.externalChatId.endsWith("@lid"),
          filename,
          caption: input.caption ?? "",
          base64: endpoint === "send-image" ? `data:${mimeType};base64,${decoded.base64}` : decoded.base64,
        }),
    });
    const data = responseData(payload);
    const externalMessageId = messageId(data) || messageId(payload) || pendingId;
    await db!.update(whatsappLinkedDeviceMessages).set({ externalMessageId, deliveryStatus: "sent", rawMetadata: boundedRaw(data), updatedAt: new Date() }).where(eq(whatsappLinkedDeviceMessages.id, localId));
    await auditGoldWppAction(input.actor, "gold_whatsapp_media_accepted", input.lineId, "Gold WhatsApp media was accepted by the provider; attachment content is not recorded in audit metadata.");
    return { id: localId, externalMessageId, status: "sent" as const };
  } catch (error) {
    await db!.update(whatsappLinkedDeviceMessages).set({ deliveryStatus: "error", rawMetadata: { error: safeProviderError(error) }, updatedAt: new Date() }).where(eq(whatsappLinkedDeviceMessages.id, localId));
    throw new Error(safeProviderError(error));
  }
}

export function verifyWppWebhookSecret(received: unknown) {
  const expected = process.env.WPPCONNECT_WEBHOOK_SECRET ?? "";
  const actual = typeof received === "string" ? received : "";
  if (!expected || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

function webhookMessage(payload: JsonRecord): JsonRecord | null {
  const data = payload?.data;
  const response = payload?.response;
  const candidates = [
    payload,
    payload?.message,
    data?.message,
    response?.message,
    data?.data,
    response?.data,
    data,
    response,
  ];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    if (messageId(candidate as JsonRecord) || (candidate as JsonRecord).from || (candidate as JsonRecord).chatId) return candidate as JsonRecord;
  }
  return null;
}

function deliveryStatusFromWebhook(message: JsonRecord) {
  const value = message.ackName ?? message.status ?? message.ack ?? message.ackType;
  return typeof value === "string" || typeof value === "number" ? String(value).slice(0, 64) : null;
}

export async function handleWppWebhook(payload: any) {
  const safePayload = payload && typeof payload === "object" ? payload as JsonRecord : {};
  const event = String(safePayload.event ?? safePayload.type ?? safePayload.webhook ?? "").toLowerCase();
  const sessionName = String(safePayload.session ?? safePayload.sessionName ?? safePayload.data?.session ?? safePayload.response?.session ?? "");
  if (!sessionName) return { ignored: true, reason: "missing_session" };
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const sessions = await db.select({ session: whatsappLinkedDeviceSessions, line: whatsappLinkedDeviceLines, credential: whatsappLinkedDeviceCredentials })
    .from(whatsappLinkedDeviceSessions)
    .innerJoin(whatsappLinkedDeviceLines, eq(whatsappLinkedDeviceLines.id, whatsappLinkedDeviceSessions.lineId))
    .leftJoin(whatsappLinkedDeviceCredentials, eq(whatsappLinkedDeviceCredentials.lineId, whatsappLinkedDeviceLines.id))
    .where(and(eq(whatsappLinkedDeviceSessions.sessionName, sessionName), eq(whatsappLinkedDeviceLines.adapterKind, ADAPTER_KIND))).limit(1);
  const binding = sessions[0];
  if (!binding) return { ignored: true, reason: "unknown_session" };
  if (event.includes("status") || event.includes("state") || event.includes("connection")) {
    const connected = connectedFromPayload(safePayload);
    await db.update(whatsappLinkedDeviceLines).set({ lifecycleState: connected ? "connected" : "reconnecting", healthState: connected ? "healthy" : "degraded", lastSeenAt: new Date() }).where(eq(whatsappLinkedDeviceLines.id, binding.line.id));
    await db.update(whatsappLinkedDeviceSessions).set({ state: connected ? "connected" : "reconnecting", lastActivityAt: new Date(), lastStateChangedAt: new Date() }).where(eq(whatsappLinkedDeviceSessions.id, binding.session.id));
    return { accepted: true, kind: "status" };
  }
  const message = webhookMessage(safePayload);
  if (event.includes("ack")) {
    const externalMessageId = message ? messageId(message) : "";
    const deliveryStatus = message ? deliveryStatusFromWebhook(message) : null;
    if (!externalMessageId || !deliveryStatus) return { ignored: true, reason: "missing_ack_reference" };
    await db.update(whatsappLinkedDeviceMessages).set({ deliveryStatus, updatedAt: new Date() })
      .where(and(eq(whatsappLinkedDeviceMessages.lineId, binding.line.id), eq(whatsappLinkedDeviceMessages.externalMessageId, externalMessageId)));
    await db.update(whatsappLinkedDeviceSessions).set({ lastActivityAt: new Date() }).where(eq(whatsappLinkedDeviceSessions.id, binding.session.id));
    return { accepted: true, kind: "ack" };
  }
  if (!event.includes("message") && !event.includes("onmessage")) return { ignored: true, reason: "unsupported_event" };
  if (!message) return { ignored: true, reason: "missing_message" };
  const externalChatId = messageChatId(message);
  if (!externalChatId) return { ignored: true, reason: "missing_chat" };
  if (!isPrivateChatId(externalChatId)) return { ignored: true, reason: "source_not_private" };
  const allowed = await db.select().from(whatsappAllowedChats).where(and(eq(whatsappAllowedChats.lineId, binding.line.id), eq(whatsappAllowedChats.externalChatId, externalChatId), eq(whatsappAllowedChats.enabled, true))).limit(1);
  if (!allowed[0]) return { ignored: true, reason: "chat_not_allowed" };
  const inlineMedia = mediaFromMessage(message);
  const auth: WppSessionAuth = { lineId: binding.line.id, sessionName, encryptedCredential: binding.credential?.encryptedCredential };
  const recoveredMedia = inlineMedia ?? (declaredMediaType(message) || normalizedMime(message.mimetype ?? message.mimeType) ? await retrieveGoldMedia(auth, message) : null);
  const record = messageRecord(message, binding.line.id, allowed[0].id, binding.line.ownerUserId ?? binding.line.createdById, recoveredMedia);
  if (!record) return { ignored: true, reason: "missing_message_id" };
  await upsertWppMessage(record, message, recoveredMedia);
  await db.update(whatsappLinkedDeviceSessions).set({ lastActivityAt: new Date() }).where(eq(whatsappLinkedDeviceSessions.id, binding.session.id));
  emitGoldConversationEvent(binding.line.id, { kind: "message", allowedChatId: allowed[0].id, externalMessageId: record.externalMessageId });
  return { accepted: true, kind: "message" };
}

export const wppConnectTestHelpers = {
  providerValue,
  connectedFromPayload,
  generatedTokenFromPayload,
  isSessionAuthError,
  messageChatId,
  messageRecord,
  canonicalBase64,
  isPrivateChatId,
  mediaFromMessage,
  mediaFromDownloadedBytes,
  verifyGoldMediaIntegrity,
  outboundMediaEndpoint,
  accountPhoneFromValue,
  phoneFromChatId,
  qrFromPayload,
  redactedEndpointPath,
  safeChatIdentity,
  webhookMessage,
};
