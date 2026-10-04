import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Service Price FX X1 contracts", () => {
  it("adds only nullable source-price snapshot columns to invoice items", () => {
    const schema = read("drizzle/schema.ts");
    const migration = read("drizzle/0090_finance_service_price_fx_snapshots.sql");
    expect(schema).toContain('priceEntryCurrency: pg_priceEntryCurrency("priceEntryCurrency"');
    expect(schema).toContain('priceFxRateToInvoice: numeric("priceFxRateToInvoice"');
    expect(migration).toContain("ALTER TABLE `invoice_items`");
    expect(migration).toContain("ADD COLUMN `priceEntryCurrency`");
    expect(migration).not.toContain("UPDATE `invoice_items`");
  });

  it("keeps source-price conversion separate from payment FX", () => {
    const helper = read("shared/servicePriceFx.ts");
    expect(helper).toContain("intentionally separate from payment snapshots");
    expect(helper).not.toContain("settledAmount");
  });

  it("uses the same canonicalization entry point for Create and initial-payment preview", () => {
    const routers = read("server/routers.ts");
    const occurrences = routers.match(/canonicalizeServicePriceEntry\(/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
    expect(routers).toContain("priceEntry: servicePriceEntrySchema.optional()");
  });

  it("converts source price before Tax-Included reverse-tax calculation", () => {
    const routers = read("server/routers.ts");
    expect(routers).toContain("canonicalizeServicePriceEntry(item,");
    expect(routers).toContain("return canonicalizeTaxIncludedLine({");
  });

  it("preserves existing source snapshots when Edit has no explicit new entry", () => {
    const routers = read("server/routers.ts");
    const db = read("server/db.ts");
    expect(routers).toContain("priceEntryCurrency: existingItem?.priceEntryCurrency ?? null");
    expect(db).toContain("item.priceEntryCurrency === undefined ? existing?.priceEntryCurrency");
  });

  it("blocks invoice-currency change after a negotiated source-price snapshot exists", () => {
    const db = read("server/db.ts");
    expect(db).toContain("isNotNull(invoiceItems.priceEntryCurrency)");
    expect(db).toContain("Invoice currency cannot be changed after negotiated source-price facts have been saved");
  });

  it("rehydrates source-price snapshot in Edit and does not reconvert it through TRY", () => {
    const page = read("client/src/pages/PatientDetailPage.tsx");
    expect(page).toContain("priceEntry: i.priceEntryCurrency && i.priceEntryAmount && i.priceEntryKind");
    expect(page).toContain("taxIncludedMode: i.taxIncludedMode === true || isTaxIncludedServicePriceEntry");
    expect(page).toContain("if (item.priceEntry) return item;");
    expect(page).toContain("getEditInvoiceCurrencyLine");
  });

  it("refreshes invoice-item cache after save before the next Edit hydration", () => {
    const page = read("client/src/pages/PatientDetailPage.tsx");
    expect(page).toContain("onSuccess: async () => {");
    expect(page).toContain("await utils.finance.invoiceItems.invalidate({ invoiceId: invoice.id });");
    expect(page).toContain("the saved immutable Service Price FX snapshot can be read back");
  });

  it("makes an Edit source-currency change an explicit blank repricing draft", () => {
    const page = read("client/src/pages/PatientDetailPage.tsx");
    const helper = read("shared/servicePriceFx.ts");
    expect(page).toContain("startServicePriceRepricing(current, patch.currency)");
    expect(page).toContain("changeCreatePriceEntryCurrency");
    expect(page).toContain("startServicePriceRepricing(item.priceEntry, nextCurrency)");
    expect(helper).toContain("the prior amount and FX must not");
    expect(helper).toContain('amount: ""');
    expect(helper).toContain('fx: { source: "system" }');
  });

  it("makes an Edit invoice-currency change preserve source facts but invalidate prior pair-specific Manual FX", () => {
    const page = read("client/src/pages/PatientDetailPage.tsx");
    const helper = read("shared/servicePriceFx.ts");

    expect(helper).toContain("startServicePriceInvoiceCurrencyRepricing");
    expect(page).toContain("startServicePriceInvoiceCurrencyRepricing(item.priceEntry, newCur");
    expect(page).toContain("setInvoiceCurrencyRepricingPending(needsFreshSystemQuote ? newCur : null)");
    expect(page).toContain("Invoice totals are unavailable until each negotiated source price has a valid FX rate");
  });

  it("accepts a locale-safe direct source-to-invoice Manual FX rate", () => {
    const page = read("client/src/pages/PatientDetailPage.tsx");
    const helper = read("shared/servicePriceFx.ts");
    expect(page).toContain('inputMode="decimal"');
    expect(page).toContain("updateCreateManualServiceFxInput");
    expect(page).toContain("updateEditManualServiceFxInput");
    expect(page).toContain("1 {item.priceEntry.currency} = X {currency}");
    expect(helper).toContain("normalizeServicePriceDecimalInput");
    expect(helper).toContain("formatServicePriceFxDirectRate");
  });

  it("discloses source-price facts only as supporting rows in Invoice PDF and email", () => {
    const pdf = read("server/pdfService.ts");
    const email = read("server/emailService.ts");
    expect(pdf).toContain("const isAgreedUnitSourcePrice");
    expect(pdf).toContain('"Agreed unit price"');
    expect(pdf).toContain("hasSourcePriceDetails");
    expect(email).toContain("const sourceLabel = isAgreedUnit");
    expect(email).toContain('item.priceFxSource === "manual" ? copy.manualFx : copy.systemFx');
  });

  it("discloses Tax-Included source price as agreed gross rather than taxable base", () => {
    const pdf = read("server/pdfService.ts");
    expect(pdf).toContain('item.priceEntryKind === "tax_included_final_line_total"');
    expect(pdf).toContain("const canonicalGross");
    expect(pdf).toContain('"Agreed gross unit price"');
    expect(pdf).toContain("fmtFxRate(item.priceFxRateToInvoice)");
  });
});
