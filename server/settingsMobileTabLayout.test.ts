import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "client/src/pages/SettingsPage.tsx"), "utf8");

describe("Settings mobile tab layout", () => {
  it("uses a horizontal scroll rail instead of wrapping overlapping tabs on mobile", () => {
    expect(page).toContain('overflow-x-auto px-4 pb-2 pt-0.5');
    expect(page).toContain('min-w-max flex-nowrap gap-2 p-1.5');
    expect(page).not.toContain('flex-wrap h-auto gap-1 w-full');
  });

  it("preserves a touch-sized target and breathing room for each tab", () => {
    expect(page).toContain('h-10 shrink-0 whitespace-nowrap px-4 py-2');
  });
});
