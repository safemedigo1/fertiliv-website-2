import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "client/src/pages/FinancePage.tsx"), "utf8");
const cardStart = page.indexOf("{invoices.map(inv => (");
const cardEnd = page.indexOf("\n              ))}\n            </div>", cardStart);
const invoiceCard = page.slice(cardStart, cardEnd);

describe("Finance invoice rare action hierarchy", () => {
  it("IRA-1 keeps Mark Paid as the visible operational action when the invoice can be paid", () => {
    expect(invoiceCard).toContain('inv.status !== "paid" && inv.status !== "cancelled"');
    expect(invoiceCard).toContain(">Mark Paid</Button>");
  });

  it("IRA-2 moves rare invoice actions into the compact More actions menu", () => {
    expect(invoiceCard).toContain("<DropdownMenu>");
    expect(invoiceCard).toContain("More actions for ${inv.invoiceNumber}");
    expect(invoiceCard).toContain("<MoreHorizontal className=\"h-4 w-4\" />");
    expect(invoiceCard).toContain("Mark as Test");
    expect(invoiceCard).toContain("Delete Invoice");
  });

  it("IRA-3 keeps Mark as Test Admin-only and only available for a production invoice", () => {
    expect(invoiceCard).toContain('isAdmin && inv.financialScope === "production"');
    expect(invoiceCard).toContain("onSelect={() => setClassifyTarget({ id: inv.id, number: inv.invoiceNumber })}");
  });

  it("IRA-4 routes Delete Invoice through the existing confirmation dialog instead of deleting immediately", () => {
    expect(invoiceCard).toContain("onSelect={() => { setDeleteConfirmId(inv.id); setDeleteConfirmNumber(inv.invoiceNumber); }}");
    expect(page).toContain("<AlertDialog open={deleteConfirmId !== null}");
    expect(page).toContain('Delete Invoice {deleteConfirmNumber}?');
  });

  it("IRA-5 preserves required reason and confirmation for Test classification", () => {
    expect(page).toContain("classificationReason.trim().length < 3");
    expect(page).toContain("confirmed: true");
    expect(page).toContain("Confirm Test Classification");
  });
});
