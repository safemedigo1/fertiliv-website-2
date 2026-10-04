import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ saveGoogleCalendarConnection: vi.fn() }));

vi.mock("./db", async importOriginal => ({
  ...(await importOriginal<typeof import("./db")>()),
  saveGoogleCalendarConnection: mocks.saveGoogleCalendarConnection,
}));

import { exchangeAndSaveGoogleAuthorization } from "./googleCalendarService";

describe("Google Calendar G1 authorization callback", () => {
  beforeEach(() => {
    mocks.saveGoogleCalendarConnection.mockReset();
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "test-access-token", refresh_token: "test-refresh-token" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ email: "clinic@example.test", email_verified: true }), { status: 200 })));
  });

  it("exchanges a callback code and persists only an encrypted durable credential", async () => {
    await exchangeAndSaveGoogleAuthorization("test-authorization-code", 99);

    expect(mocks.saveGoogleCalendarConnection).toHaveBeenCalledWith(expect.objectContaining({
      connectedAccountEmail: "clinic@example.test",
      connectedByUserId: 99,
    }));
    const persisted = mocks.saveGoogleCalendarConnection.mock.calls[0]?.[0] as { encryptedRefreshToken: string };
    expect(persisted.encryptedRefreshToken).not.toContain("test-refresh-token");
    expect(persisted.encryptedRefreshToken).toMatch(/^v1\./);
  });
});
