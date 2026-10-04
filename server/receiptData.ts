import { getInvoiceById, getInvoiceItems, getInvoiceFinancialSummary, listOverpaymentCreditLotsByInvoice, listPaymentsByInvoice } from "./db";
export type CumulativeReceiptPayment = {
  paymentId: number;
  paymentDate: Date;
  method: string;
  amount: number;
  currency: string;
  settledAmount: number;
  showAppliedToInvoice: boolean;
  /** Immutable native Patient Credit actually created from this payment's surplus. */
  patientCredits: Array<{ currency: string; amount: number }>;
};

export type CumulativeReceiptData = {
  receiptNumber: string;
  invoiceNumber: string;
  patientName: string;
  mrn?: string;
  currency: string;
  /** Persisted forward-only marker; legacy rows intentionally remain null. */
  taxModelVersion?: string | null;
  /** Persisted invoice aggregate, never inferred from a synthetic rate. */
  taxAmount?: number;
  /** Persisted commercial-pricing facts, kept separate from Tax. */
  pricingMode?: string | null;
  invoiceDiscountAmount?: number;
  invoiceDiscountPercent?: number;
  finalAgreedAmount?: number | null;
  /** Effective service total before Tax, derived only from saved invoice totals. */
  serviceTotal?: number;
  invoiceTotal: number;
  grossReceived: number;
  refunded: number;
  totalSettled: number;
  balanceDue: number;
  invoiceSubtotal?: number;
  invoiceItems: Array<{
    description: string;
    lineLabel?: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    taxRuleId?: number | null;
    taxLabelSnapshot?: string | null;
    taxRateSnapshot?: number | null;
    effectiveTaxableBase?: number | null;
    taxAmount?: number | null;
  }>;
  includedPayments: CumulativeReceiptPayment[];
  /** Presentation-only ledger facts; amounts are not current credit balances. */
  overpaymentCredits: Array<{ paymentId: number; currency: string; amount: number }>;
};

export const OFFICIAL_RECEIPT_UNAVAILABLE_MESSAGE =
  "Official Receipt is available after the invoice has been paid in full. Use the Invoice to show partial payments and the remaining balance.";

/** Official Receipts confirm completed settlement, with at least one active payment source. */
export function isOfficialReceiptEligible(data: CumulativeReceiptData | null): data is CumulativeReceiptData {
  if (!data || data.includedPayments.length === 0) return false;
  return data.totalSettled + 0.01 >= data.invoiceTotal;
}

function displayPaymentMethod(method?: string | null): string {
  const value = method ?? "cash";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

/**
 * Builds the one canonical data shape for the invoice-level cumulative receipt.
 * listPaymentsByInvoice intentionally returns active rows only by default.
 */
export async function buildCumulativeReceiptData(input: {
  invoiceId: number;
  patientName: string;
  mrn?: string;
}): Promise<CumulativeReceiptData | null> {
  const invoice = await getInvoiceById(input.invoiceId) as any;
  if (!invoice) return null;

  const [paymentRows, financialSummary, overpaymentCreditLots] = await Promise.all([
    listPaymentsByInvoice(input.invoiceId),
    getInvoiceFinancialSummary(input.invoiceId),
    listOverpaymentCreditLotsByInvoice(input.invoiceId),
  ]);
  const totalSettled = Number(financialSummary.netSettled ?? 0);
  if (paymentRows.length === 0 || totalSettled <= 0) return null;

  const currency = invoice.currency ?? "USD";
  const invoiceTotal = Number(invoice.totalAmount ?? 0);
  const rawItems = await getInvoiceItems(input.invoiceId);
  const invoiceItems = rawItems.map((item: any) => ({
    description: item.description,
    lineLabel: item.lineLabel ?? null,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    totalPrice: Number(item.totalPrice),
    taxRuleId: item.taxRuleId != null ? Number(item.taxRuleId) : null,
    taxLabelSnapshot: item.taxLabelSnapshot ?? null,
    taxRateSnapshot: item.taxRateSnapshot != null ? Number(item.taxRateSnapshot) : null,
    effectiveTaxableBase: item.effectiveTaxableBase != null ? Number(item.effectiveTaxableBase) : null,
    taxAmount: item.taxAmount != null ? Number(item.taxAmount) : null,
  }));

  const includedPayments = paymentRows.map((payment: any) => {
    const amount = Number(payment.amount ?? 0);
    const settledAmount = Number(payment.settledAmount ?? 0);
    const paymentCurrency = payment.currency ?? currency;
    return {
      paymentId: Number(payment.id),
      paymentDate: new Date(payment.receivedAt ?? payment.createdAt),
      method: displayPaymentMethod(payment.method),
      amount,
      currency: paymentCurrency,
      settledAmount,
      // A same-currency face-value settlement adds no useful secondary value.
      showAppliedToInvoice: paymentCurrency !== currency || Math.abs(amount - settledAmount) > 0.005,
      patientCredits: overpaymentCreditLots
        .filter((credit: any) => Number(credit.originPaymentId) === Number(payment.id))
        .map((credit: any) => ({ currency: credit.currency, amount: Number(credit.amount) })),
    };
  });
  const overpaymentCredits = overpaymentCreditLots
    .filter((credit: any) => credit.originPaymentId != null)
    .map((credit: any) => ({
      paymentId: Number(credit.originPaymentId),
      currency: credit.currency,
      amount: Number(credit.amount),
    }));

  const itemSum = invoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const taxModelVersion = invoice.taxModelVersion ?? null;
  const taxAmount = Number(invoice.taxAmount ?? 0);
  const isTaxModelInvoice = taxModelVersion === "line_tax_v1";
  // For Tax-v2, the saved invoice aggregate is the only receipt-level Tax source.
  // This intentionally does not infer a rate or recompute mixed line Taxes.
  const serviceTotal = isTaxModelInvoice ? Math.max(0, invoiceTotal - taxAmount) : undefined;
  return {
    receiptNumber: `REC-${invoice.invoiceNumber ?? `INV-${invoice.id}`}`,
    invoiceNumber: invoice.invoiceNumber ?? `INV-${invoice.id}`,
    patientName: input.patientName,
    mrn: input.mrn,
    currency,
    taxModelVersion,
    taxAmount,
    pricingMode: invoice.pricingMode ?? null,
    invoiceDiscountAmount: Number(invoice.discountAmount ?? 0),
    invoiceDiscountPercent: Number(invoice.discountPercent ?? 0),
    finalAgreedAmount: invoice.finalAgreedAmount != null ? Number(invoice.finalAgreedAmount) : null,
    serviceTotal,
    invoiceTotal,
    grossReceived: Number(financialSummary.grossReceived ?? 0),
    refunded: Number(financialSummary.refunded ?? 0),
    totalSettled,
    balanceDue: Math.max(0, invoiceTotal - totalSettled),
    invoiceSubtotal: itemSum > invoiceTotal + 0.005 ? itemSum : undefined,
    invoiceItems,
    includedPayments,
    overpaymentCredits,
  };
}
