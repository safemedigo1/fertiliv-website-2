import { describe, expect, it } from "vitest";
import { computeServicePriceFxSnapshot, formatServicePriceFxStaffQuote, getAgreedUnitSourceLineAmount, isAgreedUnitServicePriceEntry, isTaxIncludedServicePriceEntry, normalizeServicePriceDecimalInput, servicePriceFxStaffQuoteToCanonical, startServicePriceInvoiceCurrencyRepricing, startServicePriceRepricing } from "../shared/servicePriceFx";

describe("Service Price FX X1 snapshots", () => {
  it("starts a different source-currency draft without re-labelling saved amount or Manual FX", () => {
    const saved = {
      currency: "TRY" as const,
      amount: "150000",
      kind: "tax_included_final_line_total" as const,
      fx: { source: "manual" as const, rateToInvoice: "0.02", note: "QA manual service price FX" },
    };
    const repricing = startServicePriceRepricing(saved, "USD");

    expect(repricing).toEqual({
      currency: "USD",
      amount: "",
      kind: "tax_included_final_line_total",
      fx: { source: "system" },
    });
    expect(saved).toEqual({
      currency: "TRY",
      amount: "150000",
      kind: "tax_included_final_line_total",
      fx: { source: "manual", rateToInvoice: "0.02", note: "QA manual service price FX" },
    });
  });

  it("also clears draft source facts on a source-currency to invoice-currency transition", () => {
    const repricing = startServicePriceRepricing({
      currency: "TRY",
      amount: "150000",
      kind: "tax_included_final_line_total",
      fx: { source: "manual", rateToInvoice: "0.02", note: "QA manual service price FX" },
    }, "EUR");

    expect(repricing.currency).toBe("EUR");
    expect(repricing.amount).toBe("");
    expect(repricing.fx).toEqual({ source: "system" });
    expect(isTaxIncludedServicePriceEntry(repricing)).toBe(true);
  });

  it("keeps the negotiated TRY source fact but invalidates USD-specific Manual FX when invoice currency changes to EUR", () => {
    const next = startServicePriceInvoiceCurrencyRepricing({
      currency: "TRY",
      amount: "150000",
      kind: "tax_included_final_line_total",
      fx: { source: "manual", rateToInvoice: "0.021052631579", note: "USD to TRY approved" },
    }, "EUR");

    expect(next).toEqual({
      currency: "TRY",
      amount: "150000",
      kind: "tax_included_final_line_total",
      fx: { source: "system" },
    });
    expect(() => computeServicePriceFxSnapshot({
      sourceCurrency: next.currency,
      invoiceCurrency: "EUR",
      sourceAmount: next.amount,
      source: "manual",
    })).toThrow("Source-to-TRY rate must be");
  });

  it("recomputes only from a new EUR-to-TRY Manual rate after an invoice-currency transition", () => {
    const next = startServicePriceInvoiceCurrencyRepricing({
      currency: "TRY",
      amount: "150000",
      kind: "tax_included_final_line_total",
      fx: { source: "manual", rateToInvoice: "0.021052631579", note: "USD to TRY approved" },
    }, "EUR");
    const snapshot = computeServicePriceFxSnapshot({
      sourceCurrency: next.currency,
      invoiceCurrency: "EUR",
      sourceAmount: next.amount,
      directRateToInvoice: servicePriceFxStaffQuoteToCanonical("50") ?? undefined,
      source: "manual",
    });
    expect(snapshot.convertedAmount).toBe("3000.00");
    expect(snapshot.rateToInvoice).toBe("0.020000000000");
  });

  it("does not derive an invoice amount until a new source amount is entered after repricing", () => {
    const repricing = startServicePriceRepricing({
      currency: "TRY",
      amount: "150000",
      kind: "final_line_total",
      fx: { source: "manual", rateToInvoice: "0.02", note: "Approved rate" },
    }, "AED");
    expect(() => computeServicePriceFxSnapshot({
      sourceCurrency: repricing.currency,
      invoiceCurrency: "USD",
      sourceAmount: repricing.amount,
      sourceToTryRate: "9.5",
      invoiceToTryRate: "37",
      source: "system",
    })).toThrow("Source price must be");
  });

  it("normalizes either supported desktop or iPhone decimal separator before Finance parsing", () => {
    expect(normalizeServicePriceDecimalInput("42")).toBe("42");
    expect(normalizeServicePriceDecimalInput("47.5")).toBe("47.5");
    expect(normalizeServicePriceDecimalInput("47,5")).toBe("47.5");
    expect(normalizeServicePriceDecimalInput("42.50")).toBe("42.50");
    expect(normalizeServicePriceDecimalInput("42,50")).toBe("42.50");
    expect(normalizeServicePriceDecimalInput("47,5964")).toBe("47.5964");
  });

  it("allows the controlled empty editing state and rejects non-numeric Finance input", () => {
    expect(normalizeServicePriceDecimalInput("")).toBe("");
    expect(normalizeServicePriceDecimalInput("0")).toBe("0");
    expect(normalizeServicePriceDecimalInput("42a")).toBeNull();
  });

  it("rejects malformed mixed decimal separators instead of guessing a financial rate", () => {
    expect(normalizeServicePriceDecimalInput("47,596.4")).toBeNull();
    expect(normalizeServicePriceDecimalInput("47.596,4")).toBeNull();
  });

  it("converts the staff-facing reciprocal quote to the unchanged canonical snapshot direction", () => {
    const canonical = servicePriceFxStaffQuoteToCanonical("47,5");
    expect(canonical).toBe("0.021052631579");
    expect(formatServicePriceFxStaffQuote(canonical ?? undefined)).toBe("47.5");
  });

  it("recognizes a saved Tax-Included entry kind without reinterpreting it as Before Tax", () => {
    expect(isTaxIncludedServicePriceEntry({ kind: "tax_included_final_line_total" })).toBe(true);
    expect(isTaxIncludedServicePriceEntry({ kind: "final_line_total" })).toBe(false);
  });

  it("calculates an agreed source unit amount across quantity before the FX snapshot", () => {
    const entry = { currency: "USD" as const, amount: "12.345", kind: "agreed_unit_price" as const, fx: { source: "manual" as const, rateToInvoice: "0.9" } };
    const sourceLineAmount = getAgreedUnitSourceLineAmount(entry, 3);
    expect(sourceLineAmount).toBe("37.04");
    expect(computeServicePriceFxSnapshot({ sourceCurrency: "USD", invoiceCurrency: "EUR", sourceAmount: sourceLineAmount, directRateToInvoice: "0.9", source: "manual" }).convertedAmount).toBe("33.34");
    expect(isAgreedUnitServicePriceEntry(entry)).toBe(true);
  });

  it("keeps Tax-Included agreed-unit as a per-unit source fact while final-line-total remains a whole-line fact", () => {
    const agreedIncluded = { currency: "EUR" as const, amount: "50", kind: "tax_included_agreed_unit_price" as const };
    const finalIncluded = { currency: "EUR" as const, amount: "50", kind: "tax_included_final_line_total" as const };
    expect(getAgreedUnitSourceLineAmount(agreedIncluded, 4)).toBe("200.00");
    expect(getAgreedUnitSourceLineAmount(finalIncluded, 4)).toBe("50");
    expect(isTaxIncludedServicePriceEntry(agreedIncluded)).toBe(true);
  });

  it("keeps an untouched saved entry intact when its source currency is not changed", () => {
    const saved = {
      currency: "TRY" as const,
      amount: "150000",
      kind: "tax_included_final_line_total" as const,
      fx: { source: "system" as const, rateToInvoice: "0.020000000000" },
    };
    expect(startServicePriceRepricing(saved, "TRY")).toBe(saved);
  });

  it("uses an untouched saved System direct snapshot rather than requiring live TRY rates", () => {
    const result = computeServicePriceFxSnapshot({
      sourceCurrency: "TRY",
      invoiceCurrency: "EUR",
      sourceAmount: "150000",
      directRateToInvoice: "0.02",
      source: "system",
    });
    expect(result).toMatchObject({ rateToInvoice: "0.020000000000", convertedAmount: "3000.00", source: "system" });
  });

  it("does not let a second source-currency transition revive an old amount or Manual FX", () => {
    const usdDraft = startServicePriceRepricing({
      currency: "TRY",
      amount: "150000",
      kind: "tax_included_final_line_total",
      fx: { source: "manual", rateToInvoice: "0.02", note: "Approved rate" },
    }, "USD");
    const gbpDraft = startServicePriceRepricing(usdDraft, "GBP");
    expect(gbpDraft).toEqual({
      currency: "GBP",
      amount: "",
      kind: "tax_included_final_line_total",
      fx: { source: "system" },
    });
  });

  it("keeps a Tax-Included source gross conversion exact before the Tax helper receives it", () => {
    const result = computeServicePriceFxSnapshot({
      sourceCurrency: "TRY",
      invoiceCurrency: "EUR",
      sourceAmount: "150000",
      directRateToInvoice: "0.02",
      source: "manual",
    });
    expect(result.convertedAmount).toBe("3000.00");
  });

  it("preserves same-currency negotiated source price without an FX source", () => {
    expect(computeServicePriceFxSnapshot({ sourceCurrency: "EUR", invoiceCurrency: "EUR", sourceAmount: "125.5", source: null }))
      .toEqual({ rateToInvoice: "1.000000000000", sourceToTryRate: null, invoiceToTryRate: null, source: null, convertedAmount: "125.50" });
  });

  it("converts a System source price using canonical TRY-per-unit rates", () => {
    const result = computeServicePriceFxSnapshot({ sourceCurrency: "USD", invoiceCurrency: "EUR", sourceAmount: "100", sourceToTryRate: "35", invoiceToTryRate: "38", source: "system" });
    expect(result.rateToInvoice).toBe("0.921052631579");
    expect(result.convertedAmount).toBe("92.11");
    expect(result.source).toBe("system");
  });

  it("uses the approved direct Manual source-to-invoice rate", () => {
    const result = computeServicePriceFxSnapshot({ sourceCurrency: "USD", invoiceCurrency: "EUR", sourceAmount: "100", directRateToInvoice: "0.93", source: "manual" });
    expect(result).toMatchObject({ rateToInvoice: "0.930000000000", convertedAmount: "93.00", source: "manual" });
  });

  it("rounds converted source prices half-up to the invoice precision", () => {
    expect(computeServicePriceFxSnapshot({ sourceCurrency: "USD", invoiceCurrency: "EUR", sourceAmount: "1", directRateToInvoice: "1.005", source: "manual" }).convertedAmount).toBe("1.01");
  });

  it("keeps the direct rate at twelve decimal places", () => {
    expect(computeServicePriceFxSnapshot({ sourceCurrency: "GBP", invoiceCurrency: "USD", sourceAmount: "1", directRateToInvoice: "1.2345678912349", source: "manual" }).rateToInvoice).toBe("1.234567891235");
  });

  it("supports TRY as a source currency under System FX", () => {
    const result = computeServicePriceFxSnapshot({ sourceCurrency: "TRY", invoiceCurrency: "USD", sourceAmount: "3500", sourceToTryRate: "1", invoiceToTryRate: "35", source: "system" });
    expect(result).toMatchObject({ convertedAmount: "100.00", rateToInvoice: "0.028571428571" });
  });

  it("supports TRY as an invoice currency under System FX", () => {
    const result = computeServicePriceFxSnapshot({ sourceCurrency: "EUR", invoiceCurrency: "TRY", sourceAmount: "100", sourceToTryRate: "38", invoiceToTryRate: "1", source: "system" });
    expect(result).toMatchObject({ convertedAmount: "3800.00", rateToInvoice: "38.000000000000" });
  });

  it("rejects zero, negative, and non-finite source amounts", () => {
    for (const sourceAmount of ["0", "-1", "not-a-number"]) {
      expect(() => computeServicePriceFxSnapshot({ sourceCurrency: "USD", invoiceCurrency: "EUR", sourceAmount, directRateToInvoice: "1", source: "manual" })).toThrow("Source price must be");
    }
  });

  it("rejects invalid manual and missing System conversion rates", () => {
    expect(() => computeServicePriceFxSnapshot({ sourceCurrency: "USD", invoiceCurrency: "EUR", sourceAmount: "1", directRateToInvoice: "0", source: "manual" })).toThrow("Source-to-invoice rate must be greater than zero");
    expect(() => computeServicePriceFxSnapshot({ sourceCurrency: "USD", invoiceCurrency: "EUR", sourceAmount: "1", source: "system" })).toThrow("Source-to-TRY rate must be");
  });

  it("does not treat a source-price snapshot as a payment FX snapshot", () => {
    const result = computeServicePriceFxSnapshot({ sourceCurrency: "AED", invoiceCurrency: "USD", sourceAmount: "367.25", directRateToInvoice: "0.272294", source: "manual" });
    expect(result).toMatchObject({ source: "manual", convertedAmount: "100.00" });
    expect(result).not.toHaveProperty("settledAmount");
  });

  it.each([
    ["USD", "EUR", "10", "35", "38", "9.21"],
    ["EUR", "USD", "10", "38", "35", "10.86"],
    ["GBP", "USD", "10", "44", "35", "12.57"],
    ["SAR", "USD", "100", "9.3", "35", "26.57"],
    ["AED", "EUR", "100", "9.5", "38", "25.00"],
  ])("converts %s source facts into %s with System FX", (sourceCurrency, invoiceCurrency, sourceAmount, sourceToTryRate, invoiceToTryRate, expected) => {
    expect(computeServicePriceFxSnapshot({ sourceCurrency, invoiceCurrency, sourceAmount, sourceToTryRate, invoiceToTryRate, source: "system" }).convertedAmount).toBe(expected);
  });

  it.each([
    ["1", "0.333333333333", "0.33"],
    ["2.5", "0.4", "1.00"],
    ["99.99", "1.125", "112.49"],
    ["100", "1.000001", "100.00"],
  ])("persists an exact Manual rate direction for source amount %s", (sourceAmount, directRateToInvoice, expected) => {
    const result = computeServicePriceFxSnapshot({ sourceCurrency: "USD", invoiceCurrency: "EUR", sourceAmount, directRateToInvoice, source: "manual" });
    expect(result.convertedAmount).toBe(expected);
    expect(result.rateToInvoice).toHaveLength(14);
  });

  it("does not require an FX note for same-currency negotiated pricing", () => {
    expect(computeServicePriceFxSnapshot({ sourceCurrency: "TRY", invoiceCurrency: "TRY", sourceAmount: "2700.01", source: null }))
      .toMatchObject({ convertedAmount: "2700.01", source: null });
  });

  it("rounds a source amount itself to canonical invoice precision in a same-currency line", () => {
    expect(computeServicePriceFxSnapshot({ sourceCurrency: "EUR", invoiceCurrency: "EUR", sourceAmount: "10.005", source: null }).convertedAmount).toBe("10.01");
  });
});
