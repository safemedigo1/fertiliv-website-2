/**
 * WhatsApp Phase 1 contract.
 *
 * This file freezes connection, transport, provider-event, WU-05 normalized
 * evidence, and WU-07 transport-Conversation vocabulary. It contains no
 * patient, clinical, or credential values.
 */

// `wppconnect` is reserved for the feature-flagged, sandbox-proven Linked
// Device adapter. It is not an approval of production routing or a Meta API
// replacement; Meta remains the default and recommended production provider.
export const whatsappProviderValues = ["meta", "wppconnect", "zernio"] as const;
export type WhatsAppProvider = (typeof whatsappProviderValues)[number];

export const whatsappOnboardingMethodValues = [
  "manual_cloud_api",
  "meta_embedded_signup",
  "meta_coexistence",
  "linked_device_wppconnect_sandbox",
  "linked_device_wppconnect_server",
  "zernio",
] as const;
export type WhatsAppOnboardingMethod = (typeof whatsappOnboardingMethodValues)[number];

export const whatsappConnectionLifecycleValues = [
  "onboarding",
  "connected",
  "needs_attention",
  "paused",
  "disconnected",
  "error",
] as const;
export type WhatsAppConnectionLifecycle = (typeof whatsappConnectionLifecycleValues)[number];

export const whatsappHealthStateValues = [
  "unknown",
  "healthy",
  "degraded",
  "unavailable",
] as const;
export type WhatsAppHealthState = (typeof whatsappHealthStateValues)[number];

export const whatsappCredentialSourceValues = [
  "legacy_env",
  "secret_reference",
] as const;
export type WhatsAppCredentialSource = (typeof whatsappCredentialSourceValues)[number];

export const whatsappConnectionRouteValues = ["legacy_env", "persisted"] as const;
export type WhatsAppConnectionRoute = (typeof whatsappConnectionRouteValues)[number];

export const whatsappSendAttemptStateValues = [
  "pending",
  "submitting",
  "accepted",
  "delivered",
  "read",
  "failed",
  "ambiguous",
  "requires_retry",
] as const;
export type WhatsAppSendAttemptState = (typeof whatsappSendAttemptStateValues)[number];

export const whatsappProviderEventProcessingStateValues = [
  "received",
  "processing",
  "applied",
  "quarantined",
  "failed",
  "dead_letter",
] as const;
export type WhatsAppProviderEventProcessingState =
  (typeof whatsappProviderEventProcessingStateValues)[number];

export const whatsappProviderEventRoutingStateValues = [
  "legacy_env",
  "resolved",
  "unmapped",
  "mismatched",
  "unsupported",
] as const;
export type WhatsAppProviderEventRoutingState =
  (typeof whatsappProviderEventRoutingStateValues)[number];

export const FERTILIV_CLINIC_SCOPE = "fertiliv";

/**
 * Phase 1/WU-05 keeps the existing environment-backed route active. Persisted
 * connections are retained for inbound validation only until a later,
 * explicitly approved cutover work unit adds an admin selection workflow.
 */
export const WHATSAPP_PHASE1_CUTOVER_POLICY = {
  persistedConnectionMayReplaceLegacyAutomatically: false,
  legacyEnvironmentFallbackAllowed: true,
  automaticPatientOrMrnCreationAllowed: false,
  messageNormalizationEnabled: true,
  conversationCreationEnabled: true,
} as const;

export type ResolvedWhatsAppConnection = {
  id: number | null;
  clinicScope: string;
  provider: WhatsAppProvider;
  onboardingMethod: WhatsAppOnboardingMethod;
  phoneNumberId: string;
  wabaId: string | null;
  businessPortfolioId: string | null;
  displayPhone: string | null;
  normalizedDisplayPhone: string | null;
  displayName: string | null;
  credentialSource: WhatsAppCredentialSource;
  credentialRef: string;
  lifecycleStatus: WhatsAppConnectionLifecycle;
  route: WhatsAppConnectionRoute;
};

export function isWritableWhatsAppLifecycle(
  lifecycleStatus: WhatsAppConnectionLifecycle,
): boolean {
  return lifecycleStatus === "connected";
}

export function isConnectionLifecycleActiveForIngress(
  lifecycleStatus: WhatsAppConnectionLifecycle,
): boolean {
  // A connection created by WU-09 remains onboarding-only. It must not receive
  // production webhook routing until a later approved activation/cutover marks
  // it connected. `needs_attention` and `paused` likewise remain fail-closed.
  return lifecycleStatus === "connected";
}

export function classifyTransportFailure(error: unknown): "failed" | "ambiguous" {
  // A transport exception can occur after Meta accepted the request, so it is
  // intentionally kept distinct from a provider-declared failure.
  return error instanceof Error ? "ambiguous" : "failed";
}

export function isWhatsAppPhase1PersistedConnectionCutoverEnabled(): boolean {
  return process.env.WHATSAPP_PHASE1_ENABLE_PERSISTED_CONNECTIONS === "true";
}

export function isSafeStoredCredentialReference(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.startsWith("env://") || value.startsWith("secret://");
}

export const WHATSAPP_PHASE1_INVARIANTS = [
  "A WhatsApp phone endpoint is not a Patient identity.",
  "A WhatsApp business number is not a human staff actor.",
  "A Conversation is not a Patient identity.",
  "A Conversation participant is not a medical subject or authorized recipient.",
  "An unresolved endpoint may have a transport Conversation without creating a business record.",
  "Provider acceptance is not delivery.",
  "Phone normalization is not identity proof.",
  "Phase 1 must not create a Patient or MRN from an inbound event.",
  "Phase 1 must not activate Treatment Case or AI Operational Context.",
] as const;
