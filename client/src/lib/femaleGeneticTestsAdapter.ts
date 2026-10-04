/**
 * femaleGeneticTestsAdapter.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure helpers for the Female Genetic Tests section of the internal Health
 * Record Edit form. All functions are side-effect-free and fully testable.
 *
 * Scope: internal Health Record only.
 * Does NOT affect: male genetic tests, public Form Builder, DynamicIntakeWizardPage.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeneticTestEntry {
  test?: string;
  date?: string;
  result?: string;
  notes?: string;
  fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  filePassword?: string;
  docId?: number;
  [key: string]: unknown; // preserve unknown legacy keys
}

/**
 * The intent that drives what gets written to the DB on save.
 *
 * - "preserve"  No change to the DB column. Used when the user never
 *               interacted with the section (gate = null, not dirty).
 * - "update"    Write the filtered meaningful entries array.
 * - "clear"     Write [] explicitly (user confirmed No, or removed last entry).
 */
export type FemaleGeneticTestsIntent = "preserve" | "update" | "clear";

// ─── Meaningful-entry rule ────────────────────────────────────────────────────

/**
 * REQ-FGT-MEANINGFUL
 * An entry is meaningful if it has a non-blank Test Type.
 * Empty placeholders (auto-created blank rows) are NOT meaningful.
 */
export function hasMeaningfulFemaleGeneticTest(entry: GeneticTestEntry): boolean {
  const test = (entry.test ?? "").trim();
  return test.length > 0;
}

/**
 * Filter an entries array to only meaningful entries.
 * Used before writing to DB and for Read-Only visibility.
 */
export function filterMeaningfulEntries(entries: GeneticTestEntry[]): GeneticTestEntry[] {
  return entries.filter(hasMeaningfulFemaleGeneticTest);
}

// ─── Gate initialization ──────────────────────────────────────────────────────

/**
 * REQ-FGT-GATE-INIT
 * Derive the initial gate state from the DB array.
 *
 * - null  → no saved meaningful entries (unanswered)
 * - true  → at least one meaningful saved entry exists
 *
 * Note: the gate never initializes to false (No) from DB data,
 * because false is an explicit user assertion, not a DB default.
 */
export function deriveGateFromDB(dbEntries: GeneticTestEntry[] | null | undefined): boolean | null {
  if (!dbEntries || !Array.isArray(dbEntries)) return null;
  return filterMeaningfulEntries(dbEntries).length > 0 ? true : null;
}

// ─── Intent derivation ────────────────────────────────────────────────────────

/**
 * REQ-FGT-INTENT
 * Determine the save intent from the current gate + dirty state.
 *
 * @param gate         Current gate value (true | false | null)
 * @param isDirty      Whether the user has interacted with the section
 * @param entries      Current UI entries array (may include blank placeholders)
 */
export function deriveFemaleGeneticTestsIntent(
  gate: boolean | null,
  isDirty: boolean,
  entries: GeneticTestEntry[]
): FemaleGeneticTestsIntent {
  // Explicit No → always clear
  if (gate === false) return "clear";

  // Gate is null (unanswered) and user never touched the section → preserve
  if (gate === null && !isDirty) return "preserve";

  // Gate is null but dirty (e.g. user removed last entry) → clear
  if (gate === null && isDirty) return "clear";

  // Gate is true → update with filtered meaningful entries
  return "update";
}

/**
 * REQ-FGT-SAVE
 * Build the value to write to the DB.
 *
 * Returns:
 * - undefined  → do not touch the DB column (preserve)
 * - []         → write empty array (clear)
 * - entry[]    → write filtered meaningful entries (update)
 */
export function serializeFemaleGeneticTests(
  gate: boolean | null,
  isDirty: boolean,
  entries: GeneticTestEntry[]
): GeneticTestEntry[] | undefined {
  const intent = deriveFemaleGeneticTestsIntent(gate, isDirty, entries);
  if (intent === "preserve") return undefined;
  if (intent === "clear") return [];
  // intent === "update"
  return filterMeaningfulEntries(entries);
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * REQ-FGT-VALIDATE
 * Validate the section before save.
 *
 * Returns null if valid, or an error message string if invalid.
 *
 * Invalid case: gate = true but no meaningful entries exist.
 */
export function validateFemaleGeneticTests(
  gate: boolean | null,
  entries: GeneticTestEntry[]
): string | null {
  if (gate !== true) return null; // No or unanswered — nothing to validate
  const meaningful = filterMeaningfulEntries(entries);
  if (meaningful.length === 0) {
    return "Please select a genetic test type or choose No.";
  }
  return null;
}

// ─── Auto first-entry ─────────────────────────────────────────────────────────

/**
 * REQ-FGT-AUTO-ENTRY
 * Create a blank placeholder entry for the auto-first-entry behavior.
 * This is a UI-only object; it must be filtered before saving.
 */
export function createBlankGeneticTestEntry(): GeneticTestEntry {
  return { test: "", date: "", result: "", notes: "" };
}

// ─── Add button label ─────────────────────────────────────────────────────────

/**
 * REQ-FGT-BUTTON-LABEL
 * Returns the correct label for the Add button based on whether
 * any meaningful entries already exist.
 */
export function getAddButtonLabel(entries: GeneticTestEntry[]): string {
  return filterMeaningfulEntries(entries).length > 0
    ? "+ Add Another Genetic Test"
    : "+ Add Genetic Test";
}
