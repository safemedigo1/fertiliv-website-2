import { createHmac } from "crypto";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

const { resolveInboundWhatsAppConnection, retainWhatsAppProviderEvents } = vi.hoisted(() => ({
  resolveInboundWhatsAppConnection: vi.fn(),
  retainWhatsAppProviderEvents: vi.fn(),
}));

vi.mock("./whatsappConnection", () => ({ resolveInboundWhatsAppConnection }));
vi.mock("./whatsappPhase1Store", () => ({ retainWhatsAppProviderEvents }));

import { registerWhatsAppWebhook } from "./whatsappWebhook";

type CapturedRoute = { path: string; handlers: Function[] };

function registeredWebhookRoutes() {
  const gets: CapturedRoute[] = [];
  const posts: CapturedRoute[] = [];
  const app = {
    get: (path: string, ...handlers: Function[]) => gets.push({ path, handlers }),
    post: (path: string, ...handlers: Function[]) => posts.push({ path, handlers }),
  } as any;
  registerWhatsAppWebhook(app);
  const post = posts.find((route) => route.path === "/api/whatsapp/webhook");
  if (!post) throw new Error("webhook post route not registered");
  return { get: gets[0]!, post };
}

function responseSpy() {
  const res: any = {};
  res.sendStatus = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

function signedRequest(payload: unknown, appSecret: string) {
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = `sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  return {
    body: rawBody,
    header: (name: string) => name.toLowerCase() === "x-hub-signature-256" ? signature : undefined,
  };
}

describe("WhatsApp Phase 1 hardened webhook ingress", () => {
  const originalSecret = process.env.WHATSAPP_APP_SECRET;
  const originalVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_APP_SECRET = "phase1-webhook-test-secret";
  });

  afterEach(() => {
    process.env.WHATSAPP_APP_SECRET = originalSecret;
    process.env.WHATSAPP_VERIFY_TOKEN = originalVerifyToken;
  });

  it("rejects unauthenticated payloads before any durable capture or identity side effect", async () => {
    const { post } = registeredWebhookRoutes();
    const handler = post.handlers.at(-1)!;
    const req = {
      body: Buffer.from('{"object":"whatsapp_business_account"}'),
      header: () => "sha256=" + "0".repeat(64),
    };
    const res = responseSpy();

    await handler(req, res);

    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(retainWhatsAppProviderEvents).not.toHaveBeenCalled();
    expect(resolveInboundWhatsAppConnection).not.toHaveBeenCalled();
  });

  it("captures an authenticated, resolved event without creating a patient, message, or conversation", async () => {
    const { post } = registeredWebhookRoutes();
    const handler = post.handlers.at(-1)!;
    resolveInboundWhatsAppConnection.mockResolvedValue({
      connection: { id: null, route: "legacy_env" },
      routingState: "legacy_env",
      failureCategory: null,
    });
    retainWhatsAppProviderEvents.mockResolvedValue({ batchId: 1, insertedEvents: 1, duplicateEvents: 0 });
    const req = signedRequest({
      object: "whatsapp_business_account",
      entry: [{ id: "waba-id", changes: [{ field: "messages", value: { metadata: { phone_number_id: "phone-id" }, messages: [{ id: "m1", from: "sender-1", timestamp: "1727090000", type: "text", text: { body: "synthetic webhook" } }] } }] }],
    }, process.env.WHATSAPP_APP_SECRET!);
    const res = responseSpy();

    await handler(req, res);

    expect(resolveInboundWhatsAppConnection).toHaveBeenCalledWith({ wabaId: "waba-id", phoneNumberId: "phone-id" });
    expect(retainWhatsAppProviderEvents).toHaveBeenCalledWith(expect.objectContaining({
      events: [expect.objectContaining({
        routingState: "legacy_env",
        processingState: "applied",
        connection: expect.objectContaining({ id: null, route: "legacy_env" }),
      })],
    }));
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  it("quarantines authenticated events that do not resolve to a known validated connection", async () => {
    const { post } = registeredWebhookRoutes();
    const handler = post.handlers.at(-1)!;
    resolveInboundWhatsAppConnection.mockResolvedValue({
      connection: null,
      routingState: "unmapped",
      failureCategory: "unmapped_connection",
    });
    retainWhatsAppProviderEvents.mockResolvedValue({ batchId: 1, insertedEvents: 1, duplicateEvents: 0 });
    const req = signedRequest({
      object: "whatsapp_business_account",
      entry: [{ id: "other-waba", changes: [{ field: "messages", value: { metadata: { phone_number_id: "unknown-phone" } } }] }],
    }, process.env.WHATSAPP_APP_SECRET!);
    const res = responseSpy();

    await handler(req, res);

    expect(retainWhatsAppProviderEvents).toHaveBeenCalledWith(expect.objectContaining({
      events: [expect.objectContaining({
        connection: null,
        routingState: "unmapped",
        processingState: "quarantined",
        failureCategory: "unmapped_connection",
      })],
    }));
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  it("retains an authenticated unsupported provider field in quarantine without extending processing", async () => {
    const { post } = registeredWebhookRoutes();
    const handler = post.handlers.at(-1)!;
    resolveInboundWhatsAppConnection.mockResolvedValue({
      connection: { id: 12, route: "persisted" },
      routingState: "resolved",
      failureCategory: null,
    });
    retainWhatsAppProviderEvents.mockResolvedValue({ batchId: 1, insertedEvents: 1, duplicateEvents: 0 });
    const req = signedRequest({
      object: "whatsapp_business_account",
      entry: [{ id: "waba-id", changes: [{ field: "account_update", value: { metadata: { phone_number_id: "phone-id" } } }] }],
    }, process.env.WHATSAPP_APP_SECRET!);
    const res = responseSpy();

    await handler(req, res);

    expect(retainWhatsAppProviderEvents).toHaveBeenCalledWith(expect.objectContaining({
      events: [expect.objectContaining({
        routingState: "unsupported",
        processingState: "quarantined",
        failureCategory: "unsupported_provider_field",
      })],
    }));
    expect(res.sendStatus).toHaveBeenCalledWith(200);
  });

  it("has no verification-token fallback when Meta configuration is absent", () => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    const { get } = registeredWebhookRoutes();
    const handler = get.handlers.at(-1)!;
    const res = responseSpy();

    handler({ query: { "hub.mode": "subscribe", "hub.verify_token": "anything" } }, res);

    expect(res.sendStatus).toHaveBeenCalledWith(503);
  });
});
