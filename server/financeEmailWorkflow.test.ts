import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildInvoiceEmail, buildReceiptEmail } from "./emailService";
import { resolveFinanceEmailRecipients } from "./financeEmailRecipients";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Finance email workflow and legacy presentation guards", () => {
  const routers = read("server/routers.ts");
  const emailService = read("server/emailService.ts");
  const pdfService = read("server/pdfService.ts");
  const pdfRoutes = read("server/pdfRoutes.ts");
  const patientDetail = read("client/src/pages/PatientDetailPage.tsx");
  const servicesPage = read("client/src/pages/ServicesPage.tsx");
  const servicePicker = read("client/src/components/ServicePickerModal.tsx");

  it("normalizes and case-insensitively deduplicates saved, partner, and manual recipient emails", () => {
    expect(resolveFinanceEmailRecipients([
      { source: "patient", email: " Patient@Example.com ", displayName: "Patient", directProfileLanguage: "tr" },
      { source: "partner", email: "partner@example.com", displayName: "Partner", directProfileLanguage: "ar" },
      { source: "manual", email: "patient@example.com", displayName: "Manual", inheritLanguageFrom: "patient" },
      { source: "manual", email: "invalid", displayName: "Invalid", inheritLanguageFrom: "patient" },
    ])).toEqual([
      expect.objectContaining({ source: "patient", email: "patient@example.com", displayName: "Patient", deliveredLocale: "tr" }),
      expect.objectContaining({ source: "partner", email: "partner@example.com", displayName: "Partner", deliveredLocale: "ar" }),
    ]);
  });

  it("allows one validated manual recipient without changing CRM email fields and rejects an empty resolved list", () => {
    const invoiceRoute = routers.slice(routers.indexOf("sendInvoiceEmail: staffOrAdminProcedure"), routers.indexOf("sendRefundReceiptEmail:"));
    const receiptRoute = routers.slice(routers.indexOf("sendReceiptEmail: staffOrAdminProcedure"), routers.indexOf("}),\n  }),\n  // ─── Lab"));
    expect(invoiceRoute).toContain("manualEmail: z.string().trim().email().max(320).optional()");
    expect(receiptRoute).toContain("manualEmail: z.string().trim().email().max(320).optional()");
    expect(invoiceRoute).toContain("resolveFinanceEmailRecipients([");
    expect(receiptRoute).toContain("resolveFinanceEmailRecipients([");
    expect(invoiceRoute).toContain("Add a valid email address before sending this invoice.");
    expect(receiptRoute).toContain("Add a valid email address before sending this official receipt.");
    expect(invoiceRoute).not.toContain("updatePatient(");
    expect(receiptRoute).not.toContain("updatePatient(");
  });

  it("contains provider delivery failures while leaving already-saved Finance records untouched", () => {
    const invoiceRoute = routers.slice(routers.indexOf("sendInvoiceEmail: staffOrAdminProcedure"), routers.indexOf("sendRefundReceiptEmail:"));
    const receiptRoute = routers.slice(routers.indexOf("sendReceiptEmail: staffOrAdminProcedure"), routers.indexOf("}),\n  }),\n  // ─── Lab"));
    expect(invoiceRoute).toContain("let sentCount = 0;");
    expect(invoiceRoute).toContain("let failedCount = 0;");
    expect(invoiceRoute).toContain("[Finance] Invoice email delivery failed");
    expect(receiptRoute).toContain("[Finance] Official receipt email delivery failed");
    expect(invoiceRoute).not.toContain("deleteInvoice(");
    expect(receiptRoute).not.toContain("updateInvoice(");
  });

  it("opens the explicit Send Invoice dialog only after Create or Edit persistence succeeds", () => {
    expect(patientDetail).toContain('id="openInvoiceSendAfterCreate"');
    expect(patientDetail).toContain('id="openInvoiceSendAfterEdit"');
    expect(patientDetail).toContain("onSuccess(result, shouldOpenSendDialog, shouldNotifyPartner);");
    expect(patientDetail).toContain("onSuccess({ openSendAfterSave, recordPaymentAfterSave });");
    expect(patientDetail).toContain("setSendEmailInvoice(createdInvoice);");
    expect(patientDetail).toContain("setSendEmailNotifyPartner(Boolean(notifyPartnerAfterSave));");
    expect(patientDetail).toContain("setSendEmailInvoice(persistedInvoice);");
    expect(patientDetail).toContain("Review recipients and press Send Email separately.");
  });

  it("keeps manual-recipient drafts local and protects them from accidental leave", () => {
    expect(patientDetail).toContain("fertiliv:finance-invoice-email:");
    expect(patientDetail).toContain("fertiliv:finance-receipt-email:");
    expect(patientDetail).toContain("useDraftForm<{ manualEmail: string }>");
    expect(patientDetail).toContain("useBeforeUnload(Boolean(");
    expect(patientDetail).toContain("clearInvoiceRecipientDraft()");
    expect(patientDetail).toContain("clearReceiptRecipientDraft()");
  });

  it("passes the loaded patient to FinanceTab for saved-email presentation only", () => {
    expect(patientDetail).toContain('<FinanceTab patientId={patientId} patient={patient} />');
    const invoiceRoute = routers.slice(routers.indexOf("sendInvoiceEmail: staffOrAdminProcedure"), routers.indexOf("sendRefundReceiptEmail:"));
    const receiptRoute = routers.slice(routers.indexOf("sendReceiptEmail: staffOrAdminProcedure"));
    expect(invoiceRoute).toContain("getPatientById(invoice.patientId)");
    expect(receiptRoute).toContain("getPatientById(invoice.patientId)");
    expect(invoiceRoute).not.toContain("input.patientEmail");
    expect(receiptRoute).not.toContain("input.patientEmail");
  });

  it("removes active +23% presentation from services, picker, and the new-model Send Invoice modal", () => {
    expect(servicesPage).not.toContain("Legacy Card / Bank Transfer Surcharge %");
    expect(servicesPage).not.toContain("applied for card/bank transfer");
    expect(servicesPage).not.toContain("foreignWithCard");
    expect(servicePicker).not.toContain("surchargeRate");
    expect(servicePicker).not.toContain("+{Math.round(surchargeRate * 100)}% card");
    const sendInvoiceDialog = patientDetail.slice(patientDetail.indexOf("{/* Send Email Dialog */}"), patientDetail.indexOf("// ─── Lab Tab"));
    expect(sendInvoiceDialog).not.toContain("Card / Bank (+");
  });

  it("renders a legacy surcharge only from the immutable invoice snapshot and treats missing snapshots as one-for-one", () => {
    const directInvoiceRoute = pdfRoutes.slice(pdfRoutes.indexOf('app.get("/api/invoices/:id/pdf"'), pdfRoutes.indexOf("Official Receipt PDF"));
    const invoiceEmailRoute = routers.slice(routers.indexOf("sendInvoiceEmail: staffOrAdminProcedure"), routers.indexOf("sendRefundReceiptEmail:"));
    expect(directInvoiceRoute).toContain("paymentAdjustmentRateSnapshot = rawInvoice.paymentAdjustmentRateSnapshot");
    expect(directInvoiceRoute).toContain("cardSurchargePct: paymentAdjustmentRateSnapshot");
    expect(invoiceEmailRoute).toContain("paymentAdjustmentRateSnapshot = (invoice as any).paymentAdjustmentRateSnapshot");
    expect(invoiceEmailRoute).toContain("cardSurchargePct: paymentAdjustmentRateSnapshot");
    expect(pdfService).toContain("const hasLegacySurchargeSnapshot = !isMethodNeutralInvoice && surcharge > 0;");
    expect(pdfService).toContain("if (!hasLegacySurchargeSnapshot)");
    expect(emailService).toContain("|| !(data.cardSurchargePct && data.cardSurchargePct > 0);");
  });

  it("uses a server-prepared canonical balance for every Invoice Email financial state", () => {
    const render = (netSettled: string, balanceDue: string, isFullySettled = false) => buildInvoiceEmail({
      patientName: "Test Patient",
      invoiceNumber: "INV-EMAIL-QA",
      totalAmount: "60,885.00",
      currency: "TRY",
      taxModelVersion: "line_tax_v1",
      serviceTotal: "55,350.00",
      taxAmount: "5,535.00",
      netSettled,
      balanceDue,
      isFullySettled,
      settlementModelVersion: "method_neutral_v2",
    }).body;

    expect(render("0.00", "60,885.00")).toContain("TRY 60,885.00");
    expect(render("10,000.00", "50,885.00")).toContain("TRY 50,885.00");
    expect(render("60,885.00", "0.00", true)).toContain("Paid in Full");
    expect(render("60,385.00", "500.00")).toContain("TRY 500.00");
    expect(emailService).not.toContain('parseFloat(data.totalAmount)');
    expect(emailService).not.toContain('parseFloat(data.paidAmount');
    const invoiceEmailRoute = routers.slice(routers.indexOf("sendInvoiceEmail: staffOrAdminProcedure"), routers.indexOf("sendRefundReceiptEmail:"));
    expect(routers).toContain("balanceDue: formatEmailMoney(balanceDue)");
    expect(routers).toContain("netSettled: formatEmailMoney(financialSummary.netSettled)");
    expect(invoiceEmailRoute).toContain("totalAmount: formatEmailMoney(financialSummary.invoiceTotal)");
    expect(invoiceEmailRoute).toContain("totalAmount: totalNum,");
  });

  it("renders Invoice and Official Receipt financial facts in inline presentation tables", () => {
    const invoiceBody = buildInvoiceEmail({
      patientName: "Test Patient",
      invoiceNumber: "INV-EMAIL-QA",
      totalAmount: "60,885.00",
      currency: "TRY",
      issueDate: "01 September 2026",
      taxModelVersion: "line_tax_v1",
      netSettled: "0.00",
      balanceDue: "60,885.00",
      isFullySettled: false,
      settlementModelVersion: "method_neutral_v2",
    }).body;
    const receiptBody = buildReceiptEmail({
      patientName: "Test Patient",
      receiptNumber: "REC-EMAIL-QA",
      invoiceNumber: "INV-EMAIL-QA",
      invoiceCurrency: "TRY",
      invoiceTotal: "60,885.00",
      totalSettled: "60,885.00",
      balanceDue: "0.00",
      includedPayments: [{ paymentDate: "01 September 2026", method: "Cash", currency: "TRY", amount: "60,885.00" }],
    }).body;
    for (const body of [invoiceBody, receiptBody]) {
      expect(body).toContain('role="presentation"');
      expect(body).toContain('width="100%"');
      expect(body).toContain('text-align:right;');
      expect(body).toContain('border-collapse:collapse;');
    }
    expect(invoiceBody).toContain("Service Total");
    expect(invoiceBody).toContain("TRY 60,885.00");
    expect(invoiceBody).toMatch(/Invoice Number<\/td><\/tr><tr><td[^>]*>(?:<span[^>]*>)?INV-EMAIL-QA/);
    expect(invoiceBody).toMatch(/Issue Date<\/td><\/tr><tr><td[^>]*>(?:<span[^>]*>)?01 September 2026/);
    expect(receiptBody).toContain("Total Settled to This Invoice");
    expect(receiptBody).toContain("TRY 60,885.00");
    expect(receiptBody).toMatch(/Receipt Number<\/td><td[^>]*>REC-EMAIL-QA<\/td>/);
    expect(receiptBody).toMatch(/Invoice Reference<\/td><td[^>]*>INV-EMAIL-QA<\/td>/);
    expect(emailService).toContain("metadataEmailRow(copy.invoiceNumber, data.invoiceNumber, rtl, true)");
    expect(emailService).toContain("metadataEmailRow(copy.receiptNumber, data.receiptNumber, rtl)");
    const receiptRoute = routers.slice(routers.indexOf("sendReceiptEmail: staffOrAdminProcedure"));
    expect(receiptRoute).toContain("buildCumulativeReceiptData");
    expect(receiptRoute).toContain("generateReceiptPdf");
  });

  it("renders an informational derived line discount in Invoice and Updated Invoice HTML only when the final line is lower", () => {
    const body = buildInvoiceEmail({
      patientName: "Test Patient",
      invoiceNumber: "INV-LINE-DISCOUNT",
      totalAmount: "2,700.00",
      currency: "USD",
      netSettled: "0.00",
      balanceDue: "2,700.00",
      isFullySettled: false,
      items: [{
        name: "Negotiated service",
        amount: "USD 2,700.00",
        originalLineTotal: "3222.13",
        finalLineTotal: "2700.00",
      }],
    }).body;
    expect(body).toContain("Original Line Total");
    expect(body).toContain("USD 3,222.13");
    expect(body).toContain("Discount (16.20%)");
    expect(body).toContain("- USD 522.13");
    expect(emailService).toContain("deriveInvoiceLineDiscountPresentation");
    expect(routers).toContain("originalLineTotal: String(Number(i.unitPrice) * Number(i.quantity))");
    expect(routers).toContain("finalLineTotal: String(i.totalPrice)");
    expect(pdfService).toContain("deriveInvoiceLineDiscountPresentation");
  });

  it("places the Official Receipt stamp in the centered information area and keeps every Receipt footer inside the reserved printable area", () => {
    expect(pdfService).toContain("const receiptContentBottom = receiptPageHeight - receiptFooterHeight - 14;");
    expect(pdfService).toContain("const receiptInfoStampBox = { width: 88, height: 56 };");
    expect(pdfService).toContain("const receiptInfoStampX = MARGIN + (contentW - receiptInfoStampBox.width) / 2;");
    expect(pdfService).toContain("doc.image(stampBuffer, receiptInfoStampX, receiptInfoStampY");
    expect(pdfService).toContain("y = Math.max(y + 24, stampBuffer ? receiptInfoStampBottom + 12 : 0);");
    expect(pdfService).toContain("ensureReceiptContentSpace(rowHeight)");
    expect(pdfService).toContain("const receiptPages = doc.bufferedPageRange()");
    expect(pdfService).toContain("drawReceiptFooter()");
  });

  it("renders one FX audit-note label in direct PDF, attached PDF, and inline invoice email", () => {
    expect(pdfService).toContain("FX audit note: ${fxAuditNote}");
    expect(pdfService).toContain('replace(/^note\\s*:\\s*/i, "")');
    expect(emailService).toContain("financePaymentDetailRow(copy.fxAuditNote");
    expect(emailService).toContain('replace(/^note\\s*:\\s*/i, "")');
    expect(routers).toContain("paymentDetails,");
    expect(pdfRoutes).toContain("fxRateNote: p.fxRateNote");
  });

  it("preserves Q1–Q4 explicit quantity and stored overpayment-credit disclosure contracts", () => {
    expect(patientDetail).toContain("keepAgreedLineTotalAfterQuantityChange");
    expect(patientDetail).toContain("resetLinePricingAfterQuantityChange");
    expect(patientDetail).toContain("Expected Patient Credit:");
    expect(pdfService).toContain("Patient Credit created:");
    expect(emailService).toContain("copy.patientCreditCreated");
  });
});
