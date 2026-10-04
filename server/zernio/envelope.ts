import { normalizeInboxDirectPhone } from "../../shared/unifiedInbox";

export type ZernioDirection = "incoming" | "outgoing";

export type ZernioAttachment = {
  type: string;
  url: string | null;
  mimeType: string | null;
  filename: string | null;
  mediaId: string | null;
};

export type ZernioContactCard = {
  name: string;
  phone: string | null;
};

export type ZernioEnvelope = {
  externalConversationId: string;
  externalMessageId: string | null;
  /** Every id Zernio may use for this message. Matching uses all of them. */
  messageIds: string[];
  accountId: string;
  body: string;
  sentAt: Date;
  direction: ZernioDirection;
  messageType: string;
  mediaUrl: string | null;
  mimeType: string | null;
  filename: string | null;
  attachments: ZernioAttachment[];
  contacts: ZernioContactCard[];
  /** null when the payload did not include a reactions array. */
  reactions: string[] | null;
  replyToMessageId: string | null;
  reactionEmoji: string | null;
  reactionRemoved: boolean;
  reactionTargetId: string | null;
  reactionTargetIds: string[];
  participantPhone: string | null;
  participantName: string | null;
  /** Set only for media this clinic already stored while sending. */
  localStorageKey: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 4000);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function uniqueIds(values: Array<string | null>): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of values) {
    const id = value?.slice(0, 128);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids.slice(0, 6);
}

function phoneFrom(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    const phone = normalizeInboxDirectPhone(String(value));
    if (phone) return phone;
  }
  return null;
}

function cleanLabel(value: string | null): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (!cleaned || /^whatsapp$/i.test(cleaned) || /[<>]/.test(cleaned) || /https?:/i.test(cleaned)) return null;
  return cleaned;
}

