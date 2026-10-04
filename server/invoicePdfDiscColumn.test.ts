import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { getInvoicePdfLineDiscountDisplay, shouldShowInvoiceLineDiscountColumn } from "../shared/invoicePdfLineDiscount";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Invoice PDF conditional DISC% column", () => {
  it("hides DISC% when no item has an effective line discount, regardless of any invoice-level discount", () => {
    expect(shouldShowInvoiceLineDiscountColumn([
      { linePricingMethod: "none", originalLineTotal: 100, totalPrice: 100 },
      { linePricingMethod: "final_line_total", originalLineTotal: 100, totalPrice: 100 },
      { linePricingMethod: "agreed_unit_price", originalLineTotal: 100, totalPrice: 125 },
      { linePricingMethod: "discount_percent", lineDiscountPercent: 0, originalLineTotal: 100, totalPrice: 100 },
    ])).toBe(false);
  });

  it("keeps persisted Discount % formatting while deriving it from the effective monetary result", () => {
    expect(getInvoicePdfLineDiscountDisplay({
      linePricingMethod: "discount_percent",
      lineDiscountPercent: 50,
      originalLineTotal: "3930.97",
      totalPrice: "1965.49",
    })).toBe("50.0%");
  });

  it("derives DISC% for agreed-unit and final-line pricing from standard × quantity", () => {
    expect(getInvoicePdfLineDiscountDisplay({
      linePricingMethod: "agreed_unit_price",
      originalLineTotal: "531.21",
      totalPrice: "450.00",
    })).toBe("15.29%");
    expect(getInvoicePdfLineDiscountDisplay({
      linePricingMethod: "final_line_total",
      originalLineTotal: "265.60",
      totalPrice: "150.00",
    })).toBe("43.52%");
  });

  it("shows one shared column for mixed effective discounts and an em dash for standard, equal, or higher lines", () => {
    expect(shouldShowInvoiceLineDiscountColumn([
      { linePricingMethod: "discount_percent", lineDiscountPercent: 12.5, originalLineTotal: 100, totalPrice: 87.5 },
      { linePricingMethod: "agreed_unit_price", originalLineTotal: 531.21, totalPrice: 450 },
      { linePricingMethod: "final_line_total", originalLineTotal: 265.6, totalPrice: 150 },
      { linePricingMethod: "none", originalLineTotal: 100, totalPrice: 100 },
    ])).toBe(true);
    expect(getInvoicePdfLineDiscountDisplay({ linePricingMethod: "final_line_total", originalLineTotal: 100, totalPrice: 100 })).toBeNull();
    expect(getInvoicePdfLineDiscountDisplay({ linePricingMethod: "agreed_unit_price", originalLineTotal: 100, totalPrice: 125 })).toBeNull();
  });

  it("uses the predicate in the shared Invoice renderer and does not project overall discounts into rows", () => {
    const pdfService = read("server/pdfService.ts");
    expect(pdfService).toContain("shouldShowInvoiceLineDiscountColumn(data.items)");
    expect(pdfService).toContain("const showLineDiscountColumn");
    expect(pdfService).toContain("if (showLineDiscountColumn)");
    expect(pdfService).toContain("const lineDiscountDisplay = getInvoicePdfLineDiscountDisplay(item)");
    expect(pdfService).not.toContain("discountPercent.toFixed(1)}%` : \"—\"");
  });

  it("keeps direct-download and emailed Invoice PDFs on the same generateInvoicePdf renderer", () => {
    const pdfRoutes = read("server/pdfRoutes.ts");
    const routers = read("server/routers.ts");
    expect(pdfRoutes).toContain("generateInvoicePdf({");
    expect(routers).toContain("generateInvoicePdf({");
  });
});
