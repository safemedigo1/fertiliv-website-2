import type { Express, Request, Response } from "express";
import express from "express";
import { handleZernioWebhook } from "./ingest";

/**
 * Zernio signs the raw body. This route is registered before express.json().
 */
export function registerZernioWebhook(app: Express) {
  app.post(
    "/api/webhooks/zernio",
    express.raw({ type: "application/json", limit: "8mb" }),
    async (req: Request, res: Response) => {
      try {
        const outcome = await handleZernioWebhook({
          rawBody: Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body ?? "")),
          signature: req.get("x-zernio-signature") ?? req.get("x-late-signature") ?? "",
        });
        return res.status(outcome.status).json(outcome.body);
      } catch (error) {
        console.error("[zernio] webhook failed", error instanceof Error ? error.name : "error");
        return res.status(500).json({ error: "webhook_failed" });
      }
    },
  );
}
