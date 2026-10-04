import Decimal from "decimal.js";

const TaxDecimal = Decimal.clone({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export const TAX_MODEL_VERSION = "line_tax_v1" as const;
export const METHOD_NEUTRAL_SETTLEMENT_MODEL_VERSION = "method_neutral_v2" as const;

/** The sole forward-only marker that disables legacy Card/Bank surcharge settlement. */
export function isMethodNeutralSettlementModel(version: string | null | undefined): boolean {
  return version === METHOD_NEUTRAL_SETTLEMENT_MODEL_VERSION;
}

export type ServiceTaxSnapshot = {
  taxRuleId: number | null;
  taxLabelSnapshot: string | null;
  taxRateSnapshot: string | null;
};

export type ServiceTaxAllocationLine = {
  /** Stable key used only for deterministic residual-cent allocation. */
  key: string | number;
  /** Existing V4 totalPrice: the line's pre-tax service amount. */
  totalPrice: number | string;
  tax: ServiceTaxSnapshot;
  /** UI input only: the requested whole-line gross. Not a persisted accounting field. */
  taxIncludedGross?: number | string | null;
};

export type ServiceTaxCalculatedLine = ServiceTaxAllocationLine & {
  effectiveTaxableBase: string;
  taxAmount: string;
  totalWithTax: string;
};

export type ServiceTaxInvoiceInput = {
  lines: ServiceTaxAllocationLine[];
  /** Invoice-wide discount entered against the pre-tax service subtotal. */
  invoiceWideDiscountAmount?: number | string | null;
  /** Final agreed service amount before Tax. Takes precedence when present. */
  finalAgreedServiceAmount?: number | string | null;
};

export type ServiceTaxInvoiceResult = {
  serviceSubtotalBeforeTax: string;
  invoiceWideDiscountAmount: string;
  effectiveServiceSubtotal: string;
  totalTaxAmount: string;
  grandTotal: string;
  lines: ServiceTaxCalculatedLine[];
};

/**
 * Client-preview boundary for incomplete coordinator drafts. The canonical
 * calculator remains strict; callers must not persist while `result` is null.
 */
export function previewServiceTaxInvoice(input: ServiceTaxInvoiceInput): {
  result: ServiceTaxInvoiceResult | null;
  error: string | null;
} {
  try {
    return { result: computeServiceTaxInvoice(input), error: null };
  } catch (error) {
    return { result: null, error: error instanceof Error ? error.message : "Complete the Tax details for this line." };
  }
}

function money(value: Decimal.Value): Decimal {
  return new TaxDecimal(String(value)).toDecimalPlaces(2, TaxDecimal.ROUND_HALF_UP);
}

function fixedMoney(value: Decimal.Value): string {
  return money(value).toFixed(2);
}

function normaliseRate(rate: string | null): Decimal {
  if (rate == null || rate === "") return new TaxDecimal(0);
  const value = new TaxDecimal(rate);
  if (!value.isFinite() || value.lt(0) || value.gt(100)) {
    throw new Error("Tax rate must be between 0 and 100.");
  }
  return value;
}

/**
 * Derives a pre-tax line total from a staff-entered gross line total. Tax is
 * rounded first; the exact residual remains in the taxable base so the final
 * gross always equals the input to the cent.
 */
export function calculateTaxIncludedLine(input: {
  grossAmount: number | string;
  taxRatePercent: number | string;
}): { taxableBase: string; taxAmount: string; totalWithTax: string } {
  const gross = money(input.grossAmount);
  if (!gross.isFinite() || gross.lt(0)) {
    throw new Error("Tax-Included line total must be a non-negative monetary value.");
  }
  const rate = normaliseRate(String(input.taxRatePercent));
  const taxAmount = money(gross.mul(rate).div(new TaxDecimal(100).plus(rate)));
  const taxableBase = money(gross.minus(taxAmount));
  return {
    taxableBase: fixedMoney(taxableBase),
    taxAmount: fixedMoney(taxAmount),
    totalWithTax: fixedMoney(gross),
  };
}

/**
 * Allocates a rounded service target across immutable V4 line bases. The
 * residual-cent order is deterministic: fractional remainder, then stable key.
 */
export function allocateServiceAmountProportionally(
  lines: Array<{ key: string | number; totalPrice: number | string }>,
  targetAmount: number | string,
): Map<string | number, string> {
  const target = money(targetAmount);
  if (!target.isFinite() || target.lt(0)) {
    throw new Error("Allocated service amount must be a non-negative monetary value.");
  }

  const normalized = lines.map((line, index) => {
    const base = money(line.totalPrice);
    if (!base.isFinite() || base.lt(0)) {
      throw new Error("Invoice line total must be a non-negative monetary value.");
    }
    return { ...line, index, base };
  });
  const sourceTotal = normalized.reduce((sum, line) => sum.plus(line.base), new TaxDecimal(0));
  if (sourceTotal.isZero()) {
    if (!target.isZero()) throw new Error("A non-zero service target cannot be allocated across zero-value lines.");
    return new Map(normalized.map(line => [line.key, "0.00"]));
  }

  const allocated = normalized.map(line => {
    const raw = target.mul(line.base).div(sourceTotal);
    const rounded = money(raw);
    return { ...line, raw, rounded, remainder: raw.minus(rounded) };
  });
  let residualCents = target.minus(allocated.reduce((sum, line) => sum.plus(line.rounded), new TaxDecimal(0))).mul(100).toNumber();

  if (residualCents > 0) {
    const order = [...allocated].sort((a, b) => b.remainder.comparedTo(a.remainder) || a.index - b.index);
    for (let index = 0; index < residualCents; index++) order[index % order.length].rounded = order[index % order.length].rounded.plus("0.01");
  } else if (residualCents < 0) {
    const order = [...allocated].sort((a, b) => a.remainder.comparedTo(b.remainder) || a.index - b.index);
    residualCents = Math.abs(residualCents);
    for (let index = 0; index < residualCents; index++) order[index % order.length].rounded = order[index % order.length].rounded.minus("0.01");
  }

  return new Map(allocated.map(line => [line.key, fixedMoney(line.rounded)]));
}

/**
 * Canonical, method-neutral Service Tax calculation. V4 totalPrice remains the
 * immutable pre-tax service line amount; the effective taxable base records the
 * proportional impact of invoice-wide discount or Final Agreed Service Price.
 */
export function computeServiceTaxInvoice(input: ServiceTaxInvoiceInput): ServiceTaxInvoiceResult {
  const hasTaxIncludedLine = input.lines.some(line => line.taxIncludedGross != null && line.taxIncludedGross !== "");
  if (hasTaxIncludedLine && (
    (input.finalAgreedServiceAmount != null && input.finalAgreedServiceAmount !== "") ||
    new TaxDecimal(String(input.invoiceWideDiscountAmount ?? "0")).gt(0)
  )) {
    throw new Error("Tax-Included line pricing cannot be combined with invoice-wide pricing adjustments.");
  }
  const serviceSubtotal = input.lines.reduce((sum, line) => sum.plus(money(line.totalPrice)), new TaxDecimal(0));
  const agreedProvided = input.finalAgreedServiceAmount != null && input.finalAgreedServiceAmount !== "";
  const agreed = agreedProvided ? money(input.finalAgreedServiceAmount!) : null;
  const requestedDiscount = agreedProvided ? new TaxDecimal(0) : money(input.invoiceWideDiscountAmount ?? 0);

  if (requestedDiscount.lt(0) || requestedDiscount.gt(serviceSubtotal)) {
    throw new Error("Invoice-wide discount must be between zero and the service subtotal.");
  }
  if (agreed && (agreed.lt(0) || agreed.gt(serviceSubtotal))) {
    throw new Error("Final Agreed Service Price must be between zero and the service subtotal.");
  }

  const effectiveServiceSubtotal = agreed ?? money(serviceSubtotal.minus(requestedDiscount));
  const allocatedBases = allocateServiceAmountProportionally(input.lines, effectiveServiceSubtotal.toFixed(2));
  const calculatedLines = input.lines.map((line) => {
    const rate = normaliseRate(line.tax.taxRateSnapshot);
    const taxIncluded = line.taxIncludedGross != null && line.taxIncludedGross !== ""
      ? calculateTaxIncludedLine({ grossAmount: line.taxIncludedGross, taxRatePercent: rate.toFixed(4) })
      : null;
    if (taxIncluded && !line.tax.taxLabelSnapshot) {
      throw new Error("Tax-Included line pricing requires an explicit Tax selection.");
    }
    const effectiveTaxableBase = taxIncluded?.taxableBase ?? allocatedBases.get(line.key) ?? "0.00";
    const taxAmount = taxIncluded ? new TaxDecimal(taxIncluded.taxAmount) : money(new TaxDecimal(effectiveTaxableBase).mul(rate).div(100));
    return {
      ...line,
      effectiveTaxableBase,
      taxAmount: fixedMoney(taxAmount),
      totalWithTax: taxIncluded?.totalWithTax ?? fixedMoney(new TaxDecimal(effectiveTaxableBase).plus(taxAmount)),
    };
  });
  const totalTaxAmount = calculatedLines.reduce((sum, line) => sum.plus(line.taxAmount), new TaxDecimal(0));

  return {
    serviceSubtotalBeforeTax: fixedMoney(serviceSubtotal),
    invoiceWideDiscountAmount: fixedMoney(agreedProvided ? serviceSubtotal.minus(effectiveServiceSubtotal) : requestedDiscount),
    effectiveServiceSubtotal: fixedMoney(effectiveServiceSubtotal),
    totalTaxAmount: fixedMoney(totalTaxAmount),
    grandTotal: fixedMoney(effectiveServiceSubtotal.plus(totalTaxAmount)),
    lines: calculatedLines,
  };
}
