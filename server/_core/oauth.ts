import type { Express, Request, Response } from "express";

/**
 * Manus OAuth is retired. Staff sign in with Supabase Auth.
 * The old callback stays registered so bookmarks get a clear rejection
 * instead of a session created by the Manus portal.
 */
export function registerOAuthRoutes(app: Express) {
  app.get("/api/oauth/callback", (_req: Request, res: Response) => {
    console.info("[OAuth] Manus callback rejected; staff login is email and password.");
    res.status(410).json({ error: "This sign-in method is no longer available." });
  });
}
