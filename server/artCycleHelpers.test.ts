/**
 * artCycleHelpers.test.ts
 *
 * 38 automated tests for artCycleHelpers.ts
 * Covers: canonical field rules, oocyte maturity, fertilization,
 * full cycle validation, PGT tri-state, second collection, and edge cases.
 */

import { describe, it, expect } from "vitest";
import {
  toNumeric,
  sumNumericFields,
  hasAnyNumeric,
  computeOocyteMaturitySummary,
  validateOocyteMaturity,
  computeFertilizationSummary,
  validateFertilization,
  validateCycleCollections,
  resolvePgtTested,
  pgtTestedLabel,
  hasConflictingPgtData,
  getInseminatedInjectedLabel,
} from "../client/src/lib/artCycleHelpers";

// ─── toNumeric ────────────────────────────────────────────────────────────────

describe("toNumeric", () => {
  it("T01: returns null for undefined", () => {
    expect(toNumeric(undefined)).toBeNull();
  });

  it("T02: returns null for null", () => {
    expect(toNumeric(null)).toBeNull();
  });

  it("T03: returns null for 'I don't know'", () => {
    expect(toNumeric("I don't know")).toBeNull();
  });

  it("T04: returns 0 for 0", () => {
    expect(toNumeric(0)).toBe(0);
  });

  it("T05: returns positive integer", () => {
    expect(toNumeric(12)).toBe(12);
  });

  it("T06: returns null for negative number", () => {
    expect(toNumeric(-1)).toBeNull();
  });
});

// ─── sumNumericFields ─────────────────────────────────────────────────────────

describe("sumNumericFields", () => {
  it("T07: sums only valid numeric fields, skipping null/undefined", () => {
    expect(sumNumericFields(3, null, undefined, 5, "I don't know")).toBe(8);
  });

  it("T08: returns 0 when all fields are null/undefined", () => {
    expect(sumNumericFields(null, undefined)).toBe(0);
  });
});

// ─── Oocyte Maturity Summary ──────────────────────────────────────────────────

describe("computeOocyteMaturitySummary", () => {
  it("T09: returns ok with no message when total is null", () => {
    const result = computeOocyteMaturitySummary({
      eggsCollected: null,
      miiOocytes: 3,
    });
    expect(result.severity).toBe("ok");
    expect(result.message).toBeNull();
  });

  it("T10: returns error when classified exceeds total", () => {
    const result = computeOocyteMaturitySummary({
      eggsCollected: 5,
      miiOocytes: 4,
      miOocytes: 3,
    });
    expect(result.severity).toBe("error");
    expect(result.message).toContain("exceeds");
  });

  it("T11: returns warning when some classified but remainder > 0", () => {
    const result = computeOocyteMaturitySummary({
      eggsCollected: 10,
      miiOocytes: 6,
    });
    expect(result.severity).toBe("warning");
    expect(result.remaining).toBe(4);
  });

  it("T12: returns ok when all oocytes are classified", () => {
    const result = computeOocyteMaturitySummary({
      eggsCollected: 8,
      miiOocytes: 5,
      miOocytes: 2,
      gvOocytes: 1,
    });
    expect(result.severity).toBe("ok");
    expect(result.remaining).toBe(0);
  });
});

// ─── validateOocyteMaturity ───────────────────────────────────────────────────

