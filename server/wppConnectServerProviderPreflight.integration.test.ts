import { describe, expect, it } from "vitest";
import { preflightWppConnectServerProvider } from "./wppConnectServerAdapter";

const required = [
  "WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SERVER_ADAPTER",
  "WPPCONNECT_BASE_URL",
  "WPPCONNECT_SECRET_KEY",
  "WPPCONNECT_WEBHOOK_URL",
  "WPPCONNECT_WEBHOOK_SECRET",
] as const;

const isConfigured = required.every(key => Boolean(process.env[key]?.trim()));

describe.runIf(isConfigured)("managed WPPConnect Server provider preflight", () => {
  it("performs HTTPS health and authenticated API-contract checks without creating a session or sending traffic", async () => {
    const result = await preflightWppConnectServerProvider();
    expect(result).toMatchObject({
      state: "provider_ready",
      transportEnabled:
        process.env.WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SERVER_ADAPTER === "true",
      callbackRoute:
        process.env.WHATSAPP_LINKED_DEVICE_ENABLE_WPPCONNECT_SERVER_ADAPTER === "true"
          ? "ready_when_enabled"
          : "registered_but_disabled",
    });
  }, 20_000);
});
