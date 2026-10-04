import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildWppConnectServerWebhookUrl,
  classifyWppConnectServerSource,
  normalizeWppConnectServerWebhook,
  ownershipFromRuntime,
  preflightWppConnectServerProvider,
  signWppConnectServerWebhookBinding,
  validateWppConnectServerOwnership,
  verifyWppConnectServerWebhookBinding,
  wppConnectServerEventKey,
  wppConnectServerRequiredSecretNames,
  wppConnectServerTestHelpers,
} from "./wppConnectServerAdapter";

const ownership = {
  lineId: 150001,
  providerLineId: "wppconnect-line-150001",
  sessionId: "180001",
  runtimeGeneration: "generation-150001-a",
  sessionName: "fertiliv-server-150001",
};

const privatePayload = {
  session: ownership.sessionName,
  data: {
    id: { _serialized: "provider-message-150001", fromMe: false, remote: "201100791315@c.us" },
    from: "201100791315@c.us",
    to: "201199999999@c.us",
    body: "controlled private text",
    timestamp: 1_790_541_000,
    type: "chat",
  },
};

describe("WPPConnect Server transport adapter", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("classifies private events before body/media mapping and rejects non-private categories", () => {
    expect(classifyWppConnectServerSource(privatePayload.data)).toMatchObject({ sourceKind: "private_chat" });
    expect(classifyWppConnectServerSource({ ...privatePayload.data, isStatus: true })).toMatchObject({ sourceKind: "status" });
    expect(classifyWppConnectServerSource({ ...privatePayload.data, chatId: "x@g.us" })).toMatchObject({ sourceKind: "group" });
    expect(classifyWppConnectServerSource({ ...privatePayload.data, chatId: "status@broadcast" })).toMatchObject({ sourceKind: "status" });
    expect(classifyWppConnectServerSource({ ...privatePayload.data, isChannel: true })).toMatchObject({ sourceKind: "channel" });
    expect(classifyWppConnectServerSource({ type: "system" })).toMatchObject({ sourceKind: "system" });
  });

  it("normalizes only a private event to the existing canonical provider-event contract", () => {
    const normalized = normalizeWppConnectServerWebhook({ payload: privatePayload, ownership });
    expect(normalized).toMatchObject({
      kind: "event",
      event: {
        providerMessageId: "provider-message-150001",
        senderEndpointId: "201100791315",
        lineProviderId: ownership.providerLineId,
        sourceKind: "private_chat",
        direction: "inbound",
        origin: "wppconnect_server",
      },
    });
    expect(normalized.kind === "event" && normalized.event.synthetic).toBeUndefined();
  });

  it("rejects session mismatch before canonical persistence and isolates status events", () => {
    expect(normalizeWppConnectServerWebhook({
      payload: { ...privatePayload, session: "other-session" },
      ownership,
    })).toEqual({ kind: "rejected", reason: "session_mismatch" });
    expect(normalizeWppConnectServerWebhook({
      payload: { ...privatePayload, data: { ...privatePayload.data, isBroadcast: true } },
      ownership,
    })).toMatchObject({ kind: "ignored", sourceKind: "broadcast" });
  });

  it("preserves canonical media metadata and passes bytes only to the existing custody path", () => {
    const normalized = normalizeWppConnectServerWebhook({
      ownership,
      payload: {
        ...privatePayload,
        data: {
          ...privatePayload.data,
          type: "image",
          mimetype: "image/jpeg",
          filename: "scan.jpg",
          caption: "caption",
          base64: Buffer.from("tiny-image", "utf8").toString("base64"),
        },
      },
    });
    expect(normalized).toMatchObject({
      kind: "event",
      event: {
        media: { mediaType: "image", mimeType: "image/jpeg", filename: "scan.jpg", caption: "caption" },
      },
    });
  });

  it("requires all four durable ownership dimensions and derives them from a current runtime binding", () => {
    expect(validateWppConnectServerOwnership(ownership)).toBe(true);
    expect(validateWppConnectServerOwnership({ ...ownership, providerLineId: "wppconnect-line-120002" })).toBe(false);
    expect(validateWppConnectServerOwnership({ ...ownership, sessionId: "" })).toBe(false);
    expect(ownershipFromRuntime({
      lineId: ownership.lineId,
      providerLineId: ownership.providerLineId,
      runtime: {
        slot: "wpp-server-150001",
        endpointUrl: "https://worker.example.test",
        endpointHost: "worker.example.test",
        mode: "persistent_worker",
        sessionId: ownership.sessionId,
        sessionName: ownership.sessionName,
        generation: ownership.runtimeGeneration,
        profileRef: "isolated-profile",
      },
    })).toEqual(ownership);
  });

  it("signs an opaque callback binding and rejects any tampering", () => {
    const secret = "test-webhook-secret-at-least-16";
    const signed = signWppConnectServerWebhookBinding(ownership, secret);
    expect(verifyWppConnectServerWebhookBinding(signed, secret)).toEqual(ownership);
    expect(verifyWppConnectServerWebhookBinding(`${signed}x`, secret)).toBeNull();
    expect(buildWppConnectServerWebhookUrl({
      webhookUrl: "https://pro.fertiliv.com/api/internal/wppconnect-server-event",
      ownership,
      secret,
    })).toContain("binding=");
  });

  it("keeps provider event identities line-scoped and supports only declared secret names", () => {
    expect(wppConnectServerEventKey(150001, "same-id")).not.toBe(wppConnectServerEventKey(150002, "same-id"));
    expect(wppConnectServerRequiredSecretNames()).toEqual([
      "WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SERVER_ADAPTER",
      "WPPCONNECT_BASE_URL",
      "WPPCONNECT_SECRET_KEY",
      "WPPCONNECT_WEBHOOK_URL",
      "WPPCONNECT_WEBHOOK_SECRET",
    ]);
  });

  it("uses JWT-only WPPConnect Server token response values and fails closed on session mismatch", () => {
    expect(wppConnectServerTestHelpers.generatedWppConnectServerToken({ session: ownership.sessionName, token: "server-token" }, ownership.sessionName)).toBe("server-token");
    expect(() => wppConnectServerTestHelpers.generatedWppConnectServerToken({ session: "other", token: "server-token" }, ownership.sessionName)).toThrow("different session");
  });

  it("reports provider_not_configured without network access while the transport remains disabled", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SERVER_ADAPTER", "false");
    vi.stubEnv("WPPCONNECT_BASE_URL", "");
    vi.stubEnv("WPPCONNECT_SECRET_KEY", "");
    vi.stubEnv("WPPCONNECT_WEBHOOK_URL", "");
    vi.stubEnv("WPPCONNECT_WEBHOOK_SECRET", "");
    await expect(preflightWppConnectServerProvider()).resolves.toMatchObject({
      state: "provider_not_configured",
      transportEnabled: false,
      callbackRoute: "registered_but_disabled",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("selects WPPConnect Server only for the explicitly configured line and remains fail-closed otherwise", () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SERVER_ADAPTER", "true");
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_WPPCONNECT_SERVER_LINE_ID", "300001");
    expect(wppConnectServerTestHelpers.isWppConnectServerControlledLine(300001)).toBe(true);
    expect(wppConnectServerTestHelpers.isWppConnectServerControlledLine(120002)).toBe(false);
    expect(wppConnectServerTestHelpers.isWppConnectServerControlledLine(150001)).toBe(false);
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SERVER_ADAPTER", "false");
    expect(wppConnectServerTestHelpers.isWppConnectServerControlledLine(300001)).toBe(false);
  });

  it("accepts only bounded QR data in memory and never returns an arbitrary provider field", () => {
    const png = Buffer.from("qr", "utf8").toString("base64");
    expect(wppConnectServerTestHelpers.qrDataUrlFromProviderPayload({ response: { qr: png } }))
      .toBe(`data:image/png;base64,${png}`);
    expect(wppConnectServerTestHelpers.qrDataUrlFromProviderPayload({ response: { qr: "not base64 !!" } }))
      .toBeNull();
  });

  it("projects host-device identity only as a masked account hint", () => {
    expect(wppConnectServerTestHelpers.hostDeviceIdentityFromPayload({
      response: { phoneNumber: "201100791315@c.us", pushname: "Test device", platform: "android" },
    })).toEqual({ accountHint: "20••••15", pushname: "Test device", platform: "android" });
    expect(wppConnectServerTestHelpers.hostDeviceIdentityFromPayload({
      response: { phoneNumber: "bad", pushname: "x".repeat(129), platform: "x".repeat(65) },
    })).toEqual({ accountHint: null, pushname: null, platform: null });
  });

  it("maps invalid configuration, unreachable provider, rejected auth, invalid contract, and ready provider to safe explicit states", async () => {
    vi.stubEnv("WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SERVER_ADAPTER", "false");
    vi.stubEnv("WPPCONNECT_BASE_URL", "https://provider.example.test");
    vi.stubEnv("WPPCONNECT_SECRET_KEY", "master-secret");
    vi.stubEnv("WPPCONNECT_WEBHOOK_URL", "https://pro.fertiliv.com/api/internal/wppconnect-server-event");
    vi.stubEnv("WPPCONNECT_WEBHOOK_SECRET", "webhook-secret-at-least-16");

    vi.stubEnv("WPPCONNECT_WEBHOOK_URL", "https://pro.fertiliv.com/not-the-ingress");
    await expect(preflightWppConnectServerProvider()).resolves.toMatchObject({ state: "provider_contract_invalid" });
    vi.stubEnv("WPPCONNECT_WEBHOOK_URL", "https://pro.fertiliv.com/api/internal/wppconnect-server-event");

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(preflightWppConnectServerProvider()).resolves.toMatchObject({ state: "provider_unreachable" });

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response("{}", { status: 401, headers: { "content-type": "application/json" } })));
    await expect(preflightWppConnectServerProvider()).resolves.toMatchObject({ state: "provider_auth_failed" });

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response("not-json", { status: 200, headers: { "content-type": "application/json" } })));
    await expect(preflightWppConnectServerProvider()).resolves.toMatchObject({ state: "provider_contract_invalid" });

    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response("{}", { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    await expect(preflightWppConnectServerProvider()).resolves.toMatchObject({
      state: "provider_ready",
      transportEnabled: false,
      callbackRoute: "registered_but_disabled",
    });
    expect(fetch.mock.calls.map(call => String(call[0]))).toEqual([
      "https://provider.example.test/healthz",
      "https://provider.example.test/api/master-secret/show-all-sessions",
    ]);
  });
});
