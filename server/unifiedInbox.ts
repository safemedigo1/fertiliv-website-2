import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  whatsappCommunicationEndpoints,
  whatsappConnections,
  whatsappConversationMessages,
  whatsappConversationParticipants,
  whatsappConversationAssignments,
  whatsappConversationCaseLinks,
  whatsappConversationReadStates,
  whatsappConversations,
  whatsappEndpointResolutions,
  whatsappEndpointPersonLinks,
  whatsappInboxSettings,
  whatsappLinkedDeviceLines,
  whatsappNormalizedMedia,
  whatsappNormalizedMessages,
  whatsappNormalizedStatuses,
  whatsappPersonIdentities,
  whatsappPersonIdentityRecords,
  whatsappSendAttempts,
  communicationMediaAssets,
  users,
  leads,
  patients,
  treatmentCases,
} from "../drizzle/schema";
import { getDb } from "./db";
import { canUserAccessLinkedDeviceLine } from "./whatsappLinkedDevice";
import { getOperationalInboxContext } from "./operationalInbox";
import { canDisplayFullInboxPhone, classifyInboxSenderEndpoint, normalizeInboxPhone } from "../shared/unifiedInbox";
import { syncZernioConversation } from "./zernio/history";
import type {
  UnifiedInboxConversation,
  UnifiedInboxConversationDetail,
  UnifiedInboxCrmRecord,
  UnifiedInboxOperationalContext,
  UnifiedInboxOperationalFilter,
  UnifiedInboxProjection,
  UnifiedInboxResolutionFilter,
  UnifiedInboxTimelineItem,
} from "../shared/unifiedInbox";

const MAX_ROWS = 500;

type InboxActor = { id: number; role: string };

type ConversationListRow = {
  conversationId: number;
  conversationKey: string;
  conversationType: UnifiedInboxConversation["conversationType"];
  endpointResolutionState: UnifiedInboxConversation["endpointResolutionState"];
  humanActorResolutionState: UnifiedInboxConversation["humanActorResolutionState"];
  medicalSubjectResolutionState: UnifiedInboxConversation["medicalSubjectResolutionState"];
  conversationLastMessageAt: Date | null;
  conversationMessageId: number;
  sourceEventId: number;
  normalizedMessageId: number;
  providerMessageId: string | null;
  correlationState: UnifiedInboxConversation["lastMessage"]["correlationState"];
  provider: "meta" | "wppconnect" | "zernio";
  providerPhoneNumberId: string;
  providerTimestamp: Date | null;
  providerDirection: UnifiedInboxConversation["lastMessage"]["direction"];
  messageType: string;
  textBody: string | null;
  normalizedContent: unknown;
  participantId: string | null;
  participantName: string | null;
  endpointResolutionId: number | null;
  lineId: number | null;
  lineName: string | null;
  lineStatus: string | null;
  lineHealth: string | null;
  linePhone: string | null;
  connectionStatus: string | null;
  connectionHealth: string | null;
};

export function maskInboxEndpoint(value: string | null | undefined): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return "Endpoint unavailable";
  if (normalized.length <= 4) return "••••";
  return `${normalized.slice(0, 2)}••••${normalized.slice(-2)}`;
}

export function deriveInboxIdentityState(input: {
  endpointResolutionState: UnifiedInboxConversation["endpointResolutionState"];
  humanActorResolutionState: UnifiedInboxConversation["humanActorResolutionState"];
}): UnifiedInboxConversation["identityState"] {
  return input.endpointResolutionState === "confirmed" || input.humanActorResolutionState === "confirmed"
    ? "known"
    : "unresolved";
}

function normalizeSearch(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().slice(0, 80);
}

function resolveLineStatus(lifecycleState: string | null | undefined, connectionStatus: string | null | undefined): string {
  return lifecycleState ?? connectionStatus ?? "unknown";
}

function resolveLineHealth(lineHealth: string | null | undefined, connectionHealth: string | null | undefined): string {
  return lineHealth ?? connectionHealth ?? "unknown";
}

function contactLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 64);
  if (!cleaned || /^whatsapp$/i.test(cleaned) || /[<>]/.test(cleaned) || /https?:/i.test(cleaned)) return null;
  return cleaned;
}

function messagePreview(value: string | null | undefined): string | null {
  const cleaned = contactLabel(value);
  return cleaned ? cleaned.slice(0, 120) : null;
}

