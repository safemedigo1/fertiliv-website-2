import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { computePaymentFxSnapshots } from "../shared/paymentFx";
import { computePaymentSettlement } from "../shared/invoicePricing";
import { computeNativeOverpaymentCredit, resolveBankDeduction } from "./db";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Pre-Phase-3 Payment Recording Integrity", () => {
  it("MODE-B TRY payment settles at its full invoice-currency face value", () => {
    const fx = computePaymentFxSnapshots({
      amount: "51000",
      paymentCurrency: "TRY",
      invoiceCurrency: "USD",
      paymentToTryRate: "1",
      invoiceToTryRate: "42.5",
    });
    expect(fx.amountInInvoiceCurrency).toBe("1200.00");
    const settlement = computePaymentSettlement({
      amount: "51000",
      method: "credit_card",
      pricingMode: "agreed",
      adjustmentRateSnapshot: null,
      amountInInvoiceCurrency: fx.amountInInvoiceCurrency,
    });
    expect(settlement.settledAmount).toBe("1200.00");
  });

  it("does not apply the 23% non-cash reduction in MODE-B", () => {
    expect(computePaymentSettlement({
      amount: "1200",
      method: "bank_transfer",
      pricingMode: "agreed",
      adjustmentRateSnapshot: null,
      amountInInvoiceCurrency: "1200.00",
    }).settledAmount).toBe("1200.00");
  });

  it("adds nullable legacy-safe receivedAt and fxEffectiveAt fields", () => {
    const schema = read("drizzle/schema.ts");
    expect(schema).toContain('receivedAt: timestamp("receivedAt"');
    expect(schema).toContain('fxEffectiveAt: timestamp("fxEffectiveAt"');
  });

  it("requires selected-date approved FX and never falls back to legacy system settings for payment snapshots", () => {
    const db = read("server/db.ts");
    expect(db).toContain("resolveApprovedPaymentExchangeRate(currency: string, receivedAt: Date)");
    expect(db).toContain("No approved historical exchange rate is available");
    const resolver = db.slice(db.indexOf("async function resolveApprovedPaymentExchangeRate"), db.indexOf("export async function setSystemSetting"));
    expect(resolver).not.toContain("getSystemSettings()");
  });

  it("creates immutable timing and FX snapshots from the server quote", () => {
    const db = read("server/db.ts");
    expect(db).toContain("receivedAt,");
    expect(db).toContain("fxEffectiveAt: invoiceRate.fxEffectiveAt");
    expect(db).toContain("export async function quotePayment");
  });

  it("server records a real receipt and native-currency Patient Credit for a genuine overpayment", () => {
    const db = read("server/db.ts");
    expect(db).toContain("recordPaymentWithSettlement");
    expect(db).toContain("const creditAmount");
    expect(db).toContain("tx.insert(creditTransactions)");
    expect(db).toContain("originPaymentId: paymentId");
    expect(db).toContain("SELECT id FROM invoices WHERE id =");
  });

  it("provides a separately controlled legacy-to-agreed correction with audit logging", () => {
    const db = read("server/db.ts");
    const routers = read("server/routers.ts");
    expect(db).toContain("correctLegacyInvoicePricingToAgreed");
    expect(db).toContain("correct_legacy_invoice_pricing_to_agreed");
    expect(routers).toContain("financeCorrectionProcedure");
    expect(routers).toContain("confirmed: z.literal(true)");
  });

  it("removes client-side automatic payment-plus-credit splitting and consumes server preview results", () => {
    const client = read("client/src/pages/PatientDetailPage.tsx");
    const modal = client.slice(client.indexOf("function RecordPaymentModal"), client.indexOf("function EditInvoiceModal"));
    expect(modal).toContain("trpc.finance.previewPayment.useQuery");
    expect(modal).toContain("receivedAtValue");
    expect(modal).not.toContain("Overpayment saved as credit balance");
    expect(modal).not.toContain("finance.addCredit");
  });

  it("allows a post-creation genuine overpayment through the same shared atomic service instead of the obsolete client rejection", () => {
    const db = read("server/db.ts");
    const client = read("client/src/pages/PatientDetailPage.tsx");
    const modal = client.slice(client.indexOf("function RecordPaymentModal"), client.indexOf("function EditInvoiceModal"));
    const createPayment = db.slice(db.indexOf("export async function createPayment"), db.indexOf("/**\n * Controlled one-way historical correction", db.indexOf("export async function createPayment")));
    expect(createPayment).toContain("recordPaymentWithSettlement");
    expect(modal).not.toContain("Patient Credit / overpayment handling is not enabled yet");
    expect(modal).not.toContain("Patient Credit is not enabled yet, so it cannot be recorded");
    expect(modal).not.toContain("!!paymentPreview?.exceedsRequired");
    expect(modal).toContain("The genuine surplus will be recorded as Patient Credit");
  });

  it("keeps one physical receipt while settling only the remaining amount and creating native-currency credit", () => {
    const db = read("server/db.ts");
    const helper = db.slice(db.indexOf("async function recordPaymentWithSettlement"), db.indexOf("export async function createPayment"));
    expect(helper).toContain("const allocation = Decimal.min(quotedSettlement, remaining)");
    expect(helper).toContain("tx.insert(payments)");
    expect(helper).toContain("tx.insert(invoiceSettlements)");
    expect(helper).toContain("currency: input.currency");
    expect(helper).toContain("originPaymentId: paymentId");
  });

  it("Q2: initial-payment preview exposes gross converted value, sequential capped allocation, and genuine native expected credits using the same helper as recording", () => {
    const db = read("server/db.ts");
    const preview = db.slice(db.indexOf("export async function quoteInitialPayments"), db.indexOf("type SettlementPaymentInput"));
    const recording = db.slice(db.indexOf("async function recordPaymentWithSettlement"), db.indexOf("export async function createPayment"));
    const client = read("client/src/pages/PatientDetailPage.tsx");
    expect(preview).toContain("totalReceivedInInvoiceCurrency");
    expect(preview).toContain("expectedNativePatientCredits");
    expect(preview).toContain("const allocation = Decimal.min(new Decimal(quote.settledAmount), remaining)");
    expect(preview).toContain("computeNativeOverpaymentCredit");
    expect(recording).toContain("computeNativeOverpaymentCredit");
    expect(client).toContain("Gross Received (converted)");
    expect(client).toContain("Applied to Invoice");
    expect(client).toContain("Expected Patient Credit");
    expect(client).not.toContain("Overpayment saved as credit balance");
  });

  it("Q2: native expected credit uses the entered net receipt and preserves v2 versus legacy multiplier rules", () => {
    expect(computeNativeOverpaymentCredit({
      enteredAmount: "110", currentRemaining: "100", conversionRateToInvoice: "1",
      method: "bank_transfer", pricingMode: "discount", adjustmentRateSnapshot: "23", settlementModelVersion: "method_neutral_v2",
    }).toFixed(2)).toBe("10.00");
    expect(computeNativeOverpaymentCredit({
      enteredAmount: "62", currentRemaining: "100", conversionRateToInvoice: "2",
      method: "credit_card", pricingMode: "discount", adjustmentRateSnapshot: "23", settlementModelVersion: null,
    }).toFixed(2)).toBe("0.50");
    expect(computeNativeOverpaymentCredit({
      enteredAmount: "100", currentRemaining: "100", conversionRateToInvoice: "1",
      method: "cash", pricingMode: "discount", adjustmentRateSnapshot: null, settlementModelVersion: "method_neutral_v2",
    }).toFixed(2)).toBe("0.00");

    const bankNet = resolveBankDeduction({ amount: "100", method: "bank_transfer", bankDeduction: { amount: "10" } }).netAmount;
    expect(computeNativeOverpaymentCredit({
      enteredAmount: bankNet.toFixed(2), currentRemaining: "80", conversionRateToInvoice: "1",
      method: "bank_transfer", pricingMode: "discount", adjustmentRateSnapshot: null, settlementModelVersion: "method_neutral_v2",
    }).toFixed(2)).toBe("10.00");
  });
});
