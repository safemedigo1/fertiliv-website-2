import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  WHATSAPP_PRODUCTION_WEBHOOK_URL,
  buildWhatsAppManualSettingsStatus,
} from "../shared/whatsappManualSettings";

const settingsPageSource = readFileSync(new URL("../client/src/pages/SettingsPage.tsx", import.meta.url), "utf8");
const whatsappSettingsSource = settingsPageSource.slice(
  settingsPageSource.indexOf("// ─── WhatsApp Settings Tab"),
  settingsPageSource.indexOf("// ─── Clinic Info Tab"),
);

function configuredStatus(overrides: Partial<Parameters<typeof buildWhatsAppManualSettingsStatus>[0]> = {}) {
  return buildWhatsAppManualSettingsStatus({
    phoneNumberId: "123456789012345",
    wabaId: "987654321098765",
    accessToken: "server-only-token",
    appSecret: "server-only-app-secret",
    verifyToken: "server-only-verify-token",
    persistedConnectionCutoverEnabled: false,
    ...overrides,
  });
}

describe("WhatsApp WU-08 manual settings status", () => {
  it("reports the legacy environment route and ready state without returning credentials", () => {
    const status = configuredStatus();
    expect(status).toMatchObject({
      manualPath: "manual_cloud_api_advanced",
      productionRoute: "legacy_environment",
      manualConfigurationState: "ready",
      connectionRouteState: "ready",
      webhookRouteState: "available",
      webhookConfigurationState: "ready",
      webhookUrl: WHATSAPP_PRODUCTION_WEBHOOK_URL,
    });
    expect(status.phoneNumberId).toEqual({ state: "configured", suffix: "2345" });
    expect(status.wabaId).toEqual({ state: "configured", suffix: "8765" });
    expect(status.accessTokenConfigured).toBe(true);
    expect(status.appSecretConfigured).toBe(true);
    expect(status.verifyTokenConfigured).toBe(true);
    expect(JSON.stringify(status)).not.toContain("server-only-token");
    expect(JSON.stringify(status)).not.toContain("server-only-app-secret");
    expect(JSON.stringify(status)).not.toContain("server-only-verify-token");
  });

  it("reports an incomplete fresh environment without inventing readiness", () => {
    const status = configuredStatus({
      phoneNumberId: undefined,
      wabaId: undefined,
      accessToken: undefined,
      appSecret: undefined,
      verifyToken: undefined,
    });
    expect(status.manualConfigurationState).toBe("incomplete");
    expect(status.connectionRouteState).toBe("incomplete");
    expect(status.webhookConfigurationState).toBe("incomplete");
    expect(status.phoneNumberId.state).toBe("not_configured");
    expect(status.wabaId.state).toBe("not_configured");
    expect(status.accessTokenConfigured).toBe(false);
    expect(status.appSecretConfigured).toBe(false);
    expect(status.verifyTokenConfigured).toBe(false);
  });

  it("rejects non-numeric or too-short Meta IDs without exposing them", () => {
    const status = configuredStatus({
      phoneNumberId: "phone-id-value",
      wabaId: "12345",
    });
    expect(status.manualConfigurationState).toBe("invalid");
    expect(status.phoneNumberId.state).toBe("invalid");
    expect(status.wabaId.state).toBe("invalid");
    expect(status.phoneNumberId.suffix).toBe("alue");
    expect(status.wabaId.suffix).toBe("2345");
  });

  it("distinguishes an explicitly enabled persisted cutover from the legacy route", () => {
    const status = configuredStatus({ persistedConnectionCutoverEnabled: true });
    expect(status.productionRoute).toBe("persisted_connection_cutover_enabled");
    expect(status.persistedConnectionCutoverEnabled).toBe(true);
  });

  it("contains no platform-secret fields, stale auto-lead wording, or fake save action in the Settings UI", () => {
    expect(whatsappSettingsSource).toContain("manualSettingsStatus.useQuery");
    expect(whatsappSettingsSource).toContain("Manual Cloud API");
    expect(whatsappSettingsSource).toContain("Advanced setup");
    expect(whatsappSettingsSource).toContain("Unknown WhatsApp contacts are captured safely");
    expect(whatsappSettingsSource).toContain("WHATSAPP_APP_SECRET");
    expect(whatsappSettingsSource).toContain("WHATSAPP_VERIFY_TOKEN");
    expect(whatsappSettingsSource).not.toContain("Auto-Lead from Incoming Messages");
    expect(whatsappSettingsSource).not.toContain("automatically create a new Lead");
    expect(whatsappSettingsSource).not.toContain("Save Configuration");
    expect(whatsappSettingsSource).not.toContain("value={form.accessToken}");
    expect(whatsappSettingsSource).not.toContain("value={form.verifyToken}");
    expect(whatsappSettingsSource).not.toContain("setForm(f => ({ ...f, accessToken");
    expect(whatsappSettingsSource).not.toContain("setForm(f => ({ ...f, verifyToken");
  });

  it("keeps the production webhook URL fixed and read-only in the Settings UI", () => {
    expect(whatsappSettingsSource).toContain("WHATSAPP_PRODUCTION_WEBHOOK_URL");
    expect(whatsappSettingsSource).toContain("readOnly");
    expect(WHATSAPP_PRODUCTION_WEBHOOK_URL).toBe("https://pro.fertiliv.com/api/whatsapp/webhook");
    expect(whatsappSettingsSource).not.toContain("setWebhookUrl");
  });

  it("permits the approved WU-09 Embedded Signup entry while excluding Coexistence and later workspace UI", () => {
    expect(whatsappSettingsSource).toContain("Connect with Meta");
    expect(whatsappSettingsSource).toContain("startEmbeddedSignup");
    expect(whatsappSettingsSource).not.toContain("startCoexistence");
    expect(whatsappSettingsSource).not.toContain("Conversation list");
    expect(whatsappSettingsSource).not.toContain("treatmentCaseId");
    expect(whatsappSettingsSource).not.toContain("<TreatmentCase");
    expect(whatsappSettingsSource).not.toContain("whatsapp_business_app_onboarding");
  });

  it("keeps linked-device cards readable on desktop, tablet, and mobile", () => {
    expect(whatsappSettingsSource).toContain("w-full max-w-5xl space-y-5");
    expect(whatsappSettingsSource).toContain("grid min-w-0 gap-4 rounded-lg border bg-white p-4 text-sm lg:grid-cols-[minmax(240px,1fr)_auto] lg:items-start");
    expect(whatsappSettingsSource).toContain("flex min-w-0 max-w-[460px] flex-col items-stretch gap-2 text-xs lg:items-end");
    expect(whatsappSettingsSource).toContain("flex flex-wrap items-center justify-start gap-2 lg:justify-end");
    expect(whatsappSettingsSource).toContain("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground");
    expect(whatsappSettingsSource).not.toContain("sm:grid-cols-[1fr_auto] sm:items-center");
  });

  it("keeps the line card and QR reconnect action while hiding stale identity", () => {
    expect(whatsappSettingsSource).toContain("No WhatsApp account currently connected.");
    expect(whatsappSettingsSource).toContain('line.sessionState === "connected"');
    expect(whatsappSettingsSource).toContain('line.lifecycleState === "logged_out" || line.sessionState === "not_started"');
    expect(whatsappSettingsSource).toContain('sandboxStatus?.status === "CONNECTED" && sandboxStatus.outboundReady ? "Connected"');
    expect(whatsappSettingsSource).toContain("The provider did not return a display hint.");
  });

  it("labels a reachable QR-ready sandbox as ready rather than unavailable or unknown", () => {
    expect(whatsappSettingsSource).toContain('line.sessionState === "qr_ready" || line.sessionState === "waiting_for_qr" ? "Waiting for QR scan"');
    expect(whatsappSettingsSource).toContain('sandboxStatus?.status === "QR_READY" && sandboxStatus.available ? "Ready to scan"');
    expect(whatsappSettingsSource).toContain('sandboxStatus?.status === "QR_READY" ? "Waiting for QR scan"');
    expect(whatsappSettingsSource).toContain("could not be started");
  });

  it("shows Delete line only for non-active sessions and requires explicit confirmation", () => {
    expect(whatsappSettingsSource).toContain("deleteUnusedLinkedDeviceLine.useMutation");
    expect(whatsappSettingsSource).toContain("isLinkedDeviceLineDeletable(line.lifecycleState, line.sessionState)");
    expect(whatsappSettingsSource).toContain("Delete line");
    expect(whatsappSettingsSource).toContain("window.confirm(`Delete the unused WhatsApp line");
    expect(whatsappSettingsSource).toContain("Historical conversations, messages, media, audit history, send attempts, and clinical records will remain.");
    expect(whatsappSettingsSource).toContain('line.sessionState === "connected"');
    expect(whatsappSettingsSource).toContain("Disconnect");
  });

  it("exposes an admin-only Manage staff editor for every line and keeps the onboarding path editable", () => {
    expect(whatsappSettingsSource).toContain("Manage staff");
    expect(whatsappSettingsSource).toContain("Edit authorized staff");
    expect(whatsappSettingsSource).toContain("updateLinkedDeviceLineStaff.useMutation");
    expect(whatsappSettingsSource).toContain("authorizedStaffIds: number[]");
    expect(whatsappSettingsSource).toContain("At least one authorized staff member is required");
    expect(whatsappSettingsSource).toContain("disabled={createdLineId !== null}");
    expect(whatsappSettingsSource).toContain("utils.whatsapp.linkedDeviceStatus.invalidate()");
    expect(whatsappSettingsSource).toContain("useDraftForm");
    expect(whatsappSettingsSource).toContain("useBeforeUnload(isEditing || staffEditorDirty)");
  });

  it("keeps staff permission changes separate from QR, session, identity, and message state", () => {
    expect(whatsappSettingsSource).toContain("persistent Fertiliv line");
    expect(whatsappSettingsSource).toContain("does not disconnect WhatsApp");
    expect(whatsappSettingsSource).toContain("or modify conversations and messages");
    expect(whatsappSettingsSource).toContain("lineId: staffEditorLine.id");
    expect(whatsappSettingsSource).toContain("Save changes");
  });
});
