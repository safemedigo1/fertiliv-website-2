import { describe, expect, it } from "vitest";
import { hasCurrentLinkedIdentity, linkedDeviceProviderStatus, monitoredHealth } from "./whatsappConnectionsPlatform";

describe("Linked Device session monitoring", () => {
  it("marks a connected session stale when no recent server health refresh exists", () => {
    const now = Date.UTC(2026, 8, 24, 18, 0, 0);
    expect(monitoredHealth({ health: "healthy", lifecycle: "connected", lastCheckedAt: new Date(now - 16 * 60 * 1000) }, now)).toBe("Stale — refresh required");
  });

  it("keeps a recently checked connected session healthy", () => {
    const now = Date.UTC(2026, 8, 24, 18, 0, 0);
    expect(monitoredHealth({ health: "healthy", lifecycle: "connected", lastCheckedAt: new Date(now - 5 * 60 * 1000) }, now)).toBe("Healthy");
  });

  it("labels a reachable QR-ready lifecycle ready without calling it connected", () => {
    const now = Date.UTC(2026, 8, 24, 18, 0, 0);
    expect(monitoredHealth({ health: "unknown", lifecycle: "qr_ready", lastCheckedAt: null }, now)).toBe("Ready");
  });

  it("exposes current identity only when both line and disposable session are connected", () => {
    expect(hasCurrentLinkedIdentity("connected", "connected")).toBe(true);
    expect(hasCurrentLinkedIdentity("qr_ready", "connected")).toBe(false);
    expect(hasCurrentLinkedIdentity("connected", "not_started")).toBe(false);
    expect(hasCurrentLinkedIdentity("logged_out", null)).toBe(false);
  });

  it("labels WPPConnect Server by its actual transport instead of the sandbox", () => {
    expect(linkedDeviceProviderStatus("wppconnect_server", "connected")).toBe("WPPConnect Server");
    expect(linkedDeviceProviderStatus("wppconnect_in_app_sandbox", "qr_ready")).toBe("WPPConnect sandbox ready");
  });

  it("excludes disabled deleted lines from active connection and session-monitor queries", async () => {
    const source = await import("node:fs/promises").then((fs) => fs.readFile(new URL("./whatsappConnectionsPlatform.ts", import.meta.url), "utf8"));
    expect(source).toContain('where(ne(whatsappLinkedDeviceLines.lifecycleState, "disabled"))');
  });
});
