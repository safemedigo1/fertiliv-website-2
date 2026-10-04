import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  WhatsAppEmbeddedSignupError,
  getWhatsAppEmbeddedSignupAuthorizationCodeDigest,
  selectStandardEmbeddedSignupPhone,
} from "./whatsappEmbeddedSignup";
import { WHATSAPP_PHASE1_CUTOVER_POLICY, isConnectionLifecycleActiveForIngress } from "../shared/whatsappPhase1Contracts";
import { buildLegacyEnvConnection } from "./whatsappConnection";

const settingsSource = readFileSync(new URL("../client/src/pages/SettingsPage.tsx", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../client/src/lib/whatsappEmbeddedSignup.ts", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("./whatsappEmbeddedSignup.ts", import.meta.url), "utf8");
const routerSource = readFileSync(new URL("./routers.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../drizzle/schema.ts", import.meta.url), "utf8");

describe("WhatsApp WU-09 Meta Embedded Signup", () => {
  it("uses standard Meta SDK launch configuration without Coexistence extras", () => {
    expect(clientSource).toContain('response_type: "code"');
    expect(clientSource).toContain("override_default_response_type: true");
    expect(clientSource).toContain("extras: { setup: {} }");
    expect(clientSource).not.toContain("whatsapp_business_app_onboarding");
    expect(clientSource).not.toContain("sessionInfoVersion");
  });

  it("accepts exactly the selected server-validated standard WABA and number", () => {
    const selection = selectStandardEmbeddedSignupPhone({
      wabaId: "waba-1",
      selectedPhoneNumberId: "phone-1",
      phoneNumbers: [
        { id: "phone-1", display_phone_number: "+90 555 111 11 11", verified_name: "Fertiliv" },
        { id: "phone-2", display_phone_number: "+90 555 222 22 22", verified_name: "Other" },
      ],
    });
    expect(selection).toEqual({
      wabaId: "waba-1",
      phone: { id: "phone-1", display_phone_number: "+90 555 111 11 11", verified_name: "Fertiliv" },
    });
    expect(serviceSource).toContain("phone_numbers?fields=id,display_phone_number,verified_name");
    expect(serviceSource).toContain("/subscribed_apps");
  });

  it.each([
    ["missing WABA", { wabaId: null, selectedPhoneNumberId: "phone-1", phoneNumbers: [{ id: "phone-1", display_phone_number: "+90 555 111 11 11", verified_name: "Fertiliv" }] }, "missing_waba"],
    ["missing selected number", { wabaId: "waba-1", selectedPhoneNumberId: null, phoneNumbers: [{ id: "phone-1", display_phone_number: "+90 555 111 11 11", verified_name: "Fertiliv" }] }, "missing_phone_number"],
    ["multiple number ambiguity", { wabaId: "waba-1", selectedPhoneNumberId: null, phoneNumbers: [{ id: "phone-1", display_phone_number: "+90 555 111 11 11", verified_name: "Fertiliv" }, { id: "phone-2", display_phone_number: "+90 555 222 22 22", verified_name: "Other" }] }, "multiple_number_ambiguity"],
    ["unverified selected number", { wabaId: "waba-1", selectedPhoneNumberId: "other", phoneNumbers: [{ id: "phone-1", display_phone_number: "+90 555 111 11 11", verified_name: "Fertiliv" }] }, "provider_validation_failed"],
  ])("fails safely for %s", (_label, input, category) => {
    try {
      selectStandardEmbeddedSignupPhone(input as never);
      throw new Error("expected selection to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(WhatsAppEmbeddedSignupError);
      expect((error as WhatsAppEmbeddedSignupError).category).toBe(category);
    }
  });

  it("uses a non-reversible digest to establish the authorization replay boundary", () => {
    const first = getWhatsAppEmbeddedSignupAuthorizationCodeDigest("synthetic-one-time-code");
    const repeated = getWhatsAppEmbeddedSignupAuthorizationCodeDigest("synthetic-one-time-code");
    const different = getWhatsAppEmbeddedSignupAuthorizationCodeDigest("different-synthetic-code");
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).toBe(repeated);
    expect(first).not.toBe(different);
    expect(schemaSource).toContain('authorizationCodeDigest: varchar("authorizationCodeDigest", { length: 64 }).unique()');
    expect(serviceSource).toContain("authorization_replayed");
  });

  it("records cancellation, denial, expiry, invalid completion, and Coexistence as safe non-production outcomes", () => {
    expect(settingsSource).toContain('cancel("authorization_denied")');
    expect(settingsSource).toContain('parsed.event === "CANCEL" || parsed.event === "ERROR"');
    expect(serviceSource).toContain("expired_authorization");
    expect(serviceSource).toContain("coexistence_not_available");
    expect(serviceSource).toContain('input.completionEvent !== STANDARD_CLOUD_API_COMPLETION_EVENT');
  });

  it("keeps existing connection and legacy manual-number conflicts non-destructive", () => {
    expect(serviceSource).toContain("existing_persisted_connection");
    expect(serviceSource).toContain("legacy_manual_configuration_conflict");
    expect(serviceSource).toContain("No migration or credential replacement was performed.");
    expect(serviceSource).toContain("providerPhoneNumberId, input.phoneNumberId");
    expect(schemaSource).toContain("whatsapp_connections_provider_phone_uq");
  });

  it("keeps a newly authorized connection onboarding-only with no production cutover", () => {
    expect(serviceSource).toContain('lifecycleStatus: "onboarding"');
    expect(serviceSource).toContain('state: "authorized_pending_activation"');
    expect(WHATSAPP_PHASE1_CUTOVER_POLICY.persistedConnectionMayReplaceLegacyAutomatically).toBe(false);
    expect(WHATSAPP_PHASE1_CUTOVER_POLICY.legacyEnvironmentFallbackAllowed).toBe(true);
    expect(isConnectionLifecycleActiveForIngress("onboarding")).toBe(false);
    expect(buildLegacyEnvConnection({ phoneNumberId: "legacy-phone", wabaId: "legacy-waba" })).toMatchObject({
      route: "legacy_env",
      onboardingMethod: "manual_cloud_api",
    });
  });

  it("keeps all sensitive secrets and business tokens outside browser payloads and storage", () => {
    expect(clientSource).not.toContain("WHATSAPP_APP_SECRET");
    expect(clientSource).not.toContain("WHATSAPP_VERIFY_TOKEN");
    expect(clientSource).not.toContain("localStorage");
    expect(clientSource).not.toContain("sessionStorage");
    expect(clientSource).not.toContain("console.");
    expect(routerSource).toContain("embeddedSignupStatus: adminProcedure");
    expect(routerSource).toContain("startEmbeddedSignup: adminProcedure");
    expect(routerSource).toContain("completeEmbeddedSignup: adminProcedure");
    expect(schemaSource).toContain('encryptedCredential: text("encryptedCredential").notNull()');
    expect(schemaSource).not.toContain('accessToken: text("accessToken")');
  });

  it("preserves manual Cloud API UX and excludes Patient, Lead, Conversation, clinical, and Treatment Case side effects", () => {
    expect(settingsSource).toContain("Manual Cloud API");
    expect(settingsSource).toContain("Connect with Meta");
    expect(serviceSource).not.toContain("patients");
    expect(serviceSource).not.toContain("leads");
    expect(serviceSource).not.toContain("Conversation");
    expect(serviceSource).not.toContain("Treatment Case");
  });
});
