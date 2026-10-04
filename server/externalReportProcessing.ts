import { z } from "zod";

export const externalReportLanguageSchema = z.enum(["en", "ar", "tr"]);
export const externalReportSourceLanguageSchema = z.enum(["en", "ar", "tr", "und"]);
export const externalReportInputMethodSchema = z.enum(["text", "voice", "files"]);
export const externalReportProcessingRepresentationSchema = z.enum(["structured", "plain_text"]);
export const externalReportProcessingGoalSchema = z.enum([
  "translate",
  "simplify",
  "translate_simplify",
  "format_only",
  "summarize",
]);

export type ExternalReportProcessingGoal = z.infer<typeof externalReportProcessingGoalSchema>;
export type ExternalReportLanguage = z.infer<typeof externalReportLanguageSchema>;
export type ExternalReportSourceLanguage = z.infer<typeof externalReportSourceLanguageSchema>;
export type ExternalReportProcessingRepresentation = z.infer<typeof externalReportProcessingRepresentationSchema>;

export type ResolvedExternalReportProcessing = {
  processingGoal: ExternalReportProcessingGoal;
  requestedTargetLanguage: ExternalReportLanguage | "source" | null;
  resolvedOutputLanguage: ExternalReportSourceLanguage;
  instruction: string;
};

/**
 * The only canonical mapping from UI selection to the actual AI instruction. The server derives
 * it, so no persisted label can contradict the AI transformation request.
 */
export function resolveExternalReportProcessing(input: {
  processingGoal: ExternalReportProcessingGoal;
  requestedTargetLanguage?: ExternalReportLanguage | "source" | null;
  sourceLanguage?: ExternalReportSourceLanguage | null;
}): ResolvedExternalReportProcessing {
  const sourceLanguage = input.sourceLanguage ?? "und";
  const target = input.requestedTargetLanguage ?? null;
  const languageName: Record<ExternalReportLanguage, string> = { en: "English", ar: "Arabic", tr: "Turkish" };

  if (input.processingGoal === "translate" || input.processingGoal === "translate_simplify") {
    if (!target || target === "source") {
      throw new Error("A target language is required for this processing goal.");
    }
    return {
      processingGoal: input.processingGoal,
      requestedTargetLanguage: target,
      resolvedOutputLanguage: target,
      instruction: input.processingGoal === "translate"
        ? `Translate the report into ${languageName[target]}.`
        : `Translate the report into ${languageName[target]} and simplify terminology for patient understanding.`,
    };
  }

  if (input.processingGoal === "simplify") {
    return {
      processingGoal: input.processingGoal,
      requestedTargetLanguage: null,
      resolvedOutputLanguage: sourceLanguage,
      instruction: "Simplify the report for patient understanding while keeping the source language.",
    };
  }

  if (input.processingGoal === "format_only") {
    return {
      processingGoal: input.processingGoal,
      requestedTargetLanguage: null,
      resolvedOutputLanguage: sourceLanguage,
      instruction: "Format the report for clarity while preserving the source language and meaning. Do not translate, summarize, or infer clinical information.",
    };
  }

  const summaryTarget = target === "source" || !target ? sourceLanguage : target;
  return {
    processingGoal: "summarize",
    requestedTargetLanguage: target === "source" || !target ? "source" : target,
    resolvedOutputLanguage: summaryTarget,
    instruction: summaryTarget === "und"
      ? "Summarize the report in the source language."
      : `Summarize the report in ${languageName[summaryTarget as ExternalReportLanguage]}.`,
  };
}

/**
 * New-report plain-text contract. The server retains ownership of goal and language resolution,
 * but generation has no model-produced JSON, blocks, table, or source-verification requirement.
 */
export function plainTextMedicalReportInstruction(
  resolvedInstruction: string,
  processingGoal: ExternalReportProcessingGoal,
): string {
  const translateCompletenessRule = processingGoal === "translate"
    ? " This is a complete translation, not a summary or selective extraction. Translate every meaningful source section into the requested language and preserve the report order where practical. Do not omit headers, report or patient metadata, laboratory comments, explanatory notes and legends, procedural notes, administrative report information, addresses, contact details, or closing/footer text merely because they seem repetitive or non-clinical. Preserve all numbers, percentages, units, reference ranges, dates, flags, and qualitative results faithfully while translating surrounding labels and prose."
    : "";
  const summaryRule = processingGoal === "summarize"
    ? " Keep the summary selective and do not infer any clinical conclusion."
    : " Retain the report findings, measurements, dates, units, reference ranges, and qualitative results as provided.";
  return `${resolvedInstruction}

Return only clear patient-ready plain text. Do not return JSON, document blocks, source-verification metadata, Markdown tables, HTML, or code fences. Do not invent or change medical facts, diagnoses, measurements, dates, units, reference ranges, flags, or qualitative results.${translateCompletenessRule}${summaryRule}`;
}

/** Handles a provider error envelope without depending on a processing representation. */
export function getExternalReportProviderError(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("error" in value) || !(value as { error?: unknown }).error) return null;
  const error = (value as { error: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message?: unknown }).message === "string") return (error as { message: string }).message;
  return "Provider returned an invalid error envelope.";
}

export class ExternalReportPlainTextEmptyResultError extends Error {
  constructor() {
    super("External Reports provider returned an empty processed result.");
    this.name = "ExternalReportPlainTextEmptyResultError";
  }
}

/** Executes exactly one transformation callback and accepts only a non-empty text result. */
export async function executeExternalReportPlainTextOneCall(
  generate: () => Promise<unknown>,
): Promise<string> {
  const response = await generate();
  const providerError = getExternalReportProviderError(response);
  if (providerError) throw new Error(providerError);
  const processedContent = typeof (response as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content === "string"
    ? ((response as { choices: Array<{ message: { content: string } }> }).choices[0].message.content.trim())
    : "";
  if (!processedContent) throw new ExternalReportPlainTextEmptyResultError();
  return processedContent;
}

/** Legacy display values remain available for history, but new canonical writes use processingGoal. */
export function legacyProcessingNoteForGoal(goal: ExternalReportProcessingGoal): string {
  if (goal === "translate") return "translated";
  if (goal === "simplify") return "simplified";
  if (goal === "translate_simplify") return "translated_simplified";
  if (goal === "format_only") return "formatted";
  return "summarized";
}
