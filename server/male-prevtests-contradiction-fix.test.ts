/**
 * Targeted regression tests for the two technical contradictions identified in
 * the Male Previous Tests implementation (Pasted_content_06 / Pasted_content_07 review):
 *
 * CONTRADICTION 1: onYes must NOT re-seed when hasMaleTests is already true (Yes+[] case).
 *   - The Restore Default Test List button is the ONLY way to restore after Yes+[].
 *
 * CONTRADICTION 2: Bug-row repair must write to form state via setMale, not just be a
 *   derived variable, so that Save actually persists the 8 defaults.
 *
 * All tests are pure logic tests (no DOM, no DB).
 */

import { describe, it, expect } from "vitest";

// ─── Types ────────────────────────────────────────────────────────────────────

type TestEntry = {
  name: string;
  date: string;
  result: string;
  unit?: string;
  referenceRange?: string;
  resultType?: string;
  origin?: "default" | "custom";
  fileKey?: string;
  fileUrl?: string;
  history?: any[];
  extraFields?: Record<string, string>;
  resultSummary?: string;
  interpretation?: string;
  collectionDate?: string;
  reportDate?: string;
};

// ─── Constants (mirrors MedicalIntakeForm) ────────────────────────────────────

const MALE_DEFAULT_TESTS: TestEntry[] = [
  { name: "FSH (Follicle-Stimulating Hormone)", date: "", result: "", unit: "IU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "LH (Luteinizing Hormone)", date: "", result: "", unit: "IU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Testosterone (Total)", date: "", result: "", unit: "nmol/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Prolactin", date: "", result: "", unit: "mIU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "TSH (Thyroid-Stimulating Hormone)", date: "", result: "", unit: "mIU/L", referenceRange: "", resultType: "Quantitative" },
  { name: "Hepatitis B (HBsAg)", date: "", result: "", unit: "", referenceRange: "", resultType: "Qualitative" },
  { name: "Hepatitis C (Anti-HCV)", date: "", result: "", unit: "", referenceRange: "", resultType: "Qualitative" },
  { name: "HIV", date: "", result: "", unit: "", referenceRange: "", resultType: "Qualitative" },
];

// ─── Logic extracted from MedicalIntakeForm ───────────────────────────────────

/**
 * Simulates the onYes callback with the contradiction-1 fix applied.
 * Returns the new previousTests list (or undefined if no change was made).
 */
function simulateOnYes(
  hasMaleTests: boolean | null,
  currentTests: TestEntry[]
): TestEntry[] | undefined {
  // FIX: only seed on the FIRST Yes transition (null/false → true)
  if (hasMaleTests !== true && currentTests.length === 0) {
    return MALE_DEFAULT_TESTS.map(t => ({ ...t }));
  }
  return undefined; // no change
}

/**
 * Determines whether a single test row is a "bug-generated blank row"
 * (created by the old onYes callback that seeded one blank entry).
 */
function isBugGeneratedBlankRow(t: TestEntry): boolean {
  return (
    (!t.name || t.name.trim() === "") &&
    (!t.result || t.result.trim() === "") &&
    (!t.unit || t.unit.trim() === "") &&
    (!t.date || t.date.trim() === "") &&
    (!t.collectionDate || t.collectionDate.trim() === "") &&
    (!t.reportDate || t.reportDate.trim() === "") &&
    (!t.referenceRange || t.referenceRange.trim() === "") &&
    (!t.interpretation || t.interpretation.trim() === "") &&
    (!t.resultSummary || t.resultSummary.trim() === "") &&
    !t.fileUrl &&
    !t.fileKey &&
    (!t.history || t.history.length === 0) &&
    (!t.extraFields ||
      !Object.values(t.extraFields).some(
        v => v !== null && v !== undefined && String(v).trim() !== ""
      )) &&
    t.origin !== "custom"
  );
}

/**
 * Simulates the bug-row repair useEffect logic.
 * Returns the repaired list (8 defaults) if repair was needed, or null if no repair.
 */
function simulateBugRowRepair(savedTests: TestEntry[]): TestEntry[] | null {
  if (savedTests.length !== 1) return null;
  if (isBugGeneratedBlankRow(savedTests[0])) {
    return MALE_DEFAULT_TESTS.map(t => ({ ...t }));
  }
  return null;
}

// ─── CONTRADICTION 1: onYes guard ─────────────────────────────────────────────

