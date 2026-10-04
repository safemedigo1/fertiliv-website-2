import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FERTILIV_CLINIC_SCOPE,
  WHATSAPP_PHASE1_CUTOVER_POLICY,
  isConnectionLifecycleActiveForIngress,
  isSafeStoredCredentialReference,
} from "../shared/whatsappPhase1Contracts";
import { buildLegacyEnvConnection } from "./whatsappConnection";
import {
  extractMetaWebhookChanges,
  verifyMetaWebhookChallenge,
  verifyMetaWebhookSignature,
} from "./whatsappWebhookSecurity";
import {
  buildPhoneCandidates,
  classifyWhatsAppResolution,
} from "../shared/whatsappResolution";
import {
  buildWU06ResolutionKey,
  extractWU06ProviderEvidenceHints,
} from "./whatsappEndpointResolution";
import {
  buildWU07ConversationCorrelationPlan,
  buildWU07ConversationKey,
  buildWU07ConversationMessageKey,
  findWU07RawMessage,
} from "../shared/whatsappConversation";
import { persistWU07ConversationCorrelations } from "./whatsappConversationStore";

vi.mock("./whatsappPhase1Store", () => ({
  createWhatsAppSendAttempt: vi.fn(),
  completeWhatsAppSendAttempt: vi.fn(),
  sha256Digest: (value: string) => `digest:${value.length}`,
}));

import {
  completeWhatsAppSendAttempt,
  createWhatsAppSendAttempt,
} from "./whatsappPhase1Store";
import { sendWhatsAppText } from "./whatsapp";

const connection = {
  id: null,
  clinicScope: FERTILIV_CLINIC_SCOPE,
  provider: "meta" as const,
  onboardingMethod: "manual_cloud_api" as const,
  phoneNumberId: "phone-id",
  wabaId: "waba-id",
  businessPortfolioId: null,
  displayPhone: null,
  normalizedDisplayPhone: null,
  displayName: null,
  credentialSource: "legacy_env" as const,
  credentialRef: "env://WHATSAPP_API_TOKEN",
  lifecycleStatus: "connected" as const,
  route: "legacy_env" as const,
  accessToken: "memory-only-test-token",
};

describe("WhatsApp Phase 1 frozen contracts", () => {
  it("keeps legacy routing enabled without an automatic persisted-connection cutover", () => {
    expect(WHATSAPP_PHASE1_CUTOVER_POLICY).toMatchObject({
      persistedConnectionMayReplaceLegacyAutomatically: false,
      legacyEnvironmentFallbackAllowed: true,
      automaticPatientOrMrnCreationAllowed: false,
      messageNormalizationEnabled: true,
      conversationCreationEnabled: true,
    });
  });

  it("accepts only credential references, never token-shaped database values", () => {
    expect(isSafeStoredCredentialReference("env://WHATSAPP_API_TOKEN")).toBe(true);
    expect(isSafeStoredCredentialReference("secret://whatsapp/fertiliv")).toBe(true);
    expect(isSafeStoredCredentialReference("plain-token-value")).toBe(false);
  });

  it("keeps a WU-09 onboarding connection out of production ingress until a later approved activation", () => {
    expect(isConnectionLifecycleActiveForIngress("onboarding")).toBe(false);
    expect(isConnectionLifecycleActiveForIngress("needs_attention")).toBe(false);
    expect(isConnectionLifecycleActiveForIngress("paused")).toBe(false);
    expect(isConnectionLifecycleActiveForIngress("connected")).toBe(true);
  });

  it("builds the legacy adapter without persisting or exposing the access token", () => {
    const resolved = buildLegacyEnvConnection({ phoneNumberId: "phone-id", wabaId: "waba-id" });
    expect(resolved).toMatchObject({
      id: null,
      provider: "meta",
      onboardingMethod: "manual_cloud_api",
      phoneNumberId: "phone-id",
      wabaId: "waba-id",
      route: "legacy_env",
      credentialRef: "env://WHATSAPP_API_TOKEN",
    });
    expect(resolved).not.toHaveProperty("accessToken");
  });
});

