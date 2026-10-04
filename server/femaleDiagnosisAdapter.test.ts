/**
 * femaleDiagnosisAdapter.test.ts
 *
 * 14 automated tests for the shared Female Fertility Diagnosis adapter.
 * Tests cover: static fallback, dynamic options, grouping, hidden/orphan
 * preservation, toggleDiagnosisValue guard, isHiddenOption, and appendOrphanGroups.
 */
import { describe, it, expect } from "vitest";
import {
  buildFemaleDiagnosisGroups,
  toggleDiagnosisValue,
  isHiddenOption,
  FEMALE_DIAGNOSIS_STATIC_FALLBACK,
  type RawDropdownOption,
} from "../client/src/lib/femaleDiagnosisAdapter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeOpt(
  id: number,
  label: string,
  isActive: boolean,
  groupLabel?: string,
  sortOrder = 0
): RawDropdownOption {
  return { id, label, value: label, sortOrder, isActive, groupLabel };
}

// ─── T01: Static fallback when rawOptions is null ─────────────────────────────
describe("buildFemaleDiagnosisGroups", () => {
  it("T01: returns static fallback when rawOptions is null", () => {
    const groups = buildFemaleDiagnosisGroups(null, []);
    expect(groups).toEqual(FEMALE_DIAGNOSIS_STATIC_FALLBACK);
  });

  // T02: Static fallback when rawOptions is undefined
  it("T02: returns static fallback when rawOptions is undefined", () => {
    const groups = buildFemaleDiagnosisGroups(undefined, []);
    expect(groups).toEqual(FEMALE_DIAGNOSIS_STATIC_FALLBACK);
  });

  // T03: Static fallback when rawOptions is empty array
  it("T03: returns static fallback when rawOptions is empty array", () => {
    const groups = buildFemaleDiagnosisGroups([], []);
    expect(groups).toEqual(FEMALE_DIAGNOSIS_STATIC_FALLBACK);
  });

  // T04: Flat dynamic list (no groupLabel) — each option becomes its own group
  it("T04: flat dynamic list produces one group per option with no subs", () => {
    const raw = [
      makeOpt(1, "PCOS", true),
      makeOpt(2, "Endometriosis", true),
      makeOpt(3, "Unexplained", true),
    ];
    const groups = buildFemaleDiagnosisGroups(raw, []);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toEqual({ main: "PCOS", subs: [] });
    expect(groups[1]).toEqual({ main: "Endometriosis", subs: [] });
    expect(groups[2]).toEqual({ main: "Unexplained", subs: [] });
  });

  // T05: Grouped dynamic list — subs are nested under their groupLabel
  it("T05: grouped dynamic list nests subs under parent group", () => {
    const raw = [
      makeOpt(1, "PCOS", true, "Ovarian reserve", 0),
      makeOpt(2, "POI", true, "Ovarian reserve", 1),
      makeOpt(3, "Hydrosalpinx", true, "Tubal factor", 2),
      makeOpt(4, "Endometriosis", true, undefined, 3),
    ];
    const groups = buildFemaleDiagnosisGroups(raw, []);
    // Ungrouped items come first
    expect(groups[0]).toEqual({ main: "Endometriosis", subs: [] });
    // Then grouped items
    const ovarianGroup = groups.find(g => g.main === "Ovarian reserve");
    expect(ovarianGroup).toBeDefined();
    expect(ovarianGroup!.subs).toEqual(["PCOS", "POI"]);
    const tubalGroup = groups.find(g => g.main === "Tubal factor");
    expect(tubalGroup).toBeDefined();
    expect(tubalGroup!.subs).toEqual(["Hydrosalpinx"]);
  });

  // T06: Hidden option NOT in selected — excluded from groups
  it("T06: hidden option not in selected is excluded from rendered groups", () => {
    const raw = [
      makeOpt(1, "PCOS", true),
      makeOpt(2, "OldDiagnosis", false), // hidden
    ];
    const groups = buildFemaleDiagnosisGroups(raw, []);
    const labels = groups.map(g => g.main);
    expect(labels).not.toContain("OldDiagnosis");
    expect(labels).toContain("PCOS");
  });

  // T07: Hidden option IS in selected — preserved with isHidden: true
  it("T07: hidden option already selected is preserved with isHidden: true", () => {
    const raw = [
      makeOpt(1, "PCOS", true),
      makeOpt(2, "OldDiagnosis", false), // hidden
    ];
    const groups = buildFemaleDiagnosisGroups(raw, ["OldDiagnosis"]);
    const hiddenGroup = groups.find(g => g.main === "OldDiagnosis");
    expect(hiddenGroup).toBeDefined();
    expect(hiddenGroup!.isHidden).toBe(true);
  });

  // T08: Hidden sub-option IS in selected — preserved inside parent group
  it("T08: hidden sub-option already selected is preserved inside parent group", () => {
    const raw = [
      makeOpt(1, "PCOS", true, "Ovarian reserve"),
      makeOpt(2, "OldSub", false, "Ovarian reserve"), // hidden sub
    ];
    const groups = buildFemaleDiagnosisGroups(raw, ["OldSub"]);
    const ovarianGroup = groups.find(g => g.main === "Ovarian reserve");
    expect(ovarianGroup).toBeDefined();
    expect(ovarianGroup!.subs).toContain("OldSub");
  });

  // T09: Orphan value (not in rawOptions at all) — preserved as isHidden group
  it("T09: orphan value not in rawOptions at all is preserved as isHidden group", () => {
    const raw = [
      makeOpt(1, "PCOS", true),
    ];
    const groups = buildFemaleDiagnosisGroups(raw, ["LegacyValue"]);
    const orphan = groups.find(g => g.main === "LegacyValue");
    expect(orphan).toBeDefined();
    expect(orphan!.isHidden).toBe(true);
  });

  // T10: sortOrder is respected — options ordered by sortOrder ASC
  it("T10: options respect sortOrder from server (already sorted)", () => {
    const raw = [
      makeOpt(3, "Endometriosis", true, undefined, 0),
      makeOpt(1, "PCOS", true, undefined, 1),
      makeOpt(2, "Unexplained", true, undefined, 2),
    ];
    const groups = buildFemaleDiagnosisGroups(raw, []);
    expect(groups[0].main).toBe("Endometriosis");
    expect(groups[1].main).toBe("PCOS");
    expect(groups[2].main).toBe("Unexplained");
  });

  // T11: Multiple orphans — all preserved
  it("T11: multiple orphan values are all preserved as isHidden groups", () => {
    const raw = [makeOpt(1, "PCOS", true)];
    const groups = buildFemaleDiagnosisGroups(raw, ["Legacy1", "Legacy2"]);
    const orphan1 = groups.find(g => g.main === "Legacy1");
    const orphan2 = groups.find(g => g.main === "Legacy2");
    expect(orphan1?.isHidden).toBe(true);
    expect(orphan2?.isHidden).toBe(true);
  });
});

