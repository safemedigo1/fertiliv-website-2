import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { preferredVoiceRecorderMime, voiceRecordingFile } from "../../shared/voiceRecorder";
import { isOggOpusMono, remuxWebmOpusToOgg } from "./oggOpus";
import { isOwnedOutboundUploadKey, outboundBytesMatchMime, outboundPartKey, outboundUploadToken, prepareOutboundVoice, sanitizeUploadFileName } from "./outboundMedia";

function sizeVint(value: number) {
  if (value < 127) return Buffer.from([0x80 | value]);
  return Buffer.from([0x40 | (value >> 8), value & 0xff]);
}

function element(id: Buffer, payload: Buffer) {
  return Buffer.concat([id, sizeVint(payload.length), payload]);
}

function opusHead(channels: number) {
  const head = Buffer.alloc(19);
  head.write("OpusHead");
  head[8] = 1;
  head[9] = channels;
  head.writeUInt16LE(312, 10);
  head.writeUInt32LE(48000, 12);
  return head;
}

function webmWithOpus(channels: number) {
  const head = opusHead(channels);
  const entry = element(Buffer.from([0xae]), Buffer.concat([
    element(Buffer.from([0xd7]), Buffer.from([0x01])),
    element(Buffer.from([0x86]), Buffer.from("A_OPUS")),
    element(Buffer.from([0x63, 0xa2]), head),
  ]));
  const tracks = element(Buffer.from([0x16, 0x54, 0xae, 0x6b]), entry);
  const block = Buffer.from([0x81, 0x00, 0x00, 0x80, 0xf8, 0x11]);
  const cluster = element(Buffer.from([0x1f, 0x43, 0xb6, 0x75]), element(Buffer.from([0xa3]), block));
  const segment = element(Buffer.from([0x18, 0x53, 0x80, 0x67]), Buffer.concat([tracks, cluster]));
  const ebml = element(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), element(Buffer.from([0x42, 0x82]), Buffer.from("webm")));
  return Buffer.concat([ebml, segment]);
}

describe("inbox voice and large media", () => {
  it("records in the first Opus container the browser can produce", () => {
    expect(preferredVoiceRecorderMime(() => false)).toBeNull();
    expect(preferredVoiceRecorderMime((mime) => mime === "audio/webm;codecs=opus")).toBe("audio/webm;codecs=opus");
    expect(voiceRecordingFile("audio/webm;codecs=opus")).toEqual({ filename: "voice-note.webm", mimeType: "audio/webm" });
    expect(voiceRecordingFile("audio/ogg;codecs=opus").filename).toBe("voice-note.ogg");
  });

  it("remuxes a mono WebM Opus recording into an Ogg Opus voice note", () => {
    const ogg = remuxWebmOpusToOgg(webmWithOpus(1));
    expect(ogg.subarray(0, 4).toString()).toBe("OggS");
    expect(ogg.includes(Buffer.from("OpusHead"))).toBe(true);
    expect(ogg.includes(Buffer.from("OpusTags"))).toBe(true);
    expect(ogg.includes(Buffer.from([0xf8, 0x11]))).toBe(true);
    expect(isOggOpusMono(ogg)).toBe(true);
    const unknownSegment = Buffer.concat([
      element(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), element(Buffer.from([0x42, 0x82]), Buffer.from("webm"))),
      Buffer.from([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
      webmWithOpus(1).subarray(webmWithOpus(1).indexOf(Buffer.from([0x16, 0x54, 0xae, 0x6b]))),
    ]);
    expect(isOggOpusMono(remuxWebmOpusToOgg(unknownSegment))).toBe(true);
    const prepared = prepareOutboundVoice(Buffer.from(webmWithOpus(1)), "audio/webm", "voice-note.webm");
    expect(prepared.voiceNote).toBe(true);
    expect(prepared.mimeType).toBe("audio/ogg");
    expect(prepared.filename).toBe("voice-note.ogg");
  });

  it("does not send a stereo recording as a WhatsApp voice note", () => {
    expect(() => prepareOutboundVoice(Buffer.from(webmWithOpus(2)), "audio/webm", "voice-note.webm")).toThrow(/Record it again/);
  });

  it("keeps outbound upload keys inside the sending account", () => {
    const key = "whatsapp-outbound/acct_123456/0123456789abcdef0123456789abcdef/clip.mp4";
    expect(isOwnedOutboundUploadKey(key, "acct_123456")).toBe(true);
    expect(isOwnedOutboundUploadKey(key, "other_account")).toBe(false);
    expect(isOwnedOutboundUploadKey("../secrets/file", "acct_123456")).toBe(false);
    expect(sanitizeUploadFileName("../../clip.mp4")).toBe("clip.mp4");
    expect(outboundUploadToken(key)).toBe("0123456789abcdef0123456789abcdef");
    expect(outboundPartKey(key, 1)).toBe("whatsapp-outbound/acct_123456/0123456789abcdef0123456789abcdef/p/1");
    expect(outboundPartKey(key, 0)).toBeNull();
    expect(outboundPartKey(key, 9)).toBeNull();
  });

  it("rejects a video whose bytes are not a video", () => {
    const mp4 = Buffer.concat([Buffer.from("xxxxftypisom"), Buffer.alloc(8)]);
    expect(outboundBytesMatchMime(mp4, "video/mp4")).toBe(true);
    expect(outboundBytesMatchMime(Buffer.from("not a video"), "video/mp4")).toBe(false);
    expect(outboundBytesMatchMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe(true);
  });

  it("allows an inbox video through the request body limit", () => {
    const config = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");
    const app = readFileSync(new URL("../_core/createApp.ts", import.meta.url), "utf8");
    expect(config).toContain('proxyClientMaxBodySize: "32mb"');
    expect(app).toContain('express.json({ limit: "32mb" })');
  });
});
