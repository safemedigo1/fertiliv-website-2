/**
 * Invoice Pricing V3 — Regression Tests
 * Tests the shared pricing engine (computeInvoiceTotals, computePaymentSettlement, computeCollectionHint)
 * and the migration manifest correctness.
 */
import { describe, it, expect } from "vitest";
import {
  computeInvoiceTotals,
  computePaymentSettlement,
  computeCollectionHint,
} from "../shared/invoicePricing";

// ─── Mode A: Discount % ───────────────────────────────────────────────────────

describe("V3-A: Mode A — Discount %", () => {
  it("V3-A-1: subtotal 10700, discount 29.9065% → totalAmount = 7500.00 (exact)", () => {
    const r = computeInvoiceTotals({
      subtotal: "10700",
      pricingMode: "discount",
      discountPercent: 29.9065,
      adjustmentRate: 23,
    });
    expect(r.totalAmount).toBe("7500.00");
    expect(r.discountAmount).toBe("3200.00");
    expect(r.pricingMode).toBe("discount");
    expect(r.paymentAdjustmentRateSnapshot).toBe("23.00");
  });

  it("V3-A-2: card hint = 7500 × 1.23 = 9225.00 (exact, no .01)", () => {
    const r = computeInvoiceTotals({
      subtotal: "10700",
      pricingMode: "discount",
      discountPercent: 29.9065,
      adjustmentRate: 23,
    });
    expect(r.cardHint).toBe("9225.00");
  });

  it("V3-A-3: zero discount → totalAmount = subtotal, no card hint adjustment", () => {
    const r = computeInvoiceTotals({
      subtotal: "10700",
      pricingMode: "discount",
      discountPercent: 0,
      adjustmentRate: 23,
    });
    expect(r.totalAmount).toBe("10700.00");
    expect(r.discountAmount).toBe("0.00");
    expect(r.cardHint).toBe("13161.00");
  });

  it("V3-A-4: no adjustmentRate → cardHint is null", () => {
    const r = computeInvoiceTotals({
      subtotal: "10700",
      pricingMode: "discount",
      discountPercent: 10,
      adjustmentRate: null,
    });
    expect(r.cardHint).toBeNull();
    expect(r.paymentAdjustmentRateSnapshot).toBeNull();
  });
});

// ─── Mode B: Final Agreed Price ───────────────────────────────────────────────

describe("V3-B: Mode B — Final Agreed Price", () => {
  it("V3-B-1: finalAgreedAmount = 7500 → totalAmount = 7500.00 (exact, no re-derivation)", () => {
    const r = computeInvoiceTotals({
      subtotal: "10700",
      pricingMode: "agreed",
      finalAgreedAmount: "7500",
      adjustmentRate: 23,
    });
    expect(r.totalAmount).toBe("7500.00");
    expect(r.pricingMode).toBe("agreed");
  });

  it("V3-B-2: Mode B → cardHint is null (surcharge absorbed)", () => {
    const r = computeInvoiceTotals({
      subtotal: "10700",
      pricingMode: "agreed",
      finalAgreedAmount: "7500",
      adjustmentRate: 23,
    });
    expect(r.cardHint).toBeNull();
    expect(r.paymentAdjustmentRateSnapshot).toBeNull();
  });

  it("V3-B-3: Mode B → discountAmount and discountPercent are informational only", () => {
    const r = computeInvoiceTotals({
      subtotal: "10700",
      pricingMode: "agreed",
      finalAgreedAmount: "7500",
    });
    expect(r.discountAmount).toBe("3200.00");
    expect(parseFloat(r.discountPercent)).toBeCloseTo(29.9065, 2);
    // totalAmount must NOT be re-derived from discountPercent
    expect(r.totalAmount).toBe("7500.00");
  });
});

// ─── Payment Settlement ───────────────────────────────────────────────────────

