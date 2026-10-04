import { resolveUnifiedInboxAttachmentMime } from "@shared/unifiedInbox";

const BASE64_CHUNK_BYTES = 0x2000;

export type InboxAttachmentReadResult = {
  fileBase64: string;
  mimeType: string;
  filename: string;
  size: number;
};

const goldMimeByExtension: Record<string, string> = {
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  webm: "audio/webm",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

function resolveGoldAttachmentMime(browserMime: string | null | undefined, filename: string | null | undefined) {
  const normalized = typeof browserMime === "string" ? browserMime.trim().toLowerCase().split(";", 1)[0] ?? "" : "";
  const extension = typeof filename === "string" ? filename.trim().toLowerCase().match(/\.([a-z0-9]{1,12})$/)?.[1] ?? "" : "";
  const fromExtension = goldMimeByExtension[extension] ?? null;
  if (/^(audio\/(ogg|mpeg|mp4|wav|webm)|video\/(mp4|webm|quicktime))$/.test(normalized)) return normalized;
  return fromExtension ?? resolveUnifiedInboxAttachmentMime(normalized, filename);
}

function isBase64(value: string) {
  return Boolean(value) && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

/**
 * Converts bytes in bounded chunks so fallback browsers never receive one
 * oversized spread-argument call. FileReader remains the first choice on
 * mobile Safari and other browser file pickers.
 */
export function base64FromBytes(bytes: Uint8Array) {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, Math.min(offset + BASE64_CHUNK_BYTES, bytes.length));
    parts.push(String.fromCharCode(...chunk));
  }
  return btoa(parts.join(""));
}

async function readWithFileReader(file: Blob): Promise<string> {
  if (typeof FileReader === "undefined") throw new Error("file_reader_unavailable");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("file_reader_failed"));
    reader.onabort = () => reject(new Error("file_reader_aborted"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const comma = result.indexOf(",");
      const base64 = comma >= 0 ? result.slice(comma + 1).replace(/\s+/g, "") : "";
      if (!isBase64(base64)) {
        reject(new Error("file_reader_invalid_result"));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(file);
  });
}

export async function readInboxAttachmentBase64(file: Blob) {
  try {
    return await readWithFileReader(file);
  } catch {
    const buffer = await file.arrayBuffer();
    const base64 = base64FromBytes(new Uint8Array(buffer));
    if (!isBase64(base64)) throw new Error("attachment_read_failed");
    return base64;
  }
}

/**
 * Resolves only the small documented attachment allowlist. A filename-derived
 * MIME is used solely when the browser gives no type (or generic binary), and
 * for .md files reported as generic text/plain by mobile file pickers.
 */
export function inspectInboxAttachmentFile(file: File, options?: { richMedia?: boolean }) {
  const mimeType = options?.richMedia ? resolveGoldAttachmentMime(file.type, file.name) : resolveUnifiedInboxAttachmentMime(file.type, file.name);
  if (!mimeType) throw new Error("unsupported_attachment");
  return { mimeType, filename: file.name, size: file.size };
}

export async function readInboxAttachmentFile(file: File, options?: { richMedia?: boolean }): Promise<InboxAttachmentReadResult> {
  const inspected = inspectInboxAttachmentFile(file, options);
  return {
    fileBase64: await readInboxAttachmentBase64(file),
    ...inspected,
  };
}