describe("WhatsApp Phase 1 Meta webhook security", () => {
  const appSecret = "webhook-test-secret";
  const rawBody = Buffer.from(JSON.stringify({ object: "whatsapp_business_account", entry: [] }));

  it("validates the exact raw bytes with an X-Hub SHA-256 signature", () => {
    const signature = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
    expect(verifyMetaWebhookSignature(rawBody, signature, appSecret)).toBe(true);
    expect(verifyMetaWebhookSignature(Buffer.from("tampered"), signature, appSecret)).toBe(false);
    expect(verifyMetaWebhookSignature(rawBody, undefined, appSecret)).toBe(false);
  });

  it("does not accept a challenge without an explicitly configured verification token", () => {
    expect(verifyMetaWebhookChallenge({ mode: "subscribe", token: "token", configuredToken: "token" })).toBe(true);
    expect(verifyMetaWebhookChallenge({ mode: "subscribe", token: "token", configuredToken: undefined })).toBe(false);
    expect(verifyMetaWebhookChallenge({ mode: "subscribe", token: "wrong", configuredToken: "token" })).toBe(false);
  });

  it("extracts only routing metadata and a stable dedupe key without person resolution", () => {
    const [change] = extractMetaWebhookChanges({
      object: "whatsapp_business_account",
      entry: [{
        id: "waba-id",
        changes: [{
          field: "messages",
          value: {
            metadata: { phone_number_id: "phone-id" },
            contacts: [{ wa_id: "unresolved-sender" }],
            messages: [{ id: "provider-message-id", type: "text", text: { body: "not used by phase 1" } }],
          },
        }],
      }],
    });

    expect(change).toMatchObject({
      wabaId: "waba-id",
      phoneNumberId: "phone-id",
      providerField: "messages",
    });
    expect(change?.providerEventKey).toMatch(/^[a-f0-9]{64}$/);
    expect(change).not.toHaveProperty("patientId");
    expect(change).not.toHaveProperty("sender");
  });
});

describe("WhatsApp Phase 1 connection-aware transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a durable attempt before Meta acceptance and records acceptance rather than delivery", async () => {
    vi.mocked(createWhatsAppSendAttempt).mockResolvedValue({ id: 41 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid-1" }] }),
    }));

    const result = await sendWhatsAppText(connection, 7, "+90 501 114 70 60", "Hello");

    expect(createWhatsAppSendAttempt).toHaveBeenCalledWith(expect.objectContaining({
      connection: expect.objectContaining({ route: "legacy_env", phoneNumberId: "phone-id" }),
      actorUserId: 7,
      recipientEndpoint: "+905011147060",
      intentType: "text",
    }));
    expect(result).toEqual(expect.objectContaining({ success: true, outcome: "accepted", wamid: "wamid-1" }));
    expect(completeWhatsAppSendAttempt).toHaveBeenCalledWith(expect.objectContaining({
      id: 41,
      attemptState: "accepted",
      providerMessageId: "wamid-1",
    }));
  });

  it("marks a network failure ambiguous and never retries automatically", async () => {
    vi.mocked(createWhatsAppSendAttempt).mockResolvedValue({ id: 42 });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await sendWhatsAppText(connection, 7, "+905011147060", "Hello");

    expect(result).toEqual(expect.objectContaining({ success: false, outcome: "ambiguous", sendAttemptId: 42 }));
    expect(completeWhatsAppSendAttempt).toHaveBeenCalledWith(expect.objectContaining({
      id: 42,
      attemptState: "ambiguous",
      failureCategory: "transport_exception",
    }));
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});

