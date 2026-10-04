import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  TAX_MODEL_VERSION,
  METHOD_NEUTRAL_SETTLEMENT_MODEL_VERSION,
  allocateServiceAmountProportionally,
  calculateTaxIncludedLine,
  computeServiceTaxInvoice,
  previewServiceTaxInvoice,
} from "../shared/serviceTax";

describe("Service Tax foundation", () => {
  it("retains distinct NULL and explicit 0% snapshots while both calculate zero Tax", () => {
    const result = computeServiceTaxInvoice({
      lines: [
        { key: "no-tax", totalPrice: "100.00", tax: { taxRuleId: null, taxLabelSnapshot: null, taxRateSnapshot: null } },
        { key: "zero-tax", totalPrice: "100.00", tax: { taxRuleId: 10, taxLabelSnapshot: "Zero-rated", taxRateSnapshot: "0.0000" } },
      ],
    });

    expect(result.totalTaxAmount).toBe("0.00");
    expect(result.grandTotal).toBe("200.00");
    expect(result.lines[0].tax).toEqual({ taxRuleId: null, taxLabelSnapshot: null, taxRateSnapshot: null });
    expect(result.lines[1].tax).toEqual({ taxRuleId: 10, taxLabelSnapshot: "Zero-rated", taxRateSnapshot: "0.0000" });
  });

  it("calculates Tax after V4 line totals and after proportional invoice-wide discount allocation", () => {
    const result = computeServiceTaxInvoice({
      lines: [
        { key: "medication", totalPrice: "100.00", tax: { taxRuleId: 1, taxLabelSnapshot: "Medication", taxRateSnapshot: "1.0000" } },
        { key: "procedure", totalPrice: "200.00", tax: { taxRuleId: 2, taxLabelSnapshot: "Procedure", taxRateSnapshot: "10.0000" } },
      ],
      invoiceWideDiscountAmount: "30.00",
    });

    expect(result.serviceSubtotalBeforeTax).toBe("300.00");
    expect(result.effectiveServiceSubtotal).toBe("270.00");
    expect(result.lines.map(line => line.effectiveTaxableBase)).toEqual(["90.00", "180.00"]);
    expect(result.lines.map(line => line.taxAmount)).toEqual(["0.90", "18.00"]);
    expect(result.totalTaxAmount).toBe("18.90");
    expect(result.grandTotal).toBe("288.90");
  });

  it("treats Final Agreed Service Price as pre-Tax and allocates it proportionally", () => {
    const result = computeServiceTaxInvoice({
      lines: [
        { key: "one", totalPrice: "100.00", tax: { taxRuleId: 1, taxLabelSnapshot: "1%", taxRateSnapshot: "1.0000" } },
        { key: "two", totalPrice: "200.00", tax: { taxRuleId: 2, taxLabelSnapshot: "10%", taxRateSnapshot: "10.0000" } },
      ],
      finalAgreedServiceAmount: "150.00",
    });

    expect(result.effectiveServiceSubtotal).toBe("150.00");
    expect(result.invoiceWideDiscountAmount).toBe("150.00");
    expect(result.lines.map(line => line.effectiveTaxableBase)).toEqual(["50.00", "100.00"]);
    expect(result.lines.map(line => line.taxAmount)).toEqual(["0.50", "10.00"]);
    expect(result.grandTotal).toBe("160.50");
  });

  it("assigns residual cents deterministically by stable line order", () => {
    const allocated = allocateServiceAmountProportionally([
      { key: "first", totalPrice: "1.00" },
      { key: "second", totalPrice: "1.00" },
      { key: "third", totalPrice: "1.00" },
    ], "1.00");

    expect([...allocated.entries()]).toEqual([
      ["first", "0.34"],
      ["second", "0.33"],
      ["third", "0.33"],
    ]);
  });

  it("exposes explicit forward-only model versions", () => {
    expect(TAX_MODEL_VERSION).toBe("line_tax_v1");
    expect(METHOD_NEUTRAL_SETTLEMENT_MODEL_VERSION).toBe("method_neutral_v2");
  });

  it("integrates new-model Tax snapshots through create, edit, and invoice PDF paths", () => {
    const root = path.resolve(__dirname, "..");
    const routers = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");
    const db = fs.readFileSync(path.join(root, "server/db.ts"), "utf8");
    const pdf = fs.readFileSync(path.join(root, "server/pdfService.ts"), "utf8");
    expect(routers).toContain("taxModelVersion: TAX_MODEL_VERSION");
    expect(routers).toContain("taxComputed.grandTotal");
    expect(db).toContain("effectiveTaxableBase: item.effectiveTaxableBase");
    expect(db).toContain("Tax rule cannot be changed after payment history has been recorded.");
    expect(pdf).toContain("${item.taxLabelSnapshot}${rateLabel}:");
  });

  it("renders tax-inclusive summaries and per-line Tax details only for the new model", () => {
    const root = path.resolve(__dirname, "..");
    const patientDetail = fs.readFileSync(path.join(root, "client/src/pages/PatientDetailPage.tsx"), "utf8");

    expect(patientDetail).toContain("Line Total incl. Tax");
    expect(patientDetail).toContain("Service Amount after Invoice Adjustment");
    expect(patientDetail).toContain('invoiceTotalWithTax == null ? "Complete Tax details"');
    expect(patientDetail).toContain("isLegacySettlementPresentation(invoice.settlementModelVersion)");
    expect(patientDetail).toContain("const savedTaxPreview = useMemo(() =>");
    expect(patientDetail).toContain("const editTaxPreview = editHasUnresolvedSourcePrice ? null : (savedTaxPreview ?? calculatedTaxPreviewState.result);");
    expect(patientDetail).toContain("deriveInvoiceDualBalancePresentation({");
    expect(patientDetail).toContain("Saved Tax facts remain displayed for this invoice");
    expect(patientDetail).toContain("getInvoiceLineTaxControlValue");
    expect(patientDetail).toContain("Custom Tax — Included");
    expect(patientDetail).toContain("Service Total");
    expect(patientDetail).toContain("Service Tax");
    expect(patientDetail).not.toContain("previewInvoicePayments");
  });

  it("projects persisted Tax and settlement model markers into the patient invoice list used by Edit", () => {
    const root = path.resolve(__dirname, "..");
    const db = fs.readFileSync(path.join(root, "server/db.ts"), "utf8");
    const getInvoices = db.slice(db.indexOf("export async function getInvoices("), db.indexOf("export type InvoiceListStatus"));

    expect(getInvoices).toContain("taxModelVersion: invoices.taxModelVersion");
    expect(getInvoices).toContain("settlementModelVersion: invoices.settlementModelVersion");
  });

  it("keeps INV-00052-style saved Tax-v2 facts exact when rehydrated", () => {
    const result = computeServiceTaxInvoice({
      lines: [{
        key: "saved-line",
        totalPrice: "3180.00",
        tax: { taxRuleId: 5, taxLabelSnapshot: "23", taxRateSnapshot: "23.0000" },
      }],
    });

    expect(result.effectiveServiceSubtotal).toBe("3180.00");
    expect(result.lines[0]).toMatchObject({ effectiveTaxableBase: "3180.00", taxAmount: "731.40", totalWithTax: "3911.40" });
    expect(result.totalTaxAmount).toBe("731.40");
    expect(result.grandTotal).toBe("3911.40");
  });

  it("uses the shared settlement rule for v2 without legacy Card or Bank division", async () => {
    const { computePaymentSettlement } = await import("../shared/invoicePricing");

    for (const method of ["cash", "credit_card", "bank_transfer"]) {
      expect(computePaymentSettlement({
        amount: "3911.40",
        amountInInvoiceCurrency: "3911.40",
        method,
        pricingMode: "discount",
        adjustmentRateSnapshot: "23.00",
        settlementModelVersion: METHOD_NEUTRAL_SETTLEMENT_MODEL_VERSION,
      }).settledAmount).toBe("3911.40");
    }
  });

  it("retains legacy Card settlement behavior when no settlement model marker exists", async () => {
    const { computePaymentSettlement } = await import("../shared/invoicePricing");

    expect(computePaymentSettlement({
      amount: "123.00",
      amountInInvoiceCurrency: "123.00",
      method: "credit_card",
      pricingMode: "discount",
      adjustmentRateSnapshot: "23.00",
      settlementModelVersion: null,
    }).settledAmount).toBe("100.00");
  });

  it("derives a Tax-Included final line price without changing its requested gross", () => {
    const line = calculateTaxIncludedLine({ grossAmount: "3132.00", taxRatePercent: "23.0000" });
    expect(line).toEqual({ taxableBase: "2546.34", taxAmount: "585.66", totalWithTax: "3132.00" });

    const invoice = computeServiceTaxInvoice({
      lines: [{
        key: "included",
        totalPrice: line.taxableBase,
        taxIncludedGross: line.totalWithTax,
        tax: { taxRuleId: 7, taxLabelSnapshot: "VAT", taxRateSnapshot: "23.0000" },
      }],
    });
    expect(invoice).toMatchObject({ effectiveServiceSubtotal: "2546.34", totalTaxAmount: "585.66", grandTotal: "3132.00" });
    expect(invoice.lines[0]).toMatchObject({ effectiveTaxableBase: "2546.34", taxAmount: "585.66", totalWithTax: "3132.00" });
  });

  it("keeps Custom Tax 0% distinct from No Tax in persisted facts and document presentation", () => {
    const result = computeServiceTaxInvoice({
      lines: [
        { key: "none", totalPrice: "100.00", tax: { taxRuleId: null, taxLabelSnapshot: null, taxRateSnapshot: null } },
        { key: "custom-zero", totalPrice: "100.00", tax: { taxRuleId: null, taxLabelSnapshot: "Custom Tax", taxRateSnapshot: "0.0000" } },
      ],
    });
    expect(result.lines[0].tax).toMatchObject({ taxLabelSnapshot: null, taxRateSnapshot: null });
    expect(result.lines[1].tax).toMatchObject({ taxLabelSnapshot: "Custom Tax", taxRateSnapshot: "0.0000", taxRuleId: null });
    expect(result.grandTotal).toBe("200.00");

    const root = path.resolve(__dirname, "..");
    const pdf = fs.readFileSync(path.join(root, "server/pdfService.ts"), "utf8");
    expect(pdf).toContain('item.taxLabelSnapshot === "Custom Tax"');
  });

  it("rejects Tax-Included entry together with invoice-wide discount or agreed pricing", () => {
    const includedLine = {
      key: "included",
      totalPrice: "100.00",
      taxIncludedGross: "123.00",
      tax: { taxRuleId: 7, taxLabelSnapshot: "VAT", taxRateSnapshot: "23.0000" },
    };
    expect(() => computeServiceTaxInvoice({ lines: [includedLine], invoiceWideDiscountAmount: "1.00" })).toThrow("Tax-Included line pricing cannot be combined");
    expect(() => computeServiceTaxInvoice({ lines: [includedLine], finalAgreedServiceAmount: "99.00" })).toThrow("Tax-Included line pricing cannot be combined");
  });

  it("returns a safe inline preview error for incomplete Tax-Included drafts without weakening strict Tax calculation", () => {
    const incompleteDraft = {
      key: "draft-included",
      totalPrice: "100.00",
      taxIncludedGross: "123.00",
      tax: { taxRuleId: null, taxLabelSnapshot: null, taxRateSnapshot: null },
    };
    const preview = previewServiceTaxInvoice({ lines: [incompleteDraft] });
    expect(preview.result).toBeNull();
    expect(preview.error).toMatch(/tax/i);
    expect(() => computeServiceTaxInvoice({ lines: [incompleteDraft] })).toThrow();
  });

  it("uses the server-side Tax selection resolver and preserves existing snapshots on Edit", () => {
    const root = path.resolve(__dirname, "..");
    const db = fs.readFileSync(path.join(root, "server/db.ts"), "utf8");
    const routers = fs.readFileSync(path.join(root, "server/routers.ts"), "utf8");
    const patientDetail = fs.readFileSync(path.join(root, "client/src/pages/PatientDetailPage.tsx"), "utf8");

    expect(db).toContain("export async function resolveTaxForNewInvoiceLines");
    expect(db).toContain("service?.taxOverrideMode === \"rule\"");
    expect(db).toContain("categoryDefaultRuleId");
    expect(routers).toContain("explicitLineTaxSelection: item.taxSelection ?? legacyTaxSelectionToExplicit(item)");
    expect(routers).toContain("if (existingItem && explicitLineTaxSelection === undefined) return [];");
    expect(routers).toContain("canonicalizeTaxIncludedLine");
    expect(patientDetail).toContain("Tax-Included line pricing can't be combined with invoice-wide pricing adjustments.");
  });
});
