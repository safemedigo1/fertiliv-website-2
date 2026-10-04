import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import Decimal from "decimal.js";
import { quantizeFinanceMoney } from "../shared/invoicePricing";

const dbSource = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf8");
const routerSource = fs.readFileSync(path.resolve(__dirname, "routers.ts"), "utf8");
const schemaSource = fs.readFileSync(path.resolve(__dirname, "../drizzle/schema.ts"), "utf8");
const patientPageSource = fs.readFileSync(path.resolve(__dirname, "../client/src/pages/PatientDetailPage.tsx"), "utf8");

describe("Finance native credit and atomic invoice receipts", () => {
  it("defines immutable invoice settlements, native-credit provenance, and explicit non-cash FX rounding adjustments", () => {
    expect(schemaSource).toContain('pgTable("invoice_settlements"');
    expect(schemaSource).toContain('pgEnum("pg_sourceType", ["payment", "credit", "fx_rounding_adjustment"])');
    expect(schemaSource).toContain("originPaymentId");
    expect(schemaSource).toContain("sourceCreditTransactionId");
    expect(schemaSource).toContain("fxRoundingReason");
    expect(schemaSource).toContain("fxRoundingSourceMinorUnit");
  });

  it("accepts initialPayments inside the Create Invoice server contract", () => {
    const createStart = routerSource.indexOf("createInvoice: staffOrAdminProcedure");
    const createEnd = routerSource.indexOf("uploadInvoiceReceipt", createStart);
    const createBlock = routerSource.slice(createStart, createEnd);
    expect(createBlock).toContain("initialPayments");
    expect(createBlock).toContain("initialPayments: input.initialPayments");
  });

  it("creates invoice receipts inside the same database transaction instead of a post-create browser loop", () => {
    const createStart = dbSource.indexOf("export async function createInvoice");
    const createEnd = dbSource.indexOf("export async function updateInvoice", createStart);
    const createBlock = dbSource.slice(createStart, createEnd);
    expect(createBlock).toContain("return db.transaction");
    expect(createBlock).toContain("recordPaymentWithSettlement");
    expect(patientPageSource).not.toContain("initialPaymentsRef");
    expect(patientPageSource).not.toContain("Non-fatal: invoice is created");
  });

  it("persists the physical payment, allocates no more than remaining invoice settlement, and creates native-currency surplus credit", () => {
    const helperStart = dbSource.indexOf("async function recordPaymentWithSettlement");
    const helperEnd = dbSource.indexOf("export async function createPayment", helperStart);
    const helper = dbSource.slice(helperStart, helperEnd);
    expect(helper).toContain("const allocation = Decimal.min(quotedSettlement, remaining)");
    expect(helper).toContain("tx.insert(payments)");
    expect(helper).toContain("tx.insert(invoiceSettlements)");
    expect(helper).toContain("creditAmount");
    expect(helper).toContain("currency: input.currency");
    expect(helper).not.toContain("overpayment handling is not enabled yet");
  });

  it("does not use TRY conversion or a direct paidAmount update when applying credit", () => {
    const applyStart = dbSource.indexOf("export async function applyCreditToInvoice");
    const applyEnd = dbSource.indexOf("/** Get all refunds", applyStart);
    const apply = dbSource.slice(applyStart, applyEnd);
    expect(apply).toContain("Patient Credit must match the invoice currency");
    expect(apply).toContain("sourceCreditTransactionId");
    expect(apply).toContain("sourceType: \"credit\"");
    expect(apply).toContain("recalcInvoicePaidAmountWithDb");
    expect(apply).not.toContain("getLiveExchangeRate");
    expect(apply).not.toContain("tx.update(invoices).set({\n      paidAmount");
  });

  it("keeps scope and ownership checks for native credit", () => {
    expect(dbSource).toContain("Payment patient does not match the invoice owner");
    expect(dbSource).toContain("eq(creditTransactions.financialScope, scope)");
    expect(routerSource).toContain("Only Admin can view Test Patient Credit");
  });

  it("cumulates valid settlements with only unmatched legacy payment settlements without double counting", () => {
    const start = dbSource.indexOf("async function getInvoiceFinancialSummaryWithDb");
    const end = dbSource.indexOf("export async function getInvoiceFinancialSummary", start);
    const recalc = dbSource.slice(start, end);
    expect(recalc).toContain("invoiceSettlements");
    expect(recalc).toContain("representedPaymentIds");
    expect(recalc).toContain("unmatchedLegacyRows");
    expect(recalc).toContain("settledAmount: (payments as any).settledAmount");
    expect(recalc).toContain("!representedPaymentIds.has(Number(row.id))");
    expect(recalc).toContain("computeRefundAwareSettlementTotals");
    expect(recalc).toContain("refundInvoiceCurrencyAmount");
    expect(recalc).toContain("maxRefundable");
  });

  it("uses final invoice settlement—not raw converted credit—as the cross-currency target contract", () => {
    const quoteStart = dbSource.indexOf("async function getCrossCurrencyCreditQuote");
    const quoteEnd = dbSource.indexOf("/** Preview a manual native-credit conversion", quoteStart);
    const quote = dbSource.slice(quoteStart, quoteEnd);
    const previewStart = dbSource.indexOf("export async function quoteCrossCurrencyCreditApplication");
    const previewEnd = dbSource.indexOf("/**\n * Consume native Patient Credit FIFO", previewStart);
    const preview = dbSource.slice(previewStart, previewEnd);
    const applyStart = dbSource.indexOf("export async function applyCrossCurrencyCreditToInvoice");
    const applyEnd = dbSource.indexOf("/** Get all refunds", applyStart);
    const apply = dbSource.slice(applyStart, applyEnd);
    expect(quote).toContain("const requestedFinalTarget = input.applyMaximum ? remaining : requestedTarget");
    expect(quote).toContain("maximumFinalTargetAmount");
    expect(preview).toContain("creditSettlementAmount");
    expect(preview).toContain("targetAmount: finalTargetAmount.toFixed(2)");
    expect(apply).toContain("targetAmount: finalTargetAmount.toFixed(2)");
    expect(patientPageSource).toContain("setTargetAmount(preview.data.maximumTargetAmount)");
    expect(patientPageSource).toContain("creditSettlementAmount ?? preview.data.targetAmount");
  });

  it("loads Test-scope credit for an admin patient finance view instead of silently defaulting the QA patient to production only", () => {
    expect(patientPageSource).toContain('getCreditTransactions.useQuery({ patientId, scope: "production" })');
    expect(patientPageSource).toContain('getCreditTransactions.useQuery(\n    { patientId, scope: "test" }');
    expect(patientPageSource).toContain('Test scope credit');
  });

  it("limits a manual credit application to the target invoice currency and financial scope", () => {
    expect(patientPageSource).toContain('creditInCurrency(invCur, (inv as any).financialScope ?? patientDefaultScope)');
    expect(patientPageSource).toContain('creditInCurrency(applyCreditInvoice.currency ?? "TRY", (applyCreditInvoice as any).financialScope ?? patientDefaultScope)');
  });

  it("shows scoped credit during invoice preparation without automatically consuming it", () => {
    expect(patientPageSource).toContain('scope: createInvoiceScope');
    expect(patientPageSource).toContain('Available Patient Credit: {currency}');
    expect(patientPageSource).toContain('Credit is not applied automatically');
  });

  it("records immutable FX provenance for every cross-currency credit debit and target settlement", () => {
    expect(schemaSource).toContain("sourceCreditCurrency");
    expect(schemaSource).toContain("creditConversionRateToInvoice");
    expect(schemaSource).toContain("creditFxEffectiveAt");
    expect(schemaSource).toContain("sourceCreditAvailableBefore");
    expect(dbSource).toContain('export async function applyCrossCurrencyCreditToInvoice');
    expect(dbSource).toContain('resolveApprovedPaymentExchangeRate(input.sourceCurrency, applicationTime)');
    expect(dbSource).toContain('creditFxSource: "approved_exchange_rate"');
    expect(dbSource).toContain('sourceType: "credit"');
  });

  it("uses deterministic FIFO source credit allocation without creating a payment or changing Refund", () => {
    const start = dbSource.indexOf("export async function applyCrossCurrencyCreditToInvoice");
    const end = dbSource.indexOf("/** Get all refunds", start);
    const crossApply = dbSource.slice(start, end);
    expect(dbSource).toContain('orderBy(asc(creditTransactions.createdAt), asc(creditTransactions.id))');
    expect(crossApply).toContain("for (const origin of quote.originCredits)");
    expect(crossApply).not.toContain("tx.insert(payments)");
    expect(crossApply).not.toContain("createRefund");
    expect(dbSource).toContain("Invoice does not belong to this patient.");
  });

  it("keeps same-currency credit separate and exposes a manual cross-currency preview/application route", () => {
    expect(routerSource).toContain("previewCrossCurrencyCredit: staffOrAdminProcedure");
    expect(routerSource).toContain("applyCrossCurrencyCredit: staffOrAdminProcedure");
    expect(patientPageSource).toContain("Convert & Apply Credit");
    expect(patientPageSource).toContain("Manual conversion only");
    expect(patientPageSource).toContain("It does not create a payment and is never applied automatically.");
    expect(patientPageSource).toContain("creditInCurrency(invCur");
  });

  it("derives maximum safe source credit from the target invoice amount on the server", () => {
    expect(routerSource).toContain("targetAmount: z.number().positive().optional()");
    expect(routerSource).toContain("applyMaximum: z.boolean().optional()");
    expect(dbSource).toContain("maximumTargetSettlement");
    expect(dbSource).toContain("requestedTarget.div(conversionRate)");
    expect(patientPageSource).toContain("Amount to Apply to Invoice ({targetCurrency})");
    expect(patientPageSource).toContain("Apply Maximum");
    expect(patientPageSource).toContain("The server derives the credit to consume");
  });

  it("quantizes the converted target settlement with Finance ROUND_HALF_UP before selecting the maximum source minor unit", () => {
    const rate = new Decimal("56.24296963");
    expect(quantizeFinanceMoney(new Decimal("8.89").mul(rate)).toFixed(2)).toBe("500.00");
    expect(quantizeFinanceMoney(new Decimal("8.88").mul(rate)).toFixed(2)).toBe("499.44");
    expect(quantizeFinanceMoney(new Decimal("8.90").mul(rate)).toFixed(2)).toBe("500.56");

    const quoteStart = dbSource.indexOf("async function getCrossCurrencyCreditQuote");
    const quoteEnd = dbSource.indexOf("/** Preview a manual native-credit conversion", quoteStart);
    const quote = dbSource.slice(quoteStart, quoteEnd);
    expect(quote).toContain("findMaximumSafeCrossCurrencySource");
    expect(quote).toContain("quantizeFinanceMoney");
    expect(quote).not.toContain("toDecimalPlaces(2, Decimal.ROUND_DOWN)");
  });

  it("retains the non-cash adjustment only when the next source minor unit over-settles after target quantization", () => {
    const rate = new Decimal("56.24296963");
    expect(quantizeFinanceMoney(new Decimal("0.04").mul(rate)).toFixed(2)).toBe("2.25");
    expect(quantizeFinanceMoney(new Decimal("0.05").mul(rate)).toFixed(2)).toBe("2.81");
    expect(quantizeFinanceMoney(new Decimal("2.65").minus("2.25")).toFixed(2)).toBe("0.40");
  });

  it("creates an explicit non-cash FX Rounding Adjustment only for an eligible Apply Maximum precision residual", () => {
    const quoteStart = dbSource.indexOf("async function getCrossCurrencyCreditQuote");
    const quoteEnd = dbSource.indexOf("/** Preview a manual native-credit conversion", quoteStart);
    const quote = dbSource.slice(quoteStart, quoteEnd);
    const applyStart = dbSource.indexOf("export async function applyCrossCurrencyCreditToInvoice");
    const applyEnd = dbSource.indexOf("/** Get all refunds", applyStart);
    const apply = dbSource.slice(applyStart, applyEnd);
    expect(quote).toContain("isFxPrecisionResidual");
    expect(quote).toContain("nextSettlementAmount.gt(requestedFinalTarget)");
    expect(apply).toContain('sourceType: "fx_rounding_adjustment"');
    expect(apply).toContain("Cross-currency Patient Credit precision residual");
    expect(apply).not.toContain("tx.insert(payments)");
    expect(routerSource).toContain("getFxRoundingAdjustments: staffOrAdminProcedure");
    expect(patientPageSource).toContain("FX Rounding Adjustment");
    expect(patientPageSource).toContain("No payment or additional credit is created.");
    const refundStart = dbSource.indexOf("export async function createRefund");
    const refundEnd = dbSource.indexOf("export async function listPaymentsByPatient", refundStart);
    const refund = dbSource.slice(refundStart, refundEnd);
    expect(refund).toContain("const refundInTRY");
    expect(refund).toContain("const deductionTRY");
    expect(refund).not.toContain("applyMaximum");
  });

  it("uses neutral Local/International pricing-category copy in operational Create/Edit Invoice UI", () => {
    expect(patientPageSource).toContain('Pricing: {isInternational ? "International" : "Local"}');
    expect(patientPageSource).not.toContain("markup applied");
  });
});
