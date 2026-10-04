import type { Express, Request, Response } from "express";
import { resolveClinicUserFromRequest } from "./_core/clinicSession";
import { subscribeGoldConversation } from "./wppConnectIntegration";

async function getUserFromRequest(req: Request, res: Response) {
  const user = await resolveClinicUserFromRequest(req, res);
  return user ? { id: user.id, role: user.role, name: user.name ?? null } : null;
}

export function registerGoldWhatsAppEventsRoutes(app: Express) {
  app.get("/api/gold-whatsapp/events", async (req: Request, res: Response) => {
    const user = await getUserFromRequest(req, res);
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const lineId = Number(req.query.lineId);
    const allowedChatId = Number(req.query.allowedChatId);
    if (!Number.isInteger(lineId) || lineId <= 0 || !Number.isInteger(allowedChatId) || allowedChatId <= 0) {
      res.status(400).json({ error: "Invalid Gold conversation" });
      return;
    }
    try {
      const unsubscribe = await subscribeGoldConversation(lineId, allowedChatId, user, (event) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify({ kind: event.kind, externalMessageId: event.externalMessageId })}\n\n`);
      });
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ kind: "ready" })}\n\n`);
      const heartbeat = setInterval(() => {
        if (res.writableEnded) return;
        res.write(": heartbeat\n\n");
      }, 25_000);
      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gold conversation is unavailable.";
      const denied = /not found|not enabled|available|database/i.test(message);
      res.status(denied ? 403 : 502).json({ error: denied ? "Gold conversation is unavailable" : "Gold events are temporarily unavailable" });
    }
  });
}
