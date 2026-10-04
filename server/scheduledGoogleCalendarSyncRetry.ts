import type { Request, Response } from "express";
import { retryPendingGoogleCalendarAppointmentSyncs } from "./googleCalendarService";

const BATCH_LIMIT = 20;

/**
 * POST /api/scheduled/retryGoogleCalendarAppointmentSyncs
 * Heartbeat-only bounded retry for durable, outbound G2 mapping rows.
 */
export async function handleScheduledGoogleCalendarSyncRetry(req: Request, res: Response) {
  const startedAt = new Date().toISOString();

  try {
    const result = await retryPendingGoogleCalendarAppointmentSyncs(BATCH_LIMIT);
    const counts = result.results.reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.status] = (accumulator[item.status] ?? 0) + 1;
      return accumulator;
    }, {});
    return res.json({ ok: true, startedAt, processed: result.processed, counts });
  } catch {
    return res.status(500).json({
      ok: false,
      error: "Google Calendar retry processing failed.",
      startedAt,
      context: { url: req.url },
      timestamp: startedAt,
    });
  }
}
