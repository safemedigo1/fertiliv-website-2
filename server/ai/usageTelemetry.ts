import { randomUUID } from "crypto";
import { completeAiUsageRequest, recordAiUsageAttempt, recordAiUsageRequest, updateAiUsageAttempt } from "../db";
import type { AiProviderId, AiWorkloadId } from "./workloadRegistry";

export type AiUsageNumbers = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  totalTokens?: number | null;
  nonTokenUnit?: string | null;
  nonTokenQuantity?: number | null;
  providerUsageAvailable?: boolean;
};

export type AiTelemetrySession = {
  readonly logicalRequestId: string;
  readonly workloadId: AiWorkloadId;
  beginAttempt: (route: { provider: AiProviderId; model: string }) => AiTelemetryAttempt;
  succeed: (numbers?: AiUsageNumbers) => void;
  fail: (error: unknown, options?: { failureCategory?: string }) => void;
};

export type AiTelemetryAttempt = {
  readonly attemptId: string;
  succeed: (numbers?: AiUsageNumbers) => void;
  fail: (error: unknown) => void;
};

export function categorizeAiError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "unknown");
  const lowered = message.toLowerCase();
  if (lowered.includes("response_schema") || lowered.includes("generation_config") || lowered.includes("invalid_argument")) return "provider_schema";
  if (lowered.includes("timeout") || lowered.includes("timed out")) return "timeout";
  if (lowered.includes("rate limit") || lowered.includes("429")) return "rate_limit";
  if (lowered.includes("401") || lowered.includes("403") || lowered.includes("auth")) return "authentication";
  if (lowered.includes("model") && (lowered.includes("not found") || lowered.includes("unavailable") || lowered.includes("deprecat"))) return "model_unavailable";
  if (lowered.includes("network") || lowered.includes("fetch") || lowered.includes("econn") || lowered.includes("socket")) return "network_error";
  if (lowered.includes("json") || lowered.includes("schema") || lowered.includes("parse")) return "malformed_structured_output";
  if (lowered.includes("5") || lowered.includes("unavailable") || lowered.includes("service")) return "provider_unavailable";
  return "unknown";
}

export function createAiTelemetrySession(
  workloadId: AiWorkloadId,
  options: { logicalRequestId?: string } = {},
): AiTelemetrySession {
  const logicalRequestId = options.logicalRequestId ?? randomUUID();
  const startedAt = Date.now();
  let attemptCount = 0;
  let fallbackUsed = false;
  let finalised = false;
  // Preserve start → attempt → terminal ordering without awaiting any telemetry
  // write in the clinical/operational request path.
  let writeQueue: Promise<void> = Promise.resolve();
  const enqueue = (operation: () => Promise<unknown>) => {
    writeQueue = writeQueue.then(async () => {
      try {
        await operation();
      } catch {
        // Telemetry must never affect a workflow result, retry path, or fallback.
      }
    });
  };

  enqueue(() => recordAiUsageRequest({ logicalRequestId, workloadId }));

  return {
    logicalRequestId,
    workloadId,
    beginAttempt(route) {
      attemptCount += 1;
      const attemptNumber = attemptCount;
      fallbackUsed ||= attemptCount > 1;
      const attemptId = randomUUID();
      const attemptStartedAt = Date.now();
      enqueue(() => recordAiUsageAttempt({ attemptId, logicalRequestId, workloadId, provider: route.provider, model: route.model, attemptNumber }));
      return {
        attemptId,
        succeed(numbers) {
          enqueue(() => updateAiUsageAttempt({ attemptId, status: "succeeded", latencyMs: Date.now() - attemptStartedAt, numbers }));
        },
        fail(error) {
          enqueue(() => updateAiUsageAttempt({ attemptId, status: "failed", latencyMs: Date.now() - attemptStartedAt, failureCategory: categorizeAiError(error) }));
        },
      };
    },
    succeed(numbers) {
      if (finalised) return;
      finalised = true;
      enqueue(() => completeAiUsageRequest({ logicalRequestId, status: "succeeded", attemptCount, fallbackUsed, totalLatencyMs: Date.now() - startedAt, numbers }));
    },
    fail(error, options) {
      if (finalised) return;
      finalised = true;
      enqueue(() => completeAiUsageRequest({ logicalRequestId, status: "failed", attemptCount, fallbackUsed, totalLatencyMs: Date.now() - startedAt, failureCategory: options?.failureCategory ?? categorizeAiError(error) }));
    },
  };
}
