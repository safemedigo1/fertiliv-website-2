import Decimal from "decimal.js";
import { quantizeFinanceMoney } from "./invoicePricing";

export type RefundAwareSettlementTotals = {
  grossExternalSettled: Decimal;
  nonCashSettled: Decimal;
  grossSettled: Decimal;
  refunded: Decimal;
  netSettled: Decimal;
  maxRefundable: Decimal;
};

/**
 * Computes current invoice settlement without turning non-cash credit or FX
 * rounding adjustments into refundable external cash. Callers must provide
 * already de-duplicated payment settlement amounts.
 */
export function computeRefundAwareSettlementTotals(input: {
  externalSettlementAmounts: Array<Decimal.Value>;
  nonCashSettlementAmounts: Array<Decimal.Value>;
  refundAmountsInInvoiceCurrency: Array<Decimal.Value>;
}): RefundAwareSettlementTotals {
  const grossExternalSettled = quantizeFinanceMoney(input.externalSettlementAmounts
    .reduce<Decimal>((sum, amount) => sum.plus(String(amount)), new Decimal(0)));
  const nonCashSettled = quantizeFinanceMoney(input.nonCashSettlementAmounts
    .reduce<Decimal>((sum, amount) => sum.plus(String(amount)), new Decimal(0)));
  const grossSettled = quantizeFinanceMoney(grossExternalSettled.plus(nonCashSettled));
  const refunded = quantizeFinanceMoney(input.refundAmountsInInvoiceCurrency
    .reduce<Decimal>((sum, amount) => sum.plus(String(amount)), new Decimal(0)));
  return {
    grossExternalSettled,
    nonCashSettled,
    grossSettled,
    refunded,
    netSettled: quantizeFinanceMoney(Decimal.max(0, grossSettled.minus(refunded))),
    maxRefundable: quantizeFinanceMoney(Decimal.max(0, grossExternalSettled.minus(refunded))),
  };
}
