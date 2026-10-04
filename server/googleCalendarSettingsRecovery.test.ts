import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const settingsPage = fs.readFileSync(path.join(root, "client/src/pages/SettingsPage.tsx"), "utf8");

describe("Google Calendar recovery controls", () => {
  it("allows the explicit non-clinical test when a destination exists, even while needs_attention is being recovered", () => {
    expect(settingsPage).toContain('onClick={() => testConnection.mutate()} disabled={!connection.destinationCalendar || isBusy}');
    expect(settingsPage).not.toContain('testConnection.mutate()} disabled={!connection.destinationCalendar || connection.status !== "connected"');
  });

  it("keeps calendar discovery and destination selection gated by healthy connection state", () => {
    expect(settingsPage).toContain('const canLoadCalendars = connection?.connected && connection.status === "connected"');
    expect(settingsPage).toContain('disabled={!canLoadCalendars || calendarsQuery.isFetching}');
    expect(settingsPage).toContain('disabled={!canLoadCalendars || calendarsQuery.isFetching || isBusy}');
  });
});