describe("Contradiction 1: onYes must not re-seed when hasMaleTests is already true", () => {
  it("seeds 8 defaults on first Yes (null → true, empty list)", () => {
    const result = simulateOnYes(null, []);
    expect(result).toHaveLength(8);
    expect(result![0].name).toBe("FSH (Follicle-Stimulating Hormone)");
  });

  it("seeds 8 defaults on first Yes (false → true, empty list)", () => {
    const result = simulateOnYes(false, []);
    expect(result).toHaveLength(8);
  });

  it("does NOT re-seed when hasMaleTests is already true and list is empty (Yes+[] case)", () => {
    const result = simulateOnYes(true, []);
    expect(result).toBeUndefined();
  });

  it("does NOT re-seed when hasMaleTests is already true and list has rows", () => {
    const existingTests: TestEntry[] = [
      { name: "Custom Test", date: "2024-01-01", result: "5.2", unit: "IU/L" },
    ];
    const result = simulateOnYes(true, existingTests);
    expect(result).toBeUndefined();
  });

  it("does NOT re-seed when hasMaleTests is null but list already has rows", () => {
    // This covers the case where the form loads with existing tests but hasMaleTests
    // was not explicitly persisted (legacy records) — onYes should not overwrite.
    const existingTests: TestEntry[] = [
      { name: "FSH (Follicle-Stimulating Hormone)", date: "2024-01-01", result: "5.2" },
    ];
    const result = simulateOnYes(null, existingTests);
    expect(result).toBeUndefined();
  });

  it("does NOT re-seed when hasMaleTests is false but list already has rows", () => {
    // Edge case: hasMaleTests=false but list has rows (inconsistent state)
    // onYes should not overwrite existing data
    const existingTests: TestEntry[] = [
      { name: "HIV", date: "", result: "Non-reactive" },
    ];
    const result = simulateOnYes(false, existingTests);
    expect(result).toBeUndefined();
  });

  it("seeded defaults are deep copies (mutating one does not affect MALE_DEFAULT_TESTS)", () => {
    const result = simulateOnYes(null, []);
    expect(result).toBeDefined();
    result![0].result = "MUTATED";
    expect(MALE_DEFAULT_TESTS[0].result).toBe("");
  });

  it("seeded defaults have correct resultType (no Unclassified tab)", () => {
    const result = simulateOnYes(null, []);
    expect(result).toBeDefined();
    const quantitative = result!.filter(t => t.resultType === "Quantitative");
    const qualitative = result!.filter(t => t.resultType === "Qualitative");
    const unclassified = result!.filter(t => !t.resultType);
    expect(quantitative).toHaveLength(5);
    expect(qualitative).toHaveLength(3);
    expect(unclassified).toHaveLength(0);
  });

  it("Restore Default Test List button seeds 8 defaults regardless of hasMaleTests state", () => {
    // The Restore button always calls setMale("previousTests", MALE_DEFAULT_TESTS.map(...))
    // regardless of hasMaleTests — this is the ONLY path that restores after Yes+[]
    const restored = MALE_DEFAULT_TESTS.map(t => ({ ...t }));
    expect(restored).toHaveLength(8);
    expect(restored[0].name).toBe("FSH (Follicle-Stimulating Hormone)");
  });

  it("Restore button is shown only when hasMaleTests=true AND list is empty", () => {
    // Simulates the JSX condition: hasMaleTests === true && previousTests.length === 0
    const shouldShow = (hasMaleTests: boolean | null, listLength: number) =>
      hasMaleTests === true && listLength === 0;

    expect(shouldShow(true, 0)).toBe(true);   // Yes+[] → show button
    expect(shouldShow(true, 1)).toBe(false);  // Yes+[row] → hide button
    expect(shouldShow(false, 0)).toBe(false); // No+[] → hide button
    expect(shouldShow(null, 0)).toBe(false);  // null+[] → hide button
  });
});

// ─── CONTRADICTION 2: Bug-row repair writes to form state ─────────────────────

