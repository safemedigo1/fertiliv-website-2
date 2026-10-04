import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("WPPConnect Server ingress contract", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "server/wppConnectServerIngress.ts"), "utf8");

  it("remains disabled unless the explicit adapter gate is enabled", () => {
    expect(source).toContain("isWppConnectServerIngressEnabled");
    expect(source).toContain("return res.sendStatus(404)");
  });

  it("verifies an opaque signed binding before parsing or retaining any event", () => {
    expect(source).toContain("verifyWppConnectServerWebhookBinding");
    expect(source).toContain('error: "invalid_wppconnect_server_binding"');
    expect(source).toContain("line.sessionName !== ownership.sessionName");
    expect(source).toContain("line.runtimeGeneration !== ownership.runtimeGeneration");
    expect(source).toContain('line.adapterKind !== "wppconnect_server"');
  });

  it("isolates non-private payloads before evidence, media, or Inbox persistence", () => {
    expect(source).toContain("normalizeWppConnectServerWebhook");
    expect(source).toContain('normalized.kind === "ignored"');
    expect(source).toContain('reason: "non_private_source"');
  });

  it("uses the existing canonical ingestion boundary and does not create a parallel model", () => {
    expect(source).toContain("ingestWppConnectServerEvent");
    expect(source).not.toContain("mysqlTable(");
    expect(source).not.toContain("insert(whatsappConversationMessages)");
    expect(source).not.toContain("createPatient(");
    expect(source).not.toContain("createLead(");
  });
});
