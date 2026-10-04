import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { computeInvoiceLinePricing } from "../shared/invoiceLinePricing";
import { computeInvoiceTotals } from "../shared/invoicePricing";
import { getDraftServicePriceEntryKind, isIncompleteTaxIncludedDraft } from "../shared/invoiceLineDraft";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("V4-A: Canonical invoice-line calculations", () => {
  it("V4-A-1: none derives canonical total from standard unit price × quantity", () => {
    expect(computeInvoiceLinePricing({ quantity: 3, unitPrice: "100", linePricingMethod: "none" })).toMatchObject({
      unitPrice: "100.00", linePricingMethod: "none", lineDiscountPercent: null, totalPrice: "300.00",
    });
  });

  it("V4-A-2: percentage discount derives total server-side and ignores a conflicting client total", () => {
    expect(computeInvoiceLinePricing({ quantity: 3, unitPrice: "100", linePricingMethod: "discount_percent", lineDiscountPercent: 16.6667, totalPrice: "999" })).toMatchObject({
      unitPrice: "100.00", lineDiscountPercent: "16.67", totalPrice: "250.00",
    });
  });

  it("V4-A-3: final line price below standard preserves original unit price", () => {
    expect(computeInvoiceLinePricing({ quantity: 3, unitPrice: "100", linePricingMethod: "final_line_total", totalPrice: "250" })).toMatchObject({
      unitPrice: "100.00", totalPrice: "250.00", lineDiscountPercent: null,
    });
  });

  it("V4-A-4: final line price above standard is valid without a markup field", () => {
    expect(computeInvoiceLinePricing({ quantity: 3, unitPrice: "100", linePricingMethod: "final_line_total", totalPrice: "350" }).totalPrice).toBe("350.00");
  });

  it("V4-A-5: zero final line price is valid for a fully discounted/free service line", () => {
    expect(computeInvoiceLinePricing({ quantity: 2, unitPrice: "50", linePricingMethod: "final_line_total", totalPrice: "0" }).totalPrice).toBe("0.00");
  });

  it("V4-A-5A: an explicit Keep transition changes quantity without multiplying the agreed whole-line total, while Reset returns to standard quantity × unit price", () => {
    const kept = computeInvoiceLinePricing({ quantity: 5, unitPrice: "100", linePricingMethod: "final_line_total", totalPrice: "250" });
    const reset = computeInvoiceLinePricing({ quantity: 5, unitPrice: "100", linePricingMethod: "none" });
    expect(kept.totalPrice).toBe("250.00");
    expect(reset.totalPrice).toBe("500.00");
  });

  it("V4-A-5B: agreed-unit accepts the server-canonical line total while retaining the standard unit reference", () => {
    expect(computeInvoiceLinePricing({ quantity: 3, unitPrice: "100", linePricingMethod: "agreed_unit_price", totalPrice: "250" })).toMatchObject({
      unitPrice: "100.00", linePricingMethod: "agreed_unit_price", totalPrice: "250.00",
    });
  });

  it("V4-A-6: rejects invalid quantity, negative standard price, and out-of-range discount", () => {
    expect(() => computeInvoiceLinePricing({ quantity: 0, unitPrice: "100" })).toThrow(/quantity/i);
    expect(() => computeInvoiceLinePricing({ quantity: 1, unitPrice: "-1" })).toThrow(/unit price/i);
    expect(() => computeInvoiceLinePricing({ quantity: 1, unitPrice: "100", linePricingMethod: "discount_percent", lineDiscountPercent: 101 })).toThrow(/discount/i);
  });
});

