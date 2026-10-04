import { Request, Response } from "express";
import { retryPendingStorageDeletions } from "./db";

/**
 * POST /api/scheduled/retryStorageDeletions
 * Called periodically by the Manus Heartbeat cron (every 30 minutes).
 * Retries S3 deletion for documents that failed during a permanent Health Record reset.
 *
 * Authorization is the CRON_SECRET check applied by createApp before this handler runs.
 * Processes at most BATCH_LIMIT documents per invocation (idempotent, safe to repeat).
 */
const BATCH_LIMIT = 50;

export async function handleScheduledStorageRetry(req: Request, res: Response) {
  const startedAt = new Date().toISOString();

  try {
    const result = await retryPendingStorageDeletions(undefined, BATCH_LIMIT);
    console.log(`[scheduledStorageRetry] startedAt=${startedAt} processed=${result.processed} retried=${result.retried.length} stillPending=${result.stillPending.length} alerted=${result.alerted.length}`);
    return res.json({
      ok: true,
      startedAt,
      processed: result.processed,
      retried: result.retried,
      stillPending: result.stillPending,
      alerted: result.alerted,
    });
  } catch (err: unknown) {
    console.error("[scheduledStorageRetry] Error:", err instanceof Error ? err.name : "unknown");
    return res.status(500).json({
      ok: false,
      error: "Storage retry failed",
      startedAt,
      context: { url: req.url },
      timestamp: startedAt,
    });
  }
}
