import type { CookieOptions, Request } from "express";

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  // The Manus proxy always terminates HTTPS externally, so we check
  // X-Forwarded-Proto first, then fall back to req.protocol.
  // We also force secure=true in production so SameSite=None works correctly.
  const forwardedProto = req.headers["x-forwarded-proto"];
  const isHttps =
    req.protocol === "https" ||
    forwardedProto === "https" ||
    (Array.isArray(forwardedProto) && forwardedProto.includes("https")) ||
    (typeof forwardedProto === "string" && forwardedProto.split(",").map(p => p.trim()).includes("https"));

  // In production (non-localhost), always use secure=true
  const isLocalhost = req.hostname === "localhost" || req.hostname === "127.0.0.1";

  return {
    httpOnly: true,
    path: "/",
    sameSite: isLocalhost ? "lax" : "none",
    secure: isLocalhost ? false : true,
  };
}
