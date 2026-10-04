import { createHash } from "crypto";
import type { ResolvedWhatsAppConnection } from "../shared/whatsappPhase1Contracts";

export const WU05_NORMALIZATION_VERSION = "wu05-v1";

const supportedMessageTypes = new Set([
  "text",
  "image",
  "audio",
  "video",
  "document",
  "sticker",
  "reaction",
  "location",
  "interactive",
  "button",
  "order",
  "contacts",
  "system",
]);
const supportedStatusValues = new Set(["sent", "delivered", "read", "failed"]);
const mediaMessageTypes = new Set(["image", "audio", "video", "document", "sticker"]);

type NormalizationState = "normalized" | "partial" | "quarantined";
type ProviderDirection = "inbound" | "outbound_echo" | "unknown";

type NormalizedMediaPlan = {
  sourceMessageItemKey: string;
  providerMediaItemKey: string;
  providerMediaId: string | null;
  mediaType: string;
  mimeType: string | null;
  sha256: string | null;
  filename: string | null;
  caption: string | null;
  mediaState: "metadata_only" | "quarantined";
  failureCategory: string | null;
};

export type NormalizedMessagePlan = {
  providerMessageId: string | null;
  providerItemKey: string;
  providerSenderId: string | null;
  providerRecipientId: string | null;
  providerTimestamp: Date | null;
  providerDirection: ProviderDirection;
  messageType: string;
  textBody: string | null;
  normalizedContent: Record<string, unknown> | null;
  normalizationState: "normalized" | "quarantined";
  failureCategory: string | null;
  media: NormalizedMediaPlan[];
};

export type NormalizedStatusPlan = {
  providerStatusId: string | null;
  providerStatusKey: string;
  providerMessageId: string | null;
  providerRecipientId: string | null;
  providerTimestamp: Date | null;
  statusValue: string;
  errorCode: string | null;
  errorTitle: string | null;
  normalizationState: "normalized" | "quarantined";
  failureCategory: string | null;
};

export type WU05NormalizationPlan = {
  normalizationState: NormalizationState;
  normalizationFailureCategory: string | null;
  normalizedAt: Date;
  processingState: "applied" | "quarantined";
  messages: NormalizedMessagePlan[];
  statuses: NormalizedStatusPlan[];
};