describe("V4-B: Calculation order", () => {
  it("V4-B-1: overall discount is calculated after line-level final totals", () => {
    const adjustedServicesSubtotal = Number(computeInvoiceLinePricing({ quantity: 3, unitPrice: "100", linePricingMethod: "final_line_total", totalPrice: "250" }).totalPrice);
    const invoice = computeInvoiceTotals({ subtotal: adjustedServicesSubtotal, pricingMode: "discount", discountPercent: 10, adjustmentRate: 23 });
    expect(invoice.totalAmount).toBe("225.00");
  });

  it("V4-B-2: final agreed invoice price operates after line-level final totals", () => {
    const adjustedServicesSubtotal = Number(computeInvoiceLinePricing({ quantity: 3, unitPrice: "100", linePricingMethod: "final_line_total", totalPrice: "250" }).totalPrice);
    const invoice = computeInvoiceTotals({ subtotal: adjustedServicesSubtotal, pricingMode: "agreed", finalAgreedAmount: "200" });
    expect(invoice.totalAmount).toBe("200.00");
  });
});

describe("V4-C: Server authority and historical-line safeguards", () => {
  it("V4-C-1: schema contains only the two approved V4 metadata fields", () => {
    const schema = read("drizzle/schema.ts");
    expect(schema).toContain('linePricingMethod: pg_linePricingMethod("linePricingMethod"');
    expect(schema).toContain('lineDiscountPercent: numeric("lineDiscountPercent"');
    expect(schema).not.toContain('originalUnitPrice');
    expect(schema).not.toContain('finalLineTotal');
  });

  it("V4-C-2: full update calculates subtotal from canonical totalPrice and preserves existing rows", () => {
    const db = read("server/db.ts");
    const updateFull = db.slice(db.indexOf("async function updateInvoiceFullWithDb"), db.indexOf("export async function updateInvoiceFull", db.indexOf("async function updateInvoiceFullWithDb")));
    expect(updateFull).toContain('computeInvoiceLinePricing(item)');
    expect(updateFull).toContain('sum.plus(item.totalPrice)');
    expect(updateFull).toContain('Existing invoice lines cannot be removed after payment history has been recorded.');
    expect(updateFull).toContain('Existing service, quantity, standard unit price, and Tax rule cannot be changed after payment history has been recorded.');
    expect(updateFull).not.toContain('await db.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId))');
  });

  it("V4-C-3: router and PDF paths consume canonical stored totals", () => {
    const routers = read("server/routers.ts");
    const pdfRoute = read("server/pdfRoutes.ts");
    expect(routers).toContain('const subtotalNum = canonicalItems.reduce');
    expect(pdfRoute).toContain('const itemTotal = parseFloat(i.totalPrice);');
    expect(pdfRoute).toContain('linePricingMethod');
  });

  it("V4-C-4: agreed-unit is forward-only while final-line-total remains a whole-line total", () => {
    const schema = read("drizzle/schema.ts");
    const routers = read("server/routers.ts");
    expect(schema).toContain('"agreed_unit_price"');
    expect(schema).toContain('"tax_included_agreed_unit_price"');
    expect(routers).toContain("getAgreedUnitSourceLineAmount(priceEntry, item.quantity)");
    expect(read("server/db.ts")).toContain("taxIncludedMode: invoiceItems.taxIncludedMode");
  });
});

