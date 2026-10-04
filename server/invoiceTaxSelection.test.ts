import { describe, expect, it } from "vitest";
import { resolveTaxForNewInvoiceLine } from "../shared/invoiceTaxSelection";

const activeRules = new Map([
  [1, { id: 1, label: "Category Tax", ratePercent: "5.0000", isActive: true }],
  [2, { id: 2, label: "Service Tax", ratePercent: "15.5000", isActive: true }],
  [3, { id: 3, label: "Explicit Tax", ratePercent: "23.0000", isActive: true }],
]);

describe("invoice Tax selection precedence", () => {
  it("uses an explicit saved Tax Rule ahead of Service override and Category default", () => {
    expect(resolveTaxForNewInvoiceLine({
      explicitLineTaxSelection: { type: "rule", taxRuleId: 3 },
      servicePolicy: { taxOverrideMode: "rule", taxOverrideRuleId: 2 },
      categoryDefaultRule: activeRules.get(1),
      activeRulesById: activeRules,
    })).toEqual({ taxRuleId: 3, taxLabelSnapshot: "Explicit Tax", taxRateSnapshot: "23.0000", source: "explicit" });
  });

  it("uses a Service override ahead of the Category default", () => {
    expect(resolveTaxForNewInvoiceLine({
      servicePolicy: { taxOverrideMode: "rule", taxOverrideRuleId: 2 },
      categoryDefaultRule: activeRules.get(1),
      activeRulesById: activeRules,
    })).toEqual({ taxRuleId: 2, taxLabelSnapshot: "Service Tax", taxRateSnapshot: "15.5000", source: "service_override" });
  });

  it("uses Service No Tax ahead of a Category default", () => {
    expect(resolveTaxForNewInvoiceLine({
      servicePolicy: { taxOverrideMode: "no_tax" },
      categoryDefaultRule: activeRules.get(1),
      activeRulesById: activeRules,
    })).toEqual({ taxRuleId: null, taxLabelSnapshot: null, taxRateSnapshot: null, source: "service_override" });
  });

  it("falls through to the active Category default and then No Tax", () => {
    expect(resolveTaxForNewInvoiceLine({ categoryDefaultRule: activeRules.get(1), activeRulesById: activeRules }))
      .toMatchObject({ taxRuleId: 1, taxLabelSnapshot: "Category Tax", source: "category_default" });
    expect(resolveTaxForNewInvoiceLine({ activeRulesById: activeRules }))
      .toEqual({ taxRuleId: null, taxLabelSnapshot: null, taxRateSnapshot: null, source: "none" });
  });

  it("persists Custom Tax 0% separately from No Tax and normalizes four decimals", () => {
    expect(resolveTaxForNewInvoiceLine({
      explicitLineTaxSelection: { type: "custom", ratePercent: "0" },
      activeRulesById: activeRules,
    })).toEqual({ taxRuleId: null, taxLabelSnapshot: "Custom Tax", taxRateSnapshot: "0.0000", source: "explicit" });
    expect(resolveTaxForNewInvoiceLine({
      explicitLineTaxSelection: { type: "custom", ratePercent: "7.125" },
      activeRulesById: activeRules,
    })).toMatchObject({ taxLabelSnapshot: "Custom Tax", taxRateSnapshot: "7.1250" });
  });

  it("rejects an unavailable explicit Tax Rule and invalid Custom Tax precision", () => {
    expect(() => resolveTaxForNewInvoiceLine({
      explicitLineTaxSelection: { type: "rule", taxRuleId: 999 },
      activeRulesById: activeRules,
    })).toThrow("active Tax Rule");
    expect(() => resolveTaxForNewInvoiceLine({
      explicitLineTaxSelection: { type: "custom", ratePercent: "7.12345" },
      activeRulesById: activeRules,
    })).toThrow("up to 4 decimal places");
  });
});
