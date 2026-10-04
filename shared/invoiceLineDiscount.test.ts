import { describe, expect, it } from "vitest";
import { deriveInvoiceLineDiscountPresentation } from "./invoiceLineDiscount";

describe("deriveInvoiceLineDiscountPresentation", () => {
  it("derives the informational amount and percentage only when the negotiated line is lower", () => {
    expect(deriveInvoiceLineDiscountPresentation({ originalLineTotal: "3222.13", finalLineTotal: "2700.00" })).toEqual({
      applies: true,
      originalLineTotal: "3222.13",
      finalLineTotal: "2700.00",
      discountAmount: "522.13",
      discountPercent: "16.20",
    });
  });

  it("does not label an equal or higher negotiated value as a discount", () => {
    expect(deriveInvoiceLineDiscountPresentation({ originalLineTotal: "100.00", finalLineTotal: "100.00" }).applies).toBe(false);
    expect(deriveInvoiceLineDiscountPresentation({ originalLineTotal: "100.00", finalLineTotal: "125.00" }).applies).toBe(false);
  });

  it("quantizes monetary display facts once and never uses the rounded percentage to calculate the final line", () => {
    expect(deriveInvoiceLineDiscountPresentation({ originalLineTotal: "1200", finalLineTotal: "1055" })).toMatchObject({
      applies: true,
      discountAmount: "145.00",
      discountPercent: "12.08",
      finalLineTotal: "1055.00",
    });
  });
});
