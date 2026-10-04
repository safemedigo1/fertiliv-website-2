import { createHash } from "crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  users,
  whatsappCommunicationEndpoints,
  whatsappConnections,
  whatsappConversationMessages,
  whatsappConversationParticipants,
  whatsappConversations,
  whatsappLinkedDeviceLines,
  whatsappNormalizedMedia,
  whatsappNormalizedMessages,
  whatsappNormalizedStatuses,
  whatsappProviderEventBatches,
  whatsappProviderEvents,
  zernioWebhookEvents,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { normalizeInboxDirectPhone } from "../../shared/unifiedInbox";
import type { ZernioEnvelope } from "./envelope";
import { storeInboundZernioMedia } from "./mediaCustody";

const CLINIC = "fertiliv";

export function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function key64(value: string): string {
  return digest(value).slice(0, 64);
}

export async function claimZernioEvent(input: { eventId: string; eventType: string; payloadHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("database_unavailable");
  try {
    const inserted = await db.insert(zernioWebhookEvents).values({
      provider: "zernio",
      eventId: input.eventId.slice(0, 191),
      eventType: input.eventType.slice(0, 128),
      payloadHash: input.payloadHash,
      status: "processing",
    }).returning({ id: zernioWebhookEvents.id });
    return { duplicate: false, id: inserted[0]?.id ?? 0 };
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code;
    if (code === "23505" || /duplicate|unique/i.test(error instanceof Error ? error.message : "")) {
      return { duplicate: true, id: 0 };
    }
    throw error;
  }
}

export async function finishZernioEvent(eventId: string, status: "processed" | "ignored" | "failed") {
  const db = await getDb();
  if (!db) return;
  await db.update(zernioWebhookEvents).set({ status, processedAt: new Date() }).where(and(
    eq(zernioWebhookEvents.provider, "zernio"),
    eq(zernioWebhookEvents.eventId, eventId.slice(0, 191)),
  ));
}

/** Label safe to show to signed-in staff. Never log the result; it can be a phone number. */
export function publicWhatsAppLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!cleaned || /^whatsapp$/i.test(cleaned)) return null;
  if (/[<>]/.test(cleaned) || /https?:/i.test(cleaned)) return null;
  return cleaned;
}

export async function ensureZernioConnection(accountId: string, createdById: number | null, displayName?: string | null) {
  const db = await getDb();
  if (!db) throw new Error("database_unavailable");
  const providerPhoneNumberId = accountId.slice(0, 128);
  const label = publicWhatsAppLabel(displayName);
  await db.insert(whatsappConnections).values({
    clinicScope: CLINIC,
    provider: "zernio",
    onboardingMethod: "zernio",
    providerPhoneNumberId,
    displayName: label ?? "WhatsApp",
    credentialSource: "secret_reference",
    credentialRef: "env:ZERNIO_API_KEY",
    lifecycleStatus: "connected",
    healthState: "healthy",
    createdById,
  }).onConflictDoUpdate({
    target: [whatsappConnections.provider, whatsappConnections.providerPhoneNumberId],
    set: {
      lifecycleStatus: "connected",
      healthState: "healthy",
      updatedAt: new Date(),
      ...(label ? { displayName: label } : {}),
    },
  });
  const [connection] = await db.select().from(whatsappConnections).where(and(
    eq(whatsappConnections.provider, "zernio"),
    eq(whatsappConnections.providerPhoneNumberId, providerPhoneNumberId),
  )).limit(1);
  if (!connection) throw new Error("zernio_connection_missing");
  return connection;
}