export type MetaWebhookChangeRecord = {
  wabaId: string | null;
  phoneNumberId: string | null;
  providerField: string;
  providerEventKey: string;
  value: Record<string, unknown>;
};

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function timestampFromProviderSeconds(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const timestamp = new Date(seconds * 1000);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function mediaPlanForMessage(message: Record<string, unknown>, itemKey: string, messageType: string): NormalizedMediaPlan[] {
  if (!mediaMessageTypes.has(messageType)) return [];
  const media = message[messageType] as Record<string, unknown> | undefined;
  const providerMediaId = stringOrNull(media?.id);
  // Keep providerMediaItemKey within the persisted VARCHAR(128) contract. The
  // message item key already carries the full event digest; hashing the
  // composite media identity preserves deterministic deduplication without
  // concatenating two 64-character digests past the database limit.
  const mediaKey = `media:${digest({ itemKey, messageType, media })}`;
  if (!providerMediaId) {
    return [{
      sourceMessageItemKey: itemKey,
      providerMediaItemKey: mediaKey,
      providerMediaId: null,
      mediaType: messageType,
      mimeType: stringOrNull(media?.mime_type),
      sha256: stringOrNull(media?.sha256),
      filename: stringOrNull(media?.filename),
      caption: stringOrNull(media?.caption),
      mediaState: "quarantined",
      failureCategory: "malformed_media_reference",
    }];
  }
  return [{
    sourceMessageItemKey: itemKey,
    providerMediaItemKey: mediaKey,
    providerMediaId,
    mediaType: messageType,
    mimeType: stringOrNull(media?.mime_type),
    sha256: stringOrNull(media?.sha256),
    filename: stringOrNull(media?.filename),
    caption: stringOrNull(media?.caption),
    mediaState: "metadata_only",
    failureCategory: null,
  }];
}

function normalizeMessage(message: unknown, index: number): NormalizedMessagePlan {
  const itemKey = `message:${index}:${digest(message)}`;
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return {
      providerMessageId: null,
      providerItemKey: itemKey,
      providerSenderId: null,
      providerRecipientId: null,
      providerTimestamp: null,
      providerDirection: "unknown",
      messageType: "unknown",
      textBody: null,
      normalizedContent: null,
      normalizationState: "quarantined",
      failureCategory: "malformed_message_item",
      media: [],
    };
  }

  const input = message as Record<string, unknown>;
  const providerMessageId = stringOrNull(input.id);
  const providerSenderId = stringOrNull(input.from);
  const providerRecipientId = stringOrNull(input.to);
  const providerTimestamp = timestampFromProviderSeconds(input.timestamp);
  const messageType = stringOrNull(input.type) ?? "unknown";
  // Linked Device synthetic composer events deliberately retain the remote
  // endpoint as the correlation anchor, then carry an explicit test-only
  // direction marker. Normal Meta/production payloads have no such marker
  // and preserve the original sender-based inference unchanged.
  const syntheticDirection = input.wppconnect_synthetic_direction;
  const direction: ProviderDirection = syntheticDirection === "outbound_echo"
    ? "outbound_echo"
    : providerSenderId ? "inbound" : "unknown";
  let textBody: string | null = null;
  let normalizedContent: Record<string, unknown> | null = null;
  let failureCategory: string | null = null;

  if (!providerMessageId) failureCategory = "missing_provider_message_id";
  if (!providerTimestamp) failureCategory = failureCategory ?? "invalid_provider_timestamp";
  if (!supportedMessageTypes.has(messageType)) {
    failureCategory = failureCategory ?? "unsupported_message_type";
  } else if (messageType === "text") {
    const text = input.text as Record<string, unknown> | undefined;
    textBody = stringOrNull(text?.body);
    if (!textBody) failureCategory = failureCategory ?? "malformed_text_message";
  } else if (messageType === "reaction") {
    const reaction = input.reaction as Record<string, unknown> | undefined;
    normalizedContent = {
      reactionMessageId: stringOrNull(reaction?.message_id),
      emoji: stringOrNull(reaction?.emoji),
    };
    if (!normalizedContent.reactionMessageId || !normalizedContent.emoji) {
      failureCategory = failureCategory ?? "malformed_reaction_message";
    }
  } else if (messageType === "location") {
    const location = input.location as Record<string, unknown> | undefined;
    normalizedContent = {
      latitude: typeof location?.latitude === "number" ? location.latitude : null,
      longitude: typeof location?.longitude === "number" ? location.longitude : null,
      name: stringOrNull(location?.name),
      address: stringOrNull(location?.address),
    };
    if (normalizedContent.latitude === null || normalizedContent.longitude === null) {
      failureCategory = failureCategory ?? "malformed_location_message";
    }
  } else if (messageType === "interactive") {
    const interactive = input.interactive as Record<string, unknown> | undefined;
    const buttonReply = interactive?.button_reply as Record<string, unknown> | undefined;
    const listReply = interactive?.list_reply as Record<string, unknown> | undefined;
    normalizedContent = {
      interactiveType: stringOrNull(interactive?.type),
      replyId: stringOrNull(buttonReply?.id) ?? stringOrNull(listReply?.id),
      replyTitle: stringOrNull(buttonReply?.title) ?? stringOrNull(listReply?.title),
    };
  } else if (messageType === "button") {
    const button = input.button as Record<string, unknown> | undefined;
    normalizedContent = {
      text: stringOrNull(button?.text),
      payload: stringOrNull(button?.payload),
    };
  } else if (messageType === "order") {
    const order = input.order as Record<string, unknown> | undefined;
    normalizedContent = {
      catalogId: stringOrNull(order?.catalog_id),
      productItemCount: Array.isArray(order?.product_items) ? order.product_items.length : 0,
    };
  } else if (messageType === "contacts") {
    normalizedContent = {
      contactCount: Array.isArray(input.contacts) ? input.contacts.length : 0,
    };
  } else if (messageType === "system") {
    const system = input.system as Record<string, unknown> | undefined;
    normalizedContent = { systemType: stringOrNull(system?.type) };
  }

  const media = mediaPlanForMessage(input, itemKey, messageType);
  if (media.some((entry) => entry.mediaState === "quarantined")) {
    failureCategory = failureCategory ?? "malformed_media_reference";
  }

  return {
    providerMessageId,
    providerItemKey: itemKey,
    providerSenderId,
    providerRecipientId,
    providerTimestamp,
    providerDirection: direction,
    messageType,
    textBody,
    normalizedContent,
    normalizationState: failureCategory ? "quarantined" : "normalized",
    failureCategory,
    media,
  };
}

