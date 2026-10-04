import { invokeGroqLLM, type LLMOptions, type LLMResult } from "./_core/groqLLM";
import { invokeLLM, type InvokeParams, type InvokeResult } from "./_core/llm";
import { createAiTelemetrySession, type AiTelemetrySession } from "./ai/usageTelemetry";

const MEDICAL_SCRIBE_FIELDS = [
  "chiefComplaint",
  "historyOfPresentIllness",
  "physicalExamination",
  "assessment",
  "plan",
  "diagnosis",
  "medications",
  "additionalNotes",
] as const;

export type MedicalScribeField = (typeof MEDICAL_SCRIBE_FIELDS)[number];
export type MedicalScribeSummary = Record<MedicalScribeField, string>;
export type MedicalScribeProvider = "groq-qwen" | "groq-gpt-oss" | "builtin-gpt-5-mini";

export const MEDICAL_SCRIBE_PRIMARY_MODEL = "qwen/qwen3.8-27b";
export const MEDICAL_SCRIBE_FIRST_FALLBACK_MODEL = "openai/gpt-oss-120b";
export const MEDICAL_SCRIBE_SECOND_FALLBACK_MODEL = "openai/gpt-oss-20b";

export class MedicalScribeUnavailableError extends Error {
  constructor() {
    super("AI Medical Scribe is temporarily unavailable. Your raw text has not been changed. Please retry or complete the note manually.");
    this.name = "MedicalScribeUnavailableError";
  }
}

export type MedicalScribeInvokers = {
  invokeGroq: (options: LLMOptions) => Promise<LLMResult>;
  invokeBuiltIn: (options: InvokeParams) => Promise<InvokeResult>;
  onAttemptFailure?: (provider: MedicalScribeProvider) => void;
  createTelemetry?: () => AiTelemetrySession;
};

const MEDICAL_SCRIBE_SYSTEM_PROMPT = `You are a senior medical scribe assistant for a fertility and IVF clinic. Extract all clinical information from the provided text into the exact JSON fields requested. Do not discard clinically relevant details, do not add unsupported facts, and preserve exact numeric measurements. If a field is not applicable, use an empty string. The clinician must review the generated draft before saving it.`;

const MEDICAL_SCRIBE_JSON_SCHEMA = {
  type: "object",
  properties: Object.fromEntries(MEDICAL_SCRIBE_FIELDS.map((field) => [field, { type: "string" }])),
  required: [...MEDICAL_SCRIBE_FIELDS],
  additionalProperties: false,
};

function parseMedicalScribeSummary(content: string): MedicalScribeSummary {
  const parsed: unknown = JSON.parse(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Medical Scribe returned an invalid structured response");
  }

  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== MEDICAL_SCRIBE_FIELDS.length || keys.some((key) => !MEDICAL_SCRIBE_FIELDS.includes(key as MedicalScribeField))) {
    throw new Error("Medical Scribe returned an unexpected structured response");
  }

  const summary = {} as MedicalScribeSummary;
  for (const field of MEDICAL_SCRIBE_FIELDS) {
    if (typeof record[field] !== "string") {
      throw new Error("Medical Scribe returned an invalid field value");
    }
    summary[field] = record[field];
  }
  return summary;
}

function getBuiltInContent(response: InvokeResult): string {
  const content = response.choices[0]?.message.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Built-in Medical Scribe fallback returned no content");
  }
  return content;
}

export function createMedicalScribeGenerator(invokers: MedicalScribeInvokers) {
  return async (input: { rawText: string; noteType?: string }) => {
    const telemetry = invokers.createTelemetry?.();
    const messages = [
      { role: "system" as const, content: MEDICAL_SCRIBE_SYSTEM_PROMPT },
      { role: "user" as const, content: `Note type: ${input.noteType ?? "consultation"}\n\nRaw text:\n${input.rawText}` },
    ];

    const attempts: Array<{
      provider: MedicalScribeProvider;
      run: () => Promise<MedicalScribeSummary>;
    }> = [
      {
        provider: "groq-qwen",
        run: async () => parseMedicalScribeSummary((await invokers.invokeGroq({ model: MEDICAL_SCRIBE_PRIMARY_MODEL, messages, responseFormat: "json", aiTelemetry: telemetry })).content),
      },
      {
        provider: "groq-gpt-oss",
        run: async () => parseMedicalScribeSummary((await invokers.invokeGroq({ model: MEDICAL_SCRIBE_FIRST_FALLBACK_MODEL, messages, responseFormat: "json", aiTelemetry: telemetry })).content),
      },
      {
        provider: "builtin-gpt-5-mini",
        run: async () => parseMedicalScribeSummary(getBuiltInContent(await invokers.invokeBuiltIn({
          model: MEDICAL_SCRIBE_SECOND_FALLBACK_MODEL,
          messages,
          aiTelemetry: telemetry,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "medical_scribe_summary",
              strict: true,
              schema: MEDICAL_SCRIBE_JSON_SCHEMA,
            },
          },
        }))),
      },
    ];

    for (const attempt of attempts) {
      try {
        const result = { summary: await attempt.run(), provider: attempt.provider };
        telemetry?.succeed();
        return result;
      } catch {
        // Provider/model failures are intentionally logged only by route name, never with clinical input or raw provider errors.
        invokers.onAttemptFailure?.(attempt.provider);
      }
    }

    const unavailable = new MedicalScribeUnavailableError();
    telemetry?.fail(unavailable);
    throw unavailable;
  };
}

export const generateMedicalScribeSummary = createMedicalScribeGenerator({
  invokeGroq: invokeGroqLLM,
  invokeBuiltIn: invokeLLM,
  onAttemptFailure: (provider) => console.warn(`[MedicalScribe] Fallback attempt failed: ${provider}`),
  createTelemetry: () => createAiTelemetrySession("medical_scribe"),
});