export async function ensureZernioLine(accountId: string, actorUserId: number, displayName?: string | null) {
  const connection = await ensureZernioConnection(accountId, actorUserId, displayName);
  const db = await getDb();
  if (!db) throw new Error("database_unavailable");
  const lineName = `WhatsApp ${accountId.slice(0, 12)}`;
  await db.insert(whatsappLinkedDeviceLines).values({
    clinicScope: CLINIC,
    lineName,
    connectionId: connection.id,
    providerApprovalState: "approved",
    adapterKind: "zernio",
    lifecycleState: "connected",
    healthState: "healthy",
    connectedAt: new Date(),
    ownerUserId: actorUserId,
    createdById: actorUserId,
  }).onConflictDoUpdate({
    target: [whatsappLinkedDeviceLines.clinicScope, whatsappLinkedDeviceLines.lineName],
    set: { connectionId: connection.id, lifecycleState: "connected", healthState: "healthy", updatedAt: new Date() },
  });
  return connection;
}

export async function connectedZernioSummary(): Promise<{ connected: boolean; displayName: string | null }> {
  const db = await getDb();
  if (!db) return { connected: false, displayName: null };
  const [row] = await db.select({ displayName: whatsappConnections.displayName }).from(whatsappConnections).where(and(
    eq(whatsappConnections.provider, "zernio"),
    eq(whatsappConnections.lifecycleStatus, "connected"),
  )).orderBy(desc(whatsappConnections.updatedAt)).limit(1);
  if (!row) return { connected: false, displayName: null };
  return { connected: true, displayName: publicWhatsAppLabel(row.displayName) };
}

export async function markZernioAccountDisconnected(accountId: string) {
  const db = await getDb();
  if (!db) return;
  const providerPhoneNumberId = accountId.slice(0, 128);
  const connections = await db.select({ id: whatsappConnections.id }).from(whatsappConnections).where(and(
    eq(whatsappConnections.provider, "zernio"),
    eq(whatsappConnections.providerPhoneNumberId, providerPhoneNumberId),
  ));
  await db.update(whatsappConnections).set({
    lifecycleStatus: "disconnected",
    healthState: "unavailable",
    updatedAt: new Date(),
  }).where(and(eq(whatsappConnections.provider, "zernio"), eq(whatsappConnections.providerPhoneNumberId, providerPhoneNumberId)));
  const connectionIds = connections.map((row) => row.id);
  if (connectionIds.length === 0) return;
  await db.update(whatsappLinkedDeviceLines).set({
    lifecycleState: "disconnected",
    healthState: "unavailable",
    disconnectedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(whatsappLinkedDeviceLines.adapterKind, "zernio"),
    inArray(whatsappLinkedDeviceLines.connectionId, connectionIds),
  ));
}

/** Remove the clinic WhatsApp number from Zernio and mark the local connection disconnected. */
export async function disconnectZernioWhatsApp(): Promise<{ ok: true; disconnected: number }> {
  const db = await getDb();
  if (!db) throw new Error("database_unavailable");
  const rows = await db.select({
    id: whatsappConnections.id,
    accountId: whatsappConnections.providerPhoneNumberId,
  }).from(whatsappConnections).where(and(
    eq(whatsappConnections.provider, "zernio"),
    eq(whatsappConnections.lifecycleStatus, "connected"),
  ));
  if (rows.length === 0) throw new Error("whatsapp_not_connected");
  const { deleteZernioAccount } = await import("./client");
  let removed = 0;
  for (const row of rows) {
    try {
      await deleteZernioAccount(row.accountId);
      removed += 1;
    } catch (error) {
      console.warn("[zernio] account delete failed", { reason: error instanceof Error ? error.name : "error" });
    }
    await markZernioAccountDisconnected(row.accountId);
  }
  console.info("[zernio] whatsapp disconnected", { connections: rows.length, removed });
  return { ok: true, disconnected: rows.length };
}

