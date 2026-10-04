import { deriveInvoiceLineDiscountPresentation } from "./invoiceLineDiscount";

export type InvoicePdfLinePricing = {
  linePricingMethod?: "none" | "discount_percent" | "final_line_total" | "agreed_unit_price";
  lineDiscountPercent?: number | string | null;
  /** Immutable standard Unit Price × Qty reference carried into the PDF. */
  originalLineTotal?: number | string | null;
  /** Authoritative adjusted pre-tax line amount carried into the PDF. */
  totalPrice?: number | string | null;
};

/**
 * Presentation-only DISC% display from the effective pre-tax line result.
 * A persisted percentage keeps its historical one-decimal formatting; agreed
 * unit and final-line adjustments expose the derived rate from the monetary
 * facts. Invoice-wide discounts remain summary-only and are excluded.
 */
export function getInvoicePdfLineDiscountDisplay(item: InvoicePdfLinePricing): string | null {
  const derived = deriveInvoiceLineDiscountPresentation({
    originalLineTotal: item.originalLineTotal,
    finalLineTotal: item.totalPrice,
  });
  if (!derived.applies) return null;

  if (item.linePricingMethod === "discount_percent" && Number(item.lineDiscountPercent ?? 0) > 0) {
    return `${Number(item.lineDiscountPercent).toFixed(1)}%`;
  }
  return `${derived.discountPercent}%`;
}

export function shouldShowInvoiceLineDiscountColumn(items: InvoicePdfLinePricing[]): boolean {
  return items.some((item) => getInvoicePdfLineDiscountDisplay(item) !== null);
}
