import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { communicationMediaAssets } from "../../drizzle/schema";
import { getDb } from "../db";
import { storageDelete, storagePut } from "../storage";

const MEDIA_BYTES: Record<string, number> = {
  "image/jpeg": 16_000_000,
  "image/png": 16_000_000,
  "image/webp": 16_000_000,
  "image/gif": 8_000_000,
  "video/mp4": 16_000_000,
  "video/3gpp": 16_000_000,
  "video/quicktime": 16_000_000,
  "audio/ogg": 16_000_000,
  "audio/mpeg": 16_000_000,
  "audio/mp4": 16_000_000,
  "audio/webm": 16_000_000,
  "audio/aac": 16_000_000,
  "application/pdf": 15_000_000,
};

function baseMime(value: string | null | undefined): string {
  return (value ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function apiKey(): string {
  const key = process.env.ZERNIO_API_KEY?.trim();
  if (!key) throw new Error("ZERNIO_API_KEY is not configured");
  return key;
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host === "::1") return true;
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const a = Number(match[1]);
  const b = Number(match[2]);
  if ([a, b, Number(match[3]), Number(match[4])].some((part) => part > 255)) return true;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * Turns a Zernio attachment path into an HTTPS URL on zernio.com only.
 * WhatsApp media links are authenticated paths, not public CDN files.
 */
export function zernioMediaFetchUrl(rawUrl: string | null, mediaId: string | null, accountId: string): string | null {
  const account = /^[A-Za-z0-9_-]{6,64}$/.test(accountId) ? accountId : "";
  const candidates: string[] = [];
  if (rawUrl?.startsWith("/v1/")) candidates.push(`https://zernio.com/api${rawUrl}`);
  else if (rawUrl?.startsWith("/api/v1/")) candidates.push(`https://zernio.com${rawUrl}`);
  else if (rawUrl?.startsWith("https://")) candidates.push(rawUrl);
  if (mediaId && /^[A-Za-z0-9_-]{8,128}$/.test(mediaId) && account) {
    candidates.push(`https://zernio.com/api/v1/whatsapp/media/${encodeURIComponent(mediaId)}?accountId=${encodeURIComponent(account)}`);
  }
  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (url.protocol !== "https:" || url.hostname !== "zernio.com" || isBlockedHost(url.hostname)) continue;
    if (!url.pathname.includes("/whatsapp/media/")) continue;
    if (account && !url.searchParams.get("accountId")) url.searchParams.set("accountId", account);
    return url.toString();
  }
  return null;
}

async function readLimited(response: Response, limit: number): Promise<Buffer> {
  const announced = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(announced) && announced > limit) throw new Error("media_too_large");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > limit) throw new Error("media_too_large");
  return bytes;
}

async function downloadZernioBytes(url: string, limit: number): Promise<{ bytes: Buffer; contentType: string }> {
  const first = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey()}` },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (first.status >= 300 && first.status < 400) {
    const location = first.headers.get("location");
    if (!location) throw new Error("media_redirect");
    const next = new URL(location, url);
    if (next.protocol !== "https:" || isBlockedHost(next.hostname)) throw new Error("media_redirect_blocked");
    const second = await fetch(next, { redirect: "manual", signal: AbortSignal.timeout(30_000) });
    if (!second.ok) {
      console.warn("[zernio] media redirect rejected", { status: second.status });
      throw new Error("media_download_failed");
    }
    return { bytes: await readLimited(second, limit), contentType: baseMime(second.headers.get("content-type")) };
  }
  if (!first.ok) {
    console.warn("[zernio] media download rejected", { status: first.status });
    throw new Error("media_download_failed");
  }
  return { bytes: await readLimited(first, limit), contentType: baseMime(first.headers.get("content-type")) };
}

function safeFilename(name: string | null, mime: string, mediaId: number): string {
  const cleaned = (name ?? "").replace(/[^\w.\- ]+/g, "").trim().slice(0, 80);
  if (cleaned && !cleaned.startsWith(".")) return cleaned;
  const extension = mime === "application/pdf" ? "pdf" : mime.startsWith("audio/ogg") ? "ogg" : mime.split("/")[1]?.replace(/[^a-z0-9]/g, "") || "bin";
  return `whatsapp-${mediaId}.${extension}`;
}

export async function storeInboundZernioMedia(input: {
  conversationId: number;
  normalizedMediaId: number;
  accountId: string;
  mediaUrl: string | null;
  mediaId: string | null;
  mimeType: string | null;
  filename: string | null;
  mediaType: string;
  localStorageKey?: string | null;
}): Promise<"stored" | "skipped" | "failed"> {
  const db = await getDb();
  if (!db) return "failed";
  const [existing] = await db.select({ id: communicationMediaAssets.id }).from(communicationMediaAssets)
    .where(eq(communicationMediaAssets.normalizedMediaId, input.normalizedMediaId)).limit(1);
  if (existing) return "skipped";

  const declared = baseMime(input.mimeType);
  const limit = MEDIA_BYTES[declared];
  if (!limit) {
    console.warn("[zernio] skipped media with an unsupported type", { mediaType: input.mediaType });
    return "failed";
  }
  const filename = safeFilename(input.filename, declared, input.normalizedMediaId);

  if (input.localStorageKey) {
    await db.insert(communicationMediaAssets).values({
      conversationId: input.conversationId,
      normalizedMediaId: input.normalizedMediaId,
      channelKind: "whatsapp_linked_device",
      storageKey: input.localStorageKey.slice(0, 512),
      mediaType: input.mediaType.slice(0, 64),
      mimeType: declared,
      filename,
      accessState: "available",
      retentionUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).onConflictDoNothing();
    return "stored";
  }

  const urls = [...new Set([
    zernioMediaFetchUrl(input.mediaUrl, null, input.accountId),
    zernioMediaFetchUrl(null, input.mediaId, input.accountId),
  ].filter((url): url is string => Boolean(url)))];
  if (urls.length === 0) return "failed";

  let downloaded: { bytes: Buffer; contentType: string } | null = null;
  for (const url of urls) {
    try {
      downloaded = await downloadZernioBytes(url, limit);
      break;
    } catch (error) {
      console.warn("[zernio] media download attempt failed", { name: error instanceof Error ? error.name : "error" });
    }
  }
  if (!downloaded) return "failed";
  const received = downloaded.contentType || declared;
  if (received !== declared && received !== "application/octet-stream" && received !== "binary/octet-stream") {
    console.warn("[zernio] media type did not match the attachment", { declared });
    return "failed";
  }

  const stored = await storagePut(
    `communications/whatsapp/zernio/${input.conversationId}/${filename}`,
    downloaded.bytes,
    declared,
    filename,
  );
  try {
    await db.insert(communicationMediaAssets).values({
      conversationId: input.conversationId,
      normalizedMediaId: input.normalizedMediaId,
      channelKind: "whatsapp_linked_device",
      storageKey: stored.key,
      mediaType: input.mediaType.slice(0, 64),
      mimeType: declared,
      filename,
      sha256: createHash("sha256").update(downloaded.bytes).digest("hex"),
      accessState: "available",
      retentionUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    }).onConflictDoNothing();
  } catch (error) {
    await storageDelete(stored.key);
    console.error("[zernio] media custody failed", { name: error instanceof Error ? error.name : "error" });
    return "failed";
  }
  console.info("[zernio] media stored", { conversationId: input.conversationId, mediaType: input.mediaType, bytes: downloaded.bytes.length });
  return "stored";
}