async function sourceEventId(input: { accountId: string; eventKey: string; connectionId: number; payloadHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("database_unavailable");
  await db.insert(whatsappProviderEventBatches).values({
    provider: "zernio",
    rawPayloadDigest: input.payloadHash,
    rawPayload: "{\"retained\":\"hash-only\"}",
    signatureValid: true,
  }).onConflictDoUpdate({
    target: [whatsappProviderEventBatches.provider, whatsappProviderEventBatches.rawPayloadDigest],
    set: { lastReceivedAt: new Date() },
  });
  const [batch] = await db.select({ id: whatsappProviderEventBatches.id }).from(whatsappProviderEventBatches).where(and(
    eq(whatsappProviderEventBatches.provider, "zernio"),
    eq(whatsappProviderEventBatches.rawPayloadDigest, input.payloadHash),
  )).limit(1);
  if (!batch) throw new Error("zernio_batch_missing");
  await db.insert(whatsappProviderEvents).values({
    batchId: batch.id,
    connectionId: input.connectionId,
    connectionRoute: "persisted",
    provider: "zernio",
    providerPhoneNumberId: input.accountId.slice(0, 128),
    providerField: "inbox",
    providerEventKey: input.eventKey.slice(0, 128),
    routingState: "resolved",
    processingState: "applied",
    processedAt: new Date(),
  }).onConflictDoUpdate({
    target: [whatsappProviderEvents.provider, whatsappProviderEvents.providerEventKey],
    set: { processingState: "applied", processedAt: new Date(), updatedAt: new Date() },
  });
  const [event] = await db.select({ id: whatsappProviderEvents.id }).from(whatsappProviderEvents).where(and(
    eq(whatsappProviderEvents.provider, "zernio"),
    eq(whatsappProviderEvents.providerEventKey, input.eventKey.slice(0, 128)),
  )).limit(1);
  if (!event) throw new Error("zernio_event_missing");
  return event.id;
}

async function adoptZernioParticipant(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  input: { conversationId: number; conversationKey: string; envelope: ZernioEnvelope; contactLabel: string | null },
): Promise<string> {
  const [existing] = await db.select({
    id: whatsappConversationParticipants.id,
    providerParticipantId: whatsappConversationParticipants.providerParticipantId,
  }).from(whatsappConversationParticipants).where(and(
    eq(whatsappConversationParticipants.conversationId, input.conversationId),
    eq(whatsappConversationParticipants.participantRole, "remote_endpoint"),
  )).limit(1);
  const keptPhone = input.envelope.participantPhone
    ?? (normalizeInboxDirectPhone(existing?.providerParticipantId ?? "") ? existing?.providerParticipantId ?? null : null);
  const participantId = (keptPhone ?? input.envelope.externalConversationId).slice(0, 128);
  if (!existing) return participantId;
  await db.update(whatsappConversationParticipants).set({
    providerParticipantId: participantId,
    participantKey: key64(`participant:${input.conversationKey}:${participantId}`),
    lastSeenAt: input.envelope.sentAt,
    updatedAt: new Date(),
    ...(input.contactLabel ? { providerHintDigest: input.contactLabel } : {}),
  }).where(eq(whatsappConversationParticipants.id, existing.id));
  return participantId;
}

function asContent(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function contentPatch(envelope: ZernioEnvelope): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (envelope.replyToMessageId) patch.replyToMessageId = envelope.replyToMessageId;
  const label = publicWhatsAppLabel(envelope.participantName)?.slice(0, 64) ?? null;
  if (label) patch.participantName = label;
  if (envelope.reactions) patch.reactions = envelope.reactions;
  const contact = envelope.contacts[0];
  if (contact) patch.contact = { name: contact.name, phone: contact.phone };
  return patch;
}

function mergedContent(current: unknown, envelope: ZernioEnvelope): Record<string, unknown> {
  return { ...asContent(current), ...contentPatch(envelope) };
}

async function persistZernioMedia(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  input: { eventId: number; connectionId: number | null; accountId: string; providerItemKey: string; conversationId: number; envelope: ZernioEnvelope },
) {
  const attachments = input.envelope.attachments.length
    ? input.envelope.attachments
    : input.envelope.localStorageKey || input.envelope.mediaUrl
      ? [{
        type: input.envelope.messageType,
        url: input.envelope.mediaUrl,
        mimeType: input.envelope.mimeType,
        filename: input.envelope.filename,
        mediaId: null,
      }]
      : [];
  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    const mediaKey = (index === 0 ? key64(`media:${input.providerItemKey}`) : key64(`media:${input.providerItemKey}:${index}`)).slice(0, 128);
    await db.insert(whatsappNormalizedMedia).values({
      sourceEventId: input.eventId,
      connectionId: input.connectionId,
      connectionRoute: "persisted",
      provider: "zernio",
      providerPhoneNumberId: input.accountId.slice(0, 128),
      sourceMessageItemKey: input.providerItemKey,
      providerMediaItemKey: mediaKey,
      providerMediaId: attachment.mediaId?.slice(0, 128) ?? null,
      mediaType: input.envelope.messageType.slice(0, 64),
      mimeType: attachment.mimeType?.slice(0, 128) ?? null,
      filename: attachment.filename?.slice(0, 512) ?? null,
      caption: input.envelope.body.slice(0, 2000) || null,
      mediaState: "metadata_only",
    }).onConflictDoUpdate({
      target: [whatsappNormalizedMedia.provider, whatsappNormalizedMedia.providerMediaItemKey],
      set: {
        filename: attachment.filename?.slice(0, 512) ?? null,
        mimeType: attachment.mimeType?.slice(0, 128) ?? null,
        mediaType: input.envelope.messageType.slice(0, 64),
      },
    });
    const [media] = await db.select({ id: whatsappNormalizedMedia.id }).from(whatsappNormalizedMedia).where(and(
      eq(whatsappNormalizedMedia.provider, "zernio"),
      eq(whatsappNormalizedMedia.providerMediaItemKey, mediaKey),
    )).limit(1);
    if (!media) continue;
    await storeInboundZernioMedia({
      conversationId: input.conversationId,
      normalizedMediaId: media.id,
      accountId: input.accountId,
      mediaUrl: attachment.url,
      mediaId: attachment.mediaId,
      mimeType: attachment.mimeType,
      filename: attachment.filename,
      mediaType: input.envelope.messageType,
      localStorageKey: index === 0 ? input.envelope.localStorageKey : null,
    });
  }
}

