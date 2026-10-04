import { describe, expect, it } from "vitest";
import { isValidExternalReportDate } from "../shared/externalReportDate";

describe("External Report date validation", () => {
  it("accepts the current Istanbul clinic date across the UTC midnight boundary", () => {
    // 21:30 UTC is 00:30 the following day in Europe/Istanbul.
    const lateUtc = new Date("2026-08-29T21:30:00.000Z");
    expect(isValidExternalReportDate("2026-08-30", lateUtc)).toBe(true);
    expect(isValidExternalReportDate("2026-08-31", lateUtc)).toBe(false);
  });

  it("rejects impossible dates and dates before 1900", () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    expect(isValidExternalReportDate("2026-02-30", now)).toBe(false);
    expect(isValidExternalReportDate("1899-12-31", now)).toBe(false);
  });
});
