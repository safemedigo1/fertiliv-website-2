/**
 * WhatsApp Phase 1 connection-aware Meta Cloud API transport.
 *
 * Legacy environment configuration remains available through the explicit
 * LegacyEnvConnectionAdapter. No connection secrets are stored in the database.
 */

import { randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";
import { whatsappMessages } from "../drizzle/schema";
import type { ResolvedWhatsAppConnection } from "../shared/whatsappPhase1Contracts";
import { getDb } from "./db";
import type { ResolvedOutboundWhatsAppConnection } from "./whatsappConnection";
import {
  completeWhatsAppSendAttempt,
  createWhatsAppSendAttempt,
  sha256Digest,
} from "./whatsappPhase1Store";

const WA_API_BASE = "https://graph.facebook.com/v25.0";

/** Normalize phone number to E.164-style presentation for Meta payloads. */
export function normalizePhone(phone: string): string {
  let normalized = phone.replace(/[\s\-\.()\/]/g, "");
  if (normalized.startsWith("00")) normalized = "+" + normalized.slice(2);
  if (!normalized.startsWith("+")) normalized = "+" + normalized;
  return normalized;
}

export type WASendResult = {
  success: boolean;
  wamid?: string;
  error?: string;
  outcome: "accepted" | "failed" | "ambiguous";
  sendAttemptId?: number;
};

type SendIntent = "text" | "template" | "document";

function stablePayloadDigest(payload: unknown): string {
  return sha256Digest(JSON.stringify(payload));
}

async function sendViaResolvedConnection(input: {
  connection: ResolvedOutboundWhatsAppConnection;
  actorUserId: number | null;
  to: string;
  intentType: SendIntent;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<WASendResult> {
  const recipientEndpoint = normalizePhone(input.to);
  const payload = { ...input.payload, to: recipientEndpoint };
  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  let attemptId: number | undefined;

  try {
    const attempt = await createWhatsAppSendAttempt({
      connection: input.connection,
      actorUserId: input.actorUserId,
      recipientEndpoint,
      intentType: input.intentType,
      payloadDigest: stablePayloadDigest(payload),
      idempotencyKey,
    });
    attemptId = attempt.id;
  } catch {
    // Do not send untracked messages. An audit-safe transport needs a durable
    // attempt record before contacting the provider.
    return {
      success: false,
      outcome: "failed",
      error: "WhatsApp send tracking is temporarily unavailable",
    };
  }

  const url = `${WA_API_BASE}/${input.connection.phoneNumberId}/messages`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.connection.accessToken}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });

    let data: any;
    try {
      data = await response.json();
    } catch {
      await completeWhatsAppSendAttempt({
        id: attemptId,
        attemptState: "ambiguous",
        failureCategory: "provider_response_unparseable",
      });
      return {
        success: false,
        outcome: "ambiguous",
        sendAttemptId: attemptId,
        error: "WhatsApp provider outcome needs confirmation",
      };
    }

    if (!response.ok) {
      await completeWhatsAppSendAttempt({
        id: attemptId,
        attemptState: "failed",
        failureCategory: "provider_rejected",
      });
      return {
        success: false,
        outcome: "failed",
        sendAttemptId: attemptId,
        error: data?.error?.message ?? "WhatsApp provider rejected the request",
      };
    }

    const wamid = data?.messages?.[0]?.id as string | undefined;
    await completeWhatsAppSendAttempt({
      id: attemptId,
      attemptState: "accepted",
      providerMessageId: wamid ?? null,
    });
    return { success: true, outcome: "accepted", wamid, sendAttemptId: attemptId };
  } catch {
    await completeWhatsAppSendAttempt({
      id: attemptId,
      attemptState: "ambiguous",
      failureCategory: "transport_exception",
    });
    // No automatic retry occurs after an ambiguous timeout/connection error.
    return {
      success: false,
      outcome: "ambiguous",
      sendAttemptId: attemptId,
      error: "WhatsApp provider outcome needs confirmation",
    };
  }
}

export async function sendWhatsAppText(
  connection: ResolvedOutboundWhatsAppConnection,
  actorUserId: number | null,
  to: string,
  body: string,
): Promise<WASendResult> {
  return sendViaResolvedConnection({
    connection,
    actorUserId,
    to,
    intentType: "text",
    payload: {
      messaging_product: "whatsapp",
      type: "text",
      text: { body },
    },
  });
}

export async function sendWhatsAppTemplate(
  connection: ResolvedOutboundWhatsAppConnection,
  actorUserId: number | null,
  to: string,
  templateName: string,
  languageCode: string = "en_US",
  components?: any[],
): Promise<WASendResult> {
  const template: any = { name: templateName, language: { code: languageCode } };
  if (components?.length) template.components = components;
  return sendViaResolvedConnection({
    connection,
    actorUserId,
    to,
    intentType: "template",
    payload: {
      messaging_product: "whatsapp",
      type: "template",
      template,
    },
  });
}

export async function sendWhatsAppDocument(
  connection: ResolvedOutboundWhatsAppConnection,
  actorUserId: number | null,
  to: string,
  documentUrl: string,
  filename: string,
  caption?: string,
): Promise<WASendResult> {
  return sendViaResolvedConnection({
    connection,
    actorUserId,
    to,
    intentType: "document",
    payload: {
      messaging_product: "whatsapp",
      type: "document",
      document: {
        link: documentUrl,
        filename,
        ...(caption ? { caption } : {}),
      },
    },
  });
}

/**
 * Preserve existing historical `whatsapp_messages` reads. Its `sent` state
 * means provider acceptance, never delivery/read confirmation.
 */
export async function saveOutboundMessage(data: {
  connection: ResolvedWhatsAppConnection;
  toPhone: string;
  body: string;
  templateName?: string;
  patientId?: number | null;
  leadId?: number | null;
  sentById?: number | null;
  wamid?: string;
  status: "sent" | "failed";
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(whatsappMessages).values({
    fromPhone: data.connection.phoneNumberId,
    toPhone: data.toPhone,
    direction: "outbound",
    body: data.body,
    status: data.status,
    patientId: data.patientId ?? null,
    leadId: data.leadId ?? null,
    externalMessageId: data.wamid ?? null,
    templateName: data.templateName ?? null,
    sentById: data.sentById ?? null,
  });
}

/** Get WhatsApp message history for a patient without changing legacy reads. */
export async function getWhatsAppHistory(patientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.patientId, patientId))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(100);
}