export async function rememberZernioContact(conversationId: number, name: string | null, phone: string | null = null) {
  const db = await getDb();
  if (!db) return;
  const label = publicWhatsAppLabel(name)?.slice(0, 64) ?? null;
  if (label) {
    await db.update(whatsappConversationParticipants).set({
      providerHintDigest: label,
      updatedAt: new Date(),
    }).where(and(
      eq(whatsappConversationParticipants.conversationId, conversationId),
      eq(whatsappConversationParticipants.participantRole, "remote_endpoint"),
    ));
  }
  const normalizedPhone = phone ? normalizeInboxDirectPhone(phone) : null;
  if (!normalizedPhone) return;
  const rows = await db.select({
    id: whatsappConversationParticipants.id,
    providerParticipantId: whatsappConversationParticipants.providerParticipantId,
  }).from(whatsappConversationParticipants).where(and(
    eq(whatsappConversationParticipants.conversationId, conversationId),
    eq(whatsappConversationParticipants.participantRole, "remote_endpoint"),
  ));
  for (const row of rows) {
    if (normalizeInboxDirectPhone(row.providerParticipantId) === normalizedPhone) continue;
    await db.update(whatsappConversationParticipants).set({
      providerParticipantId: normalizedPhone.slice(0, 128),
      updatedAt: new Date(),
    }).where(eq(whatsappConversationParticipants.id, row.id));
  }
}

