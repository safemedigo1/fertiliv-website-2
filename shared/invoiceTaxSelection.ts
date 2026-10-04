import Decimal from "decimal.js";

const TaxSelectionDecimal = Decimal.clone({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export const CUSTOM_TAX_LABEL = "Custom Tax";

export type InvoiceLineTaxSelection =
  | { type: "none" }
  | { type: "rule"; taxRuleId: number }
  | { type: "custom"; ratePercent: string };

export type ServiceTaxOverrideMode = "inherit" | "rule" | "no_tax";

export type TaxRuleForSelection = {
  id: number;
  label: string;
  ratePercent: string | number;
  isActive?: boolean;
};

export type ServiceTaxPolicy = {
  taxOverrideMode?: ServiceTaxOverrideMode | null;
  taxOverrideRuleId?: number | null;
};

export type ResolvedInvoiceLineTax = {
  taxRuleId: number | null;
  taxLabelSnapshot: string | null;
  taxRateSnapshot: string | null;
  source: "explicit" | "service_override" | "category_default" | "none";
};

export const noTaxSelectionSnapshot = (): ResolvedInvoiceLineTax => ({
  taxRuleId: null,
  taxLabelSnapshot: null,
  taxRateSnapshot: null,
  source: "none",
});

/**
 * Normalizes a user-entered Custom Tax rate without relying on binary
 * floating-point. The persisted Tax snapshot schema allows 0–100 with 4dp.
 */
export function normalizeTaxRatePercent(value: string | number): string {
  const raw = String(value ?? "").trim();
  if (!/^\d{1,3}(?:\.\d{1,4})?$/.test(raw)) {
    throw new Error("Custom Tax must be a percentage from 0 to 100 with up to 4 decimal places.");
  }
  const rate = new TaxSelectionDecimal(raw);
  if (!rate.isFinite() || rate.lt(0) || rate.gt(100)) {
    throw new Error("Custom Tax must be a percentage from 0 to 100.");
  }
  return rate.toDecimalPlaces(4, TaxSelectionDecimal.ROUND_HALF_UP).toFixed(4);
}

function snapshotFromRule(rule: TaxRuleForSelection, source: ResolvedInvoiceLineTax["source"]): ResolvedInvoiceLineTax {
  if (!Number.isInteger(rule.id) || rule.id <= 0 || rule.isActive === false) {
    throw new Error("Choose an active Tax Rule for future invoice use.");
  }
  return {
    taxRuleId: rule.id,
    taxLabelSnapshot: rule.label,
    taxRateSnapshot: normalizeTaxRatePercent(rule.ratePercent),
    source,
  };
}

/**
 * The one precedence function for a *new* invoice line. Existing saved lines
 * intentionally bypass this function and retain their immutable snapshots.
 */
export function resolveTaxForNewInvoiceLine(input: {
  explicitLineTaxSelection?: InvoiceLineTaxSelection | null;
  servicePolicy?: ServiceTaxPolicy | null;
  categoryDefaultRule?: TaxRuleForSelection | null;
  activeRulesById: Map<number, TaxRuleForSelection>;
}): ResolvedInvoiceLineTax {
  const explicit = input.explicitLineTaxSelection;
  if (explicit) {
    if (explicit.type === "none") return { ...noTaxSelectionSnapshot(), source: "explicit" };
    if (explicit.type === "custom") {
      return {
        taxRuleId: null,
        taxLabelSnapshot: CUSTOM_TAX_LABEL,
        taxRateSnapshot: normalizeTaxRatePercent(explicit.ratePercent),
        source: "explicit",
      };
    }
    const rule = input.activeRulesById.get(explicit.taxRuleId);
    if (!rule) throw new Error("Choose an active Tax Rule for the invoice line.");
    return snapshotFromRule(rule, "explicit");
  }

  const mode = input.servicePolicy?.taxOverrideMode ?? "inherit";
  if (mode === "no_tax") return { ...noTaxSelectionSnapshot(), source: "service_override" };
  if (mode === "rule") {
    const ruleId = input.servicePolicy?.taxOverrideRuleId;
    const rule = ruleId == null ? undefined : input.activeRulesById.get(ruleId);
    if (!rule) throw new Error("This Service has an unavailable Tax Rule. Update the Service Tax Treatment before creating an invoice.");
    return snapshotFromRule(rule, "service_override");
  }
  if (mode !== "inherit") throw new Error("This Service has an invalid Tax Treatment.");

  const categoryDefaultRule = input.categoryDefaultRule;
  if (categoryDefaultRule && categoryDefaultRule.isActive !== false) {
    return snapshotFromRule(categoryDefaultRule, "category_default");
  }
  return noTaxSelectionSnapshot();
}