function normalizeStatus(status: unknown, index: number): NormalizedStatusPlan {
  const providerStatusKey = `status:${index}:${digest(status)}`;
  if (!status || typeof status !== "object" || Array.isArray(status)) {
    return {
      providerStatusId: null,
      providerStatusKey,
      providerMessageId: null,
      providerRecipientId: null,
      providerTimestamp: null,
      statusValue: "unknown",
      errorCode: null,
      errorTitle: null,
      normalizationState: "quarantined",
      failureCategory: "malformed_status_item",
    };
  }

  const input = status as Record<string, unknown>;
  const providerStatusId = stringOrNull(input.id);
  const providerMessageId = providerStatusId;
  const providerRecipientId = stringOrNull(input.recipient_id);
  const providerTimestamp = timestampFromProviderSeconds(input.timestamp);
  const statusValue = stringOrNull(input.status) ?? "unknown";
  const firstError = Array.isArray(input.errors) && input.errors[0] && typeof input.errors[0] === "object"
    ? input.errors[0] as Record<string, unknown>
    : undefined;
  let failureCategory: string | null = null;
  if (!providerStatusId) failureCategory = "missing_provider_status_id";
  if (!providerTimestamp) failureCategory = failureCategory ?? "invalid_provider_timestamp";
  if (!supportedStatusValues.has(statusValue)) failureCategory = failureCategory ?? "unsupported_status_value";

  return {
    providerStatusId,
    providerStatusKey,
    providerMessageId,
    providerRecipientId,
    providerTimestamp,
    statusValue,
    errorCode: stringOrNull(firstError?.code),
    errorTitle: stringOrNull(firstError?.title),
    normalizationState: failureCategory ? "quarantined" : "normalized",
    failureCategory,
  };
}

export function buildWU05NormalizationPlan(input: {
  providerField: string;
  value: Record<string, unknown>;
  connection: ResolvedWhatsAppConnection | null;
  routingState: "legacy_env" | "resolved" | "unmapped" | "mismatched" | "unsupported";
  existingFailureCategory: string | null;
}): WU05NormalizationPlan {
  const now = new Date();
  if (input.providerField !== "messages") {
    return {
      normalizationState: "quarantined",
      normalizationFailureCategory: "unsupported_provider_field",
      normalizedAt: now,
      processingState: "quarantined",
      messages: [],
      statuses: [],
    };
  }
  if (!input.connection || input.routingState !== "legacy_env" && input.routingState !== "resolved") {
    return {
      normalizationState: "quarantined",
      normalizationFailureCategory: input.existingFailureCategory ?? "unresolved_connection",
      normalizedAt: now,
      processingState: "quarantined",
      messages: [],
      statuses: [],
    };
  }

  const messages = Array.isArray(input.value.messages) ? input.value.messages.map(normalizeMessage) : [];
  const statuses = Array.isArray(input.value.statuses) ? input.value.statuses.map(normalizeStatus) : [];
  if (messages.length === 0 && statuses.length === 0) {
    return {
      normalizationState: "quarantined",
      normalizationFailureCategory: "malformed_messages_event_shape",
      normalizedAt: now,
      processingState: "quarantined",
      messages: [],
      statuses: [],
    };
  }

  const failedItems = [
    ...messages.filter((item) => item.normalizationState === "quarantined"),
    ...statuses.filter((item) => item.normalizationState === "quarantined"),
    ...messages.flatMap((item) => item.media).filter((item) => item.mediaState === "quarantined"),
  ];
  const normalizedItems = [
    ...messages.filter((item) => item.normalizationState === "normalized"),
    ...statuses.filter((item) => item.normalizationState === "normalized"),
  ];
  const normalizationState: NormalizationState = failedItems.length === 0
    ? "normalized"
    : normalizedItems.length > 0
      ? "partial"
      : "quarantined";

  return {
    normalizationState,
    normalizationFailureCategory: failedItems[0] && "failureCategory" in failedItems[0]
      ? failedItems[0].failureCategory
      : failedItems.length > 0 ? "malformed_provider_item" : null,
    normalizedAt: now,
    processingState: normalizationState === "quarantined" ? "quarantined" : "applied",
    messages,
    statuses,
  };
}
