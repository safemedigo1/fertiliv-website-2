import express, { Express, Request, Response } from "express";
import { resolveInboundWhatsAppConnection } from "./whatsappConnection";
import { buildWU05NormalizationPlan } from "./whatsappNormalization";
import { retainWhatsAppProviderEvents, type RetainedProviderEvent } from "./whatsappPhase1Store";
import {
  extractMetaWebhookChanges,
  parseMetaWebhookPayload,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "./whatsappWebhookSecurity";

/**
 * Register the stable Meta callback URL.
 *
 * Phase 1 accepts only authenticated events and retains them durably before
 * acknowledging Meta. It intentionally does not normalize messages, download
 * media, resolve people, create Patients/MRNs, or create Conversations.
 */
export function registerWhatsAppWebhook(app: Express) {
  app.get("/api/whatsapp/webhook", (req: Request, res: Response) => {
    const configuredToken = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!configuredToken) {
      return res.sendStatus(503);
    }

    const verified = verifyMetaWebhookChallenge({
      mode: req.query["hub.mode"],
      token: req.query["hub.verify_token"],
      configuredToken,
    });
    if (!verified) return res.sendStatus(403);
    return res.status(200).send(req.query["hub.challenge"] as string);
  });

  // This route must be registered before express.json() so validation is over
  // the exact provider bytes, not a re-serialized JavaScript object.
  app.post(
    "/api/whatsapp/webhook",
    express.raw({ type: "application/json", limit: "3mb" }),
    async (req: Request, res: Response) => {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : null;
      if (!rawBody || rawBody.length === 0) return res.sendStatus(400);

      if (!verifyMetaWebhookSignature(
        rawBody,
        req.header("x-hub-signature-256"),
        process.env.WHATSAPP_APP_SECRET,
      )) {
        // Unauthenticated events are never persisted or processed.
        return res.sendStatus(401);
      }

      const payload = parseMetaWebhookPayload(rawBody);
      if (!payload || (payload as any).object !== "whatsapp_business_account") {
        return res.sendStatus(404);
      }

      const changes = extractMetaWebhookChanges(payload);
      if (changes.length === 0) return res.sendStatus(400);

      try {
        const retained: RetainedProviderEvent[] = [];
        for (const change of changes) {
          const resolution = await resolveInboundWhatsAppConnection({
            wabaId: change.wabaId,
            phoneNumberId: change.phoneNumberId,
          });
          const isResolved = Boolean(resolution.connection);
          const isSupportedPhase1Field = change.providerField === "messages";
          const routingState: "legacy_env" | "resolved" | "unmapped" | "mismatched" | "unsupported" =
            !isSupportedPhase1Field && isResolved ? "unsupported" : resolution.routingState;
          const normalizationPlan = buildWU05NormalizationPlan({
            providerField: change.providerField,
            value: change.value,
            connection: resolution.connection,
            routingState,
            existingFailureCategory: resolution.failureCategory,
          });
          retained.push({
            provider: "meta",
            providerField: change.providerField,
            providerEventKey: change.providerEventKey,
            wabaId: change.wabaId,
            phoneNumberId: change.phoneNumberId,
            value: change.value,
            connection: resolution.connection,
            routingState,
            processingState: normalizationPlan.processingState,
            failureCategory: normalizationPlan.normalizationFailureCategory,
            normalizationPlan,
          });
        }

        await retainWhatsAppProviderEvents({
          rawPayload: rawBody.toString("utf8"),
          events: retained,
        });

        // Meta retries are safely acknowledged from the durable dedupe boundary.
        return res.sendStatus(200);
      } catch {
        // Do not include provider payloads, phone endpoints, or clinical content
        // in server logs. Returning non-2xx asks Meta to retry only if capture
        // did not complete.
        console.error("[WhatsApp] authenticated webhook capture failed");
        return res.sendStatus(500);
      }
    },
  );
}
