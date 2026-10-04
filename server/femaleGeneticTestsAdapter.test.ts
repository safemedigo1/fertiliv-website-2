/**
 * femaleGeneticTestsAdapter.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * 18 unit tests covering all approved scenarios for the Female Genetic Tests
 * UX state machine (REQ-FGT-A through REQ-FGT-E).
 *
 * Test groups:
 *   1. hasMeaningfulFemaleGeneticTest (2 tests)
 *   2. filterMeaningfulEntries (2 tests)
 *   3. deriveGateFromDB (3 tests)
 *   4. deriveFemaleGeneticTestsIntent (5 tests)
 *   5. serializeFemaleGeneticTests (4 tests)
 *   6. validateFemaleGeneticTests (2 tests)
 */

import { describe, it, expect } from "vitest";
import {
  hasMeaningfulFemaleGeneticTest,
  filterMeaningfulEntries,
  deriveGateFromDB,
  deriveFemaleGeneticTestsIntent,
  serializeFemaleGeneticTests,
  validateFemaleGeneticTests,
  createBlankGeneticTestEntry,
  getAddButtonLabel,
  type GeneticTestEntry,
} from "../client/src/lib/femaleGeneticTestsAdapter";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const meaningfulEntry: GeneticTestEntry = { test: "Karyotype", result: "46,XX" };
const blankEntry: GeneticTestEntry = { test: "", date: "", result: "" };
const whitespaceEntry: GeneticTestEntry = { test: "   ", result: "Normal" };

// ─── 1. hasMeaningfulFemaleGeneticTest ────────────────────────────────────────

describe("hasMeaningfulFemaleGeneticTest", () => {
  it("REQ-FGT-MEANINGFUL-1: returns true for an entry with a non-blank test type", () => {
    expect(hasMeaningfulFemaleGeneticTest(meaningfulEntry)).toBe(true);
  });

  it("REQ-FGT-MEANINGFUL-2: returns false for an entry with blank or whitespace-only test type", () => {
    expect(hasMeaningfulFemaleGeneticTest(blankEntry)).toBe(false);
    expect(hasMeaningfulFemaleGeneticTest(whitespaceEntry)).toBe(false);
  });
});

// ─── 2. filterMeaningfulEntries ───────────────────────────────────────────────

describe("filterMeaningfulEntries", () => {
  it("REQ-FGT-FILTER-1: removes blank placeholder entries from a mixed array", () => {
    const entries = [meaningfulEntry, blankEntry, whitespaceEntry];
    expect(filterMeaningfulEntries(entries)).toEqual([meaningfulEntry]);
  });

  it("REQ-FGT-FILTER-2: returns empty array when all entries are blank", () => {
    expect(filterMeaningfulEntries([blankEntry, whitespaceEntry])).toEqual([]);
  });
});

// ─── 3. deriveGateFromDB ──────────────────────────────────────────────────────

describe("deriveGateFromDB", () => {
  it("REQ-FGT-GATE-INIT-1: returns null for null/undefined DB value (unanswered)", () => {
    expect(deriveGateFromDB(null)).toBe(null);
    expect(deriveGateFromDB(undefined)).toBe(null);
  });

  it("REQ-FGT-GATE-INIT-2: returns null for empty array (no saved entries)", () => {
    expect(deriveGateFromDB([])).toBe(null);
  });

  it("REQ-FGT-GATE-INIT-3: returns true when at least one meaningful entry exists", () => {
    expect(deriveGateFromDB([meaningfulEntry])).toBe(true);
    // Array with both meaningful and blank entries → true (meaningful exists)
    expect(deriveGateFromDB([blankEntry, meaningfulEntry])).toBe(true);
  });
});

// ─── 4. deriveFemaleGeneticTestsIntent ───────────────────────────────────────

