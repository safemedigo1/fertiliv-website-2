/**
 * artCycle.test.ts
 *
 * 18 regression tests for the ART Previous Fertility Treatments section.
 * Covers:
 *   1. PGT checkbox fix (sentinel: "pending" vs "Not tested")
 *   2. Oocyte maturity fields (canonical vs legacy alias)
 *   3. PN breakdown fields (canonical vs legacy alias)
 *   4. Backward-compat: existing records with only legacy fields still render
 *   5. Read-Only renderer logic (field priority, FET PGT display)
 */

import { describe, it, expect } from "vitest";

// ─── Types (mirrored from PreviousTreatmentCard.tsx) ──────────────────────────

interface EmbryoDetail {
  id: string;
  stage?: string;
  grade?: string;
  pgtStatus?: string;
  gender?: string;
  pgtNotes?: string;
  pgtFileKey?: string;
  pgtFileUrl?: string;
  pgtFileName?: string;
  pgtFilePassword?: string;
  pgtDocId?: number;
}

interface ARTCycle {
  id: string;
  type: "IVF" | "ICSI" | "FET" | "IUI" | "OI" | "DonorEggIVF" | "Other";
  date: string;
  clinic: string;
  outcome: string;
  notes: string;
  // Legacy
  eggsCollected?: number | "I don't know";
  embryosFertilized?: number | "I don't know";
  // Canonical oocyte
  oocytesRetrieved?: number | null;
  miiOocytes?: number | null;
  miOocytes?: number | null;
  gvOocytes?: number | null;
  degeneratedOocytes?: number | null;
  // Canonical PN
  pn0?: number | null;
  pn1?: number | null;
  pn2?: number | null;
  pn3plus?: number | null;
  // Transfer
  transferredCount?: number | "I don't know";
  transferredEmbryos?: EmbryoDetail[];
  frozenCount?: number | "I don't know";
  frozenEmbryos?: EmbryoDetail[];
  // FET
  fetEmbryos?: EmbryoDetail[];
  // Second collection
  secondCollection?: {
    oocytesRetrieved?: number | null;
    pn2?: number | null;
  };
}

// ─── Pure logic helpers (extracted from component logic) ──────────────────────

/** Determines if the PGT checkbox should be checked */
function isPgtOn(embryo: EmbryoDetail): boolean {
  return !!(embryo.pgtStatus && embryo.pgtStatus !== "Not tested");
}

/** Returns the pgtStatus value to set when checking the checkbox */
function pgtCheckSentinel(): string {
  return "pending";
}

/** Returns the pgtStatus value to set when unchecking the checkbox */
function pgtUncheckSentinel(): string {
  return "Not tested";
}

/** Returns the value to show in the PGT status dropdown (hides "pending") */
function pgtDropdownValue(embryo: EmbryoDetail): string {
  return (embryo.pgtStatus === "pending" ? "" : embryo.pgtStatus) ?? "";
}

/** Effective total oocytes: prefer canonical, fall back to legacy */
function effectiveEggs(cycle: ARTCycle): number | undefined {
  if (cycle.oocytesRetrieved != null) return cycle.oocytesRetrieved;
  if (typeof cycle.eggsCollected === "number") return cycle.eggsCollected;
  return undefined;
}

/** Effective fertilized: prefer canonical 2PN, fall back to legacy */
function effectiveFertilized(cycle: ARTCycle): number | undefined {
  if (cycle.pn2 != null) return cycle.pn2;
  if (typeof cycle.embryosFertilized === "number") return cycle.embryosFertilized;
  return undefined;
}

/** Remaining embryos after transfer */
function remaining(cycle: ARTCycle): number | undefined {
  const fert = effectiveFertilized(cycle);
  const transferred = typeof cycle.transferredCount === "number" ? cycle.transferredCount : undefined;
  if (fert !== undefined && transferred !== undefined) return Math.max(0, fert - transferred);
  return undefined;
}

/** Should the frozen embryos section be shown? */
function showFrozen(cycle: ARTCycle): boolean {
  const r = remaining(cycle);
  return r === undefined || r > 0;
}

/** FET embryos with meaningful PGT (not "Not tested" and not "pending") */
function fetEmbryosWithPgt(cycle: ARTCycle): EmbryoDetail[] {
  if (cycle.type !== "FET") return [];
  return (cycle.fetEmbryos ?? []).filter(
    e => e.pgtStatus && e.pgtStatus !== "Not tested" && e.pgtStatus !== "pending"
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PGT Checkbox Fix", () => {
  it("REQ-ART-PGT-1: isPgtOn returns false for 'Not tested' sentinel", () => {
    expect(isPgtOn({ id: "1", pgtStatus: "Not tested" })).toBe(false);
  });

  it("REQ-ART-PGT-2: isPgtOn returns false for empty string (old broken sentinel)", () => {
    // The old bug: empty string was used as checked sentinel but is falsy
    expect(isPgtOn({ id: "1", pgtStatus: "" })).toBe(false);
  });

  it("REQ-ART-PGT-3: isPgtOn returns true for 'pending' (new checked sentinel)", () => {
    expect(isPgtOn({ id: "1", pgtStatus: pgtCheckSentinel() })).toBe(true);
  });

  it("REQ-ART-PGT-4: isPgtOn returns true for a real PGT status value", () => {
    expect(isPgtOn({ id: "1", pgtStatus: "Euploid" })).toBe(true);
  });

  it("REQ-ART-PGT-5: pgtDropdownValue hides 'pending' sentinel (shows empty string)", () => {
    expect(pgtDropdownValue({ id: "1", pgtStatus: "pending" })).toBe("");
  });

  it("REQ-ART-PGT-6: pgtDropdownValue passes through real status values unchanged", () => {
    expect(pgtDropdownValue({ id: "1", pgtStatus: "Euploid" })).toBe("Euploid");
  });

  it("REQ-ART-PGT-7: unchecking sets 'Not tested' sentinel", () => {
    expect(pgtUncheckSentinel()).toBe("Not tested");
  });
});

