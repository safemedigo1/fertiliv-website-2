import Decimal from "decimal.js";
import { quantizeFinanceMoney } from "./invoicePricing";

export type InvoiceDualBalancePresentationInput = {
  totalAmount: number | string | null | undefined;
  taxAmount: number | string | null | undefined;
  netSettled: number | string | null | undefined;
  taxModelVersion?: string | null;
};

export type InvoiceDualBalancePresentation = {
  /** Only modern line-tax invoices expose the informational pre-tax remainder. */
  shouldShowRemainingServiceAmountBeforeTax: boolean;
  /** Tax-exclusive service obligation remaining after canonical net settlement. */
  remainingServiceAmountBeforeTax: string;
  /** Canonical tax-inclusive amount that remains payable. */
  totalBalanceDueIncludingTax: string;
};

/**
 * Presentation-only dual balance disclosure. It never changes invoice facts,
 * settlement allocation, refund capacity, or Patient Credit. Both outputs use
 * the existing Finance monetary rounding convention and canonical net settlement.
 */
export function deriveInvoiceDualBalancePresentation(
  input: InvoiceDualBalancePresentationInput,
): InvoiceDualBalancePresentation {
  const total = quantizeFinanceMoney(input.totalAmount ?? 0);
  const tax = quantizeFinanceMoney(input.taxAmount ?? 0);
  const netSettled = quantizeFinanceMoney(input.netSettled ?? 0);
  const serviceTotalBeforeTax = quantizeFinanceMoney(Decimal.max(0, total.minus(tax)));
  const remainingService = quantizeFinanceMoney(Decimal.max(0, serviceTotalBeforeTax.minus(netSettled)));
  const totalBalanceDue = quantizeFinanceMoney(Decimal.max(0, total.minus(netSettled)));

  return {
    shouldShowRemainingServiceAmountBeforeTax: input.taxModelVersion === "line_tax_v1" && tax.gt(0),
    remainingServiceAmountBeforeTax: remainingService.toFixed(2),
    totalBalanceDueIncludingTax: totalBalanceDue.toFixed(2),
  };
}