function readSharedContact(content: unknown): { name: string; phone: string | null } | null {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const contact = (content as Record<string, unknown>).contact;
  if (!contact || typeof contact !== "object" || Array.isArray(contact)) return null;
  const record = contact as Record<string, unknown>;
  const name = contactLabel(typeof record.name === "string" ? record.name : null);
  if (!name) return null;
  const phone = typeof record.phone === "string" ? record.phone.replace(/[^\d+\s()-]/g, "").slice(0, 24) : null;
  return { name, phone: phone || null };
}

export function inboxActivityPreview(messageType: string, textBody: string | null | undefined, content: unknown): string | null {
  const contact = readSharedContact(content);
  if (messageType === "contact") return contact?.name ?? "Contact";
  const text = messagePreview(textBody);
  if (text) return text;
  if (messageType === "image") return "Photo";
  if (messageType === "video") return "Video";
  if (messageType === "voice" || messageType === "audio") return "Voice message";
  if (messageType === "document" || messageType === "file") return "Document";
  if (messageType === "sticker") return "Sticker";
  return null;
}

function participantRank(participantId: string | null | undefined, participantName: string | null | undefined): number {
  let score = 0;
  if (contactLabel(participantName)) score += 4;
  if (normalizeInboxPhone(participantId)) score += 2;
  return score;
}

function senderKind(provider: string, participantId: string | null | undefined): UnifiedInboxConversation["senderEndpointKind"] {
  if (provider === "zernio") return normalizeInboxPhone(participantId) ? "phone" : "unavailable";
  return classifyInboxSenderEndpoint(participantId ?? "");
}

export function isInboxConversationRead(input: {
  lastDirection: "inbound" | "outbound_echo" | "unknown";
  latestMessageId: number;
  lastReadMessageId: number | null | undefined;
}) {
  // A staff user's own outbound echo is already known to that user. Only a
  // later inbound item should reintroduce an unread state.
  return input.lastDirection === "outbound_echo"
    || Boolean(input.lastReadMessageId && input.lastReadMessageId >= input.latestMessageId);
}

function isSyntheticLinkedDevice(adapterKind: string | null | undefined, providerMetadata: unknown): boolean {
  if (adapterKind === "wppconnect_sandbox" || adapterKind === "wppconnect_in_app_sandbox") return true;
  return Boolean(
    providerMetadata &&
    typeof providerMetadata === "object" &&
    !Array.isArray(providerMetadata) &&
    (providerMetadata as Record<string, unknown>).sandboxOnly === true,
  );
}

function reactionEmojis(content: unknown): string[] {
  if (!content || typeof content !== "object" || Array.isArray(content)) return [];
  const reactions = (content as Record<string, unknown>).reactions;
  if (!Array.isArray(reactions)) return [];
  return reactions.filter((item): item is string => typeof item === "string").slice(0, 8);
}

function safeReplyReference(content: unknown): UnifiedInboxTimelineItem["reply"] {
  if (!content || typeof content !== "object" || Array.isArray(content)) return null;
  const reactionMessageId = (content as Record<string, unknown>).reactionMessageId;
  if (typeof reactionMessageId !== "string" || reactionMessageId.length === 0) return null;
  return { providerMessageId: reactionMessageId, relationship: "reaction_reference" };
}

async function canAccessLine(lineId: number | null, actor: InboxActor | undefined, cache: Map<number, boolean>) {
  if (!actor) return true;
  if (!lineId) return false;
  const cached = cache.get(lineId);
  if (cached !== undefined) return cached;
  const allowed = await canUserAccessLinkedDeviceLine({ lineId, userId: actor.id, userRole: actor.role });
  cache.set(lineId, allowed);
  return allowed;
}

function buildConversationItem(row: ConversationListRow): UnifiedInboxConversation {
  const identityState = deriveInboxIdentityState(row);
  const lineName = row.lineName ?? "Linked Device line";
  const lineStatus = resolveLineStatus(row.lineStatus, row.connectionStatus);
  const lineHealth = resolveLineHealth(row.lineHealth, row.connectionHealth);
  return {
    conversationId: row.conversationId,
    conversationReference: row.conversationKey.slice(0, 16),
    conversationType: row.conversationType,
    channel: "whatsapp_linked_device",
    methodLabel: row.provider === "zernio" ? "WhatsApp" : "WPPConnect Linked Device",
    identityState,
    endpointResolutionState: row.endpointResolutionState,
    humanActorResolutionState: row.humanActorResolutionState,
    medicalSubjectResolutionState: row.medicalSubjectResolutionState,
    safeSenderEndpoint: maskInboxEndpoint(row.participantId ?? row.providerPhoneNumberId),
    senderEndpointKind: senderKind(row.provider, row.participantId ?? row.providerPhoneNumberId),
    displayName: row.provider === "zernio" ? contactLabel(row.participantName) : null,
    latestPreview: row.provider === "zernio" ? inboxActivityPreview(row.messageType, row.textBody, row.normalizedContent) : null,
    line: {
      id: row.lineId,
      name: lineName,
      status: lineStatus,
      health: lineHealth,
      maskedPhone: row.linePhone ? maskInboxEndpoint(row.linePhone) : null,
    },
    lastMessage: {
      id: row.conversationMessageId,
      direction: row.providerDirection,
      timestamp: row.providerTimestamp,
      messageType: row.messageType,
      correlationState: row.correlationState,
    },
    lastActivityAt: row.providerTimestamp ?? row.conversationLastMessageAt,
    readState: "not_tracked",
    provenance: {
      provider: row.provider,
      providerMessageId: row.providerMessageId,
      sourceEventId: row.sourceEventId,
      normalizedMessageId: row.normalizedMessageId,
      endpointResolutionId: row.endpointResolutionId,
    },
  };
}

