import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { isInsideWhatsAppWindow, parseZernioEnvelope } from "./envelope";
import { zernioMediaFetchUrl } from "./mediaCustody";
import { readZernioConnectState, signZernioConnectState } from "./connect";
import { verifyZernioSignature } from "./signature";

describe("zernio webhook security", () => {
  it("rejects a bad signature", () => {
    const body = Buffer.from("{\"event\":\"webhook.test\"}");
    expect(verifyZernioSignature(body, "deadbeef", "secret")).toBe(false);
  });

  it("accepts the hex hmac of the raw body", () => {
    const body = Buffer.from("{\"event\":\"message.received\"}");
    const signature = createHmac("sha256", "secret").update(body).digest("hex");
    expect(verifyZernioSignature(body, signature, "secret")).toBe(true);
    expect(verifyZernioSignature(body, signature.toUpperCase(), "secret")).toBe(true);
  });

  it("keeps free text inside the 24-hour window and blocks older chats", () => {
    const now = new Date("2026-10-03T12:00:00.000Z");
    expect(isInsideWhatsAppWindow(new Date("2026-10-03T11:00:00.000Z"), now)).toBe(true);
    expect(isInsideWhatsAppWindow(new Date("2026-10-02T11:00:00.000Z"), now)).toBe(false);
    expect(isInsideWhatsAppWindow(null, now)).toBe(false);
  });

  it("reads the WhatsApp sender name and phone from an inbox event", () => {
    const parsed = parseZernioEnvelope({
      event: "message.received",
      message: {
        id: "m1",
        conversationId: "c1",
        text: "Hello",
        sender: { name: "Clinic Guest", username: "201000000000" },
        attachments: [{ type: "image", url: "https://cdn.example/a.jpg", mimeType: "image/jpeg" }],
      },
      account: { accountId: "a1" },
    });
    expect(parsed?.accountId).toBe("a1");
    expect(parsed?.participantName).toBe("Clinic Guest");
    expect(parsed?.participantPhone).toBe("+201000000000");
    expect(parsed?.mediaUrl).toBe("https://cdn.example/a.jpg");
    expect(parsed?.messageType).toBe("image");
  });

  it("reads list-api media, a shared contact, and a reaction from the live message shape", () => {
    const parsed = parseZernioEnvelope({
      id: "wamid-video",
      conversationId: "thread-1",
      accountId: "account-1",
      direction: "incoming",
      message: "",
      senderName: "Clinic Guest",
      senderPhoneNumber: "+201000000000",
      attachments: [{ id: "media_abc12345", type: "video", url: "/v1/whatsapp/media/media_abc12345", mimeType: "video/mp4" }],
    });
    expect(parsed?.messageType).toBe("video");
    expect(parsed?.mediaUrl).toBe("/v1/whatsapp/media/media_abc12345");
    expect(parsed?.attachments[0]?.mediaId).toBe("media_abc12345");
    expect(parsed?.participantName).toBe("Clinic Guest");

    const contact = parseZernioEnvelope({
      id: "wamid-contact",
      conversationId: "thread-1",
      accountId: "account-1",
      message: "Shared a contact",
      metadata: { contacts: [{ name: { formatted_name: "Sara Adel" }, phones: [{ phone: "+201111111111" }] }] },
    });
    expect(contact?.messageType).toBe("contact");
    expect(contact?.contacts[0]).toEqual({ name: "Sara Adel", phone: "+201111111111" });

    const voice = parseZernioEnvelope({
      id: "wamid-voice",
      conversationId: "thread-1",
      accountId: "account-1",
      message: "",
      attachments: [{ type: "audio", url: "/v1/whatsapp/media/voice1", mimeType: "audio/ogg; codecs=opus" }],
    });
    expect(voice?.messageType).toBe("voice");

    const reaction = parseZernioEnvelope({
      conversationId: "thread-1",
      account: { accountId: "account-1" },
      reaction: { emoji: "", action: "removed", platformMessageId: "wamid-video", messageId: "zernio-1" },
    });
    expect(reaction?.reactionRemoved).toBe(true);
    expect(reaction?.reactionTargetIds).toContain("wamid-video");
    expect(zernioMediaFetchUrl("/v1/whatsapp/media/media_abc12345", null, "account-1")).toBe("https://zernio.com/api/v1/whatsapp/media/media_abc12345?accountId=account-1");
    expect(zernioMediaFetchUrl("https://evil.example/whatsapp/media/x", null, "account-1")).toBeNull();
    expect(zernioMediaFetchUrl("http://zernio.com/api/v1/whatsapp/media/x", null, "account-1")).toBeNull();
  });

  it("keeps the customer when an outgoing message identifies the connected line", () => {
    const parsed = parseZernioEnvelope({
      id: "out-1",
      conversationId: "thread-1",
      accountId: "account-1",
      direction: "outgoing",
      message: "Reply",
      senderName: "Clinic Line",
      senderPhoneNumber: "+201555000111",
      conversation: { participantName: "Clinic Guest", participantUsername: "201000000000" },
    });
    expect(parsed?.direction).toBe("outgoing");
    expect(parsed?.participantName).toBe("Clinic Guest");
    expect(parsed?.participantPhone).toBe("+201000000000");

    const senderOnly = parseZernioEnvelope({
      id: "out-2",
      conversationId: "thread-1",
      accountId: "account-1",
      direction: "outgoing",
      message: "Reply",
      sender: { name: "Clinic Line", username: "201555000111" },
    });
    expect(senderOnly?.participantName).toBeNull();
    expect(senderOnly?.participantPhone).toBeNull();
  });

  it("rejects a tampered connect callback", () => {
    process.env.JWT_SECRET = "test-secret";
    const state = signZernioConnectState(42, 1_700_000_000_000);
    expect(readZernioConnectState(state, 1_700_000_000_000)).toBe(42);
    const tampered = `${state.slice(0, 8)}${state[8] === "a" ? "b" : "a"}${state.slice(9)}`;
    expect(readZernioConnectState(tampered, 1_700_000_000_000)).toBeNull();
    expect(readZernioConnectState(state, 1_700_000_000_000 + 16 * 60 * 1000)).toBeNull();
  });
});
