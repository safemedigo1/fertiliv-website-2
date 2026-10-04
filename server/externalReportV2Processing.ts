import { z } from "zod";
import { externalReportLanguageSchema, externalReportProcessingGoalSchema, externalReportSourceLanguageSchema, resolveExternalReportProcessing, type ExternalReportSourceLanguage } from "./externalReportProcessing";
import { assessExternalReportV2Safety, ExternalReportV2UnsupportedFactError, type ExternalReportV2UnsupportedFactType } from "./externalReportV2Safety";
import { createExternalReportV2Document } from "./externalReportV2Document";

export const externalReportV2ProcessInputSchema = z.object({
  patientId: z.number().int().positive(), sourceText: z.string().min(1).max(200_000),
  sourceLanguage: externalReportSourceLanguageSchema.default("und"), processingGoal: externalReportProcessingGoalSchema,
  requestedTargetLanguage: z.union([externalReportLanguageSchema, z.literal("source")]).nullable().optional(),
});
export const externalReportV2ProviderEnvelopeSchema = z.object({
  language: externalReportSourceLanguageSchema, title: z.string().trim().min(1).max(500).optional(), text: z.string().trim().min(1).max(200_000),
}).strict();
export type ExternalReportV2ProcessInput = z.infer<typeof externalReportV2ProcessInputSchema>;

export function buildExternalReportV2Prompt(input: ExternalReportV2ProcessInput) {
  const resolved = resolveExternalReportProcessing(input);
  return [
    "You prepare external medical reports for mandatory Admin review.",
    "Return one JSON object only with exactly: language, optional title, and text.",
    `Set language to ${resolved.resolvedOutputLanguage}.`, resolved.instruction,
    "Translate all ordinary prose when translation is requested. Keep every numeric value, percentage, date, unit, reference range, result flag, and qualitative finding clinically faithful to the source.",
    "Do not invent diagnoses, recommendations, interpretations, measurements, tables, columns, source-verification claims, or Markdown tables.",
    "Use patient-ready paragraphs and simple bullet lines. No HTML and no code fences.", "The immutable captured source follows:", input.sourceText,
  ].join("\n\n");
}

function extractJsonObject(value: string) {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = trimmed.indexOf("{"); const end = trimmed.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("V2_ENVELOPE_INVALID");
  return trimmed.slice(start, end + 1);
}
export function parseExternalReportV2ProviderEnvelope(value: unknown) {
  if (typeof value !== "string") throw new Error("V2_ENVELOPE_INVALID");
  try { return externalReportV2ProviderEnvelopeSchema.parse(JSON.parse(extractJsonObject(value))); }
  catch (error) { if (error instanceof Error && error.message === "V2_ENVELOPE_INVALID") throw error; throw new Error("V2_ENVELOPE_INVALID"); }
}

const ARABIC_LETTERS = /[\u0600-\u06FF]/g;
const LATIN_LETTERS = /[A-Za-zÇĞİÖŞÜçğıöşü]/g;
const TURKISH_HINTS = /\b(?:ve|ile|için|sonuç|değer|rapor|normal|yüksek|düşük|pozitif|negatif|örnek|hasta)\b/gi;
const ENGLISH_HINTS = /\b(?:and|with|for|result|value|report|normal|high|low|positive|negative|sample|patient)\b/gi;
export function hasSubstantialExternalReportV2Language(text: string, expected: ExternalReportSourceLanguage) {
  if (expected === "und") return true;
  const arabicCount = (text.match(ARABIC_LETTERS) ?? []).length; const latinCount = (text.match(LATIN_LETTERS) ?? []).length; const total = arabicCount + latinCount;
  if (expected === "ar") return arabicCount >= 12 && (total === 0 || arabicCount / total >= 0.55);
  const turkishHints = (text.match(TURKISH_HINTS) ?? []).length; const englishHints = (text.match(ENGLISH_HINTS) ?? []).length;
  if (expected === "en") return latinCount >= 20 && !(turkishHints >= 4 && englishHints < 2);
  return latinCount >= 20 && !(englishHints >= 4 && turkishHints < 2);
}

export function acceptExternalReportV2Response(input: ExternalReportV2ProcessInput, providerContent: unknown) {
  const resolved = resolveExternalReportProcessing(input); const envelope = parseExternalReportV2ProviderEnvelope(providerContent);
  if (envelope.language !== resolved.resolvedOutputLanguage) throw new Error("V2_LANGUAGE_MISMATCH");
  if (!hasSubstantialExternalReportV2Language(envelope.text, resolved.resolvedOutputLanguage)) throw new Error("V2_LANGUAGE_INCOMPLETE");
  const safety = assessExternalReportV2Safety({ sourceText: input.sourceText, outputText: envelope.text, processingGoal: resolved.processingGoal, outputLanguage: resolved.resolvedOutputLanguage });
  return { resolved, envelope, safety, document: createExternalReportV2Document({ language: envelope.language, title: envelope.title, text: envelope.text }) };
}

export function getExternalReportV2ProviderError(response: unknown) {
  if (!response || typeof response !== "object") return null;
  const record = response as Record<string, unknown>;
  return record.error && typeof record.error === "object" ? new Error("V2_PROVIDER_FAILURE") : null;
}

export async function executeExternalReportV2OneCall(
  input: ExternalReportV2ProcessInput,
  invoke: (messages: Array<{ role: "system" | "user"; content: string }>) => Promise<any>,
) {
  const response = await invoke([
    {
      role: "system",
      content: "You are a medical report specialist at Fertiliv IVF Center. Follow the user's single processing goal. Return only the requested minimal JSON envelope for mandatory Admin review.",
    },
    { role: "user", content: buildExternalReportV2Prompt(input) },
  ]);
  const providerError = getExternalReportV2ProviderError(response);
  if (providerError) throw providerError;
  return acceptExternalReportV2Response(input, response?.choices?.[0]?.message?.content ?? "");
}

export function classifyExternalReportV2Failure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "V2_ENVELOPE_INVALID") return "response_envelope" as const;
  if (message === "V2_LANGUAGE_MISMATCH" || message === "V2_LANGUAGE_INCOMPLETE") return "output_language" as const;
  if (message === "V2_UNSUPPORTED_DETERMINISTIC_FACT") return "source_safety" as const;
  if (message === "V2_PROVIDER_FAILURE") return "provider" as const;
  return "unknown" as const;
}

export type ExternalReportV2SourceSafetySubreason = ExternalReportV2UnsupportedFactType;

/**
 * This maps only existing fail-closed safety errors to content-free labels.
 * It intentionally does not inspect or expose the unsupported token.
 */
export function getExternalReportV2SourceSafetySubreason(error: unknown): ExternalReportV2SourceSafetySubreason | undefined {
  const message = error instanceof Error ? error.message : "";
  if (error instanceof ExternalReportV2UnsupportedFactError) return error.subreason;
  return message === "V2_UNSUPPORTED_DETERMINISTIC_FACT" ? "unsupported_other_deterministic_token" : undefined;
}
