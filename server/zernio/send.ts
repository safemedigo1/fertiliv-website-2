import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { whatsappConversations, whatsappLinkedDeviceLines } from "../../drizzle/schema";
import { getDb } from "../db";
import { isDirectUploadStorageConfigured, storageDelete, storageGetBytes, storageHead, storagePresignGet, storagePut, storagePutExact } from "../storage";
import { INBOX_UPLOAD_PART_BYTES, INBOX_UPLOAD_PART_MAX, isInboxUploadId, isOwnedOutboundUploadKey, outboundBytesMatchMime, outboundMediaLimit, outboundPartKey, outboundUploadToken, prepareOutboundVoice, sanitizeUploadFileName } from "./outboundMedia";
import { randomBytes } from "node:crypto";
import { canUserAccessLinkedDeviceLine } from "../whatsappLinkedDevice";
import { markZernioRead, sendZernioMedia, sendZernioReaction, sendZernioTemplate, sendZernioText, sendZernioTyping } from "./client";
import { isInsideWhatsAppWindow } from "./envelope";
import { applyZernioReaction, lastInboundAt, upsertZernioMessage } from "./store";
import type { ZernioEnvelope } from "./envelope";

type Actor = { id: number; role: string };

async function authorizedZernioConversation(conversationId: number, actor: Actor) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const [row] = await db.select({
    id: whatsappConversations.id,
    provider: whatsappConversations.provider,
    accountId: whatsappConversations.providerPhoneNumberId,
    threadId: whatsappConversations.providerThreadId,
    lineId: whatsappLinkedDeviceLines.id,
  }).from(whatsappConversations).leftJoin(
    whatsappLinkedDeviceLines,
    eq(whatsappLinkedDeviceLines.connectionId, whatsappConversations.connectionId),
  ).where(eq(whatsappConversations.id, conversationId)).limit(1);
  if (!row || row.provider !== "zernio" || !row.threadId) return null;
  if (!row.lineId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect WhatsApp before sending." });
  const allowed = await canUserAccessLinkedDeviceLine({ lineId: row.lineId, userId: actor.id, userRole: actor.role });
  if (!allowed) throw new TRPCError({ code: "FORBIDDEN", message: "You cannot use this WhatsApp line." });
  return { accountId: row.accountId, threadId: row.threadId, conversationId: row.id };
}

async function requireWindow(conversationId: number) {
  const open = isInsideWhatsAppWindow(await lastInboundAt(conversationId));
  if (!open) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "This chat is outside the 24-hour window. Send an approved template instead.",
    });
  }
}

function rememberedEnvelope(input: { accountId: string; threadId: string; messageId: string; body: string; messageType: string }): ZernioEnvelope {
  return {
    externalConversationId: input.threadId,
    externalMessageId: input.messageId,
    accountId: input.accountId,
    body: input.body,
    sentAt: new Date(),
    direction: "outgoing",
    messageType: input.messageType,
    mediaUrl: null,
    mimeType: null,
    filename: null,
    replyToMessageId: null,
    reactionEmoji: null,
    reactionRemoved: false,
    reactionTargetId: null,
    reactionTargetIds: [],
    messageIds: [input.messageId],
    attachments: [],
    contacts: [],
    reactions: null,
    participantPhone: null,
    participantName: null,
    localStorageKey: null,
  };
}

export async function sendZernioInboxText(input: { conversationId: number; text: string; idempotencyKey: string; actor: Actor }) {
  const conversation = await authorizedZernioConversation(input.conversationId, input.actor);
  if (!conversation) return null;
  await requireWindow(input.conversationId);
  const sent = await sendZernioText({
    conversationId: conversation.threadId,
    accountId: conversation.accountId,
    message: input.text,
    idempotencyKey: input.idempotencyKey,
  });
  const messageId = sent.id ?? sent.messageId ?? input.idempotencyKey;
  await upsertZernioMessage({
    envelope: rememberedEnvelope({ accountId: conversation.accountId, threadId: conversation.threadId, messageId, body: input.text, messageType: "text" }),
    payloadHash: input.idempotencyKey,
    eventKey: `send:${input.idempotencyKey}`,
  });
  console.info("[zernio] text accepted", { conversationId: input.conversationId });
  return { ok: true };
}

export async function prepareZernioMediaUpload(input: {
  conversationId: number;
  filename: string;
  mimeType: string;
  byteSize: number;
  actor: Actor;
}) {
  const conversation = await authorizedZernioConversation(input.conversationId, input.actor);
  if (!conversation) return { mode: "inline" as const };
  await requireWindow(input.conversationId);
  const kind = mediaKind(input.mimeType, input.filename);
  if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > outboundMediaLimit(kind)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That file is empty or larger than WhatsApp allows for this type." });
  }
  if (!isDirectUploadStorageConfigured()) return { mode: "inline" as const };
  const accountKey = conversation.accountId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  if (accountKey.length < 6) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect WhatsApp before sending." });
  const uploadId = randomBytes(16).toString("hex");
  const storageKey = `whatsapp-outbound/${accountKey}/${uploadId}/${sanitizeUploadFileName(input.filename)}`;
  console.info("[inbox] media upload prepared", { conversationId: input.conversationId, byteSize: input.byteSize, kind });
  return { mode: "parts" as const, storageKey, uploadId, partSize: INBOX_UPLOAD_PART_BYTES };
}

