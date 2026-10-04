import Decimal from "decimal.js";

const FxDecimal = Decimal.clone({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export interface PaymentFxSnapshotInput {
  amount: number | string;
  paymentCurrency: string;
  invoiceCurrency: string;
  /** Current approved 1 payment-currency unit = X TRY. */
  paymentToTryRate: number | string;
  /** Current approved 1 invoice-currency unit = X TRY. */
  invoiceToTryRate: number | string;
}

export interface PaymentFxSnapshots {
  /** Compatibility field: 1 payment-currency unit = X TRY, at the payment time. */
  exchangeRateAtPayment: string;
  /** Immutable direct conversion: 1 payment-currency unit = X invoice-currency units. */
  conversionRateToInvoice: string;
  /** Original amount expressed in invoice currency before payment-method adjustment. */
  amountInInvoiceCurrency: string;
}

/**
 * Freeze all payment FX facts from the approved system rate snapshots available at
 * the time a payment is recorded. No current rate should ever be consulted again
 * to interpret this payment.
 */
export function computePaymentFxSnapshots(input: PaymentFxSnapshotInput): PaymentFxSnapshots {
  const amount = new FxDecimal(String(input.amount));
  const paymentToTry = new FxDecimal(String(input.paymentToTryRate));
  const invoiceToTry = new FxDecimal(String(input.invoiceToTryRate));

  if (!amount.isFinite() || amount.lte(0)) throw new Error("Payment amount must be greater than zero.");
  if (!paymentToTry.isFinite() || paymentToTry.lte(0) || !invoiceToTry.isFinite() || invoiceToTry.lte(0)) {
    throw new Error("A current approved exchange rate is unavailable for this payment.");
  }

  const directRate = input.paymentCurrency === input.invoiceCurrency
    ? new FxDecimal(1)
    : paymentToTry.div(invoiceToTry);
  const amountInInvoiceCurrency = amount.mul(directRate).toDecimalPlaces(2);

  return {
    exchangeRateAtPayment: paymentToTry.toDecimalPlaces(4).toFixed(4),
    conversionRateToInvoice: directRate.toDecimalPlaces(12).toFixed(12),
    amountInInvoiceCurrency: amountInInvoiceCurrency.toFixed(2),
  };
}
