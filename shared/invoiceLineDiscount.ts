import Decimal from "decimal.js";
import { quantizeFinanceMoney } from "./invoicePricing";

export type InvoiceLineDerivedDiscount = {
  applies: boolean;
  originalLineTotal: string;
  finalLineTotal: string;
  discountAmount: string;
  discountPercent: string;
};

/**
 * Presentation-only disclosure for a negotiated line that is lower than its
 * immutable standard reference. The negotiated monetary total remains the
 * financial fact; the percentage is never used to calculate or persist price.
 */
export function deriveInvoiceLineDiscountPresentation(input: {
  originalLineTotal: number | string | null | undefined;
  finalLineTotal: number | string | null | undefined;
}): InvoiceLineDerivedDiscount {
  const original = quantizeFinanceMoney(input.originalLineTotal ?? 0);
  const final = quantizeFinanceMoney(input.finalLineTotal ?? 0);
  const difference = quantizeFinanceMoney(Decimal.max(0, original.minus(final)));
  const applies = original.gt(0) && difference.gt(0);
  const percentage = applies
    ? difference.dividedBy(original).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    : new Decimal(0);

  return {
    applies,
    originalLineTotal: original.toFixed(2),
    finalLineTotal: final.toFixed(2),
    discountAmount: difference.toFixed(2),
    discountPercent: percentage.toFixed(2),
  };
}
