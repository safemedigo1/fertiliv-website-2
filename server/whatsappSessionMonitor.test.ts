import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../client/src/pages/WhatsAppSessionMonitorPage.tsx", import.meta.url), "utf8");

describe("Linked Device disposable session monitor", () => {
  it("does not present stale identity when the disposable session is gone", () => {
    expect(source).toContain('session.lifecycleState !== "connected" || session.sessionState !== "connected"');
    expect(source).toContain("No linked device session");
    expect(source).toContain("Connected — identity hint unavailable");
    expect(source).toContain('session.lifecycleState === "connected" && (session.providerPushName || session.providerPlatform)');
  });

  it("keeps the persistent line and history boundary explicit", () => {
    expect(source).toContain("preserving the Fertiliv line, staff permissions, and Inbox history");
    expect(source).toContain("Explicit logout removes the disposable WPPConnect session");
  });
});
