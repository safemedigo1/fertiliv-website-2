/**
 * Fertiliv — Groq LLM Helper (AI Medical Scribe)
 * Replaces the Manus-only invokeLLM helper.
 * Works on any server — only requires GROQ_LLM_API_KEY.
 *
 * The default model is intentionally a currently supported Groq model. Callers may
 * specify a model to support explicit, validated fallback routing.
 */
import Groq from "groq-sdk";
import type { AiTelemetrySession } from "../ai/usageTelemetry";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LLMOptions = {
  messages: ChatMessage[];
  /** Optional Groq model override for an explicitly managed fallback route. */
  model?: string;
  /** Optional: request structured JSON output */
  responseFormat?: "json";
  /** Max tokens to generate (default: 2048) */
  maxTokens?: number;
  /** Internal Phase 1 metadata-only session; never forwarded to Groq. */
  aiTelemetry?: AiTelemetrySession;
};

export type LLMResult = {
  content: string;
};

export const DEFAULT_GROQ_LLM_MODEL = "qwen/qwen3.8-27b";

// ─── Client ──────────────────────────────────────────────────────────────────

function getClient(): Groq {
  const key = process.env.GROQ_LLM_API_KEY;
  if (!key) throw new Error("GROQ_LLM_API_KEY is not set");
  return new Groq({ apiKey: key });
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Call a selected Groq chat-completions model.
 */
export async function invokeGroqLLM(options: LLMOptions): Promise<LLMResult> {
  const groq = getClient();
  const model = options.model ?? DEFAULT_GROQ_LLM_MODEL;
  const telemetryAttempt = options.aiTelemetry?.beginAttempt({ provider: "groq", model });
  try {

  const completion = await groq.chat.completions.create({
    model,
    messages: options.messages,
    max_tokens: options.maxTokens ?? 2048,
    temperature: 0.2, // Low temperature for clinical precision
    ...(options.responseFormat === "json" && {
      response_format: { type: "json_object" },
    }),
  });

  const content = completion.choices[0]?.message?.content ?? "";
  const usage = completion.usage;
  telemetryAttempt?.succeed({
    inputTokens: usage?.prompt_tokens ?? null,
    outputTokens: usage?.completion_tokens ?? null,
    totalTokens: usage?.total_tokens ?? null,
    providerUsageAvailable: Boolean(usage),
  });
  return { content };
  } catch (error) {
    telemetryAttempt?.fail(error);
    throw error;
  }
}

/**
 * Lightweight key validation — lists available models.
 * Returns true if the key is valid.
 */
export async function validateGroqLLMKey(): Promise<boolean> {
  try {
    const groq = getClient();
    const models = await groq.models.list();
    return Array.isArray(models.data) && models.data.length > 0;
  } catch {
    return false;
  }
}
