/**
 * shared/invoicePricing.ts
 * ─────────────────────────
 * Pure pricing functions shared by client (CreateInvoiceModal, EditInvoiceModal)
 * and server (createInvoice, updateInvoiceFull, recalcInvoicePaidAmount).
 *
 * Uses decimal.js for exact decimal arithmetic (no floating-point rounding errors).
 * All monetary results are rounded to 2 decimal places with ROUND_HALF_UP.
 * Percentages are stored/passed as plain numbers with up to 4 decimal places.
 */
import Decimal from "decimal.js";
import { isMethodNeutralSettlementModel } from "./serviceTax";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/** Authoritative two-decimal monetary quantization used for persisted invoice amounts. */
export function quantizeFinanceMoney(value: number | string | Decimal): Decimal {
  return new Decimal(String(value)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export type PricingMode = "discount" | "agreed" | "discount_legacy";

export interface InvoiceTotalsInput {
  /** Gross subtotal before any discount (in display currency, markup already applied) */
  subtotal: number | string;
  /** Pricing mode chosen by staff */
  pricingMode: "discount" | "agreed";
  /** Discount percentage (0–100, up to 4 decimal places). Required for mode "discount". */
  discountPercent?: number | string;
  /** Final agreed price entered by staff. Required for mode "agreed". */
  finalAgreedAmount?: number | string;
  /** Payment method adjustment rate (e.g. 23 for +23%). Used for card hint display only. */
  adjustmentRate?: number | string | null;
}

export interface InvoiceTotalsResult {
  /** Post-discount service obligation (canonical total the patient owes) */
  totalAmount: string;
  /** Discount amount (informational in "agreed" mode) */
  discountAmount: string;
  /** Discount percent (informational in "agreed" mode, up to 4dp) */
  discountPercent: string;
  /** Card/bank transfer total hint — null when adjustmentRate is null/0 or mode is "agreed" */
  cardHint: string | null;
  /** The pricing mode used */
  pricingMode: "discount" | "agreed";
  /** The snapshotted adjustment rate (null for "agreed" mode) */
  paymentAdjustmentRateSnapshot: string | null;
}

/**
 * Compute all invoice monetary totals from the canonical inputs.
 * Called by both client (preview) and server (validation + persistence).
 */
export function computeInvoiceTotals(input: InvoiceTotalsInput): InvoiceTotalsResult {
  const subtotal = new Decimal(String(input.subtotal ?? "0"));
  const rate = input.adjustmentRate != null && input.adjustmentRate !== ""
    ? new Decimal(String(input.adjustmentRate))
    : null;

  if (input.pricingMode === "agreed") {
    const agreed = new Decimal(String(input.finalAgreedAmount ?? "0"));
    const discountAmt = subtotal.minus(agreed).toDecimalPlaces(2);
    const discountPct = subtotal.isZero()
      ? new Decimal("0")
      : discountAmt.div(subtotal).mul(100).toDecimalPlaces(4);
    return {
      totalAmount: agreed.toDecimalPlaces(2).toFixed(2),
      discountAmount: discountAmt.toDecimalPlaces(2).toFixed(2),
      discountPercent: discountPct.toFixed(4),
      cardHint: null,                          // surcharge absorbed in Mode B
      pricingMode: "agreed",
      paymentAdjustmentRateSnapshot: null,
    };
  }

  // Mode A — discount %
  const pct = new Decimal(String(input.discountPercent ?? "0"));
  const discountAmt = subtotal.mul(pct).div(100).toDecimalPlaces(2);
  const total = subtotal.minus(discountAmt).toDecimalPlaces(2);
  const cardHint = rate && !rate.isZero()
    ? total.mul(new Decimal("1").plus(rate.div(100))).toDecimalPlaces(2).toFixed(2)
    : null;
  return {
    totalAmount: total.toFixed(2),
    discountAmount: discountAmt.toFixed(2),
    discountPercent: pct.toDecimalPlaces(4).toFixed(4),
    cardHint,
    pricingMode: "discount",
    paymentAdjustmentRateSnapshot: rate ? rate.toFixed(2) : null,
  };
}

export interface PaymentSettlementInput {
  /** Face value actually received from the patient (in payment currency) */
  amount: number | string;
  /** Payment method */
  method: string;
  /** Pricing mode of the invoice */
  pricingMode: PricingMode;
  /**
   * Payment method adjustment rate snapshotted on the invoice (e.g. 23.00).
   * Null for "agreed" mode or legacy invoices with unknown rate.
   */
  adjustmentRateSnapshot: number | string | null;
  /**
   * Amount already converted to invoice currency (same as amount when currencies match).
   * Pass the converted value when payment currency differs from invoice currency.
   */
  amountInInvoiceCurrency?: number | string;
  /** New invoices explicitly use method-neutral settlement; legacy invoices omit this marker. */
  settlementModelVersion?: string | null;
}

export interface PaymentSettlementResult {
  /**
   * Amount of the invoice obligation settled by this payment.
   * For Mode A non-cash: amount / (1 + rate). For Mode B or cash: = amountInInvoiceCurrency.
   */
  settledAmount: string;
  /** Amount converted to invoice currency (actual money received in invoice currency) */
  amountInInvoiceCurrency: string;
}

/**
 * Compute the settled service amount for a single payment.
 * The surcharge division is applied only for Mode A non-cash payments with a known rate.
 */
export function computePaymentSettlement(input: PaymentSettlementInput): PaymentSettlementResult {
  const amtInInvCur = new Decimal(
    String(input.amountInInvoiceCurrency ?? input.amount ?? "0")
  );

  const isCash = input.method === "cash";
  const hasRate = input.adjustmentRateSnapshot != null &&
    String(input.adjustmentRateSnapshot) !== "" &&
    new Decimal(String(input.adjustmentRateSnapshot)).gt(0);
  const isAgreedOrLegacyUnknown =
    input.pricingMode === "agreed" ||
    input.pricingMode === "discount_legacy" && !hasRate;

  let settled: Decimal;
  if (isMethodNeutralSettlementModel(input.settlementModelVersion) || isCash || isAgreedOrLegacyUnknown || !hasRate) {
    // No surcharge division: cash payments, Mode B, or legacy with unknown rate
    settled = amtInInvCur.toDecimalPlaces(2);
  } else {
    // Mode A non-cash with known rate: divide by (1 + rate)
    const rate = new Decimal(String(input.adjustmentRateSnapshot));
    settled = amtInInvCur.div(new Decimal("1").plus(rate.div(100))).toDecimalPlaces(2);
  }

  return {
    settledAmount: settled.toFixed(2),
    amountInInvoiceCurrency: amtInInvCur.toDecimalPlaces(2).toFixed(2),
  };
}

/** Presentation-only companion to the settlement marker: missing marker is legacy. */
export function isLegacySettlementPresentation(settlementModelVersion?: string | null): boolean {
  return !isMethodNeutralSettlementModel(settlementModelVersion);
}

/**
 * Compute the contextual "amount required to fully settle by this method" hint.
 * Shown to staff when they select a non-cash payment method and a balance remains.
 * Returns null when no hint should be shown (Mode B, cash, or unknown rate).
 */
export function computeCollectionHint(
  remainingServiceBalance: number | string,
  method: string,
  pricingMode: PricingMode,
  adjustmentRateSnapshot: number | string | null
): string | null {
  if (method === "cash") return null;
  if (pricingMode === "agreed") return null;
  if (adjustmentRateSnapshot == null || String(adjustmentRateSnapshot) === "") return null;
  const rate = new Decimal(String(adjustmentRateSnapshot));
  if (rate.isZero()) return null;
  const remaining = new Decimal(String(remainingServiceBalance));
  if (remaining.lte(0)) return null;
  return remaining.mul(new Decimal("1").plus(rate.div(100))).toDecimalPlaces(2).toFixed(2);
}
