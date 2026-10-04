import { Request, Response } from "express";
import { expireOldDraftSessionsAndDocs } from "./db";

/**
 * POST /api/scheduled/expirePendingDrafts
 * Called hourly by the Manus Heartbeat cron.
 * Uses the session-aware expiry function that:
 *   1. Identifies expired active draft sessions (pendingExpiresAt < now)
 *   2. Atomically sets draft-session status to 'expired'
 *   3. Sets expiredAt timestamp
 *   4. Revokes activeWriterToken (EXPIRED- prefix)
 *   5. Cancels active AI extraction attempts
 *   6. Marks pending documents as deletion-pending for storage cleanup
 *
 * Authorization is the CRON_SECRET check applied by createApp before this handler runs.
 * Processes at most BATCH_LIMIT sessions per invocation (idempotent, safe to repeat).
 */
const BATCH_LIMIT = 200;

export async function handleScheduledExpirePendingDrafts(req: Request, res: Response) {
  const startedAt = new Date().toISOString();

  try {
    // Phase 2 Final Acceptance: use the session-aware V2 expiry function.
    // This sets session status=expired, revokes tokens, cancels AI attempts,
    // and marks pending docs for deletion (session-aware, atomic token revocation)
    // which only marked docs without touching session state.
    const { expiredSessions, expiredDocs } = await expireOldDraftSessionsAndDocs();
    console.log(
      `[scheduledExpirePendingDrafts] startedAt=${startedAt} limit=${BATCH_LIMIT} expiredSessions=${expiredSessions} expiredDocs=${expiredDocs}`
    );
    return res.json({
      ok: true,
      startedAt,
      expiredSessions,
      expiredDocs,
    });
  } catch (err: unknown) {
    console.error("[scheduledExpirePendingDrafts] Error:", err instanceof Error ? err.name : "unknown");
    return res.status(500).json({
      ok: false,
      error: "Draft expiry failed",
      startedAt,
      context: { url: req.url },
      timestamp: startedAt,
    });
  }
}
