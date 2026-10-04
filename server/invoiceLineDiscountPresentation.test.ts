import { describe, expect, it } from "vitest";
import { deriveInvoiceLineDiscountPresentation } from "../shared/invoiceLineDiscount";

describe("Edit Invoice derived line discount presentation", () => {
  it("discloses a Discount % adjustment from canonical pre-tax line amounts", () => {
    expect(deriveInvoiceLineDiscountPresentation({ originalLineTotal: "200.00", finalLineTotal: "150.00" })).toMatchObject({
      applies: true,
      discountAmount: "50.00",
      discountPercent: "25.00",
      finalLineTotal: "150.00",
    });
  });

  it("discloses an agreed-unit adjustment below the standard total", () => {
    expect(deriveInvoiceLineDiscountPresentation({ originalLineTotal: "531.21", finalLineTotal: "450.00" })).toMatchObject({
      applies: true,
      discountAmount: "81.21",
      discountPercent: "15.29",
    });
  });

  it("uses the whole pre-tax Final Line amount for a multi-quantity negotiated line", () => {
    expect(deriveInvoiceLineDiscountPresentation({ originalLineTotal: "265.60", finalLineTotal: "150.00" })).toEqual({
      applies: true,
      originalLineTotal: "265.60",
      finalLineTotal: "150.00",
      discountAmount: "115.60",
      discountPercent: "43.52",
    });
  });

  it("does not label equal or higher adjusted values as Discount", () => {
    expect(deriveInvoiceLineDiscountPresentation({ originalLineTotal: "100.00", finalLineTotal: "100.00" }).applies).toBe(false);
    expect(deriveInvoiceLineDiscountPresentation({ originalLineTotal: "100.00", finalLineTotal: "125.00" }).applies).toBe(false);
  });
});
