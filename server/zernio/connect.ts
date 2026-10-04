import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { Express, Request, Response } from "express";
import { createWhatsAppConnectUrl, listWhatsAppAccounts } from "./client";
import { ensureZernioLine, firstAdminUserId } from "./store";

function secret(): string {
  const value = process.env.JWT_SECRET?.trim();
  if (!value) throw new Error("JWT_SECRET is not configured");
  return value;
}

export function signZernioConnectState(userId: number, now = Date.now()): string {
  const exp = now + 15 * 60 * 1000;
  const payload = `${userId}.${exp}`;
  const mac = createHmac("sha256", secret()).update(payload).digest("hex");
  return Buffer.from(`${payload}.${mac}`, "utf8").toString("base64url");
}

export function readZernioConnectState(state: string, now = Date.now()): number | null {
  let decoded = "";
  try {
    decoded = Buffer.from(state, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const [userIdRaw, expRaw, mac] = decoded.split(".");
  if (!userIdRaw || !expRaw || !mac) return null;
  const payload = `${userIdRaw}.${expRaw}`;
  const expected = createHmac("sha256", secret()).update(payload).digest("hex");
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(mac, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const exp = Number(expRaw);
  const userId = Number(userIdRaw);
  if (!Number.isFinite(exp) || exp < now || !Number.isInteger(userId) || userId <= 0) return null;
  return userId;
}

export const ZERNIO_CONNECT_COMPLETE = "fertiliv:zernio-connect-complete";

export async function buildZernioConnectUrl(input: { userId: number; origin: string; popup?: boolean }): Promise<string> {
  const state = signZernioConnectState(input.userId);
  const redirect = new URL("/api/zernio/callback", input.origin);
  redirect.searchParams.set("state", state);
  // The connections page opens this URL in a popup and waits for postMessage.
  // The inbox button keeps the full-page return to /inbox.
  if (input.popup) redirect.searchParams.set("popup", "1");
  return createWhatsAppConnectUrl(redirect.toString());
}

function popupCloseDocument(ok: boolean): { html: string; nonce: string } {
  const nonce = randomBytes(16).toString("base64");
  const payload = JSON.stringify({ type: ZERNIO_CONNECT_COMPLETE, ok }).replaceAll("<", "\\u003c");
  const message = ok
    ? "WhatsApp is connected. This window will close."
    : "WhatsApp was not connected. You can close this window.";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="referrer" content="no-referrer" />
<title>WhatsApp</title>
<style nonce="${nonce}">
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif; color: #111827; background: #fff; }
  p { margin: 0; max-width: 24rem; padding: 1.5rem; text-align: center; }
</style>
</head>
<body>
<p>${message}</p>
<script nonce="${nonce}">
(function () {
  var payload = ${payload};
  try {
    if (window.opener && !window.opener.closed) window.opener.postMessage(payload, window.location.origin);
  } catch (e) {}
  window.close();
})();
</script>
</body>
</html>`;
  return { html, nonce };
}

function sendPopupClose(res: Response, ok: boolean) {
  const { html, nonce } = popupCloseDocument(ok);
  res.status(200);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`);
  res.send(html);
}

export function registerZernioCallback(app: Express) {
  app.get("/api/zernio/callback", async (req: Request, res: Response) => {
    const popup = req.query.popup === "1";
    const fail = (reason: "denied" | "error") => {
      console.info("[zernio] whatsapp callback closed", { popup, reason });
      if (popup) return sendPopupClose(res, false);
      return res.redirect(`/inbox?whatsapp=${reason}`);
    };
    try {
      const state = typeof req.query.state === "string" ? req.query.state : "";
      const userId = readZernioConnectState(state);
      if (!userId) return fail("denied");
      const accounts = await listWhatsAppAccounts();
      const actorId = userId || await firstAdminUserId();
      if (!actorId) return fail("denied");
      const linked = accounts.slice(0, 5);
      for (const account of linked) {
        await ensureZernioLine(account.id, actorId, account.username);
      }
      console.info("[zernio] whatsapp callback linked accounts", { count: linked.length, popup });
      if (linked.length === 0) return fail("error");
      if (popup) return sendPopupClose(res, true);
      return res.redirect("/inbox?whatsapp=connected");
    } catch (error) {
      console.error("[zernio] callback failed", error instanceof Error ? error.name : "error");
      return fail("error");
    }
  });
}
