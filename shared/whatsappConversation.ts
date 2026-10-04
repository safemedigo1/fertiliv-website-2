import { createHash } from "crypto";
import type { ResolvedWhatsAppConnection, WhatsAppProvider } from "./whatsappPhase1Contracts";
import type { WhatsAppResolutionState } from "./whatsappResolution";

export type WhatsAppConversationType = "private" | "group";
export type WhatsAppConversationIdentityBasis = "remote_endpoint" | "provider_thread";
export type WhatsAppConversationParticipantRole = "remote_endpoint" | "group_participant";

export type WhatsAppConversationCorrelationPlan = {
  conversationKey: string;
  conversationType: WhatsAppConversationType;
  identityBasis: WhatsAppConversationIdentityBasis;
  providerThreadId: string | null;
  providerEndpointId: string;
  participantKey: string;
  participantRole: WhatsAppConversationParticipantRole;
  providerParticipantId: string | null;
  endpointResolutionState: WhatsAppResolutionState;
  humanActorResolutionState: "unresolved";
  medicalSubjectResolutionState: "unresolved";
};

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function connectionScope(connection: ResolvedWhatsAppConnection | null, phoneNumberId: string): string {
  return connection?.id != null
    ? `connection:${connection.id}`
    : `phone:${phoneNumberId}`;
}

function providerThreadIdFromMessage(message: Record<string, unknown>): string | null {
  const context = message.context && typeof message.context === "object" && !Array.isArray(message.context)
    ? message.context as Record<string, unknown>
    : null;
  return stringValue(message.group_id) ?? stringValue(context?.group_id);
}

export function buildWU07ConversationKey(input: {
  provider: WhatsAppProvider;
  phoneNumberId: string;
  connection: ResolvedWhatsAppConnection | null;
  providerEndpointId: string;
  providerThreadId: string | null;
}): string {
  const scope = connectionScope(input.connection, input.phoneNumberId);
  const thread = input.providerThreadId
    ? `group:${input.providerThreadId}`
    : `private:${input.providerEndpointId}`;
  return digest(`${input.provider}:${scope}:${thread}`);
}

export function buildWU07ParticipantKey(input: {
  conversationKey: string;
  participantRole: WhatsAppConversationParticipantRole;
  providerParticipantId: string;
}): string {
  return digest(`${input.conversationKey}:${input.participantRole}:${input.providerParticipantId}`);
}

export function buildWU07ConversationCorrelationPlan(input: {
  provider: WhatsAppProvider;
  phoneNumberId: string;
  connection: ResolvedWhatsAppConnection;
  providerEndpointId: string;
  message: Record<string, unknown>;
  endpointResolutionState: WhatsAppResolutionState;
}): WhatsAppConversationCorrelationPlan | null {
  const providerEndpointId = stringValue(input.providerEndpointId);
  if (!providerEndpointId || !input.phoneNumberId) return null;
  const providerThreadId = providerThreadIdFromMessage(input.message);
  const conversationKey = buildWU07ConversationKey({
    provider: input.provider,
    phoneNumberId: input.phoneNumberId,
    connection: input.connection,
    providerEndpointId,
    providerThreadId,
  });
  const participantRole: WhatsAppConversationParticipantRole = providerThreadId
    ? "group_participant"
    : "remote_endpoint";
  const providerParticipantId = providerThreadId
    ? stringValue(input.message.from) ?? providerEndpointId
    : providerEndpointId;
  if (!providerParticipantId) return null;
  return {
    conversationKey,
    conversationType: providerThreadId ? "group" : "private",
    identityBasis: providerThreadId ? "provider_thread" : "remote_endpoint",
    providerThreadId,
    providerEndpointId,
    participantKey: buildWU07ParticipantKey({
      conversationKey,
      participantRole,
      providerParticipantId,
    }),
    participantRole,
    providerParticipantId,
    endpointResolutionState: input.endpointResolutionState,
    humanActorResolutionState: "unresolved",
    medicalSubjectResolutionState: "unresolved",
  };
}

export function findWU07RawMessage(value: Record<string, unknown>, providerMessageId: string | null): Record<string, unknown> | null {
  if (!providerMessageId || !Array.isArray(value.messages)) return null;
  for (const item of value.messages) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const message = item as Record<string, unknown>;
    if (stringValue(message.id) === providerMessageId) return message;
  }
  return null;
}

export function buildWU07ConversationMessageKey(input: {
  conversationKey: string;
  providerItemKey: string;
}): string {
  return digest(`${input.conversationKey}:${input.providerItemKey}`);
}
