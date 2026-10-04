import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyTrackedSyntheticSendFailure, isSyntheticTestRecipientLineEligible } from "./operationalInbox";
import { WppConnectSandboxError } from "./whatsappLinkedDeviceProvider";
import { normalizeInboxDirectPhone } from "../shared/unifiedInbox";

describe("operational Unified Inbox safety boundaries", () => {
  it("keeps CRM creation and linking behind explicit named actions", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/operationalInbox.ts"), "utf8");
    expect(source).toContain("createLeadAndLinkInboxConversation");
    expect(source).toContain("linkInboxConversationRecord");
    expect(source).toContain("manual_confirmation");
    expect(source).not.toContain("createPatient(");
    expect(source).not.toContain("createTreatmentCase(");
  });

  it("keeps the composer limited to explicitly enabled, ownership-bound test transports and canonical event bridges", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/operationalInbox.ts"), "utf8");
    expect(source).toContain('access.adapterKind !== "wppconnect_in_app_sandbox"');
    expect(source).toContain("sandboxOnly: true");
    expect(source).toContain('direction: "outbound"');
    expect(source).toContain("ingestWppConnectSyntheticEvent");
    expect(source).toContain("isWppConnectServerAdapterEnabled");
    expect(source).toContain("ownershipFromRuntime");
    expect(source).toContain("ingestWppConnectServerEvent");
  });

  it("starts direct conversations only through authorized connected test lines and the existing correlation pipeline", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/operationalInbox.ts"), "utf8");
    expect(source).toContain("listInboxNewConversationLines");
    expect(source).toContain("searchInboxNewConversationTargets");
    expect(source).toContain("prepareInboxNewConversation");
    expect(source).toContain("startInboxNewConversation");
    expect(source).toContain("canUserAccessLinkedDeviceLine");
    expect(source).toContain("buildWU07ConversationKey");
    expect(source).toContain("wppconnect_in_app_sandbox");
    expect(source).toContain("ingestWppConnectSyntheticEvent");
    expect(source).toContain("existingDirectConversation");
    expect(source).toContain("Choose which stored phone number to use before continuing.");
    expect(source).toContain("getWppConnectSandboxStatus");
    expect(source).toContain("!currentStatus.outboundReady");
    expect(source).toContain('eq(whatsappLinkedDeviceLines.healthState, "healthy")');
    expect(source).toContain('eq(whatsappConnections.healthState, "healthy")');
    expect(source).toContain("isWppConnectServerAdapterEnabled");
    expect(source).toContain("getWppConnectServerConnectionStatus");
    expect(source).toContain("serverOwnership");
    expect(source).toContain("const runtime = linkedDeviceRuntimeFromSession(session)");
    expect(source).toContain("currentStatus.sessionName !== runtime.sessionName");
    expect(source).toContain("workerAllocationMatchesLinkedDeviceLine");
    expect(source).toContain("not allocated to this line");
    expect(source).toContain("whatsappSyntheticTestRecipients");
    expect(source).toContain("requireApprovedSyntheticTestRecipient");
    expect(source).toContain("buildSyntheticRecipientApprovalProof");
    expect(source).toContain("assertCurrentSyntheticRecipientApproval");
    expect(source).toContain("validateSyntheticRecipientApproval");
    expect(source).toContain("listInboxEligibleSyntheticTestRecipients");
    expect(source).toContain("ensureDirectConversation");
    expect(source).toContain("sendTrackedSyntheticText");
    expect(source).toContain("createWhatsAppSendAttempt");
    expect(source).toContain("idempotencyKey");
    expect(source).toContain("requireClientActionId");
    expect(source).toContain("clientActionId: input.clientActionId");
    expect(source).toContain("attemptState: \"submitting\"");
    expect(source).toContain("const classified = classifyTrackedSyntheticSendFailure");
    expect(source).toContain('attemptState: classified.attemptState');
    expect(source).toContain("Send status unknown — checking");
    expect(source).toContain("classifyTrackedSyntheticSendFailure");
    expect(source).toContain("wpp_recipient_proof_rejected");
    expect(source).toContain("createOutboundCorrelationId");
    expect(source).toContain("buildOutboundAttemptMetadata");
    expect(source).toContain("outboundAttemptId: attemptId");
    expect(source).toContain("The prior message action was not submitted. Start a new action instead of retrying the same reference.");
    expect(source).toContain("The prior attachment action was not submitted. Start a new action instead of retrying the same reference.");
  });

  it("keeps recipient approval persistent-line scoped while requiring a current connected and outbound-ready disposable transport", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/operationalInbox.ts"), "utf8");
    expect(source).toContain('eq(whatsappSyntheticTestRecipients.lineId, input.lineId)');
    expect(source).toContain('eq(whatsappSyntheticTestRecipients.status, "active")');
    expect(source).toMatch(/currentStatus\.status !== "CONNECTED"\s*\|\|\s*!currentStatus\.outboundReady/);
    expect(source).toContain('currentStatus.lifecycleState !== "connected"');
    expect(source).toContain("const runtime = linkedDeviceRuntimeFromSession(session)");
    expect(source).toContain("workerAllocationMatchesLinkedDeviceLine");
    expect(source).toContain("runtime: input.line.runtime");
    expect(source).not.toContain('lineId: 30001');
  });

  it("prepares only endpoint and Conversation transport state before submit and reconciles accepted attempts without resending", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/operationalInbox.ts"), "utf8");
    const schema = fs.readFileSync(path.join(process.cwd(), "drizzle/schema.ts"), "utf8");
    expect(source).toContain("Prepared the Endpoint and Conversation before submitting");
    expect(source).toContain("existing.attemptState === \"accepted\"");
    expect(source).toContain("timestamp: existing.acceptedAt ?? new Date()");
    expect(source).toContain("conversationId: input.conversationId");
    expect(schema).toContain('conversationId: integer("conversationId")');
    expect(schema).toContain('clientActionId: varchar("clientActionId", { length: 64 })');
    expect(schema).toContain('correlationId: varchar("correlationId", { length: 64 })');
    expect(schema).toContain('approvalReason: varchar("approvalReason", { length: 64 })');
    expect(schema).toContain('uniqueIndex("whatsapp_send_attempts_idempotency_uq").on(table.idempotencyKey)');
    expect(schema).not.toContain('uniqueIndex("whatsapp_send_attempts_client_action');
    expect(schema).toContain('"pending", "submitting", "accepted", "delivered", "read", "failed", "ambiguous", "requires_retry"');
    expect(source).not.toContain("createPatient(");
    expect(source).not.toContain("createTreatmentCase(");
  });

  it("keeps the synthetic recipient registry administrator-managed, audited, and revocable without becoming a production policy", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/operationalInbox.ts"), "utf8");
    const schema = fs.readFileSync(path.join(process.cwd(), "drizzle/schema.ts"), "utf8");
    expect(schema).toContain('pgTable("whatsapp_synthetic_test_recipients"');
    expect(schema).toContain('"active", "revoked"');
    expect(source).toContain("requireSyntheticRecipientAdmin");
    expect(source).toContain("approveInboxSyntheticTestRecipient");
    expect(source).toContain("revokeInboxSyntheticTestRecipient");
    expect(source).toContain("whatsapp_synthetic_test_recipient_approved");
    expect(source).toContain("whatsapp_synthetic_test_recipient_revoked");
    expect(source).toContain("not a production patient-messaging permission");
    expect(source).not.toContain("createPatient(");
  });

  it("normalizes the F4 number and scopes approval to the persistent line without probing a disposable worker", () => {
    expect(normalizeInboxDirectPhone("+201100791315")).toBe("+201100791315");
    expect(normalizeInboxDirectPhone("+20 110 079 1315")).toBe("+201100791315");
    expect(isSyntheticTestRecipientLineEligible({
      line: { lifecycleState: "connected", adapterKind: "wppconnect_in_app_sandbox" },
      connection: { provider: "wppconnect" },
    })).toBe(true);
    expect(isSyntheticTestRecipientLineEligible({
      line: { lifecycleState: "disabled", adapterKind: "wppconnect_in_app_sandbox" },
      connection: { provider: "wppconnect" },
    })).toBe(false);
    const source = fs.readFileSync(path.join(process.cwd(), "server/operationalInbox.ts"), "utf8");
    const approvalStart = source.indexOf("export async function approveInboxSyntheticTestRecipient");
    const approvalEnd = source.indexOf("/** Revokes future outbound starts", approvalStart);
    const approvalSource = source.slice(approvalStart, approvalEnd);
    expect(approvalSource).toContain("requireSyntheticTestRecipientLine");
    expect(approvalSource).not.toContain("authorizedDirectConversationLine");
    expect(approvalSource).not.toContain("getWppConnectSandboxStatus");
    expect(approvalSource).toContain('eq(whatsappSyntheticTestRecipients.lineId, input.lineId)');
  });

  it("does not collapse direct-send failures into the old generic composer error", () => {
    const provider = fs.readFileSync(path.join(process.cwd(), "server/whatsappLinkedDeviceProvider.ts"), "utf8");
    const operational = fs.readFileSync(path.join(process.cwd(), "server/operationalInbox.ts"), "utf8");
    expect(provider).toContain("WppConnectSandboxError");
    expect(provider).toContain('"recipient_invalid"');
    expect(provider).toContain('"provider_temporarily_unavailable"');
    expect(provider).toContain('"session_unavailable"');
    expect(provider).toContain('"wpp_probe_timeout"');
    expect(provider).toContain('"wpp_probe_not_ready"');
    expect(provider).toContain('"worker_response_contract_mismatch"');
    expect(provider).toContain('"wpp_send_rejected_before_provider_id"');
    expect(provider).toContain('"wpp_send_uncertain_after_provider_call"');
    expect(operational).toContain('"test_recipient_not_authorized"');
    expect(provider).not.toContain("Synthetic WPPConnect composer request could not be completed.");
  });

  it("maps approval-proof failures to a clear staff message without exposing the reason code", () => {
    const classified = classifyTrackedSyntheticSendFailure(
      new WppConnectSandboxError(
        "wpp_recipient_proof_rejected",
        "Message not sent. Recipient authorization could not be verified.",
        { stage: "recipient_approval", probe: "approval_proof_expired", outcome: "rejected", timestamp: "2026-09-26T10:00:00.000Z" },
      ),
      "message",
    );
    expect(classified.attemptState).toBe("requires_retry");
    expect(classified.failureCategory).toBe("wpp_recipient_proof_rejected");
    expect(classified.error.message).toBe("Message not sent. Recipient authorization could not be verified.");
    expect(classified.error.message).not.toContain("approval_proof_expired");
  });

  it("classifies an unverifiable worker response as a retry-required safe mismatch", () => {
    const classified = classifyTrackedSyntheticSendFailure(
      new WppConnectSandboxError(
        "worker_response_contract_mismatch",
        "Message not sent. The WhatsApp worker response could not be verified.",
        { stage: "worker_response_contract", probe: "validate_response", outcome: "mismatch", timestamp: "2026-09-26T10:00:00.000Z" },
      ),
      "message",
    );
    expect(classified.attemptState).toBe("requires_retry");
    expect(classified.failureCategory).toBe("worker_response_contract_mismatch");
    expect(classified.error.message).toBe("Message not sent. The WhatsApp worker response could not be verified.");
  });

  it("stores only safe outbound observability metadata and never the approval proof or secret", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/operationalInbox.ts"), "utf8");
    const schema = fs.readFileSync(path.join(process.cwd(), "drizzle/schema.ts"), "utf8");
    const store = fs.readFileSync(path.join(process.cwd(), "server/whatsappPhase1Store.ts"), "utf8");
    expect(schema).toContain('recipientFingerprint: varchar("recipientFingerprint", { length: 64 })');
    expect(schema).toContain('approvalSecretSelector: varchar("approvalSecretSelector", { length: 64 })');
    expect(schema).not.toContain('approvalProof:');
    expect(schema).not.toContain('approvalHmac:');
    expect(store).toContain("approvalReason: input.diagnostic?.approvalReason");
    expect(store).not.toContain("approvalProof: input");
    expect(source).toContain("fertiliv-wppconnect-recipient-fingerprint-v1:${secret}");
    expect(source).not.toContain("recipientFingerprint: sha256Digest(input.providerEndpointId)");
  });

  it("uses controlled MIME normalization and preserves documented non-ACK document transport behavior", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/operationalInbox.ts"), "utf8");
    const harnessPath = "/home/ubuntu/linked-device-poc/wppconnect/wppconnect-poc.cjs";
    expect(source).toContain("resolveUnifiedInboxAttachmentMime");
    expect(source).toContain('attemptState: "submitting"');
    if (!fs.existsSync(harnessPath)) return;
    const harness = fs.readFileSync(harnessPath, "utf8");
    expect(harness).toContain("text\\/(plain|markdown)");
    expect(harness).toContain("type: providerType");
    expect(harness).toContain("mimetype: mimeType");
    expect(harness).toContain("waitForAck: false");
    expect(harness).toContain("outbound_composer_media_accepted");
  });

  it("keeps a direct-start endpoint transport-only unless staff explicitly request a CRM link", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/operationalInbox.ts"), "utf8");
    expect(source).toContain("linkRecord: boolean");
    expect(source).toContain("input.linkRecord");
    expect(source).toContain("No CRM or clinical record was created automatically.");
    expect(source).not.toContain("createPatient(");
    expect(source).not.toContain("createTreatmentCase(");
    expect(source).not.toContain("createMedical");
    expect(source).not.toContain("createMrn");
  });

  it("records only human-readable activity, tags, and explicit shared-case relationships", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/operationalInbox.ts"), "utf8");
    const schema = fs.readFileSync(path.join(process.cwd(), "drizzle/schema.ts"), "utf8");
    expect(source).toContain("whatsappConversationActivities");
    expect(source).toContain("whatsappConversationTags");
    expect(schema).toContain('"translator"');
    expect(source).toContain("unlinkInboxConversationCase");
    expect(source).toContain("unlinkInboxConversationRecord");
  });

  it("never exposes raw media locations and forces automatic clinical creation policies off", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/operationalInbox.ts"), "utf8");
    const mediaSource = fs.readFileSync(path.join(process.cwd(), "server/communicationMedia.ts"), "utf8");
    expect(source).toContain("requestAuthorizedMediaAccess");
    expect(mediaSource).toContain("getAuthorizedMediaBytes");
    expect(source).toContain("automaticPatient: false");
    expect(source).toContain("automaticMrn: false");
    expect(source).toContain("automaticClinicalRecord: false");
    expect(source).not.toContain("storagePath");
  });
});
