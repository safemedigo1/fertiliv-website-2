import { describe, expect, it } from "vitest";
import { computeRefundAwareSettlementTotals } from "../shared/refundNetSettlement";

describe("refund-aware invoice settlement totals", () => {
  it("keeps an unreversed external payment fully settled and refundable", () => {
    const totals = computeRefundAwareSettlementTotals({
      externalSettlementAmounts: ["1000.00"],
      nonCashSettlementAmounts: [],
      refundAmountsInInvoiceCurrency: [],
    });
    expect(totals.grossSettled.toFixed(2)).toBe("1000.00");
    expect(totals.netSettled.toFixed(2)).toBe("1000.00");
    expect(totals.maxRefundable.toFixed(2)).toBe("1000.00");
  });

  it("subtracts a partial refund from net settlement while preserving gross receipts", () => {
    const totals = computeRefundAwareSettlementTotals({
      externalSettlementAmounts: ["1500.00"],
      nonCashSettlementAmounts: [],
      refundAmountsInInvoiceCurrency: ["500.00"],
    });
    expect(totals.grossExternalSettled.toFixed(2)).toBe("1500.00");
    expect(totals.refunded.toFixed(2)).toBe("500.00");
    expect(totals.netSettled.toFixed(2)).toBe("1000.00");
    expect(totals.maxRefundable.toFixed(2)).toBe("1000.00");
  });

  it("handles full refund and subsequent repayment without gross/net confusion", () => {
    const fullyRefunded = computeRefundAwareSettlementTotals({
      externalSettlementAmounts: ["500.00"],
      nonCashSettlementAmounts: [],
      refundAmountsInInvoiceCurrency: ["500.00"],
    });
    expect(fullyRefunded.netSettled.toFixed(2)).toBe("0.00");
    expect(fullyRefunded.maxRefundable.toFixed(2)).toBe("0.00");

    const repaid = computeRefundAwareSettlementTotals({
      externalSettlementAmounts: ["500.00", "500.00", "500.00"],
      nonCashSettlementAmounts: [],
      refundAmountsInInvoiceCurrency: ["500.00"],
    });
    expect(repaid.grossExternalSettled.toFixed(2)).toBe("1500.00");
    expect(repaid.netSettled.toFixed(2)).toBe("1000.00");
    expect(repaid.maxRefundable.toFixed(2)).toBe("1000.00");
  });

  it("never lets Patient Credit or FX rounding adjustment create cash refund capacity", () => {
    const totals = computeRefundAwareSettlementTotals({
      externalSettlementAmounts: ["500.00"],
      nonCashSettlementAmounts: ["499.55", "0.45"],
      refundAmountsInInvoiceCurrency: ["500.00"],
    });
    expect(totals.grossSettled.toFixed(2)).toBe("1000.00");
    expect(totals.netSettled.toFixed(2)).toBe("500.00");
    expect(totals.maxRefundable.toFixed(2)).toBe("0.00");
  });
});
