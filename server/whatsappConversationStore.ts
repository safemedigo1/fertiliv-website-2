import { and, eq } from "drizzle-orm";
import {
  whatsappCommunicationEndpoints,
  whatsappConversationMessages,
  whatsappConversationParticipants,
  whatsappConversations,
  whatsappEndpointResolutions,
  whatsappNormalizedMessages,
} from "../drizzle/schema";
import type { ResolvedWhatsAppConnection, WhatsAppProvider } from "../shared/whatsappPhase1Contracts";
import {
  buildWU07ConversationCorrelationPlan,
  buildWU07ConversationMessageKey,
  findWU07RawMessage,
} from "../shared/whatsappConversation";
import type { NormalizedMessagePlan } from "./whatsappNormalization";
import { buildWU06ResolutionKey } from "./whatsappEndpointResolution";

function resolutionStateToParticipantState(
  state: "unresolved" | "candidate_single" | "candidate_multiple" | "confirmed",
): "unresolved" | "candidate" | "confirmed" {
  if (state === "confirmed") return "confirmed";
  if (state === "candidate_single" || state === "candidate_multiple") return "candidate";
  return "unresolved";
}

async function findNormalizedMessage(tx: any, provider: WhatsAppProvider, providerItemKey: string) {
  const [message] = await tx.select({
    id: whatsappNormalizedMessages.id,
    providerMessageId: whatsappNormalizedMessages.providerMessageId,
    providerTimestamp: whatsappNormalizedMessages.providerTimestamp,
  }).from(whatsappNormalizedMessages)
    .where(and(
      eq(whatsappNormalizedMessages.provider, provider),
      eq(whatsappNormalizedMessages.providerItemKey, providerItemKey),
    ))
    .limit(1);
  return message ?? null;
}

async function findResolution(tx: any, input: {
  sourceEventId: number;
  providerPhoneNumberId: string | null;
  providerItemKey: string;
}) {
  const resolutionKey = buildWU06ResolutionKey(input);
  const [resolution] = await tx.select({
    id: whatsappEndpointResolutions.id,
    endpointId: whatsappEndpointResolutions.endpointId,
    resolutionState: whatsappEndpointResolutions.resolutionState,
    confirmedPersonIdentityId: whatsappEndpointResolutions.confirmedPersonIdentityId,
  }).from(whatsappEndpointResolutions)
    .where(eq(whatsappEndpointResolutions.resolutionKey, resolutionKey))
    .limit(1);
  return resolution ?? null;
}

async function findEndpoint(tx: any, input: {
  provider: WhatsAppProvider;
  providerPhoneNumberId: string;
  providerEndpointId: string;
}) {
  const [endpoint] = await tx.select({ id: whatsappCommunicationEndpoints.id })
    .from(whatsappCommunicationEndpoints)
    .where(and(
      eq(whatsappCommunicationEndpoints.provider, input.provider),
      eq(whatsappCommunicationEndpoints.providerPhoneNumberId, input.providerPhoneNumberId),
      eq(whatsappCommunicationEndpoints.providerEndpointId, input.providerEndpointId),
    ))
    .limit(1);
  return endpoint?.id ?? null;
}

async function findEndpointIdentifierById(tx: any, endpointId: number | null) {
  if (!endpointId) return null;
  const [endpoint] = await tx.select({ providerEndpointId: whatsappCommunicationEndpoints.providerEndpointId })
    .from(whatsappCommunicationEndpoints)
    .where(eq(whatsappCommunicationEndpoints.id, endpointId))
    .limit(1);
  return endpoint?.providerEndpointId ?? null;
}

