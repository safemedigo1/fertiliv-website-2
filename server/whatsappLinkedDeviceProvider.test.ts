import { afterEach, describe, expect, it, vi } from "vitest";
import { getWppConnectRuntimeSelection, wppConnectSandboxAdapter, WppConnectSandboxError } from "./whatsappLinkedDeviceProvider";
import { UNIFIED_INBOX_TEXT_LIMIT, UNIFIED_INBOX_TEXT_LIMIT_MESSAGE } from "../shared/unifiedInbox";

const WORKER_CONTRACT_VERSION = "wppconnect-worker-contract-v1";
const OUTBOUND_DIAGNOSTICS_VERSION = "wppconnect-outbound-diagnostics-v1";

function workerResponse(input: Record<string, unknown> = {}) {
  return {
    workerContractVersion: WORKER_CONTRACT_VERSION,
    outboundDiagnosticsVersion: OUTBOUND_DIAGNOSTICS_VERSION,
    correlationId: null,
    outboundAttemptId: null,
    stage: "provider_send",
    outcome: "accepted",
    ...input,
  };
}

describe("WPPConnect Linked Device sandbox adapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("defaults to disabled and remains explicitly not production approved", () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_ADAPTER", "false");
    expect(wppConnectSandboxAdapter.isSandboxIngressEnabled()).toBe(false);
    expect(wppConnectSandboxAdapter.productionApproved).toBe(false);
    expect(wppConnectSandboxAdapter.transportClassification).toBe("unofficial_whatsapp_web_puppeteer");
  });

  it("allows the explicitly enabled Settings test flow in a hosted runtime without enabling ingress", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_ADAPTER", "false");

    expect(wppConnectSandboxAdapter.isSandboxUiEnabled()).toBe(true);
    expect(wppConnectSandboxAdapter.isSandboxIngressEnabled()).toBe(false);
    expect(wppConnectSandboxAdapter.productionApproved).toBe(false);
  });

  it("reports the selected in-app runtime as safe endpoint metadata without secret values", () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED", "false");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_INAPP_SANDBOX_URL", "https://8899-example.manus.computer");
    const selection = getWppConnectRuntimeSelection("inapp");
    expect(selection).toEqual({
      slot: "linked-device-default",
      endpointHost: "8899-example.manus.computer",
      runtimeMode: "sandbox",
      gateValue: false,
      secretSelector: "jwt_secret",
      sessionId: null,
      sessionName: null,
      runtimeGeneration: null,
    });
    expect(JSON.stringify(selection)).not.toContain("JWT_SECRET");
  });

  it("maps only explicitly synthetic, bounded test evidence into the existing normalized-message shape", () => {
    const value = wppConnectSandboxAdapter.toNormalizedSandboxValue({
      providerMessageId: "synthetic-message-1",
      senderEndpointId: "15550001111",
      lineProviderId: "wppconnect-line-7",
      timestamp: new Date("2026-09-24T09:00:00Z"),
      text: "synthetic inbound test",
      synthetic: true,
    });
    expect(value).toMatchObject({
      messages: [{
        id: "synthetic-message-1",
        from: "15550001111",
        to: "wppconnect-line-7",
        type: "text",
        text: { body: "synthetic inbound test" },
      }],
    });
    expect(JSON.stringify(value)).not.toMatch(/token|credential|qr|cookie/i);
  });

  it("carries the source-first private_chat classification as bounded provider metadata", () => {
    const value = wppConnectSandboxAdapter.toNormalizedSandboxValue({
      providerMessageId: "private-classified-message-1",
      senderEndpointId: "256388240506885@lid",
      lineProviderId: "wppconnect-line-30001",
      sourceKind: "private_chat",
      timestamp: new Date("2026-09-26T08:00:00Z"),
      text: "private synthetic inbound",
      synthetic: true,
    }) as { messages: Array<Record<string, unknown>> };
    expect(value.messages[0]).toMatchObject({
      from: "256388240506885@lid",
      wppconnect_source_kind: "private_chat",
    });
    expect(JSON.stringify(value)).not.toMatch(/qr|cookie|token|credential/i);
  });

  it("keeps the remote endpoint as the correlation anchor for a synthetic outbound echo", () => {
    const value = wppConnectSandboxAdapter.toNormalizedSandboxValue({
      providerMessageId: "synthetic-outbound-1",
      senderEndpointId: "15550001111",
      lineProviderId: "wppconnect-line-7",
      timestamp: new Date("2026-09-24T09:00:00Z"),
      text: "synthetic outbound test",
      direction: "outbound",
      synthetic: true,
    }) as { messages: Array<Record<string, unknown>> };
    expect(value.messages[0]).toMatchObject({
      from: "15550001111",
      to: "wppconnect-line-7",
      wppconnect_synthetic_direction: "outbound_echo",
    });
  });

  it("retains a bounded provider peer identity as evidence without replacing the canonical endpoint", () => {
    const value = wppConnectSandboxAdapter.toNormalizedSandboxValue({
      providerMessageId: "synthetic-peer-identity-1",
      senderEndpointId: "905525026000",
      providerIdentityId: "209405962395656@lid",
      lineProviderId: "wppconnect-line-30001",
      timestamp: new Date("2026-09-25T11:04:00Z"),
      text: "Synthetic direct-start test",
      direction: "outbound",
      synthetic: true,
    }) as { messages: Array<Record<string, unknown>> };
    expect(value.messages[0]).toMatchObject({
      from: "905525026000",
      wppconnect_provider_identity: "209405962395656@lid",
      wppconnect_synthetic_direction: "outbound_echo",
    });
  });

  it("normalizes synthetic media metadata without embedding binary content in evidence", () => {
    const value = wppConnectSandboxAdapter.toNormalizedSandboxValue({
      providerMessageId: "synthetic-image-1",
      senderEndpointId: "905525026000",
      lineProviderId: "wppconnect-line-30001",
      timestamp: new Date("2026-09-25T12:00:00Z"),
      text: "Image caption",
      media: {
        providerMediaId: "media-1",
        mediaType: "image",
        mimeType: "image/png",
        filename: "test.png",
        sha256: "a".repeat(64),
        caption: "Image caption",
      },
      syntheticMediaBase64: "iVBORw0KGgo=",
      synthetic: true,
    }) as { messages: Array<Record<string, unknown>> };
    expect(value.messages[0]).toMatchObject({
      type: "image",
      image: { id: "media-1", mime_type: "image/png", filename: "test.png" },
    });
    expect(JSON.stringify(value)).not.toContain("iVBORw0KGgo=");
  });

  it("derives a deterministic provider-event key without embedding a phone number or message content", () => {
    const key = wppConnectSandboxAdapter.eventKey(7, {
      providerMessageId: "synthetic-message-1",
      senderEndpointId: "15550001111",
      lineProviderId: "wppconnect-line-7",
      timestamp: new Date("2026-09-24T09:00:00Z"),
      text: "synthetic inbound test",
      synthetic: true,
    });
    expect(key).toMatch(/^[a-f0-9]{64}$/);
    expect(key).not.toContain("1555");
    expect(key).not.toContain("synthetic inbound");
  });

  it("maps connected sandbox health and proxies only a validated PNG when QR is requested", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    const png = Buffer.alloc(40);
    png.writeUInt32BE(0x89504e47, 0);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        sessionName: "synthetic-session",
        phase: "waiting_for_qr",
        status: "QR_READY",
        connectionState: "OPENING",
        qrDataUrl: "/qr.png?v=1",
        qrUpdatedAt: "2026-09-24T10:00:00.000Z",
        identity: null,
        lastInbound: null,
        lastOutbound: null,
        events: [{ at: "2026-09-24T10:00:01.000Z" }],
        error: null,
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(png, { status: 200, headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await wppConnectSandboxAdapter.getSandboxStatus({ includeQr: true });

    expect(result).toMatchObject({
      available: true,
      status: "QR_READY",
      qrAvailable: true,
      qrUpdatedAt: "2026-09-24T10:00:00.000Z",
      lastActivityAt: "2026-09-24T10:00:01.000Z",
    });
    expect(result.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toMatch(/token|credential|cookie/i);
  });

  it("does not treat a connected label as outbound-ready until the harness has verified its live client", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      sessionName: "fertiliv-inapp-wppconnect",
      phase: "connected",
      status: "CONNECTED",
      connectionState: "CONNECTED",
      outboundReady: false,
      qrDataUrl: null,
      identity: null,
      lastInbound: null,
      lastOutbound: null,
      events: [],
      error: null,
    }), { status: 200 })));

    const result = await wppConnectSandboxAdapter.getSandboxStatus({ target: "inapp" });

    expect(result).toMatchObject({ status: "CONNECTED", outboundReady: false });
  });

  it("validates the explicitly configured hosted Settings endpoint while keeping production ingress disabled", async () => {
    const endpoint = process.env.WHATSAPP_LINKED_DEVICE_INAPP_SANDBOX_URL;
    if (!endpoint) return;

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_ADAPTER", "false");

    const result = await wppConnectSandboxAdapter.getSandboxStatus({ includeQr: true, target: "inapp" });

    expect(result.enabled).toBe(true);
    expect(wppConnectSandboxAdapter.productionApproved).toBe(false);
    expect(wppConnectSandboxAdapter.isSandboxIngressEnabled()).toBe(false);
    if (!result.available) return;
    expect(["QR_READY", "CONNECTED"]).toContain(result.status);
    if (result.status === "QR_READY") {
      expect(result.qrAvailable).toBe(true);
      expect(result.qrDataUrl).toMatch(/^data:image\/png;base64,/);
    } else {
      expect(result.qrAvailable).toBe(false);
      expect(result.qrDataUrl).toBeNull();
    }
    expect(wppConnectSandboxAdapter.productionApproved).toBe(false);
    expect(wppConnectSandboxAdapter.isSandboxIngressEnabled()).toBe(false);
  });

  it("uses the provider-neutral persistent worker URL and Bearer auth only behind its explicit feature gate", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_WORKER_URL", "https://pc-6jt59eqdkstr.manus.host");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_WORKER_API_SECRET", "s".repeat(32));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      sessionName: "fertiliv-inapp-wppconnect",
      phase: "connected",
      status: "CONNECTED",
      connectionState: "CONNECTED",
      outboundReady: true,
      qrDataUrl: null,
      identity: null,
      lastInbound: null,
      lastOutbound: null,
      events: [],
      error: null,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(wppConnectSandboxAdapter.getSandboxStatus({ target: "inapp" })).resolves.toMatchObject({ available: true, status: "CONNECTED", outboundReady: true });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://pc-6jt59eqdkstr.manus.host/state");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: `Bearer ${"s".repeat(32)}` });
  });

  it("fails closed when persistent-worker routing is enabled without a strong API secret", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_WORKER_URL", "https://pc-6jt59eqdkstr.manus.host");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_WORKER_API_SECRET", "missing");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(wppConnectSandboxAdapter.getSandboxStatus({ target: "inapp" })).resolves.toMatchObject({ available: false, status: "UNAVAILABLE" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not forward a configured persistent-worker secret to the unchanged sandbox while the gate is off", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED", "false");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_INAPP_SANDBOX_URL", "http://127.0.0.1:8899");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_WORKER_API_SECRET", "s".repeat(32));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      sessionName: "fertiliv-inapp-wppconnect",
      phase: "connected",
      status: "CONNECTED",
      connectionState: "CONNECTED",
      outboundReady: true,
      qrDataUrl: null,
      identity: null,
      lastInbound: null,
      lastOutbound: null,
      events: [],
      error: null,
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await wppConnectSandboxAdapter.getSandboxStatus({ target: "inapp" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8899/state");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("authorization");
  });

  it("validates the explicitly enabled synthetic ingress flag against the in-app test endpoint", async () => {
    const endpoint = process.env.WHATSAPP_LINKED_DEVICE_INAPP_SANDBOX_URL;
    if (!endpoint) return;

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_ADAPTER", "true");

    const result = await wppConnectSandboxAdapter.getSandboxStatus({ target: "inapp" });

    expect(result.enabled).toBe(true);
    if (!result.available) {
      expect(result.status).toBe("UNAVAILABLE");
    } else {
      expect(["CONNECTED", "QR_READY", "LOGGED_OUT", "DISCONNECTED"]).toContain(result.status);
    }
    expect(wppConnectSandboxAdapter.isSandboxIngressEnabled()).toBe(true);
    expect(wppConnectSandboxAdapter.productionApproved).toBe(false);
  });

  it("validates the explicit synthetic composer flag through its lightweight test-only endpoint", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_ADAPTER", "false");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(workerResponse({
      ok: true,
      message: { id: "synthetic-composer-message-1", timestamp: 1780000000, type: "chat" },
    })), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await wppConnectSandboxAdapter.sendSandboxText({
      text: "Fertiliv synthetic Inbox test",
      recipient: "+905011147060",
      approvalProof: "test-server-issued-proof",
      target: "inapp",
    });

    expect(result).toMatchObject({ providerMessageId: "synthetic-composer-message-1", messageType: "chat", replayed: false });
    expect(wppConnectSandboxAdapter.isSandboxComposerEnabled()).toBe(true);
    expect(wppConnectSandboxAdapter.isSandboxIngressEnabled()).toBe(false);
    expect(wppConnectSandboxAdapter.productionApproved).toBe(false);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/send-synthetic-text");
  });

  it("supports only the feature-gated in-app sandbox logout operation", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(wppConnectSandboxAdapter.logoutSandbox({ target: "inapp" })).resolves.toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/logout");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails logout closed when the sandbox control flag is disabled", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "false");
    await expect(wppConnectSandboxAdapter.logoutSandbox({ target: "inapp" })).rejects.toMatchObject({ category: "feature_disabled" });
  });

  it("passes only a normalized direct recipient to the in-app synthetic harness", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(workerResponse({
      ok: true,
      correlationId: "wpp-correlation-1001",
      outboundAttemptId: 550001,
      message: { id: "synthetic-direct-message-1", timestamp: 1780000000, type: "chat", peerIdentityId: "209405962395656@lid" },
    })), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await wppConnectSandboxAdapter.sendSandboxText({
      text: "Synthetic direct-start test",
      recipient: "+90 (501) 114-7060",
      approvalProof: "test-server-issued-proof",
      idempotencyKey: "inbox-test-key-1",
      intentDigest: "a".repeat(64),
      correlationId: "wpp-correlation-1001",
      outboundAttemptId: 550001,
      target: "inapp",
    });

    const request = fetchMock.mock.calls[0]?.[1] as { body?: string } | undefined;
    expect(JSON.parse(request?.body ?? "{}")).toMatchObject({
      text: "Synthetic direct-start test",
      recipient: "905011147060",
      approvalProof: "test-server-issued-proof",
      idempotencyKey: "inbox-test-key-1",
      intentDigest: "a".repeat(64),
      correlationId: "wpp-correlation-1001",
      outboundAttemptId: 550001,
    });
    expect(result.peerIdentityId).toBe("209405962395656@lid");
    expect(result.correlationId).toBe("wpp-correlation-1001");
    expect(wppConnectSandboxAdapter.productionApproved).toBe(false);
  });

  it("rejects direct recipients for diagnostic sessions before contacting a harness", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const error = await wppConnectSandboxAdapter.sendSandboxText({
      text: "Synthetic direct-start test",
      recipient: "+905011147060",
      approvalProof: "test-server-issued-proof",
      target: "diagnostic",
    }).catch((value) => value);
    expect(error).toBeInstanceOf(WppConnectSandboxError);
    expect(error.category).toBe("sending_line_unavailable");
    expect(error.message).toContain("connected in-app synthetic test line");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects legacy or generic text responses as contract mismatches", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "This number is not authorized for the controlled synthetic test." }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "Connected synthetic session is required." }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: "unexpected harness failure" }), { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const recipientError = await wppConnectSandboxAdapter.sendSandboxText({ text: "test", recipient: "+905011147060", approvalProof: "test-server-issued-proof", target: "inapp" }).catch((value) => value);
    const sessionError = await wppConnectSandboxAdapter.sendSandboxText({ text: "test", recipient: "+905011147060", approvalProof: "test-server-issued-proof", target: "inapp" }).catch((value) => value);
    const providerError = await wppConnectSandboxAdapter.sendSandboxText({ text: "test", recipient: "+905011147060", approvalProof: "test-server-issued-proof", target: "inapp" }).catch((value) => value);
    expect(recipientError).toMatchObject({ category: "worker_response_contract_mismatch" });
    expect(sessionError).toMatchObject({ category: "worker_response_contract_mismatch" });
    expect(providerError).toMatchObject({ category: "worker_response_contract_mismatch" });
    expect(recipientError.message).toBe("Message not sent. The WhatsApp worker response could not be verified.");
  });

  it("prefers structured boundary codes and keeps only safe diagnostic fields", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(workerResponse({
        ok: false,
        errorCode: "wpp_probe_timeout",
        stage: "readiness_probe",
        outcome: "timeout",
        error: "safe text that must not control classification",
        diagnostic: { stage: "readiness_probe", probe: "getConnectionState", outcome: "timeout", timestamp: "2026-09-25T20:49:14.000Z", recipient: "+905525026000" },
      })), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(workerResponse({
        ok: false,
        errorCode: "wpp_send_uncertain_after_provider_call",
        stage: "provider_send",
        outcome: "exception",
        diagnostic: { stage: "provider_send", probe: "sendText", outcome: "exception", timestamp: "2026-09-25T20:49:15.000Z", body: "must not cross" },
      })), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    const timeoutError = await wppConnectSandboxAdapter.sendSandboxText({ text: "test", recipient: "+905011147060", approvalProof: "proof", target: "inapp" }).catch((value) => value);
    const uncertainError = await wppConnectSandboxAdapter.sendSandboxText({ text: "test", recipient: "+905011147060", approvalProof: "proof", target: "inapp" }).catch((value) => value);
    expect(timeoutError).toMatchObject({ category: "wpp_probe_timeout", diagnostic: { stage: "readiness_probe", probe: "getConnectionState", outcome: "timeout", timestamp: "2026-09-25T20:49:14.000Z" } });
    expect(timeoutError.diagnostic).not.toHaveProperty("recipient");
    expect(uncertainError).toMatchObject({ category: "wpp_send_uncertain_after_provider_call", diagnostic: { stage: "provider_send", probe: "sendText", outcome: "exception" } });
    expect(uncertainError.diagnostic).not.toHaveProperty("body");
  });

  it("preserves validated correlation and attempt identity for structured readiness rejection", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(workerResponse({
      ok: false,
      correlationId: "wpp-correlation-9201",
      outboundAttemptId: 920001,
      stage: "readiness_probe",
      outcome: "not_ready",
      errorCode: "wpp_probe_not_ready",
      diagnostic: { stage: "readiness_probe", probe: "connection_state", outcome: "not_ready", timestamp: "2026-09-26T10:00:00.000Z" },
    })), { status: 409 })));

    const error = await wppConnectSandboxAdapter.sendSandboxText({
      text: "test",
      recipient: "+905011147060",
      approvalProof: "proof",
      correlationId: "wpp-correlation-9201",
      outboundAttemptId: 920001,
      target: "inapp",
    }).catch((value) => value);
    expect(error).toMatchObject({
      category: "wpp_probe_not_ready",
      diagnostic: { correlationId: "wpp-correlation-9201", outboundAttemptId: 920001, stage: "readiness_probe", outcome: "not_ready" },
    });
  });

  it("rejects missing or mismatched correlation and versions before any provider boundary", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(workerResponse({ ok: true, message: { id: "legacy-success", timestamp: 1780000000, type: "chat" } })), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(workerResponse({ ok: true, correlationId: "wpp-other", outboundAttemptId: 900002, message: { id: "wrong-correlation", timestamp: 1780000000, type: "chat" } })), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(workerResponse({ ok: true, workerContractVersion: "wppconnect-worker-contract-v0", message: { id: "wrong-version", timestamp: 1780000000, type: "chat" } })), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const base = { text: "test", recipient: "+905011147060", approvalProof: "proof", target: "inapp" as const, correlationId: "wpp-correlation-9001", outboundAttemptId: 900001 };
    const missing = await wppConnectSandboxAdapter.sendSandboxText(base).catch((value) => value);
    const mismatched = await wppConnectSandboxAdapter.sendSandboxText(base).catch((value) => value);
    const wrongVersion = await wppConnectSandboxAdapter.sendSandboxText(base).catch((value) => value);
    expect(missing).toMatchObject({ category: "worker_response_contract_mismatch" });
    expect(mismatched).toMatchObject({ category: "worker_response_contract_mismatch" });
    expect(wrongVersion).toMatchObject({ category: "worker_response_contract_mismatch" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("maps a structured approval-proof rejection to its dedicated safe category without proof leakage", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(workerResponse({
      ok: false,
      errorCode: "wpp_recipient_proof_rejected",
      correlationId: "wpp-correlation-9301",
      outboundAttemptId: 930001,
      stage: "recipient_approval",
      outcome: "rejected",
      rejectionReason: "signature_mismatch",
      approvalReason: "approval_proof_signature_invalid",
      diagnostic: { stage: "recipient_approval", probe: "approvalProof", outcome: "rejected", timestamp: "2026-09-25T21:53:00.000Z", approvalProof: "never expose" },
    })), { status: 409 })));

    const error = await wppConnectSandboxAdapter.sendSandboxText({ text: "test", recipient: "+905011147060", approvalProof: "proof", correlationId: "wpp-correlation-9301", outboundAttemptId: 930001, target: "inapp" }).catch((value) => value);
    expect(error).toMatchObject({
      category: "wpp_recipient_proof_rejected",
      diagnostic: { stage: "recipient_approval", probe: "approval_proof_signature_invalid", outcome: "rejected", correlationId: "wpp-correlation-9301", outboundAttemptId: 930001 },
    });
    expect(error.diagnostic).not.toHaveProperty("approvalProof");
    expect(JSON.stringify(error)).not.toContain("never expose");
  });

  it("rejects missing proof locally and classifies malformed proof from the harness", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(workerResponse({
      ok: false,
      errorCode: "wpp_recipient_proof_rejected",
      rejectionReason: "malformed",
      approvalReason: "approval_proof_malformed",
      stage: "recipient_approval",
      outcome: "rejected",
    })), { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    const missing = await wppConnectSandboxAdapter.sendSandboxText({ text: "test", recipient: "+905011147060", target: "inapp" }).catch((value) => value);
    const malformed = await wppConnectSandboxAdapter.sendSandboxText({ text: "test", recipient: "+905011147060", approvalProof: "not-a-proof", target: "inapp" }).catch((value) => value);

    expect(missing).toMatchObject({ category: "wpp_recipient_proof_rejected", diagnostic: { probe: "approval_proof_missing", outcome: "rejected" } });
    expect(malformed).toMatchObject({ category: "wpp_recipient_proof_rejected", diagnostic: { probe: "approval_proof_malformed", outcome: "rejected" } });
    expect(missing.message).toBe("Message not sent. Recipient authorization could not be verified.");
    expect(malformed.message).toBe("Message not sent. Recipient authorization could not be verified.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(missing)).not.toMatch(/905011147060|not-a-proof/i);
    expect(JSON.stringify(malformed)).not.toMatch(/not-a-proof|905011147060/i);
  });

  it("preserves each safe approval reason from the worker without exposing proof or scope values", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    const reasons = ["missing", "malformed", "signature_mismatch", "expired", "recipient_mismatch", "line_mismatch", "session_mismatch", "scope_mismatch", "unsupported_version", "other_safe_rejection"] as const;
    const reasonCodes = ["approval_proof_missing", "approval_proof_malformed", "approval_proof_signature_invalid", "approval_proof_expired", "approval_proof_recipient_mismatch", "approval_proof_line_mismatch", "approval_proof_session_mismatch", "approval_proof_scope_mismatch", "approval_proof_version_mismatch", "approval_proof_rejected"] as const;
    let reasonIndex = 0;
    vi.stubGlobal("fetch", vi.fn(() => {
      const index = reasonIndex++;
      return Promise.resolve(new Response(JSON.stringify({
        ok: false,
        errorCode: "wpp_recipient_proof_rejected",
        approvalReason: reasonCodes[index],
        rejectionReason: reasons[index],
        workerContractVersion: WORKER_CONTRACT_VERSION,
        outboundDiagnosticsVersion: OUTBOUND_DIAGNOSTICS_VERSION,
        correlationId: null,
        outboundAttemptId: null,
        stage: "recipient_approval",
        outcome: "rejected",
        diagnostic: { stage: "recipient_approval", probe: "approvalProof", outcome: "rejected", timestamp: "2026-09-26T10:00:00.000Z", approvalProof: "must-not-cross" },
      }), { status: 409 }));
    }));

    const expected = ["approval_proof_missing", "approval_proof_malformed", "approval_proof_signature_invalid", "approval_proof_expired", "approval_proof_recipient_mismatch", "approval_proof_line_mismatch", "approval_proof_session_mismatch", "approval_proof_scope_mismatch", "approval_proof_version_mismatch", "approval_proof_rejected"];
    for (const probe of expected) {
      const error = await wppConnectSandboxAdapter.sendSandboxText({ text: "test", recipient: "+905011147060", approvalProof: "a.b", target: "inapp" }).catch((value) => value);
      expect(error).toMatchObject({ category: "wpp_recipient_proof_rejected", diagnostic: { probe, outcome: "rejected" } });
      expect(error.message).toBe("Message not sent. Recipient authorization could not be verified.");
      expect(JSON.stringify(error)).not.toMatch(/must-not-cross|905011147060/i);
    }
  });

  it("does not contact the harness for a direct recipient without an application approval proof", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const error = await wppConnectSandboxAdapter.sendSandboxText({ text: "test", recipient: "+905011147060", target: "inapp" }).catch((value) => value);
    expect(error).toMatchObject({ category: "wpp_recipient_proof_rejected" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not contact the harness without an explicitly approved private recipient", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const error = await wppConnectSandboxAdapter.sendSandboxMedia({
      fileBase64: "aGVsbG8=",
      mimeType: "text/plain",
      filename: "safe.txt",
      target: "inapp",
    }).catch((value) => value);

    expect(error).toMatchObject({ category: "recipient_invalid" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("classifies transport loss as structured post-provider uncertainty so the client does not duplicate send", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket closed")));

    const error = await wppConnectSandboxAdapter.sendSandboxText({
      text: "test",
      recipient: "+905011147060",
      approvalProof: "test-server-issued-proof",
      target: "inapp",
    }).catch((value) => value);

    expect(error).toBeInstanceOf(WppConnectSandboxError);
    expect(error).toMatchObject({ category: "wpp_send_uncertain_after_provider_call", diagnostic: { stage: "provider_send", probe: "sendText", outcome: "transport_error" } });
    expect(error.message).toContain("Do not send the same message again yet");
  });

  it("returns replayed idempotency receipts without changing the provider message identity", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(workerResponse({
      ok: true,
      stage: "idempotency_replay",
      outcome: "replayed",
      replayed: true,
      message: { id: "synthetic-direct-message-1", timestamp: 1780000000, type: "chat" },
    })), { status: 200 })));

    const result = await wppConnectSandboxAdapter.sendSandboxText({
      text: "Synthetic direct-start test",
      recipient: "+905011147060",
      approvalProof: "test-server-issued-proof",
      idempotencyKey: "inbox-test-key-2",
      intentDigest: "b".repeat(64),
      target: "inapp",
    });

    expect(result).toMatchObject({ providerMessageId: "synthetic-direct-message-1", replayed: true });
  });

  it("rejects over-limit synthetic composer text without truncating it", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_UI", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SANDBOX_COMPOSER", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(wppConnectSandboxAdapter.sendSandboxText({
      text: "x".repeat(UNIFIED_INBOX_TEXT_LIMIT + 1),
      target: "inapp",
    })).rejects.toThrow(UNIFIED_INBOX_TEXT_LIMIT_MESSAGE);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
