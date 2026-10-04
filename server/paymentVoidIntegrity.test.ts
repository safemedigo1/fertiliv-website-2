import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

// ─── Finance — Payment Void & Transaction History Integrity ───────────────────
// Structural regression coverage for the approved soft-void model. These tests
// deliberately do not modify live finance data.

const dbPath = path.resolve(__dirname, "db.ts");
const schemaPath = path.resolve(__dirname, "../drizzle/schema.ts");
const routerPath = path.resolve(__dirname, "routers.ts");
const patientPagePath = path.resolve(__dirname, "../client/src/pages/PatientDetailPage.tsx");
const pdfRoutesPath = path.resolve(__dirname, "pdfRoutes.ts");
const migrationPath = path.resolve(__dirname, "../drizzle/0058_finance_payment_void.sql");

const dbSource = fs.readFileSync(dbPath, "utf-8");
const schemaSource = fs.readFileSync(schemaPath, "utf-8");
const routerSource = fs.readFileSync(routerPath, "utf-8");
const patientPageSource = fs.readFileSync(patientPagePath, "utf-8");
const pdfRoutesSource = fs.readFileSync(pdfRoutesPath, "utf-8");

describe("Finance — Payment Void & Transaction History Integrity", () => {
  describe("VOID-1: Soft-void schema", () => {
    it("defines status active|voided with active as the default", () => {
      expect(schemaSource).toContain('pgEnum("pg_status_15", ["active", "voided"])');
      expect(schemaSource).toMatch(/status:\s*pg_status_15\("status"\).*default\("active"\)/s);
    });

    it("preserves the required void metadata fields", () => {
      expect(schemaSource).toContain("voidedAt:");
      expect(schemaSource).toContain("voidedById:");
      expect(schemaSource).toContain("voidReason:");
    });

    it("records a replay-safe migration", () => {
      expect(fs.existsSync(migrationPath)).toBe(true);
      const migration = fs.readFileSync(migrationPath, "utf-8");
      expect(migration).toContain("ADD COLUMN status ENUM('active', 'voided')");
      expect(migration).toContain("ADD COLUMN voidedAt");
      expect(migration).toContain("ADD COLUMN voidedById");
      expect(migration).toContain("ADD COLUMN voidReason");
    });
  });

  describe("VOID-2: Server-side void flow", () => {
    const voidStart = dbSource.indexOf("export async function voidPayment");
    const voidEnd = dbSource.indexOf("async function recalcInvoicePaidAmountWithDb", voidStart);
    const voidBody = dbSource.slice(voidStart, voidEnd);

    it("uses a database transaction and never physically deletes a payment", () => {
      expect(voidBody).toContain("db.transaction");
      expect(voidBody).not.toContain("db.delete(payments)");
      expect(voidBody).toContain('status: "voided"');
    });

    it("requires a bounded reason and rejects a second void", () => {
      expect(voidBody).toContain("reason.length < 3 || reason.length > 500");
      expect(voidBody).toContain('payment.status === "voided"');
      expect(voidBody).toContain("affectedRows !== 1");
      expect(voidBody).toContain("already been voided");
    });

    it("records the void server timestamp, user, and reason", () => {
      expect(voidBody).toContain("voidedAt: new Date()");
      expect(voidBody).toContain("voidedById");
      expect(voidBody).toContain("voidReason: reason");
    });

    it("refuses payment-only recalculation when refund or credit activity exists", () => {
      expect(voidBody).toContain("from(refunds)");
      expect(voidBody).toContain("from(creditTransactions)");
      expect(voidBody).toContain("related refund or credit activity");
    });
  });

  describe("VOID-3: Active-only finance calculations", () => {
    it("delegates recalculation to the active-only financial summary before using net settled", () => {
      const recalcStart = dbSource.indexOf("async function recalcInvoicePaidAmountWithDb");
      const recalcEnd = dbSource.indexOf("async function recalcInvoicePaidAmount(invoiceId", recalcStart);
      const recalcBody = dbSource.slice(recalcStart, recalcEnd);
      expect(recalcBody).toContain("getInvoiceFinancialSummaryWithDb(db, invoiceId)");
      expect(recalcBody).toContain("const total = summary.netSettled");
      const summaryStart = dbSource.indexOf("async function getInvoiceFinancialSummaryWithDb");
      const summaryEnd = dbSource.indexOf("export async function getInvoiceFinancialSummary", summaryStart);
      const summaryBody = dbSource.slice(summaryStart, summaryEnd);
      expect(summaryBody).toContain('eq(payments.status, "active")');
      expect(summaryBody).toContain("sum.plus(String(row.settledAmount ?? 0))");
    });

    it("defaults invoice payment reads to active rows while allowing history to request voided rows", () => {
      expect(dbSource).toContain("listPaymentsByInvoice(invoiceId: number, includeVoided = false)");
      expect(dbSource).toMatch(/includeVoided\s*\?/);
      expect(dbSource).toContain('eq(payments.status, "active")');
    });

    it("keeps delete-invoice and pricing-mode activity guards conservative by counting all payment rows", () => {
      expect(dbSource).toContain("from(payments).where(eq(payments.invoiceId, id))");
      expect(dbSource).toContain("from(payments).where(eq(payments.invoiceId, invoiceId))");
    });
  });

  describe("VOID-4: Authorization and UI workflow", () => {
    it("exposes a dedicated void mutation that excludes doctors", () => {
      const voidMiddlewareStart = routerSource.indexOf("const financeVoidProcedure");
      const voidMiddlewareEnd = routerSource.indexOf("// ─── App Router", voidMiddlewareStart);
      const voidMiddleware = routerSource.slice(voidMiddlewareStart, voidMiddlewareEnd);
      expect(voidMiddleware).toContain("const financeVoidProcedure");
      expect(voidMiddleware).toContain('ctx.user.role !== "admin"');
      expect(voidMiddleware).toContain('ctx.user.role !== "staff"');
      expect(voidMiddleware).toContain('ctx.user.role !== "manager"');
      expect(voidMiddleware).not.toContain('ctx.user.role !== "doctor"');
      expect(routerSource).toContain("voidPayment: financeVoidProcedure");
      expect(routerSource).toContain("voidReason: z.string().trim().min(3).max(500)");
    });

    it("replaces direct hard deletion in the payment modal with a confirmation and required reason", () => {
      expect(patientPageSource).not.toContain("trpc.finance.deletePayment");
      expect(patientPageSource).toContain("trpc.finance.voidPayment.useMutation");
      expect(patientPageSource).toContain("Void payment?");
      expect(patientPageSource).toContain("payment-void-reason");
      expect(patientPageSource).toContain("Void Payment");
    });

    it("renders voided payment metadata and suppresses a second void action", () => {
      expect(patientPageSource).toContain('const isVoided = p.status === "voided"');
      expect(patientPageSource).toContain("Voided");
      expect(patientPageSource).toContain("p.voidedByName");
      expect(patientPageSource).toContain("p.voidReason");
      expect(patientPageSource).toContain("!isVoided && canVoidPayments");
    });
  });

  describe("VOID-5: Historical display and receipts", () => {
    it("returns recorded and voided user names with patient payment history", () => {
      expect(dbSource).toContain("recordedByName: recordedByUser.name");
      expect(dbSource).toContain("voidedByName: voidedByUser.name");
    });

    it("renders both the original payment and the later void event in the unified history", () => {
      expect(patientPageSource).toContain("Payment Received (Voided)");
      expect(patientPageSource).toContain("Payment Voided");
      expect(patientPageSource).toContain("No longer contributes to financial totals");
      expect(patientPageSource).toContain("Reason:");
    });

    it("keeps voided invoices protected by the shared Official Receipt eligibility guard", () => {
      expect(pdfRoutesSource).toContain("isOfficialReceiptEligible(receiptData)");
      expect(routerSource).toContain("isOfficialReceiptEligible(receiptData)");
      expect(pdfRoutesSource).toContain("OFFICIAL_RECEIPT_UNAVAILABLE_MESSAGE");
      expect(routerSource).toContain("OFFICIAL_RECEIPT_UNAVAILABLE_MESSAGE");
    });
  });
});
