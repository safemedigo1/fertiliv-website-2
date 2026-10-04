import { invokeLLM, type InvokeParams, type InvokeResult } from "../_core/llm";
import { transcribeAudioGroq, type TranscriptionError, type TranscriptionResult } from "../_core/groqTranscription";
import { createAiTelemetrySession } from "./usageTelemetry";
import { getAiWorkload, type AiWorkloadId } from "./workloadRegistry";

/**
 * Fixed Phase 1 routing seam. The registry resolves the same provider/model that
 * current production code uses today; it intentionally has no editable policy.
 */
export async function invokeAiWorkload(workloadId: AiWorkloadId, params: Omit<InvokeParams, "aiTelemetry" | "workloadId">): Promise<InvokeResult> {
  const workload = getAiWorkload(workloadId);
  if (workload.currentPrimary.provider !== "manus_forge") {
    throw new Error(`Workload ${workloadId} is not configured for the built-in text adapter`);
  }
  const telemetry = createAiTelemetrySession(workloadId);
  try {
    const result = await invokeLLM({ ...params, model: params.model ?? workload.currentPrimary.model, workloadId, aiTelemetry: telemetry });
    telemetry.succeed({
      inputTokens: result.usage?.prompt_tokens ?? null,
      outputTokens: result.usage?.completion_tokens ?? null,
      totalTokens: result.usage?.total_tokens ?? null,
      providerUsageAvailable: Boolean(result.usage),
    });
    return result;
  } catch (error) {
    telemetry.fail(error);
    throw error;
  }
}

export async function transcribeAiWorkload(
  workloadId: "speech_to_text",
  input: Parameters<typeof transcribeAudioGroq>[0],
): Promise<TranscriptionResult | TranscriptionError> {
  const telemetry = createAiTelemetrySession(workloadId);
  try {
    const result = await transcribeAudioGroq({ ...input, aiTelemetry: telemetry });
    if ("error" in result) {
      const error = new Error(result.error);
      telemetry.fail(error);
      return result;
    }
    const numbers = {
      nonTokenUnit: result.duration == null ? null : "audio_seconds",
      nonTokenQuantity: result.duration ?? null,
      providerUsageAvailable: result.duration != null,
    };
    telemetry.succeed(numbers);
    return result;
  } catch (error) {
    telemetry.fail(error);
    throw error;
  }
}
