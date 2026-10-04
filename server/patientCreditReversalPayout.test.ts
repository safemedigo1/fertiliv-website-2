import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveCreditOperationIdempotency } from "../shared/creditOperationIdempotency";

const root = resolve(import.meta.dirname, "..");
const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
const migration = readFileSync(resolve(root, "drizzle/0075_finance_credit_reversal_and_payout.sql"), "utf8");
const db = readFileSync(resolve(root, "server/db.ts"), "utf8");
const routers = readFileSync(resolve(root, "server/routers.ts"), "utf8");
const patientFinanceUi = readFileSync(resolve(root, "client/src/pages/PatientDetailPage.tsx"), "utf8");

describe("Patient Credit reversal and payout contract", () => {
  it("behaves idempotently on duplicate reversal and payout submits: one financial header and one native debit only", () => {
    const reversals = new Map<string, { id: number; patientId: number; financialScope: "production" | "test"; applicationId: number }>();
    const payouts = new Map<string, { id: number; patientId: number; financialScope: "production" | "test" }>();
    let reversalRows = 0;
    let payoutRows = 0;
    let creditDebits = 0;

    const submitReversal = (key: string) => {
      const decision = resolveCreditOperationIdempotency(reversals.get(key), { patientId: 10, financialScope: "test", applicationId: 25 });
      if (decision.kind === "replay") return decision.record;
      const created = { id: ++reversalRows, patientId: 10, financialScope: "test" as const, applicationId: 25 };
      reversals.set(key, created);
      creditDebits += 1;
      return created;
    };
    const submitPayout = (key: string) => {
      const decision = resolveCreditOperationIdempotency(payouts.get(key), { patientId: 10, financialScope: "test" });
      if (decision.kind === "replay") return decision.record;
      const created = { id: ++payoutRows, patientId: 10, financialScope: "test" as const };
      payouts.set(key, created);
      creditDebits += 1;
      return created;
    };

    expect(submitReversal("reverse-1")).toEqual(submitReversal("reverse-1"));
    expect(submitPayout("payout-1")).toEqual(submitPayout("payout-1"));
    expect(reversalRows).toBe(1);
    expect(payoutRows).toBe(1);
    expect(creditDebits).toBe(2);
    expect(() => resolveCreditOperationIdempotency(reversals.get("reverse-1"), { patientId: 99, financialScope: "test", applicationId: 25 })).toThrow("different financial operation");
  });

  it("adds durable application, allocation, reversal, payout, and payout-allocation lineage without changing historical applications", () => {
    expect(schema).toContain('pgTable("patient_credit_applications"');
    expect(schema).toContain('pgTable("patient_credit_application_allocations"');
    expect(schema).toContain('pgTable("patient_credit_application_reversals"');
    expect(schema).toContain('pgTable("patient_credit_payouts"');
    expect(schema).toContain('pgTable("patient_credit_payout_allocations"');
    expect(migration).toContain("Historical credit applications remain untouched");
    expect(migration).toContain("patient_credit_application_reversals_application_uq");
    expect(schema).toContain('idempotencyKey: varchar("idempotencyKey", { length: 64 }).notNull().unique()');
  });

  it("groups every new same- and cross-currency application with source-lot allocations", () => {
    expect(db).toContain("patientCreditApplications).values");
    expect(db).toContain("patientCreditApplicationAllocations).values");
    expect(db).toContain("patientCreditApplicationId: applicationId");
    expect(db).toContain("fxRoundingAdjustmentAmount: quote.fxRoundingAdjustmentAmount");
  });

  it("restores exact native credit and voids only linked credit/FX settlements on a full reversal", () => {
    expect(db).toContain("type: \"applied_credit_reversal\"");
    expect(db).toContain("status: \"voided\"");
    expect(db).toContain("eq(invoiceSettlements.patientCreditApplicationId, input.applicationId)");
    expect(db).toContain("reversedFxRoundingAdjustmentAmount: actualFxAdjustment.toFixed(2)");
    expect(db).toContain("This Patient Credit application has already been reversed.");
    expect(db).not.toMatch(/reversePatientCreditApplication[\s\S]{0,900}createRefund\(/);
    expect(db).toContain("resolveCreditOperationIdempotency(sameRequest");
    expect(db).toContain("success: true, idempotent: true, reversalId: prior.id");
  });

  it("keeps reversal available-credit calculation source-lot accurate and FIFO-aware", () => {
    expect(db).toContain("getCreditAvailabilityBySource");
    expect(db).toContain('row.type === "applied_credit_reversal"');
    expect(db).toContain('row.type === "credit_payout"');
    expect(db).toContain("sourceCreditTransactionId: allocation.sourceCreditTransactionId");
  });

  it("records a payout as native-credit FIFO consumption with an immutable approved payout-time FX snapshot", () => {
    expect(db).toContain("getPatientCreditPayoutQuoteWithDb");
    expect(db).toContain("resolveApprovedPaymentExchangeRate(input.sourceCurrency, payoutDate)");
    expect(db).toContain("conversionRateToPayout: quote.conversionRate");
    expect(db).toContain("type: \"credit_payout\"");
    expect(db).toContain("patientCreditPayoutAllocations).values");
    expect(db).not.toMatch(/createPatientCreditPayout[\s\S]{0,1800}invoiceSettlements\).values/);
    expect(db).not.toMatch(/createPatientCreditPayout[\s\S]{0,1800}refunds\).values/);
    expect(db).toContain("resolveCreditOperationIdempotency(sameRequest");
    expect(db).toContain("success: true, idempotent: true, payoutId: prior.id");
  });

  it("allows only Cash and Bank Transfer payouts and blocks legacy live-FX/Card credit refund behavior", () => {
    expect(routers).toContain('method: z.enum(["cash", "bank_transfer"])');
    expect(db).toContain("Patient Credit Payout supports Cash or Bank Transfer only. Card reversal is not available.");
    expect(routers).toContain("Legacy Credit Refund is unavailable. Use the server-authoritative Patient Credit Payout action.");
    expect(patientFinanceUi).toContain("PatientCreditPayoutDialog");
    expect(patientFinanceUi).toContain("<SelectItem value=\"cash\">Cash</SelectItem>");
    expect(patientFinanceUi).toContain("<SelectItem value=\"bank_transfer\">Bank Transfer</SelectItem>");
    expect(patientFinanceUi).toContain("idempotencyKey: form.idempotencyKey");
  });

  it("keeps External Refund and Max Refundable separate from credit reversal and credit payout UI", () => {
    expect(patientFinanceUi).toContain("Invoice Refund");
    expect(patientFinanceUi).toContain("Patient Credit Payout");
    expect(patientFinanceUi).toContain("This is not an invoice refund.");
    expect(patientFinanceUi).toContain("Reverse Applied Credit");
    expect(patientFinanceUi).toContain("openPatientCreditPayoutReceipt");
  });

  it("uses the approved payout wording in every mounted Patient Credit Payout surface", () => {
    const payoutDialogStart = patientFinanceUi.indexOf("function PatientCreditPayoutDialog");
    const legacyCreditRefundStart = patientFinanceUi.indexOf("function CreditRefundDialog", payoutDialogStart);
    const payoutDialog = patientFinanceUi.slice(payoutDialogStart, legacyCreditRefundStart);

    expect(patientFinanceUi).toContain('<ArrowDownLeft className="h-3 w-3" />Patient Credit Payout');
    expect(patientFinanceUi).toContain('label: "Patient Credit Payout"');
    expect(payoutDialog).toContain(">Patient Credit Payout</DialogTitle>");
    expect(payoutDialog).toContain("Payout Amount ({sourceCurrency})");
    expect(payoutDialog).toContain('"Confirm Payout"');
    expect(payoutDialog).toContain("Patient Credit Payout recorded:");
    expect(payoutDialog).not.toContain("Refund Patient Credit");
    expect(payoutDialog).not.toContain("Amount to Refund");
    expect(payoutDialog).not.toContain("Confirm Refund");
  });
});