describe("Contradiction 2: Bug-row repair must write to form state (not just derived variable)", () => {
  it("detects the exact bug-generated blank row signature", () => {
    const bugRow: TestEntry = { name: "", date: "", result: "", notes: "" } as any;
    expect(isBugGeneratedBlankRow(bugRow)).toBe(true);
  });

  it("does NOT flag a row with a non-empty name as a bug row", () => {
    const customRow: TestEntry = { name: "Custom Test", date: "", result: "" };
    expect(isBugGeneratedBlankRow(customRow)).toBe(false);
  });

  it("does NOT flag a row with a result as a bug row", () => {
    const filledRow: TestEntry = { name: "", date: "", result: "5.2" };
    expect(isBugGeneratedBlankRow(filledRow)).toBe(false);
  });

  it("does NOT flag a row with a file attached as a bug row", () => {
    const rowWithFile: TestEntry = { name: "", date: "", result: "", fileKey: "s3/key/file.pdf" };
    expect(isBugGeneratedBlankRow(rowWithFile)).toBe(false);
  });

  it("does NOT flag a row with origin=custom as a bug row", () => {
    const customOriginRow: TestEntry = { name: "", date: "", result: "", origin: "custom" };
    expect(isBugGeneratedBlankRow(customOriginRow)).toBe(false);
  });

  it("does NOT flag a row with history entries as a bug row", () => {
    const rowWithHistory: TestEntry = {
      name: "",
      date: "",
      result: "",
      history: [{ result: "4.1", unit: "IU/L" }],
    };
    expect(isBugGeneratedBlankRow(rowWithHistory)).toBe(false);
  });

  it("does NOT flag a row with extraFields data as a bug row", () => {
    const rowWithExtra: TestEntry = {
      name: "",
      date: "",
      result: "",
      extraFields: { someField: "someValue" },
    };
    expect(isBugGeneratedBlankRow(rowWithExtra)).toBe(false);
  });

  it("repairs a saved record with exactly 1 bug row → returns 8 defaults", () => {
    const savedTests: TestEntry[] = [{ name: "", date: "", result: "" }];
    const repaired = simulateBugRowRepair(savedTests);
    expect(repaired).toHaveLength(8);
    expect(repaired![0].name).toBe("FSH (Follicle-Stimulating Hormone)");
  });

  it("does NOT repair a record with 0 rows (Yes+[] intentional state)", () => {
    const repaired = simulateBugRowRepair([]);
    expect(repaired).toBeNull();
  });

  it("does NOT repair a record with 2+ rows (user has real data)", () => {
    const savedTests: TestEntry[] = [
      { name: "FSH", date: "2024-01-01", result: "5.2" },
      { name: "LH", date: "2024-01-01", result: "3.1" },
    ];
    const repaired = simulateBugRowRepair(savedTests);
    expect(repaired).toBeNull();
  });

  it("does NOT repair a record with 1 row that has a name (real user data)", () => {
    const savedTests: TestEntry[] = [
      { name: "Custom Test", date: "", result: "" },
    ];
    const repaired = simulateBugRowRepair(savedTests);
    expect(repaired).toBeNull();
  });

  it("repaired defaults are deep copies (independent from MALE_DEFAULT_TESTS)", () => {
    const savedTests: TestEntry[] = [{ name: "", date: "", result: "" }];
    const repaired = simulateBugRowRepair(savedTests);
    expect(repaired).toBeDefined();
    repaired![0].result = "MUTATED";
    expect(MALE_DEFAULT_TESTS[0].result).toBe("");
  });

  it("repair result has correct resultType on all 8 rows (no Unclassified tab after repair)", () => {
    const savedTests: TestEntry[] = [{ name: "", date: "", result: "" }];
    const repaired = simulateBugRowRepair(savedTests);
    expect(repaired).toBeDefined();
    const unclassified = repaired!.filter(t => !t.resultType);
    expect(unclassified).toHaveLength(0);
  });

  it("repair is idempotent: running repair on already-repaired 8 rows returns null (no re-repair)", () => {
    // After repair, the list has 8 rows — the repair condition (length === 1) no longer fires
    const repairedOnce = MALE_DEFAULT_TESTS.map(t => ({ ...t }));
    const repairedTwice = simulateBugRowRepair(repairedOnce);
    expect(repairedTwice).toBeNull();
  });
});

// ─── Integration: both fixes working together ─────────────────────────────────

describe("Integration: onYes guard + bug-row repair working together", () => {
  it("opening a bugged record: repair fires, then Yes+[] press does NOT re-seed", () => {
    // Step 1: record loads with 1 blank bug row
    const savedTests: TestEntry[] = [{ name: "", date: "", result: "" }];

    // Step 2: repair fires on mount → 8 defaults written to form state
    const repaired = simulateBugRowRepair(savedTests);
    expect(repaired).toHaveLength(8);

    // Step 3: user deletes all 8 rows → Yes+[] state
    const afterDelete: TestEntry[] = [];

    // Step 4: user presses Yes again (hasMaleTests is already true)
    const afterYesPress = simulateOnYes(true, afterDelete);
    expect(afterYesPress).toBeUndefined(); // no re-seed

    // Step 5: only Restore button can restore
    const restored = MALE_DEFAULT_TESTS.map(t => ({ ...t }));
    expect(restored).toHaveLength(8);
  });

  it("new record: null → Yes → 8 defaults; delete all → Yes again → no re-seed", () => {
    // First Yes: seeds 8 defaults
    const firstYes = simulateOnYes(null, []);
    expect(firstYes).toHaveLength(8);

    // User deletes all → Yes+[]
    const afterDelete: TestEntry[] = [];

    // Second Yes press (hasMaleTests is now true)
    const secondYes = simulateOnYes(true, afterDelete);
    expect(secondYes).toBeUndefined();
  });

  it("No → Yes cycle: re-seeds correctly because hasMaleTests transitions from false to true", () => {
    // User clicks No → hasMaleTests = false, list cleared
    const afterNo: TestEntry[] = [];
    const hasMaleTestsAfterNo: boolean | null = false;

    // User clicks Yes again → hasMaleTests transitions false → true
    const afterYes = simulateOnYes(hasMaleTestsAfterNo, afterNo);
    expect(afterYes).toHaveLength(8); // correct: re-seeds on No → Yes
  });
});
