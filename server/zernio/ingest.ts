import { createHash } from "crypto";
import { isInsideWhatsAppWindow, parseZernioEnvelope, readZernioEvent } from "./envelope";
import { verifyZernioSignature } from "./signature";
import {
  applyZernioReaction,
  applyZernioStatus,
  claimZernioEvent,
  digest,
  ensureZernioConnection,
  finishZernioEvent,
  markZernioAccountDisconnected,
  markZernioMessageDeleted,
  upsertZernioMessage,
} from "./store";

export { isInsideWhatsAppWindow };

export async function handleZernioWebhook(input: { rawBody: Buffer; signature: string }): Promise<{ status: number; body: Record<string, unknown> }> {
  const secret = process.env.ZERNIO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.error("[zernio] webhook secret is not configured");
    return { status: 503, body: { error: "webhook_not_configured" } };
  }
  if (!verifyZernioSignature(input.rawBody, input.signature, secret)) {
    console.warn("[zernio] rejected webhook signature");
    return { status: 401, body: { error: "invalid_signature" } };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(input.rawBody.toString("utf8"));
  } catch {
    return { status: 400, body: { error: "invalid_json" } };
  }

  const event = readZernioEvent(payload);
  const payloadHash = digest(input.rawBody.toString("utf8"));
  const eventId = event.eventId ?? createHash("sha256").update(input.rawBody).digest("hex");
  const claim = await claimZernioEvent({ eventId, eventType: event.eventType, payloadHash });
  if (claim.duplicate) return { status: 200, body: { ok: true, duplicate: true } };

  try {
    const ignored = await dispatchZernioEvent(event.eventType, event.data, payloadHash, eventId);
    await finishZernioEvent(eventId, ignored ? "ignored" : "processed");
    console.info("[zernio] webhook stored", { eventType: event.eventType, outcome: ignored ? "ignored" : "processed" });
    return { status: 200, body: { ok: true } };
  } catch (error) {
    await finishZernioEvent(eventId, "failed");
    console.error("[zernio] webhook handler failed", { eventType: event.eventType, name: error instanceof Error ? error.name : "error" });
    return { status: 500, body: { error: "webhook_failed" } };
  }
}

async function dispatchZernioEvent(eventType: string, data: Record<string, unknown>, payloadHash: string, eventId: string): Promise<boolean> {
  if (eventType === "webhook.test") return false;
  if (eventType === "account.connected" || eventType === "account.disconnected") {
    const accountId = stringField(data.accountId) ?? stringField(record(data.account)?.id);
    if (!accountId) return true;
    if (eventType === "account.disconnected") await markZernioAccountDisconnected(accountId);
    else await ensureZernioConnection(accountId, null);
    return false;
  }
  if (eventType === "message.deleted") {
    const messageId = stringField(data.messageId) ?? stringField(record(data.message)?.id);
    if (messageId) await markZernioMessageDeleted(messageId);
    return !messageId;
  }
  if (eventType === "message.delivered" || eventType === "message.read" || eventType === "message.failed" || eventType === "message.sent") {
    const envelope = parseZernioEnvelope(data);
    if (eventType === "message.sent" && envelope) {
      // The connected line is the sender. Keep the customer already stored for this chat.
      await upsertZernioMessage({
        envelope: { ...envelope, direction: "outgoing", participantName: null, participantPhone: null },
        payloadHash,
        eventKey: eventId,
      });
      return false;
    }
    const messageId = envelope?.externalMessageId ?? stringField(data.messageId);
    const accountId = envelope?.accountId ?? stringField(data.accountId);
    if (!messageId || !accountId) return true;
    const status = eventType === "message.delivered" ? "delivered" : eventType === "message.read" ? "read" : eventType === "message.failed" ? "failed" : "sent";
    await applyZernioStatus({ accountId, providerMessageId: messageId, status, payloadHash, eventKey: eventId });
    return false;
  }
  if (eventType === "reaction.received" || eventType === "message.reaction") {
    const envelope = parseZernioEnvelope(data);
    const targets = envelope?.reactionTargetIds ?? [];
    if (!envelope || targets.length === 0) return true;
    if (!envelope.reactionEmoji && !envelope.reactionRemoved) return true;
    await applyZernioReaction({
      accountId: envelope.accountId,
      targetMessageIds: targets,
      emoji: envelope.reactionRemoved ? "" : envelope.reactionEmoji ?? "",
    });
    return false;
  }
  if (eventType === "message.received" || eventType === "conversation.started") {
    const envelope = parseZernioEnvelope(data);
    if (!envelope) return true;
    await upsertZernioMessage({ envelope, payloadHash, eventKey: eventId });
    return false;
  }
  return true;
}

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
