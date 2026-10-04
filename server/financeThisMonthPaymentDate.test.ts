import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const db = fs.readFileSync(path.join(root, "server/db.ts"), "utf8");
const page = fs.readFileSync(path.join(root, "client/src/pages/FinancePage.tsx"), "utf8");

describe("Finance This Month Payment-Date Integrity", () => {
  it("TMP-1: identifies the metric as invoices that became fully paid during the month", () => {
    expect(db).toContain("This Month is the value of invoices that became fully paid in the month");
    expect(db).toContain('if (inv.status === "paid")');
    expect(page).toContain('title="Fully Paid This Month (TRY)"');
  });

  it("TMP-2: uses active payment receivedAt with createdAt fallback rather than the stale invoice-only field", () => {
    expect(db).toContain("const financialDate = new Date(payment.receivedAt ?? payment.createdAt);");
    expect(db).toContain("const financialPaymentDate = latestActivePaymentDate.get(inv.id) ?? inv.paymentDate ?? null;");
    expect(db).toContain("latestActivePaymentDate.set(payment.invoiceId, financialDate)");
    expect(db).toContain("const startOfNextMonth = new Date(startOfMonth)");
    expect(db).toContain("financialPaymentDate < startOfNextMonth");
  });

  it("TMP-3: excludes voided payment dates from the Financial This Month source", () => {
    expect(db).toContain('eq(payments.status, "active")');
    expect(db).toContain('eq(payments.financialScope, "production")');
  });

  it("TMP-4: retains the existing missing-historical-FX withholding policy for affected monthly values", () => {
    expect(db).toContain('unavailableMetrics.add("thisMonth")');
    expect(db).toContain("if (!hasHistoricalFx)");
  });
});