async function readOutboundBytes(input: { fileBase64?: string; storageKey?: string; byteSize?: number }, accountId: string) {
  if (input.storageKey) {
    const accountKey = accountId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
    if (accountKey.length < 6 || !isOwnedOutboundUploadKey(input.storageKey, accountKey) || !input.byteSize) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the file again." });
    }
    const head = await storageHead(input.storageKey);
    if (!head || head.contentLength !== input.byteSize) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The upload expired. Choose the file again." });
    }
    const loaded = await storageGetBytes(input.storageKey);
    if (loaded.data.length !== input.byteSize) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file did not match. Choose it again." });
    }
    return loaded.data;
  }
  const bytes = Buffer.from(input.fileBase64 ?? "", "base64");
  if (!input.fileBase64 || bytes.length === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose an attachment before sending." });
  }
  return bytes;
}

async function ownedUpload(conversationId: number, storageKey: string, actor: Actor) {
  const conversation = await authorizedZernioConversation(conversationId, actor);
  if (!conversation) throw new TRPCError({ code: "BAD_REQUEST", message: "This conversation is not a Zernio WhatsApp chat." });
  const accountKey = conversation.accountId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
  if (accountKey.length < 6 || !isOwnedOutboundUploadKey(storageKey, accountKey)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the file again." });
  }
  return conversation;
}

export async function uploadZernioMediaPart(input: {
  conversationId: number;
  storageKey: string;
  uploadId: string;
  partNumber: number;
  fileBase64: string;
  actor: Actor;
}) {
  await ownedUpload(input.conversationId, input.storageKey, input.actor);
  const partKey = outboundPartKey(input.storageKey, input.partNumber);
  if (!partKey || input.uploadId !== outboundUploadToken(input.storageKey) || !isInboxUploadId(input.uploadId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the file again." });
  }
  const bytes = Buffer.from(input.fileBase64, "base64");
  if (bytes.length === 0 || bytes.length > INBOX_UPLOAD_PART_BYTES) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This attachment is too large to send." });
  }
  await storagePutExact(partKey, bytes);
  console.info("[inbox] media upload part stored", { conversationId: input.conversationId, partNumber: input.partNumber, bytes: bytes.length });
  return { ok: true };
}

async function discardOutboundParts(storageKey: string) {
  await Promise.all(Array.from({ length: INBOX_UPLOAD_PART_MAX }, (_, index) => {
    const key = outboundPartKey(storageKey, index + 1);
    return key ? storageDelete(key) : Promise.resolve(false);
  }));
}

export async function abortZernioMediaUpload(input: { conversationId: number; storageKey: string; uploadId: string; actor: Actor }) {
  await ownedUpload(input.conversationId, input.storageKey, input.actor);
  if (input.uploadId !== outboundUploadToken(input.storageKey)) return { ok: false };
  await discardOutboundParts(input.storageKey);
  return { ok: true };
}

async function assembleOutboundParts(storageKey: string, uploadId: string, byteSize: number | undefined) {
  if (uploadId !== outboundUploadToken(storageKey) || !byteSize) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the file again." });
  }
  const count = Math.ceil(byteSize / INBOX_UPLOAD_PART_BYTES);
  if (count < 1 || count > INBOX_UPLOAD_PART_MAX) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That file is empty or larger than WhatsApp allows for this type." });
  }
  const chunks: Buffer[] = [];
  for (let part = 1; part <= count; part += 1) {
    const key = outboundPartKey(storageKey, part);
    if (!key) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the file again." });
    let data: Buffer;
    try {
      data = (await storageGetBytes(key)).data;
    } catch {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The file could not be uploaded. Try again." });
    }
    const expected = part < count ? INBOX_UPLOAD_PART_BYTES : byteSize - (count - 1) * INBOX_UPLOAD_PART_BYTES;
    if (data.length !== expected) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file did not match. Choose it again." });
    }
    chunks.push(data);
  }
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== byteSize) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file did not match. Choose it again." });
  }
  return bytes;
}

