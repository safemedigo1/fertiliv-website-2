/**
 * artCycleHelpers.ts
 *
 * Pure, testable helpers for ART cycle validation and calculation.
 * No React, no side-effects, no imports from UI components.
 *
 * Canonical field rules (from approved spec):
 *  - eggsCollected       = Total Oocytes Retrieved (do NOT create oocytesRetrieved)
 *  - embryosFertilized   = 2PN — Normally Fertilized (do NOT create pn2)
 *  - oocytesInseminatedOrInjected = fertilization denominator
 *
 * Null/undefined semantics:
 *  - undefined  → legacy field not present
 *  - null       → not reported
 *  - 0          → explicitly reported as zero
 *  - positive   → reported count
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type NumericField = number | null | undefined;

export interface OocyteMaturityFields {
  eggsCollected?: number | "I don't know" | null;
  miiOocytes?: NumericField;
  miOocytes?: NumericField;
  gvOocytes?: NumericField;
  degeneratedOocytes?: NumericField;
}

export interface FertilizationFields {
  oocytesInseminatedOrInjected?: NumericField;
  embryosFertilized?: number | "I don't know" | null; // canonical 2PN
  pn0?: NumericField;
  pn1?: NumericField;
  pn3plus?: NumericField;
}

export type ValidationSeverity = "error" | "warning" | "ok";

export interface ClassificationSummary {
  classified: number;
  denominator: number;
  remaining: number;
  severity: ValidationSeverity;
  message: string | null;
}

export interface CycleValidationResult {
  isBlocking: boolean;
  errors: string[];
  warnings: string[];
}

// ─── Numeric helpers ──────────────────────────────────────────────────────────

/** Returns the numeric value if it is a finite integer ≥ 0, otherwise null. */
export function toNumeric(val: NumericField | "I don't know"): number | null {
  if (val === null || val === undefined || val === "I don't know") return null;
  if (typeof val === "number" && Number.isFinite(val) && val >= 0) return val;
  return null;
}

/** Sum only the fields that have a valid numeric value (null/undefined are skipped). */
export function sumNumericFields(...fields: (NumericField | "I don't know")[]): number {
  return fields.reduce<number>((acc, f) => {
    const n = toNumeric(f as NumericField);
    return n !== null ? acc + n : acc;
  }, 0);
}

/** Returns true if at least one field has a valid numeric value. */
export function hasAnyNumeric(...fields: (NumericField | "I don't know")[]): boolean {
  return fields.some((f) => toNumeric(f as NumericField) !== null);
}

// ─── Oocyte Maturity ─────────────────────────────────────────────────────────

/**
 * Compute the oocyte maturity classification summary.
 * Returns classified count, denominator, remaining, severity, and message.
 */
export function computeOocyteMaturitySummary(
  fields: OocyteMaturityFields
): ClassificationSummary {
  const total = toNumeric(fields.eggsCollected as NumericField);
  const classified = sumNumericFields(
    fields.miiOocytes,
    fields.miOocytes,
    fields.gvOocytes,
    fields.degeneratedOocytes
  );

  if (total === null) {
    return {
      classified,
      denominator: 0,
      remaining: 0,
      severity: "ok",
      message: null,
    };
  }

  const remaining = total - classified;

  if (classified > total) {
    return {
      classified,
      denominator: total,
      remaining,
      severity: "error",
      message: `Classified total (${classified}) exceeds Total Oocytes Retrieved (${total}). Please correct the values.`,
    };
  }

  if (remaining > 0 && hasAnyNumeric(fields.miiOocytes, fields.miOocytes, fields.gvOocytes, fields.degeneratedOocytes)) {
    return {
      classified,
      denominator: total,
      remaining,
      severity: "warning",
      message: `${remaining} oocyte${remaining === 1 ? "" : "s"} not classified / not reported`,
    };
  }

  return {
    classified,
    denominator: total,
    remaining,
    severity: "ok",
    message: remaining > 0 ? null : null,
  };
}

