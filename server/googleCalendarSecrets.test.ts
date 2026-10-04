import { describe, expect, it } from "vitest";

const requiredGoogleSecretKeys = [
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_REDIRECT_URI",
  "GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY",
] as const;

import { buildGoogleAuthorizationUrl } from "./googleCalendarService";

describe("Google Calendar G1 secret configuration", () => {
  it("provides the required server-only OAuth values without exposing them", () => {
    for (const key of requiredGoogleSecretKeys) {
      expect(process.env[key]?.trim(), `${key} must be configured`).toBeTruthy();
    }
  });

  it("uses a 32-byte Base64 key for durable-token encryption", () => {
    const encodedKey = process.env.GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY;
    expect(encodedKey).toBeTruthy();

    const encryptionKey = Buffer.from(encodedKey!, "base64");
    expect(encryptionKey).toHaveLength(32);
  });

  it("builds an authorization request accepted by Google without exposing its URL", async () => {
    const url = new URL(buildGoogleAuthorizationUrl("g1-safe-authorization-shape-test"));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("g1-safe-authorization-shape-test");
    expect(url.searchParams.get("redirect_uri")).toBe(process.env.GOOGLE_OAUTH_REDIRECT_URI);
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/calendar.events.owned");

    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    expect(response.status, "Google must accept the authorization request and return a redirect").toBe(302);
  });
});
