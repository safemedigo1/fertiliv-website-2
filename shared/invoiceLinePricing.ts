import Decimal from "decimal.js";

const LineDecimal = Decimal.clone({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export const invoiceLinePricingMethods = ["none", "discount_percent", "final_line_total", "agreed_unit_price"] as const;
export type InvoiceLinePricingMethod = typeof invoiceLinePricingMethods[number];

export interface InvoiceLinePricingInput {
  quantity: number | string;
  unitPrice: number | string;
  linePricingMethod?: InvoiceLinePricingMethod | null;
  lineDiscountPercent?: number | string | null;
  /** Required for fixed whole-line or already-canonicalised agreed-unit line totals. */
  totalPrice?: number | string | null;
  /** Forward-only marker: unitPrice × quantity is a staff-entered gross amount. */
  taxIncludedMode?: boolean | null;
}

export interface CanonicalInvoiceLinePricing {
  quantity: number;
  unitPrice: string;
  linePricingMethod: InvoiceLinePricingMethod;
  lineDiscountPercent: string | null;
  totalPrice: string;
}

/**
 * Calculates the one canonical patient-facing total for an invoice line.
 * unitPrice always remains the line's original/standard per-unit snapshot;
 * V4 never derives a substitute unit price from a negotiated final line total.
 */
export function computeInvoiceLinePricing(input: InvoiceLinePricingInput): CanonicalInvoiceLinePricing {
  const quantity = Number(input.quantity);
  const unitPrice = new LineDecimal(String(input.unitPrice));
  const method = (input.linePricingMethod ?? "none") as InvoiceLinePricingMethod;

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Line quantity must be a whole number of at least 1.");
  }
  if (!unitPrice.isFinite() || unitPrice.lt(0)) {
    throw new Error("Standard unit price cannot be negative.");
  }
  if (!invoiceLinePricingMethods.includes(method)) {
    throw new Error("Line pricing method is invalid.");
  }

  const originalLineSubtotal = unitPrice.mul(quantity);
  let totalPrice: Decimal;
  let lineDiscountPercent: string | null = null;

  if (method === "discount_percent") {
    const discount = new LineDecimal(String(input.lineDiscountPercent ?? ""));
    if (!discount.isFinite() || discount.lt(0) || discount.gt(100)) {
      throw new Error("Line discount percent must be between 0 and 100.");
    }
    totalPrice = originalLineSubtotal.mul(new LineDecimal(1).minus(discount.div(100)));
    lineDiscountPercent = discount.toDecimalPlaces(2).toFixed(2);
  } else if (method === "final_line_total" || method === "agreed_unit_price" || input.taxIncludedMode === true) {
    totalPrice = new LineDecimal(String(input.totalPrice ?? ""));
    if (!totalPrice.isFinite() || totalPrice.lt(0)) {
      throw new Error(method === "agreed_unit_price" ? "Agreed unit line total cannot be negative." : "Taxable line total cannot be negative.");
    }
  } else {
    totalPrice = originalLineSubtotal;
  }

  return {
    quantity,
    unitPrice: unitPrice.toDecimalPlaces(2).toFixed(2),
    linePricingMethod: method,
    lineDiscountPercent,
    totalPrice: totalPrice.toDecimalPlaces(2).toFixed(2),
  };
}
