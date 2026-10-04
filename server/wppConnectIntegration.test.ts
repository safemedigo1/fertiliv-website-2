import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyWppWebhookSecret, wppConnectTestHelpers } from "./wppConnectIntegration";

describe("WPPConnect selective CRM integration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("recognizes current connection-state response variants", () => {
    expect(wppConnectTestHelpers.connectedFromPayload({ status: true, message: "Connected" })).toBe(true);
    expect(wppConnectTestHelpers.connectedFromPayload({ response: { state: "CONNECTED" } })).toBe(true);
    expect(wppConnectTestHelpers.connectedFromPayload({ status: false, message: "Disconnected" })).toBe(false);
  });

  it("accepts QR data returned directly or inside the WPPConnect payload", () => {
    const qr = `data:image/png;base64,${"A".repeat(128)}`;
    expect(wppConnectTestHelpers.qrFromPayload(qr)).toBe(qr);
    expect(wppConnectTestHelpers.qrFromPayload({ qrcode: qr })).toBe(qr);
  });

  it("routes outbound echoes by their remote recipient and inbound by sender", () => {
    expect(wppConnectTestHelpers.messageChatId({ fromMe: true, from: "201111111111@c.us", to: "202222222222@c.us" })).toBe("202222222222@c.us");
    expect(wppConnectTestHelpers.messageChatId({ fromMe: false, from: "203333333333@c.us", to: "201111111111@c.us" })).toBe("203333333333@c.us");
  });

  it("keeps identical provider message IDs isolated by connection", () => {
    const message = { id: { _serialized: "same-provider-id", fromMe: false }, from: "201000000001@c.us", body: "hello", timestamp: 1_800_000_000 };
    const first = wppConnectTestHelpers.messageRecord(message, 10, 100, 1);
    const second = wppConnectTestHelpers.messageRecord(message, 11, 101, 2);
    expect(first).toMatchObject({ lineId: 10, ownerUserId: 1, externalMessageId: "same-provider-id", direction: "incoming" });
    expect(second).toMatchObject({ lineId: 11, ownerUserId: 2, externalMessageId: "same-provider-id", direction: "incoming" });
  });

  it("extracts auto-downloaded inbound media from body without rendering Base64", () => {
    const media = Buffer.from("synthetic image bytes").toString("base64");
    const record = wppConnectTestHelpers.messageRecord({
      id: { _serialized: "media-message", fromMe: false }, from: "201000000001@c.us",
      type: "image", mimetype: "image/jpeg", body: media, caption: "safe caption", timestamp: 1_800_000_000,
    }, 10, 100, 1);
    expect(record).toMatchObject({ text: "safe caption", mediaUrl: null });
    expect(record?.mediaMetadata).toMatchObject({ mimeType: "image/jpeg", storageState: "pending_custody" });
    expect(JSON.stringify(record?.rawMetadata)).not.toContain(media);
  });

  it("fails closed for malformed or oversized media without showing binary-looking body text", () => {
    const malformed = wppConnectTestHelpers.messageRecord({
      id: { _serialized: "invalid-media", fromMe: false }, from: "201000000001@c.us",
      type: "image", mimetype: "image/jpeg", body: "not-base64-content", timestamp: 1_800_000_000,
    }, 10, 100, 1);
    expect(malformed).toMatchObject({ text: null });
    expect(malformed?.mediaMetadata).toMatchObject({ storageState: "unavailable" });
    expect(wppConnectTestHelpers.canonicalBase64("bad%%base64")).toBeNull();
    expect(wppConnectTestHelpers.canonicalBase64(Buffer.alloc(15 * 1024 * 1024 + 1).toString("base64"))).toBeNull();
  });

  it("rejects a provider media type and MIME mismatch from custody", () => {
    const record = wppConnectTestHelpers.messageRecord({
      id: { _serialized: "mismatch-media", fromMe: false }, from: "201000000001@c.us",
      type: "image", mimetype: "application/pdf", body: Buffer.from("synthetic bytes").toString("base64"), timestamp: 1_800_000_000,
    }, 10, 100, 1);
    expect(record).toMatchObject({ text: null });
    expect(record?.mediaMetadata).toMatchObject({ mediaType: "image", storageState: "unavailable" });
  });

  it("keeps LID and opaque chat identities neutral instead of inventing phones", () => {
    expect(wppConnectTestHelpers.phoneFromChatId("opaque-lid@lid")).toBeNull();
    expect(wppConnectTestHelpers.safeChatIdentity("opaque-lid@lid")).toBe("WhatsApp identity unavailable");
    expect(wppConnectTestHelpers.phoneFromChatId("201234567890@c.us")).toBe("+201234567890");
    expect(wppConnectTestHelpers.isPrivateChatId("status@broadcast")).toBe(false);
    expect(wppConnectTestHelpers.isPrivateChatId("group@g.us")).toBe(false);
    expect(wppConnectTestHelpers.isPrivateChatId("opaque-lid@lid")).toBe(true);
  });

  it("preserves a structured LID server and keeps bare chat numbers neutral", () => {
    expect(wppConnectTestHelpers.providerValue({ user: "123456789", server: "lid" })).toBe("123456789@lid");
    expect(wppConnectTestHelpers.safeChatIdentity("123456789")).toBe("WhatsApp identity unavailable");
    expect(wppConnectTestHelpers.accountPhoneFromValue("201234567890")).toBe("+201234567890");
  });

  it("selects documented image and file endpoints but fails closed for unsupported MIME", () => {
    expect(wppConnectTestHelpers.outboundMediaEndpoint("image/jpeg")).toBe("send-image");
    expect(wppConnectTestHelpers.outboundMediaEndpoint("application/pdf")).toBe("send-file-base64");
    expect(wppConnectTestHelpers.outboundMediaEndpoint("audio/ogg")).toBe("send-file-base64");
    expect(wppConnectTestHelpers.outboundMediaEndpoint("audio/ogg", "ptt")).toBe("send-voice-base64");
    expect(wppConnectTestHelpers.outboundMediaEndpoint("audio/webm", "ptt")).toBeNull();
    expect(wppConnectTestHelpers.outboundMediaEndpoint("application/x-msdownload")).toBeNull();
  });

  it("accepts only the server-side webhook secret", () => {
    vi.stubEnv("WPPCONNECT_WEBHOOK_SECRET", "a-secure-test-secret");
    expect(verifyWppWebhookSecret("a-secure-test-secret")).toBe(true);
    expect(verifyWppWebhookSecret("wrong-secret")).toBe(false);
    expect(verifyWppWebhookSecret(undefined)).toBe(false);
  });

  it("uses the JWT-only token returned by WPPConnect 2.10.18", () => {
    expect(wppConnectTestHelpers.generatedTokenFromPayload({
      status: "success",
      session: "testmanual",
      token: "jwt-only-value",
      full: "testmanual:jwt-only-value",
    }, "testmanual")).toBe("jwt-only-value");
    expect(() => wppConnectTestHelpers.generatedTokenFromPayload({
      session: "another-session",
      token: "jwt-only-value",
    }, "testmanual")).toThrow("different session");
  });

  it("recognizes provider authentication failures and redacts generate-token secrets", () => {
    vi.stubEnv("WPPCONNECT_BASE_URL", "http://localhost:21465");
    vi.stubEnv("WPPCONNECT_SECRET_KEY", "super-secret-key");
    vi.stubEnv("WPPCONNECT_WEBHOOK_URL", "http://localhost:3000/api/webhook");
    vi.stubEnv("WPPCONNECT_WEBHOOK_SECRET", "webhook-secret");
    expect(wppConnectTestHelpers.isSessionAuthError(new Error("Check that the Session and Token are correct"))).toBe(true);
    const path = wppConnectTestHelpers.redactedEndpointPath("/api/testmanual/super-secret-key/generate-token");
    expect(path).toBe("/api/testmanual/[redacted]/generate-token");
    expect(path).not.toContain("super-secret-key");
  });

  it("enforces an allowlisted chat before webhook persistence and a compound idempotency key", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/wppConnectIntegration.ts"), "utf8");
    const schema = fs.readFileSync(path.join(process.cwd(), "drizzle/schema.ts"), "utf8");
    const lookupAt = source.indexOf("eq(whatsappAllowedChats.externalChatId, externalChatId)");
    const insertAt = source.lastIndexOf("await upsertWppMessage(record");
    expect(lookupAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(lookupAt);
    expect(source).toContain('reason: "chat_not_allowed"');
    expect(schema).toContain('uniqueIndex("whatsapp_linked_messages_line_external_uq").on(table.lineId, table.externalMessageId)');
    expect(source).toContain("upsertWppMessage(record, message, recoveredMedia)");
    expect(source).toContain('reason: "source_not_private"');
  });

  it("accepts current flat and nested webhook envelopes without raw error logging", () => {
    const flat = wppConnectTestHelpers.webhookMessage({ event: "onmessage", data: { id: "flat-id", from: "201000000001@c.us" } });
    const nested = wppConnectTestHelpers.webhookMessage({ event: "onmessage", data: { message: { id: "nested-id", from: "201000000001@c.us" } } });
    const direct = wppConnectTestHelpers.webhookMessage({ event: "onmessage", id: "direct-id", from: "201000000001@c.us" });
    expect(flat).toMatchObject({ id: "flat-id" });
    expect(nested).toMatchObject({ id: "nested-id" });
    expect(direct).toMatchObject({ id: "direct-id" });
    const webhook = fs.readFileSync(path.join(process.cwd(), "server/wppConnectWebhook.ts"), "utf8");
    expect(webhook).not.toContain("processing failed\", error");
  });

  it("accepts the pinned provider's flat event/session envelope before allowlist persistence", () => {
    const event = wppConnectTestHelpers.webhookMessage({
      event: "onmessage",
      session: "gold-session",
      id: { _serialized: "provider-message", fromMe: false },
      from: "201000000001@c.us",
      type: "chat",
      body: "synthetic text omitted from persistence assertions",
    });
    expect(event).toMatchObject({ from: "201000000001@c.us", type: "chat" });
    const source = fs.readFileSync(path.join(process.cwd(), "server/wppConnectIntegration.ts"), "utf8");
    expect(source).toContain('const sessionName = String(safePayload.session');
    expect(source.indexOf('if (!isPrivateChatId(externalChatId))')).toBeLessThan(source.indexOf('await upsertWppMessage(record'));
    expect(source).toContain('emitGoldConversationEvent(binding.line.id');
  });

  it("recovers bounded media bytes from a documented provider response without exposing the bytes", () => {
    const bytes = Buffer.from("synthetic pdf bytes");
    const media = wppConnectTestHelpers.mediaFromDownloadedBytes(bytes, "application/pdf", "report.pdf", {
      id: { _serialized: "downloaded-media", fromMe: false }, type: "document", mimetype: "application/pdf",
    });
    expect(media).toMatchObject({ mediaType: "document", mimeType: "application/pdf", filename: "report.pdf", size: bytes.length });
    expect(media?.base64).toBe(bytes.toString("base64"));
    expect(wppConnectTestHelpers.verifyGoldMediaIntegrity(bytes, { size: bytes.length, sha256: media?.sha256 })).toBe(true);
    expect(wppConnectTestHelpers.verifyGoldMediaIntegrity(Buffer.from("tampered"), { size: bytes.length, sha256: media?.sha256 })).toBe(false);
    expect(wppConnectTestHelpers.mediaFromDownloadedBytes(Buffer.alloc(15 * 1024 * 1024 + 1), "application/pdf", "report.pdf", { type: "document" })).toBeNull();
  });

  it("maps original provider document, video, audio, and PTT media without a thumbnail-only path", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/wppConnectIntegration.ts"), "utf8");
    for (const [type, mime, filename] of [["document", "application/pdf", "report.pdf"], ["video", "video/mp4", "clip.mp4"], ["audio", "audio/ogg", "voice.ogg"]] as const) {
      const bytes = Buffer.from(`synthetic-${type}-original-bytes`);
      const media = wppConnectTestHelpers.mediaFromDownloadedBytes(bytes, mime, filename, { id: { _serialized: `${type}-id` }, type, mimetype: mime });
      expect(media).toMatchObject({ mediaType: type, mimeType: mime, filename, size: bytes.length });
    }
    expect(source).toContain("get-media-by-message");
    expect(source).toContain("download-media");
    expect(source).toContain("mediaFromDownloadedBytes(payload.bytes");
    expect(source).toContain("thumbnail|jpegThumbnail");
    expect(source).not.toContain("storageThumbnail");
  });

  it("never exposes WPPConnect secrets through Vite client variables", () => {
    const integration = fs.readFileSync(path.join(process.cwd(), "server/wppConnectIntegration.ts"), "utf8");
    const page = fs.readFileSync(path.join(process.cwd(), "client/src/pages/WhatsAppConnectionsPage.tsx"), "utf8");
    expect(integration).toContain("process.env.WPPCONNECT_SECRET_KEY");
    expect(integration).not.toContain("import.meta.env");
    expect(page).not.toContain("WPPCONNECT_SECRET_KEY");
    expect(page).not.toContain("VITE_WPPCONNECT");
    expect(integration).toContain("get-media-by-message");
    expect(integration).toContain("download-media");
    expect(integration).toContain("subscribeGoldConversation");
    const events = fs.readFileSync(path.join(process.cwd(), "server/goldWhatsAppEventsRoutes.ts"), "utf8");
    expect(events).toContain("/api/gold-whatsapp/events");
    expect(page).not.toContain("/api/gold-whatsapp/events");
  });
});