async function enrichOperationalList(conversations: UnifiedInboxConversation[], actor?: InboxActor, rawPhones = new Map<number, string | null>()) {
  const db = await getDb();
  if (!db || !actor || conversations.length === 0) return conversations;
  const ids = conversations.map((conversation) => conversation.conversationId);
  const [readStates, assignments, settingsRows] = await Promise.all([
    db.select().from(whatsappConversationReadStates).where(and(inArray(whatsappConversationReadStates.conversationId, ids), eq(whatsappConversationReadStates.userId, actor.id))),
    db.select({ conversationId: whatsappConversationAssignments.conversationId, id: users.id, name: users.name, role: users.role })
      .from(whatsappConversationAssignments).leftJoin(users, eq(users.id, whatsappConversationAssignments.assignedUserId))
      .where(inArray(whatsappConversationAssignments.conversationId, ids)),
    db.select({ phoneVisibility: whatsappInboxSettings.phoneVisibility })
      .from(whatsappInboxSettings).where(eq(whatsappInboxSettings.clinicScope, "fertiliv")).limit(1),
  ]);
  const maySeeFullPhone = canDisplayFullInboxPhone(settingsRows[0]?.phoneVisibility, actor.role);
  const readByConversation = new Map(readStates.map((state) => [state.conversationId, state]));
  const assignmentByConversation = new Map(assignments.map((assignment) => [assignment.conversationId, assignment]));
  return conversations.map((conversation) => {
    const read = readByConversation.get(conversation.conversationId);
    const assignment = assignmentByConversation.get(conversation.conversationId);
    // Outbound echoes are created by this clinic user and must never make the
    // Conversation unread for that same Inbox. A subsequent inbound reply is
    // still unread unless the actor has explicitly opened/marked it read.
    const isRead = isInboxConversationRead({
      lastDirection: conversation.lastMessage.direction,
      latestMessageId: conversation.lastMessage.id,
      lastReadMessageId: read?.lastReadMessageId,
    });
    return {
      ...conversation,
      readState: isRead ? "read" as const : "unread" as const,
      unreadCount: isRead ? 0 : 1,
      displaySenderEndpoint: maySeeFullPhone ? rawPhones.get(conversation.conversationId) ?? undefined : undefined,
      assignedTo: assignment?.id ? { id: assignment.id, name: assignment.name ?? null, role: assignment.role ?? "staff" } : null,
    };
  });
}

