import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Receipt Semantics Integrity — cumulative invoice model", () => {
  const receiptData = read("server/receiptData.ts");
  const pdfRoutes = read("server/pdfRoutes.ts");
  const routers = read("server/routers.ts");
  const pdfService = read("server/pdfService.ts");
  const emailService = read("server/emailService.ts");

  it("REC-1: builds a single active-payment data model used by direct and emailed receipts", () => {
    expect(pdfRoutes).toContain('buildCumulativeReceiptData({ invoiceId, patientName, mrn })');
    expect(routers).toContain("const receiptData = await buildCumulativeReceiptData({");
    expect(receiptData).toContain("listPaymentsByInvoice(input.invoiceId)");
  });

  it("REC-2: includes only active payments through the default payment-list query", () => {
    expect(receiptData).toContain("listPaymentsByInvoice(input.invoiceId)");
    expect(read("server/db.ts")).toContain('and(eq(payments.invoiceId, invoiceId), eq(payments.status, "active"))');
  });

  it("REC-3: preserves raw amount/currency and financial date for each included payment", () => {
    expect(receiptData).toContain("paymentDate: new Date(payment.receivedAt ?? payment.createdAt)");
    expect(receiptData).toContain("amount,");
    expect(receiptData).toContain("currency: paymentCurrency");
    expect(pdfService).toContain("AMOUNT RECEIVED");
    expect(pdfService).toContain("${payment.currency} ${fmt(payment.amount)}");
  });

  it("REC-4: labels aggregate money as invoice settlement and removes false payment-specific summary fields", () => {
    const receiptStart = pdfService.indexOf("export async function generateReceiptPdf");
    const receiptEnd = pdfService.indexOf("export async function generateRefundPdf", receiptStart);
    const receiptBody = pdfService.slice(receiptStart, receiptEnd);
    expect(receiptBody).toContain("TOTAL SETTLED TO THIS INVOICE");
    expect(receiptBody).toContain("Total Settled to This Invoice:");
    expect(receiptBody).not.toContain('addSummaryRow("This Payment:"');
    expect(receiptBody).not.toContain("data.paymentDate, W - MARGIN - 160");
  });

  it("REC-4A: derives official-receipt gross, refunded, net, and balance figures from the shared refund-aware summary", () => {
    expect(receiptData).toContain("getInvoiceFinancialSummary(input.invoiceId)");
    expect(receiptData).toContain("grossReceived: Number(financialSummary.grossReceived ?? 0)");
    expect(receiptData).toContain("refunded: Number(financialSummary.refunded ?? 0)");
    expect(receiptData).toContain("totalSettled = Number(financialSummary.netSettled ?? 0)");
    expect(pdfService).toContain("GROSS RECEIVED");
    expect(pdfService).toContain("REFUNDED");
    expect(pdfService).toContain("BALANCE DUE:");
    expect(pdfService).toContain("data.totalSettled");
  });

  it("REC-4B: omits the Refunded row when its refund-aware amount is zero without changing received, settled, or balance values", () => {
    const receiptStart = pdfService.indexOf("export async function generateReceiptPdf");
    const receiptEnd = pdfService.indexOf("export async function generateRefundPdf", receiptStart);
    const receiptBody = pdfService.slice(receiptStart, receiptEnd);
    expect(receiptBody).toContain("const hasRefund = data.refunded > 0.005;");
    expect(receiptBody).toContain('if (hasRefund) doc.text("REFUNDED"');
    expect(receiptBody).toContain("if (hasRefund) {");
    expect(receiptBody).toContain("data.grossReceived");
    expect(receiptBody).toContain("data.totalSettled");
    expect(receiptBody).toContain("data.balanceDue");
  });

  it("REC-4C: retains the genuine refund row and amount for a positive refund", () => {
    const receiptStart = pdfService.indexOf("export async function generateReceiptPdf");
    const receiptEnd = pdfService.indexOf("export async function generateRefundPdf", receiptStart);
    const receiptBody = pdfService.slice(receiptStart, receiptEnd);
    expect(receiptBody).toContain('doc.text("REFUNDED", MARGIN + 16, y + 32);');
    expect(receiptBody).toContain("fmt(data.refunded)");
    expect(receiptBody).toContain('pdfColor(doc, "#be123c")');
  });

  it("REC-5: exposes Applied to invoice only when raw money and settlement are non-redundant", () => {
    expect(receiptData).toContain("paymentCurrency !== currency || Math.abs(amount - settledAmount) > 0.005");
    expect(pdfService).toContain("APPLIED TO INVOICE");
    expect(pdfService).toContain("payment.showAppliedToInvoice");
  });

  it("REC-6: sends the same cumulative figures and payment rows in the receipt email", () => {
    expect(routers).toContain("includedPayments: receiptData.includedPayments.map");
    expect(emailService).toContain("copy.totalSettled");
    expect(emailService).toContain("copy.paymentsIncluded");
    expect(emailService).not.toContain("Thank you for your payment.");
  });

  it("REC-Q4-1: carries only stored, payment-linked native overpayment credit into the canonical receipt model", () => {
    expect(receiptData).toContain("listOverpaymentCreditLotsByInvoice(input.invoiceId)");
    expect(read("server/db.ts")).toContain('eq(creditTransactions.type, "overpayment")');
    expect(receiptData).toContain("originPaymentId");
    expect(receiptData).toContain("patientCredits:");
    expect(receiptData).toContain("overpaymentCredits:");
    expect(receiptData).not.toContain("computeNativeOverpaymentCredit");
  });

  it("REC-Q4-2: makes PDF and email distinguish received money, invoice settlement, and a native Patient Credit without calling it a refund", () => {
    const receiptStart = pdfService.indexOf("export async function generateReceiptPdf");
    const receiptEnd = pdfService.indexOf("export async function generateRefundPdf", receiptStart);
    const receiptBody = pdfService.slice(receiptStart, receiptEnd);
    expect(receiptBody).toContain("AMOUNT RECEIVED");
    expect(receiptBody).toContain("APPLIED TO INVOICE");
    expect(receiptBody).toContain("Patient Credit created:");
    expect(emailService).toContain("copy.patientCreditCreated");
    expect(routers).toContain("patientCredits: payment.patientCredits.map");
  });

  it("REC-7: keeps receipt eligibility server-authoritative in both direct and emailed paths", () => {
    expect(pdfRoutes).toContain("isOfficialReceiptEligible(receiptData)");
    expect(routers).toContain("isOfficialReceiptEligible(receiptData)");
  });

  it("REC-TAX-1: carries the saved Tax-v2 aggregate and immutable line facts through the shared receipt contract", () => {
    expect(receiptData).toContain("taxModelVersion?: string | null");
    expect(receiptData).toContain("taxAmount?: number");
    expect(receiptData).toContain("pricingMode?: string | null");
    expect(receiptData).toContain("taxLabelSnapshot?: string | null");
    expect(receiptData).toContain("taxModelVersion = invoice.taxModelVersion ?? null");
    expect(receiptData).toContain("taxAmount = Number(invoice.taxAmount ?? 0)");
    expect(receiptData).toContain("serviceTotal = isTaxModelInvoice ? Math.max(0, invoiceTotal - taxAmount) : undefined");
  });

  it("REC-TAX-2: explains an INV-00055-style Tax-v2 total as service total plus saved aggregate Tax without inferring one rate", () => {
    const receiptStart = pdfService.indexOf("export async function generateReceiptPdf");
    const receiptEnd = pdfService.indexOf("export async function generateRefundPdf", receiptStart);
    const receiptBody = pdfService.slice(receiptStart, receiptEnd);
    expect(receiptBody).toContain('const isTaxModelInvoice = data.taxModelVersion === "line_tax_v1";');
    expect(receiptBody).toContain('addSummaryRow("Service Total:"');
    expect(receiptBody).toContain('addSummaryRow("Service Tax:"');
    expect(receiptBody).toContain('addSummaryRow("Invoice Total:"');
    expect(receiptBody).toContain("Never infer a single rate for mixed Tax lines");
    expect(receiptBody).toContain("data.taxAmount ?? 0");
  });

  it("REC-TAX-3: keeps a persisted commercial adjustment separate from Tax in the Tax-v2 summary", () => {
    expect(pdfService).toContain("const savedCommercialAdjustment = Math.max(0, data.invoiceDiscountAmount ?? 0);");
    expect(pdfService).toContain('"Final Agreed Service Price Adjustment:"');
    expect(pdfService).toContain('`Discount (${Number(data.invoiceDiscountPercent).toFixed(2)}%):`');
    expect(receiptData).toContain("invoiceDiscountAmount: Number(invoice.discountAmount ?? 0)");
    expect(receiptData).toContain("finalAgreedAmount: invoice.finalAgreedAmount");
  });

  it("REC-TAX-4: keeps legacy receipt summary behavior on the existing branch", () => {
    expect(pdfService).toContain("const legacyDiscountAmt = Math.max(0, itemsSubtotal - data.invoiceTotal);");
    expect(pdfService).toContain("} else {\n      addSummaryRow(\"Subtotal:\"");
  });

  it("REC-TAX-5: makes the official-receipt email and its attached PDF consume the same saved Tax facts", () => {
    expect(routers).toContain("taxModelVersion: receiptData.taxModelVersion");
    expect(routers).toContain("serviceTotal: receiptData.serviceTotal?.toLocaleString");
    expect(routers).toContain("taxAmount: receiptData.taxAmount?.toLocaleString");
    expect(emailService).toContain('const isTaxModelInvoice = data.taxModelVersion === "line_tax_v1";');
    expect(emailService).toContain("copy.serviceTax");
    expect(routers).toContain("pdfBuffer,");
  });
});
