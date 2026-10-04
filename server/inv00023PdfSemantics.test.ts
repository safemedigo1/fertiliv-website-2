import fs from "node:fs";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("INV-00023 final manual-QA PDF and history semantics", () => {
  const db = read("server/db.ts");
  const pdfService = read("server/pdfService.ts");
  const pdfRoutes = read("server/pdfRoutes.ts");
  const routers = read("server/routers.ts");

  it("projects receivedAt to patient-level payment history so the timeline can use the financial date", () => {
    const patientPaymentProjection = db.slice(db.indexOf("export async function listPaymentsByPatient"), db.indexOf("export async function voidPayment"));
    expect(patientPaymentProjection).toContain("receivedAt: payments.receivedAt");
    expect(patientPaymentProjection).toContain("fxEffectiveAt: payments.fxEffectiveAt");
  });

  it("keeps an individual payment's original currency in Invoice PDF payment details", () => {
    expect(pdfService).toContain("currency?: string;");
    expect(pdfService).toContain("${pmt.currency ?? data.currency} ${fmt(pmt.amount)}");
    expect(pdfRoutes).toContain("currency: p.currency");
    expect(routers).toContain("currency: p.currency");
  });

  it("uses the persisted invoice issueDate before any creation-date fallback in direct PDF download", () => {
    const directInvoiceRoute = pdfRoutes.slice(pdfRoutes.indexOf("app.get(\"/api/invoices/:id/pdf\""), pdfRoutes.indexOf("Official Receipt PDF"));
    expect(directInvoiceRoute).toContain("rawInvoice.issueDate");
    expect(directInvoiceRoute.indexOf("rawInvoice.issueDate")).toBeLessThan(directInvoiceRoute.indexOf("rawInvoice.createdAt"));
  });

  it("uses the persisted settlement model to suppress surcharge presentation for v2 while retaining legacy option logic", () => {
    expect(pdfService).toContain("const isMethodNeutralInvoice = isMethodNeutralSettlementModel(data.settlementModelVersion) || data.pricingMode === \"agreed\"");
    expect(pdfService).toContain("This invoice has a fixed agreed total");
    expect(pdfService).toContain("No payment-method surcharge is added.");
    expect(pdfService).toContain("Card / Bank Transfer (+${surcharge}%):");
  });

  it("passes Tax-v2 markers and immutable Tax snapshots to direct and attached Invoice PDFs", () => {
    const directInvoiceRoute = pdfRoutes.slice(pdfRoutes.indexOf("app.get(\"/api/invoices/:id/pdf\""), pdfRoutes.indexOf("Official Receipt PDF"));
    const invoiceEmailRoute = routers.slice(routers.indexOf("sendInvoiceEmail: staffOrAdminProcedure"), routers.indexOf("sendRefundReceiptEmail:"));

    expect(pdfService).toContain("taxModelVersion?: string | null;");
    expect(pdfService).toContain("settlementModelVersion?: string | null;");
    expect(directInvoiceRoute).toContain("taxModelVersion: rawInvoice.taxModelVersion ?? null");
    expect(directInvoiceRoute).toContain("settlementModelVersion: rawInvoice.settlementModelVersion ?? null");
    expect(invoiceEmailRoute).toContain("taxModelVersion: (invoice as any).taxModelVersion ?? null");
    expect(invoiceEmailRoute).toContain("settlementModelVersion: (invoice as any).settlementModelVersion ?? null");
    expect(invoiceEmailRoute).toContain("taxLabelSnapshot: i.taxLabelSnapshot ?? null");
    expect(invoiceEmailRoute).toContain("effectiveTaxableBase: i.effectiveTaxableBase != null");
  });

  it("uses method-neutral wording for v2 and missing-snapshot Invoice emails while retaining legacy adjustment only from a saved snapshot", () => {
    const emailService = read("server/emailService.ts");
    const invoiceEmailRoute = routers.slice(routers.indexOf("sendInvoiceEmail: staffOrAdminProcedure"), routers.indexOf("sendRefundReceiptEmail:"));

    expect(emailService).toContain("|| !(data.cardSurchargePct && data.cardSurchargePct > 0);");
    expect(emailService).toContain("copy.cashCardBankTransfer");
    expect(emailService).toContain("legacyPaymentOptionAmount");
    expect(emailService).toContain("formatFinanceCopy(copy.legacyPaymentOptionsExplanation");
    expect(invoiceEmailRoute).toContain("paymentAdjustmentRateSnapshot = (invoice as any).paymentAdjustmentRateSnapshot");
    expect(invoiceEmailRoute).toContain("legacyPaymentOptionAmount: legacyPaymentOptionAmount");
    expect(routers).toContain("date: new Date(p.receivedAt ?? p.createdAt)");
  });
});