/**
 * Validate oocyte maturity fields.
 * Returns blocking errors and non-blocking warnings.
 */
export function validateOocyteMaturity(
  fields: OocyteMaturityFields,
  label = "First collection"
): CycleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const total = toNumeric(fields.eggsCollected as NumericField);

  const maturityFields: [string, NumericField][] = [
    ["MII Oocytes", fields.miiOocytes],
    ["MI Oocytes", fields.miOocytes],
    ["GV Oocytes", fields.gvOocytes],
    ["Degenerated / Atretic Oocytes", fields.degeneratedOocytes],
  ];

  for (const [name, val] of maturityFields) {
    const n = toNumeric(val);
    if (n === null) continue;
    if (n < 0) {
      errors.push(`${label}: ${name} cannot be negative.`);
    } else if (total !== null && n > total) {
      errors.push(`${label}: ${name} (${n}) cannot exceed Total Oocytes Retrieved (${total}).`);
    }
  }

  const summary = computeOocyteMaturitySummary(fields);
  if (summary.severity === "error") {
    errors.push(`${label}: ${summary.message!}`);
  } else if (summary.severity === "warning" && summary.message) {
    warnings.push(`${label}: ${summary.message}`);
  }

  return { isBlocking: errors.length > 0, errors, warnings };
}

// ─── Fertilization ────────────────────────────────────────────────────────────

/**
 * Compute the fertilization classification summary.
 * embryosFertilized is used as 2PN (canonical — do NOT create pn2).
 */
export function computeFertilizationSummary(
  fields: FertilizationFields
): ClassificationSummary {
  const denominator = toNumeric(fields.oocytesInseminatedOrInjected);
  const classified = sumNumericFields(
    fields.pn0,
    fields.pn1,
    fields.embryosFertilized as NumericField,
    fields.pn3plus
  );

  if (denominator === null) {
    return {
      classified,
      denominator: 0,
      remaining: 0,
      severity: "ok",
      message: null,
    };
  }

  const remaining = denominator - classified;

  if (classified > denominator) {
    return {
      classified,
      denominator,
      remaining,
      severity: "error",
      message: `Classified fertilization total (${classified}) exceeds Total Oocytes Inseminated / Injected (${denominator}). Please correct the values.`,
    };
  }

  if (
    remaining > 0 &&
    hasAnyNumeric(fields.pn0, fields.pn1, fields.embryosFertilized as NumericField, fields.pn3plus)
  ) {
    return {
      classified,
      denominator,
      remaining,
      severity: "warning",
      message: `${remaining} fertilization observation${remaining === 1 ? "" : "s"} not classified / not reported`,
    };
  }

  return {
    classified,
    denominator,
    remaining,
    severity: "ok",
    message: null,
  };
}

/**
 * Validate fertilization fields.
 * Returns blocking errors and non-blocking warnings.
 */
export function validateFertilization(
  fields: FertilizationFields,
  eggsCollected: OocyteMaturityFields["eggsCollected"],
  label = "First collection"
): CycleValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const denominator = toNumeric(fields.oocytesInseminatedOrInjected);
  const total = toNumeric(eggsCollected as NumericField);

  // Inseminated/injected must not exceed retrieved
  if (denominator !== null && total !== null && denominator > total) {
    errors.push(
      `${label}: Total Oocytes Inseminated / Injected (${denominator}) cannot exceed Total Oocytes Retrieved (${total}).`
    );
  }

  const pnFields: [string, NumericField | "I don't know"][] = [
    ["0PN", fields.pn0],
    ["1PN", fields.pn1],
    ["2PN (Normally Fertilized)", fields.embryosFertilized],
    ["≥3PN", fields.pn3plus],
  ];

  for (const [name, val] of pnFields) {
    const n = toNumeric(val as NumericField);
    if (n === null) continue;
    if (n < 0) {
      errors.push(`${label}: ${name} cannot be negative.`);
    } else if (denominator !== null && n > denominator) {
      errors.push(`${label}: ${name} (${n}) cannot exceed Total Oocytes Inseminated / Injected (${denominator}).`);
    }
  }

  const summary = computeFertilizationSummary(fields);
  if (summary.severity === "error") {
    errors.push(`${label}: ${summary.message!}`);
  } else if (summary.severity === "warning" && summary.message) {
    warnings.push(`${label}: ${summary.message}`);
  }

  return { isBlocking: errors.length > 0, errors, warnings };
}