function attachmentRecords(message: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown>[] {
  const sources = [message.attachments, data.attachments, message.attachment, data.attachment];
  const records: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    const items = Array.isArray(source) ? source : source ? [source] : [];
    for (const item of items) {
      const record = asRecord(item);
      if (!record) continue;
      const key = pickString(record.id, record.url) ?? `${records.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      records.push(record);
    }
  }
  return records;
}

function baseMime(value: string | null): string {
  return (value ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

export function classifyZernioMessageType(input: { declared: string | null; attachmentType: string | null; mimeType: string | null; hasContact: boolean }): string {
  if (input.hasContact) return "contact";
  const declared = (input.attachmentType ?? input.declared ?? "text").toLowerCase();
  const mime = baseMime(input.mimeType);
  if (declared === "image" || mime.startsWith("image/")) return "image";
  if (declared === "video" || mime.startsWith("video/")) return "video";
  if (declared === "audio" || declared === "voice" || mime.startsWith("audio/")) {
    return /ogg|opus/i.test(input.mimeType ?? "") || declared === "voice" ? "voice" : "audio";
  }
  if (declared === "file" || declared === "document" || mime === "application/pdf") return "document";
  if (declared === "sticker") return "sticker";
  return declared === "text" ? "text" : declared.slice(0, 64);
}

function readContacts(metadata: Record<string, unknown> | null): ZernioContactCard[] {
  const list = Array.isArray(metadata?.contacts) ? metadata.contacts : [];
  const cards: ZernioContactCard[] = [];
  for (const item of list) {
    const record = asRecord(item);
    if (!record) continue;
    const nameRecord = asRecord(record.name);
    const name = cleanLabel(pickString(nameRecord?.formatted_name, nameRecord?.first_name, record.formatted_name, record.name));
    const phones = Array.isArray(record.phones) ? record.phones : [];
    const phone = phoneFrom(...phones.map((entry) => asRecord(entry)?.phone));
    if (!name) continue;
    cards.push({ name, phone });
  }
  return cards.slice(0, 5);
}

function readReactions(message: Record<string, unknown>): string[] | null {
  if (!Array.isArray(message.reactions)) return null;
  const emojis: string[] = [];
  for (const item of message.reactions) {
    const record = asRecord(item);
    const emoji = (typeof record?.emoji === "string" ? record.emoji : typeof item === "string" ? item : "").trim().slice(0, 16);
    if (emoji && !emojis.includes(emoji)) emojis.push(emoji);
  }
  return emojis.slice(0, 8);
}

export function readZernioEvent(payload: unknown): { eventType: string; eventId: string | null; data: Record<string, unknown> } {
  const root = asRecord(payload) ?? {};
  const data = asRecord(root.data) ?? root;
  return {
    eventType: pickString(root.event, root.type, data.event, data.type) ?? "unknown",
    eventId: pickString(root.id, data.id, root.eventId, data.eventId),
    data,
  };
}

export function parseZernioEnvelope(data: Record<string, unknown>): ZernioEnvelope | null {
  const inlineText = typeof data.message === "string" ? data.message : null;
  const message = asRecord(data.message) ?? data;
  const conversation = asRecord(data.conversation) ?? asRecord(message.conversation);
  const account = asRecord(data.account) ?? asRecord(message.account);
  const externalConversationId = pickString(conversation?.id, conversation?._id, message.conversationId, data.conversationId);
  const accountId = pickString(account?.id, account?._id, account?.accountId, data.accountId, message.accountId, conversation?.accountId);
  if (!externalConversationId || !accountId) return null;

  const rawDirection = pickString(message.direction, data.direction)?.toLowerCase() ?? "";
  const direction: ZernioDirection = rawDirection === "outgoing" || rawDirection === "outbound" || rawDirection === "sent" ? "outgoing" : "incoming";
  const attachments = attachmentRecords(message, data).slice(0, 4).map((attachment) => ({
    type: pickString(attachment.type) ?? "file",
    url: pickString(attachment.url),
    mimeType: pickString(attachment.mimeType, attachment.mime_type),
    filename: pickString(attachment.filename, attachment.name, attachment.fileName),
    mediaId: pickString(attachment.id, asRecord(attachment.payload)?.id),
  }));
  const attachment = attachments[0] ?? null;
  const metadata = asRecord(message.metadata) ?? asRecord(data.metadata);
  const contacts = readContacts(metadata);
  const reaction = asRecord(data.reaction) ?? asRecord(message.reaction);
  const sender = asRecord(message.sender) ?? asRecord(data.sender);
  const participant = asRecord(conversation?.participant) ?? asRecord(data.contact);
  const sentAtRaw = pickString(message.sentAt, message.createdAt, message.timestamp, data.timestamp);
  const sentAt = sentAtRaw ? new Date(sentAtRaw) : new Date();
  const remoteName = cleanLabel(pickString(participant?.name, conversation?.participantName, data.participantName));
  const senderName = cleanLabel(pickString(sender?.name, message.senderName));
  // An outgoing sender is the connected clinic line. The customer is the other party.
  const name = direction === "outgoing" ? remoteName : cleanLabel(pickString(senderName, remoteName));
  const messageIds = uniqueIds([
    pickString(message.id, message._id),
    pickString(message.platformMessageId),
    pickString(data.messageId),
  ]);
  const reactionTargetIds = uniqueIds([
    pickString(reaction?.platformMessageId),
    pickString(reaction?.messageId, reaction?.targetMessageId),
    pickString(message.targetMessageId),
  ]);
  const rawEmoji = reaction && typeof reaction.emoji === "string" ? reaction.emoji : null;
  const declared = pickString(message.type, message.messageType);

  return {
    externalConversationId: externalConversationId.slice(0, 128),
    externalMessageId: messageIds[0] ?? null,
    messageIds,
    accountId: accountId.slice(0, 128),
    body: pickString(inlineText, message.text, message.body, message.content, typeof message.message === "string" ? message.message : null, data.text) ?? "",
    sentAt: Number.isNaN(sentAt.getTime()) ? new Date() : sentAt,
    direction,
    messageType: classifyZernioMessageType({
      declared,
      attachmentType: attachment?.type ?? null,
      mimeType: attachment?.mimeType ?? null,
      hasContact: contacts.length > 0,
    }),
    mediaUrl: attachment?.url ?? pickString(message.mediaUrl, message.attachmentUrl),
    mimeType: attachment?.mimeType ?? pickString(message.mimeType),
    filename: attachment?.filename ?? pickString(message.filename),
    attachments,
    contacts,
    reactions: readReactions(message),
    replyToMessageId: pickString(message.replyTo, message.replyToMessageId, asRecord(message.reply)?.id),
    reactionEmoji: rawEmoji && rawEmoji.trim() ? rawEmoji.trim().slice(0, 16) : null,
    reactionRemoved: rawEmoji === "" || reaction?.action === "removed",
    reactionTargetId: reactionTargetIds[0] ?? null,
    reactionTargetIds,
    participantPhone: direction === "outgoing"
      ? phoneFrom(
        participant?.phone,
        participant?.username,
        conversation?.participantUsername,
        conversation?.participantId,
        data.participantUsername,
        data.phone,
      )
      : phoneFrom(
        sender?.phoneNumber,
        sender?.phone,
        sender?.username,
        message.senderPhoneNumber,
        message.senderId,
        participant?.phone,
        participant?.username,
        conversation?.participantUsername,
        conversation?.participantId,
        data.participantUsername,
        data.phone,
      ),
    participantName: name,
    localStorageKey: null,
  };
}

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Free-text sends are allowed only inside WhatsApp's 24-hour customer-care window. */
export function isInsideWhatsAppWindow(lastInboundAt: Date | null, now = new Date()): boolean {
  if (!lastInboundAt) return false;
  return now.getTime() - lastInboundAt.getTime() <= WINDOW_MS;
}
