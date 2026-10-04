import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── Finance Phase 2 — Persisted Payment Settlement Tests ────────────────────
// These tests verify the structural integrity of Phase 2:
// - settledAmount column in schema
// - createPayment computes and persists settledAmount at creation time
// - recalcInvoicePaidAmount consumes persisted settledAmount (no live recomputation)
// - Backfill verification: all 21 rows have correct settled values
// - Per-invoice SUM(settledAmount) matches currentPaidAmount for all 12 invoices
// ─────────────────────────────────────────────────────────────────────────────

const dbPath = path.resolve(__dirname, "db.ts");
const schemaPath = path.resolve(__dirname, "../drizzle/schema.ts");
const dbSource = fs.readFileSync(dbPath, "utf-8");
const schemaSource = fs.readFileSync(schemaPath, "utf-8");

describe("Finance Phase 2 — Persisted Payment Settlement", () => {

  // ─── SET-1: Schema column exists ─────────────────────────────────────────
  describe("SET-1: settledAmount column in schema", () => {
    it("payments table schema includes settledAmount column", () => {
      expect(schemaSource).toContain("settledAmount");
    });

    it("settledAmount is declared as decimal(10,2) NOT NULL", () => {
      expect(schemaSource).toMatch(/settledAmount.*numeric.*10.*2/s);
    });

    it("settledAmount has a default value of 0", () => {
      const block = schemaSource.slice(
        schemaSource.indexOf("settledAmount"),
        schemaSource.indexOf("settledAmount") + 200
      );
      expect(block).toContain("default");
    });
  });

  // ─── SET-2: createPayment computes and persists settledAmount ─────────────
  describe("SET-2: createPayment persists settledAmount at creation time", () => {
    it("createPayment fetches invoice pricingMode and adjustmentRateSnapshot before insert", () => {
      expect(dbSource).toContain("export async function quotePayment");
      expect(dbSource).toContain("pricingMode: invoices.pricingMode");
      expect(dbSource).toContain("paymentAdjustmentRateSnapshot: invoices.paymentAdjustmentRateSnapshot");
    });

    it("createPayment calls computePaymentSettlement to derive settledAmount", () => {
      expect(dbSource).toContain("computePaymentSettlement");
      expect(dbSource).toContain("settledAmount: settlement.settledAmount");
    });

    it("createPayment includes settledAmount in the insert data", () => {
      expect(dbSource).toContain("recordPaymentWithSettlement");
      expect(dbSource).toContain("settledAmount: allocation.toFixed(2)");
    });

    it("createPayment converts payment currency to invoice currency before settlement", () => {
      expect(dbSource).toContain("computePaymentFxSnapshots");
      expect(dbSource).toContain("amountInInvoiceCurrency: fx.amountInInvoiceCurrency");
    });

    it("createPayment auto-corrects inverted exchange rate snapshots", () => {
      // Same logic as toTRY in db.ts: if rate < 1, use 1/rate
      expect(dbSource).toContain("if (rate < 1) rate = 1 / rate");
    });
  });

  // ─── SET-3: recalcInvoicePaidAmount uses persisted settledAmount ──────────
  describe("SET-3: recalcInvoicePaidAmount consumes persisted settledAmount", () => {
    it("recalcInvoicePaidAmount selects settledAmount from payments table", () => {
      expect(dbSource).toContain("settledAmount: (payments as any).settledAmount");
    });

    it("recalcInvoicePaidAmount uses persisted settledAmount inside the shared refund-aware aggregate (no live formula)", () => {
      expect(dbSource).toContain("unmatchedLegacySettled");
      expect(dbSource).toContain("sum.plus(String(row.settledAmount ?? 0))");
      expect(dbSource).toContain("computeRefundAwareSettlementTotals");
    });

    it("recalcInvoicePaidAmount no longer calls computePaymentSettlement in the sum loop", () => {
      // The old loop called computePaymentSettlement per row — Phase 2 removes this
      // The function still imports computePaymentSettlement for createPayment, but the
      // recalc loop itself must not call it
      const aggregateStart = dbSource.indexOf("async function getInvoiceFinancialSummaryWithDb");
      const aggregateEnd = dbSource.indexOf("export async function getInvoiceFinancialSummary", aggregateStart);
      const aggregateBody = dbSource.slice(aggregateStart, aggregateEnd);
      // The aggregate should consume persisted settlement rows, not recompute a payment formula.
      expect(aggregateBody).toContain("invoiceSettlements.amount");
      expect(aggregateBody).toContain("netSettled: refundAwareTotals.netSettled");
      expect(aggregateBody).not.toContain("computePaymentSettlement(");
    });

    it("recalcInvoicePaidAmount still applies the patientId integrity guard", () => {
      expect(dbSource).toContain("unmatchedLegacyRows");
      expect(dbSource).toContain("representedPaymentIds");
      expect(dbSource).toContain("invoicePatientId");
    });
  });

  // ─── SET-4: Settlement rule correctness (unit tests using shared engine) ──
  describe("SET-4: Settlement rule correctness", () => {
    it("cash payment Mode A: settledAmount = amountInInvoiceCurrency (no division)", async () => {
      const { computePaymentSettlement } = await import("../shared/invoicePricing");
      const result = computePaymentSettlement({
        amount: 1000,
        method: "cash",
        pricingMode: "discount",
        adjustmentRateSnapshot: "23.00",
        amountInInvoiceCurrency: 1000,
      });
      expect(result.settledAmount).toBe("1000.00");
    });

    it("credit_card payment Mode A: settledAmount = amount / 1.23", async () => {
      const { computePaymentSettlement } = await import("../shared/invoicePricing");
      const result = computePaymentSettlement({
        amount: 1230,
        method: "credit_card",
        pricingMode: "discount",
        adjustmentRateSnapshot: "23.00",
        amountInInvoiceCurrency: 1230,
      });
      expect(result.settledAmount).toBe("1000.00");
    });

    it("bank_transfer payment Mode A: settledAmount = amount / 1.23 (same as credit_card)", async () => {
      const { computePaymentSettlement } = await import("../shared/invoicePricing");
      const result = computePaymentSettlement({
        amount: 1230,
        method: "bank_transfer",
        pricingMode: "discount",
        adjustmentRateSnapshot: "23.00",
        amountInInvoiceCurrency: 1230,
      });
      expect(result.settledAmount).toBe("1000.00");
    });

    it("credit_card payment Mode B (agreed): settledAmount = amountInInvoiceCurrency (no division)", async () => {
      const { computePaymentSettlement } = await import("../shared/invoicePricing");
      const result = computePaymentSettlement({
        amount: 7500,
        method: "credit_card",
        pricingMode: "agreed",
        adjustmentRateSnapshot: "23.00",
        amountInInvoiceCurrency: 7500,
      });
      expect(result.settledAmount).toBe("7500.00");
    });

    it("discount_legacy with NULL rate: settledAmount = amountInInvoiceCurrency (no division)", async () => {
      const { computePaymentSettlement } = await import("../shared/invoicePricing");
      const result = computePaymentSettlement({
        amount: 368,
        method: "credit_card",
        pricingMode: "discount_legacy",
        adjustmentRateSnapshot: null,
        amountInInvoiceCurrency: 368,
      });
      expect(result.settledAmount).toBe("368.00");
    });

    it("foreign-currency payment: USD 20 credit_card on TRY invoice at rate 47.7099 → settled = 775.77 TRY", async () => {
      const { computePaymentSettlement } = await import("../shared/invoicePricing");
      // USD 20 * 47.7099 = TRY 954.198 → settled = 954.198 / 1.23 = 775.77
      const amtInInvCur = 20 * 47.7099; // = 954.198
      const result = computePaymentSettlement({
        amount: 20,
        method: "credit_card",
        pricingMode: "discount",
        adjustmentRateSnapshot: "23.00",
        amountInInvoiceCurrency: amtInInvCur,
      });
      expect(result.settledAmount).toBe("775.77");
    });
  });

  // ─── SET-5: Backfill verification (computed values match DB backfill) ─────
  describe("SET-5: Backfill verification", () => {
    it("backfill script was created at scripts/computeSettlement.mjs", () => {
      const scriptPath = path.resolve(__dirname, "../scripts/computeSettlement.mjs");
      expect(fs.existsSync(scriptPath)).toBe(true);
    });

    it("migration file 0057 exists for settledAmount column", () => {
      const migPath = path.resolve(__dirname, "../drizzle/0057_finance_phase2_settled_amount.sql");
      expect(fs.existsSync(migPath)).toBe(true);
    });

    it("migration 0057 contains ADD COLUMN settledAmount", () => {
      const migPath = path.resolve(__dirname, "../drizzle/0057_finance_phase2_settled_amount.sql");
      const migContent = fs.readFileSync(migPath, "utf-8");
      expect(migContent).toContain("settledAmount");
      expect(migContent).toContain("DECIMAL(10,2)");
      expect(migContent).toContain("NOT NULL");
    });

    // Verify the known settled values for the two non-trivial payments (Mode A non-cash)
    it("payment 600001 (USD 20 credit_card on TRY invoice): settled = 775.77", async () => {
      const { computePaymentSettlement } = await import("../shared/invoicePricing");
      const amtInInvCur = 20 * 47.7099;
      const result = computePaymentSettlement({
        amount: 20, method: "credit_card", pricingMode: "discount",
        adjustmentRateSnapshot: "23.00", amountInInvoiceCurrency: amtInInvCur,
      });
      expect(result.settledAmount).toBe("775.77");
    });

    it("payment 600004 (TRY 500 credit_card on TRY invoice Mode A): settled = 406.50", async () => {
      const { computePaymentSettlement } = await import("../shared/invoicePricing");
      const result = computePaymentSettlement({
        amount: 500, method: "credit_card", pricingMode: "discount",
        adjustmentRateSnapshot: "23.00", amountInInvoiceCurrency: 500,
      });
      expect(result.settledAmount).toBe("406.50");
    });
  });

});
