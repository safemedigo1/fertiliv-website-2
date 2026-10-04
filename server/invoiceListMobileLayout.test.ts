import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const page = fs.readFileSync(path.join(root, "client/src/pages/FinancePage.tsx"), "utf8");
const cardStart = page.indexOf("{invoices.map(inv => (");
const cardEnd = page.indexOf("\n              ))}\n            </div>", cardStart);
const invoiceCard = page.slice(cardStart, cardEnd);

describe("Finance invoice-list mobile layout", () => {
  it("ILM-1 stacks each invoice card on mobile and retains the horizontal row at the sm breakpoint", () => {
    expect(invoiceCard).toContain("flex flex-col gap-3");
    expect(invoiceCard).toContain("sm:flex-row sm:items-center");
  });

  it("ILM-2 keeps invoice identifiers and patient metadata in a full-width, wrapping mobile section", () => {
    expect(invoiceCard).toContain("min-w-0 w-full sm:flex-1");
    expect(invoiceCard).toContain("flex flex-wrap items-center gap-2");
    expect(invoiceCard).toContain("break-words");
  });

  it("ILM-3 moves financial values into their own full-width mobile section before returning to desktop alignment", () => {
    expect(invoiceCard).toContain("grid w-full grid-cols-1 gap-1 border-t pt-3 text-left");
    expect(invoiceCard).toContain("sm:w-auto sm:border-t-0 sm:pt-0 sm:text-right");
    expect(invoiceCard).toContain("Total: {formatInvoiceMoney");
    expect(invoiceCard).toContain("Remaining: {formatInvoiceMoney");
  });

  it("ILM-4 separates actions below financial values on mobile and keeps delete tappable without overlap", () => {
    expect(invoiceCard).toContain("flex w-full items-center justify-between gap-2 border-t pt-3");
    expect(invoiceCard).toContain("sm:w-auto sm:justify-end sm:border-t-0 sm:pt-0");
    expect(invoiceCard).toContain("aria-label={`More actions for ${inv.invoiceNumber}`}");
    expect(invoiceCard).toContain("Delete Invoice");
  });

  it("ILM-5 preserves existing list filters and pagination controls", () => {
    expect(page).toContain("Invoice Issue Date From");
    expect(page).toContain("Invoice Issue Date To");
    expect(page).toContain("Rows per page: 20");
    expect(page).toContain("disabled={currentPage <= 1}");
    expect(page).toContain("disabled={currentPage >= totalPages}");
  });
});
