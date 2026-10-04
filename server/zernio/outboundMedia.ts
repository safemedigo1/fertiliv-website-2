import { TRPCError } from "@trpc/server";
import { isOggOpusMono, remuxWebmOpusToOgg } from "./oggOpus";

export const INBOX_UPLOAD_PART_BYTES = 2 * 1024 * 1024;
export const INBOX_UPLOAD_PART_MAX = 8;

export function isInboxUploadId(value: string) {
  return /^[a-f0-9]{32}$/.test(value);
}

/** Part objects sit beside the final name so a 10 MB video never arrives in one request. */
export function outboundPartKey(storageKey: string, partNumber: number) {
  const match = OUTBOUND_KEY.exec(storageKey);
  if (!match || partNumber < 1 || partNumber > INBOX_UPLOAD_PART_MAX) return null;
  return `whatsapp-outbound/${match[1]}/${match[2]}/p/${partNumber}`;
}

export function outboundUploadToken(storageKey: string) {
  return OUTBOUND_KEY.exec(storageKey)?.[2] ?? null;
}

const OUTBOUND_KEY = /^whatsapp-outbound\/([A-Za-z0-9_-]{6,64})\/([a-f0-9]{32})\/([A-Za-z0-9._-]{1,80})$/;

export function sanitizeUploadFileName(name: string) {
  const base = name.split(/[/\\]/).pop() ?? "file";
  const cleaned = base.normalize("NFKD").replace(/[^\w.-]+/g, "_").replace(/^\.+/, "").slice(0, 80);
  return cleaned || "file";
}

/** Server-minted keys only. The account id must be the conversation being sent. */
export function isOwnedOutboundUploadKey(storageKey: string, accountId: string) {
  const match = OUTBOUND_KEY.exec(storageKey);
  return Boolean(match && match[1] === accountId);
}

export function outboundMediaLimit(kind: "image" | "video" | "audio" | "document") {
  if (kind === "image") return 5_000_000;
  if (kind === "document") return 15_000_000;
  return 16_000_000;
}

function startsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

function hasFtyp(bytes: Uint8Array) {
  return bytes.length > 12 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
}

/** Reject a declared media type whose bytes are a different format. */
export function outboundBytesMatchMime(bytes: Uint8Array, mimeType: string) {
  const mime = mimeType.toLowerCase().split(";", 1)[0] ?? "";
  if (mime === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (mime === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]);
  if (mime === "image/gif") return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
  if (mime === "image/webp") return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (mime === "video/mp4" || mime === "video/quicktime" || mime === "audio/mp4") return hasFtyp(bytes);
  if (mime === "video/webm" || mime === "audio/webm" || mime === "audio/ogg") {
    if (mime === "audio/ogg") return startsWith(bytes, [0x4f, 0x67, 0x67, 0x53]);
    return startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]);
  }
  if (mime === "audio/mpeg") return startsWith(bytes, [0x49, 0x44, 0x33]) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
  if (mime === "audio/wav") return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
  if (mime === "application/pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46]);
  return true;
}

export function prepareOutboundVoice(bytes: Buffer, mimeType: string, filename: string) {
  const voice = /^voice-note\.(ogg|webm)$/i.test(filename);
  if (!voice) return { bytes, mimeType, filename, voiceNote: false as const };
  try {
    if (isOggOpusMono(bytes)) {
      return { bytes, mimeType: "audio/ogg", filename: "voice-note.ogg", voiceNote: true as const };
    }
    if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) {
      const ogg = remuxWebmOpusToOgg(bytes);
      console.info("[inbox] voice note remuxed", { bytes: ogg.length });
      return { bytes: ogg, mimeType: "audio/ogg", filename: "voice-note.ogg", voiceNote: true as const };
    }
  } catch (error) {
    console.warn("[inbox] voice note rejected", { reason: error instanceof Error ? error.message : "invalid" });
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: "This voice note could not be prepared. Record it again." });
}
