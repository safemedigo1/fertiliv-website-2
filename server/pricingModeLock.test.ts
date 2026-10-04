import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// ─── Pricing Mode Lock Tests ──────────────────────────────────────────────────
// Verifies that once an invoice has payment rows, pricingMode cannot be changed.
// The guard lives in updateInvoiceFull (server/db.ts) and the UI lock lives in
// EditInvoiceModal (client/src/pages/PatientDetailPage.tsx).
// ─────────────────────────────────────────────────────────────────────────────

const dbPath = path.resolve(__dirname, "db.ts");
const clientPath = path.resolve(__dirname, "../client/src/pages/PatientDetailPage.tsx");
const dbSource = fs.readFileSync(dbPath, "utf-8");
const clientSource = fs.readFileSync(clientPath, "utf-8");

describe("Pricing Mode Lock — after payments exist", () => {

  // ─── LOCK-1: Server guard exists in updateInvoiceFull ────────────────────
  describe("LOCK-1: Server guard in updateInvoiceFull", () => {
    it("updateInvoiceFull contains a Pricing Mode Lock comment block", () => {
      expect(dbSource).toContain("Pricing Mode Lock");
    });

    it("guard throws PRECONDITION_FAILED when pricingMode changes with payments", () => {
      expect(dbSource).toContain("PRECONDITION_FAILED");
      expect(dbSource).toContain(
        "Pricing mode cannot be changed after payments have been recorded."
      );
    });

    it("guard checks payment count before throwing", () => {
      // Must count payments for the invoice before deciding to throw
      expect(dbSource).toContain("paymentCount");
      expect(dbSource).toContain("COUNT(*)");
    });

    it("guard compares normalised modes (discount_legacy treated as discount)", () => {
      expect(dbSource).toContain("normalise");
      expect(dbSource).toContain("discount_legacy");
    });

    it("guard only fires when pricingMode is actually being changed (not on same-mode edits)", () => {
      // The guard is inside: if (normalise(currentMode) !== normalise(data.pricingMode))
      // This ensures editing items/discount% on an existing Mode A invoice does NOT trigger the guard
      const guardBlock = dbSource.slice(
        dbSource.indexOf("Pricing Mode Lock"),
        dbSource.indexOf("let subtotalCalc = 0")
      );
      expect(guardBlock).toContain("normalise(currentMode) !== normalise(data.pricingMode)");
    });
  });

  // ─── LOCK-2: Guard is inside updateInvoiceFull, not the router ───────────
  describe("LOCK-2: Guard placement", () => {
    it("guard is placed inside the transactional updateInvoiceFull helper", () => {
      const fnStart = dbSource.indexOf("async function updateInvoiceFullWithDb");
      const fnEnd = dbSource.indexOf("export async function", fnStart + 1);
      const fnBody = dbSource.slice(fnStart, fnEnd);
      expect(fnBody).toContain("Pricing Mode Lock");
      expect(fnBody).toContain("PRECONDITION_FAILED");
    });

    it("guard fires before the identity-preserving item-update transaction", () => {
      // The guard block must appear before V4 begins changing invoice items.
      const updateStart = dbSource.indexOf("async function updateInvoiceFullWithDb");
      const updateEnd = dbSource.indexOf("// ─── Proposal Items", updateStart);
      const updateBody = dbSource.slice(updateStart, updateEnd);
      const guardPos = updateBody.indexOf("Pricing Mode Lock");
      const transactionPos = updateBody.indexOf("for (const item of canonicalItems)");
      expect(guardPos).toBeGreaterThan(0);
      expect(transactionPos).toBeGreaterThan(0);
      expect(guardPos).toBeLessThan(transactionPos);
    });
  });

  // ─── LOCK-3: Client UI lock ───────────────────────────────────────────────
  describe("LOCK-3: Client UI lock in EditInvoiceModal", () => {
    it("EditInvoiceModal queries existingPayments", () => {
      expect(clientSource).toContain("existingPayments");
      expect(clientSource).toContain("listPayments");
    });

    it("pricing mode radio is visually locked when payments exist", () => {
      // The radio wrapper must have opacity-50 pointer-events-none when payments exist
      expect(clientSource).toContain("pointer-events-none");
      expect(clientSource).toContain("existingPayments?.length");
    });

    it("a warning notice is shown when payments exist", () => {
      expect(clientSource).toContain(
        "Pricing mode is locked after payments are recorded."
      );
    });
  });

  // ─── LOCK-4: Discount % and finalAgreedAmount remain editable ────────────
  describe("LOCK-4: Discount % and finalAgreedAmount remain editable after payments", () => {
    it("discount % input is not gated by existingPayments in the client", () => {
      // The discount % input must NOT be inside an existingPayments-based disable wrapper
      // (only the pricing MODE radio is locked, not the discount value itself)
      const discountInputIdx = clientSource.indexOf("Discount (%)");
      expect(discountInputIdx).toBeGreaterThan(0);
      // The input should exist and not be disabled by existingPayments
      const surroundingBlock = clientSource.slice(discountInputIdx - 200, discountInputIdx + 300);
      expect(surroundingBlock).not.toContain("existingPayments?.length");
    });

    it("server updateInvoiceFull does not block discountPercent changes after payments", () => {
      // The guard only fires when pricingMode changes — discountPercent within the same mode is allowed
      const guardBlock = dbSource.slice(
        dbSource.indexOf("Pricing Mode Lock"),
        dbSource.indexOf("const canonicalItems", dbSource.indexOf("Pricing Mode Lock"))
      );
      // Guard is conditional on pricingMode !== undefined AND mode actually changing
      expect(guardBlock).not.toContain("discountPercent");
    });
  });

  // ─── LOCK-5: recalcInvoicePaidAmount is NOT called on pricingMode change ──
  describe("LOCK-5: settledAmount values are not recalculated on invoice edit", () => {
    it("recalcInvoicePaidAmount sums persisted settledAmount (not live formula)", () => {
      // The current aggregate consumes immutable settlement rows and only the
      // legacy payment rows not represented by those settlements.
      expect(dbSource).toContain("const unmatchedLegacySettled = unmatchedLegacyRows");
      expect(dbSource).toContain("sum.plus(String(row.settledAmount ?? 0))");
      expect(dbSource).toContain("paymentSettlementTotal.plus(unmatchedLegacySettled)");
    });

    it("the transactional update helper uses the same persisted-settlement recalculation", () => {
      const fnStart = dbSource.indexOf("async function updateInvoiceFullWithDb");
      const fnEnd = dbSource.indexOf("export async function", fnStart + 1);
      const fnBody = dbSource.slice(fnStart, fnEnd);
      expect(fnBody).toContain("recalcInvoicePaidAmountWithDb(tx as any, invoiceId)");
    });
  });

});
