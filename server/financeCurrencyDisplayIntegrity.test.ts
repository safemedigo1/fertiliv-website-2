import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Finance Currency Display Integrity", () => {
  const page = read("client/src/pages/FinancePage.tsx");
  const dashboard = read("client/src/pages/Dashboard.tsx");
  const db = read("server/db.ts");

  it("FCD-1: formats invoice-list total, paid, and remaining values with the persisted invoice currency", () => {
    expect(page).toContain("function formatInvoiceMoney(currency");
    expect(page).toContain("{formatInvoiceMoney(inv.currency, inv.totalAmount)}");
    expect(page).toContain("Paid: {formatInvoiceMoney(inv.currency, inv.paidAmount)}");
    expect(page).toContain("Remaining: {formatInvoiceMoney(inv.currency");
  });

  it("FCD-2: uses explicit currency codes and never adds a dollar prefix to invoice-row values", () => {
    expect(page).toContain("return `${code} ${Number(value ?? 0).toLocaleString");
    const invoiceRow = page.slice(page.indexOf("{filtered.map(inv => ("), page.indexOf("{/* Actions */}"));
    expect(invoiceRow).not.toContain("$${Number(inv.totalAmount)");
    expect(invoiceRow).not.toContain("Paid: ${Number(inv.paidAmount)");
  });

  it("FCD-3: keeps Finance export rows currency-safe and avoids a mixed-currency revenue footer", () => {
    expect(page).toContain("Invoice totals by currency:");
    expect(page).toContain("groupInvoiceTotalsByCurrency(exportRows)");
    expect(page).toContain('["Invoice #", "Patient", "Date", "Due Date", "Currency", "Total", "Paid", "Status"]');
  });

  it("FCD-4: identifies all four top cards as TRY reporting values", () => {
    expect(page).toContain('title="Total Revenue (TRY)"');
    expect(page).toContain('title="Fully Paid This Month (TRY)"');
    expect(page).toContain('title="Outstanding (TRY)"');
    expect(page).toContain('title="Overdue (TRY)"');
    expect(page).toContain("formatReportingTRY");
  });

  it("FCD-5: withholds, rather than mixes, any aggregate affected by a missing foreign-currency FX snapshot", () => {
    expect(db).toContain('const unavailableMetrics = new Set<string>();');
    expect(db).toContain("const hasHistoricalFx = !requiresHistoricalFx || (snap != null && snap > 0);");
    expect(db).toContain('unavailableMetrics.add("outstanding")');
    expect(db).toContain("return amount; // no snapshot: return as-is (best effort)");
    expect(page).toContain('? "Not available"');
    expect(page).toContain("A current reporting FX rate is unavailable");
  });

  it("FCD-6: exposes TRY as the defined reporting currency from the server", () => {
    expect(db).toContain('reportingCurrency: "TRY" as const');
    expect(db).toContain("unavailableMetrics: Array.from(unavailableMetrics)");
  });

  it("FCD-7: derives Fully Paid This Month from the latest active payment financial date with a legacy invoice-date fallback", () => {
    expect(db).toContain('eq(payments.status, "active")');
    expect(db).toContain('eq(payments.financialScope, "production")');
    expect(db).toContain("const financialPaymentDate = latestActivePaymentDate.get(inv.id) ?? inv.paymentDate ?? null;");
    expect(db).toContain("financialPaymentDate >= startOfMonth && financialPaymentDate < startOfNextMonth");
    expect(page).toContain('title="Fully Paid This Month (TRY)"');
  });

  it("FCD-8: uses the server-defined reporting currency and avoids dollar-prefixed dashboard finance aggregates", () => {
    expect(dashboard).toContain('const reportingCurrency = finStats?.reportingCurrency ?? "TRY";');
    expect(dashboard).toContain('title={`Total Revenue (${reportingCurrency})`}');
    expect(dashboard).toContain('title={`Outstanding (${reportingCurrency})`}');
    expect(dashboard).toContain('Monthly Revenue ({reportingCurrency})');
    expect(dashboard).not.toContain('value={`$${(finStats?.totalRevenue ?? 0).toLocaleString()}`}');
    expect(dashboard).not.toContain('value={`$${(finStats?.outstanding ?? 0).toLocaleString()}`}');
  });
});
