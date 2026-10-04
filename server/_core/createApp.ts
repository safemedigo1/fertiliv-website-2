import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { registerFileProxy } from "../fileProxy";
import { registerWhatsAppWebhook } from "../whatsappWebhook";
import { registerPdfRoutes } from "../pdfRoutes";
import { registerMonitoringSSE } from "../monitoringSSE";
import { registerGoogleCalendarRoutes } from "../googleCalendarRoutes";
import { registerCommunicationMediaRoutes } from "../communicationMediaRoutes";
import { registerWppConnectSandboxIngress } from "../wppConnectSandboxIngress";
import { registerWppConnectServerIngress } from "../wppConnectServerIngress";
import { registerWppConnectWebhook } from "../wppConnectWebhook";
import { registerGoldWhatsAppMediaRoutes } from "../goldWhatsAppMediaRoutes";
import { registerGoldWhatsAppEventsRoutes } from "../goldWhatsAppEventsRoutes";
import { registerZernioWebhook } from "../zernio/webhook";
import { registerZernioCallback } from "../zernio/connect";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { healIntakeJSON } from "../healIntakeJSON";
import { autoSeedLabDictionary } from "../autoSeedLabDictionary";
import { handleScheduledExchangeRates } from "../scheduledExchangeRates";
import { handleScheduledStorageRetry } from "../scheduledStorageRetry";
import { handleScheduledGoogleCalendarSyncRetry } from "../scheduledGoogleCalendarSyncRetry";
import { handleScheduledExpirePendingDrafts } from "../scheduledExpirePendingDrafts";
import { processDueAppointmentReminders } from "../appointmentReminderService";

let startupStarted = false;

function startBackgroundMaintenance() {
  if (startupStarted) return;
  startupStarted = true;
  healIntakeJSON().catch((err) => console.error("[startup] healIntakeJSON failed:", err));
  autoSeedLabDictionary().catch((err) => console.error("[startup] autoSeedLabDictionary failed:", err));
}

function requireCronSecret(req: express.Request, res: express.Response, next: express.NextFunction) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set");
    return res.status(503).json({ error: "cron_not_configured" });
  }
  const header = req.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : req.get("x-cron-secret") ?? "";
  if (provided.length !== secret.length || !timingSafeEqualString(provided, secret)) {
    return res.status(401).json({ error: "unauthorized" });
  }
  return next();
}

function timingSafeEqualString(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function createApp() {
  startBackgroundMaintenance();
  const app = express();
  registerWhatsAppWebhook(app);
  registerZernioWebhook(app);
  // 15 MB of video is about 20 MB once base64-encoded. The old 10 MB parser
  // rejected those sends before the handler ran. Direct uploads avoid this path.
  app.use(express.json({ limit: "32mb" }));
  app.use(express.urlencoded({ limit: "32mb", extended: true }));
  app.use(cookieParser());
  registerZernioCallback(app);
  registerStorageProxy(app);
  registerFileProxy(app);
  registerOAuthRoutes(app);
  registerPdfRoutes(app);
  registerMonitoringSSE(app);
  registerGoogleCalendarRoutes(app);
  registerCommunicationMediaRoutes(app);
  registerWppConnectSandboxIngress(app);
  registerWppConnectServerIngress(app);
  registerWppConnectWebhook(app);
  registerGoldWhatsAppMediaRoutes(app);
  registerGoldWhatsAppEventsRoutes(app);
  app.post("/api/scheduled/updateExchangeRates", requireCronSecret, handleScheduledExchangeRates);
  app.post("/api/scheduled/retryStorageDeletions", requireCronSecret, handleScheduledStorageRetry);
  app.post("/api/scheduled/retryGoogleCalendarAppointmentSyncs", requireCronSecret, handleScheduledGoogleCalendarSyncRetry);
  app.post("/api/scheduled/expirePendingDrafts", requireCronSecret, handleScheduledExpirePendingDrafts);
  app.post("/api/scheduled/appointmentReminders", requireCronSecret, async (_req, res) => {
    try {
      const result = await processDueAppointmentReminders();
      console.info("[cron] appointment reminders", { claimed: result.claimed, sent: result.sent, failed: result.failed });
      return res.json({ ok: true, result });
    } catch (error) {
      console.error("[cron] appointment reminders failed", error instanceof Error ? error.name : "error");
      return res.status(500).json({ error: "reminder_cycle_failed" });
    }
  });
  app.use((error: { type?: string }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) return next(error);
    if (error?.type === "entity.too.large") {
      console.warn("[http] request body exceeded the inbox limit");
      return res.status(413).json({ error: "This attachment is too large to send." });
    }
    if (error?.type === "entity.parse.failed") {
      console.warn("[http] request body could not be parsed");
      return res.status(400).json({ error: "The attachment could not be sent. Try again." });
    }
    return next(error);
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );
  return app;
}
