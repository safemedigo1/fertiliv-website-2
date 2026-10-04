/**
 * femaleDiagnosisAdapter.ts
 *
 * Shared adapter for Female Fertility Diagnosis options.
 *
 * Canonical option source: Settings → Field Options Manager
 *   fieldKey: "female_fertility_diagnosis"
 *
 * Used by:
 *   - LeadDetailPage (Lead Information tab)
 *   - MedicalIntakeForm (Female Health Record edit + read-only)
 *
 * Design rules:
 *   - Pure functions only — no React hooks, no side effects.
 *   - Dynamic options from dropdownOptions.list take precedence over the static fallback.
 *   - Static fallback is used only when the dynamic query returns null/undefined/empty.
 *   - Hidden options (isActive: false) are preserved in the rendered list ONLY when
 *     already present in the selected array (orphan/legacy preservation).
 *   - Hidden options cannot be newly selected.
 *   - Configured sortOrder and groupLabel hierarchy are respected.
 *   - Male diagnosis behavior is NOT touched by this module.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal shape of a row returned by trpc.dropdownOptions.list */
export interface RawDropdownOption {
  id: number;
  label: string;
  value: string;
  sortOrder: number;
  isActive: boolean;
  groupLabel?: string | null;
}

/** A rendered diagnosis group: one main checkbox + optional indented sub-checkboxes */
export interface DiagnosisGroup {
  main: string;
  subs: string[];
  /** True when this group (or any sub) is a hidden option — visible only because it is already selected */
  isHidden?: boolean;
}

/** A rendered diagnosis item with hidden metadata (used for individual checkbox rendering) */
export interface DiagnosisItem {
  label: string;
  isHidden: boolean;
}

// ─── Static fallback list ─────────────────────────────────────────────────────
// Kept in sync with the original FEMALE_DIAGNOSIS_GROUPS in MedicalIntakeForm.tsx
// and FEMALE_DIAGNOSIS_OPTIONS in LeadDetailPage.tsx.
// Used ONLY when the dynamic query is unavailable.

export const FEMALE_DIAGNOSIS_STATIC_FALLBACK: DiagnosisGroup[] = [
  { main: "Ovarian reserve", subs: ["PCOS (Polycystic Ovary Syndrome)", "Premature Ovarian Insufficiency (POI)"] },
  { main: "Ovulation disorders", subs: [] },
  { main: "Tubal factor", subs: ["Hydrosalpinx"] },
  { main: "Endometriosis", subs: [] },
  { main: "Uterine factors", subs: ["Uterine fibroids (myomas)", "Uterine polyps", "Uterine septum / Asherman's syndrome"] },
  { main: "Genetics / PGT needed", subs: [] },
  { main: "Recurrent miscarriages", subs: ["Recurrent Implantation Failure (RIF)"] },
  { main: "Unexplained infertility", subs: [] },
  { main: "No clear diagnosis / needs re-evaluation", subs: [] },
  { main: "Systemic factors", subs: [] },
  { main: "Other", subs: [] },
];

// ─── Core adapter function ────────────────────────────────────────────────────

/**
 * Build the canonical DiagnosisGroup[] for rendering female fertility diagnosis checkboxes.
 *
 * @param rawOptions  Raw rows from trpc.dropdownOptions.list({ fieldKey: "female_fertility_diagnosis" }).
 *                    Pass `null` or `undefined` when the query has not yet resolved.
 * @param selected    The currently selected diagnosis values (from lead.fertilityDiagnosis or patient.fertilityDiagnosis).
 * @returns           Ordered DiagnosisGroup[] ready for DiagnosisGroupBox rendering.
 *                    Hidden options that are already selected are appended at the end of their group.
 */
