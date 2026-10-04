/**
 * intakeUtils.ts — Shared utilities for medical intake analysis.
 *
 * These helpers are pure functions with no external dependencies so they can
 * be imported from both the frontend (client/) and the backend (server/).
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * The intake mode determines which person owns which fields.
 *
 * Ownership rules for hasMeaningfulReportedPartnerData():
 *
 *   "female"  — Health Record belongs to a female patient.
 *               maleIntake blob → reported MALE-PARTNER data.
 *               maleRadiologyStudies / generalAttachmentsMale → male-partner data.
 *               Inspects all maleIntake fields.
 *
 *   "male"    — Health Record belongs to a male patient.
 *               maleIntake blob → the MALE PERSON's OWN medical data.
 *               maleRadiologyStudies / generalAttachmentsMale → MALE PERSON's own data.
 *               Only maleIntake.femalePartnerDob and top-level partnerIsFirstMarriage
 *               are explicit female-partner fields.
 *
 *   "legacy"  — Old two-tab layout.
 *               maleIntake blob → male-partner data (same ownership as "female").
 *               Inspects all maleIntake fields.
 *
 *   "general" — No gender assignment; partner ownership undefined.
 *               Returns false — do not classify untyped data as partner information.
 *
 *   null / undefined — Health Record type is unknown.
 *               Returns false — do not infer partner ownership from missing mode.
 *               Unclassified records may contain meaningful data but must not be
 *               silently treated as female-mode or legacy records.
 */
export type IntakeMode = "female" | "male" | "legacy" | "general" | null | undefined;

export interface PartialIntakeForPartnerCheck {
  maleIntake?: Record<string, unknown> | null | unknown;
  partnerIsFirstMarriage?: boolean | null;
  maleRadiologyStudies?: unknown[] | null | unknown;
  hasMaleRadiologyStudies?: boolean | null;
  generalAttachmentsMale?: unknown[] | null | unknown;
  femalePartnerDob?: string | null;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function isNonEmptyArray(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

function isNonEmptyObject(value: unknown): boolean {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return Object.keys(value as object).length > 0;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        Object.keys(parsed as object).length > 0
      );
    } catch {
      return false;
    }
  }
  return false;
}

/** Default values for maleIntake scalar fields. A field at its default is not "meaningful". */
const MALE_INTAKE_DEFAULT_SCALARS: Record<string, unknown> = {
  profession: "",
  heightCm: "",
  weightKg: "",
  bmi: "",
  smoking: "never",
  alcohol: "never",
  consanguinity: false,
  hereditaryDiseases: "",
  currentMedications: "",
  allergies: "",
  additionalNotes: "",
};

/**
 * Array fields inside maleIntake that belong to the MALE PERSON's own medical data.
 * These are meaningful as male-partner data in female/legacy mode, but NOT as
 * female-partner data in male mode.
 */
const MALE_INTAKE_MALE_PERSON_ARRAY_FIELDS = [
  "previousSurgeries",
  "semenAnalysis",
  "dnaFragmentation",
  "previousTests",
  "geneticTests",
] as const;