export async function upsertZernioMessage(input: { envelope: ZernioEnvelope; payloadHash: string; eventKey: string }) {
  const db = await getDb();
  if (!db) throw new Error("database_unavailable");
  const envelope = input.envelope;
  const connection = await ensureZernioConnection(envelope.accountId, null);
  const eventId = await sourceEventId({
    accountId: envelope.accountId,
    eventKey: input.eventKey,
    connectionId: connection.id,
    payloadHash: input.payloadHash,
  });
  const providerItemKey = (envelope.externalMessageId ?? input.eventKey).slice(0, 128);
  const conversationKey = key64(`zernio:${envelope.accountId}:${envelope.externalConversationId}`);
  const identifiesCustomer = envelope.direction === "incoming";
  const contactLabel = identifiesCustomer ? publicWhatsAppLabel(envelope.participantName)?.slice(0, 64) ?? null : null;
  const identity = identifiesCustomer ? envelope : { ...envelope, participantName: null, participantPhone: null };
  const incomingSenderId = (identity.participantPhone ?? envelope.externalConversationId).slice(0, 128);
  const inserted = await db.insert(whatsappNormalizedMessages).values({
    sourceEventId: eventId,
    connectionId: connection.id,
    connectionRoute: "persisted",
    provider: "zernio",
    providerPhoneNumberId: envelope.accountId.slice(0, 128),
    providerMessageId: envelope.externalMessageId?.slice(0, 128) ?? null,
    providerItemKey,
    providerSenderId: envelope.direction === "incoming" ? incomingSenderId : envelope.accountId.slice(0, 128),
    providerTimestamp: envelope.sentAt,
    providerDirection: envelope.direction === "incoming" ? "inbound" : "outbound_echo",
    messageType: envelope.messageType.slice(0, 64),
    textBody: envelope.body.slice(0, 8000),
    normalizedContent: mergedContent({}, identity),
    normalizationVersion: "zernio-1",
    normalizationState: "normalized",
  }).onConflictDoNothing({
    target: [whatsappNormalizedMessages.provider, whatsappNormalizedMessages.providerItemKey],
  }).returning({ id: whatsappNormalizedMessages.id });
  const [existing] = inserted.length ? [null] : await db.select({
    id: whatsappNormalizedMessages.id,
    messageType: whatsappNormalizedMessages.messageType,
    textBody: whatsappNormalizedMessages.textBody,
    normalizedContent: whatsappNormalizedMessages.normalizedContent,
  }).from(whatsappNormalizedMessages).where(and(
    eq(whatsappNormalizedMessages.provider, "zernio"),
    eq(whatsappNormalizedMessages.providerItemKey, providerItemKey),
  )).limit(1);
  if (existing) {
    await db.update(whatsappNormalizedMessages).set({
      messageType: envelope.messageType === "text" ? existing.messageType : envelope.messageType.slice(0, 64),
      textBody: envelope.body ? envelope.body.slice(0, 8000) : existing.textBody,
      providerTimestamp: envelope.sentAt,
      normalizedContent: mergedContent(existing.normalizedContent, identity),
    }).where(eq(whatsappNormalizedMessages.id, existing.id));
  }
  const normalizedId = inserted[0]?.id ?? existing?.id;
  if (!normalizedId) throw new Error("zernio_message_missing");

  await db.insert(whatsappConversations).values({
    clinicScope: CLINIC,
    provider: "zernio",
    connectionId: connection.id,
    connectionRoute: "persisted",
    providerPhoneNumberId: envelope.accountId.slice(0, 128),
    providerThreadId: envelope.externalConversationId.slice(0, 128),
    conversationKey,
    conversationType: "private",
    identityBasis: "remote_endpoint",
    endpointResolutionState: "unresolved",
    lifecycleState: "active",
    firstMessageAt: envelope.sentAt,
    lastMessageAt: envelope.sentAt,
  }).onConflictDoUpdate({
    target: whatsappConversations.conversationKey,
    set: { lastMessageAt: envelope.sentAt, updatedAt: new Date() },
  });
  const [conversation] = await db.select({ id: whatsappConversations.id }).from(whatsappConversations).where(eq(whatsappConversations.conversationKey, conversationKey)).limit(1);
  if (!conversation) throw new Error("zernio_conversation_missing");
  const participantId = await adoptZernioParticipant(db, { conversationId: conversation.id, conversationKey, envelope: identity, contactLabel });

  await db.insert(whatsappCommunicationEndpoints).values({
    clinicScope: CLINIC,
    connectionId: connection.id,
    connectionRoute: "persisted",
    provider: "zernio",
    providerPhoneNumberId: envelope.accountId.slice(0, 128),
    providerEndpointId: participantId,
    normalizedEndpointId: participantId,
  }).onConflictDoUpdate({
    target: [whatsappCommunicationEndpoints.provider, whatsappCommunicationEndpoints.providerPhoneNumberId, whatsappCommunicationEndpoints.providerEndpointId],
    set: { lastSeenAt: new Date(), updatedAt: new Date() },
  });
  const [endpoint] = await db.select({ id: whatsappCommunicationEndpoints.id }).from(whatsappCommunicationEndpoints).where(and(
    eq(whatsappCommunicationEndpoints.provider, "zernio"),
    eq(whatsappCommunicationEndpoints.providerPhoneNumberId, envelope.accountId.slice(0, 128)),
    eq(whatsappCommunicationEndpoints.providerEndpointId, participantId),
  )).limit(1);

  const participantKey = key64(`participant:${conversationKey}:${participantId}`);
  await db.insert(whatsappConversationParticipants).values({
    conversationId: conversation.id,
    endpointId: endpoint?.id ?? null,
    participantKey,
    participantRole: "remote_endpoint",
    participantState: "unresolved",
    providerParticipantId: participantId,
    firstSeenAt: envelope.sentAt,
    lastSeenAt: envelope.sentAt,
  }).onConflictDoUpdate({
    target: whatsappConversationParticipants.participantKey,
    set: {
      lastSeenAt: envelope.sentAt,
      updatedAt: new Date(),
      endpointId: endpoint?.id ?? null,
      ...(contactLabel ? { providerHintDigest: contactLabel } : {}),
    },
  });

  const associationKey = key64(`assoc:${conversationKey}:${providerItemKey}`);
  await db.insert(whatsappConversationMessages).values({
    conversationId: conversation.id,
    sourceEventId: eventId,
    normalizedMessageId: normalizedId,
    provider: "zernio",
    providerPhoneNumberId: envelope.accountId.slice(0, 128),
    providerMessageId: envelope.externalMessageId?.slice(0, 128) ?? null,
    providerItemKey,
    associationKey,
    correlationState: "correlated",
  }).onConflictDoUpdate({
    target: whatsappConversationMessages.associationKey,
    set: { correlationState: "correlated" },
  });
  const [linked] = await db.select({ sourceEventId: whatsappConversationMessages.sourceEventId }).from(whatsappConversationMessages)
    .where(eq(whatsappConversationMessages.associationKey, associationKey)).limit(1);
  await persistZernioMedia(db, {
    eventId: linked?.sourceEventId ?? eventId,
    connectionId: connection.id,
    accountId: envelope.accountId,
    providerItemKey,
    conversationId: conversation.id,
    envelope,
  });
  if (contactLabel) await rememberZernioContact(conversation.id, contactLabel);
  return { conversationId: conversation.id };
}