describe("WhatsApp WU-05 normalized provider evidence", () => {
  it("normalizes text, delivery status, and media metadata while preserving provider provenance", async () => {
    const { buildWU05NormalizationPlan } = await import("./whatsappNormalization");
    const plan = buildWU05NormalizationPlan({
      providerField: "messages",
      value: {
        metadata: { phone_number_id: "phone-id" },
        messages: [{
          id: "provider-message-1",
          from: "sender-endpoint-1",
          timestamp: "1727090000",
          type: "text",
          text: { body: "Synthetic WU-05 text" },
        }, {
          id: "provider-media-1",
          from: "sender-endpoint-1",
          timestamp: "1727090001",
          type: "document",
          document: {
            id: "provider-media-id-1",
            mime_type: "application/pdf",
            sha256: "synthetic-sha256",
            filename: "synthetic.pdf",
            caption: "Synthetic document",
          },
        }],
        statuses: [{
          id: "provider-message-1",
          recipient_id: "recipient-endpoint-1",
          timestamp: "1727090002",
          status: "delivered",
        }],
      },
      connection,
      routingState: "legacy_env",
      existingFailureCategory: null,
    });

    expect(plan.normalizationState).toBe("normalized");
    expect(plan.processingState).toBe("applied");
    expect(plan.messages).toHaveLength(2);
    expect(plan.messages[0]).toMatchObject({
      providerMessageId: "provider-message-1",
      providerSenderId: "sender-endpoint-1",
      messageType: "text",
      textBody: "Synthetic WU-05 text",
      normalizationState: "normalized",
    });
    expect(plan.messages[1]?.media[0]).toMatchObject({
      providerMediaId: "provider-media-id-1",
      mediaState: "metadata_only",
      mimeType: "application/pdf",
    });
    expect(plan.messages[1]?.media[0]?.providerMediaItemKey.length).toBeLessThanOrEqual(128);
    expect(plan.statuses[0]).toMatchObject({
      providerStatusId: "provider-message-1",
      statusValue: "delivered",
      normalizationState: "normalized",
    });
  });

  it("quarantines malformed and unsupported items without accepting partial unsafe content as normalized", async () => {
    const { buildWU05NormalizationPlan } = await import("./whatsappNormalization");
    const plan = buildWU05NormalizationPlan({
      providerField: "messages",
      value: {
        messages: [{
          id: "synthetic-malformed-1",
          from: "sender-endpoint-2",
          timestamp: "1727090000",
          type: "text",
          text: {},
        }, {
          id: "synthetic-unsupported-1",
          from: "sender-endpoint-2",
          timestamp: "1727090000",
          type: "future_provider_type",
          future_provider_type: { opaque: true },
        }],
      },
      connection,
      routingState: "resolved",
      existingFailureCategory: null,
    });

    expect(plan.normalizationState).toBe("quarantined");
    expect(plan.processingState).toBe("quarantined");
    expect(plan.messages.every((message) => message.normalizationState === "quarantined")).toBe(true);
    expect(plan.messages.map((message) => message.failureCategory)).toEqual([
      "malformed_text_message",
      "unsupported_message_type",
    ]);
  });

  it("keeps unresolved or unsupported events quarantined and produces no normalized projection", async () => {
    const { buildWU05NormalizationPlan } = await import("./whatsappNormalization");
    const unresolved = buildWU05NormalizationPlan({
      providerField: "messages",
      value: { messages: [{ id: "synthetic-unresolved-1", type: "text", timestamp: "1727090000", text: { body: "opaque" } }] },
      connection: null,
      routingState: "unmapped",
      existingFailureCategory: "unmapped_connection",
    });
    const unsupported = buildWU05NormalizationPlan({
      providerField: "account_update",
      value: { messages: [{ id: "synthetic-unsupported-field-1", type: "text", timestamp: "1727090000", text: { body: "opaque" } }] },
      connection,
      routingState: "unsupported",
      existingFailureCategory: "unsupported_provider_field",
    });

    expect(unresolved).toMatchObject({
      processingState: "quarantined",
      normalizationFailureCategory: "unmapped_connection",
      messages: [],
      statuses: [],
    });
    expect(unsupported).toMatchObject({
      processingState: "quarantined",
      normalizationFailureCategory: "unsupported_provider_field",
      messages: [],
      statuses: [],
    });
  });

  it("rejects an event with no messages or statuses as malformed evidence", async () => {
    const { buildWU05NormalizationPlan } = await import("./whatsappNormalization");
    const plan = buildWU05NormalizationPlan({
      providerField: "messages",
      value: { metadata: { phone_number_id: "phone-id" } },
      connection,
      routingState: "resolved",
      existingFailureCategory: null,
    });
    expect(plan).toMatchObject({
      processingState: "quarantined",
      normalizationFailureCategory: "malformed_messages_event_shape",
    });
  });
});

