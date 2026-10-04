import type { Express, Request, Response } from "express";
import { handleWppWebhook, verifyWppWebhookSecret } from "./wppConnectIntegration";

export function registerWppConnectWebhook(app: Express) {
  app.post("/api/webhooks/wppconnect", async (req: Request, res: Response) => {
    const received = req.query.secret ?? req.header("x-wppconnect-secret");
    if (!verifyWppWebhookSecret(received)) return res.status(401).json({ error: "Unauthorized" });
    try {
      const result = await handleWppWebhook(req.body);
      return res.status(200).json({ ok: true, ...result });
    } catch {
      console.error("[wppconnect-webhook] processing failed", { reason: "handler_error" });
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  });
}
