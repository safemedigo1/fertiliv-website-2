import Decimal from "decimal.js";

const ServicePriceDecimal = Decimal.clone({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export const servicePriceEntryKinds = [
  "unit_price",
  "final_line_total",
  "tax_included_final_line_total",
  "agreed_unit_price",
  "tax_included_agreed_unit_price",
] as const;

export type ServicePriceEntryKind = typeof servicePriceEntryKinds[number];
export type ServicePriceFxSource = "system" | "manual";
export type SupportedServicePriceCurrency = "USD" | "EUR" | "GBP" | "TRY" | "SAR" | "AED";

export type ServicePriceEntry = {
  currency: SupportedServicePriceCurrency;
  amount: string;
  kind: ServicePriceEntryKind;
  fx?: {
    source: ServicePriceFxSource;
    /** Canonical manual direction: 1 source-currency unit = X invoice-currency units. */
    rateToInvoice?: string;
    /** TRY per one source-currency unit. Required for manual cross-currency entry. */
    sourceToTryRate?: string;
    /** TRY per one invoice-currency unit. Required for manual cross-currency entry. */
    invoiceToTryRate?: string;
    note?: string;
  };
};

export type ServicePriceFxSnapshot = {
  /** Direct canonical rate: 1 source-currency unit = X invoice-currency units. */
  rateToInvoice: string;
  sourceToTryRate: string | null;
  invoiceToTryRate: string | null;
  source: ServicePriceFxSource | null;
  convertedAmount: string;
};

/**
 * Starts an intentional draft repricing in a different source currency.
 * Persisted source facts are never mutated: the prior amount and FX must not
 * be re-labelled as facts in a new currency, including the invoice currency.
 */
export function startServicePriceRepricing(
  entry: ServicePriceEntry,
  nextCurrency: SupportedServicePriceCurrency,
): ServicePriceEntry {
  if (entry.currency === nextCurrency) return entry;
  return {
    currency: nextCurrency,
    amount: "",
    kind: entry.kind,
    fx: { source: "system" },
  };
}

/**
 * Starts an invoice-currency repricing while preserving the commercial source
 * fact. Any old source-to-invoice rate, including an approved Manual rate and
 * its note, belongs to the previous currency pair and cannot be relabelled.
 */
export function startServicePriceInvoiceCurrencyRepricing(
  entry: ServicePriceEntry,
  nextInvoiceCurrency: SupportedServicePriceCurrency,
): ServicePriceEntry {
  return {
    ...entry,
    fx: entry.currency === nextInvoiceCurrency ? undefined : { source: "system" },
  };
}

export function isTaxIncludedServicePriceEntry(entry: Pick<ServicePriceEntry, "kind"> | undefined): boolean {
  return entry?.kind === "tax_included_final_line_total" || entry?.kind === "tax_included_agreed_unit_price";
}

export function isAgreedUnitServicePriceEntry(entry: Pick<ServicePriceEntry, "kind"> | undefined): boolean {
  return entry?.kind === "agreed_unit_price" || entry?.kind === "tax_included_agreed_unit_price";
}

/**
 * Builds the negotiated source amount for an agreed-unit line before one FX
 * conversion. This intentionally does not change the persisted unit amount.
 */
export function getAgreedUnitSourceLineAmount(entry: Pick<ServicePriceEntry, "amount" | "kind">, quantity: number | string): string {
  if (!isAgreedUnitServicePriceEntry(entry)) return entry.amount;
  const parsedQuantity = Number(quantity);
  if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
    throw new Error("Line quantity must be a whole number of at least 1.");
  }
  return decimal(entry.amount, "Agreed unit price")
    .mul(parsedQuantity)
    .toDecimalPlaces(2, ServicePriceDecimal.ROUND_HALF_UP)
    .toFixed(2);
}

/**
 * Normalizes a staff-entered decimal before it reaches any Finance helper.
 * A single locale separator is permitted; mixed separators are deliberately
 * rejected instead of guessing a financial value.
 */
export function normalizeServicePriceDecimalInput(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  if (!/^\d+(?:[.,]\d*)?$/.test(trimmed)) return null;
  return trimmed.replace(",", ".");
}

function decimal(value: Decimal.Value, label: string): Decimal {
  let parsed: Decimal;
  try {
    parsed = new ServicePriceDecimal(String(value));
  } catch {
    throw new Error(`${label} must be a valid positive number.`);
  }
  if (!parsed.isFinite() || parsed.lte(0)) throw new Error(`${label} must be greater than zero.`);
  return parsed;
}

/**
 * Converts the staff-facing quote (1 invoice currency = X source currency)
 * into the canonical persisted direction (1 source = X invoice). The stored
 * snapshot model therefore remains unchanged.
 */
export function servicePriceFxStaffQuoteToCanonical(value: string): string | null {
  const normalized = normalizeServicePriceDecimalInput(value);
  if (normalized == null || normalized === "" || normalized.endsWith(".")) return null;
  const staffQuote = decimal(normalized, "Manual FX rate");
  return new ServicePriceDecimal(1)
    .div(staffQuote)
    .toDecimalPlaces(12, ServicePriceDecimal.ROUND_HALF_UP)
    .toFixed(12);
}

/** Formats a canonical source-to-invoice rate as the familiar staff quote. */
export function formatServicePriceFxStaffQuote(canonicalRate?: string): string {
  if (!canonicalRate) return "";
  try {
    const reciprocal = new ServicePriceDecimal(1)
      .div(decimal(canonicalRate, "Canonical source-to-invoice rate"))
      .toDecimalPlaces(6, ServicePriceDecimal.ROUND_HALF_UP)
      .toFixed(6);
    return reciprocal.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
  } catch {
    return "";
  }
}

/** Formats the canonical direct source-to-invoice rate without changing the saved snapshot value. */
export function formatServicePriceFxDirectRate(canonicalRate?: string): string {
  if (!canonicalRate) return "";
  return canonicalRate.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

/**
 * Pure X1 conversion helper. It is intentionally separate from payment snapshots:
 * it converts a negotiated service price into the canonical invoice currency.
 */
export function computeServicePriceFxSnapshot(input: {
  sourceCurrency: string;
  invoiceCurrency: string;
  sourceAmount: string | number;
  sourceToTryRate?: string | number | null;
  invoiceToTryRate?: string | number | null;
  directRateToInvoice?: string | number | null;
  source: ServicePriceFxSource | null;
}): ServicePriceFxSnapshot {
  const amount = decimal(input.sourceAmount, "Source price");
  const sameCurrency = input.sourceCurrency === input.invoiceCurrency;
  if (sameCurrency) {
    return {
      rateToInvoice: "1.000000000000",
      sourceToTryRate: null,
      invoiceToTryRate: null,
      source: null,
      convertedAmount: amount.toDecimalPlaces(2, ServicePriceDecimal.ROUND_HALF_UP).toFixed(2),
    };
  }

  const directRate = input.directRateToInvoice != null
    ? decimal(input.directRateToInvoice, "Source-to-invoice rate")
    : decimal(input.sourceToTryRate ?? "", "Source-to-TRY rate")
      .div(decimal(input.invoiceToTryRate ?? "", "Invoice-to-TRY rate"));
  const sourceToTry = input.sourceToTryRate == null
    ? null
    : decimal(input.sourceToTryRate, "Source-to-TRY rate");
  const invoiceToTry = input.invoiceToTryRate == null
    ? null
    : decimal(input.invoiceToTryRate, "Invoice-to-TRY rate");

  return {
    rateToInvoice: directRate.toDecimalPlaces(12, ServicePriceDecimal.ROUND_HALF_UP).toFixed(12),
    sourceToTryRate: sourceToTry?.toDecimalPlaces(12, ServicePriceDecimal.ROUND_HALF_UP).toFixed(12) ?? null,
    invoiceToTryRate: invoiceToTry?.toDecimalPlaces(12, ServicePriceDecimal.ROUND_HALF_UP).toFixed(12) ?? null,
    source: input.source,
    convertedAmount: amount.mul(directRate).toDecimalPlaces(2, ServicePriceDecimal.ROUND_HALF_UP).toFixed(2),
  };
}
