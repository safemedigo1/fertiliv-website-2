/**
 * Normalise any stored file URL / key to use our own /api/storage/ proxy.
 *
 * Files may be stored as:
 *   - "/manus-storage/intake-files/..."  (old proxied path — intercepted by platform)
 *   - "https://pub-*.r2.dev/..."         (raw R2 public URL — SSL error on mobile)
 *   - "https://d36*.cloudfront.net/..."  (raw Forge/CloudFront URL — AccessDenied)
 *   - "intake-files/..."                 (bare key)
 *
 * All of these are rewritten to "/api/storage/<key>" which is served by
 * our Express fileProxy.ts — streaming the file directly through our domain.
 *
 * NOTE: /manus-storage/ is intercepted by the Manus platform before reaching
 * our Express server, so we must use /api/storage/ instead.
 */
export function normaliseFileUrl(url: string | null | undefined): string {
  if (!url) return "";

  // Already using our proxy path
  if (url.startsWith("/api/storage/")) return url;

  // Old /manus-storage/ path — extract the key and rewrite to /api/storage/
  if (url.startsWith("/manus-storage/")) {
    const key = url.replace(/^\/manus-storage\//, "");
    return `/api/storage/${key}`;
  }

  // Raw R2 public URL: https://pub-xxx.r2.dev/<key>
  const r2Match = url.match(/^https?:\/\/pub-[^/]+\.r2\.dev\/(.+)$/);
  if (r2Match) {
    return `/api/storage/${r2Match[1]}`;
  }

  // Raw CloudFront URL: https://d36hbw14aib5lz.cloudfront.net/<accountId>/<appId>/<key>?...
  const cfMatch = url.match(
    /^https?:\/\/[^/]+\.cloudfront\.net\/[^/]+\/[^/]+\/([^?]+)/
  );
  if (cfMatch) {
    return `/api/storage/${cfMatch[1]}`;
  }

  // Bare key (no leading slash, not http)
  if (!url.startsWith("http") && !url.startsWith("/")) {
    return `/api/storage/${url}`;
  }

  // Fallback — return as-is
  return url;
}

/**
 * Returns true if the file is a DICOM file based on extension or MIME type.
 */
export function isDicom(fileName?: string | null, mimeType?: string | null): boolean {
  if (mimeType && (mimeType === "application/dicom" || mimeType.includes("dicom"))) return true;
  if (fileName) {
    const lower = fileName.toLowerCase();
    if (lower.endsWith(".dcm") || lower.endsWith(".dicom")) return true;
  }
  return false;
}

/**
 * Opens the Fertiliv DICOM Viewer in a new tab.
 * Handles URL normalisation and proper absolute URL construction for Cornerstone.
 */
export function openDicomViewer(fileUrl: string, label?: string): void {
  const normUrl = normaliseFileUrl(fileUrl);
  // Make it absolute so Cornerstone can fetch it correctly
  const absUrl = normUrl.startsWith("http") ? normUrl : `${window.location.origin}${normUrl}`;
  const encodedUrl = encodeURIComponent(absUrl);
  const encodedLabel = encodeURIComponent(label || "DICOM File");
  window.open(`/dicom-viewer?url=${encodedUrl}&name=${encodedLabel}`, "_blank");
}