export async function sendZernioInboxMedia(input: {
  conversationId: number;
  fileBase64?: string;
  storageKey?: string;
  uploadId?: string;
  byteSize?: number;
  mimeType: string;
  filename: string;
  caption?: string;
  idempotencyKey: string;
  actor: Actor;
}) {
  const conversation = await authorizedZernioConversation(input.conversationId, input.actor);
  if (!conversation) return null;
  await requireWindow(input.conversationId);
  let uploaded: Buffer;
  if (input.uploadId) {
    if (!input.storageKey || !isInboxUploadId(input.uploadId)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Choose the file again." });
    }
    try {
      uploaded = await assembleOutboundParts(input.storageKey, input.uploadId, input.byteSize);
    } catch (error) {
      await discardOutboundParts(input.storageKey);
      throw error;
    }
  } else {
    uploaded = await readOutboundBytes(input, conversation.accountId);
  }
  const kind = mediaKind(input.mimeType, input.filename);
  if (!outboundBytesMatchMime(uploaded, input.mimeType)) {
    if (input.uploadId && input.storageKey) await discardOutboundParts(input.storageKey);
    else if (input.storageKey) await storageDelete(input.storageKey);
    throw new TRPCError({ code: "BAD_REQUEST", message: "This file does not match its type. Choose it again." });
  }
  const voice = prepareOutboundVoice(uploaded, input.mimeType, input.filename);
  if (voice.bytes.length === 0 || voice.bytes.length > outboundMediaLimit(voice.voiceNote ? "audio" : kind)) {
    if (input.uploadId && input.storageKey) await discardOutboundParts(input.storageKey);
    throw new TRPCError({ code: "BAD_REQUEST", message: "That file is empty or larger than WhatsApp allows for this type." });
  }
  const reuseUpload = Boolean(input.storageKey) && !input.uploadId && !voice.voiceNote && voice.bytes === uploaded;
  const stored = reuseUpload
    ? { key: input.storageKey as string }
    : await storagePut(`whatsapp/${conversation.accountId}/${voice.filename}`, voice.bytes, voice.mimeType, voice.filename);
  if (input.uploadId && input.storageKey) await discardOutboundParts(input.storageKey);
  else if (input.storageKey && stored.key !== input.storageKey) await storageDelete(input.storageKey);
  const attachmentUrl = await storagePresignGet(stored.key, 600);
  const sent = await sendZernioMedia({
    conversationId: conversation.threadId,
    accountId: conversation.accountId,
    attachmentUrl,
    attachmentType: voice.voiceNote ? "audio" : kind,
    message: input.caption,
    voiceNote: voice.voiceNote,
    idempotencyKey: input.idempotencyKey,
  });
  const messageId = sent.id ?? sent.messageId ?? input.idempotencyKey;
  await upsertZernioMessage({
    envelope: {
      ...rememberedEnvelope({ accountId: conversation.accountId, threadId: conversation.threadId, messageId, body: input.caption ?? "", messageType: voice.voiceNote ? "voice" : kind }),
      mediaUrl: null,
      mimeType: voice.mimeType,
      filename: voice.filename,
      localStorageKey: stored.key,
      attachments: [{
        type: voice.voiceNote ? "voice" : kind,
        url: null,
        mimeType: voice.mimeType,
        filename: voice.filename,
        mediaId: null,
      }],
    },
    payloadHash: input.idempotencyKey,
    eventKey: `media:${input.idempotencyKey}`,
  });
  console.info("[zernio] media accepted", { conversationId: input.conversationId, kind, bytes: voice.bytes.length });
  return { ok: true };
}

export async function sendZernioInboxTemplate(input: {
  conversationId: number;
  templateName: string;
  language: string;
  variables: string[];
  idempotencyKey: string;
  actor: Actor;
}) {
  const conversation = await authorizedZernioConversation(input.conversationId, input.actor);
  if (!conversation) throw new TRPCError({ code: "BAD_REQUEST", message: "This conversation is not a Zernio WhatsApp chat." });
  await sendZernioTemplate({
    conversationId: conversation.threadId,
    accountId: conversation.accountId,
    templateName: input.templateName,
    language: input.language,
    variables: input.variables,
    idempotencyKey: input.idempotencyKey,
  });
  console.info("[zernio] template accepted", { conversationId: input.conversationId });
  return { ok: true };
}

export async function reactToZernioMessage(input: { conversationId: number; providerMessageId: string; emoji: string; actor: Actor }) {
  const conversation = await authorizedZernioConversation(input.conversationId, input.actor);
  if (!conversation) throw new TRPCError({ code: "BAD_REQUEST", message: "This conversation is not a Zernio WhatsApp chat." });
  await sendZernioReaction({
    conversationId: conversation.threadId,
    accountId: conversation.accountId,
    messageId: input.providerMessageId,
    emoji: input.emoji,
  });
  await applyZernioReaction({
    accountId: conversation.accountId,
    targetMessageIds: [input.providerMessageId],
    emoji: input.emoji,
  });
  return { ok: true };
}

export async function notifyZernioTyping(input: { conversationId: number; actor: Actor }) {
  const conversation = await authorizedZernioConversation(input.conversationId, input.actor);
  if (!conversation) return { ok: false };
  await sendZernioTyping({ conversationId: conversation.threadId, accountId: conversation.accountId });
  return { ok: true };
}

export async function markZernioConversationRead(input: { conversationId: number; actor: Actor }) {
  const conversation = await authorizedZernioConversation(input.conversationId, input.actor);
  if (!conversation) return { ok: false };
  await markZernioRead({ conversationId: conversation.threadId, accountId: conversation.accountId });
  return { ok: true };
}

function mediaKind(mimeType: string, filename: string): "image" | "video" | "audio" | "document" {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/") || filename.toLowerCase().endsWith(".ogg")) return "audio";
  return "document";
}
