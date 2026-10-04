/**
 * Lab Unit Conversion Library
 * Turkish standard units are used as the default display units in Fertiliv.
 * All conversions are bidirectional and mathematically precise.
 */

export interface UnitDef {
  label: string;       // display label
  system: "SI" | "conventional" | "other";
}

export interface LabTestDef {
  /** Canonical test name patterns (lowercase, partial match) */
  patterns: string[];
  /** Turkish standard / preferred unit */
  defaultUnit: string;
  /** All supported units for this test */
  units: Record<string, UnitDef>;
  /**
   * Conversion functions: convert FROM a given unit TO the defaultUnit.
   * Key = source unit label. Value = function(value) => value in defaultUnit.
   */
  toDefault: Record<string, (v: number) => number>;
  /**
   * Conversion functions: convert FROM the defaultUnit TO a given unit.
   * Key = target unit label. Value = function(value) => value in target unit.
   */
  fromDefault: Record<string, (v: number) => number>;
}

// ─── Test Definitions ─────────────────────────────────────────────────────────

export const LAB_TEST_DEFS: LabTestDef[] = [
  // ── FSH ──────────────────────────────────────────────────────────────────────
  {
    patterns: ["fsh", "follicle stimulating hormone", "follicle-stimulating"],
    defaultUnit: "IU/L",
    units: {
      "IU/L":   { label: "IU/L",   system: "conventional" },
      "mIU/mL": { label: "mIU/mL", system: "conventional" }, // numerically identical
      "IU/mL":  { label: "IU/mL",  system: "conventional" },
    },
    toDefault: {
      "IU/L":   v => v,
      "mIU/mL": v => v,       // 1 mIU/mL = 1 IU/L
      "IU/mL":  v => v * 1000,
    },
    fromDefault: {
      "IU/L":   v => v,
      "mIU/mL": v => v,
      "IU/mL":  v => v / 1000,
    },
  },

  // ── LH ───────────────────────────────────────────────────────────────────────
  {
    patterns: ["lh", "luteinizing hormone", "luteinising"],
    defaultUnit: "IU/L",
    units: {
      "IU/L":   { label: "IU/L",   system: "conventional" },
      "mIU/mL": { label: "mIU/mL", system: "conventional" },
      "IU/mL":  { label: "IU/mL",  system: "conventional" },
    },
    toDefault: {
      "IU/L":   v => v,
      "mIU/mL": v => v,
      "IU/mL":  v => v * 1000,
    },
    fromDefault: {
      "IU/L":   v => v,
      "mIU/mL": v => v,
      "IU/mL":  v => v / 1000,
    },
  },

  // ── Estradiol (E2) ────────────────────────────────────────────────────────────
  {
    patterns: ["estradiol", "oestradiol", "e2", "17β-estradiol", "17b-estradiol"],
    defaultUnit: "pg/mL",
    units: {
      "pg/mL":  { label: "pg/mL",  system: "conventional" },
      "pmol/L": { label: "pmol/L", system: "SI" },
      "ng/L":   { label: "ng/L",   system: "SI" },
    },
    // 1 pg/mL = 3.671 pmol/L  →  1 pmol/L = 0.2723 pg/mL
    toDefault: {
      "pg/mL":  v => v,
      "pmol/L": v => v * 0.2723,
      "ng/L":   v => v,         // ng/L ≡ pg/mL
    },
    fromDefault: {
      "pg/mL":  v => v,
      "pmol/L": v => v * 3.671,
      "ng/L":   v => v,
    },
  },

  // ── Progesterone ──────────────────────────────────────────────────────────────
  {
    patterns: ["progesterone", "p4"],
    defaultUnit: "ng/mL",
    units: {
      "ng/mL":  { label: "ng/mL",  system: "conventional" },
      "nmol/L": { label: "nmol/L", system: "SI" },
      "µg/L":   { label: "µg/L",   system: "SI" },
    },
    // 1 ng/mL = 3.18 nmol/L  →  1 nmol/L = 0.3145 ng/mL
    toDefault: {
      "ng/mL":  v => v,
      "nmol/L": v => v * 0.3145,
      "µg/L":   v => v,         // µg/L ≡ ng/mL
    },
    fromDefault: {
      "ng/mL":  v => v,
      "nmol/L": v => v * 3.18,
      "µg/L":   v => v,
    },
  },

  // ── Testosterone ─────────────────────────────────────────────────────────────
  {
    patterns: ["testosterone", "total testosterone"],
    defaultUnit: "ng/dL",
    units: {
      "ng/dL":  { label: "ng/dL",  system: "conventional" },
      "nmol/L": { label: "nmol/L", system: "SI" },
      "ng/mL":  { label: "ng/mL",  system: "conventional" },
    },
    // 1 ng/dL = 0.03467 nmol/L  →  1 nmol/L = 28.84 ng/dL
    toDefault: {
      "ng/dL":  v => v,
      "nmol/L": v => v * 28.84,
      "ng/mL":  v => v * 100,
    },
    fromDefault: {
      "ng/dL":  v => v,
      "nmol/L": v => v * 0.03467,
      "ng/mL":  v => v / 100,
    },
  },

  // ── Prolactin ─────────────────────────────────────────────────────────────────
  {
    patterns: ["prolactin", "prl"],
    defaultUnit: "ng/mL",
    units: {
      "ng/mL":  { label: "ng/mL",  system: "conventional" },
      "mIU/L":  { label: "mIU/L",  system: "SI" },
      "µIU/mL": { label: "µIU/mL", system: "conventional" },
      "mIU/mL": { label: "mIU/mL", system: "conventional" },
    },
    // 1 ng/mL ≈ 21.2 mIU/L  →  1 mIU/L ≈ 0.04717 ng/mL
    toDefault: {
      "ng/mL":  v => v,
      "mIU/L":  v => v * 0.04717,
      "µIU/mL": v => v * 0.04717,  // µIU/mL ≡ mIU/L numerically
      "mIU/mL": v => v * 0.04717,
    },
    fromDefault: {
      "ng/mL":  v => v,
      "mIU/L":  v => v * 21.2,
      "µIU/mL": v => v * 21.2,
      "mIU/mL": v => v * 21.2,
    },
  },

  // ── TSH ───────────────────────────────────────────────────────────────────────
  {
    patterns: ["tsh", "thyroid stimulating hormone", "thyrotropin"],
    defaultUnit: "mIU/L",
    units: {
      "mIU/L":  { label: "mIU/L",  system: "SI" },
      "µIU/mL": { label: "µIU/mL", system: "conventional" }, // numerically identical
      "mIU/mL": { label: "mIU/mL", system: "conventional" },
    },
    toDefault: {
      "mIU/L":  v => v,
      "µIU/mL": v => v,
      "mIU/mL": v => v,
    },
    fromDefault: {
      "mIU/L":  v => v,
      "µIU/mL": v => v,
      "mIU/mL": v => v,
    },
  },

  // ── AMH ───────────────────────────────────────────────────────────────────────
  {
    patterns: ["amh", "anti-müllerian", "antimüllerian", "anti-mullerian", "antimullerian", "müllerian", "mullerian"],
    defaultUnit: "ng/mL",
    units: {
      "ng/mL":  { label: "ng/mL",  system: "conventional" },
      "pmol/L": { label: "pmol/L", system: "SI" },
      "µg/L":   { label: "µg/L",   system: "SI" },
    },
    // 1 ng/mL = 7.14 pmol/L  →  1 pmol/L = 0.14006 ng/mL
    toDefault: {
      "ng/mL":  v => v,
      "pmol/L": v => v * 0.14006,
      "µg/L":   v => v,         // µg/L ≡ ng/mL
    },
    fromDefault: {
      "ng/mL":  v => v,
      "pmol/L": v => v * 7.14,
      "µg/L":   v => v,
    },
  },

  // ── HbA1c ─────────────────────────────────────────────────────────────────────
  {
    patterns: ["hba1c", "hemoglobin a1c", "haemoglobin a1c", "glycated hemoglobin", "a1c"],
    defaultUnit: "%",
    units: {
      "%":        { label: "%",        system: "conventional" }, // NGSP
      "mmol/mol": { label: "mmol/mol", system: "SI" },           // IFCC
    },
    // IFCC → NGSP: % = (mmol/mol / 10.929) + 2.15
    // NGSP → IFCC: mmol/mol = (% - 2.15) × 10.929
    toDefault: {
      "%":        v => v,
      "mmol/mol": v => (v / 10.929) + 2.15,
    },
    fromDefault: {
      "%":        v => v,
      "mmol/mol": v => (v - 2.15) * 10.929,
    },
  },

  // ── Vitamin D ─────────────────────────────────────────────────────────────────
  {
    patterns: ["vitamin d", "25-oh", "25-hydroxy", "25(oh)d", "calcidiol"],
    defaultUnit: "ng/mL",
    units: {
      "ng/mL":  { label: "ng/mL",  system: "conventional" },
      "nmol/L": { label: "nmol/L", system: "SI" },
    },
    // 1 ng/mL = 2.496 nmol/L  →  1 nmol/L = 0.4006 ng/mL
    toDefault: {
      "ng/mL":  v => v,
      "nmol/L": v => v * 0.4006,
    },
    fromDefault: {
      "ng/mL":  v => v,
      "nmol/L": v => v * 2.496,
    },
  },

  // ── SHBG ─────────────────────────────────────────────────────────────────────
  {
    patterns: ["shbg", "sex hormone binding globulin", "sex hormone-binding"],
    defaultUnit: "nmol/L",
    units: {
      "nmol/L": { label: "nmol/L", system: "SI" },
      "µg/dL":  { label: "µg/dL",  system: "conventional" },
    },
    // 1 nmol/L = 0.02879 µg/dL  →  1 µg/dL = 34.73 nmol/L
    toDefault: {
      "nmol/L": v => v,
      "µg/dL":  v => v * 34.73,
    },
    fromDefault: {
      "nmol/L": v => v,
      "µg/dL":  v => v * 0.02879,
    },
  },

  // ── TPO Antibody ─────────────────────────────────────────────────────────────
  {
    patterns: ["tpo", "thyroid peroxidase", "anti-tpo", "antitpo"],
    defaultUnit: "IU/mL",
    units: {
      "IU/mL":  { label: "IU/mL",  system: "conventional" },
      "kIU/L":  { label: "kIU/L",  system: "SI" },
    },
    // 1 IU/mL = 1 kIU/L numerically
    toDefault: {
      "IU/mL": v => v,
      "kIU/L": v => v,
    },
    fromDefault: {
      "IU/mL": v => v,
      "kIU/L": v => v,
    },
  },

  // ── Insulin ──────────────────────────────────────────────────────────────────
  {
    patterns: ["insulin", "fasting insulin"],
    defaultUnit: "µIU/mL",
    units: {
      "µIU/mL": { label: "µIU/mL", system: "conventional" },
      "pmol/L": { label: "pmol/L", system: "SI" },
      "mIU/L":  { label: "mIU/L",  system: "SI" },
    },
    // 1 µIU/mL = 6.945 pmol/L  →  1 pmol/L = 0.14398 µIU/mL
    // 1 µIU/mL = 1 mIU/L
    toDefault: {
      "µIU/mL": v => v,
      "pmol/L": v => v * 0.14398,
      "mIU/L":  v => v,
    },
    fromDefault: {
      "µIU/mL": v => v,
      "pmol/L": v => v * 6.945,
      "mIU/L":  v => v,
    },
  },

  // ── Free T4 ──────────────────────────────────────────────────────────────────
  {
    patterns: ["free t4", "ft4", "free thyroxine", "t4 free"],
    defaultUnit: "ng/dL",
    units: {
      "ng/dL":  { label: "ng/dL",  system: "conventional" },
      "pmol/L": { label: "pmol/L", system: "SI" },
    },
    // 1 ng/dL = 12.87 pmol/L  →  1 pmol/L = 0.07771 ng/dL
    toDefault: {
      "ng/dL":  v => v,
      "pmol/L": v => v * 0.07771,
    },
    fromDefault: {
      "ng/dL":  v => v,
      "pmol/L": v => v * 12.87,
    },
  },

  // ── Free T3 ──────────────────────────────────────────────────────────────────
  {
    patterns: ["free t3", "ft3", "free triiodothyronine", "t3 free"],
    defaultUnit: "pg/mL",
    units: {
      "pg/mL":  { label: "pg/mL",  system: "conventional" },
      "pmol/L": { label: "pmol/L", system: "SI" },
    },
    // 1 pg/mL = 1.536 pmol/L  →  1 pmol/L = 0.6510 pg/mL
    toDefault: {
      "pg/mL":  v => v,
      "pmol/L": v => v * 0.6510,
    },
    fromDefault: {
      "pg/mL":  v => v,
      "pmol/L": v => v * 1.536,
    },
  },

  // ── Glucose / Blood Sugar ─────────────────────────────────────────────────────
  {
    patterns: ["glucose", "blood sugar", "fasting glucose", "blood glucose"],
    defaultUnit: "mg/dL",
    units: {
      "mg/dL":  { label: "mg/dL",  system: "conventional" },
      "mmol/L": { label: "mmol/L", system: "SI" },
    },
    // 1 mg/dL = 0.05551 mmol/L  →  1 mmol/L = 18.016 mg/dL
    toDefault: {
      "mg/dL":  v => v,
      "mmol/L": v => v * 18.016,
    },
    fromDefault: {
      "mg/dL":  v => v,
      "mmol/L": v => v * 0.05551,
    },
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/** Find the test definition for a given test name (case-insensitive partial match) */
export function findTestDef(testName: string): LabTestDef | undefined {
  const lower = testName.toLowerCase();
  return LAB_TEST_DEFS.find(def =>
    def.patterns.some(p => lower.includes(p))
  );
}

/** Get all valid units for a test name */
export function getUnitsForTest(testName: string): string[] {
  const def = findTestDef(testName);
  if (!def) return [];
  return Object.keys(def.units);
}

/** Get the Turkish default unit for a test name */
export function getDefaultUnit(testName: string): string | undefined {
  return findTestDef(testName)?.defaultUnit;
}

/**
 * Convert a value from one unit to another for a given test.
 * Returns the original value if conversion is not possible.
 */
export function convertUnit(
  testName: string,
  value: number,
  fromUnit: string,
  toUnit: string
): number {
  if (fromUnit === toUnit) return value;
  const def = findTestDef(testName);
  if (!def) return value;

  // Convert fromUnit → defaultUnit → toUnit
  const toDefaultFn = def.toDefault[fromUnit];
  const fromDefaultFn = def.fromDefault[toUnit];
  if (!toDefaultFn || !fromDefaultFn) return value;

  const inDefault = toDefaultFn(value);
  return fromDefaultFn(inDefault);
}

/**
 * Convert a value to the Turkish standard (default) unit for a given test.
 * Returns { value, unit } — unchanged if no conversion is defined.
 */
export function convertToTurkishDefault(
  testName: string,
  value: number,
  fromUnit: string
): { value: number; unit: string } {
  const def = findTestDef(testName);
  if (!def) return { value, unit: fromUnit };

  const toDefaultFn = def.toDefault[fromUnit];
  if (!toDefaultFn) return { value, unit: fromUnit };

  return {
    value: toDefaultFn(value),
    unit: def.defaultUnit,
  };
}

/** Round a lab value to a sensible number of decimal places */
export function roundLabValue(v: number): number {
  if (Math.abs(v) >= 100) return Math.round(v * 10) / 10;
  if (Math.abs(v) >= 10)  return Math.round(v * 100) / 100;
  return Math.round(v * 1000) / 1000;
}

/** Common lab units shown as dropdown options for custom/unknown quantitative tests */
export const COMMON_QUANTITATIVE_UNITS: string[] = [
  // Concentration / mass
  "ng/mL", "pg/mL", "µg/mL", "mg/mL", "g/dL", "mg/dL", "µg/dL", "ng/dL",
  // Molar
  "nmol/L", "pmol/L", "µmol/L", "mmol/L", "mol/L",
  // International units
  "IU/L", "mIU/L", "IU/mL", "mIU/mL", "IU/dL",
  // Micrograms
  "µg/L", "ng/L",
  // Enzyme / activity
  "U/L", "mU/L", "kU/L",
  // Percentage / ratio
  "%", "ratio",
  // Counts / volume
  "cells/µL", "cells/mL", "copies/mL", "copies/µL", "CFU/mL",
  // Miscellaneous
  "mg/L", "g/L", "mmHg", "mOsm/kg", "mEq/L", "fL", "pg",
];

/**
 * Get unit options for a test — returns test-specific units if known,
 * otherwise falls back to COMMON_QUANTITATIVE_UNITS for custom tests.
 */
export function getUnitsForTestOrCommon(testName: string): string[] {
  const specific = getUnitsForTest(testName);
  if (specific.length > 0) return specific;
  return COMMON_QUANTITATIVE_UNITS;
}