// ─── Full cycle validation ────────────────────────────────────────────────────

export interface CollectionFields extends OocyteMaturityFields, FertilizationFields {}

/**
 * Validate both first and second collections for a cycle.
 * Returns combined blocking errors and non-blocking warnings.
 */
export function validateCycleCollections(
  first: CollectionFields,
  second?: CollectionFields | null
): CycleValidationResult {
  const maturity1 = validateOocyteMaturity(first, "First collection");
  const fert1 = validateFertilization(first, first.eggsCollected, "First collection");

  const errors = [...maturity1.errors, ...fert1.errors];
  const warnings = [...maturity1.warnings, ...fert1.warnings];

  if (second) {
    const maturity2 = validateOocyteMaturity(second, "Second collection");
    const fert2 = validateFertilization(second, second.eggsCollected, "Second collection");
    errors.push(...maturity2.errors, ...fert2.errors);
    warnings.push(...maturity2.warnings, ...fert2.warnings);
  }

  return { isBlocking: errors.length > 0, errors, warnings };
}

// ─── PGT tri-state ────────────────────────────────────────────────────────────

export interface EmbryoDetailForPgt {
  pgtTested?: boolean | null;
  pgtStatus?: string;
}

/**
 * Resolve the effective PGT tested state from an embryo.
 * Handles legacy records where pgtTested is absent but pgtStatus carries meaning.
 *
 * Returns:
 *  true  → PGT was performed
 *  false → explicitly not performed
 *  null  → unknown / not reported
 */
export function resolvePgtTested(embryo: EmbryoDetailForPgt): boolean | null {
  // Canonical key takes absolute precedence — use hasOwnProperty so that
  // an explicit null ('Not Reported') is never overridden by legacy pgtStatus.
  if ('pgtTested' in embryo) {
    if (embryo.pgtTested === true) return true;
    if (embryo.pgtTested === false) return false;
    return null; // explicit null → Not Reported
  }

  // Legacy compatibility: derive from pgtStatus only when pgtTested is absent
  if (
    embryo.pgtStatus &&
    embryo.pgtStatus.trim() !== "" &&
    embryo.pgtStatus !== "Not tested"
  ) {
    return true;
  }

  if (embryo.pgtStatus === "Not tested") {
    return false;
  }

  return null;
}

/**
 * Returns the display label for the PGT tri-state.
 */
export function pgtTestedLabel(resolved: boolean | null): string {
  if (resolved === true) return "Tested";
  if (resolved === false) return "Not tested";
  return "Not reported";
}

/**
 * Returns true if the embryo has any PGT data that would be lost
 * if the user switches to "Not tested".
 */
export function hasConflictingPgtData(embryo: EmbryoDetailForPgt & {
  pgtFileKey?: string;
  pgtNotes?: string;
}): boolean {
  return !!(
    (embryo.pgtStatus && embryo.pgtStatus.trim() !== "" && embryo.pgtStatus !== "Not tested") ||
    embryo.pgtFileKey ||
    embryo.pgtNotes
  );
}

// ─── Inseminated/injected label ───────────────────────────────────────────────

export function getInseminatedInjectedLabel(
  cycleType: string | undefined
): string {
  if (cycleType === "ICSI") return "Total Oocytes Injected";
  if (cycleType === "IVF" || cycleType === "DonorEggIVF") return "Total Oocytes Inseminated";
  return "Total Oocytes Inseminated / Injected";
}