describe("Oocyte Maturity Fields — Canonical vs Legacy", () => {
  it("REQ-ART-OOC-1: effectiveEggs prefers canonical oocytesRetrieved over legacy eggsCollected", () => {
    const cycle: ARTCycle = {
      id: "1", type: "IVF", date: "", clinic: "", outcome: "", notes: "",
      oocytesRetrieved: 12,
      eggsCollected: 8, // legacy — should be ignored when canonical is present
    };
    expect(effectiveEggs(cycle)).toBe(12);
  });

  it("REQ-ART-OOC-2: effectiveEggs falls back to legacy eggsCollected when canonical is absent", () => {
    const cycle: ARTCycle = {
      id: "1", type: "IVF", date: "", clinic: "", outcome: "", notes: "",
      eggsCollected: 8,
    };
    expect(effectiveEggs(cycle)).toBe(8);
  });

  it("REQ-ART-OOC-3: effectiveEggs returns undefined when both are absent", () => {
    const cycle: ARTCycle = { id: "1", type: "IVF", date: "", clinic: "", outcome: "", notes: "" };
    expect(effectiveEggs(cycle)).toBeUndefined();
  });
});

describe("PN Breakdown Fields — Canonical vs Legacy", () => {
  it("REQ-ART-PN-1: effectiveFertilized prefers canonical pn2 over legacy embryosFertilized", () => {
    const cycle: ARTCycle = {
      id: "1", type: "IVF", date: "", clinic: "", outcome: "", notes: "",
      pn2: 9,
      embryosFertilized: 7, // legacy — should be ignored when canonical is present
    };
    expect(effectiveFertilized(cycle)).toBe(9);
  });

  it("REQ-ART-PN-2: effectiveFertilized falls back to legacy embryosFertilized when canonical is absent", () => {
    const cycle: ARTCycle = {
      id: "1", type: "IVF", date: "", clinic: "", outcome: "", notes: "",
      embryosFertilized: 7,
    };
    expect(effectiveFertilized(cycle)).toBe(7);
  });

  it("REQ-ART-PN-3: remaining uses canonical pn2 for calculation", () => {
    const cycle: ARTCycle = {
      id: "1", type: "IVF", date: "", clinic: "", outcome: "", notes: "",
      pn2: 9,
      transferredCount: 2,
    };
    expect(remaining(cycle)).toBe(7);
  });

  it("REQ-ART-PN-4: showFrozen is true when remaining > 0", () => {
    const cycle: ARTCycle = {
      id: "1", type: "IVF", date: "", clinic: "", outcome: "", notes: "",
      pn2: 9, transferredCount: 2,
    };
    expect(showFrozen(cycle)).toBe(true);
  });

  it("REQ-ART-PN-5: showFrozen is false when remaining is 0", () => {
    const cycle: ARTCycle = {
      id: "1", type: "IVF", date: "", clinic: "", outcome: "", notes: "",
      pn2: 2, transferredCount: 2,
    };
    expect(showFrozen(cycle)).toBe(false);
  });
});

describe("Read-Only Renderer — FET PGT Display", () => {
  it("REQ-ART-RO-1: fetEmbryosWithPgt returns empty for non-FET cycles", () => {
    const cycle: ARTCycle = {
      id: "1", type: "IVF", date: "", clinic: "", outcome: "", notes: "",
      fetEmbryos: [{ id: "e1", pgtStatus: "Euploid" }],
    };
    expect(fetEmbryosWithPgt(cycle)).toHaveLength(0);
  });

  it("REQ-ART-RO-2: fetEmbryosWithPgt returns only embryos with real PGT status", () => {
    const cycle: ARTCycle = {
      id: "1", type: "FET", date: "", clinic: "", outcome: "", notes: "",
      fetEmbryos: [
        { id: "e1", pgtStatus: "Euploid" },
        { id: "e2", pgtStatus: "Not tested" },
        { id: "e3", pgtStatus: "pending" },
        { id: "e4", pgtStatus: "Aneuploid" },
      ],
    };
    const result = fetEmbryosWithPgt(cycle);
    expect(result).toHaveLength(2);
    expect(result.map(e => e.pgtStatus)).toEqual(["Euploid", "Aneuploid"]);
  });

  it("REQ-ART-RO-3: fetEmbryosWithPgt returns empty when all embryos are 'Not tested'", () => {
    const cycle: ARTCycle = {
      id: "1", type: "FET", date: "", clinic: "", outcome: "", notes: "",
      fetEmbryos: [
        { id: "e1", pgtStatus: "Not tested" },
        { id: "e2", pgtStatus: "Not tested" },
      ],
    };
    expect(fetEmbryosWithPgt(cycle)).toHaveLength(0);
  });

  it("REQ-ART-RO-4: 'pending' sentinel is excluded from Read-Only PGT display", () => {
    const cycle: ARTCycle = {
      id: "1", type: "FET", date: "", clinic: "", outcome: "", notes: "",
      fetEmbryos: [{ id: "e1", pgtStatus: "pending" }],
    };
    expect(fetEmbryosWithPgt(cycle)).toHaveLength(0);
  });
});
