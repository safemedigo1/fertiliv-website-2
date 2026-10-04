import type { ExternalReportProcessingGoal, ExternalReportSourceLanguage } from "./externalReportProcessing";
import type { ExternalReportV2SafetyState } from "./externalReportV2Safety";
import type { ExternalReportV2SourceSafetySubreason } from "./externalReportV2Processing";

type V2ProcessingLog = { outcome: "success" | "failed"; goal: ExternalReportProcessingGoal; outputLanguage: ExternalReportSourceLanguage; providerCallCount: 1; category?: "response_envelope" | "output_language" | "source_safety" | "provider" | "unknown"; sourceSafetySubreason?: ExternalReportV2SourceSafetySubreason; safetyState?: ExternalReportV2SafetyState };
export function logExternalReportV2Processing(event: V2ProcessingLog) {
  try { console.info("[ExternalReportsV2] processing", { version: 2, outcome: event.outcome, goal: event.goal, outputLanguage: event.outputLanguage, providerCallCount: 1, ...(event.category ? { category: event.category } : {}), ...(event.sourceSafetySubreason ? { sourceSafetySubreason: event.sourceSafetySubreason } : {}), ...(event.safetyState ? { safetyState: event.safetyState } : {}) }); }
  catch { /* Non-blocking by design. */ }
}
export type ExternalReportV2FinalizeStage = "proof_validated" | "source_snapshot_validated" | "edited_output_revalidated" | "idempotency_checked" | "transaction_started" | "transaction_committed" | "readback_completed";
export function logExternalReportV2Finalize(stage: ExternalReportV2FinalizeStage, outcome: "stage" | "failed" | "success") {
  try { console.info("[ExternalReportsV2] finalize", { version: 2, stage, outcome }); }
  catch { /* Non-blocking by design. */ }
}
