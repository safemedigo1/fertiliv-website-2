// Storage helpers — uses Cloudflare R2 (S3-compatible) when R2 credentials are present,
// falls back to Manus built-in Forge storage otherwise.

import { ENV } from "./_core/env";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, GetBucketCorsCommand, PutBucketCorsCommand, type CORSRule } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalize a storage key or URL to a bare object key.
 * Strips all supported prefixes:
 *   /api/storage/<key>   → <key>
 *   api/storage/<key>    → <key>
 *   /manus-storage/<key> → <key>
 *   manus-storage/<key>  → <key>
 *   leading slashes      → stripped
 *
 * This function is idempotent: calling it on an already-normalized key is safe.
 */
export function normalizeKey(relKey: string): string {
  let k = relKey.trim();
  // Strip /api/storage/ or api/storage/ prefix (with or without leading slash)
  k = k.replace(/^\/api\/storage\//, "");
  k = k.replace(/^api\/storage\//, "");
  // Strip /manus-storage/ or manus-storage/ prefix
  k = k.replace(/^\/manus-storage\//, "");
  k = k.replace(/^manus-storage\//, "");
  // Strip any remaining leading slashes
  k = k.replace(/^\/+/, "");
  return k;
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function isR2Configured(): boolean {
  return !!(
    ENV.r2AccountId &&
    ENV.r2AccessKeyId &&
    ENV.r2SecretAccessKey &&
    ENV.r2BucketName &&
    ENV.r2PublicUrl
  );
}

function getR2Client(): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${ENV.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: ENV.r2AccessKeyId,
      secretAccessKey: ENV.r2SecretAccessKey,
    },
    // Presigned browser uploads must not require a checksum header the page cannot send.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

const DIRECT_UPLOAD_ORIGINS = [
  "http://localhost:3001",
  "http://127.0.0.1:3001",
  "https://fertiliv.vercel.app",
];

let directUploadCors: Promise<void> | null = null;

export function isDirectUploadStorageConfigured() {
  return isR2Configured();
}

/**
 * Browser uploads go straight to R2 so a video never passes through the
 * 10 MB request-body ceiling. CORS is not access control; the PUT URL is.
 */
export function ensureDirectUploadCors() {
  if (!isR2Configured()) return Promise.resolve();
  if (!directUploadCors) {
    directUploadCors = applyDirectUploadCors().catch((error: unknown) => {
      directUploadCors = null;
      console.warn("[storage] inbox upload CORS was not updated", { reason: error instanceof Error ? error.name : "error" });
    });
  }
  return directUploadCors;
}

async function applyDirectUploadCors() {
  const client = getR2Client();
  let existing: CORSRule[] = [];
  try {
    existing = (await client.send(new GetBucketCorsCommand({ Bucket: ENV.r2BucketName }))).CORSRules ?? [];
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name !== "NoSuchCORSConfiguration" && name !== "NotFound") throw error;
  }
  const missing = DIRECT_UPLOAD_ORIGINS.filter((origin) => !existing.some((rule) => {
    const origins = rule.AllowedOrigins ?? [];
    const methods = (rule.AllowedMethods ?? []).map((method) => method.toUpperCase());
    const headers = (rule.AllowedHeaders ?? []).map((header) => header.toLowerCase());
    const headerOk = headers.includes("*") || (headers.includes("content-type") && headers.includes("content-length"));
    return methods.includes("PUT") && headerOk && (origins.includes("*") || origins.includes(origin));
  }));
  if (missing.length === 0) return;
  await client.send(new PutBucketCorsCommand({
    Bucket: ENV.r2BucketName,
    CORSConfiguration: {
      CORSRules: [
        ...existing,
        {
          AllowedOrigins: missing,
          AllowedMethods: ["PUT", "GET", "HEAD"],
          AllowedHeaders: ["content-type", "content-length"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }));
  console.info("[storage] inbox upload CORS updated", { origins: missing.length });
}

// ─── R2 Upload ────────────────────────────────────────────────────────────────

/** Sanitize a filename for S3 HTTP headers and metadata without changing the app-level display name. */
export function sanitizeStorageHeaderFileName(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\\/\x00-\x1f\x7f"\\]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .trim();
  return normalized || "file";
}

/** Keep a safe MIME token for provider request headers; unknown browser types remain binary data. */
export function sanitizeStorageContentType(contentType: string): string {
  const normalized = contentType.trim();
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+(?:;\s*[!#$%&'*+.^_`|~0-9A-Za-z-]+=[!#$%&'*+.^_`|~0-9A-Za-z-]+)*$/.test(normalized)
    ? normalized
    : "application/octet-stream";
}

async function storagePutR2(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
  originalFileName?: string,
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  const client = getR2Client();

  const body =
    typeof data === "string" ? Buffer.from(data) : Buffer.from(data as any);

  const safeName = originalFileName ? sanitizeStorageHeaderFileName(originalFileName) : undefined;
  const safeContentType = sanitizeStorageContentType(contentType);

  await client.send(
    new PutObjectCommand({
      Bucket: ENV.r2BucketName,
      Key: key,
      Body: body,
      ContentType: safeContentType,
      // Store original filename so the file proxy can serve it with the correct name
      ...(safeName ? {
        ContentDisposition: `inline; filename="${safeName}"`,
        Metadata: { "original-filename": safeName },
      } : {}),
    }),
  );

  // Return our own /api/storage/ proxy path — this bypasses the Manus platform
  // /manus-storage/ interception which returns AccessDenied for app-uploaded files.
  const url = `/api/storage/${key}`;
  return { key, url };
}

// ─── Forge (Manus built-in) Upload ───────────────────────────────────────────

function getForgeConfig() {
  const forgeUrl = ENV.forgeApiUrl;
  const forgeKey = ENV.forgeApiKey;

  if (!forgeUrl || !forgeKey) {
    throw new Error(
      "Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY",
    );
  }

  return { forgeUrl: forgeUrl.replace(/\/+$/, ""), forgeKey };
}

async function storagePutForge(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
  _originalFileName?: string, // reserved for future Forge metadata support
): Promise<{ key: string; url: string }> {
  const { forgeUrl, forgeKey } = getForgeConfig();
  const key = appendHashSuffix(normalizeKey(relKey));
  const safeContentType = sanitizeStorageContentType(contentType);

  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);

  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${forgeKey}` },
  });

  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }

  const { url: s3Url } = (await presignResp.json()) as { url: string };
  if (!s3Url) throw new Error("Forge returned empty presign URL");

  const blob =
    typeof data === "string"
      ? new Blob([data], { type: safeContentType })
      : new Blob([data as any], { type: safeContentType });

  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": safeContentType },
    body: blob,
  });

  if (!uploadResp.ok) {
    throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  }

  return { key, url: `/api/storage/${key}` };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upload a file to storage.
 * Uses Cloudflare R2 if credentials are configured, otherwise falls back to Manus Forge storage.
 *
 * IMPORTANT: Always use the returned `key` (not the input key) as the fileKey stored in the
 * database. The returned key includes an 8-character random hash suffix appended by this
 * function to guarantee uniqueness. The input key is only a prefix/hint.
 *
 * @returns { key, url } — key is the final storage object key; url is the proxy URL.
 */
/** Read the stored object size without downloading it. Missing objects return null. */
export async function storageHead(relKey: string): Promise<{ contentLength: number; contentType: string } | null> {
  if (!isR2Configured()) return null;
  const key = normalizeKey(relKey);
  try {
    const response = await getR2Client().send(new HeadObjectCommand({ Bucket: ENV.r2BucketName, Key: key }));
    if (typeof response.ContentLength !== "number") return null;
    return { contentLength: response.ContentLength, contentType: response.ContentType ?? "application/octet-stream" };
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number }; name?: string }).$metadata?.httpStatusCode;
    const name = error instanceof Error ? error.name : "";
    if (status === 404 || name === "NotFound" || name === "NoSuchKey") return null;
    console.warn("[storage] head failed", { status: status ?? 0 });
    return null;
  }
}

/**
 * Store one inbox upload slice at an exact key.
 * The normal upload helper appends a random suffix, which would make the slices impossible to reassemble.
 */
export async function storagePutExact(relKey: string, data: Buffer, contentType = "application/octet-stream") {
  if (!isR2Configured()) throw new Error("R2 is not configured");
  const key = normalizeKey(relKey);
  if (key !== relKey || key.includes("..")) throw new Error("invalid_storage_key");
  await getR2Client().send(new PutObjectCommand({
    Bucket: ENV.r2BucketName,
    Key: key,
    Body: data,
    ContentType: sanitizeStorageContentType(contentType),
    ContentLength: data.length,
  }));
  return key;
}

/** Short-lived GET URL so Zernio can fetch a private object without making the bucket public. */
export async function storagePresignGet(relKey: string, expiresInSeconds = 600): Promise<string> {
  if (!isR2Configured()) throw new Error("R2 is not configured");
  const key = normalizeKey(relKey);
  return getSignedUrl(getR2Client(), new GetObjectCommand({ Bucket: ENV.r2BucketName, Key: key }), { expiresIn: expiresInSeconds });
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
  originalFileName?: string,
): Promise<{ key: string; url: string }> {
  if (isR2Configured()) {
    return storagePutR2(relKey, data, contentType, originalFileName);
  }
  return storagePutForge(relKey, data, contentType, originalFileName);
}

/**
 * Get the public URL for a stored file.
 * For R2 files (full URL stored as key), returns the key as-is.
 * For Manus storage keys, returns /manus-storage/{key}.
 */
export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  // Route through /api/storage/ proxy — avoids Manus platform /manus-storage/ interception.
  return { key, url: `/api/storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const { url } = await storageGet(relKey);
  return url;
}

/**
 * Fetch the raw bytes of a stored file directly from R2 or Forge.
 * Returns { data: Buffer, contentType: string }.
 * Use this on the server when you need to pass file content to an external API
 * (e.g. LLM vision) that cannot access the /manus-storage/ proxy URL.
 */
export async function storageGetBytes(relKey: string): Promise<{ data: Buffer; contentType: string }> {
  const key = normalizeKey(relKey);

  // Try R2 first
  if (isR2Configured()) {
    try {
      const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
      const client = new S3Client({
        region: "auto",
        endpoint: `https://${ENV.r2AccountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: ENV.r2AccessKeyId, secretAccessKey: ENV.r2SecretAccessKey },
      });
      const cmd = new GetObjectCommand({ Bucket: ENV.r2BucketName, Key: key });
      const resp = await client.send(cmd);
      if (resp.Body) {
        const chunks: Uint8Array[] = [];
        const reader = resp.Body.transformToWebStream().getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        return { data: Buffer.concat(chunks), contentType: resp.ContentType ?? "application/octet-stream" };
      }
    } catch {
      // fall through to Forge
    }
  }

  // Forge fallback
  const { forgeUrl, forgeKey } = getForgeConfig();
  const presignUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
  if (!presignResp.ok) throw new Error(`Forge presign failed: ${presignResp.status}`);
  const { url: s3Url } = (await presignResp.json()) as { url: string };
  const fileResp = await fetch(s3Url);
  if (!fileResp.ok) throw new Error(`Forge file fetch failed: ${fileResp.status}`);
  const buffer = await fileResp.arrayBuffer();
  const contentType = fileResp.headers.get("content-type") ?? "application/octet-stream";
  return { data: Buffer.from(buffer), contentType };
}

/**
 * Delete a file from storage (Cloudflare R2 or Manus Forge).
 * Silently ignores errors — deletion is best-effort (file may already be gone).
 * @param relKey - The storage key returned by storagePut (e.g. "lead-docs/file_abc123.pdf")
 */
export async function storageDelete(relKey: string): Promise<boolean> {
  if (!relKey) return true;
  const key = normalizeKey(relKey);
  if (!key) return true;

  try {
    if (isR2Configured()) {
      const client = getR2Client();
      await client.send(
        new DeleteObjectCommand({
          Bucket: ENV.r2BucketName,
          Key: key,
        }),
      );
      return true;
    }

    // Forge fallback — Forge does not expose a public delete endpoint,
    // so the report-owned DB reference is removed and Forge lifecycle retention applies.
    return true;
  } catch {
    // Best-effort: log but don't throw — a missing file should never block lead deletion
    console.warn(`[storageDelete] Failed to delete key: ${key}`);
    return false;
  }
}

/**
 * Check whether a storage object exists (Cloudflare R2 or Forge).
 * Returns true if the object exists, false if it is missing.
 * Distinguishes between NotFound (false) and AccessDenied (true — treat as exists to avoid
 * blocking Save on permission misconfiguration).
 * Used by the atomic Save service to validate pending files before committing.
 * @param relKey - The storage key returned by storagePut (the final hash-suffixed key)
 */
export async function storageExists(relKey: string): Promise<boolean> {
  if (!relKey) return false;
  const key = normalizeKey(relKey);
  if (!key) return false;
  try {
    if (isR2Configured()) {
      const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
      const client = getR2Client();
      try {
        await client.send(new HeadObjectCommand({ Bucket: ENV.r2BucketName, Key: key }));
        return true;
      } catch (err: any) {
        const status = err?.$metadata?.httpStatusCode;
        if (status === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey") {
          console.warn(`[storageExists] Object not found in R2: ${key}`);
          return false;
        }
        if (status === 403) {
          // Access denied is distinct from not found — treat as exists to avoid blocking Save
          console.error(`[storageExists] Access denied for R2 key: ${key} — treating as present`);
          return true;
        }
        // Re-throw unexpected errors so the caller can handle them
        throw err;
      }
    }
    // Forge fallback: attempt presign; if it succeeds, the file exists
    const { forgeUrl, forgeKey } = getForgeConfig();
    const presignUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
    presignUrl.searchParams.set("path", key);
    const resp = await fetch(presignUrl, { headers: { Authorization: `Bearer ${forgeKey}` } });
    if (!resp.ok) {
      console.warn(`[storageExists] Forge presign returned ${resp.status} for key: ${key}`);
    }
    return resp.ok;
  } catch (err) {
    console.error(`[storageExists] Unexpected error checking key ${key}:`, err);
    return false;
  }
}
