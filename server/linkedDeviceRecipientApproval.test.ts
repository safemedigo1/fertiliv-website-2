import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateSyntheticRecipientApproval } from "./linkedDeviceRecipientApproval";

const runtime = {
  slot: "isolated-150001",
  endpointUrl: "http://127.0.0.1:8900",
  endpointHost: "127.0.0.1:8900",
  mode: "sandbox" as const,
  sessionId: "180001",
  sessionName: "fertiliv-server-150001",
  generation: "generation-150001-a",
  profileRef: "profile",
};

function proof(overrides: Record<string, unknown> = {}, secret = "test-jwt-secret") {
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    recipientId: 51,
    lineId: 150001,
    endpoint: "201100791315",
    session: runtime.sessionName,
    exp: 1_900_000_000,
    ...overrides,
  })).toString("base64url");
  const signature = createHmac("sha256", `fertiliv-wppconnect-synthetic-recipient-v1:${secret}`).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

describe("shared Linked Device recipient approval validation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts a valid current proof before any provider path", () => {
    vi.stubEnv("JWT_SECRET", "test-jwt-secret");
    expect(validateSyntheticRecipientApproval({
      approvalProof: proof(), recipientId: 51, lineId: 150001, providerEndpointId: "201100791315", runtime, nowSeconds: 1_800_000_000,
    })).toEqual({ ok: true });
  });

  it.each([
    ["", "missing"],
    ["not-a-proof", "malformed"],
    [proof({}, "wrong-secret"), "signature_mismatch"],
    [proof({ exp: 1_700_000_000 }), "expired"],
    [proof({ endpoint: "201199999999" }), "recipient_mismatch"],
    [proof({ lineId: 150002 }), "line_mismatch"],
    [proof({ session: "other-session" }), "session_mismatch"],
    [proof({ v: 2 }), "unsupported_version"],
  ])("fails closed with a safe reason for %s", (approvalProof, reason) => {
    vi.stubEnv("JWT_SECRET", "test-jwt-secret");
    expect(validateSyntheticRecipientApproval({
      approvalProof, recipientId: 51, lineId: 150001, providerEndpointId: "201100791315", runtime, nowSeconds: 1_800_000_000,
    })).toEqual({ ok: false, reason });
  });
});
