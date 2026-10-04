import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_COMMUNICATION_PUBLISHED_LOCALES,
  resolveAppointmentCommunicationLocale,
} from "../shared/appointmentCommunicationLocales";
import {
  FINANCE_COMMUNICATION_TEMPLATE_VERSION,
  financeCommunicationLocaleResources,
  formatFinancePaymentMethod,
  getFinanceCommunicationLocaleResource,
} from "../shared/financeCommunicationLocales";
import { buildInvoiceEmail, buildReceiptEmail, wrapFinanceCommunicationEmail } from "./emailService";
import { resolveFinanceEmailRecipients } from "./financeEmailRecipients";

const root = resolve(import.meta.dirname, "..");
const source = (file: string) => readFileSync(resolve(root, file), "utf8");

const invoice = {
  patientName: "Ayla Patient",
  invoiceNumber: "INV-I18N-QA",
  totalAmount: "173,980.00",
  currency: "TRY",
  issueDate: "02 September 2026",
  dueDate: "09 September 2026",
  taxModelVersion: "line_tax_v1",
  serviceTotal: "160,000.00",
  taxAmount: "13,980.00",
  netSettled: "100,200.00",
  balanceDue: "73,780.00",
  isFullySettled: false,
  settlementModelVersion: "method_neutral_v2",
  notes: "Staff note stays exactly as entered.",
  items: [{
    name: "IVF + ICSI Full Cycle (Fresh Embryo Transfer) – Taxable Portion – Down Payment",
    amount: "TRY 160,000.00",
    quantity: 1,
    taxLabelSnapshot: "Tax",
    taxRateSnapshot: 8.74,
    taxAmount: "13,980.00",
    priceEntryCurrency: "USD",
    priceEntryAmount: "3,500.00",
    priceFxRateToInvoice: "48",
    priceFxSource: "manual" as const,
    priceFxNote: "Do not translate this audit note.",
  }],
  paymentDetails: [{
    date: "02 September 2026",
    method: "bank_transfer",
    amount: 2_087.5,
    currency: "USD",
    convertedAmountInInvoiceCurrency: 100_200,
    settledAmount: 100_200,
    invoiceCurrency: "TRY",
    conversionRateToInvoice: "48",
    fxRateSource: "manual" as const,
    fxRateNote: "Do not translate this audit note.",
    patientCredits: [{ currency: "USD", amount: 12.5 }],
  }],
};