export async function listUnifiedInboxConversations(
  input: { resolution?: UnifiedInboxResolutionFilter; search?: string; limit?: number; operational?: "all" | "unread" | "assigned_to_me" | "unassigned" | "new_contacts" | "known_contacts"; lineId?: number } = {},
  actor?: InboxActor,
): Promise<UnifiedInboxProjection> {
  const db = await getDb();
  // Serve saved conversations immediately. Full Zernio history pull blocks serverless for minutes.
  const resolution = input.resolution ?? "all";
  const search = normalizeSearch(input.search);
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 100);

  if (!db) {
    return {
      conversations: [],
      total: 0,
      filters: { channel: "whatsapp_linked_device", resolution, search },
      readOnly: true,
      identityCreation: "disabled",
    };
  }

  const rows = await db.select({
    conversationId: whatsappConversations.id,
    conversationKey: whatsappConversations.conversationKey,
    conversationType: whatsappConversations.conversationType,
    endpointResolutionState: whatsappConversations.endpointResolutionState,
    humanActorResolutionState: whatsappConversations.humanActorResolutionState,
    medicalSubjectResolutionState: whatsappConversations.medicalSubjectResolutionState,
    conversationLastMessageAt: whatsappConversations.lastMessageAt,
    conversationMessageId: whatsappConversationMessages.id,
    sourceEventId: whatsappConversationMessages.sourceEventId,
    normalizedMessageId: whatsappConversationMessages.normalizedMessageId,
    providerMessageId: whatsappConversationMessages.providerMessageId,
    correlationState: whatsappConversationMessages.correlationState,
    provider: whatsappConversationMessages.provider,
    providerPhoneNumberId: whatsappConversationMessages.providerPhoneNumberId,
    providerTimestamp: whatsappNormalizedMessages.providerTimestamp,
    providerDirection: whatsappNormalizedMessages.providerDirection,
    messageType: whatsappNormalizedMessages.messageType,
    textBody: whatsappNormalizedMessages.textBody,
    normalizedContent: whatsappNormalizedMessages.normalizedContent,
    participantId: whatsappConversationParticipants.providerParticipantId,
    participantName: whatsappConversationParticipants.providerHintDigest,
    endpointResolutionId: whatsappEndpointResolutions.id,
    lineId: whatsappLinkedDeviceLines.id,
    lineName: whatsappLinkedDeviceLines.lineName,
    lineStatus: whatsappLinkedDeviceLines.lifecycleState,
    lineHealth: whatsappLinkedDeviceLines.healthState,
    linePhone: whatsappLinkedDeviceLines.displayPhone,
    connectionStatus: whatsappConnections.lifecycleStatus,
    connectionHealth: whatsappConnections.healthState,
  })
    .from(whatsappConversations)
    .innerJoin(whatsappConversationMessages, eq(whatsappConversationMessages.conversationId, whatsappConversations.id))
    .innerJoin(whatsappNormalizedMessages, eq(whatsappNormalizedMessages.id, whatsappConversationMessages.normalizedMessageId))
    .leftJoin(whatsappConversationParticipants, and(
      eq(whatsappConversationParticipants.conversationId, whatsappConversations.id),
      eq(whatsappConversationParticipants.participantRole, "remote_endpoint"),
    ))
    .leftJoin(whatsappEndpointResolutions, eq(whatsappEndpointResolutions.id, whatsappConversationMessages.resolutionId))
    .leftJoin(whatsappLinkedDeviceLines, eq(whatsappLinkedDeviceLines.connectionId, whatsappConversations.connectionId))
    .leftJoin(whatsappConnections, eq(whatsappConnections.id, whatsappConversations.connectionId))
    .where(inArray(whatsappConversations.provider, ["wppconnect", "zernio"]))
    .orderBy(desc(whatsappConversations.lastMessageAt), desc(whatsappConversationMessages.createdAt))
    .limit(MAX_ROWS);

  const chosen = new Map<number, { row: ConversationListRow; score: number }>();
  const accessCache = new Map<number, boolean>();
  for (const row of rows as ConversationListRow[]) {
    const score = participantRank(row.participantId, row.participantName);
    const current = chosen.get(row.conversationId);
    if (!current) {
      if (!(await canAccessLine(row.lineId, actor, accessCache))) continue;
      chosen.set(row.conversationId, { row, score });
      continue;
    }
    if (score > current.score) {
      chosen.set(row.conversationId, {
        score,
        row: { ...current.row, participantId: row.participantId, participantName: row.participantName },
      });
    }
  }
  const byConversation = new Map<number, UnifiedInboxConversation>();
  const rawPhones = new Map<number, string | null>();
  for (const { row } of chosen.values()) {
    const item = buildConversationItem(row);
    if (resolution !== "all" && resolution !== item.identityState) continue;
    const haystack = [
      item.conversationReference,
      item.displayName,
      item.latestPreview,
      item.safeSenderEndpoint,
      item.line.name,
      item.methodLabel,
      item.identityState,
      item.lastMessage.messageType,
    ].join(" ").toLowerCase();
    if (search && !haystack.includes(search)) continue;
    byConversation.set(row.conversationId, item);
    rawPhones.set(row.conversationId, normalizeInboxPhone(row.participantId));
  }

  const enriched = await enrichOperationalList(Array.from(byConversation.values()), actor, rawPhones);
  const operational = input.operational ?? "all";
  const conversations = enriched.filter((conversation) => {
    if (input.lineId && conversation.line.id !== input.lineId) return false;
    if (operational === "unread") return conversation.readState === "unread";
    if (operational === "assigned_to_me") return conversation.assignedTo?.id === actor?.id;
    if (operational === "unassigned") return !conversation.assignedTo;
    if (operational === "new_contacts") return conversation.identityState === "unresolved";
    if (operational === "known_contacts") return conversation.identityState === "known";
    return true;
  }).slice(0, limit);
  return {
    conversations,
    total: conversations.length,
    filters: { channel: "whatsapp_linked_device", resolution, search, operational },
    readOnly: false,
    identityCreation: "manual_only",
  };
}