describe("V4-D: Edit Invoice persisted line-pricing presentation", () => {
  const patientDetailPage = read("client/src/pages/PatientDetailPage.tsx");
  const editInvoice = patientDetailPage.slice(
    patientDetailPage.indexOf("function EditInvoiceModal"),
    patientDetailPage.indexOf("function PatientCreditPayoutDialog"),
  );

  it("V4-D-1: opens saved percentage adjustments with their persisted percentage and final line total", () => {
    expect(computeInvoiceLinePricing({
      quantity: 1,
      unitPrice: "3240",
      linePricingMethod: "discount_percent",
      lineDiscountPercent: 10,
    })).toMatchObject({ linePricingMethod: "discount_percent", lineDiscountPercent: "10.00", totalPrice: "2916.00" });
    expect(editInvoice).toContain('adjustmentOpen: (i.linePricingMethod ?? "none") !== "none"');
    expect(editInvoice).toContain('lineDiscountPercent: i.lineDiscountPercent != null ? String(i.lineDiscountPercent) : undefined');
  });

  it("V4-D-2: opens saved final-line-total adjustments without substituting an invoice-wide discount", () => {
    expect(computeInvoiceLinePricing({ quantity: 1, unitPrice: "924.75", linePricingMethod: "final_line_total", totalPrice: "800" }))
      .toMatchObject({ linePricingMethod: "final_line_total", lineDiscountPercent: null, totalPrice: "800.00" });
    expect(computeInvoiceLinePricing({ quantity: 1, unitPrice: "2400", linePricingMethod: "final_line_total", totalPrice: "2000" }))
      .toMatchObject({ linePricingMethod: "final_line_total", lineDiscountPercent: null, totalPrice: "2000.00" });
    expect(editInvoice).toContain('linePricingMethod: (i.linePricingMethod as V4LinePricingMethod) ?? "none"');
    expect(editInvoice).toContain('value="final_line_total">Final Line Total</SelectItem>');
    expect(editInvoice).toContain('Whole-line amount; quantity changes require Keep, Reset, or Cancel.');
  });

  it("V4-D-3: leaves standard lines collapsed and distinguishes line-item from invoice-wide pricing", () => {
    expect(editInvoice).toContain('adjustmentOpen: (i.linePricingMethod ?? "none") !== "none"');
    expect(editInvoice).toContain("Line Item Pricing");
    expect(editInvoice).toContain("Invoice-wide pricing");
    expect(editInvoice).toContain("Applies after all line item pricing adjustments.");
  });

  it("V4-D-4: no-op save retains the hydrated line-pricing method and percentage", () => {
    expect(editInvoice).toContain('linePricingMethod: invoiceCurrencyItem.linePricingMethod ?? "none"');
    expect(editInvoice).toContain('lineDiscountPercent: invoiceCurrencyItem.linePricingMethod === "discount_percent"');
    expect(editInvoice).toContain('totalPrice: getEditTaxAwareLineTotal(i)');
  });

  it("V4-D-5: labels patient pricing as current while preserving existing invoice prices", () => {
    expect(editInvoice).toContain('Current Pricing: {isInternational ? "International" : "Local"}');
    expect(editInvoice).toContain("Existing invoice prices are preserved. New services use the patient&apos;s current pricing.");
    expect(editInvoice).toContain('const isInternational = (patientData as any)?.patientType === "international"');
  });

  it("V4-D-6: current patient pricing does not rewrite hydrated existing line metadata", () => {
    const savePayload = editInvoice.slice(editInvoice.indexOf("const buildInvoiceUpdatePayload"), editInvoice.indexOf("const handleSubmit"));
    expect(savePayload).toContain('linePricingMethod: invoiceCurrencyItem.linePricingMethod ?? "none"');
    expect(savePayload).toContain('lineDiscountPercent: invoiceCurrencyItem.linePricingMethod === "discount_percent"');
    expect(savePayload).not.toContain("isInternational");
  });

  it("V4-D-7: keeps the no-op invoice-wide adjustment collapsed and reopens saved non-zero adjustments", () => {
    expect(editInvoice).toContain("Invoice-wide pricing");
    expect(editInvoice).toContain('invoice.pricingMode === "agreed" || parseFloat(invoice.discountPercent ?? "0") > 0');
    expect(editInvoice).toContain("Optional discount or final agreed price. The standard invoice total is unchanged.");
    expect(editInvoice).toContain("Reset to standard invoice total");
    expect(editInvoice).toContain('setPricingMode("discount"); setDiscountPercent(0); setFinalAgreedPrice(""); setInvoiceAdjustmentOpen(false);');
  });

  it("V4-D-8: requires an explicit staff decision before changing final-line-total quantity in Create and Edit", () => {
    const createInvoice = patientDetailPage.slice(
      patientDetailPage.indexOf("function CreateInvoiceModal"),
      patientDetailPage.indexOf("function EditInvoiceModal"),
    );
    expect(createInvoice).toContain("pendingQuantityChange");
    expect(createInvoice).toContain('item.linePricingMethod === "final_line_total"');
    expect(createInvoice).toContain("keepAgreedLineTotalAfterQuantityChange");
    expect(createInvoice).toContain("resetLinePricingAfterQuantityChange");
    expect(createInvoice).toContain("Cancel quantity change");
    expect(createInvoice).toContain("No invoice record is changed until you save.");
    expect(editInvoice).toContain("pendingEditQuantityChange");
    expect(editInvoice).toContain('item.linePricingMethod === "final_line_total"');
    expect(editInvoice).toContain("keepEditAgreedLineTotalAfterQuantityChange");
    expect(editInvoice).toContain("resetEditLinePricingAfterQuantityChange");
    expect(editInvoice).toContain("Cancel quantity change");
    expect(editInvoice).toContain("No invoice record is changed until you save.");
  });

  it("V4-D-9: shared controller maps agreed-unit kinds and marks incomplete Tax-Included drafts", () => {
    expect(getDraftServicePriceEntryKind("agreed_unit_price", true)).toBe("tax_included_agreed_unit_price");
    expect(getDraftServicePriceEntryKind("agreed_unit_price", false)).toBe("agreed_unit_price");
    expect(isIncompleteTaxIncludedDraft({ taxIncludedMode: true, taxSelection: { type: "none" }, taxLabelSnapshot: null, taxRateSnapshot: null, priceEntry: { amount: "100" } })).toBe(true);
    expect(isIncompleteTaxIncludedDraft({ taxIncludedMode: true, taxSelection: { type: "rule" }, taxLabelSnapshot: "VAT", taxRateSnapshot: "10", priceEntry: { amount: "100" } })).toBe(false);
  });

  it("V4-D-10: uses one visible Price Adjustment and Tax selector per desktop row without the retired competing editor", () => {
    const createInvoice = patientDetailPage.slice(
      patientDetailPage.indexOf("function CreateInvoiceModal"),
      patientDetailPage.indexOf("function EditInvoiceModal"),
    );
    expect(createInvoice).toContain("Price adjustment");
    expect(createInvoice).toContain('value="agreed_unit_price">Agreed Unit Price</SelectItem>');
    expect(createInvoice).toContain('Custom — Included');
    expect(createInvoice).not.toContain("Adjust service price");
    expect(editInvoice).toContain("Price adjustment");
    expect(editInvoice).toContain('value="agreed_unit_price">Agreed Unit Price</SelectItem>');
    expect(editInvoice).toContain('Custom — Included');
    expect(editInvoice).not.toContain("Adjust service price");
  });

  it("V4-D-11: gives desktop Invoice Items a wide workspace and makes Pricing Currency explicit by pricing mode", () => {
    const createInvoice = patientDetailPage.slice(
      patientDetailPage.indexOf("function CreateInvoiceModal"),
      patientDetailPage.indexOf("function EditInvoiceModal"),
    );
    expect(createInvoice).toContain('lg:w-[94vw] max-w-[1680px]');
    expect(createInvoice).toContain('min-w-[1050px]');
    expect(createInvoice).toContain("Service / Description");
    expect(createInvoice).toContain("Pricing currency");
    expect(createInvoice).toContain('{currency} · Invoice');
    expect(createInvoice).toContain('linePreview.method === "agreed_unit_price" || linePreview.method === "final_line_total"');
    expect(editInvoice).toContain('xl:!max-w-[1760px]');
    expect(editInvoice).toContain('xl:grid grid-cols-[minmax(280px,2.5fr)_56px_132px_176px_124px_188px_140px_40px]');
    expect(editInvoice).not.toContain('sm:overflow-x-auto sm:pb-1');
    expect(editInvoice).toContain('{currency} · Invoice');
  });
});
