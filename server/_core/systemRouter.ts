import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { retryPendingStorageDeletions } from "../db";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().trim().min(1, "title is required").max(1200),
        content: z.string().trim().min(1, "content is required").max(20000),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),

  /**
   * Admin-only: manually trigger a retry of pending storage deletions.
   * Processes at most `batchLimit` documents per call (default 50).
   * Authorization: admin role required.
   * Idempotent: safe to call multiple times.
   * Can be scoped to a specific lead (leadId) or run globally (omit leadId).
   */
  retryStorageDeletions: adminProcedure
    .input(
      z.object({
        leadId: z.number().optional(),
        batchLimit: z.number().min(1).max(200).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const result = await retryPendingStorageDeletions(input.leadId, input.batchLimit ?? 50);
      return {
        success: true,
        processed: result.processed,
        retried: result.retried,
        stillPending: result.stillPending,
      };
    }),
});