export async function getUnifiedInboxConversationDetail(
  conversationId: number,
  actor: InboxActor,
): Promise<UnifiedInboxConversationDetail | null> {
  const db = await getDb();
  if (!db) return null;
  // Refresh only this thread, with a hard timeout inside syncZernioConversation.
  // Failures leave the saved DB rows intact so the UI still shows name, phone, and messages.
  await syncZernioConversation(conversationId);

  const [header] = await db.select({
    conversationId: whatsappConversations.id,
    conversationKey: whatsappConversations.conversationKey,
    conversationType: whatsappConversations.conversationType,
    provider: whatsappConversations.provider,
    connectionId: whatsappConversations.connectionId,
    providerPhoneNumberId: whatsappConversations.providerPhoneNumberId,
    providerThreadId: whatsappConversations.providerThreadId,
    endpointResolutionState: whatsappConversations.endpointResolutionState,
    humanActorResolutionState: whatsappConversations.humanActorResolutionState,
    medicalSubjectResolutionState: whatsappConversations.medicalSubjectResolutionState,
    firstMessageAt: whatsappConversations.firstMessageAt,
    lastMessageAt: whatsappConversations.lastMessageAt,
    participantId: whatsappConversationParticipants.providerParticipantId,
    participantName: whatsappConversationParticipants.providerHintDigest,
    endpointId: whatsappConversationParticipants.endpointId,
    endpointProviderEndpointId: whatsappCommunicationEndpoints.providerEndpointId,
    lineId: whatsappLinkedDeviceLines.id,
    lineName: whatsappLinkedDeviceLines.lineName,
    lineStatus: whatsappLinkedDeviceLines.lifecycleState,
    lineHealth: whatsappLinkedDeviceLines.healthState,
    linePhone: whatsappLinkedDeviceLines.displayPhone,
    lineAdapterKind: whatsappLinkedDeviceLines.adapterKind,
    connectionStatus: whatsappConnections.lifecycleStatus,
    connectionHealth: whatsappConnections.healthState,
    connectionProviderMetadata: whatsappConnections.providerMetadata,
  })
    .from(whatsappConversations)
    .leftJoin(whatsappConversationParticipants, eq(whatsappConversationParticipants.conversationId, whatsappConversations.id))
    .leftJoin(whatsappCommunicationEndpoints, eq(whatsappCommunicationEndpoints.id, whatsappConversationParticipants.endpointId))
    .leftJoin(whatsappLinkedDeviceLines, eq(whatsappLinkedDeviceLines.connectionId, whatsappConversations.connectionId))
    .leftJoin(whatsappConnections, eq(whatsappConnections.id, whatsappConversations.connectionId))
    .where(and(eq(whatsappConversations.id, conversationId), inArray(whatsappConversations.provider, ["wppconnect", "zernio"])))
    .limit(1);

  if (!header || !(await canAccessLine(header.lineId, actor, new Map()))) return null;
  const remoteParticipants = await db.select({
    participantId: whatsappConversationParticipants.providerParticipantId,
    participantName: whatsappConversationParticipants.providerHintDigest,
  }).from(whatsappConversationParticipants).where(and(
    eq(whatsappConversationParticipants.conversationId, conversationId),
    eq(whatsappConversationParticipants.participantRole, "remote_endpoint"),
  ));
  const bestParticipant = remoteParticipants.reduce<typeof remoteParticipants[number] | null>((best, row) => {
    if (!best || participantRank(row.participantId, row.participantName) > participantRank(best.participantId, best.participantName)) return row;
    return best;
  }, null);
  const participantId = bestParticipant?.participantId ?? header.participantId;
  const participantName = bestParticipant?.participantName ?? header.participantName;

  const messageRows = await db.select({
    conversationMessageId: whatsappConversationMessages.id,
    sourceEventId: whatsappConversationMessages.sourceEventId,
    normalizedMessageId: whatsappConversationMessages.normalizedMessageId,
    resolutionId: whatsappConversationMessages.resolutionId,
    provider: whatsappConversationMessages.provider,
    providerPhoneNumberId: whatsappConversationMessages.providerPhoneNumberId,
    providerMessageId: whatsappConversationMessages.providerMessageId,
    providerItemKey: whatsappConversationMessages.providerItemKey,
    correlationState: whatsappConversationMessages.correlationState,
    providerTimestamp: whatsappNormalizedMessages.providerTimestamp,
    providerDirection: whatsappNormalizedMessages.providerDirection,
    messageType: whatsappNormalizedMessages.messageType,
    textBody: whatsappNormalizedMessages.textBody,
    normalizedContent: whatsappNormalizedMessages.normalizedContent,
    normalizationVersion: whatsappNormalizedMessages.normalizationVersion,
    normalizationState: whatsappNormalizedMessages.normalizationState,
    failureCategory: whatsappNormalizedMessages.failureCategory,
  })
    .from(whatsappConversationMessages)
    .innerJoin(whatsappNormalizedMessages, eq(whatsappNormalizedMessages.id, whatsappConversationMessages.normalizedMessageId))
    .where(eq(whatsappConversationMessages.conversationId, conversationId))
    .orderBy(asc(whatsappNormalizedMessages.providerTimestamp), asc(whatsappConversationMessages.createdAt));

  const sourceEventIds = messageRows.map((row) => row.sourceEventId);
  const providerMessageIds = messageRows
    .map((row) => row.providerMessageId)
    .filter((value): value is string => Boolean(value));
  const mediaRows = sourceEventIds.length === 0 ? [] : await db.select({
    sourceEventId: whatsappNormalizedMedia.sourceEventId,
    sourceMessageItemKey: whatsappNormalizedMedia.sourceMessageItemKey,
    mediaId: whatsappNormalizedMedia.id,
    providerMediaId: whatsappNormalizedMedia.providerMediaId,
    mediaType: whatsappNormalizedMedia.mediaType,
    mimeType: whatsappNormalizedMedia.mimeType,
    filename: whatsappNormalizedMedia.filename,
    caption: whatsappNormalizedMedia.caption,
    mediaState: whatsappNormalizedMedia.mediaState,
  }).from(whatsappNormalizedMedia).where(inArray(whatsappNormalizedMedia.sourceEventId, sourceEventIds));
  const mediaAssetRows = mediaRows.length === 0 ? [] : await db.select({
    normalizedMediaId: communicationMediaAssets.normalizedMediaId,
    mediaAssetId: communicationMediaAssets.id,
    accessState: communicationMediaAssets.accessState,
    filename: communicationMediaAssets.filename,
  }).from(communicationMediaAssets).where(inArray(communicationMediaAssets.normalizedMediaId, mediaRows.map((row) => row.mediaId)));
  const mediaAssetByNormalizedId = new Map(mediaAssetRows.map((row) => [row.normalizedMediaId, row]));
  const statusRows = providerMessageIds.length === 0 ? [] : await db.select({
    providerMessageId: whatsappNormalizedStatuses.providerMessageId,
    statusValue: whatsappNormalizedStatuses.statusValue,
    providerTimestamp: whatsappNormalizedStatuses.providerTimestamp,
    errorCode: whatsappNormalizedStatuses.errorCode,
    errorTitle: whatsappNormalizedStatuses.errorTitle,
  }).from(whatsappNormalizedStatuses).where(inArray(whatsappNormalizedStatuses.providerMessageId, providerMessageIds))
    .orderBy(desc(whatsappNormalizedStatuses.providerTimestamp));

  const mediaByKey = new Map<string, Array<UnifiedInboxTimelineItem["media"][number]>>();
  for (const row of mediaRows) {
    const asset = mediaAssetByNormalizedId.get(row.mediaId);
    const item = {
      id: row.mediaId,
      mediaAssetId: asset?.mediaAssetId ?? null,
      mediaType: row.mediaType,
      mimeType: row.mimeType,
      filename: asset?.filename ?? row.filename,
      caption: row.caption,
      mediaState: row.mediaState,
      providerMediaId: row.providerMediaId,
      mediaAvailable: asset?.accessState === "available",
    };
    for (const key of [`${row.sourceEventId}:${row.sourceMessageItemKey}`, row.sourceMessageItemKey]) {
      const values = mediaByKey.get(key) ?? [];
      if (!values.some((value) => value.id === item.id)) values.push(item);
      mediaByKey.set(key, values);
    }
  }
  const statusByMessageId = new Map<string, UnifiedInboxTimelineItem["deliveryStatus"]>();
  for (const row of statusRows) {
    if (!row.providerMessageId || statusByMessageId.has(row.providerMessageId)) continue;
    statusByMessageId.set(row.providerMessageId, {
      statusValue: row.statusValue,
      timestamp: row.providerTimestamp,
      errorCode: row.errorCode,
      errorTitle: row.errorTitle,
    });
  }
  const attemptRows = await db.select({
    id: whatsappSendAttempts.id,
    attemptState: whatsappSendAttempts.attemptState,
    providerMessageId: whatsappSendAttempts.providerMessageId,
    failureCategory: whatsappSendAttempts.failureCategory,
    clientActionId: whatsappSendAttempts.clientActionId,
    diagnosticStage: whatsappSendAttempts.diagnosticStage,
    diagnosticProbe: whatsappSendAttempts.diagnosticProbe,
    diagnosticOutcome: whatsappSendAttempts.diagnosticOutcome,
    diagnosticAt: whatsappSendAttempts.diagnosticAt,
    correlationId: whatsappSendAttempts.correlationId,
    lineId: whatsappSendAttempts.lineId,
    sessionName: whatsappSendAttempts.sessionName,
    runtimeEndpointHost: whatsappSendAttempts.runtimeEndpointHost,
    runtimeMode: whatsappSendAttempts.runtimeMode,
    runtimeGateValue: whatsappSendAttempts.runtimeGateValue,
    approvalSecretSelector: whatsappSendAttempts.approvalSecretSelector,
    approvalProofVersion: whatsappSendAttempts.approvalProofVersion,
    approvalExpiryState: whatsappSendAttempts.approvalExpiryState,
    recipientFingerprint: whatsappSendAttempts.recipientFingerprint,
    approvalReason: whatsappSendAttempts.approvalReason,
    createdAt: whatsappSendAttempts.createdAt,
  }).from(whatsappSendAttempts)
    .where(eq(whatsappSendAttempts.conversationId, conversationId))
    .orderBy(desc(whatsappSendAttempts.createdAt))
    .limit(50);
  const acceptedAttemptsByProviderMessage = new Map(
    attemptRows
      .filter((attempt) => attempt.providerMessageId && ["accepted", "delivered", "read"].includes(attempt.attemptState))
      .map((attempt) => [attempt.providerMessageId!, attempt]),
  );

  const syntheticSafe = isSyntheticLinkedDevice(header.lineAdapterKind, header.connectionProviderMetadata);
  const exposeBody = syntheticSafe || header.provider === "zernio";
  const timeline: UnifiedInboxTimelineItem[] = messageRows.map((row) => ({
    id: row.conversationMessageId,
    direction: row.providerDirection,
    timestamp: row.providerTimestamp,
    messageType: row.messageType,
    messageBody: exposeBody ? row.textBody : null,
    bodyVisibility: exposeBody ? (header.provider === "zernio" ? "authorized" : "synthetic_safe") : "not_exposed",
    reactions: reactionEmojis(row.normalizedContent),
    sharedContact: readSharedContact(row.normalizedContent),
    media: mediaByKey.get(`${row.sourceEventId}:${row.providerItemKey}`) ?? mediaByKey.get(row.providerItemKey) ?? [],
    reply: safeReplyReference(row.normalizedContent),
    deliveryStatus: row.providerMessageId
      ? statusByMessageId.get(row.providerMessageId)
        ?? (acceptedAttemptsByProviderMessage.has(row.providerMessageId)
          ? { statusValue: "sent", timestamp: acceptedAttemptsByProviderMessage.get(row.providerMessageId)?.createdAt ?? null, errorCode: null, errorTitle: null }
          : null)
      : null,
    normalization: {
      state: row.normalizationState,
      version: row.normalizationVersion,
      failureCategory: row.failureCategory,
    },
    correlationState: row.correlationState,
    provenance: {
      provider: row.provider,
      providerMessageId: row.providerMessageId,
      providerItemKey: row.providerItemKey,
      sourceEventId: row.sourceEventId,
      normalizedMessageId: row.normalizedMessageId,
      endpointResolutionId: row.resolutionId,
    },
  }));

  const visibleTimeline: UnifiedInboxTimelineItem[] = [];
  const timelineScore = (entry: UnifiedInboxTimelineItem) => (entry.reactions?.length ? 4 : 0) + (entry.media.length ? 2 : 0) + (entry.sharedContact ? 2 : 0) + ((entry.provenance.providerMessageId?.length ?? 0) > 40 ? 1 : 0);
  for (const item of timeline) {
    const blank = item.messageType === "text" && !item.messageBody?.trim() && item.media.length === 0 && !item.sharedContact && !(item.reactions?.length);
    if (blank) continue;
    const twinIndex = visibleTimeline.findIndex((other) => (
      other.direction === item.direction
      && (other.messageBody ?? "") === (item.messageBody ?? "")
      && Boolean(item.messageBody?.trim())
      && Math.abs(new Date(other.timestamp ?? 0).getTime() - new Date(item.timestamp ?? 0).getTime()) < 120_000
    ));
    if (twinIndex === -1) visibleTimeline.push(item);
    else if (timelineScore(item) > timelineScore(visibleTimeline[twinIndex])) visibleTimeline[twinIndex] = item;
  }
  const latest = visibleTimeline[visibleTimeline.length - 1];
  const safeEndpoint = maskInboxEndpoint(
    participantId ?? header.endpointProviderEndpointId ?? header.providerThreadId ?? header.providerPhoneNumberId,
  );
  const endpointValue = participantId ?? header.endpointProviderEndpointId ?? header.providerThreadId ?? header.providerPhoneNumberId;
  const baseConversation: UnifiedInboxConversation = {
    conversationId: header.conversationId,
    conversationReference: header.conversationKey.slice(0, 16),
    conversationType: header.conversationType,
    channel: "whatsapp_linked_device",
    methodLabel: header.provider === "zernio" ? "WhatsApp" : "WPPConnect Linked Device",
    identityState: deriveInboxIdentityState(header),
    endpointResolutionState: header.endpointResolutionState,
    humanActorResolutionState: header.humanActorResolutionState,
    medicalSubjectResolutionState: header.medicalSubjectResolutionState,
    safeSenderEndpoint: safeEndpoint,
    senderEndpointKind: senderKind(header.provider, endpointValue),
    displayName: header.provider === "zernio" ? contactLabel(participantName) : null,
    line: {
      id: header.lineId,
      name: header.lineName ?? "Linked Device line",
      status: resolveLineStatus(header.lineStatus, header.connectionStatus),
      health: resolveLineHealth(header.lineHealth, header.connectionHealth),
      maskedPhone: header.linePhone ? maskInboxEndpoint(header.linePhone) : null,
    },
    lastMessage: {
      id: latest?.id ?? 0,
      direction: latest?.direction ?? "unknown",
      timestamp: latest?.timestamp ?? header.lastMessageAt,
      messageType: latest?.messageType ?? "unknown",
      correlationState: latest?.correlationState ?? "correlated",
    },
    lastActivityAt: header.lastMessageAt,
    readState: "not_tracked",
    provenance: {
      provider: header.provider,
      providerMessageId: latest?.provenance.providerMessageId ?? null,
      sourceEventId: latest?.provenance.sourceEventId ?? 0,
      normalizedMessageId: latest?.provenance.normalizedMessageId ?? 0,
      endpointResolutionId: latest?.provenance.endpointResolutionId ?? null,
    },
  };

  const operational = await getOperationalInboxContext(conversationId, actor);
  return {
    conversation: { ...baseConversation, displaySenderEndpoint: operational.phone ?? undefined },
    firstActivityAt: header.firstMessageAt,
    lastActivityAt: header.lastMessageAt,
    timeline: visibleTimeline,
    outboundAttempts: attemptRows.map((attempt) => ({
      id: attempt.id,
      state: attempt.attemptState,
      createdAt: attempt.createdAt,
      providerMessageId: attempt.providerMessageId,
      failureCategory: attempt.failureCategory,
      clientActionId: attempt.clientActionId,
      diagnostic: actor.role === "admin" && attempt.correlationId
        ? {
          stage: attempt.diagnosticStage ?? "provider_send",
          probe: attempt.diagnosticProbe ?? "correlation",
          outcome: attempt.diagnosticOutcome ?? attempt.attemptState,
          timestamp: attempt.diagnosticAt ?? attempt.createdAt,
          correlationId: attempt.correlationId,
          approvalReason: attempt.approvalReason,
          lineId: attempt.lineId,
          sessionName: attempt.sessionName,
          runtimeEndpointHost: attempt.runtimeEndpointHost,
          runtimeMode: attempt.runtimeMode,
          gateValue: attempt.runtimeGateValue,
          secretSelector: attempt.approvalSecretSelector === "jwt_secret" || attempt.approvalSecretSelector === "persistent_worker_approval_secret" ? attempt.approvalSecretSelector : null,
          proofVersion: attempt.approvalProofVersion,
          expiryState: attempt.approvalExpiryState,
          recipientFingerprint: attempt.recipientFingerprint,
        }
        : null,
    })),
    operational,
    diagnostics: {
      readOnly: false,
      identityCreation: "manual_only",
      provider: header.provider,
      connectionId: header.connectionId,
      lineId: header.lineId,
      endpointId: header.endpointId,
      providerPhoneNumberId: header.providerPhoneNumberId,
      syntheticSafeBody: syntheticSafe,
    },
  };
}
