/**
 * Contraceptive History Canonical Adapter
 *
 * Canonical field mapping (flat UI → canonical contraceptiveHistory entry):
 *
 * | Flat UI field             | Canonical field | Notes                                                     |
 * |---------------------------|-----------------|-----------------------------------------------------------|
 * | contraceptiveMethod       | method          | Select value (e.g. "oral-pill", "iud-copper", "other")    |
 * | contraceptiveDuration     | duration        | Free-text string (e.g. "3 years")                         |
 * | contraceptiveStoppedAgo   | stoppedAgo      | Free-text string (e.g. "6 months ago") — NOT a date       |
 * | contraceptiveMethodOther  | notes           | Free-text, only meaningful when method === "other"        |
 *
 * NOTE: "stoppedAgo" is stored as a free-text string, NOT an absolute date.
 * The canonical field name is "stoppedAgo" to reflect this.
 * The public intake form uses "stoppedDate" (a date field) — that is a separate
 * field on the public intake entry and is NOT the same as "stoppedAgo".
 *
 * Yes/No gate behavior:
 * - The Yes/No answer itself is NOT persisted as a separate boolean field.
 * - It is derived from the canonical array:
 *     - array with at least one meaningful entry → Yes
 *     - empty array [] (intentional clear) → No
 *     - null / undefined (never interacted) → unselected
 *
 * Intent semantics for serializeContraceptiveHistory:
 *   "preserve" → return undefined (no update — user never touched the section)
 *   "update"   → return [entry] (create or update the single entry)
 *   "clear"    → return []     (intentional clear — user selected No)
 */

export interface ContraceptiveEntry {
  method?: string;
  duration?: string;
  stoppedAgo?: string;
  notes?: string;
  // Preserve any unknown/legacy fields
  [key: string]: unknown;
}

export interface ContraceptiveFormFields {
  contraceptiveMethod?: string;
  contraceptiveDuration?: string;
  contraceptiveStoppedAgo?: string;
  contraceptiveMethodOther?: string;
}

export type ContraceptiveIntent = "preserve" | "update" | "clear";

/**
 * Hydrates flat UI form fields from the canonical contraceptiveHistory array.
 * Reads from the first (and only supported) entry.
 * Returns empty strings for missing fields so controlled inputs stay controlled.
 */
export function hydrateContraceptiveForm(
  contraceptiveHistory: ContraceptiveEntry[] | null | undefined
): ContraceptiveFormFields {
  const entry = Array.isArray(contraceptiveHistory) && contraceptiveHistory.length > 0
    ? contraceptiveHistory[0]
    : null;

  if (!entry) {
    return {
      contraceptiveMethod: "",
      contraceptiveDuration: "",
      contraceptiveStoppedAgo: "",
      contraceptiveMethodOther: "",
    };
  }

  return {
    contraceptiveMethod: typeof entry.method === "string" ? entry.method : "",
    contraceptiveDuration: typeof entry.duration === "string" ? entry.duration : "",
    contraceptiveStoppedAgo: typeof entry.stoppedAgo === "string" ? entry.stoppedAgo : "",
    contraceptiveMethodOther: typeof entry.notes === "string" ? entry.notes : "",
  };
}

/**
 * Derives the initial Yes/No gate value from the canonical array.
 *
 * Returns:
 *   true  — array has at least one meaningful entry
 *   false — array is explicitly empty [] (intentional No)
 *   null  — null/undefined (never interacted → unselected)
 */
export function deriveContraceptiveGate(
  contraceptiveHistory: ContraceptiveEntry[] | null | undefined
): boolean | null {
  if (contraceptiveHistory === null || contraceptiveHistory === undefined) return null;
  if (Array.isArray(contraceptiveHistory)) {
    if (contraceptiveHistory.length === 0) return false;
    // Check for at least one entry with meaningful data
    const hasMeaningful = contraceptiveHistory.some(
      (e) => e && (e.method || e.duration || e.stoppedAgo || e.notes)
    );
    return hasMeaningful ? true : null;
  }
  return null;
}

/**
 * Serializes flat UI form fields back to the canonical contraceptiveHistory array.
 *
 * @param form            Current flat UI field values
 * @param existingHistory The existing canonical array from the DB (to preserve unknown fields)
 * @param intent          Explicit update intent:
 *                          "preserve" → undefined (no update)
 *                          "update"   → [entry]
 *                          "clear"    → []
 *
 * @returns
 *   undefined — no update (intent === "preserve")
 *   []        — intentional clear (intent === "clear")
 *   [entry]   — create or update (intent === "update")
 */
export function serializeContraceptiveHistory(
  form: ContraceptiveFormFields,
  existingHistory: ContraceptiveEntry[] | null | undefined,
  intent: ContraceptiveIntent
): ContraceptiveEntry[] | undefined {
  if (intent === "preserve") return undefined;
  if (intent === "clear") return [];

  // intent === "update": build the canonical entry
  // Start from the existing first entry to preserve unknown/legacy fields
  const existingEntry: ContraceptiveEntry =
    Array.isArray(existingHistory) && existingHistory.length > 0
      ? { ...existingHistory[0] }
      : {};

  const entry: ContraceptiveEntry = {
    ...existingEntry,
    method: form.contraceptiveMethod || undefined,
    duration: form.contraceptiveDuration || undefined,
    stoppedAgo: form.contraceptiveStoppedAgo || undefined,
    notes: form.contraceptiveMethodOther || undefined,
  };

  // Remove undefined keys to keep the object clean
  const cleanEntry: ContraceptiveEntry = Object.fromEntries(
    Object.entries(entry).filter(([, v]) => v !== undefined && v !== "")
  );

  return [cleanEntry];
}

/**
 * Derives the intent from the gate state and form dirtiness.
 *
 * @param gateValue       Current Yes/No gate value (true/false/null)
 * @param isDirty         Whether the user has interacted with the section
 * @param existingHistory The existing canonical array from the DB
 */
export function deriveContraceptiveIntent(
  gateValue: boolean | null,
  isDirty: boolean,
  existingHistory: ContraceptiveEntry[] | null | undefined
): ContraceptiveIntent {
  // User explicitly selected No → clear
  if (gateValue === false) return "clear";

  // User has not interacted with the section at all → preserve
  if (!isDirty && gateValue === null) return "preserve";

  // User selected Yes or has interacted → update
  if (gateValue === true || isDirty) return "update";

  // Default: preserve (no-op)
  return "preserve";
}

/**
 * Renders a human-readable label for a contraceptive method value.
 */
export function contraceptiveMethodLabel(method: string | undefined): string | undefined {
  if (!method) return undefined;
  const labels: Record<string, string> = {
    "oral-pill": "Oral contraceptive pill",
    "iud-copper": "IUD (Copper)",
    "iud-hormonal": "IUD (Hormonal / Mirena)",
    "implant": "Implant (Nexplanon)",
    "injection": "Injection (Depo-Provera)",
    "patch": "Patch",
    "ring": "Vaginal ring (NuvaRing)",
    "barrier": "Barrier (condom, diaphragm)",
    "natural": "Natural / Fertility awareness",
    "none": "None / Never used",
    "other": "Other",
  };
  return labels[method] ?? method;
}
