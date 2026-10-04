import type { ServicePriceEntry } from "./servicePriceFx";

export type InvoiceLineDraftPricingMethod = "none" | "discount_percent" | "final_line_total" | "agreed_unit_price";

export function getDraftServicePriceEntryKind(
  method: InvoiceLineDraftPricingMethod,
  taxIncluded: boolean,
): ServicePriceEntry["kind"] | null {
  if (method === "agreed_unit_price") {
    return taxIncluded ? "tax_included_agreed_unit_price" : "agreed_unit_price";
  }
  if (method === "final_line_total") {
    return taxIncluded ? "tax_included_final_line_total" : "final_line_total";
  }
  return null;
}

export function isIncompleteTaxIncludedDraft(input: {
  taxIncludedMode?: boolean;
  taxLabelSnapshot?: string | null;
  taxRateSnapshot?: string | number | null;
  taxSelection?: { type: "none" | "rule" | "custom" } | null;
  priceEntry?: Pick<ServicePriceEntry, "amount"> | null;
}): boolean {
  if (!input.taxIncludedMode) return false;
  if (input.taxSelection?.type === "none") return true;
  if (!input.taxLabelSnapshot || input.taxRateSnapshot == null) return true;
  return !String(input.priceEntry?.amount ?? "").trim();
}

export type InvoiceLineTaxControlValue = "none" | "custom:added" | "custom:included" | `rule:${number}:added` | `rule:${number}:included`;

/**
 * A single UI-facing Tax selector value.  It deliberately preserves `none`
 * separately from Custom 0% and from an active configured Tax Rule.
 */
export function getInvoiceLineTaxControlValue(input: {
  taxSelection?: { type: "none" | "rule" | "custom"; taxRuleId?: number; ratePercent?: string } | null;
  taxIncludedMode?: boolean | null;
  taxRuleId?: number | null;
}): InvoiceLineTaxControlValue {
  const treatment = input.taxIncludedMode ? "included" : "added";
  if (input.taxSelection?.type === "custom") return `custom:${treatment}`;
  const ruleId = input.taxSelection?.type === "rule" ? input.taxSelection.taxRuleId : input.taxRuleId;
  if (ruleId == null) return "none";
  return `rule:${ruleId}:${treatment}`;
}

/** Parses the selector back to canonical coordinator input; it has no pricing or Tax calculation authority. */
export function parseInvoiceLineTaxControlValue(
  value: string,
  currentCustomRate = "0",
): { taxSelection: { type: "none" } | { type: "custom"; ratePercent: string } | { type: "rule"; taxRuleId: number }; taxIncludedMode: boolean } | null {
  if (value === "none") return { taxSelection: { type: "none" }, taxIncludedMode: false };
  const match = /^(custom|rule:(\d+)):(added|included)$/.exec(value);
  if (!match) return null;
  const taxIncludedMode = match[3] === "included";
  if (match[1] === "custom") return { taxSelection: { type: "custom", ratePercent: currentCustomRate }, taxIncludedMode };
  const taxRuleId = Number(match[2]);
  return Number.isInteger(taxRuleId) && taxRuleId > 0
    ? { taxSelection: { type: "rule", taxRuleId }, taxIncludedMode }
    : null;
}
