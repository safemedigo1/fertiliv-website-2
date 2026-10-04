import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("WPPConnect in-app synthetic ingress and alias correlation", () => {
  it("accepts only a signed active-session event and routes it through the existing evidence pipeline", () => {
    const ingress = fs.readFileSync(path.join(process.cwd(), "server/wppConnectSandboxIngress.ts"), "utf8");
    const core = fs.readFileSync(path.join(process.cwd(), "server/_core/createApp.ts"), "utf8");
    expect(ingress).toContain("line.sessionName !== sessionName");
    expect(ingress).toContain("line.sessionState");
    expect(ingress).toContain('x-fertiliv-sandbox-signature');
    expect(ingress).toContain('FERTILIV_WPPCONNECT_INGRESS_SECRET');
    expect(ingress).toContain('WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED');
    expect(ingress).toContain('process.env.JWT_SECRET');
    expect(ingress).toContain("timingSafeEqual");
    expect(ingress).toContain("ingestWppConnectSyntheticEvent");
    expect(ingress).toContain("source_classification_required");
    expect(ingress).toContain("non_private_source_rejected");
    expect(ingress).toContain("known_non_private_source_rejected");
    expect(ingress).toContain("sourceKind");
    expect(ingress).toContain('line.adapterKind !== "wppconnect_in_app_sandbox"');
    expect(core).toContain("registerWppConnectSandboxIngress(app)");
    expect(ingress).not.toMatch(/createPatient|createLead|createTreatment|createMedical|createMrn/i);
  });

  it("stores an exact provider identity alias separately from CRM identity and uses its canonical endpoint for WU-07 keys", () => {
    const schema = fs.readFileSync(path.join(process.cwd(), "drizzle/schema.ts"), "utf8");
    const endpointResolution = fs.readFileSync(path.join(process.cwd(), "server/whatsappEndpointResolution.ts"), "utf8");
    const conversationStore = fs.readFileSync(path.join(process.cwd(), "server/whatsappConversationStore.ts"), "utf8");
    expect(schema).toContain('pgTable("whatsapp_endpoint_aliases"');
    expect(schema).toContain('whatsapp_endpoint_aliases_identity_uq');
    expect(endpointResolution).toContain("findActiveEndpointAlias");
    expect(endpointResolution).toContain("persistProviderIdentityAlias");
    expect(endpointResolution).toContain("wppconnect_provider_identity");
    expect(conversationStore).toContain("canonicalEndpointId");
    expect(conversationStore).toContain("findEndpointIdentifierById");
    expect(endpointResolution).not.toMatch(/createPatient|createLead|createTreatment|createMedical|createMrn/i);
  });

  it("keeps the isolated harness bridge explicitly line-bound and does not record body or peer data in diagnostics", () => {
    const harnessPath = "/home/ubuntu/linked-device-poc/wppconnect/wppconnect-poc.cjs";
    if (!fs.existsSync(harnessPath)) return;
    const harness = fs.readFileSync(harnessPath, "utf8");
    expect(harness).toContain("async function forwardInboundToFertiliv");
    expect(harness).toContain("POC_INBOUND_BRIDGE_ENABLED");
    expect(harness).toContain("const lineId = Number(process.env.POC_LINE_ID || 0)");
    expect(harness).toContain("function stringMessageId(value)");
    expect(harness).toContain("wppconnect-inbound-");
    expect(harness).toContain("typeof raw?.content === 'string'");
    expect(harness).toContain("filename: media?.filename || 'attachment'");
    expect(harness).toContain("setTimeout(() => controller.abort(), 30000)");
    expect(harness).toContain("inbound_forwarded");
    expect(harness).toContain("inbound_forward_rejected");
    expect(harness).toContain("Never retain the endpoint, provider payload, or text in harness logs");
    expect(harness).toContain("x-fertiliv-sandbox-signature");
    expect(harness).toContain("classifyInboundSource");
    expect(harness).toContain("inbound_source_rejected");
    expect(harness).toContain("sourceKind: sourceClassification.sourceKind");
    expect(harness).toContain("if (sourceClassification.sourceKind !== 'private_chat')");
  });

  it("places source classification before media download and before the signed ingress call", () => {
    const harnessPath = "/home/ubuntu/linked-device-poc/wppconnect/wppconnect-poc.cjs";
    if (!fs.existsSync(harnessPath)) return;
    const harness = fs.readFileSync(harnessPath, "utf8");
    const classifyAt = harness.indexOf("const sourceClassification = classifyInboundSource(raw);");
    const downloadAt = harness.indexOf("inbound_media_download_attempt");
    const ingressAt = harness.indexOf("/api/internal/wppconnect-sandbox-event");
    expect(classifyAt).toBeGreaterThan(-1);
    expect(downloadAt).toBeGreaterThan(classifyAt);
    expect(ingressAt).toBeGreaterThan(classifyAt);
  });

  it("keeps the historical incident marker in the regression contract", () => {
    const classifierPath = "/home/ubuntu/linked-device-poc/wppconnect/inbound-source-classifier.cjs";
    const classifierTestPath = "/home/ubuntu/linked-device-poc/wppconnect/inbound-source-classifier.test.cjs";
    if (!fs.existsSync(classifierPath) || !fs.existsSync(classifierTestPath)) return;
    const classifier = fs.readFileSync(classifierPath, "utf8");
    const classifierTest = fs.readFileSync(classifierTestPath, "utf8");
    expect(classifier).toContain("status@broadcast");
    expect(classifierTest).toContain("false_status@broadcast_2AF9441BF2F048BD87EE401148A20E65_256388240506885@lid");
  });
});
