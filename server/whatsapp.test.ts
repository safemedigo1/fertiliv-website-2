import { describe, it, expect } from "vitest";
import { normalizePhone } from "./whatsapp";

describe("WhatsApp phone normalization", () => {
  it("converts 00 prefix to +", () => {
    expect(normalizePhone("00905011147060")).toBe("+905011147060");
  });

  it("keeps + prefix unchanged", () => {
    expect(normalizePhone("+905011147060")).toBe("+905011147060");
  });

  it("adds + when missing", () => {
    expect(normalizePhone("905011147060")).toBe("+905011147060");
  });

  it("strips spaces and dashes", () => {
    expect(normalizePhone("+90 501 114 70 60")).toBe("+905011147060");
    expect(normalizePhone("+90-501-114-70-60")).toBe("+905011147060");
  });
});

describe("WhatsApp transport", () => {
  it("loads phone normalization without the retired Meta Cloud token", () => {
    expect(typeof normalizePhone).toBe("function");
  });
});
