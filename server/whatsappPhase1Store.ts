import { and, eq, inArray } from "drizzle-orm";
import { createHash } from "crypto";
import {
  whatsappNormalizedMedia,
  whatsappNormalizedMessages,
  whatsappNormalizedStatuses,
  whatsappProviderEventBatches,
  whatsappProviderEvents,
  whatsappSendAttempts,
  whatsappConversationMessages,
  communicationMediaAssets,
} from "../drizzle/schema";
import type {
  ResolvedWhatsAppConnection,
  WhatsAppProvider,
  WhatsAppProviderEventProcessingState,
  WhatsAppProviderEventRoutingState,
  WhatsAppSendAttemptState,
} from "../shared/whatsappPhase1Contracts";
import type { WU05NormalizationPlan } from "./whatsappNormalization";
import { WU05_NORMALIZATION_VERSION } from "./whatsappNormalization";
import { persistWU06EndpointResolutions } from "./whatsappEndpointResolution";
import { persistWU07ConversationCorrelations } from "./whatsappConversationStore";
import { getDb } from "./db";
import { storageDelete, storagePut } from "./storage";
import { buildMediaFilename } from "../shared/mediaFilename";

export function sha256Digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createWhatsAppSendAttempt(input: {
  connection: ResolvedWhatsAppConnection;
  conversationId?: number | null;
  actorUserId: number | null;
  recipientEndpoint: string;
  intentType: "text" | "template" | "document";
  payloadDigest: string;
  idempotencyKey: string;
  clientActionId?: string | null;
  correlationId?: string | null;
  lineId?: number | null;
  sessionName?: string | null;
  runtimeEndpointHost?: string | null;
  runtimeMode?: "sandbox" | "persistent_worker" | null;
  runtimeGateValue?: boolean | null;
  approvalSecretSelector?: "jwt_secret" | "persistent_worker_approval_secret" | null;
  approvalProofVersion?: number | null;
  approvalExpiryState?: string | null;
  recipientFingerprint?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("WhatsApp send tracking requires an available database");

  const [result] = await db.insert(whatsappSendAttempts).values({
    conversationId: input.conversationId ?? null,
    connectionId: input.connection.id,
    connectionRoute: input.connection.route,
    provider: input.connection.provider,
    providerPhoneNumberId: input.connection.phoneNumberId,
    actorUserId: input.actorUserId,
    recipientEndpoint: input.recipientEndpoint,
    intentType: input.intentType,
    payloadDigest: input.payloadDigest,
    idempotencyKey: input.idempotencyKey,
    clientActionId: input.clientActionId ?? null,
    correlationId: input.correlationId ?? null,
    lineId: input.lineId ?? null,
    sessionName: input.sessionName ?? null,
    runtimeEndpointHost: input.runtimeEndpointHost ?? null,
    runtimeMode: input.runtimeMode ?? null,
    runtimeGateValue: input.runtimeGateValue ?? null,
    approvalSecretSelector: input.approvalSecretSelector ?? null,
    approvalProofVersion: input.approvalProofVersion ?? null,
    approvalExpiryState: input.approvalExpiryState ?? null,
    recipientFingerprint: input.recipientFingerprint ?? null,
    attemptState: "pending",
  });
  return { id: Number((result as any).insertId) };
}

export async function completeWhatsAppSendAttempt(input: {
  id: number;
  attemptState: Exclude<WhatsAppSendAttemptState, "pending">;
  providerMessageId?: string | null;
  failureCategory?: string | null;
  diagnostic?: {
    stage: string;
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
  } | null;
}) {
  const db = await getDb();
  if (!db) return;
  const now = new Date();
  await db.update(whatsappSendAttempts).set({
    attemptState: input.attemptState,
    providerMessageId: input.providerMessageId ?? null,
    failureCategory: input.failureCategory ?? null,
    diagnosticStage: input.diagnostic?.stage?.slice(0, 32) ?? null,
    diagnosticProbe: input.diagnostic?.probe?.slice(0, 64) ?? null,
    diagnosticOutcome: input.diagnostic?.outcome?.slice(0, 96) ?? null,
    diagnosticAt: input.diagnostic?.timestamp ? new Date(input.diagnostic.timestamp) : null,
    approvalReason: input.diagnostic?.approvalReason?.slice(0, 64) ?? null,
    acceptedAt: input.attemptState === "accepted" ? now : null,
    completedAt: input.attemptState === "submitting" ? null : now,
  }).where(eq(whatsappSendAttempts.id, input.id));
}

export type RetainedProviderEvent = {
  provider: WhatsAppProvider;
  providerField: string;
  providerEventKey: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  connection: ResolvedWhatsAppConnection | null;
  routingState: WhatsAppProviderEventRoutingState;
  processingState: WhatsAppProviderEventProcessingState;
  failureCategory: string | null;
  value: Record<string, unknown>;
  normalizationPlan?: WU05NormalizationPlan;
  mediaPayloads?: Array<{
    sourceMessageItemKey: string;
    base64: string;
    mediaType: string;
    mimeType: string | null;
    filename: string | null;
    sha256: string | null;
  }>;
};

async function persistNormalizationPlan(
  tx: any,
  sourceEventId: number,
  event: RetainedProviderEvent,
) {
  const plan = event.normalizationPlan;
  if (!plan || !event.connection) return;

  const common = {
    sourceEventId,
    connectionId: event.connection.id,
    connectionRoute: event.connection.route,
    provider: event.connection.provider,
    wabaId: event.wabaId,
    providerPhoneNumberId: event.phoneNumberId,
  } as const;

  if (plan.messages.length > 0) {
    await tx.insert(whatsappNormalizedMessages).values(plan.messages.map((message) => ({
      ...common,
      providerMessageId: message.providerMessageId,
      providerItemKey: message.providerItemKey,
      providerSenderId: message.providerSenderId,
      providerRecipientId: message.providerRecipientId,
      providerTimestamp: message.providerTimestamp,
      providerDirection: message.providerDirection,
      messageType: message.messageType,
      textBody: message.textBody,
      normalizedContent: message.normalizedContent,
      normalizationVersion: WU05_NORMALIZATION_VERSION,
      normalizationState: message.normalizationState,
      failureCategory: message.failureCategory,
    })));
  }

  if (plan.statuses.length > 0) {
    await tx.insert(whatsappNormalizedStatuses).values(plan.statuses.map((status) => ({
      ...common,
      providerStatusId: status.providerStatusId,
      providerStatusKey: status.providerStatusKey,
      providerMessageId: status.providerMessageId,
      providerRecipientId: status.providerRecipientId,
      providerTimestamp: status.providerTimestamp,
      statusValue: status.statusValue,
      errorCode: status.errorCode,
      errorTitle: status.errorTitle,
      normalizationVersion: WU05_NORMALIZATION_VERSION,
      normalizationState: status.normalizationState,
      failureCategory: status.failureCategory,
    })));
  }

  const media = plan.messages.flatMap((message) => message.media);
  if (media.length > 0) {
    await tx.insert(whatsappNormalizedMedia).values(media.map((item) => ({
      ...common,
      sourceMessageItemKey: item.sourceMessageItemKey,
      providerMediaItemKey: item.providerMediaItemKey,
      providerMediaId: item.providerMediaId,
      mediaType: item.mediaType,
      mimeType: item.mimeType,
      sha256: item.sha256,
      filename: item.filename,
      caption: item.caption,
      mediaState: item.mediaState,
      failureCategory: item.failureCategory,
    })));
  }
}

const MAX_CUSTODIED_MEDIA_BYTES = 15 * 1024 * 1024;

function decodeCustodyBase64(value: string): Buffer {
  const compact = value.replace(/\s+/g, "");
  if (!compact || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 === 1) {
    throw new Error("Inbound media payload is not valid base64.");
  }
  const buffer = Buffer.from(compact, "base64");
  if (!buffer.length || buffer.length > MAX_CUSTODIED_MEDIA_BYTES) {
    throw new Error("Inbound media payload exceeds the custody limit.");
  }
  const canonical = buffer.toString("base64").replace(/=+$/, "");
  if (canonical !== compact.replace(/=+$/, "")) {
    throw new Error("Inbound media payload failed base64 validation.");
  }
  return buffer;
}

async function custodyMediaPayloads(db: any, sourceEventId: number, event: RetainedProviderEvent) {
  if (!event.mediaPayloads?.length || !event.connection) return;

  const normalizedRows = await db.select({
    normalizedMediaId: whatsappNormalizedMedia.id,
    sourceMessageItemKey: whatsappNormalizedMedia.sourceMessageItemKey,
    normalizedMessageId: whatsappNormalizedMessages.id,
  }).from(whatsappNormalizedMedia).innerJoin(
    whatsappNormalizedMessages,
    and(
      eq(whatsappNormalizedMessages.sourceEventId, whatsappNormalizedMedia.sourceEventId),
      eq(whatsappNormalizedMessages.providerItemKey, whatsappNormalizedMedia.sourceMessageItemKey),
    ),
  ).where(eq(whatsappNormalizedMedia.sourceEventId, sourceEventId));
  const normalizedByKey = new Map(normalizedRows.map((row: any) => [row.sourceMessageItemKey, row.normalizedMediaId]));
  const conversationRows = normalizedRows.length === 0 ? [] : await db.select({
    normalizedMessageId: whatsappConversationMessages.normalizedMessageId,
    conversationId: whatsappConversationMessages.conversationId,
  }).from(whatsappConversationMessages).where(inArray(
    whatsappConversationMessages.normalizedMessageId,
    normalizedRows.map((row: any) => row.normalizedMessageId),
  ));
  const conversationByNormalizedId = new Map(conversationRows.map((row: any) => [row.normalizedMessageId, row.conversationId]));

  for (const payload of event.mediaPayloads) {
    const normalizedMediaId = normalizedByKey.get(payload.sourceMessageItemKey);
    if (!normalizedMediaId) continue;
    const normalizedMessageId = normalizedRows.find((row: any) => row.sourceMessageItemKey === payload.sourceMessageItemKey)?.normalizedMessageId;
    const conversationId = normalizedMessageId ? conversationByNormalizedId.get(normalizedMessageId) : null;
    if (!conversationId) continue;

    const [existingAsset] = await db.select({ id: communicationMediaAssets.id })
      .from(communicationMediaAssets)
      .where(eq(communicationMediaAssets.normalizedMediaId, Number(normalizedMediaId))).limit(1);
    if (existingAsset) continue;

    const buffer = decodeCustodyBase64(payload.base64);
    const digest = createHash("sha256").update(buffer).digest("hex");
    if (payload.sha256 && digest !== payload.sha256) {
      throw new Error("Inbound media payload failed integrity validation.");
    }
    const safeFilename = buildMediaFilename({
      originalFilename: payload.filename,
      mimeType: payload.mimeType,
      mediaType: payload.mediaType,
      seed: Number(normalizedMediaId) || sourceEventId,
    });
    const stored = await storagePut(
      `communications/whatsapp/wppconnect/${sourceEventId}/${safeFilename}`,
      buffer,
      payload.mimeType ?? "application/octet-stream",
      payload.filename ?? undefined,
    );
    try {
      await db.insert(communicationMediaAssets).values({
        conversationId,
        normalizedMediaId,
        channelKind: "whatsapp_linked_device",
        storageKey: stored.key,
        mediaType: payload.mediaType,
        mimeType: payload.mimeType,
        filename: safeFilename,
        sha256: payload.sha256,
        accessState: "available",
        retentionUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }).onConflictDoUpdate({ target: communicationMediaAssets.storageKey, set: { updatedAt: new Date() } });
    } catch (error) {
      await storageDelete(stored.key);
      throw error;
    }
  }
}

/**
 * Persists a validated raw webhook batch, its individual provider changes, and
 * WU-05 normalized projections in one transaction. Duplicate batches/events are
 * acknowledged without replaying normalization or any identity side effect.
 */
export async function retainWhatsAppProviderEvents(input: {
  rawPayload: string;
  events: RetainedProviderEvent[];
}): Promise<{ batchId: number; insertedEvents: number; duplicateEvents: number }> {
  const db = await getDb();
  if (!db) throw new Error("WhatsApp webhook capture requires an available database");
  const provider = input.events[0]?.provider;
  if (!provider || input.events.some((event) => event.provider !== provider)) {
    throw new Error("WhatsApp provider evidence batches require exactly one provider.");
  }

  const rawPayloadDigest = sha256Digest(input.rawPayload);
  const retained = await db.transaction(async (tx) => {
    const [existingBatch] = await tx
      .select()
      .from(whatsappProviderEventBatches)
      .where(and(
        eq(whatsappProviderEventBatches.provider, provider),
        eq(whatsappProviderEventBatches.rawPayloadDigest, rawPayloadDigest),
      ))
      .limit(1);

    let batchId = existingBatch?.id;
    if (batchId) {
      await tx.update(whatsappProviderEventBatches).set({ lastReceivedAt: new Date() })
        .where(eq(whatsappProviderEventBatches.id, batchId));
    } else {
      // A simultaneous Meta retry may win after the select. The unique digest
      // remains the dedupe authority rather than turning that race into 500.
      await tx.insert(whatsappProviderEventBatches).values({
        provider,
        rawPayloadDigest,
        rawPayload: input.rawPayload,
        signatureValid: true,
      }).onConflictDoUpdate({ target: [whatsappProviderEventBatches.provider, whatsappProviderEventBatches.rawPayloadDigest],
        set: { lastReceivedAt: new Date() },
      });
      const [storedBatch] = await tx
        .select({ id: whatsappProviderEventBatches.id })
        .from(whatsappProviderEventBatches)
        .where(and(
          eq(whatsappProviderEventBatches.provider, provider),
          eq(whatsappProviderEventBatches.rawPayloadDigest, rawPayloadDigest),
        ))
        .limit(1);
      if (!storedBatch) throw new Error("WhatsApp webhook batch capture could not be confirmed");
      batchId = storedBatch.id;
    }

    let insertedEvents = 0;
    let duplicateEvents = 0;
    const mediaWork: Array<{ sourceEventId: number; event: RetainedProviderEvent }> = [];
    for (const event of input.events) {
      const [existingEvent] = await tx
        .select({ id: whatsappProviderEvents.id })
        .from(whatsappProviderEvents)
        .where(and(
          eq(whatsappProviderEvents.provider, event.provider),
          eq(whatsappProviderEvents.providerEventKey, event.providerEventKey),
        ))
        .limit(1);

      if (existingEvent) {
        duplicateEvents += 1;
        if (event.mediaPayloads?.length) mediaWork.push({ sourceEventId: existingEvent.id, event });
        continue;
      }

      const insertResult = await tx.insert(whatsappProviderEvents).values({
        batchId,
        connectionId: event.connection?.id ?? null,
        connectionRoute: event.connection?.route ?? null,
        provider: event.provider,
        wabaId: event.wabaId,
        providerPhoneNumberId: event.phoneNumberId,
        providerField: event.providerField,
        providerEventKey: event.providerEventKey,
        routingState: event.routingState,
        processingState: event.processingState,
        failureCategory: event.failureCategory,
      }).onConflictDoUpdate({ target: [whatsappProviderEvents.provider, whatsappProviderEvents.providerEventKey],
        set: { updatedAt: new Date() },
      });
      let sourceEventId = Number((insertResult as any).insertId);
      if (!sourceEventId) {
        // mysql2 can report an insertId of zero for an INSERT ... ON DUPLICATE
        // KEY UPDATE even when this transaction just created the evidence row.
        // The prior preflight lookup already eliminated ordinary retries, so
        // recover the durable ID and continue the first-seen event pipeline.
        const [storedEvent] = await tx
          .select({ id: whatsappProviderEvents.id })
          .from(whatsappProviderEvents)
          .where(and(
            eq(whatsappProviderEvents.provider, event.provider),
            eq(whatsappProviderEvents.providerEventKey, event.providerEventKey),
          ))
          .limit(1);
        if (!storedEvent) throw new Error("WhatsApp provider event persistence could not be confirmed");
        sourceEventId = storedEvent.id;
      }
      await persistNormalizationPlan(tx, sourceEventId, event);
      if (event.normalizationPlan?.messages.length) {
        await persistWU06EndpointResolutions({
          tx,
          sourceEventId,
          provider: event.provider,
          providerPhoneNumberId: event.phoneNumberId,
          value: event.value,
          messages: event.normalizationPlan.messages,
          connection: event.connection,
          routingState: event.routingState,
        });
        await persistWU07ConversationCorrelations({
          tx,
          sourceEventId,
          provider: event.provider,
          providerPhoneNumberId: event.phoneNumberId,
          value: event.value,
          messages: event.normalizationPlan.messages,
          connection: event.connection,
        });
        if (event.mediaPayloads?.length) mediaWork.push({ sourceEventId, event });
      }
      insertedEvents += 1;
    }

    return { batchId, insertedEvents, duplicateEvents, mediaWork };
  });

  for (const work of retained.mediaWork) {
    await custodyMediaPayloads(db, work.sourceEventId, work.event);
  }
  return { batchId: retained.batchId, insertedEvents: retained.insertedEvents, duplicateEvents: retained.duplicateEvents };
}
