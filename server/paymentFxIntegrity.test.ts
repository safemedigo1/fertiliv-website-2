import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { computePaymentFxSnapshots } from "../shared/paymentFx";
import { computePaymentSettlement } from "../shared/invoicePricing";

const dbPath = path.resolve(__dirname, "db.ts");
const schemaPath = path.resolve(__dirname, "../drizzle/schema.ts");
const routerPath = path.resolve(__dirname, "routers.ts");
const patientPagePath = path.resolve(__dirname, "../client/src/pages/PatientDetailPage.tsx");
const migrationPath = path.resolve(__dirname, "../drizzle/0059_finance_payment_fx_integrity.sql");
const manualFxMigrationPath = path.resolve(__dirname, "../drizzle/0084_finance_manual_payment_fx_metadata.sql");
const dbSource = fs.readFileSync(dbPath, "utf-8");
const schemaSource = fs.readFileSync(schemaPath, "utf-8");
const routerSource = fs.readFileSync(routerPath, "utf-8");
const patientPageSource = fs.readFileSync(patientPagePath, "utf-8");

describe("Finance — Payment FX Integrity & Pre-Phase-3 Guards", () => {
  describe("FX-1: Immutable direct FX snapshots", () => {
    it("preserves exchangeRateAtPayment as payment-currency → TRY and adds precise new fields", () => {
      expect(schemaSource).toMatch(/exchangeRateAtPayment.*precision:\s*12,\s*scale:\s*4/s);
      expect(schemaSource).toMatch(/conversionRateToInvoice.*precision:\s*20,\s*scale:\s*12/s);
      expect(schemaSource).toMatch(/amountInInvoiceCurrency.*precision:\s*18,\s*scale:\s*2/s);
    });

    it("records a nullable-backfill-NOT-NULL migration sequence", () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const migration = fs.readFileSync(migrationPath, "utf-8");
      expect(migration).toContain("ADD COLUMN conversionRateToInvoice DECIMAL(20,12) NULL");
      expect(migration).toContain("ADD COLUMN amountInInvoiceCurrency DECIMAL(18,2) NULL");
      expect(migration).toContain("UPDATE payments p");
      expect(migration).toContain("MODIFY COLUMN conversionRateToInvoice DECIMAL(20,12) NOT NULL");
      expect(migration).toContain("MODIFY COLUMN amountInInvoiceCurrency DECIMAL(18,2) NOT NULL");
    });
  });

  describe("FX-2: Direct conversion calculations", () => {
    it("same currency: USD payment → USD invoice stores a direct rate of 1", () => {
      expect(computePaymentFxSnapshots({ amount: "2500", paymentCurrency: "USD", invoiceCurrency: "USD", paymentToTryRate: "47.4", invoiceToTryRate: "47.4" })).toEqual({
        exchangeRateAtPayment: "47.4000",
        conversionRateToInvoice: "1.000000000000",
        amountInInvoiceCurrency: "2500.00",
      });
    });

    it("TRY payment → USD invoice freezes the inverse direct rate", () => {
      expect(computePaymentFxSnapshots({ amount: "47400", paymentCurrency: "TRY", invoiceCurrency: "USD", paymentToTryRate: "1", invoiceToTryRate: "47.4" })).toEqual({
        exchangeRateAtPayment: "1.0000",
        conversionRateToInvoice: "0.021097046414",
        amountInInvoiceCurrency: "1000.00",
      });
    });

    it("USD payment → TRY invoice freezes the direct TRY rate", () => {
      expect(computePaymentFxSnapshots({ amount: "20", paymentCurrency: "USD", invoiceCurrency: "TRY", paymentToTryRate: "47.4", invoiceToTryRate: "1" })).toEqual({
        exchangeRateAtPayment: "47.4000",
        conversionRateToInvoice: "47.400000000000",
        amountInInvoiceCurrency: "948.00",
      });
    });

    it("EUR payment → USD invoice derives a direct cross-foreign rate from approved snapshots", () => {
      expect(computePaymentFxSnapshots({ amount: "100", paymentCurrency: "EUR", invoiceCurrency: "USD", paymentToTryRate: "52.14", invoiceToTryRate: "47.4" })).toEqual({
        exchangeRateAtPayment: "52.1400",
        conversionRateToInvoice: "1.100000000000",
        amountInInvoiceCurrency: "110.00",
      });
    });
  });

  describe("FX-3: New-payment settlement relationship", () => {
    it("uses the stored pre-adjustment invoice amount for Mode A card settlement", () => {
      const fx = computePaymentFxSnapshots({ amount: "20", paymentCurrency: "USD", invoiceCurrency: "TRY", paymentToTryRate: "47.4", invoiceToTryRate: "1" });
      const settlement = computePaymentSettlement({ amount: "20", method: "credit_card", pricingMode: "discount", adjustmentRateSnapshot: "23.00", amountInInvoiceCurrency: fx.amountInInvoiceCurrency });
      expect(settlement.amountInInvoiceCurrency).toBe("948.00");
      expect(settlement.settledAmount).toBe("770.73");
    });

    it("keeps Mode B settlement equal to the stored pre-adjustment invoice amount", () => {
      const fx = computePaymentFxSnapshots({ amount: "1200", paymentCurrency: "USD", invoiceCurrency: "USD", paymentToTryRate: "47.4", invoiceToTryRate: "47.4" });
      const settlement = computePaymentSettlement({ amount: "1200", method: "credit_card", pricingMode: "agreed", adjustmentRateSnapshot: null, amountInInvoiceCurrency: fx.amountInInvoiceCurrency });
      expect(settlement.settledAmount).toBe("1200.00");
    });
  });

  describe("FX-4: Server-authoritative persistence", () => {
    const recordStart = dbSource.indexOf("async function recordPaymentWithSettlement");
    const recordEnd = dbSource.indexOf("export async function createPayment", recordStart);
    const recordBody = dbSource.slice(recordStart, recordEnd);

    it("resolves payment and invoice rates through the shared resolver then writes all snapshots atomically", () => {
      expect(recordBody).toContain("resolvePaymentFxRates");
      expect(recordBody).toContain("computePaymentFxSnapshots");
      expect(recordBody).toContain("conversionRateToInvoice: fx.conversionRateToInvoice");
      expect(recordBody).toContain("amountInInvoiceCurrency: fx.amountInInvoiceCurrency");
      expect(recordBody).toContain("fxEffectiveAt: rateResolution.fxEffectiveAt");
      expect(dbSource.slice(dbSource.indexOf("export async function createPayment"), dbSource.indexOf("export async function listPaymentsByInvoice"))).toContain("db.transaction");
    });

    it("does not silently use a rate of one when a foreign approved rate is unavailable", () => {
      const strictRateStart = dbSource.indexOf("async function resolveApprovedPaymentExchangeRate");
      const strictRateEnd = dbSource.indexOf("export async function setSystemSetting", strictRateStart);
      const strictRateBody = dbSource.slice(strictRateStart, strictRateEnd);
      expect(strictRateBody).toContain("No approved historical exchange rate is available");
      expect(strictRateBody).not.toContain('?? "0") || 1');
    });

    it("keeps every alternate payment creation route on the shared server snapshot path", () => {
      expect(routerSource).toContain("createPayment resolves and freezes all approved FX snapshots server-side.");
      expect(routerSource).not.toContain("exchangeRateAtPayment: exchangeRateAtPayment");
    });
  });

  describe("FX-5: Invoice currency and total guards", () => {
    const updateStart = dbSource.indexOf("async function updateInvoiceFullWithDb");
    const updateEnd = dbSource.indexOf("// ─── Proposal Items", updateStart);
    const updateBody = dbSource.slice(updateStart, updateEnd);

    it("rejects a currency change after any payment history, including a voided row", () => {
      expect(updateBody).toContain("paymentHistoryCount");
      expect(updateBody).toContain("from(payments).where(eq(payments.invoiceId, invoiceId))");
      expect(updateBody).toContain("Invoice currency cannot be changed after financial activity has been recorded.");
    });

    it("rejects total reductions below the canonical active paidAmount before changing invoice items", () => {
      expect(updateBody).toContain("currentActivePaidAmount");
      expect(updateBody).toContain("newTotalAmount.lt(currentActivePaidAmount)");
      expect(updateBody).toContain("Invoice total cannot be reduced below the amount already settled.");
      expect(updateBody.indexOf("newTotalAmount.lt(currentActivePaidAmount)")).toBeLessThan(updateBody.indexOf("for (const item of canonicalItems)"));
    });

    it("allows the client selector only with zero payment history and explains the lock otherwise", () => {
      expect(patientPageSource).toContain("includeVoided: true");
      expect(patientPageSource).toContain("const hasPaymentHistory = (existingPayments?.length ?? 0) > 0");
      expect(patientPageSource).toContain("Invoice currency cannot be changed after payment history has been recorded, including voided payments.");
      expect(patientPageSource).toContain("if (editedInvoiceTotal < alreadyPaid - 0.001)");
    });
  });

  describe("FX-6: Payment Void compatibility", () => {
    const voidStart = dbSource.indexOf("export async function voidPayment");
    const voidEnd = dbSource.indexOf("type InvoiceFinancialSummary", voidStart);
    const voidBody = dbSource.slice(voidStart, voidEnd);

    it("changes only void metadata and never recalculates FX or settlement fields", () => {
      expect(voidBody).toContain('status: "voided"');
      expect(voidBody).toContain("voidedAt: new Date()");
      expect(voidBody).not.toContain("conversionRateToInvoice:");
      expect(voidBody).not.toContain("amountInInvoiceCurrency:");
      expect(voidBody).not.toContain("settledAmount:");
    });
  });

  describe("FX-7: Payment-scoped Manual/Historical FX", () => {
    it("adds only nullable audit metadata and explicitly avoids historical backfill", () => {
      expect(schemaSource).toContain('pgEnum("pg_fxRateSource", ["system", "manual"])');
      expect(schemaSource).toMatch(/fxRateSource:\s*pg_fxRateSource\("fxRateSource"\)/);
      expect(schemaSource).toMatch(/fxRateNote:\s*text\("fxRateNote"\)/);
      const migration = fs.readFileSync(manualFxMigrationPath, "utf-8");
      expect(migration).toContain("ADD COLUMN `fxRateSource` ENUM('system', 'manual') NULL");
      expect(migration).toContain("ADD COLUMN `fxRateNote` TEXT NULL");
      expect(migration).not.toMatch(/\bUPDATE\b|\bDELETE\b|\bINSERT\b/i);
    });

    it("keeps the existing immutable direct-snapshot math for a manual historical USD-to-TRY quote", () => {
      expect(computePaymentFxSnapshots({ amount: "100", paymentCurrency: "USD", invoiceCurrency: "TRY", paymentToTryRate: "47.5", invoiceToTryRate: "1" })).toEqual({
        exchangeRateAtPayment: "47.5000",
        conversionRateToInvoice: "47.500000000000",
        amountInInvoiceCurrency: "4750.00",
      });
    });

    it("routes Add Payment and Initial Payments through the same system-or-manual resolver and quote path", () => {
      expect(dbSource).toContain("async function resolvePaymentFxRates");
      expect(dbSource).toContain("Manual FX is only available when the payment currency differs from the invoice currency.");
      expect(dbSource).toContain("A manual FX audit note between 3 and 500 characters is required.");
      expect(dbSource).toContain("export async function quoteInitialPayments");
      expect(routerSource).toContain("previewInitialPayments");
      expect(routerSource).toContain("manualFx: z.object");
      expect(patientPageSource).toContain("ManualFxDisclosure");
      expect(patientPageSource).toContain("Adjust exchange rate");
      expect(patientPageSource).toContain("Received At");
    });

    it("keeps Manual FX payment-scoped and does not write a global exchange-rate override", () => {
      const resolverStart = dbSource.indexOf("async function resolvePaymentFxRates");
      const resolverEnd = dbSource.indexOf("async function getApprovedPaymentExchangeRate", resolverStart);
      const resolver = dbSource.slice(resolverStart, resolverEnd);
      expect(resolver).not.toContain("exchangeRates).values");
      expect(resolver).not.toContain("setSystemSetting");
      expect(resolver).toContain("fxRateSource: \"manual\"");
    });
  });
});