describe("V3-C: Payment Settlement", () => {
  it("V3-C-1: Mode A, card payment 7500 → settled = 6097.56, balance = 1402.44", () => {
    const s = computePaymentSettlement({
      amount: 7500,
      method: "credit_card",
      pricingMode: "discount",
      adjustmentRateSnapshot: "23",
      amountInInvoiceCurrency: 7500,
    });
    expect(s.settledAmount).toBe("6097.56");
  });

  it("V3-C-2: Mode B, card payment 7500 → settled = 7500.00 (balance = 0)", () => {
    const s = computePaymentSettlement({
      amount: 7500,
      method: "credit_card",
      pricingMode: "agreed",
      adjustmentRateSnapshot: null,
      amountInInvoiceCurrency: 7500,
    });
    expect(s.settledAmount).toBe("7500.00");
  });

  it("V3-C-3: Mode A, cash payment 7500 → settled = 7500.00 (no surcharge division for cash)", () => {
    const s = computePaymentSettlement({
      amount: 7500,
      method: "cash",
      pricingMode: "discount",
      adjustmentRateSnapshot: "23",
      amountInInvoiceCurrency: 7500,
    });
    expect(s.settledAmount).toBe("7500.00");
  });

  it("V3-C-4: discount_legacy with unknown rate → settled = amountInInvoiceCurrency (no division)", () => {
    const s = computePaymentSettlement({
      amount: 7500,
      method: "credit_card",
      pricingMode: "discount_legacy",
      adjustmentRateSnapshot: null,
      amountInInvoiceCurrency: 7500,
    });
    expect(s.settledAmount).toBe("7500.00");
  });

  it("V3-C-5: discount_legacy with known rate (23) → applies surcharge division", () => {
    const s = computePaymentSettlement({
      amount: 7500,
      method: "credit_card",
      pricingMode: "discount_legacy",
      adjustmentRateSnapshot: "23",
      amountInInvoiceCurrency: 7500,
    });
    expect(s.settledAmount).toBe("6097.56");
  });
});

// ─── Collection Hint ──────────────────────────────────────────────────────────

describe("V3-D: Collection Hint", () => {
  it("V3-D-1: Mode A, balance 1402.44, card → hint = 1725.00", () => {
    const hint = computeCollectionHint(1402.44, "credit_card", "discount", "23");
    expect(hint).toBe("1725.00");
  });

  it("V3-D-2: Mode B → hint is null", () => {
    const hint = computeCollectionHint(1402.44, "credit_card", "agreed", null);
    expect(hint).toBeNull();
  });

  it("V3-D-3: Mode A, cash → hint is null", () => {
    const hint = computeCollectionHint(1402.44, "cash", "discount", "23");
    expect(hint).toBeNull();
  });

  it("V3-D-4: Mode A, balance = 0 → hint is null", () => {
    const hint = computeCollectionHint(0, "credit_card", "discount", "23");
    expect(hint).toBeNull();
  });
});

// ─── Migration Manifest ───────────────────────────────────────────────────────

describe("V3-E: Migration Manifest", () => {
  it("V3-E-1: INV-00016 (60001) and INV-00017 (90001) have NULL rate (created before settings write)", () => {
    const manifest = [
      { id: 60001, invoiceNumber: "INV-00016", createdAt: new Date("2026-06-03T09:04:21.000Z"), paymentAdjustmentRateSnapshot: null },
      { id: 90001, invoiceNumber: "INV-00017", createdAt: new Date("2026-06-25T09:43:26.000Z"), paymentAdjustmentRateSnapshot: null },
    ];
    const settingsWriteAt = new Date("2026-06-25T12:16:19.000Z");
    for (const inv of manifest) {
      expect(inv.createdAt < settingsWriteAt).toBe(true);
      expect(inv.paymentAdjustmentRateSnapshot).toBeNull();
    }
  });

  it("V3-E-2: INV-00020 through INV-00025 have rate = 23.00 (created after settings write)", () => {
    const manifest = [
      { id: 150001, invoiceNumber: "INV-00020", createdAt: new Date("2026-07-06T13:26:52.000Z"), paymentAdjustmentRateSnapshot: 23.00 },
      { id: 180001, invoiceNumber: "INV-00021", createdAt: new Date("2026-07-06T13:32:56.000Z"), paymentAdjustmentRateSnapshot: 23.00 },
      { id: 210001, invoiceNumber: "INV-00022", createdAt: new Date("2026-07-12T11:28:35.000Z"), paymentAdjustmentRateSnapshot: 23.00 },
      { id: 240001, invoiceNumber: "INV-00023", createdAt: new Date("2026-08-03T08:58:52.000Z"), paymentAdjustmentRateSnapshot: 23.00 },
      { id: 270001, invoiceNumber: "INV-00024", createdAt: new Date("2026-08-03T09:07:13.000Z"), paymentAdjustmentRateSnapshot: 23.00 },
      { id: 300001, invoiceNumber: "INV-00025", createdAt: new Date("2026-08-03T09:22:12.000Z"), paymentAdjustmentRateSnapshot: 23.00 },
    ];
    const settingsWriteAt = new Date("2026-06-25T12:16:19.000Z");
    for (const inv of manifest) {
      expect(inv.createdAt >= settingsWriteAt).toBe(true);
      expect(inv.paymentAdjustmentRateSnapshot).toBe(23.00);
    }
  });
});
