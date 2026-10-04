import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { deriveInvoiceDualBalancePresentation } from "../shared/invoiceDualBalance";
import { financeCommunicationLocaleResources } from "../shared/financeCommunicationLocales";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const patientPageSource = read("client/src/pages/PatientDetailPage.tsx");
const dbSource = read("server/db.ts");
const routerSource = read("server/routers.ts");
const pdfServiceSource = read("server/pdfService.ts");
const pdfRoutesSource = read("server/pdfRoutes.ts");
const emailSource = read("server/emailService.ts");
const schemaSource = read("drizzle/schema.ts");
const exchangeRateSource = read("server/exchangeRateService.ts");

describe("Finance payment handoff, AUD lifecycle, and dual-balance presentation", () => {
  it("saves Edit Invoice first, reloads the persisted invoice, then opens the existing RecordPaymentModal only on explicit intent", () => {
    expect(patientPageSource).toContain('postSaveIntentRef = useRef<"none" | "record_payment">("none")');
    expect(patientPageSource).toContain('await onSuccess({ openSendAfterSave, recordPaymentAfterSave });');
    expect(patientPageSource).toContain('const refreshed = await refetch()');
    expect(patientPageSource).toContain('setPaymentInvoice(persistedInvoice)');
    expect(patientPageSource).toContain('<RecordPaymentModal');
    expect(patientPageSource).toContain('Choose either Open Send Invoice after save or Save & Record Payment.');
    expect(patientPageSource).toContain('Payment entry always happens separately in RecordPaymentModal.');
  });

  it("derives both balances from total, immutable tax, and canonical net settlement with Finance rounding", () => {
    const inv64 = deriveInvoiceDualBalancePresentation({
      totalAmount: "173980.00",
      taxAmount: "13980.00",
      netSettled: "119250.00",
      taxModelVersion: "line_tax_v1",
    });
    expect(inv64.shouldShowRemainingServiceAmountBeforeTax).toBe(true);
    expect(inv64.remainingServiceAmountBeforeTax).toBe("40750.00");
    expect(inv64.totalBalanceDueIncludingTax).toBe("54730.00");

    const taxOnlyRemainder = deriveInvoiceDualBalancePresentation({
      totalAmount: "105.00",
      taxAmount: "5.00",
      netSettled: "104.00",
      taxModelVersion: "line_tax_v1",
    });
    expect(taxOnlyRemainder.remainingServiceAmountBeforeTax).toBe("0.00");
    expect(taxOnlyRemainder.totalBalanceDueIncludingTax).toBe("1.00");

    expect(deriveInvoiceDualBalancePresentation({
      totalAmount: "100.00", taxAmount: "0.00", netSettled: "25.00", taxModelVersion: null,
    }).shouldShowRemainingServiceAmountBeforeTax).toBe(false);
  });

  it("uses the shared dual-balance helper in internal summary, Invoice HTML, direct PDF, and attached PDF while excluding Official Receipt", () => {
    expect(patientPageSource).toContain('deriveInvoiceDualBalancePresentation({');
    expect(patientPageSource).toContain('Remaining Service Amount (Before Tax)');
    expect(patientPageSource).toContain('Total Balance Due (Including Tax)');
    expect(routerSource).toContain('netSettled: financialSummary.netSettled');
    expect(routerSource).toContain('paidAmount: Number(financialSummary.netSettled)');
    expect(pdfServiceSource).toContain('deriveInvoiceDualBalancePresentation({');
    expect(pdfServiceSource).toContain('TOTAL BALANCE DUE\\n(INCLUDING TAX)');
    expect(pdfRoutesSource).toContain('getInvoiceFinancialSummary(invoiceId)');
    expect(pdfRoutesSource).toContain('const paidNum = Number(financialSummary.netSettled)');
    expect(emailSource).toContain('remainingServiceAmountBeforeTax');
    expect(emailSource).toContain('totalBalanceDueIncludingTax');
    expect(emailSource).not.toContain('buildReceiptEmail(data: ReceiptEmailData) {\n  const dualBalanceDisclosure');
  });

  it("provides the two system labels through every static Finance locale rather than runtime translation", () => {
    expect(Object.keys(financeCommunicationLocaleResources)).toHaveLength(29);
    for (const copy of Object.values(financeCommunicationLocaleResources)) {
      expect(copy.remainingServiceAmountBeforeTax.trim()).not.toBe("");
      expect(copy.totalBalanceDueIncludingTax.trim()).not.toBe("");
      expect(copy.remainingServiceAmountInfo.trim()).not.toBe("");
    }
  });

  it("extends AUD through the generic payment, credit, payout, and FX path but not invoice/service pricing or External Refund", () => {
    const paymentsBlock = schemaSource.slice(schemaSource.indexOf('export const payments'), schemaSource.indexOf('export const invoiceSettlements'));
    const creditBlock = schemaSource.slice(schemaSource.indexOf('export const creditTransactions'), schemaSource.indexOf('export const refunds'));
    const refundsBlock = schemaSource.slice(schemaSource.indexOf('export const refunds'), schemaSource.indexOf('export const patientCreditPayouts'));
    expect(paymentsBlock).toContain('pg_currency_2("currency")');
    expect(schemaSource).toContain('pgEnum("pg_currency_2", ["USD", "EUR", "GBP", "TRY", "SAR", "AED", "AUD"])');
    expect(creditBlock).toContain('pg_currency_2("currency")');
    expect(refundsBlock).not.toContain('"AUD"');
    expect(dbSource).toContain('type CreditCurrency = "USD" | "EUR" | "GBP" | "TRY" | "SAR" | "AED" | "AUD"');
    expect(dbSource).toContain('type SettlementPaymentInput');
    expect(exchangeRateSource).toContain('"AUD"');
    expect(patientPageSource).toContain('["TRY", "USD", "EUR", "GBP", "SAR", "AED", "AUD"].map(code => <SelectItem');
    expect(patientPageSource).toContain('Payout Currency');
    expect(routerSource).toContain('previewPayment: staffOrAdminProcedure');
    expect(routerSource).toContain('createPayment: staffOrAdminProcedure');
  });
});
