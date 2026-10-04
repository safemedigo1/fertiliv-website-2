export const WHATSAPP_PRODUCTION_WEBHOOK_URL = "https://pro.fertiliv.com/api/whatsapp/webhook";

export type WhatsAppManualIdState = "configured" | "not_configured" | "invalid";
export type WhatsAppManualConfigurationState = "ready" | "incomplete" | "invalid";

export type WhatsAppManualSettingsStatus = {
  manualPath: "manual_cloud_api_advanced";
  productionRoute: "legacy_environment" | "persisted_connection_cutover_enabled";
  persistedConnectionCutoverEnabled: boolean;
  phoneNumberId: {
    state: WhatsAppManualIdState;
    suffix: string | null;
  };
  wabaId: {
    state: WhatsAppManualIdState;
    suffix: string | null;
  };
  accessTokenConfigured: boolean;
  appSecretConfigured: boolean;
  verifyTokenConfigured: boolean;
  manualConfigurationState: WhatsAppManualConfigurationState;
  connectionRouteState: "ready" | "incomplete";
  webhookRouteState: "available";
  webhookConfigurationState: "ready" | "incomplete";
  webhookUrl: typeof WHATSAPP_PRODUCTION_WEBHOOK_URL;
};

type BuildInput = {
  phoneNumberId?: string | null;
  wabaId?: string | null;
  accessToken?: string | null;
  appSecret?: string | null;
  verifyToken?: string | null;
  persistedConnectionCutoverEnabled: boolean;
};

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function classifyMetaId(value: string | null | undefined): WhatsAppManualIdState {
  const normalized = nonEmpty(value);
  if (!normalized) return "not_configured";
  return /^\d{6,}$/.test(normalized) ? "configured" : "invalid";
}

function suffix(value: string | null | undefined): string | null {
  const normalized = nonEmpty(value);
  return normalized ? normalized.slice(-4) : null;
}

function configured(value: string | null | undefined): boolean {
  return Boolean(nonEmpty(value));
}

export function buildWhatsAppManualSettingsStatus(input: BuildInput): WhatsAppManualSettingsStatus {
  const phoneNumberIdState = classifyMetaId(input.phoneNumberId);
  const wabaIdState = classifyMetaId(input.wabaId);
  const accessTokenConfigured = configured(input.accessToken);
  const appSecretConfigured = configured(input.appSecret);
  const verifyTokenConfigured = configured(input.verifyToken);
  const connectionRouteState = phoneNumberIdState === "configured" && wabaIdState === "configured" && accessTokenConfigured
    ? "ready"
    : "incomplete";
  const webhookConfigurationState = appSecretConfigured && verifyTokenConfigured ? "ready" : "incomplete";
  const manualConfigurationState = phoneNumberIdState === "invalid" || wabaIdState === "invalid"
    ? "invalid"
    : connectionRouteState === "ready" && webhookConfigurationState === "ready"
      ? "ready"
      : "incomplete";

  return {
    manualPath: "manual_cloud_api_advanced",
    productionRoute: input.persistedConnectionCutoverEnabled
      ? "persisted_connection_cutover_enabled"
      : "legacy_environment",
    persistedConnectionCutoverEnabled: input.persistedConnectionCutoverEnabled,
    phoneNumberId: { state: phoneNumberIdState, suffix: suffix(input.phoneNumberId) },
    wabaId: { state: wabaIdState, suffix: suffix(input.wabaId) },
    accessTokenConfigured,
    appSecretConfigured,
    verifyTokenConfigured,
    manualConfigurationState,
    connectionRouteState,
    webhookRouteState: "available",
    webhookConfigurationState,
    webhookUrl: WHATSAPP_PRODUCTION_WEBHOOK_URL,
  };
}
