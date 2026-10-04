import type { Express, Request, Response } from "express";
import { createContext } from "./_core/context";
import {
  consumeGoogleCalendarOAuthState,
  createGoogleCalendarOAuthState,
} from "./db";
import {
  buildGoogleAuthorizationUrl,
  createGoogleOAuthState,
  exchangeAndSaveGoogleAuthorization,
  hashGoogleOAuthState,
} from "./googleCalendarService";

function getQueryValue(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

async function requireGoogleCalendarAdmin(req: Request, res: Response) {
  const context = await createContext({ req, res, info: {} as never });
  if (!context.user || context.user.role !== "admin") {
    res.redirect(302, "/settings?googleCalendar=unauthorized");
    return null;
  }
  return context.user;
}

export function registerGoogleCalendarRoutes(app: Express) {
  app.get("/api/google-calendar/oauth/start", async (req, res) => {
    const user = await requireGoogleCalendarAdmin(req, res);
    if (!user) return;
    try {
      const state = createGoogleOAuthState();
      await createGoogleCalendarOAuthState({
        stateHash: hashGoogleOAuthState(state),
        userId: user.id,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      res.redirect(302, buildGoogleAuthorizationUrl(state));
    } catch {
      res.redirect(302, "/settings?googleCalendar=configuration-error");
    }
  });

  app.get("/api/google-calendar/oauth/callback", async (req, res) => {
    const user = await requireGoogleCalendarAdmin(req, res);
    if (!user) return;
    const state = getQueryValue(req, "state");
    const code = getQueryValue(req, "code");
    const providerError = getQueryValue(req, "error");
    if (!state || !code || providerError) {
      res.redirect(302, "/settings?googleCalendar=connection-failed");
      return;
    }

    try {
      const isValidState = await consumeGoogleCalendarOAuthState(hashGoogleOAuthState(state), user.id);
      if (!isValidState) {
        res.redirect(302, "/settings?googleCalendar=invalid-state");
        return;
      }
      await exchangeAndSaveGoogleAuthorization(code, user.id);
      res.redirect(302, "/settings?googleCalendar=connected");
    } catch {
      // Intentionally avoid logging authorization codes, tokens, or provider payloads.
      res.redirect(302, "/settings?googleCalendar=connection-failed");
    }
  });
}