function parseMaleIntakeBlob(maleIntake: unknown): Record<string, unknown> {
  if (!isNonEmptyObject(maleIntake)) return {};
  if (typeof maleIntake === "string") {
    try {
      return JSON.parse(maleIntake) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return maleIntake as Record<string, unknown>;
}

/**
 * Returns true when the maleIntake blob contains meaningful MALE-PARTNER data.
 *
 * Used for: female-primary and legacy records, where maleIntake holds reported
 * male-partner information entered during the intake.
 *
 * Checks ALL maleIntake fields because in this context every field describes
 * the male partner.
 */
function hasMeaningfulMalePartnerInBlob(maleIntake: unknown): boolean {
  const blob = parseMaleIntakeBlob(maleIntake);
  if (Object.keys(blob).length === 0) return false;

  // Check scalar fields against defaults
  for (const [key, defaultVal] of Object.entries(MALE_INTAKE_DEFAULT_SCALARS)) {
    const val = blob[key];
    if (val === undefined || val === null) continue;
    if (val !== defaultVal) return true;
  }

  const knownScalars = new Set(Object.keys(MALE_INTAKE_DEFAULT_SCALARS));
  const knownArrays = new Set<string>(MALE_INTAKE_MALE_PERSON_ARRAY_FIELDS);

  for (const [key, val] of Object.entries(blob)) {
    if (knownScalars.has(key) || knownArrays.has(key)) continue;
    if (val === null || val === undefined || val === "") continue;
    if (key === "systemicDiseases") {
      if (val !== null && typeof val === "object" && !Array.isArray(val)) {
        const sd = val as Record<string, unknown>;
        const hasActive = Object.entries(sd).some(([k, v]) =>
          k === "other" ? (typeof v === "string" && v.trim() !== "") : v === true
        );
        if (hasActive) return true;
      }
      continue;
    }
    if (typeof val === "boolean") {
      if (val === true) return true;
      continue;
    }
    return true;
  }

  for (const field of MALE_INTAKE_MALE_PERSON_ARRAY_FIELDS) {
    if (isNonEmptyArray(blob[field])) return true;
  }

  return false;
}

/**
 * Returns true when the maleIntake blob contains meaningful FEMALE-PARTNER data.
 *
 * Used for: male-primary records, where maleIntake is the MALE PERSON's own data.
 * Only the explicit female-partner field (femalePartnerDob) counts here.
 * All other maleIntake fields belong to the male person and must NOT trigger
 * the female-partner section.
 */
function hasMeaningfulFemalePartnerInMaleBlob(maleIntake: unknown): boolean {
  const blob = parseMaleIntakeBlob(maleIntake);
  if (Object.keys(blob).length === 0) return false;
  // Only femalePartnerDob is an explicit female-partner field inside maleIntake
  const dob = blob["femalePartnerDob"];
  return typeof dob === "string" && dob.trim() !== "";
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true when the given intake record contains partner information that
 * was recorded separately from a linked partner's own Health Record.
 *
 * `intakeMode` is a REQUIRED argument. Every call site must pass the actual mode.
 * There is no safe default: omitting or passing null/undefined returns false because
 * the system cannot determine ownership of maleIntake fields without a known mode.
 *
 * Mode semantics:
 *
 *   "female":
 *     Inspects maleIntake blob (all fields), maleRadiologyStudies,
 *     generalAttachmentsMale, hasMaleRadiologyStudies, and partnerIsFirstMarriage.
 *     All of these are male-partner data in this context.
 *
 *   "male":
 *     Only inspects fields that explicitly describe the female partner:
 *     • maleIntake.femalePartnerDob
 *     • top-level partnerIsFirstMarriage
 *     All other maleIntake fields belong to the male person and are EXCLUDED.
 *     maleRadiologyStudies and generalAttachmentsMale are also EXCLUDED.
 *
 *   "legacy":
 *     Same as "female" — maleIntake blob is treated as male-partner data.
 *
 *   "general":
 *     Returns false — no defined ownership rule.
 *
 *   null / undefined:
 *     Returns false — Health Record type is unknown; do not infer partner
 *     ownership from missing mode. Unclassified records may contain meaningful
 *     data but must not be silently treated as female-mode records.
 */
export function hasMeaningfulReportedPartnerData(
  intake: PartialIntakeForPartnerCheck | null | undefined,
  intakeMode: IntakeMode
): boolean {
  if (!intake) return false;

  // null, undefined, and "general" all return false:
  // — null/undefined: mode is unknown; do not classify untyped data as partner info
  // — "general": no defined ownership rule
  if (intakeMode == null || intakeMode === "general") {
    return false;
  }

  if (intakeMode === "male") {
    // Male-primary record:
    // maleIntake fields (except femalePartnerDob) → MALE PERSON's own data → excluded
    // maleRadiologyStudies → MALE PERSON's own imaging → excluded
    // generalAttachmentsMale → MALE PERSON's own files → excluded
    // hasMaleRadiologyStudies → MALE PERSON's own flag → excluded
    // Only check explicit female-partner fields:
    if (hasMeaningfulFemalePartnerInMaleBlob(intake.maleIntake)) return true;
    if (intake.partnerIsFirstMarriage === true) return true;
    return false;
  }

  // "female" or "legacy":
  // maleIntake blob, maleRadiologyStudies, generalAttachmentsMale, and
  // hasMaleRadiologyStudies are all male-partner data in this context.
  if (hasMeaningfulMalePartnerInBlob(intake.maleIntake)) return true;
  if (intake.partnerIsFirstMarriage === true) return true;
  if (isNonEmptyArray(intake.maleRadiologyStudies)) return true;
  if (intake.hasMaleRadiologyStudies === true) return true;
  if (isNonEmptyArray(intake.generalAttachmentsMale)) return true;
  return false;
}
