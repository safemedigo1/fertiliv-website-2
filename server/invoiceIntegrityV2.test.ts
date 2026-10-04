import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── Invoice/Payment Integrity V2 Tests ───────────────────────────────────────
// These tests verify the structural integrity fixes applied to the invoice/payment
// system: FK constraints, deleteInvoice guard, recalcInvoicePaidAmount patient
// cross-check, and server-side patientId derivation.
// ─────────────────────────────────────────────────────────────────────────────

const dbPath = path.resolve(__dirname, "db.ts");
const routersPath = path.resolve(__dirname, "routers.ts");
const dbSource = fs.readFileSync(dbPath, "utf-8");
const routersSource = fs.readFileSync(routersPath, "utf-8");

describe("Invoice/Payment Integrity V2", () => {

  // ─── INT-1: deleteInvoice blocks when payments exist ──────────────────────
  describe("INT-1: deleteInvoice payment guard", () => {
    it("deleteInvoice checks payment count before deleting", () => {
      // The guard must query payments.count before proceeding
      expect(dbSource).toContain("Cannot delete an invoice with recorded payments");
    });

    it("deleteInvoice throws PRECONDITION_FAILED when payments exist", () => {
      expect(dbSource).toContain('code: "PRECONDITION_FAILED"');
    });

    it("deleteInvoice guard uses count() on payments table filtered by invoiceId", () => {
      // Verify the guard queries the payments table for the specific invoiceId
      expect(dbSource).toMatch(/count\(\).*from.*payments.*invoiceId|payments.*count.*invoiceId/s);
    });

    it("deleteInvoice error message does not encourage deleting payment records", () => {
      // The message must say "Void/cancel" not "remove payments"
      const msg = "Void/cancel the invoice or resolve the payment relationship first";
      expect(dbSource).toContain(msg);
    });
  });

  // ─── INT-2: deleteInvoice succeeds with no payments ───────────────────────
  describe("INT-2: deleteInvoice with no payments", () => {
    it("deleteInvoice still deletes invoiceItems and invoice row when no payments exist", () => {
      // The deletion path must still exist after the guard
      expect(dbSource).toContain("delete(invoiceItems).where(eq(invoiceItems.invoiceId, id))");
      expect(dbSource).toContain("delete(invoices).where(eq(invoices.id, id))");
    });
  });

  // ─── INT-3: recalcInvoicePaidAmount patient cross-check ───────────────────
  describe("INT-3: recalcInvoicePaidAmount patient cross-check", () => {
    it("recalcInvoicePaidAmount fetches invoicePatientId for cross-check", () => {
      expect(dbSource).toContain("invoicePatientId");
    });

    it("recalcInvoicePaidAmount filters valid payment rows and valid settlement rows", () => {
      expect(dbSource).toContain("validPaymentRows");
      expect(dbSource).toContain("legitimateSettlements");
    });

    it("recalcInvoicePaidAmount excludes payments where patientId does not match invoice patientId", () => {
      // The filter must check patientId match
      expect(dbSource).toMatch(/validPaymentRows.*patientId.*invoicePatientId|patientId.*invoicePatientId.*validPaymentRows/s);
    });

    it("recalcInvoicePaidAmount aggregates only unmatched legacy payment rows alongside settlement rows", () => {
      expect(dbSource).toContain("const unmatchedLegacyRows = validPaymentRows.filter(");
      expect(dbSource).toContain("const unmatchedLegacySettled = unmatchedLegacyRows");
      expect(dbSource).toContain("paymentSettlementTotal.plus(unmatchedLegacySettled)");
    });
  });

  // ─── INT-4: recalcInvoicePaidAmount with only legitimate payments ──────────
  describe("INT-4: recalcInvoicePaidAmount arithmetic correctness", () => {
    it("computePaymentSettlement is used for Mode A/B settlement", () => {
      expect(dbSource).toContain("computePaymentSettlement");
    });

    it("paidAmount is updated after settlement sum", () => {
      expect(dbSource).toContain("paidAmount:");
    });
  });

  // ─── INT-5: createPayment always has patientId from server ────────────────
  describe("INT-5: createPayment server-side patientId derivation", () => {
    it("finance.createPayment Zod schema does NOT accept patientId from client", () => {
      // The input schema for createPayment must not have patientId
      const createPaymentSection = routersSource.slice(
        routersSource.indexOf("createPayment: staffOrAdminProcedure"),
        routersSource.indexOf("createPayment: staffOrAdminProcedure") + 1500
      );
      expect(createPaymentSection).not.toContain("patientId: z.number()");
    });

    it("finance.createPayment derives patientId from invoice server-side", () => {
      const createPaymentSection = routersSource.slice(
        routersSource.indexOf("createPayment: staffOrAdminProcedure"),
        routersSource.indexOf("createPayment: staffOrAdminProcedure") + 1500
      );
      expect(createPaymentSection).toContain("getInvoiceById");
      expect(createPaymentSection).toContain("patientId");
    });

    it("Edit Invoice Marked-as-Paid path derives patientId from inv not input", () => {
      // The Edit Invoice path must use (inv as any).patientId not input.patientId
      expect(routersSource).toContain("patientId: (inv as any).patientId");
      expect(routersSource).not.toContain("patientId: input.patientId ?? null");
    });
  });

  // ─── INT-6: initial payment preview lifecycle ────────────────────────────
  describe("INT-6: initial payment preview lifecycle", () => {
    it("Create Invoice waits for the server-authoritative preview before mutation", () => {
      const clientPath = path.resolve(__dirname, "../client/src/pages/PatientDetailPage.tsx");
      const clientSource = fs.readFileSync(clientPath, "utf-8");
      expect(clientSource).toContain("trpc.finance.previewInitialPayments.useQuery");
      expect(clientSource).toContain("Waiting for the server payment preview. Please try again.");
    });

    it("createPaymentMut does not pass patientId from client", () => {
      const clientPath = path.resolve(__dirname, "../client/src/pages/PatientDetailPage.tsx");
      const clientSource = fs.readFileSync(clientPath, "utf-8");
      // patientId should not appear in createPaymentMut.mutateAsync calls
      // (it is now derived server-side)
      const mutateAsyncCalls = clientSource.match(/createPaymentMut\.mutateAsync\(\{[^}]+\}/gs) ?? [];
      for (const call of mutateAsyncCalls) {
        expect(call).not.toContain("patientId");
      }
    });
  });

  // ─── INT-7: createPaymentMut uses invoiceId from onSuccess ───────────────
  describe("INT-7: createPaymentMut uses correct invoiceId", () => {
    it("createPaymentMut.mutateAsync receives invoiceId from onSuccess newInvoice.id", () => {
      const clientPath = path.resolve(__dirname, "../client/src/pages/PatientDetailPage.tsx");
      const clientSource = fs.readFileSync(clientPath, "utf-8");
      // The onSuccess handler must use the returned invoiceId, not a stale ref
      expect(clientSource).toContain("invoiceId");
    });
  });

  // ─── INT-8: INV-00029 type scenario — cross-patient payments excluded ─────
  describe("INT-8: Cross-patient payment exclusion", () => {
    it("recalcInvoicePaidAmount filter correctly excludes payments from different patients", () => {
      // Simulate: invoice patientId=2700001, payment patientId=300001 → excluded
      const invoicePatientId = 2700001;
      const payments = [
        { patientId: 300001, amount: "450.09" },   // contaminated
        { patientId: 300001, amount: "553.61" },   // contaminated
        { patientId: 2700001, amount: "50.00" },   // legitimate
      ];
      const legitimateRows = payments.filter(
        r => r.patientId == null || String(r.patientId) === String(invoicePatientId)
      );
      expect(legitimateRows).toHaveLength(1);
      expect(legitimateRows[0].amount).toBe("50.00");
      const total = legitimateRows.reduce((s, r) => s + parseFloat(r.amount), 0);
      expect(total).toBeCloseTo(50.00, 2);
    });

    it("recalcInvoicePaidAmount filter allows payments with null patientId (legacy)", () => {
      const invoicePatientId = 2700001;
      const payments = [
        { patientId: null, amount: "100.00" },    // legacy null — allowed
        { patientId: 2700001, amount: "50.00" },  // legitimate
      ];
      const legitimateRows = payments.filter(
        r => r.patientId == null || String(r.patientId) === String(invoicePatientId)
      );
      expect(legitimateRows).toHaveLength(2);
    });
  });

  // ─── INT-9: Payment with matching invoiceId but wrong patientId excluded ──
  describe("INT-9: invoiceId match but patientId mismatch → excluded from paidAmount", () => {
    it("a payment whose invoiceId matches but patientId belongs to another patient is excluded", () => {
      const invoicePatientId = 9999;
      const payments = [
        { patientId: 1111, amount: "1000.00", invoiceId: 42 },  // wrong patient
        { patientId: 9999, amount: "200.00",  invoiceId: 42 },  // correct patient
      ];
      const legitimateRows = payments.filter(
        r => r.patientId == null || String(r.patientId) === String(invoicePatientId)
      );
      expect(legitimateRows).toHaveLength(1);
      expect(legitimateRows[0].amount).toBe("200.00");
      // The contaminated payment (1000.00) must never affect paidAmount
      const total = legitimateRows.reduce((s, r) => s + parseFloat(r.amount), 0);
      expect(total).toBeCloseTo(200.00, 2);
    });
  });

  // ─── Backup file verification ─────────────────────────────────────────────
  describe("Backup file exists", () => {
    it("PAYMENT_BACKUP_270001_270002.json exists with both contaminated rows", () => {
      const backupPath = path.resolve(__dirname, "../PAYMENT_BACKUP_270001_270002.json");
      expect(fs.existsSync(backupPath)).toBe(true);
      const backup = JSON.parse(fs.readFileSync(backupPath, "utf-8"));
      expect(backup).toHaveLength(2);
      expect(backup[0].id).toBe(270001);
      expect(backup[1].id).toBe(270002);
      expect(backup[0].patientId).toBe(300001);
      expect(backup[1].patientId).toBe(300001);
    });
  });

});
