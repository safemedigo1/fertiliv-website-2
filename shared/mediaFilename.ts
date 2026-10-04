import { createHash } from "node:crypto";

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/tiff": "tif",
  "image/heic": "heic",
  "image/heif": "heif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "webm",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/zip": "zip",
  "text/plain": "txt",
  "text/markdown": "md",
};

const GENERIC_FILENAME_RE = /^(?:attachment|file|media|blob|unknown|unnamed)(?:\.[a-z0-9]+)?$/i;

function normalizedMimeType(mimeType: string | null | undefined) {
  return typeof mimeType === "string" ? mimeType.trim().toLowerCase().split(";")[0] ?? "" : "";
}

export function extensionForMediaMime(mimeType: string | null | undefined, mediaType?: string | null) {
  const mime = normalizedMimeType(mimeType);
  const known = MIME_EXTENSION_MAP[mime];
  if (known) return known;
  const subtype = mime.includes("/") ? mime.split("/")[1] ?? "" : "";
  if (subtype && /^[a-z0-9]+$/i.test(subtype) && subtype !== "octet-stream") return subtype.toLowerCase();
  const type = typeof mediaType === "string" ? mediaType.trim().toLowerCase() : "";
  return type && /^[a-z0-9]+$/i.test(type) ? type : "bin";
}

function safeBaseName(value: string) {
  return value
    .replace(/[\\/\r\n\u0000]+/g, "_")
    .replace(/[^A-Za-z0-9._ -]+/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+|\.+$/g, "")
    .trim()
    .slice(0, 180);
}

function hasExtension(value: string) {
  return /\.[A-Za-z0-9]{1,12}$/.test(value);
}

function shortSeed(seed: string | number | null | undefined) {
  const normalized = String(seed ?? "media").trim() || "media";
  return createHash("sha256").update(normalized).digest("hex").slice(0, 12);
}

/**
 * Returns a safe download/storage filename. Real provider filenames are kept
 * after path/control-character sanitization. Generic placeholders such as
 * "attachment" are replaced with a deterministic MIME-aware name.
 */
export function buildMediaFilename(input: {
  originalFilename?: string | null;
  mimeType?: string | null;
  mediaType?: string | null;
  seed?: string | number | null;
}) {
  const extension = extensionForMediaMime(input.mimeType, input.mediaType);
  const original = safeBaseName(input.originalFilename?.trim() ?? "");
  if (original && !GENERIC_FILENAME_RE.test(original)) {
    return hasExtension(original) ? original : `${original}.${extension}`;
  }
  const kind = typeof input.mediaType === "string" && /^[A-Za-z0-9]+$/.test(input.mediaType)
    ? input.mediaType.toLowerCase()
    : "media";
  return `whatsapp-${kind}-${shortSeed(input.seed)}.${extension}`;
}

export function isGenericMediaFilename(value: string | null | undefined) {
  return !value || GENERIC_FILENAME_RE.test(value.trim());
}