describe("deriveFemaleGeneticTestsIntent", () => {
  it("REQ-FGT-INTENT-1 (Scenario A): gate=null, not dirty → preserve (user never touched section)", () => {
    expect(deriveFemaleGeneticTestsIntent(null, false, [])).toBe("preserve");
  });

  it("REQ-FGT-INTENT-2 (Scenario D): gate=false → clear (user confirmed No)", () => {
    expect(deriveFemaleGeneticTestsIntent(false, false, [meaningfulEntry])).toBe("clear");
    expect(deriveFemaleGeneticTestsIntent(false, true, [])).toBe("clear");
  });

  it("REQ-FGT-INTENT-3 (Scenario E): gate=null, dirty → clear (user removed last entry)", () => {
    expect(deriveFemaleGeneticTestsIntent(null, true, [])).toBe("clear");
  });

  it("REQ-FGT-INTENT-4 (Scenario B): gate=true, dirty → update (user selected Yes and added entries)", () => {
    expect(deriveFemaleGeneticTestsIntent(true, true, [meaningfulEntry])).toBe("update");
  });

  it("REQ-FGT-INTENT-5 (Scenario C): gate=true, not dirty → update (existing entries loaded from DB)", () => {
    // Gate was initialized from DB, user didn't change anything but saves
    expect(deriveFemaleGeneticTestsIntent(true, false, [meaningfulEntry])).toBe("update");
  });
});

// ─── 5. serializeFemaleGeneticTests ──────────────────────────────────────────

describe("serializeFemaleGeneticTests", () => {
  it("REQ-FGT-SAVE-1: returns undefined when intent is preserve", () => {
    // gate=null, not dirty → preserve → undefined (do not touch DB column)
    expect(serializeFemaleGeneticTests(null, false, [])).toBeUndefined();
  });

  it("REQ-FGT-SAVE-2: returns [] when intent is clear (gate=false)", () => {
    expect(serializeFemaleGeneticTests(false, false, [meaningfulEntry])).toEqual([]);
  });

  it("REQ-FGT-SAVE-3: returns [] when intent is clear (last entry removed, gate=null, dirty)", () => {
    expect(serializeFemaleGeneticTests(null, true, [])).toEqual([]);
  });

  it("REQ-FGT-SAVE-4: returns only meaningful entries when intent is update (filters blank placeholders)", () => {
    const entries = [meaningfulEntry, blankEntry];
    const result = serializeFemaleGeneticTests(true, true, entries);
    expect(result).toEqual([meaningfulEntry]);
  });
});

// ─── 6. validateFemaleGeneticTests ───────────────────────────────────────────

describe("validateFemaleGeneticTests", () => {
  it("REQ-FGT-VALIDATE-1: returns null when gate=true and at least one meaningful entry exists", () => {
    expect(validateFemaleGeneticTests(true, [meaningfulEntry])).toBeNull();
  });

  it("REQ-FGT-VALIDATE-2: returns error message when gate=true but only blank entries exist", () => {
    const error = validateFemaleGeneticTests(true, [blankEntry]);
    expect(error).toBeTruthy();
    expect(typeof error).toBe("string");
  });
});

// ─── 7. createBlankGeneticTestEntry & getAddButtonLabel ──────────────────────

describe("createBlankGeneticTestEntry", () => {
  it("REQ-FGT-AUTO-ENTRY: creates a blank entry that is NOT meaningful", () => {
    const entry = createBlankGeneticTestEntry();
    expect(hasMeaningfulFemaleGeneticTest(entry)).toBe(false);
  });
});

describe("getAddButtonLabel", () => {
  it("REQ-FGT-BUTTON-LABEL-1: returns '+ Add Genetic Test' when no meaningful entries exist", () => {
    expect(getAddButtonLabel([])).toBe("+ Add Genetic Test");
    expect(getAddButtonLabel([blankEntry])).toBe("+ Add Genetic Test");
  });

  it("REQ-FGT-BUTTON-LABEL-2: returns '+ Add Another Genetic Test' when meaningful entries exist", () => {
    expect(getAddButtonLabel([meaningfulEntry])).toBe("+ Add Another Genetic Test");
    expect(getAddButtonLabel([meaningfulEntry, blankEntry])).toBe("+ Add Another Genetic Test");
  });
});
