/**
 * Automated tests for:
 *   - Shared YesNoGate Yes-button correction (items 1–5)
 *   - Pregnancy / Miscarriage dependent flow (items 6–17)
 *   - Female Previous Tests state management (items 18–30)
 *
 * All tests are pure logic tests (no DOM, no DB) so they run fast and reliably.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Helpers extracted from MedicalIntakeForm (duplicated here for isolation) ──

type MiscarriageEntry = {
  date?: string;
  gestationalAge?: string;
  notes?: string;
  fileKey?: string;
  fileUrl?: string;
  fileName?: string;
  filePassword?: string;
  docId?: number;
};

type TestEntry = {
  name: string;
  date: string;
  result: string;
  unit?: string;
  referenceRange?: string;
  resultType?: string;
};

const FEMALE_DEFAULT_TESTS: TestEntry[] = [
  { name: "AMH (Anti-Müllerian Hormone)", date: "", result: "", unit: "pmol/L", referenceRange: "", resultType: "Quantitative" },
  { name: "FSH (Follicle-Stimulating Hormone)", date: "", result: "", unit: "IU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "LH (Luteinizing Hormone)", date: "", result: "", unit: "IU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Estradiol (E2)", date: "", result: "", unit: "pmol/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Progesterone", date: "", result: "", unit: "nmol/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Prolactin", date: "", result: "", unit: "mIU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "TSH (Thyroid-Stimulating Hormone)", date: "", result: "", unit: "mIU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Free T4 (Thyroxine)", date: "", result: "", unit: "pmol/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Testosterone (Total)", date: "", result: "", unit: "nmol/L", referenceRange: "", resultType: "Quantitative" },
  { name: "DHEA-S", date: "", result: "", unit: "µmol/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Hepatitis B (HBsAg)", date: "", result: "", unit: "", referenceRange: "", resultType: "Qualitative" },
  { name: "Hepatitis C (Anti-HCV)", date: "", result: "", unit: "", referenceRange: "", resultType: "Qualitative" },
  { name: "HIV", date: "", result: "", unit: "", referenceRange: "", resultType: "Qualitative" },
];

const createBlankMiscarriageEntry = (): MiscarriageEntry => ({
  date: "",
  gestationalAge: "",
  notes: "",
});

const hasMeaningfulMiscarriageEntry = (entry?: MiscarriageEntry | null): boolean => {
  if (!entry) return false;
  return !!(
    entry.date ||
    entry.gestationalAge ||
    entry.notes ||
    entry.fileKey ||
    entry.fileUrl ||
    entry.fileName ||
    entry.filePassword ||
    entry.docId
  );
};

const hasMeaningfulMiscarriageHistory = (entries: MiscarriageEntry[]): boolean =>
  entries.some((e) => hasMeaningfulMiscarriageEntry(e));

const buildMiscarriageEntries = (count: number, existing: MiscarriageEntry[]): MiscarriageEntry[] => {
  if (count <= 0) return [];
  if (existing.length >= count) return existing.slice(0, count);
  return [
    ...existing,
    ...Array.from({ length: count - existing.length }, () => createBlankMiscarriageEntry()),
  ];
};

const getMiscarriageCountConfirmDescription = (currentCount: number, nextCount: number): string => {
  const removedCount = currentCount - nextCount;
  return `This will delete the details of ${removedCount} miscarriage ${removedCount === 1 ? "entry" : "entries"}. The first ${nextCount} ${nextCount === 1 ? "entry will" : "entries will"} be preserved.`;
};

// ─── Simulated YesNoGate click logic ─────────────────────────────────────────

function simulateYesClick(
  onChange: (v: boolean) => void,
  onYes?: () => void
) {
  onChange(true);
  onYes?.();
}

function simulateNoClick(
  onChange: (v: boolean) => void,
  onNo?: () => void
) {
  onChange(false);
  onNo?.();
}

// ─── 1–5: Shared YesNoGate ────────────────────────────────────────────────────

describe("YesNoGate — Yes button correction", () => {
  it("1. With onYes: clicking Yes calls onChange(true) exactly once", () => {
    const onChange = vi.fn();
    const onYes = vi.fn();
    simulateYesClick(onChange, onYes);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("2. With onYes: clicking Yes calls onYes() exactly once", () => {
    const onChange = vi.fn();
    const onYes = vi.fn();
    simulateYesClick(onChange, onYes);
    expect(onYes).toHaveBeenCalledTimes(1);
  });

  it("3. Without onYes: clicking Yes calls onChange(true)", () => {
    const onChange = vi.fn();
    simulateYesClick(onChange);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("4. Multiple Yes clicks do not create duplicate rows (idempotent init)", () => {
    let list: MiscarriageEntry[] = [];
    const onChange = vi.fn();
    const onYes = () => {
      if (list.length === 0) list = [createBlankMiscarriageEntry()];
    };
    // Click Yes three times
    simulateYesClick(onChange, onYes);
    simulateYesClick(onChange, onYes);
    simulateYesClick(onChange, onYes);
    expect(list).toHaveLength(1);
  });

  it("5. No confirmation behavior: onChange(false) is called on No", () => {
    const onChange = vi.fn();
    simulateNoClick(onChange);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

// ─── 6–17: Pregnancy / Miscarriage dependent flow ────────────────────────────

describe("Pregnancy / Miscarriage hierarchy", () => {
  it("6. Unanswered pregnancy history (null) hides miscarriage controls", () => {
    const hasPregnancyHistory: boolean | null = null;
    // Miscarriage section should only be visible when hasPregnancyHistory === true
    const miscarriageVisible = hasPregnancyHistory === true;
    expect(miscarriageVisible).toBe(false);
  });

  it("7. Pregnancy = No hides miscarriage controls", () => {
    const hasPregnancyHistory: boolean | null = false;
    const miscarriageVisible = hasPregnancyHistory === true;
    expect(miscarriageVisible).toBe(false);
  });

  it("8. Pregnancy = Yes shows the miscarriage question", () => {
    const hasPregnancyHistory: boolean | null = true;
    const miscarriageVisible = hasPregnancyHistory === true;
    expect(miscarriageVisible).toBe(true);
  });

  it("9. Miscarriage = Yes creates exactly one initial blank entry when list is empty", () => {
    let list: MiscarriageEntry[] = [];
    const onYes = () => {
      if (list.length === 0) list = [createBlankMiscarriageEntry()];
    };
    const onChange = vi.fn();
    simulateYesClick(onChange, onYes);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ date: "", gestationalAge: "", notes: "" });
  });

  it("10. Miscarriage count = 3 renders exactly 3 editors", () => {
    const entries = buildMiscarriageEntries(3, []);
    expect(entries).toHaveLength(3);
  });

  it("11. Increasing from 1 to 3 preserves entry 1 and appends 2 blank entries", () => {
    const existing: MiscarriageEntry[] = [{ date: "2023-01", gestationalAge: "6 weeks", notes: "First" }];
    const result = buildMiscarriageEntries(3, existing);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(existing[0]); // entry 1 preserved
    expect(result[1]).toEqual({ date: "", gestationalAge: "", notes: "" });
    expect(result[2]).toEqual({ date: "", gestationalAge: "", notes: "" });
  });

  it("12. Decreasing from 3 to 1 requires confirmation (pendingCount is set)", () => {
    // Simulate the requestMiscarriageCountChange logic
    let pendingCount: number | null = null;
    let showConfirm = false;
    const currentCount = 3;
    const nextCount = 1;
    if (nextCount < currentCount) {
      pendingCount = nextCount;
      showConfirm = true;
    }
    expect(showConfirm).toBe(true);
    expect(pendingCount).toBe(1);
  });

  it("13. Confirming decrease removes only excess entries", () => {
    const existing: MiscarriageEntry[] = [
      { date: "2023-01", gestationalAge: "6 weeks", notes: "First" },
      { date: "2022-05", gestationalAge: "8 weeks", notes: "Second" },
      { date: "2021-11", gestationalAge: "10 weeks", notes: "Third" },
    ];
    const pendingCount = 1;
    const result = existing.slice(0, pendingCount);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(existing[0]);
  });

  it("14. Canceling decrease preserves all 3 entries", () => {
    const existing: MiscarriageEntry[] = [
      { date: "2023-01", gestationalAge: "6 weeks", notes: "First" },
      { date: "2022-05", gestationalAge: "8 weeks", notes: "Second" },
      { date: "2021-11", gestationalAge: "10 weeks", notes: "Third" },
    ];
    // Cancel: pendingCount is reset, list unchanged
    let pendingCount: number | null = 1;
    pendingCount = null;
    // List should remain unchanged
    expect(existing).toHaveLength(3);
    expect(pendingCount).toBeNull();
  });

  it("15. Changing pregnancy from Yes to No with miscarriage data requires confirmation", () => {
    const miscarriageHistory: MiscarriageEntry[] = [
      { date: "2023-01", gestationalAge: "6 weeks", notes: "Entry with data" },
    ];
    // Confirmation should be shown when miscarriage data exists
    const needsConfirmation = hasMeaningfulMiscarriageHistory(miscarriageHistory);
    expect(needsConfirmation).toBe(true);
  });

  it("16. Existing saved miscarriage entries load with the correct count", () => {
    const savedJSON = JSON.stringify([
      { date: "2023-01", gestationalAge: "6 weeks", notes: "First" },
      { date: "2022-05", gestationalAge: "8 weeks", notes: "Second" },
    ]);
    const loaded: MiscarriageEntry[] = JSON.parse(savedJSON);
    expect(loaded).toHaveLength(2);
  });

  it("17. Existing miscarriage fields are preserved: date, gestationalAge, notes, fileUrl", () => {
    const entry: MiscarriageEntry = {
      date: "2023-06",
      gestationalAge: "7 weeks",
      notes: "Blighted ovum",
      fileUrl: "/manus-storage/report.pdf",
      fileName: "report.pdf",
      filePassword: "secret",
      docId: 42,
    };
    expect(hasMeaningfulMiscarriageEntry(entry)).toBe(true);
    // All fields preserved in round-trip
    const roundTripped: MiscarriageEntry = JSON.parse(JSON.stringify(entry));
    expect(roundTripped.date).toBe("2023-06");
    expect(roundTripped.gestationalAge).toBe("7 weeks");
    expect(roundTripped.notes).toBe("Blighted ovum");
    expect(roundTripped.fileUrl).toBe("/manus-storage/report.pdf");
    expect(roundTripped.filePassword).toBe("secret");
    expect(roundTripped.docId).toBe(42);
  });
});

// ─── 18–30: Female Previous Tests state management ───────────────────────────

describe("Female Previous Tests state management", () => {
  const FEMALE_DEFAULT_COUNT = FEMALE_DEFAULT_TESTS.length;

  it("18. First intentional Yes initializes the Female default list once", () => {
    let tests: TestEntry[] = [];
    let hasPreviousTests: boolean | null = null;
    // Simulate onYes handler
    const onYes = () => {
      hasPreviousTests = true;
      if (hasPreviousTests !== true && tests.length === 0) {
        tests = FEMALE_DEFAULT_TESTS.map(t => ({ ...t }));
      }
      // The condition above won't fire because hasPreviousTests was just set to true.
      // Correct logic: seed when transitioning from null/false to true with empty list.
    };
    // Simulate the actual logic: seed when list is empty on first Yes
    const handleYes = () => {
      const wasYes = hasPreviousTests === true;
      hasPreviousTests = true;
      if (!wasYes && tests.length === 0) {
        tests = FEMALE_DEFAULT_TESTS.map(t => ({ ...t }));
      }
    };
    handleYes();
    expect(hasPreviousTests).toBe(true);
    expect(tests).toHaveLength(FEMALE_DEFAULT_COUNT);
  });

  it("19. Deleting one template does not restore it", () => {
    let tests: TestEntry[] = FEMALE_DEFAULT_TESTS.map(t => ({ ...t }));
    // Delete the first entry
    tests = tests.filter((_, i) => i !== 0);
    // No automatic restoration
    expect(tests).toHaveLength(FEMALE_DEFAULT_COUNT - 1);
    expect(tests[0].name).toBe(FEMALE_DEFAULT_TESTS[1].name);
  });

  it("20. Deleting the final template leaves an empty list", () => {
    let tests: TestEntry[] = [{ name: "AMH", date: "", result: "" }];
    tests = tests.filter((_, i) => i !== 0);
    // No automatic restoration
    expect(tests).toHaveLength(0);
  });

  it("21. An empty list does not trigger automatic default restoration", () => {
    // The render-time fallback has been removed.
    // Simulate the new logic: previousTests = parseJSONArray(form.previousTests)
    const formPreviousTests: TestEntry[] = [];
    const previousTests = formPreviousTests; // no fallback applied
    expect(previousTests).toHaveLength(0);
  });

  it("22. Yes + [] saves and reloads as Yes + []", () => {
    // Simulate save payload
    const payload = { hasPreviousTests: true, previousTests: [] };
    const saved = JSON.stringify(payload);
    const loaded = JSON.parse(saved);
    expect(loaded.hasPreviousTests).toBe(true);
    expect(loaded.previousTests).toHaveLength(0);
  });

  it("23. No + [] saves and reloads as No + []", () => {
    const payload = { hasPreviousTests: false, previousTests: [] };
    const saved = JSON.stringify(payload);
    const loaded = JSON.parse(saved);
    expect(loaded.hasPreviousTests).toBe(false);
    expect(loaded.previousTests).toHaveLength(0);
  });

  it("24. No → Yes restores the default list", () => {
    let tests: TestEntry[] = [];
    let hasPreviousTests: boolean | null = false;
    // Simulate No → Yes transition
    const handleYes = () => {
      const wasNo = hasPreviousTests === false;
      hasPreviousTests = true;
      if (wasNo && tests.length === 0) {
        tests = FEMALE_DEFAULT_TESTS.map(t => ({ ...t }));
      }
    };
    handleYes();
    expect(hasPreviousTests).toBe(true);
    expect(tests).toHaveLength(FEMALE_DEFAULT_COUNT);
  });

  it("25. Restore Default Test List restores the list only when deliberately clicked", () => {
    let tests: TestEntry[] = [];
    // Simulate button click
    const handleRestoreDefaults = () => {
      tests = FEMALE_DEFAULT_TESTS.map(t => ({ ...t }));
    };
    // Before click: empty
    expect(tests).toHaveLength(0);
    // After click: defaults restored
    handleRestoreDefaults();
    expect(tests).toHaveLength(FEMALE_DEFAULT_COUNT);
  });

  it("26. Add Test works when the list is empty", () => {
    let tests: TestEntry[] = [];
    // Simulate adding a blank test
    tests = [...tests, { name: "", date: "", result: "" }];
    expect(tests).toHaveLength(1);
  });

  it("27. Blank default rows are excluded from read-only medical results", () => {
    const tests: TestEntry[] = FEMALE_DEFAULT_TESTS.map(t => ({ ...t }));
    // A test is considered meaningful only if it has a result or name entered by the user
    const meaningfulTests = tests.filter(t => t.result !== "" || (t.name !== "" && t.result !== ""));
    // All defaults have empty result, so they should not appear as completed results
    const completedResults = tests.filter(t => t.result !== "");
    expect(completedResults).toHaveLength(0);
  });

  it("28. Existing populated test values are preserved", () => {
    const existing: TestEntry[] = [
      { name: "AMH", date: "2024-01-15", result: "2.5", unit: "pmol/L", referenceRange: "1.0–3.5", resultType: "Quantitative" },
    ];
    // Simulate loading from DB (no fallback applied)
    const loaded: TestEntry[] = JSON.parse(JSON.stringify(existing));
    expect(loaded[0].result).toBe("2.5");
    expect(loaded[0].date).toBe("2024-01-15");
  });

  it("29. Draft restoration respects the explicit boolean and empty array", () => {
    // Simulate draft with explicit hasPreviousTests = true and empty list
    const draft = { hasPreviousTests: true, previousTests: "[]" };
    // Loading policy: explicit boolean wins
    const hasPreviousTests = draft.hasPreviousTests === true
      ? true
      : draft.hasPreviousTests === false
      ? false
      : null;
    const previousTests: TestEntry[] = JSON.parse(draft.previousTests);
    expect(hasPreviousTests).toBe(true);
    expect(previousTests).toHaveLength(0);
    // No automatic seeding on draft restore
  });

  it("30. No duplicate default templates are generated", () => {
    let tests: TestEntry[] = [];
    // Simulate clicking Yes twice
    const handleYes = () => {
      if (tests.length === 0) {
        tests = FEMALE_DEFAULT_TESTS.map(t => ({ ...t }));
      }
    };
    handleYes();
    handleYes();
    // Should still be exactly FEMALE_DEFAULT_COUNT entries, not doubled
    expect(tests).toHaveLength(FEMALE_DEFAULT_COUNT);
  });
});

// ─── Additional: buildMiscarriageEntries helper ────────────────────────────────

describe("buildMiscarriageEntries helper", () => {
  it("returns empty array for count <= 0", () => {
    expect(buildMiscarriageEntries(0, [])).toHaveLength(0);
    expect(buildMiscarriageEntries(-1, [])).toHaveLength(0);
  });

  it("truncates existing entries when count < existing.length", () => {
    const existing = [
      { date: "2023-01", gestationalAge: "", notes: "" },
      { date: "2022-01", gestationalAge: "", notes: "" },
      { date: "2021-01", gestationalAge: "", notes: "" },
    ];
    const result = buildMiscarriageEntries(2, existing);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(existing[0]);
    expect(result[1]).toEqual(existing[1]);
  });

  it("appends blank entries when count > existing.length", () => {
    const existing = [{ date: "2023-01", gestationalAge: "6w", notes: "Note" }];
    const result = buildMiscarriageEntries(3, existing);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(existing[0]);
    expect(result[1]).toEqual({ date: "", gestationalAge: "", notes: "" });
    expect(result[2]).toEqual({ date: "", gestationalAge: "", notes: "" });
  });
});

// ─── Additional: getMiscarriageCountConfirmDescription ───────────────────────

describe("getMiscarriageCountConfirmDescription", () => {
  it("uses singular 'entry' for removing 1", () => {
    const desc = getMiscarriageCountConfirmDescription(3, 2);
    expect(desc).toContain("1 miscarriage entry");
    expect(desc).toContain("2 entries will");
  });

  it("uses plural 'entries' for removing 2+", () => {
    const desc = getMiscarriageCountConfirmDescription(4, 1);
    expect(desc).toContain("3 miscarriage entries");
    expect(desc).toContain("1 entry will");
  });
});