export function buildFemaleDiagnosisGroups(
  rawOptions: RawDropdownOption[] | null | undefined,
  selected: string[],
): DiagnosisGroup[] {
  // ── Fallback: use static list when dynamic data is unavailable ──────────────
  if (!rawOptions || rawOptions.length === 0) {
    return appendOrphanGroups(FEMALE_DIAGNOSIS_STATIC_FALLBACK, selected);
  }

  // ── Separate active from hidden options ────────────────────────────────────
  const active = rawOptions.filter(o => o.isActive !== false);
  const hidden = rawOptions.filter(o => o.isActive === false);

  // ── Build groups from active options ──────────────────────────────────────
  // Options are already sorted by (sortOrder ASC, id ASC) from the server.
  const groups: DiagnosisGroup[] = [];

  if (!active.some(o => o.groupLabel)) {
    // No grouping — flat list
    for (const o of active) {
      groups.push({ main: o.label, subs: [] });
    }
  } else {
    // Grouped: options with no groupLabel are top-level; options with groupLabel are children
    const groupMap = new Map<string, string[]>();
    const groupOrder: string[] = []; // preserve insertion order for groups
    const ungrouped: string[] = [];

    for (const o of active) {
      if (!o.groupLabel) {
        ungrouped.push(o.label);
      } else {
        if (!groupMap.has(o.groupLabel)) {
          groupMap.set(o.groupLabel, []);
          groupOrder.push(o.groupLabel);
        }
        groupMap.get(o.groupLabel)!.push(o.label);
      }
    }

    // Ungrouped items first (they are top-level options with no children)
    for (const label of ungrouped) {
      groups.push({ main: label, subs: [] });
    }
    // Then grouped items
    for (const groupLabel of groupOrder) {
      groups.push({ main: groupLabel, subs: groupMap.get(groupLabel)! });
    }
  }

  // ── Append hidden options that are already selected (orphan preservation) ──
  const selectedSet = new Set(selected);
  const hiddenSelected = hidden.filter(o => selectedSet.has(o.label));

  for (const o of hiddenSelected) {
    if (o.groupLabel) {
      // Find the parent group and append as a hidden sub
      const parent = groups.find(g => g.main === o.groupLabel);
      if (parent) {
        if (!parent.subs.includes(o.label)) {
          parent.subs.push(o.label);
        }
      } else {
        // Parent group itself may also be hidden — create a hidden group
        groups.push({ main: o.groupLabel, subs: [o.label], isHidden: true });
      }
    } else {
      // Top-level hidden option — append as its own group
      if (!groups.find(g => g.main === o.label)) {
        groups.push({ main: o.label, subs: [], isHidden: true });
      }
    }
  }

  // ── Also append orphan values not in rawOptions at all (legacy/custom) ─────
  return appendOrphanGroups(groups, selected, rawOptions);
}

/**
 * Append any selected values that are not present in the rendered groups at all
 * (legacy/custom values that predate the Field Options Manager configuration).
 *
 * @param groups      Already-built groups (active + hidden-selected).
 * @param selected    Currently selected values.
 * @param rawOptions  All raw options (active + hidden). Pass undefined for static-fallback path.
 */
function appendOrphanGroups(
  groups: DiagnosisGroup[],
  selected: string[],
  rawOptions?: RawDropdownOption[],
): DiagnosisGroup[] {
  // Collect all labels already represented in groups
  const represented = new Set<string>();
  for (const g of groups) {
    represented.add(g.main);
    for (const s of g.subs) represented.add(s);
  }

  // Collect all labels in rawOptions (if provided)
  const inRaw = new Set<string>();
  if (rawOptions) {
    for (const o of rawOptions) inRaw.add(o.label);
  }

  const result = [...groups];
  for (const val of selected) {
    if (!represented.has(val)) {
      // This value is not in any group — it's an orphan/legacy value
      result.push({ main: val, subs: [], isHidden: true });
      represented.add(val);
    }
  }
  return result;
}

// ─── Helper: is a given label a hidden option? ────────────────────────────────

/**
 * Returns true if the given label corresponds to a hidden (isActive: false) option
 * in the raw options list. Used to prevent newly selecting hidden options.
 */
export function isHiddenOption(
  label: string,
  rawOptions: RawDropdownOption[] | null | undefined,
): boolean {
  if (!rawOptions) return false;
  const opt = rawOptions.find(o => o.label === label);
  return opt !== undefined && opt.isActive === false;
}

// ─── Helper: canonical array save ────────────────────────────────────────────

/**
 * Produce the canonical diagnosis array to persist.
 *
 * Rules:
 *   - All currently-selected values are preserved (including hidden/orphan).
 *   - Toggling a hidden option OFF is allowed (user explicitly removes it).
 *   - Toggling a hidden option ON is blocked (caller must check isHiddenOption first).
 *   - Returns a new array (immutable).
 */
export function toggleDiagnosisValue(
  current: string[],
  label: string,
  checked: boolean,
  rawOptions: RawDropdownOption[] | null | undefined,
): string[] {
  if (checked) {
    // Block newly selecting hidden options
    if (isHiddenOption(label, rawOptions)) return current;
    if (current.includes(label)) return current;
    return [...current, label];
  } else {
    return current.filter(v => v !== label);
  }
}