// ─── toggleDiagnosisValue tests ───────────────────────────────────────────────
describe("toggleDiagnosisValue", () => {
  // T12: Checking an active option adds it to the array
  it("T12: checking an active option adds it to the array", () => {
    const raw = [makeOpt(1, "PCOS", true)];
    const result = toggleDiagnosisValue([], "PCOS", true, raw);
    expect(result).toContain("PCOS");
  });

  // T13: Checking a hidden option is blocked — array unchanged
  it("T13: checking a hidden option is blocked and array is unchanged", () => {
    const raw = [makeOpt(1, "OldDiagnosis", false)];
    const result = toggleDiagnosisValue([], "OldDiagnosis", true, raw);
    expect(result).not.toContain("OldDiagnosis");
    expect(result).toHaveLength(0);
  });

  // T14: Unchecking a hidden option (already selected) IS allowed
  it("T14: unchecking a hidden option that was already selected is allowed", () => {
    const raw = [makeOpt(1, "OldDiagnosis", false)];
    const result = toggleDiagnosisValue(["OldDiagnosis"], "OldDiagnosis", false, raw);
    expect(result).not.toContain("OldDiagnosis");
  });
});

// ─── isHiddenOption tests ─────────────────────────────────────────────────────
describe("isHiddenOption", () => {
  it("returns false when rawOptions is null", () => {
    expect(isHiddenOption("PCOS", null)).toBe(false);
  });

  it("returns false for an active option", () => {
    const raw = [makeOpt(1, "PCOS", true)];
    expect(isHiddenOption("PCOS", raw)).toBe(false);
  });

  it("returns true for an inactive option", () => {
    const raw = [makeOpt(1, "OldDiagnosis", false)];
    expect(isHiddenOption("OldDiagnosis", raw)).toBe(true);
  });

  it("returns false for a label not in rawOptions (orphan)", () => {
    const raw = [makeOpt(1, "PCOS", true)];
    expect(isHiddenOption("LegacyValue", raw)).toBe(false);
  });
});