export async function persistWU07ConversationCorrelations(input: {
  tx: any;
  sourceEventId: number;
  provider: WhatsAppProvider;
  providerPhoneNumberId: string | null;
  value: Record<string, unknown>;
  messages: NormalizedMessagePlan[];
  connection: ResolvedWhatsAppConnection | null;
}) {
  if (!input.connection || !input.providerPhoneNumberId) return [];
  const results: Array<{
    conversationId: number;
    conversationType: "private" | "group";
    associationState: "correlated";
  }> = [];

  for (const normalized of input.messages) {
    if (normalized.normalizationState !== "normalized" || !normalized.providerSenderId) continue;
    const rawMessage = findWU07RawMessage(input.value, normalized.providerMessageId);
    const resolution = await findResolution(input.tx, {
      sourceEventId: input.sourceEventId,
      providerPhoneNumberId: input.providerPhoneNumberId,
      providerItemKey: normalized.providerItemKey,
    });
    if (!resolution) continue;

    // A provider may return a LID for an inbound reply after an E.164 direct
    // start. WU-06 has already resolved any exact persisted alias to an
    // existing transport endpoint; use that canonical endpoint for the private
    // thread key while preserving the raw identity in normalized evidence.
    const canonicalEndpointId = await findEndpointIdentifierById(input.tx, resolution.endpointId)
      ?? normalized.providerSenderId;

    const plan = buildWU07ConversationCorrelationPlan({
      provider: input.provider,
      phoneNumberId: input.providerPhoneNumberId,
      connection: input.connection,
      providerEndpointId: canonicalEndpointId,
      message: rawMessage ?? {
        id: normalized.providerMessageId,
        from: canonicalEndpointId,
      },
      endpointResolutionState: resolution.resolutionState,
    });
    if (!plan) continue;

    const message = await findNormalizedMessage(input.tx, input.provider, normalized.providerItemKey);
    if (!message) continue;
    const messageAt = message.providerTimestamp ?? new Date();
    await input.tx.insert(whatsappConversations).values({
      clinicScope: input.connection.clinicScope,
      provider: input.provider,
      connectionId: input.connection.id,
      connectionRoute: input.connection.route,
      providerPhoneNumberId: input.providerPhoneNumberId,
      providerThreadId: plan.providerThreadId,
      conversationKey: plan.conversationKey,
      conversationType: plan.conversationType,
      identityBasis: plan.identityBasis,
      endpointResolutionState: plan.endpointResolutionState,
      humanActorResolutionState: plan.humanActorResolutionState,
      medicalSubjectResolutionState: plan.medicalSubjectResolutionState,
      lifecycleState: "active",
      firstMessageAt: messageAt,
      lastMessageAt: messageAt,
    }).onConflictDoUpdate({ target: whatsappConversations.conversationKey,
      set: { lastMessageAt: messageAt },
    });
    const [conversation] = await input.tx.select({ id: whatsappConversations.id })
      .from(whatsappConversations)
      .where(eq(whatsappConversations.conversationKey, plan.conversationKey))
      .limit(1);
    if (!conversation) throw new Error("WhatsApp Conversation correlation could not be confirmed");

    const endpointId = resolution.endpointId ?? await findEndpoint(input.tx, {
      provider: input.provider,
      providerPhoneNumberId: input.providerPhoneNumberId,
      providerEndpointId: normalized.providerSenderId,
    });
    const participantState = resolutionStateToParticipantState(resolution.resolutionState);
    await input.tx.insert(whatsappConversationParticipants).values({
      conversationId: conversation.id,
      endpointId,
      personIdentityId: resolution.confirmedPersonIdentityId,
      sourceResolutionId: resolution.id,
      participantKey: plan.participantKey,
      participantRole: plan.participantRole,
      participantState,
      providerParticipantId: plan.providerParticipantId ?? normalized.providerSenderId,
      providerHintDigest: null,
      humanActorResolutionState: plan.humanActorResolutionState,
      medicalSubjectResolutionState: plan.medicalSubjectResolutionState,
      firstSeenAt: messageAt,
      lastSeenAt: messageAt,
    }).onConflictDoUpdate({ target: whatsappConversationParticipants.participantKey,
      set: {
        lastSeenAt: messageAt,
        endpointId,
        personIdentityId: resolution.confirmedPersonIdentityId,
        sourceResolutionId: resolution.id,
        participantState,
      },
    });

    const associationKey = buildWU07ConversationMessageKey({
      conversationKey: plan.conversationKey,
      providerItemKey: normalized.providerItemKey,
    });
    await input.tx.insert(whatsappConversationMessages).values({
      conversationId: conversation.id,
      sourceEventId: input.sourceEventId,
      normalizedMessageId: message.id,
      resolutionId: resolution.id,
      provider: input.provider,
      providerPhoneNumberId: input.providerPhoneNumberId,
      providerMessageId: normalized.providerMessageId,
      providerItemKey: normalized.providerItemKey,
      associationKey,
      correlationState: "correlated",
    }).onConflictDoUpdate({ target: whatsappConversationMessages.associationKey,
      set: { correlationState: "correlated" },
    });
    results.push({
      conversationId: conversation.id,
      conversationType: plan.conversationType,
      associationState: "correlated",
    });
  }
  return results;
}
