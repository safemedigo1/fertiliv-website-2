import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { resolveBankDeduction } from "./db";
import { computePaymentSettlement } from "../shared/invoicePricing";

describe("Bank Deduction payment facts", () => {
  it("derives a net Bank Transfer amount from a deduction amount", () => {
    const result = resolveBankDeduction({ amount: "1000.00", method: "bank_transfer", bankDeduction: { amount: "25.50" } });
    expect(result.grossAmount?.toFixed(2)).toBe("1000.00");
    expect(result.deductionAmount?.toFixed(2)).toBe("25.50");
    expect(result.netAmount.toFixed(2)).toBe("974.50");
  });

  it("derives a net Bank Transfer amount from a percentage with financial rounding", () => {
    const result = resolveBankDeduction({ amount: "100.00", method: "bank_transfer", bankDeduction: { percent: "2.5" } });
    expect(result.deductionAmount?.toFixed(2)).toBe("2.50");
    expect(result.netAmount.toFixed(2)).toBe("97.50");
  });

  it("rejects dual and invalid Bank Deduction inputs", () => {
    expect(() => resolveBankDeduction({ amount: "100", method: "bank_transfer", bankDeduction: { amount: "1", percent: "1" } })).toThrow("either an amount or a percentage");
    expect(() => resolveBankDeduction({ amount: "100", method: "bank_transfer", bankDeduction: { amount: "100" } })).toThrow("lower than the amount sent");
  });

  it("uses method_neutral_v2 for every new-model method, even with a legacy-like rate snapshot", () => {
    for (const method of ["cash", "credit_card", "bank_transfer"]) {
      expect(computePaymentSettlement({ amount: "123", method, pricingMode: "discount", adjustmentRateSnapshot: "23", settlementModelVersion: "method_neutral_v2" }).settledAmount).toBe("123.00");
    }
  });

  it("preserves legacy non-cash settlement only when the v2 marker is absent", () => {
    expect(computePaymentSettlement({ amount: "123", method: "credit_card", pricingMode: "discount", adjustmentRateSnapshot: "23" }).settledAmount).toBe("100.00");
  });

  it("settles Bank Deduction net amount under v2 before FX or allocation", () => {
    const deduction = resolveBankDeduction({ amount: "123.00", method: "bank_transfer", bankDeduction: { amount: "3.00" } });
    expect(computePaymentSettlement({ amount: deduction.netAmount.toFixed(2), method: "bank_transfer", pricingMode: "discount", adjustmentRateSnapshot: "23", settlementModelVersion: "method_neutral_v2" }).settledAmount).toBe("120.00");
  });

  it("passes Bank Deduction through both initial-payment preview and atomic invoice creation", () => {
    const root = path.resolve(__dirname, "..");
    const db = fs.readFileSync(path.join(root, "server/db.ts"), "utf8");
    const routers = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");
    expect(db).toContain("bankDeduction: payment.bankDeduction");
    expect(routers).toContain("previewInitialPayments");
    expect(routers).toContain("bankDeduction: z.object({ amount: z.string().optional(), percent: z.string().optional() }).optional()");
  });

  it("persists and quotes all new invoices with the canonical v2 settlement marker", () => {
    const root = path.resolve(__dirname, "..");
    const serviceTax = fs.readFileSync(path.join(root, "shared/serviceTax.ts"), "utf8");
    const pricing = fs.readFileSync(path.join(root, "shared/invoicePricing.ts"), "utf8");
    const db = fs.readFileSync(path.join(root, "server/db.ts"), "utf8");
    const routers = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");
    expect(serviceTax).toContain('METHOD_NEUTRAL_SETTLEMENT_MODEL_VERSION = "method_neutral_v2"');
    expect(routers).toContain("settlementModelVersion: METHOD_NEUTRAL_SETTLEMENT_MODEL_VERSION");
    expect(routers).toContain('settlementModelVersion: "method_neutral_v2"');
    expect(pricing).toContain("isMethodNeutralSettlementModel(input.settlementModelVersion)");
    expect(db).toContain('settlementModelVersion = "method_neutral_v2"');
    expect(db).toContain('input.settlementModelVersion ?? "method_neutral_v2"');
  });
});
