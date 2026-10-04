import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { whatsappLinkedDeviceLines, whatsappLinkedDeviceSessions } from "../drizzle/schema";
import { getDb } from "./db";
import { ingestWppConnectServerEvent } from "./whatsappLinkedDevice";
import {
  isWppConnectServerIngressEnabled,
  normalizeWppConnectServerWebhook,
  verifyWppConnectServerWebhookBinding,
  WPPCONNECT_SERVER_INGRESS_PATH,
} from "./wppConnectServerAdapter";

/**
 * Disabled-by-default callback for a separately managed WPPConnect Server.
 * Its signed binding carries opaque line/session/generation ownership and is
 * checked again against durable state by canonical ingestion. It never accepts
 * a provider event into a parallel persistence or chat model.
 */
export function registerWppConnectServerIngress(app: Express) {
  app.post(WPPCONNECT_SERVER_INGRESS_PATH, async (req: Request, res: Response) => {
    if (!isWppConnectServerIngressEnabled()) return res.sendStatus(404);
    const secret = process.env.WPPCONNECT_WEBHOOK_SECRET ?? "";
    const ownership = verifyWppConnectServerWebhookBinding(req.query.binding, secret);
    if (!ownership) return res.status(401).json({ ok: false, error: "invalid_wppconnect_server_binding" });
    const payload = req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : null;
    if (!payload) return res.status(400).json({ ok: false, error: "invalid_wppconnect_server_event" });

    const normalized = normalizeWppConnectServerWebhook({ payload, ownership });
    if (normalized.kind === "ignored") {
      // Status, broadcast, group, channel, system, and unknown events are
      // deliberately isolated before any evidence, media, or Inbox write.
      return res.status(202).json({ ok: true, accepted: false, reason: "non_private_source" });
    }
    if (normalized.kind === "rejected") {
      return res.status(normalized.reason === "session_mismatch" ? 403 : 400)
        .json({ ok: false, error: normalized.reason });
    }

    const db = await getDb();
    if (!db) return res.status(503).json({ ok: false, error: "storage_unavailable" });
    const [line] = await db.select({
      id: whatsappLinkedDeviceLines.id,
      createdById: whatsappLinkedDeviceLines.createdById,
      adapterKind: whatsappLinkedDeviceLines.adapterKind,
      lifecycleState: whatsappLinkedDeviceLines.lifecycleState,
      sessionId: whatsappLinkedDeviceSessions.id,
      sessionName: whatsappLinkedDeviceSessions.sessionName,
      runtimeGeneration: whatsappLinkedDeviceSessions.runtimeGeneration,
    }).from(whatsappLinkedDeviceLines)
      .leftJoin(whatsappLinkedDeviceSessions, eq(whatsappLinkedDeviceSessions.lineId, whatsappLinkedDeviceLines.id))
      .where(and(
        eq(whatsappLinkedDeviceLines.id, ownership.lineId),
        eq(whatsappLinkedDeviceLines.clinicScope, "fertiliv"),
      ))
      .limit(1);
    if (!line || line.adapterKind !== "wppconnect_server" || line.lifecycleState === "disabled"
      || String(line.sessionId ?? "") !== ownership.sessionId
      || line.sessionName !== ownership.sessionName
      || line.runtimeGeneration !== ownership.runtimeGeneration) {
      return res.status(403).json({ ok: false, error: "wppconnect_server_line_not_allowed" });
    }

    try {
      const retained = await ingestWppConnectServerEvent({
        lineId: line.id,
        actor: { id: line.createdById, name: "WPPConnect Server bridge", role: "admin" },
        ownership,
        event: normalized.event,
      });
      return res.status(200).json({
        ok: true,
        insertedEvents: retained.insertedEvents,
        duplicateEvents: retained.duplicateEvents,
      });
    } catch {
      // No payload, endpoint, media, credentials, or provider error is logged.
      console.error("[wppconnect-server-ingress] canonical capture failed");
      return res.status(503).json({ ok: false, error: "wppconnect_server_capture_failed" });
    }
  });
}
