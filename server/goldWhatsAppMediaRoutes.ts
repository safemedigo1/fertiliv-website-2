import type { Express } from "express";
import { resolveClinicUserFromRequest } from "./_core/clinicSession";
import { getAuthorizedWppMediaBytes } from "./wppConnectIntegration";

function safeContentDispositionFilename(value: string) {
  return value.replace(/[\r\n"\\]/g, "_").slice(0, 255) || "whatsapp-media";
}

/**
 * Gold WhatsApp attachment proxy. The storage key never leaves the server;
 * access is authorized through the same Gold line owner/staff predicate used
 * by the standalone selected-chat product.
 */
export function registerGoldWhatsAppMediaRoutes(app: Express) {
  app.get("/api/gold-whatsapp/media/:messageId", async (req, res) => {
    const messageId = Number(req.params.messageId);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      res.status(400).send("Invalid media request");
      return;
    }
    try {
      const user = await resolveClinicUserFromRequest(req, res);
      if (!user) {
        res.status(401).send("Authentication required");
        return;
      }
      const action = req.query.action === "download" ? "download" : "open";
      const media = await getAuthorizedWppMediaBytes(messageId, action, { id: user.id, role: user.role, name: user.name ?? null });
      res.set("Content-Type", media.contentType);
      res.set("Cache-Control", "private, no-store");
      res.set("X-Content-Type-Options", "nosniff");
      res.set("Content-Disposition", `${action === "download" ? "attachment" : "inline"}; filename="${safeContentDispositionFilename(media.filename)}"`);
      res.end(media.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Media access failed";
      const denied = /access|available|found|authentication/i.test(message);
      res.status(denied ? 403 : 502).send(denied ? "Media access denied" : "Media temporarily unavailable");
    }
  });
}
