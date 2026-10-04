import { describe, expect, it } from "vitest";
import { calculateOutstandingReportingTRY } from "../shared/reportingFx";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Finance Outstanding reporting-FX valuation", () => {
  it("OFR-1 values current native USD and TRY open balances in TRY with approved reporting FX", () => {
    expect(calculateOutstandingReportingTRY(
      [
        { currency: "USD", nativeOutstanding: "35.06" },
        { currency: "USD", nativeOutstanding: "128.49" },
        { currency: "TRY", nativeOutstanding: "970.02" },
        { currency: "TRY", nativeOutstanding: "11000.00" },
      ],
      [{ currency: "USD", rate: "47.73269690" }],
    )).toBe(19776.7);
  });

  it("OFR-2 refuses an incomplete aggregation when a required current reporting rate is unavailable", () => {
    expect(calculateOutstandingReportingTRY(
      [{ currency: "USD", nativeOutstanding: "35.06" }],
      [],
    )).toBeNull();
  });

  it("OFR-3 preserves native TRY balances without an FX rate", () => {
    expect(calculateOutstandingReportingTRY(
      [{ currency: "TRY", nativeOutstanding: "11000" }],
      [],
    )).toBe(11000);
  });

  it("OFR-4 keeps the valuation outside immutable transaction FX and financial-row mutation paths", () => {
    const db = read("server/db.ts");
    expect(db).toContain('import { calculateOutstandingReportingTRY } from "../shared/reportingFx"');
    expect(db).toContain("const reportingOutstanding = reportingFxUnavailable");
    expect(db).toContain("outstandingReportingFx");
    expect(db).not.toContain("exchangeRateSnapshot: String(reportingRates");
  });

  it("OFR-5 shows an unobtrusive valuation as-of note while retaining a safe missing-rate message", () => {
    const page = read("client/src/pages/FinancePage.tsx");
    expect(page).toContain("formatOutstandingAsOf");
    expect(page).toContain("A current reporting FX rate is unavailable");
    expect(page).toContain("outstandingReportingFx");
  });
});