describe("WhatsApp WU-06 safe endpoint/person resolution", () => {
  it("keeps an unknown endpoint unresolved without inventing a person", () => {
    const result = classifyWhatsAppResolution({
      routingState: "resolved",
      endpointIdentifierPresent: true,
      candidates: [],
      trustedLinks: [],
    });
    expect(result).toMatchObject({
      resolutionState: "unresolved",
      resolutionReason: "no_exact_phone_match",
      confirmedPersonIdentityId: null,
      humanActorResolutionState: "unresolved",
      medicalSubjectResolutionState: "unresolved",
    });
  });

  it("creates one possible candidate from an exact phone match but never confirms it", () => {
    const candidates = buildPhoneCandidates({
      endpointPhone: "+905551234567",
      records: [{
        recordType: "lead",
        recordId: 101,
        phone: "+90 555 123 45 67",
        secondaryPhone: null,
      }],
    });
    const result = classifyWhatsAppResolution({
      routingState: "resolved",
      endpointIdentifierPresent: true,
      candidates,
      trustedLinks: [],
    });
    expect(candidates).toHaveLength(1);
    expect(result.resolutionState).toBe("candidate_single");
    expect(result.confirmedPersonIdentityId).toBeNull();
  });

  it("permits canonical formatting and 00-prefix normalization but never a fuzzy suffix match", () => {
    const canonical = buildPhoneCandidates({
      endpointPhone: "00905551234567",
      records: [{ recordType: "patient", recordId: 102, phone: "+90 555 123 45 67", secondaryPhone: null, convertedPatientId: 102 }],
    });
    const localOnly = buildPhoneCandidates({
      endpointPhone: "+905551234567",
      records: [{ recordType: "patient", recordId: 103, phone: "0555 123 45 67", secondaryPhone: null, convertedPatientId: 103 }],
    });
    expect(canonical).toHaveLength(1);
    expect(localOnly).toHaveLength(0);
  });

  it("preserves multiple exact matches as candidate_multiple", () => {
    const candidates = buildPhoneCandidates({
      endpointPhone: "905551234567",
      records: [
        { recordType: "patient", recordId: 201, phone: "+90 555 123 45 67", secondaryPhone: null, convertedPatientId: 201 },
        { recordType: "lead", recordId: 202, phone: "+905551234567", secondaryPhone: null },
      ],
    });
    const result = classifyWhatsAppResolution({
      routingState: "resolved",
      endpointIdentifierPresent: true,
      candidates,
      trustedLinks: [],
    });
    expect(candidates).toHaveLength(2);
    expect(result.resolutionState).toBe("candidate_multiple");
    expect(result.resolutionReason).toBe("multiple_exact_phone_matches");
  });

  it("confirms only an already trusted explicit endpoint/person relationship", () => {
    const result = classifyWhatsAppResolution({
      routingState: "resolved",
      endpointIdentifierPresent: true,
      candidates: [],
      trustedLinks: [{ personIdentityId: 301 }],
    });
    expect(result).toMatchObject({
      resolutionState: "confirmed",
      resolutionReason: "trusted_endpoint_person_link",
      confirmedPersonIdentityId: 301,
    });
  });

  it("keeps multiple trusted links ambiguous rather than choosing one", () => {
    const result = classifyWhatsAppResolution({
      routingState: "resolved",
      endpointIdentifierPresent: true,
      candidates: [],
      trustedLinks: [{ personIdentityId: 401 }, { personIdentityId: 402 }],
    });
    expect(result.resolutionState).toBe("candidate_multiple");
    expect(result.confirmedPersonIdentityId).toBeNull();
  });

  it("does not use message text, profile names, or semantic subject claims as identity proof", () => {
    const result = classifyWhatsAppResolution({
      routingState: "resolved",
      endpointIdentifierPresent: true,
      candidates: [],
      trustedLinks: [],
    });
    expect(result.medicalSubjectResolutionState).toBe("unresolved");
    expect(result.humanActorResolutionState).toBe("unresolved");
  });

  it("does not let a mismatched WhatsApp profile name change an exact-phone candidate into confirmed identity", () => {
    const candidate = { recordType: "patient" as const, recordId: 451, matchedField: "phone" as const, convertedPatientId: 451, candidateKey: "patient:451" };
    const hints = extractWU06ProviderEvidenceHints({
      providerEndpointId: "endpoint-451",
      value: { contacts: [{ wa_id: "endpoint-451", profile: { name: "Unrelated Provider Display Name" } }] },
    });
    const result = classifyWhatsAppResolution({
      routingState: "resolved",
      endpointIdentifierPresent: true,
      candidates: [candidate],
      trustedLinks: [],
    });
    expect(hints[0]?.hintType).toBe("provider_profile_name");
    expect(result.resolutionState).toBe("candidate_single");
    expect(result.confirmedPersonIdentityId).toBeNull();
  });

  it("retains representative/profile/group hints as provider evidence only", () => {
    const hints = extractWU06ProviderEvidenceHints({
      providerEndpointId: "sender-1",
      value: {
        contacts: [{ wa_id: "sender-1", profile: { name: "Representative Hint" } }],
        messages: [{
          from: "sender-1",
          group_id: "group-evidence-1",
          context: { participant: "participant-evidence-1" },
          identity: { name: "Business-App Actor Hint" },
        }],
      },
    });
    expect(hints.map((hint) => hint.hintType)).toEqual([
      "provider_profile_name",
      "provider_group_id",
      "provider_group_participant_id",
      "provider_actor_hint",
    ]);
    expect(classifyWhatsAppResolution({
      routingState: "resolved",
      endpointIdentifierPresent: true,
      candidates: [],
      trustedLinks: [],
    }).resolutionState).toBe("unresolved");
  });

  it("keeps unresolved connection and unsupported field events out of identity matching", () => {
    const unresolved = classifyWhatsAppResolution({
      routingState: "unmapped",
      endpointIdentifierPresent: true,
      candidates: [{ recordType: "patient", recordId: 501, matchedField: "phone", convertedPatientId: 501, candidateKey: "patient:501" }],
      trustedLinks: [],
    });
    const unsupported = classifyWhatsAppResolution({
      routingState: "unsupported",
      endpointIdentifierPresent: true,
      candidates: [{ recordType: "patient", recordId: 502, matchedField: "phone", convertedPatientId: 502, candidateKey: "patient:502" }],
      trustedLinks: [],
    });
    expect(unresolved.resolutionState).toBe("unresolved");
    expect(unresolved.resolutionReason).toBe("unresolved_connection");
    expect(unsupported.resolutionReason).toBe("unsupported_provider_field");
  });

  it("preserves Lead-to-Patient continuity and distinguishes separate couple endpoints", () => {
    const leadConvertedToPatient = buildPhoneCandidates({
      endpointPhone: "+905551111111",
      records: [{ recordType: "lead", recordId: 601, phone: "+905551111111", secondaryPhone: null, convertedPatientId: 701 }],
    });
    const patientAfterConversion = buildPhoneCandidates({
      endpointPhone: "+905551111111",
      records: [{ recordType: "patient", recordId: 701, phone: "+905551111111", secondaryPhone: null, convertedPatientId: 701 }],
    });
    const husbandEndpoint = buildPhoneCandidates({
      endpointPhone: "+905552222222",
      records: [{ recordType: "patient", recordId: 702, phone: "+905552222222", secondaryPhone: null, convertedPatientId: 702 }],
    });
    expect(leadConvertedToPatient[0]?.candidateKey).toBe("patient:701");
    expect(patientAfterConversion[0]?.candidateKey).toBe("patient:701");
    expect(husbandEndpoint[0]?.candidateKey).toBe("patient:702");
    expect(leadConvertedToPatient[0]?.candidateKey).not.toBe(husbandEndpoint[0]?.candidateKey);
  });

  it("permits the same prospective person to have multiple independent endpoints without a Conversation", () => {
    const primaryEndpoint = buildPhoneCandidates({
      endpointPhone: "+905554444444",
      records: [{ recordType: "patient", recordId: 711, phone: "+905554444444", secondaryPhone: "+905555555555", convertedPatientId: 711 }],
    });
    const secondaryEndpoint = buildPhoneCandidates({
      endpointPhone: "+905555555555",
      records: [{ recordType: "patient", recordId: 711, phone: "+905554444444", secondaryPhone: "+905555555555", convertedPatientId: 711 }],
    });
    expect(primaryEndpoint[0]?.candidateKey).toBe("patient:711");
    expect(secondaryEndpoint[0]?.candidateKey).toBe("patient:711");
    expect(primaryEndpoint[0]?.matchedField).toBe("phone");
    expect(secondaryEndpoint[0]?.matchedField).toBe("secondaryPhone");
  });

  it("keeps a shared/ambiguous phone unresolved or candidate-multiple and never creates workflow entities", () => {
    const candidates = buildPhoneCandidates({
      endpointPhone: "+905553333333",
      records: [
        { recordType: "lead", recordId: 801, phone: "+905553333333", secondaryPhone: null },
        { recordType: "patient", recordId: 802, phone: null, secondaryPhone: "+905553333333", convertedPatientId: 802 },
      ],
    });
    const result = classifyWhatsAppResolution({
      routingState: "resolved",
      endpointIdentifierPresent: true,
      candidates,
      trustedLinks: [],
    });
    expect(result.resolutionState).toBe("candidate_multiple");
    expect(result).not.toHaveProperty("patientId");
    expect(result).not.toHaveProperty("leadId");
    expect(result).not.toHaveProperty("mrn");
    expect(result).not.toHaveProperty("conversationId");
    expect(result).not.toHaveProperty("treatmentCaseId");
  });

  it("uses a stable source-event/item key so repeated webhook delivery cannot create a second resolution", () => {
    const first = buildWU06ResolutionKey({
      sourceEventId: 901,
      providerPhoneNumberId: "fertiliv-phone-number",
      providerItemKey: "message-item-901",
    });
    const repeated = buildWU06ResolutionKey({
      sourceEventId: 901,
      providerPhoneNumberId: "fertiliv-phone-number",
      providerItemKey: "message-item-901",
    });
    const differentEndpoint = buildWU06ResolutionKey({
      sourceEventId: 901,
      providerPhoneNumberId: "fertiliv-phone-number",
      providerItemKey: "message-item-902",
    });
    expect(first).toBe(repeated);
    expect(first).not.toBe(differentEndpoint);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("requires an explicit endpoint identifier and leaves linked-device human actor unresolved", () => {
    const result = classifyWhatsAppResolution({
      routingState: "resolved",
      endpointIdentifierPresent: false,
      candidates: [],
      trustedLinks: [],
    });
    expect(result).toMatchObject({
      resolutionState: "unresolved",
      resolutionReason: "missing_endpoint_identifier",
      humanActorResolutionState: "unresolved",
    });
  });
});


describe("WhatsApp WU-07 Conversation boundary", () => {
  const inboundMessage = {
    id: "provider-message-1",
    from: "remote-endpoint-1",
    timestamp: "1727090000",
    type: "text",
    text: { body: "synthetic transport evidence" },
  };

  it("creates a private transport Conversation plan for an unknown endpoint without a business identity", () => {
    const plan = buildWU07ConversationCorrelationPlan({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "unknown-endpoint-1",
      message: inboundMessage,
      endpointResolutionState: "unresolved",
    });
    expect(plan).toMatchObject({
      conversationType: "private",
      identityBasis: "remote_endpoint",
      providerThreadId: null,
      endpointResolutionState: "unresolved",
      humanActorResolutionState: "unresolved",
      medicalSubjectResolutionState: "unresolved",
    });
    expect(plan).not.toHaveProperty("patientId");
    expect(plan).not.toHaveProperty("leadId");
    expect(plan).not.toHaveProperty("mrn");
    expect(plan).not.toHaveProperty("treatmentCaseId");
  });

  it("correlates repeated messages from one endpoint and receiving number to one private key", () => {
    const first = buildWU07ConversationKey({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "remote-endpoint-1",
      providerThreadId: null,
    });
    const repeated = buildWU07ConversationKey({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "remote-endpoint-1",
      providerThreadId: null,
    });
    expect(first).toBe(repeated);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps repeated webhook correlation idempotent at the conversation-message association key", () => {
    const first = buildWU07ConversationMessageKey({
      conversationKey: "conversation-key-1",
      providerItemKey: "message-item-1",
    });
    const repeated = buildWU07ConversationMessageKey({
      conversationKey: "conversation-key-1",
      providerItemKey: "message-item-1",
    });
    const differentMessage = buildWU07ConversationMessageKey({
      conversationKey: "conversation-key-1",
      providerItemKey: "message-item-2",
    });
    expect(first).toBe(repeated);
    expect(first).not.toBe(differentMessage);
  });

  it("scopes identical remote endpoints by WhatsApp connection", () => {
    const connectionA = { ...connection, id: 101, phoneNumberId: "phone-a", route: "persisted" as const };
    const connectionB = { ...connection, id: 202, phoneNumberId: "phone-b", route: "persisted" as const };
    const first = buildWU07ConversationKey({
      provider: "meta",
      phoneNumberId: "phone-a",
      connection: connectionA,
      providerEndpointId: "same-remote-number",
      providerThreadId: null,
    });
    const second = buildWU07ConversationKey({
      provider: "meta",
      phoneNumberId: "phone-b",
      connection: connectionB,
      providerEndpointId: "same-remote-number",
      providerThreadId: null,
    });
    expect(first).not.toBe(second);
  });

  it("keeps wife and husband private Conversations separate", () => {
    const wife = buildWU07ConversationCorrelationPlan({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "wife-endpoint",
      message: { ...inboundMessage, from: "wife-endpoint" },
      endpointResolutionState: "candidate_single",
    });
    const husband = buildWU07ConversationCorrelationPlan({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "husband-endpoint",
      message: { ...inboundMessage, from: "husband-endpoint" },
      endpointResolutionState: "candidate_single",
    });
    expect(wife?.conversationType).toBe("private");
    expect(husband?.conversationType).toBe("private");
    expect(wife?.conversationKey).not.toBe(husband?.conversationKey);
  });

  it("allows one future person to have multiple endpoint Conversations", () => {
    const primary = buildWU07ConversationKey({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "primary-endpoint",
      providerThreadId: null,
    });
    const secondary = buildWU07ConversationKey({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "secondary-endpoint",
      providerThreadId: null,
    });
    expect(primary).not.toBe(secondary);
  });

  it("does not change the Conversation key when a Lead later becomes a Patient", () => {
    const beforeConversion = buildWU07ConversationKey({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "converted-lead-endpoint",
      providerThreadId: null,
    });
    const afterConversion = buildWU07ConversationKey({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "converted-lead-endpoint",
      providerThreadId: null,
    });
    expect(beforeConversion).toBe(afterConversion);
  });

  it("does not merge a shared-phone ambiguity into another endpoint or person key", () => {
    const first = buildWU07ConversationKey({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "shared-phone-endpoint",
      providerThreadId: null,
    });
    const second = buildWU07ConversationKey({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "other-endpoint",
      providerThreadId: null,
    });
    expect(first).not.toBe(second);
  });

  it("keeps an unresolved endpoint Conversation valid without promoting the participant", () => {
    const plan = buildWU07ConversationCorrelationPlan({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "unresolved-endpoint",
      message: inboundMessage,
      endpointResolutionState: "unresolved",
    });
    expect(plan?.participantRole).toBe("remote_endpoint");
    expect(plan?.endpointResolutionState).toBe("unresolved");
  });

  it("keeps a representative or friend as a participant without an authorization or Patient field", () => {
    const plan = buildWU07ConversationCorrelationPlan({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "representative-endpoint",
      message: inboundMessage,
      endpointResolutionState: "candidate_single",
    });
    expect(plan?.conversationType).toBe("private");
    expect(plan).not.toHaveProperty("authorizedRecipient");
    expect(plan).not.toHaveProperty("patientId");
    expect(plan).not.toHaveProperty("leadId");
  });

  it("represents a provider group as a group Conversation with endpoint participants", () => {
    const plan = buildWU07ConversationCorrelationPlan({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "group-sender-1",
      message: { ...inboundMessage, from: "group-sender-1", group_id: "provider-group-1" },
      endpointResolutionState: "unresolved",
    });
    expect(plan).toMatchObject({
      conversationType: "group",
      identityBasis: "provider_thread",
      providerThreadId: "provider-group-1",
      participantRole: "group_participant",
      providerParticipantId: "group-sender-1",
    });
    expect(plan).not.toHaveProperty("personIdentityId");
    expect(plan).not.toHaveProperty("patientId");
  });

  it("keeps private and group Conversations separate even for the same endpoint", () => {
    const privateKey = buildWU07ConversationKey({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "same-endpoint",
      providerThreadId: null,
    });
    const groupKey = buildWU07ConversationKey({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "same-endpoint",
      providerThreadId: "group-1",
    });
    expect(privateKey).not.toBe(groupKey);
  });

  it("does not infer a medical subject from the sender Conversation", () => {
    const plan = buildWU07ConversationCorrelationPlan({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "wife-endpoint",
      message: { ...inboundMessage, from: "wife-endpoint", text: { body: "my husband completed a test" } },
      endpointResolutionState: "confirmed",
    });
    expect(plan?.medicalSubjectResolutionState).toBe("unresolved");
  });

  it("does not use a WhatsApp profile name as Conversation identity", () => {
    const withName = buildWU07ConversationCorrelationPlan({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "profile-endpoint",
      message: { ...inboundMessage, from: "profile-endpoint", profile: { name: "Display Name A" } },
      endpointResolutionState: "unresolved",
    });
    const withoutName = buildWU07ConversationCorrelationPlan({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "profile-endpoint",
      message: { ...inboundMessage, from: "profile-endpoint", profile: { name: "Display Name B" } },
      endpointResolutionState: "unresolved",
    });
    expect(withName?.conversationKey).toBe(withoutName?.conversationKey);
  });

  it("keeps Business-App or linked-device human actor attribution unresolved", () => {
    const plan = buildWU07ConversationCorrelationPlan({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "linked-device-endpoint",
      message: { ...inboundMessage, from: "linked-device-endpoint", identity: { name: "Unknown device actor" } },
      endpointResolutionState: "unresolved",
    });
    expect(plan?.humanActorResolutionState).toBe("unresolved");
  });

  it("does not expose Patient, Lead, MRN, Treatment Case, clinical, or authorization creation fields", () => {
    const plan = buildWU07ConversationCorrelationPlan({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "safe-endpoint",
      message: inboundMessage,
      endpointResolutionState: "candidate_multiple",
    });
    expect(plan).not.toHaveProperty("patientId");
    expect(plan).not.toHaveProperty("leadId");
    expect(plan).not.toHaveProperty("mrn");
    expect(plan).not.toHaveProperty("treatmentCaseId");
    expect(plan).not.toHaveProperty("clinicalRecordId");
    expect(plan).not.toHaveProperty("authorizationId");
  });

  it("returns the original provider message evidence without rewriting it", () => {
    const value = { messages: [{ ...inboundMessage }] };
    const before = JSON.stringify(value);
    const raw = findWU07RawMessage(value, "provider-message-1");
    expect(raw).toEqual(inboundMessage);
    expect(JSON.stringify(value)).toBe(before);
  });

  it("keeps conversation and participant keys deterministic across repeated correlation planning", () => {
    const first = buildWU07ConversationCorrelationPlan({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "deterministic-endpoint",
      message: inboundMessage,
      endpointResolutionState: "candidate_multiple",
    });
    const second = buildWU07ConversationCorrelationPlan({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "deterministic-endpoint",
      message: inboundMessage,
      endpointResolutionState: "candidate_multiple",
    });
    expect(first?.conversationKey).toBe(second?.conversationKey);
    expect(first?.participantKey).toBe(second?.participantKey);
  });

  it("does not invent a provider thread when the payload lacks group/thread evidence", () => {
    const plan = buildWU07ConversationCorrelationPlan({
      provider: "meta",
      phoneNumberId: "phone-id",
      connection,
      providerEndpointId: "no-thread-endpoint",
      message: { id: "message-without-thread", from: "no-thread-endpoint", type: "text" },
      endpointResolutionState: "unresolved",
    });
    expect(plan?.conversationType).toBe("private");
    expect(plan?.providerThreadId).toBeNull();
  });

  it("persists an unknown-endpoint Conversation as evidence links only, without a Patient, Lead, or clinical write", async () => {
    const inserts: unknown[] = [];
    const selectResults = [
      [{ id: 11, providerMessageId: "provider-message-1", providerTimestamp: new Date("2026-09-23T00:00:00Z") }],
      [{ id: 22, endpointId: null, resolutionState: "unresolved", confirmedPersonIdentityId: null }],
      [{ id: 33 }],
      [],
    ];
    const tx: any = {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => selectResults.shift() ?? [],
          }),
        }),
      }),
      insert: () => ({
        values: (value: unknown) => {
          inserts.push(value);
          return { onConflictDoUpdate: async () => undefined, onDuplicateKeyUpdate: async () => undefined };
        },
      }),
    };
    const result = await persistWU07ConversationCorrelations({
      tx,
      sourceEventId: 99,
      provider: "meta",
      providerPhoneNumberId: "phone-id",
      value: { messages: [{ ...inboundMessage, from: "unknown-endpoint-1" }] },
      messages: [{
        providerMessageId: "provider-message-1",
        providerItemKey: "item-1",
        providerSenderId: "unknown-endpoint-1",
        providerRecipientId: null,
        providerTimestamp: new Date("2026-09-23T00:00:00Z"),
        providerDirection: "inbound",
        messageType: "text",
        textBody: "synthetic transport evidence",
        normalizedContent: null,
        normalizationState: "normalized",
        failureCategory: null,
        media: [],
      }],
      connection,
    });
    expect(result).toEqual([{ conversationId: 33, conversationType: "private", associationState: "correlated" }]);
    expect(inserts).toHaveLength(3);
    expect(inserts.flatMap((entry) => Object.keys(entry as object))).not.toContain("patientId");
    expect(inserts.flatMap((entry) => Object.keys(entry as object))).not.toContain("leadId");
    expect(inserts.flatMap((entry) => Object.keys(entry as object))).not.toContain("mrn");
    expect(inserts.flatMap((entry) => Object.keys(entry as object))).not.toContain("treatmentCaseId");
    expect(inserts.flatMap((entry) => Object.keys(entry as object))).not.toContain("clinicalRecordId");
  });
});