describe("Finance Multilingual Communications Phase A", () => {
  it("uses the existing canonical resolver for all 29 published locales and its exact fallback contract", () => {
    expect(APPOINTMENT_COMMUNICATION_PUBLISHED_LOCALES).toHaveLength(29);
    for (const locale of APPOINTMENT_COMMUNICATION_PUBLISHED_LOCALES) {
      expect(resolveAppointmentCommunicationLocale(`  ${locale.toUpperCase()}  `)).toMatchObject({ deliveredLocale: locale, fallbackUsed: false });
      expect(getFinanceCommunicationLocaleResource(locale)).toMatchObject({ locale });
    }
    expect(resolveAppointmentCommunicationLocale(null)).toMatchObject({ deliveredLocale: "en", fallbackUsed: false });
    expect(resolveAppointmentCommunicationLocale("")).toMatchObject({ deliveredLocale: "en", fallbackUsed: false });
    expect(resolveAppointmentCommunicationLocale("other")).toMatchObject({ deliveredLocale: "en", fallbackUsed: true });
    expect(resolveAppointmentCommunicationLocale("unknown")).toMatchObject({ deliveredLocale: "en", fallbackUsed: true });
  });

  it("has complete deterministic Finance system-copy resources for every published locale", () => {
    expect(FINANCE_COMMUNICATION_TEMPLATE_VERSION).toBe("finance-phase-a-v1");
    const englishKeys = Object.keys(financeCommunicationLocaleResources.en).sort();
    for (const locale of APPOINTMENT_COMMUNICATION_PUBLISHED_LOCALES) {
      const resource = financeCommunicationLocaleResources[locale as keyof typeof financeCommunicationLocaleResources];
      expect(Object.keys(resource).sort()).toEqual(englishKeys);
      expect(Object.values(resource).every(value => typeof value === "string" && value.length > 0)).toBe(true);
    }
    for (const locale of APPOINTMENT_COMMUNICATION_PUBLISHED_LOCALES.filter(locale => locale !== "en")) {
      const resource = financeCommunicationLocaleResources[locale as keyof typeof financeCommunicationLocaleResources];
      expect(resource.callPhoneConnector.toLowerCase()).not.toContain("or call");
      expect(resource.paymentMethodCash).not.toBe("Cash");
    }
  });

  it("resolves every saved recipient independently through Patient/Lead precedence and makes manual email inherit Patient locale", () => {
    const recipients = resolveFinanceEmailRecipients([
      { source: "patient", email: "patient@example.com", displayName: "Patient", directProfileLanguage: " fr ", convertedLeadProfileLanguage: null },
      { source: "partner", email: "partner@example.com", displayName: "Partner", directProfileLanguage: "tr", convertedLeadProfileLanguage: "AR" },
      { source: "manual", email: "qa@example.com", displayName: "Manual", inheritLanguageFrom: "patient" },
      { source: "manual", email: "PATIENT@example.com", displayName: "Duplicate", inheritLanguageFrom: "patient" },
    ]);
    expect(recipients).toEqual([
      expect.objectContaining({ source: "patient", email: "patient@example.com", profileLanguage: "fr", deliveredLocale: "fr", preferredLanguage: "fr" }),
      expect.objectContaining({ source: "partner", email: "partner@example.com", profileLanguage: "ar", deliveredLocale: "ar", preferredLanguage: "ar" }),
      expect.objectContaining({ source: "manual", email: "qa@example.com", profileLanguage: "fr", deliveredLocale: "fr", preferredLanguage: "fr" }),
    ]);
  });

  it("does not infer a language from preferred-language ordering when no Primary Language exists", () => {
    const recipients = resolveFinanceEmailRecipients([
      { source: "patient", email: "patient@example.com", displayName: "Patient", directProfileLanguage: null, convertedLeadProfileLanguage: null },
    ]);
    expect(recipients[0]).toMatchObject({ profileLanguage: null, deliveredLocale: "en", localeFallbackUsed: false });
  });

  it("renders localized Invoice issued/updated system copy while preserving all canonical values and free text unchanged", () => {
    for (const locale of ["en", "fr", "ar", "tr"] as const) {
      const issued = buildInvoiceEmail(invoice, locale);
      const updated = buildInvoiceEmail({ ...invoice, isUpdate: true }, locale);
      for (const rendered of [issued, updated]) {
        for (const invariant of [
          "INV-I18N-QA", "TRY 160,000.00", "TRY 13,980.00", "TRY 173,980.00", "TRY 100,200.00", "TRY 73,780.00",
          "USD 2,087.50", "48", "IVF + ICSI Full Cycle (Fresh Embryo Transfer) – Taxable Portion – Down Payment",
          "Staff note stays exactly as entered.", "Do not translate this audit note.",
        ]) expect(`${rendered.subject}\n${rendered.body}`).toContain(invariant);
      }
      expect(issued.subject).toBeTruthy();
      expect(updated.subject).toBeTruthy();
      expect(updated.subject).not.toBe(issued.subject);
      expect(updated.body).not.toContain("<blockquote");
      expect(updated.body).not.toContain("display:none");
    }
    expect(buildInvoiceEmail(invoice, "fr").body).toContain("Total des services");
    expect(buildInvoiceEmail(invoice, "ar").body).toContain("إجمالي الخدمات");
    expect(buildInvoiceEmail({ ...invoice, isUpdate: true }, "tr").body).toContain("Fatura Güncellendi");
  });

  it("renders localized Official Receipt system copy while preserving canonical settlement values and free text", () => {
    const receipt = {
      patientName: "Ayla Patient",
      receiptNumber: "REC-I18N-QA",
      invoiceNumber: "INV-I18N-QA",
      invoiceCurrency: "TRY",
      taxModelVersion: "line_tax_v1",
      serviceTotal: "160,000.00",
      taxAmount: "13,980.00",
      invoiceTotal: "173,980.00",
      totalSettled: "100,200.00",
      balanceDue: "73,780.00",
      receiptNote: "Do not translate this receipt note.",
      includedPayments: [{ paymentDate: "02 September 2026", method: "cash", amount: "2,087.50", currency: "USD", appliedToInvoice: "TRY 100,200.00", patientCredits: [{ currency: "USD", amount: "12.50" }] }],
    };
    for (const locale of ["en", "fr", "ar", "tr"] as const) {
      const rendered = buildReceiptEmail(receipt, locale);
      for (const invariant of ["REC-I18N-QA", "INV-I18N-QA", "TRY 173,980.00", "TRY 100,200.00", "TRY 73,780.00", "USD 2,087.50", "Do not translate this receipt note."]) {
        expect(`${rendered.subject}\n${rendered.body}`).toContain(invariant);
      }
    }
    expect(buildReceiptEmail(receipt, "fr").body).toContain("Reçu officiel");
    expect(buildReceiptEmail(receipt, "ar").body).toContain("الإيصال الرسمي");
    expect(buildReceiptEmail(receipt, "tr").body).toContain("Resmî Makbuz");
    expect(buildReceiptEmail(receipt, "tr").body).toContain("Nakit");
    expect(buildReceiptEmail(receipt, "tr").body).toContain("veya arayın");
    expect(buildReceiptEmail(receipt, "tr").body).not.toContain("or call");
    for (const locale of ["en", "tr", "fr", "ar"] as const) {
      expect(buildReceiptEmail(receipt, locale).body).toContain('dir="ltr" style="direction:ltr;unicode-bidi:isolate;white-space:normal;overflow-wrap:anywhere;word-wrap:break-word;">02 September 2026</span>');
    }
  });

  it("gets RTL from the shared registry for Arabic, Persian, Urdu, and Hebrew without reversing canonical values", () => {
    for (const locale of ["ar", "fa", "ur", "he"] as const) {
      const html = wrapFinanceCommunicationEmail("<p>TRY 173,980.00 · INV-I18N-QA</p>", locale);
      expect(html).toContain(`<html lang="${locale}" dir="rtl">`);
      expect(html).toContain("direction: rtl; text-align: right;");
      expect(html).toContain("TRY 173,980.00 · INV-I18N-QA");
    }
  });

  it("uses static localized payment-method labels and keeps unknown/manual text untouched", () => {
    expect(formatFinancePaymentMethod("cash", "tr")).toBe("Nakit");
    expect(formatFinancePaymentMethod("credit_card", "fr")).toBe("Carte de crédit");
    expect(formatFinancePaymentMethod("bank_transfer", "ar")).toBe("تحويل بنكي");
    expect(formatFinancePaymentMethod("insurance", "en")).toBe("Insurance");
    expect(formatFinancePaymentMethod("manual processor note", "tr")).toBe("manual processor note");
  });

  it("localizes Official Receipt adjustment labels without changing the saved adjustment amount", () => {
    const receipt = {
      patientName: "Ayla Patient", receiptNumber: "REC-ADJUST-QA", invoiceNumber: "INV-ADJUST-QA", invoiceCurrency: "TRY",
      taxModelVersion: "line_tax_v1", pricingMode: "agreed", invoiceDiscountAmount: "1,200.00", invoiceTotal: "10,000.00",
      totalSettled: "8,800.00", balanceDue: "1,200.00", includedPayments: [],
    };
    const turkish = buildReceiptEmail(receipt, "tr").body;
    const arabic = buildReceiptEmail(receipt, "ar").body;
    expect(turkish).toContain("Nihai Mutabık Kalınan Hizmet Fiyatı Ayarlaması");
    expect(arabic).toContain("تعديل السعر النهائي المتفق عليه للخدمة");
    expect(turkish).toContain("− TRY 1,200.00");
    expect(arabic).toContain("− TRY 1,200.00");
  });

  it("uses a simplified one-reference structure for Arabic Finance subjects", () => {
    const invoiceSubject = buildInvoiceEmail(invoice, "ar").subject;
    const updatedInvoiceSubject = buildInvoiceEmail({ ...invoice, isUpdate: true }, "ar").subject;
    const receiptSubject = buildReceiptEmail({
      patientName: "Ayla Patient", receiptNumber: "REC-I18N-QA", invoiceNumber: "INV-I18N-QA", invoiceCurrency: "TRY",
      invoiceTotal: "173,980.00", totalSettled: "100,200.00", balanceDue: "73,780.00", includedPayments: [],
    }, "ar").subject;
    expect(invoiceSubject).toBe("فاتورة جديدة: \u2066INV-I18N-QA\u2069");
    expect(updatedInvoiceSubject).toBe("تم تحديث الفاتورة: \u2066INV-I18N-QA\u2069");
    expect(receiptSubject).toBe("إيصال رسمي: \u2066REC-I18N-QA\u2069");
    for (const subject of [invoiceSubject, updatedInvoiceSubject, receiptSubject]) {
      expect(subject).not.toContain("Fertiliv");
      expect(subject).not.toContain("—");
    }
  });

  it("forces LTR-sensitive tokens to a single non-wrapping presentation run in Arabic Finance HTML", () => {
    const arabicHtml = wrapFinanceCommunicationEmail("<p>Arabic Finance test</p>", "ar", {
      phone: "+90 501 114 70 60",
      email: "info@fertiliv.com",
      website: "https://fertiliv.com",
      waLink: "https://wa.me/905011147060",
    });
    const forcedLtr = 'dir="ltr" style="display:inline-block;direction:ltr;unicode-bidi:bidi-override;white-space:nowrap;text-align:left;"';
    expect(arabicHtml).toContain(`href="tel:905011147060"><bdi ${forcedLtr}>+90&nbsp;501&nbsp;114&nbsp;70&nbsp;60</bdi>`);
    expect(arabicHtml).toContain(`href="mailto:info@fertiliv.com"><span ${forcedLtr}>info@fertiliv.com</span>`);
    expect(arabicHtml).toContain(`href="https://fertiliv.com"><span ${forcedLtr}>fertiliv.com</span>`);
    expect(arabicHtml).toContain(`href="https://wa.me/905011147060"><span ${forcedLtr}>WhatsApp</span>`);
    const turkishHtml = wrapFinanceCommunicationEmail("<p>LTR Finance test</p>", "tr", { phone: "+90 501 114 70 60" });
    expect(turkishHtml).toContain("+90&nbsp;501&nbsp;114&nbsp;70&nbsp;60");
    expect(turkishHtml).not.toContain("bidi-override");
  });

  it("uses the proven LTR phone and email wrapper in Arabic Invoice and Updated Invoice contact lines", () => {
    const expectedPhone = '<bdi dir="ltr" style="display:inline-block;direction:ltr;unicode-bidi:bidi-override;white-space:nowrap;text-align:left;">+90&nbsp;501&nbsp;114&nbsp;70&nbsp;60</bdi>';
    const expectedEmail = '<span dir="ltr" style="display:inline-block;direction:ltr;unicode-bidi:bidi-override;white-space:nowrap;text-align:left;">info@fertiliv.com</span>';
    const issued = buildInvoiceEmail(invoice, "ar").body;
    const updated = buildInvoiceEmail({ ...invoice, isUpdate: true }, "ar").body;
    for (const html of [issued, updated]) {
      expect(html).toContain(expectedPhone);
      expect(html).toContain(expectedEmail);
      expect(html).not.toContain("<strong>+90 501 114 70 60</strong>");
    }
  });

  it("restores the historical localized WhatsApp CTA in Official Receipt across LTR and RTL locales", () => {
    const receipt = {
      patientName: "Ayla Patient", receiptNumber: "REC-CTA-QA", invoiceNumber: "INV-CTA-QA", invoiceCurrency: "TRY",
      invoiceTotal: "10,000.00", totalSettled: "10,000.00", balanceDue: "0.00", includedPayments: [],
      waLink: "https://wa.me/905011147060",
    };
    const expectedLabels = {
      en: "Contact Us on WhatsApp",
      tr: "WhatsApp üzerinden bizimle iletişime geçin",
      fr: "Contactez-nous sur WhatsApp",
      ar: "تواصل معنا عبر WhatsApp",
    } as const;
    for (const [locale, label] of Object.entries(expectedLabels) as Array<[keyof typeof expectedLabels, string]>) {
      const html = buildReceiptEmail(receipt, locale).body;
      expect(html).toContain('href="https://wa.me/905011147060"');
      expect(html).toContain(label);
      expect(html.match(/https:\/\/wa\.me\/905011147060/g)).toHaveLength(1);
    }
    const arabicReceipt = buildReceiptEmail(receipt, "ar").body;
    expect(arabicReceipt).toContain('<bdi dir="ltr" style="display:inline-block;direction:ltr;unicode-bidi:bidi-override;white-space:nowrap;text-align:left;">+90&nbsp;501&nbsp;114&nbsp;70&nbsp;60</bdi>');
    expect(arabicReceipt).toContain('<span dir="ltr" style="display:inline-block;direction:ltr;unicode-bidi:bidi-override;white-space:nowrap;text-align:left;">info@fertiliv.com</span>');
  });

  it("routes Finance only through deterministic HTML and leaves PDF architecture untouched", () => {
    const emailSource = source("server/emailService.ts");
    const invoiceSender = emailSource.slice(emailSource.indexOf("export async function sendInvoiceEmail"), emailSource.indexOf("// ─── Official Receipt Email"));
    const receiptSender = emailSource.slice(emailSource.indexOf("export async function sendReceiptEmailDirect"), emailSource.indexOf("export async function sendRefundEmail"));
    const pdfSource = source("server/pdfService.ts");
    expect(invoiceSender).toContain("sendFinanceInline");
    expect(invoiceSender).not.toContain("sendInline({");
    expect(invoiceSender).not.toContain("sendWithTemplate(");
    expect(invoiceSender).not.toContain("translateContent");
    expect(receiptSender).toContain("sendFinanceInline");
    expect(receiptSender).not.toContain("sendInline({");
    expect(pdfSource).not.toContain("financeCommunicationLocales");
  });

  it("does not set reply or reference headers that would force Updated Invoice threading", () => {
    const emailSource = source("server/emailService.ts");
    const financeSender = emailSource.slice(emailSource.indexOf("async function sendFinanceInline"), emailSource.indexOf("function classifyAppointmentDetailsEmailFailure"));
    const updated = buildInvoiceEmail({ ...invoice, isUpdate: true }, "en");
    expect(updated.subject).toBe("Invoice Updated — INV-I18N-QA — Fertiliv");
    expect(financeSender).not.toContain("In-Reply-To");
    expect(financeSender).not.toContain("References");
    expect(financeSender).not.toContain("threadId");
  });

  it("keeps cross-currency payment metadata in contained email-safe subrows and gives the audit note a full-width wrapping row", () => {
    const paymentBlock = buildInvoiceEmail({ ...invoice, isUpdate: true }, "en").body;
    const paymentStart = paymentBlock.indexOf("02 September 2026");
    const contactStart = paymentBlock.indexOf("For any queries");
    const crossCurrencyDetails = paymentBlock.slice(paymentStart, contactStart);
    expect(crossCurrencyDetails).toContain('width="100%" valign="top"');
    expect(crossCurrencyDetails).not.toContain('width:38%;padding:7px 10px 0 0');
    expect(crossCurrencyDetails).toContain("white-space:normal;overflow-wrap:anywhere;");
    expect(crossCurrencyDetails).toContain("word-wrap:break-word;word-break:break-word;");
    expect(crossCurrencyDetails).toContain("Do not translate this audit note.");
    expect(crossCurrencyDetails).toContain("Applied to invoice");
  });

  it("keeps native-currency payment rows compact without inserting an empty supplemental metadata row", () => {
    const nativePayment = buildInvoiceEmail({
      ...invoice,
      paymentDetails: [{ date: "02 September 2026", method: "cash", amount: 500, currency: "TRY", invoiceCurrency: "TRY", settledAmount: 500 }],
    }, "en").body;
    const paymentStart = nativePayment.indexOf("02 September 2026");
    const paymentEnd = nativePayment.indexOf("Payment Options");
    const nativePaymentDetails = nativePayment.slice(paymentStart, paymentEnd);
    expect(nativePaymentDetails).toContain("Amount received");
    expect(nativePaymentDetails).not.toContain("Applied to invoice");
    expect(nativePaymentDetails).not.toContain("FX audit note");
  });

  it("keeps negotiated service pricing and multiple cross-currency payments inside responsive invoice cards", () => {
    const rendered = buildInvoiceEmail({
      ...invoice,
      items: [{
        ...invoice.items![0],
        priceFxNote: "Approved Manual FX for a long negotiated source-price disclosure that must wrap within Android and iPhone Gmail cards.",
      }],
      paymentDetails: [
        ...invoice.paymentDetails!,
        {
          date: "03 September 2026",
          method: "bank_transfer",
          amount: 1_100,
          currency: "EUR",
          convertedAmountInInvoiceCurrency: 49_500,
          settledAmount: 49_500,
          invoiceCurrency: "TRY",
          conversionRateToInvoice: "45",
          fxRateSource: "manual" as const,
          fxRateNote: "Second long Manual FX audit note remains fully visible and never uses an ellipsis or horizontal clipping.",
        },
      ],
    }, "en").body;
    expect(rendered.match(/class="info-box finance-info-box"/g)).toHaveLength(2);
    expect(rendered).toContain('class="info-box finance-info-box" style="display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;overflow:visible;"');
    expect(rendered).toContain('class="info-box finance-info-box" style="display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;margin-top:20px;overflow:visible;"');
    expect(rendered).toContain("display:table;width:100%;max-width:100%;min-width:0;box-sizing:border-box;table-layout:fixed");
    expect(rendered).toContain('width="100%" valign="top" dir="ltr" style="width:100%;max-width:100%;min-width:0;box-sizing:border-box;');
    expect(rendered).toContain('display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;white-space:normal;overflow-wrap:anywhere;');
    expect(rendered).toContain('padding:10px 18px 2px;color:#6b5fa0');
    expect(rendered).toContain("Negotiated source price");
    expect(rendered).toContain("USD 3,500.00");
    expect(rendered).toContain("Second long Manual FX audit note remains fully visible and never uses an ellipsis or horizontal clipping.");
    expect(rendered.match(/Amount received/g)).toHaveLength(2);
    expect(rendered).not.toContain("text-overflow:ellipsis");
    expect(rendered).not.toContain('white-space:nowrap;direction:ltr;unicode-bidi:embed;">TRY');
  });
});