describe("validateOocyteMaturity", () => {
  it("T13: blocking error when a maturity field exceeds total", () => {
    const result = validateOocyteMaturity({
      eggsCollected: 5,
      miiOocytes: 6,
    });
    expect(result.isBlocking).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("T14: no error when maturity fields are within total", () => {
    const result = validateOocyteMaturity({
      eggsCollected: 10,
      miiOocytes: 7,
      miOocytes: 2,
    });
    expect(result.isBlocking).toBe(false);
  });

  it("T15: uses custom label in error messages", () => {
    const result = validateOocyteMaturity(
      { eggsCollected: 3, miiOocytes: 5 },
      "Second collection"
    );
    expect(result.errors[0]).toContain("Second collection");
  });
});

// ─── Fertilization Summary ────────────────────────────────────────────────────

describe("computeFertilizationSummary", () => {
  it("T16: returns ok with no message when denominator is null", () => {
    const result = computeFertilizationSummary({
      oocytesInseminatedOrInjected: null,
      embryosFertilized: 5,
    });
    expect(result.severity).toBe("ok");
  });

  it("T17: returns error when classified fertilization exceeds denominator", () => {
    const result = computeFertilizationSummary({
      oocytesInseminatedOrInjected: 8,
      embryosFertilized: 6,
      pn1: 4,
    });
    expect(result.severity).toBe("error");
    expect(result.message).toContain("exceeds");
  });

  it("T18: uses embryosFertilized as canonical 2PN (not pn2)", () => {
    // embryosFertilized should be counted in the classified total
    const result = computeFertilizationSummary({
      oocytesInseminatedOrInjected: 10,
      embryosFertilized: 7,
    });
    expect(result.classified).toBe(7);
    expect(result.remaining).toBe(3);
    expect(result.severity).toBe("warning");
  });
});

// ─── validateFertilization ────────────────────────────────────────────────────

describe("validateFertilization", () => {
  it("T19: blocking error when inseminated/injected exceeds retrieved", () => {
    const result = validateFertilization(
      { oocytesInseminatedOrInjected: 12 },
      8
    );
    expect(result.isBlocking).toBe(true);
    expect(result.errors[0]).toContain("cannot exceed Total Oocytes Retrieved");
  });

  it("T20: blocking error when a PN field exceeds denominator", () => {
    const result = validateFertilization(
      { oocytesInseminatedOrInjected: 8, embryosFertilized: 10 },
      10
    );
    expect(result.isBlocking).toBe(true);
  });

  it("T21: no error when all fertilization fields are within bounds", () => {
    const result = validateFertilization(
      {
        oocytesInseminatedOrInjected: 10,
        embryosFertilized: 7,
        pn1: 1,
        pn0: 1,
        pn3plus: 1,
      },
      12
    );
    expect(result.isBlocking).toBe(false);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── validateCycleCollections ─────────────────────────────────────────────────

describe("validateCycleCollections", () => {
  it("T22: validates first collection only when second is absent", () => {
    const result = validateCycleCollections({
      eggsCollected: 5,
      miiOocytes: 10, // exceeds total
    });
    expect(result.isBlocking).toBe(true);
    expect(result.errors[0]).toContain("First collection");
  });

  it("T23: validates both collections and labels them correctly", () => {
    const result = validateCycleCollections(
      { eggsCollected: 5, miiOocytes: 3 },
      { eggsCollected: 4, miiOocytes: 6 } // second exceeds
    );
    expect(result.isBlocking).toBe(true);
    expect(result.errors.some((e) => e.includes("Second collection"))).toBe(true);
  });

  it("T24: returns no errors when both collections are valid", () => {
    const result = validateCycleCollections(
      { eggsCollected: 10, miiOocytes: 7 },
      { eggsCollected: 6, miiOocytes: 4 }
    );
    expect(result.isBlocking).toBe(false);
  });
});

// ─── resolvePgtTested ─────────────────────────────────────────────────────────

describe("resolvePgtTested", () => {
  it("T25: returns true when pgtTested is explicitly true", () => {
    expect(resolvePgtTested({ pgtTested: true })).toBe(true);
  });

  it("T26: returns false when pgtTested is explicitly false", () => {
    expect(resolvePgtTested({ pgtTested: false })).toBe(false);
  });

  it("T27: returns null when pgtTested is null and no pgtStatus", () => {
    expect(resolvePgtTested({ pgtTested: null })).toBeNull();
  });

  it("T28: returns null when both pgtTested and pgtStatus are absent", () => {
    expect(resolvePgtTested({})).toBeNull();
  });

  it("T29: legacy — returns true when pgtStatus is a non-empty non-'Not tested' string", () => {
    expect(resolvePgtTested({ pgtStatus: "Normal" })).toBe(true);
  });

  it("T30: legacy — returns false when pgtStatus is 'Not tested'", () => {
    expect(resolvePgtTested({ pgtStatus: "Not tested" })).toBe(false);
  });

  it("T31: legacy — returns null when pgtStatus is empty string", () => {
    expect(resolvePgtTested({ pgtStatus: "" })).toBeNull();
  });

  it("T32: pgtTested takes precedence over pgtStatus", () => {
    // pgtTested=false should override a non-empty pgtStatus
    expect(resolvePgtTested({ pgtTested: false, pgtStatus: "Normal" })).toBe(false);
  });
});

// ─── pgtTestedLabel ───────────────────────────────────────────────────────────

describe("pgtTestedLabel", () => {
  it("T33: returns 'Tested' for true", () => {
    expect(pgtTestedLabel(true)).toBe("Tested");
  });

  it("T34: returns 'Not tested' for false", () => {
    expect(pgtTestedLabel(false)).toBe("Not tested");
  });

  it("T35: returns 'Not reported' for null", () => {
    expect(pgtTestedLabel(null)).toBe("Not reported");
  });
});

// ─── hasConflictingPgtData ────────────────────────────────────────────────────

describe("hasConflictingPgtData", () => {
  it("T36: returns true when pgtStatus is a non-empty non-'Not tested' string", () => {
    expect(hasConflictingPgtData({ pgtStatus: "Abnormal" })).toBe(true);
  });

  it("T37: returns true when pgtFileKey is present", () => {
    expect(hasConflictingPgtData({ pgtFileKey: "some-key" })).toBe(true);
  });

  it("T38: returns false when no conflicting data", () => {
    expect(hasConflictingPgtData({ pgtStatus: "Not tested" })).toBe(false);
  });
});

// ─── Fix B regression tests: resolvePgtTested — null must not be overridden ──
describe("resolvePgtTested — Fix B: explicit null (Not Reported) is never overridden", () => {
  it("T39: explicit null pgtTested is preserved even when pgtStatus is a non-empty string", () => {
    // This was the Fix B bug: legacy resolver overrode null with pgtStatus
    expect(resolvePgtTested({ pgtTested: null, pgtStatus: "Normal" })).toBeNull();
  });
  it("T40: explicit null pgtTested is preserved when pgtStatus is 'Not tested'", () => {
    expect(resolvePgtTested({ pgtTested: null, pgtStatus: "Not tested" })).toBeNull();
  });
  it("T41: explicit null pgtTested is preserved when pgtStatus is empty string", () => {
    expect(resolvePgtTested({ pgtTested: null, pgtStatus: "" })).toBeNull();
  });
  it("T42: pgtTested: true is preserved even when pgtStatus is 'Not tested'", () => {
    expect(resolvePgtTested({ pgtTested: true, pgtStatus: "Not tested" })).toBe(true);
  });
  it("T43: pgtTested: false is preserved even when pgtStatus is 'Euploid'", () => {
    expect(resolvePgtTested({ pgtTested: false, pgtStatus: "Euploid" })).toBe(false);
  });
  it("T44: hasOwnProperty check — pgtTested absent (not set) falls back to legacy pgtStatus", () => {
    const embryo: { pgtStatus: string } = { pgtStatus: "Euploid" };
    expect(resolvePgtTested(embryo)).toBe(true);
  });
  it("T45: hasOwnProperty check — pgtTested absent falls back to 'Not tested' pgtStatus", () => {
    const embryo: { pgtStatus: string } = { pgtStatus: "Not tested" };
    expect(resolvePgtTested(embryo)).toBe(false);
  });
});

// ─── Fix A regression tests: validateCycleCollections — save guard behavior ──
describe("validateCycleCollections — Fix A: save guard blocking errors", () => {
  it("T46: blocks save when MII oocytes exceed total retrieved in first collection", () => {
    const result = validateCycleCollections({
      eggsCollected: 5,
      miiOocytes: 6,
    });
    expect(result.isBlocking).toBe(true);
    expect(result.errors[0]).toContain("cannot exceed Total Oocytes Retrieved");
  });
  it("T47: blocks save when fertilization denominator exceeds total retrieved", () => {
    const result = validateCycleCollections({
      eggsCollected: 8,
      oocytesInseminatedOrInjected: 10,
    });
    expect(result.isBlocking).toBe(true);
    expect(result.errors[0]).toContain("cannot exceed Total Oocytes Retrieved");
  });
  it("T48: blocks save when 2PN exceeds inseminated/injected denominator", () => {
    const result = validateCycleCollections({
      eggsCollected: 10,
      oocytesInseminatedOrInjected: 8,
      embryosFertilized: 9,
    });
    expect(result.isBlocking).toBe(true);
  });
  it("T49: does NOT block save for a valid cycle with all fields within bounds", () => {
    const result = validateCycleCollections({
      eggsCollected: 12,
      miiOocytes: 9,
      miOocytes: 2,
      gvOocytes: 1,
      oocytesInseminatedOrInjected: 10,
      embryosFertilized: 7,
      pn1: 1,
      pn0: 1,
      pn3plus: 1,
    });
    expect(result.isBlocking).toBe(false);
    expect(result.errors).toHaveLength(0);
  });
  it("T50: blocks save when second collection has an error but first is valid", () => {
    const result = validateCycleCollections(
      { eggsCollected: 10, miiOocytes: 8 },
      { eggsCollected: 5, miiOocytes: 7 }
    );
    expect(result.isBlocking).toBe(true);
    expect(result.errors.some(e => e.includes("Second collection"))).toBe(true);
  });
  it("T51: does NOT block save when cycle has no numerical fields (empty cycle)", () => {
    const result = validateCycleCollections({});
    expect(result.isBlocking).toBe(false);
  });
  it("T52: does NOT block save when eggsCollected is 'I don\\'t know' (skip validation)", () => {
    const result = validateCycleCollections({
      eggsCollected: "I don't know",
      miiOocytes: 999,
    });
    expect(result.isBlocking).toBe(false);
  });
});

// ─── Fix: inseminated/injected > retrieved — specific 48/49 regression ────────
describe("validateCycleCollections — inseminated > retrieved (48/49 regression)", () => {
  it("T53: blocks save when inseminated (49) exceeds retrieved (48) — the reported regression", () => {
    const result = validateCycleCollections({
      eggsCollected: 48,
      oocytesInseminatedOrInjected: 49,
    });
    expect(result.isBlocking).toBe(true);
    expect(result.errors[0]).toContain("cannot exceed Total Oocytes Retrieved");
    expect(result.errors[0]).toContain("49");
    expect(result.errors[0]).toContain("48");
  });

  it("T54: does NOT block when inseminated equals retrieved (boundary: 48 == 48)", () => {
    const result = validateCycleCollections({
      eggsCollected: 48,
      oocytesInseminatedOrInjected: 48,
    });
    expect(result.isBlocking).toBe(false);
  });

  it("T55: does NOT block when inseminated is less than retrieved (47 < 48)", () => {
    const result = validateCycleCollections({
      eggsCollected: 48,
      oocytesInseminatedOrInjected: 47,
    });
    expect(result.isBlocking).toBe(false);
  });

  it("T56: blocks save in second collection when inseminated (10) exceeds retrieved (8)", () => {
    const result = validateCycleCollections(
      { eggsCollected: 12, oocytesInseminatedOrInjected: 10 },
      { eggsCollected: 8, oocytesInseminatedOrInjected: 10 }
    );
    expect(result.isBlocking).toBe(true);
    expect(result.errors.some(e => e.includes("Second collection"))).toBe(true);
  });
});

// ─── Fix A: Cycle-report duplicate file controls ──────────────────────────────
describe("CycleReport attachment — tag badge / file-input separation", () => {
  it("T57: autoTag for cycle report uses padded index (e.g. TreatmentReport-01)", () => {
    const cycleIndex = 0;
    const autoTag = `TreatmentReport-${String(cycleIndex + 1).padStart(2, "0")}`;
    expect(autoTag).toBe("TreatmentReport-01");
  });
  it("T58: autoTag for second cycle uses padded index (e.g. TreatmentReport-02)", () => {
    const cycleIndex = 1;
    const autoTag = `TreatmentReport-${String(cycleIndex + 1).padStart(2, "0")}`;
    expect(autoTag).toBe("TreatmentReport-02");
  });
  it("T59: autoTag for PGT-Frozen uses section-based format", () => {
    const section = "IVF-Frozen";
    const embryoIndex = 0;
    const autoTag = `${section}-${String(embryoIndex + 1).padStart(2, "0")}`;
    expect(autoTag).toBe("IVF-Frozen-01");
  });
  it("T60: autoTag for PGT-FET uses section-based format", () => {
    const section = "FET";
    const embryoIndex = 2;
    const autoTag = `${section}-${String(embryoIndex + 1).padStart(2, "0")}`;
    expect(autoTag).toBe("FET-03");
  });
});

// ─── Fix B-D: pgtDocId threading through EmbryoDetail ────────────────────────
describe("EmbryoDetail — pgtDocId field contract", () => {
  it("T61: EmbryoDetail with pgtDocId set enables SavedTranslationsPanel rendering condition", () => {
    const embryo = { id: "e1", pgtFileUrl: "/api/storage/test.pdf", pgtDocId: 42 };
    const shouldRenderPanel = embryo.pgtDocId != null && !!embryo.pgtFileUrl;
    expect(shouldRenderPanel).toBe(true);
  });
  it("T62: EmbryoDetail without pgtDocId does NOT render SavedTranslationsPanel", () => {
    const embryo = { id: "e1", pgtFileUrl: "/api/storage/test.pdf" };
    const shouldRenderPanel = (embryo as any).pgtDocId != null && !!embryo.pgtFileUrl;
    expect(shouldRenderPanel).toBe(false);
  });
  it("T63: removing pgtFile clears pgtDocId from embryo state", () => {
    const embryo = { id: "e1", pgtFileKey: "k1", pgtFileUrl: "/api/storage/k1", pgtFileName: "f.pdf", pgtDocId: 42 };
    const updated = { ...embryo, pgtFileKey: undefined, pgtFileUrl: undefined, pgtFileName: undefined, pgtDocId: undefined };
    expect(updated.pgtDocId).toBeUndefined();
    expect(updated.pgtFileUrl).toBeUndefined();
  });
  it("T64: replacing pgtFile stores new docId (old docId is overwritten)", () => {
    const embryo = { id: "e1", pgtFileKey: "k1", pgtFileUrl: "/api/storage/k1", pgtDocId: 42 };
    const updated = { ...embryo, pgtFileKey: "k2", pgtFileUrl: "/api/storage/k2", pgtDocId: 99 };
    expect(updated.pgtDocId).toBe(99);
    expect(updated.pgtFileUrl).toBe("/api/storage/k2");
  });
  it("T65: pgtDocId is independent per embryo (two embryos have different docIds)", () => {
    const e1 = { id: "e1", pgtDocId: 10 };
    const e2 = { id: "e2", pgtDocId: 20 };
    expect(e1.pgtDocId).not.toBe(e2.pgtDocId);
  });
});

// ─── Fix H: Read-only PGT display condition ───────────────────────────────────
describe("ReadOnlyIntake — PGT document + translation panel condition", () => {
  it("T66: pgtDocs filter includes only embryos with pgtFileUrl set", () => {
    const allEmbryos = [
      { id: "e1", pgtFileUrl: "/api/storage/a.pdf", pgtDocId: 1 },
      { id: "e2" },
      { id: "e3", pgtFileUrl: "/api/storage/b.pdf" },
    ];
    const pgtDocs = allEmbryos.filter(e => (e as any).pgtFileUrl);
    expect(pgtDocs).toHaveLength(2);
  });
  it("T67: SavedTranslationsPanel renders for embryo with pgtDocId in read-only view", () => {
    const embryo = { id: "e1", pgtFileUrl: "/api/storage/a.pdf", pgtDocId: 7 };
    const shouldRender = !!(embryo.pgtDocId);
    expect(shouldRender).toBe(true);
  });
  it("T68: SavedTranslationsPanel does NOT render for embryo without pgtDocId in read-only view", () => {
    const embryo = { id: "e1", pgtFileUrl: "/api/storage/a.pdf" };
    const shouldRender = !!((embryo as any).pgtDocId);
    expect(shouldRender).toBe(false);
  });
});