export async function applyZernioStatus(input: { accountId: string; providerMessageId: string; status: string; payloadHash: string; eventKey: string; errorCode?: string | null }) {
  const connection = await ensureZernioConnection(input.accountId, null);
  const eventId = await sourceEventId({
    accountId: input.accountId,
    eventKey: input.eventKey,
    connectionId: connection.id,
    payloadHash: input.payloadHash,
  });
  const db = await getDb();
  if (!db) return;
  const statusKey = key64(`status:${input.providerMessageId}:${input.status}`).slice(0, 128);
  await db.insert(whatsappNormalizedStatuses).values({
    sourceEventId: eventId,
    connectionId: connection.id,
    connectionRoute: "persisted",
    provider: "zernio",
    providerPhoneNumberId: input.accountId.slice(0, 128),
    providerStatusKey: statusKey,
    providerMessageId: input.providerMessageId.slice(0, 128),
    statusValue: input.status.slice(0, 64),
    errorCode: input.errorCode?.slice(0, 64) ?? null,
    providerTimestamp: new Date(),
    normalizationVersion: "zernio-1",
    normalizationState: "normalized",
  }).onConflictDoUpdate({
    target: [whatsappNormalizedStatuses.provider, whatsappNormalizedStatuses.providerStatusKey],
    set: { statusValue: input.status.slice(0, 64) },
  });
}

