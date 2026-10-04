/**
 * Application-owned workload registry. This is intentionally fixed in Phase 1:
 * it records today’s approved behavior but does not expose editable routing.
 */
export type AiCapability = "text" | "structured_json" | "vision_document" | "audio_transcription";
export type AiProviderId = "manus_forge" | "groq";
export type AiWorkloadId =
  | "medical_scribe"
  | "speech_to_text"
  | "medical_document_translation"
  | "medical_document_extraction"
  | "laboratory_extraction"
  | "laboratory_dictionary_enrichment"
  | "radiology_extraction"
  | "ivf_extraction"
  | "fet_extraction"
  | "vision_document_analysis"
  | "intake_form_translation"
  | "clinical_case_summary"
  | "sales_note_generation"
  | "email_translation"
  | "treatment_plan_translation"
  | "structured_json_generation";

export type AiWorkloadDefinition = {
  id: AiWorkloadId;
  capability: AiCapability;
  structuredOutputRequired: boolean;
  phiSensitivity: "high" | "medium" | "low";
  currentPrimary: { provider: AiProviderId; model: string };
  requiresFallback: boolean;
  latencyClass: "interactive" | "background";
};

const FORGE_DEFAULT_MODEL = "gemini-2.5-flash";

const forge = (id: AiWorkloadId, capability: AiCapability, structuredOutputRequired: boolean, phiSensitivity: AiWorkloadDefinition["phiSensitivity"], latencyClass: AiWorkloadDefinition["latencyClass"]): AiWorkloadDefinition => ({
  id,
  capability,
  structuredOutputRequired,
  phiSensitivity,
  currentPrimary: { provider: "manus_forge", model: FORGE_DEFAULT_MODEL },
  requiresFallback: false,
  latencyClass,
});

export const AI_WORKLOAD_REGISTRY: Record<AiWorkloadId, AiWorkloadDefinition> = {
  medical_scribe: {
    id: "medical_scribe", capability: "structured_json", structuredOutputRequired: true, phiSensitivity: "high",
    currentPrimary: { provider: "groq", model: "qwen/qwen3.8-27b" }, requiresFallback: true, latencyClass: "interactive",
  },
  speech_to_text: {
    id: "speech_to_text", capability: "audio_transcription", structuredOutputRequired: false, phiSensitivity: "high",
    currentPrimary: { provider: "groq", model: "whisper-large-v3-turbo" }, requiresFallback: false, latencyClass: "interactive",
  },
  medical_document_translation: forge("medical_document_translation", "text", false, "high", "background"),
  medical_document_extraction: forge("medical_document_extraction", "structured_json", true, "high", "background"),
  laboratory_extraction: forge("laboratory_extraction", "vision_document", true, "high", "background"),
  laboratory_dictionary_enrichment: forge("laboratory_dictionary_enrichment", "structured_json", true, "medium", "background"),
  radiology_extraction: forge("radiology_extraction", "vision_document", true, "high", "background"),
  ivf_extraction: forge("ivf_extraction", "structured_json", true, "high", "background"),
  fet_extraction: forge("fet_extraction", "structured_json", true, "high", "background"),
  vision_document_analysis: forge("vision_document_analysis", "vision_document", false, "high", "background"),
  intake_form_translation: forge("intake_form_translation", "structured_json", true, "medium", "background"),
  clinical_case_summary: forge("clinical_case_summary", "text", false, "high", "interactive"),
  sales_note_generation: forge("sales_note_generation", "text", false, "medium", "interactive"),
  email_translation: forge("email_translation", "structured_json", true, "medium", "background"),
  treatment_plan_translation: forge("treatment_plan_translation", "text", false, "high", "background"),
  structured_json_generation: forge("structured_json_generation", "structured_json", true, "high", "background"),
};

export function getAiWorkload(workloadId: AiWorkloadId): AiWorkloadDefinition {
  return AI_WORKLOAD_REGISTRY[workloadId];
}

export const AI_CONFIGURATION_SCOPE = "platform_default" as const;
