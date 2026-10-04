import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Invoice overpayment disclosure — saved financial facts only", () => {
  const db = read("server/db.ts");
  const pdfRoutes = read("server/pdfRoutes.ts");
  const routers = read("server/routers.ts");
  const pdfService = read("server/pdfService.ts");
  const emailService = read("server/emailService.ts");

  it("Q3-1: reads immutable overpayment credit lots by invoice and origin payment without writing, re-pricing, or deriving a new credit", () => {
    const helper = db.slice(db.indexOf("export async function listOverpaymentCreditLotsByInvoice"), db.indexOf("/** Explicit non-cash FX precision closures"));
    expect(helper).toContain("creditTransactions.originPaymentId");
    expect(helper).toContain('eq(creditTransactions.type, "overpayment")');
    expect(helper).toContain("eq(creditTransactions.invoiceId, invoiceId)");
    expect(helper).not.toContain("insert(");
    expect(helper).not.toContain("update(");
    expect(helper).not.toContain("computeNativeOverpaymentCredit");
  });

  it("Q3-2: direct Invoice PDF maps gross converted value, persisted settlement, and payment-linked native credit separately", () => {
    expect(pdfRoutes).toContain("listOverpaymentCreditLotsByInvoice(invoiceId)");
    expect(pdfRoutes).toContain("convertedAmountInInvoiceCurrency");
    expect(pdfRoutes).toContain("settledAmount:");
    expect(pdfRoutes).toContain("patientCredits: overpaymentCreditLots");
    expect(pdfService).toContain("Converted value:");
    expect(pdfService).toContain("Applied to invoice:");
    expect(pdfService).toContain("Patient Credit created:");
    expect(pdfService).not.toContain("Applied to invoice: ${pmt.invoiceCurrency} ${fmt(pmt.invoiceAmount)}");
  });

  it("Q3-3: invoice email and its attached PDF reuse one payment-details mapping and retain bank-deduction disclosure", () => {
    expect(routers).toContain("const paymentDetails = invoicePayments.map");
    expect(routers).toContain("paymentDetails,");
    expect(emailService).toContain("const paymentDetailsHtml = data.paymentDetails?.length");
    expect(emailService).toContain("copy.convertedValue");
    expect(emailService).toContain("copy.appliedToInvoice");
    expect(emailService).toContain("copy.patientCreditCreated");
    expect(pdfService).toContain("Bank Deduction:");
  });
});