export async function reviseZernioMessage(input: {
  normalizedMessageId: number;
  sourceEventId: number;
  connectionId: number | null;
  conversationId: number;
  providerItemKey: string;
  envelope: ZernioEnvelope;
}) {
  const db = await getDb();
  if (!db) return;
  const [current] = await db.select({
    messageType: whatsappNormalizedMessages.messageType,
    textBody: whatsappNormalizedMessages.textBody,
    normalizedContent: whatsappNormalizedMessages.normalizedContent,
  }).from(whatsappNormalizedMessages).where(eq(whatsappNormalizedMessages.id, input.normalizedMessageId)).limit(1);
  if (!current) return;
  await db.update(whatsappNormalizedMessages).set({
    messageType: input.envelope.messageType === "text" ? current.messageType : input.envelope.messageType.slice(0, 64),
    textBody: input.envelope.body ? input.envelope.body.slice(0, 8000) : current.textBody,
    normalizedContent: mergedContent(current.normalizedContent, input.envelope),
  }).where(eq(whatsappNormalizedMessages.id, input.normalizedMessageId));
  await persistZernioMedia(db, {
    eventId: input.sourceEventId,
    connectionId: input.connectionId,
    accountId: input.envelope.accountId,
    providerItemKey: input.providerItemKey,
    conversationId: input.conversationId,
    envelope: input.envelope,
  });
}

export async function applyZernioReaction(input: { accountId: string; targetMessageIds: string[]; emoji: string }) {
  const db = await getDb();
  if (!db) return;
  const ids = [...new Set(input.targetMessageIds.map((id) => id.slice(0, 128)).filter(Boolean))].slice(0, 6);
  if (ids.length === 0) return;
  const [message] = await db.select({ id: whatsappNormalizedMessages.id, content: whatsappNormalizedMessages.normalizedContent }).from(whatsappNormalizedMessages).where(and(
    eq(whatsappNormalizedMessages.provider, "zernio"),
    eq(whatsappNormalizedMessages.providerPhoneNumberId, input.accountId.slice(0, 128)),
    or(inArray(whatsappNormalizedMessages.providerMessageId, ids), inArray(whatsappNormalizedMessages.providerItemKey, ids)),
  )).limit(1);
  if (!message) {
    console.info("[zernio] reaction target was not in this inbox", { targets: ids.length });
    return;
  }
  const current = asContent(message.content);
  const emoji = input.emoji.trim().slice(0, 16);
  const reactions = emoji ? [emoji] : [];
  await db.update(whatsappNormalizedMessages).set({
    normalizedContent: { ...current, reactions },
  }).where(eq(whatsappNormalizedMessages.id, message.id));
}

export async function markZernioMessageDeleted(providerMessageId: string) {
  const db = await getDb();
  if (!db) return;
  await db.update(whatsappNormalizedMessages).set({ textBody: "", messageType: "deleted" }).where(and(
    eq(whatsappNormalizedMessages.provider, "zernio"),
    eq(whatsappNormalizedMessages.providerMessageId, providerMessageId.slice(0, 128)),
  ));
}

export async function lastInboundAt(conversationId: number): Promise<Date | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db.select({ at: whatsappNormalizedMessages.providerTimestamp }).from(whatsappConversationMessages).innerJoin(
    whatsappNormalizedMessages,
    eq(whatsappNormalizedMessages.id, whatsappConversationMessages.normalizedMessageId),
  ).where(and(
    eq(whatsappConversationMessages.conversationId, conversationId),
    eq(whatsappNormalizedMessages.providerDirection, "inbound"),
  )).orderBy(desc(whatsappNormalizedMessages.providerTimestamp)).limit(1);
  return row?.at ?? null;
}

export async function firstAdminUserId(): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  return admin?.id ?? null;
}
