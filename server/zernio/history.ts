import { eq } from "drizzle-orm";
import { whatsappConversationMessages, whatsappConversations, whatsappNormalizedMessages } from "../../drizzle/schema";
import { getDb } from "../db";
import { listZernioMessages } from "./client";
import { parseZernioEnvelope } from "./envelope";
import { digest, rememberZernioContact, reviseZernioMessage, upsertZernioMessage } from "./store";

const syncedAt = new Map<number, number>();
const SYNC_INTERVAL_MS = 60_000;
/** Cap one-thread history pull so an inbox open cannot hang the serverless request. */
const SYNC_TIMEOUT_MS = 12_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function syncOne(conversationId: number) {
  const db = await getDb();
  if (!db) return;
  const [conversation] = await db.select({
    id: whatsappConversations.id,
    threadId: whatsappConversations.providerThreadId,
    accountId: whatsappConversations.providerPhoneNumberId,
    connectionId: whatsappConversations.connectionId,
  }).from(whatsappConversations).where(eq(whatsappConversations.id, conversationId)).limit(1);
  if (!conversation?.threadId || !conversation.accountId) return;

  const page = await listZernioMessages({ conversationId: conversation.threadId, accountId: conversation.accountId });
  const messages = (page.messages ?? page.data ?? []).filter((item): item is Record<string, unknown> => Boolean(asRecord(item)));
  const existing = await db.select({
    normalizedMessageId: whatsappNormalizedMessages.id,
    providerMessageId: whatsappNormalizedMessages.providerMessageId,
    providerItemKey: whatsappNormalizedMessages.providerItemKey,
    sourceEventId: whatsappConversationMessages.sourceEventId,
  }).from(whatsappConversationMessages).innerJoin(
    whatsappNormalizedMessages,
    eq(whatsappNormalizedMessages.id, whatsappConversationMessages.normalizedMessageId),
  ).where(eq(whatsappConversationMessages.conversationId, conversationId));

  let name: string | null = null;
  let phone: string | null = null;
  let identityAt = -1;
  let media = 0;
  let contacts = 0;
  let reactions = 0;
  for (const message of messages) {
    const envelope = parseZernioEnvelope(message);
    if (!envelope) continue;
    if (envelope.direction === "incoming" && envelope.sentAt.getTime() >= identityAt) {
      identityAt = envelope.sentAt.getTime();
      if (envelope.participantName) name = envelope.participantName;
      if (envelope.participantPhone) phone = envelope.participantPhone;
    }
    if (envelope.contacts.length) contacts += 1;
    if (envelope.reactions?.length) reactions += 1;
    if (envelope.attachments.length) media += 1;
    const match = existing.find((row) => envelope.messageIds.some((id) => id === row.providerMessageId || id === row.providerItemKey));
    if (match) {
      await reviseZernioMessage({
        normalizedMessageId: match.normalizedMessageId,
        sourceEventId: match.sourceEventId,
        connectionId: conversation.connectionId,
        conversationId,
        providerItemKey: match.providerItemKey,
        envelope,
      });
      continue;
    }
    await upsertZernioMessage({
      envelope,
      payloadHash: digest(`history:${envelope.externalMessageId ?? conversationId}:${messages.indexOf(message)}`),
      eventKey: `history:${envelope.externalMessageId ?? conversationId}:${messages.indexOf(message)}`,
    });
  }
  // Only write when inbound history actually has a label or phone; never clear stored contact fields.
  if (name || phone) await rememberZernioContact(conversationId, name, phone);
  console.info("[zernio] history refreshed", { conversationId, messages: messages.length, media, contacts, reactions });
}

function withSyncTimeout<T>(work: Promise<T>, conversationId: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      console.warn("[zernio] history sync timed out", { conversationId, timeoutMs: SYNC_TIMEOUT_MS });
      reject(new Error("zernio_sync_timeout"));
    }, SYNC_TIMEOUT_MS);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Pulls the live WhatsApp thread so media, contacts, and reactions survive a webhook that stored only text. */
export async function syncZernioConversation(conversationId: number) {
  if (!process.env.ZERNIO_API_KEY?.trim() || process.env.VITEST) return;
  const last = syncedAt.get(conversationId) ?? 0;
  if (Date.now() - last < SYNC_INTERVAL_MS) return;
  syncedAt.set(conversationId, Date.now());
  try {
    await withSyncTimeout(syncOne(conversationId), conversationId);
  } catch (error) {
    syncedAt.delete(conversationId);
    console.error("[zernio] history sync failed", {
      conversationId,
      name: error instanceof Error ? error.name : "error",
      message: error instanceof Error && error.message === "zernio_sync_timeout" ? "timeout" : "error",
    });
  }
}

/** Background-only full inbox pull. Do not await this on the contact list; it is too slow for serverless. */
export async function syncZernioInbox() {
  const db = await getDb();
  if (!db) return;
  const rows = await db.select({ id: whatsappConversations.id }).from(whatsappConversations)
    .where(eq(whatsappConversations.provider, "zernio")).limit(20);
  console.info("[zernio] inbox history pull started", { conversations: rows.length });
  for (const row of rows) await syncZernioConversation(row.id);
}
