import { createHmac, timingSafeEqual } from "crypto";

/** Accepts the hex HMAC Zernio sends as X-Zernio-Signature or X-Late-Signature. */
export function verifyZernioSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const provided = signature.trim().toLowerCase().replace(/^sha256=/, "");
  if (!/^[0-9a-f]+$/.test(provided)) return false;
  const computed = createHmac("sha256", secret).update(rawBody).digest("hex");
  const left = Buffer.from(computed, "utf8");
  const right = Buffer.from(provided, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
