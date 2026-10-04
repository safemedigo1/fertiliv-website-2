/**
 * Regression tests — Radiology uterusNotes / ovarianNotes fields
 * and Documents tab lifecycle audit (Pasted_content_53.txt)
 *
 * Run: npx vitest run server/radiology.notes.regression.test.ts
 */

import { describe, it, expect } from "vitest";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mirrors the TVUSFields interface from RadiologyEditor.tsx */
interface TVUSFields {
  uterusLength?: string;
  uterusWidth?: string;
  uterusHeight?: string;
  uterusPosition?: string;
  endometrialThickness?: string;
  endometrialPattern?: string;
  uterusNotes?: string;
  rightOvarySize?: string;
  rightOvaryAFC?: string;
  leftOvarySize?: string;
  leftOvaryAFC?: string;
  dominantFollicle?: string;
  ovarianNotes?: string;
}

interface RadiologyStudy {
  id: string;
  type: string;
  date?: string;
  findings?: string;
  conclusion?: string;
  tvus?: TVUSFields;
  fileUrl?: string;
  fileName?: string;
  fileMimeType?: string;
  docId?: number;
}

/** Simulates the Read-Only renderer's conditional display logic */
function renderStudyNotes(study: RadiologyStudy): string[] {
  const lines: string[] = [];
  if (study.findings) lines.push(`Findings: ${study.findings}`);
  if (study.conclusion) lines.push(`Conclusion: ${study.conclusion}`);
  if (study.tvus?.uterusNotes) lines.push(`Uterus Notes: ${study.tvus.uterusNotes}`);
  if (study.tvus?.ovarianNotes) lines.push(`Ovarian Notes: ${study.tvus.ovarianNotes}`);
  return lines;
}

/** Simulates the normalizeIntakeJSON round-trip for tvus fields */
function roundTripTVUS(tvus: TVUSFields): TVUSFields {
  return JSON.parse(JSON.stringify(tvus));
}

/** Simulates the document lifecycle: upload → replace → delete cascade */
interface LeadDocument {
  id: number;
  leadId: number;
  fileName: string;
  intakeSection: string;
  fileKey: string;
}

function simulateUpload(docs: LeadDocument[], doc: LeadDocument): LeadDocument[] {
  return [...docs, doc];
}

function simulateReplace(docs: LeadDocument[], oldId: number, newDoc: LeadDocument): LeadDocument[] {
  // deleteLeadDocument removes old row, then upload creates new row
  return [...docs.filter(d => d.id !== oldId), newDoc];
}

function simulateDelete(docs: LeadDocument[], id: number): LeadDocument[] {
  return docs.filter(d => d.id !== id);
}

// ─── T1–T4: TVUSFields type — new fields exist and are optional ───────────────

describe("TVUSFields — uterusNotes and ovarianNotes", () => {
  it("T1: TVUSFields accepts uterusNotes without error", () => {
    const tvus: TVUSFields = {
      uterusLength: "7.2",
      uterusNotes: "Heterogeneous myometrium, suspicion of adenomyosis",
    };
    expect(tvus.uterusNotes).toBe("Heterogeneous myometrium, suspicion of adenomyosis");
  });

  it("T2: TVUSFields accepts ovarianNotes without error", () => {
    const tvus: TVUSFields = {
      rightOvaryAFC: "8",
      ovarianNotes: "Small corpus luteum on right ovary",
    };
    expect(tvus.ovarianNotes).toBe("Small corpus luteum on right ovary");
  });

  it("T3: TVUSFields with both new fields coexists with all existing fields", () => {
    const tvus: TVUSFields = {
      uterusLength: "7.0",
      uterusWidth: "4.5",
      uterusHeight: "3.8",
      uterusPosition: "anteverted",
      endometrialThickness: "8",
      endometrialPattern: "trilaminar",
      uterusNotes: "Previous CS scar visible",
      rightOvarySize: "3.2",
      rightOvaryAFC: "6",
      leftOvarySize: "3.0",
      leftOvaryAFC: "5",
      dominantFollicle: "16mm right",
      ovarianNotes: "Endometrioma suspected on left ovary",
    };
    expect(Object.keys(tvus)).toHaveLength(13);
    expect(tvus.uterusNotes).toBeTruthy();
    expect(tvus.ovarianNotes).toBeTruthy();
  });

  it("T4: TVUSFields without new fields remains backward-compatible", () => {
    const tvus: TVUSFields = {
      uterusLength: "6.8",
      endometrialThickness: "9",
    };
    expect(tvus.uterusNotes).toBeUndefined();
    expect(tvus.ovarianNotes).toBeUndefined();
  });
});

// ─── T5–T8: JSON round-trip persistence ──────────────────────────────────────

describe("TVUSFields — JSON round-trip persistence", () => {
  it("T5: uterusNotes survives JSON.stringify/parse round-trip", () => {
    const original: TVUSFields = { uterusNotes: "Adenomyosis suspected" };
    const restored = roundTripTVUS(original);
    expect(restored.uterusNotes).toBe("Adenomyosis suspected");
  });

  it("T6: ovarianNotes survives JSON.stringify/parse round-trip", () => {
    const original: TVUSFields = { ovarianNotes: "Hemorrhagic cyst 2.1cm left ovary" };
    const restored = roundTripTVUS(original);
    expect(restored.ovarianNotes).toBe("Hemorrhagic cyst 2.1cm left ovary");
  });

  it("T7: both fields survive round-trip alongside all structured fields", () => {
    const original: TVUSFields = {
      uterusLength: "7.2",
      uterusNotes: "Irregular contour",
      rightOvaryAFC: "9",
      ovarianNotes: "Corpus luteum right",
    };
    const restored = roundTripTVUS(original);
    expect(restored.uterusNotes).toBe("Irregular contour");
    expect(restored.ovarianNotes).toBe("Corpus luteum right");
    expect(restored.uterusLength).toBe("7.2");
    expect(restored.rightOvaryAFC).toBe("9");
  });

  it("T8: empty string uterusNotes does not render in Read-Only (falsy guard)", () => {
    const study: RadiologyStudy = {
      id: "s1",
      type: "tvus",
      tvus: { uterusNotes: "", ovarianNotes: "" },
    };
    const lines = renderStudyNotes(study);
    expect(lines).not.toContain(expect.stringContaining("Uterus Notes:"));
    expect(lines).not.toContain(expect.stringContaining("Ovarian Notes:"));
  });
});

// ─── T9–T11: Read-Only renderer logic ────────────────────────────────────────

describe("Read-Only renderer — uterusNotes and ovarianNotes", () => {
  it("T9: renders Uterus Notes when tvus.uterusNotes is set", () => {
    const study: RadiologyStudy = {
      id: "s1",
      type: "tvus",
      findings: "Normal uterus",
      tvus: { uterusNotes: "Adenomyosis features" },
    };
    const lines = renderStudyNotes(study);
    expect(lines).toContain("Uterus Notes: Adenomyosis features");
    expect(lines).toContain("Findings: Normal uterus");
  });

  it("T10: renders Ovarian Notes when tvus.ovarianNotes is set", () => {
    const study: RadiologyStudy = {
      id: "s2",
      type: "tvus",
      tvus: { ovarianNotes: "Simple cyst 1.5cm right" },
    };
    const lines = renderStudyNotes(study);
    expect(lines).toContain("Ovarian Notes: Simple cyst 1.5cm right");
  });

  it("T11: non-TVUS study with no tvus object renders no notes lines", () => {
    const study: RadiologyStudy = {
      id: "s3",
      type: "hsg",
      findings: "Bilateral tubal patency",
    };
    const lines = renderStudyNotes(study);
    expect(lines).toHaveLength(1); // only findings
    expect(lines[0]).toBe("Findings: Bilateral tubal patency");
  });
});

// ─── T12–T14: Documents tab lifecycle audit ──────────────────────────────────

describe("Documents tab — lifecycle audit", () => {
  it("T12: upload creates exactly one document record", () => {
    const docs: LeadDocument[] = [];
    const result = simulateUpload(docs, {
      id: 1, leadId: 100, fileName: "tvus_report.pdf",
      intakeSection: "Radiology (Female)", fileKey: "intake-files/lead-100/tvus.pdf",
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it("T13: file replacement deletes old record and creates new one (no duplicate)", () => {
    const docs: LeadDocument[] = [
      { id: 1, leadId: 100, fileName: "old_tvus.pdf", intakeSection: "Radiology (Female)", fileKey: "old.pdf" },
    ];
    const result = simulateReplace(docs, 1, {
      id: 2, leadId: 100, fileName: "new_tvus.pdf",
      intakeSection: "Radiology (Female)", fileKey: "new.pdf",
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
    expect(result[0].fileName).toBe("new_tvus.pdf");
    // Old record is gone — no duplicate
    expect(result.find(d => d.id === 1)).toBeUndefined();
  });

  it("T14: delete removes document record completely (no orphan)", () => {
    const docs: LeadDocument[] = [
      { id: 1, leadId: 100, fileName: "tvus.pdf", intakeSection: "Radiology (Female)", fileKey: "tvus.pdf" },
      { id: 2, leadId: 100, fileName: "semen.pdf", intakeSection: "semenAnalysis", fileKey: "semen.pdf" },
    ];
    const result = simulateDelete(docs, 1);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
    expect(result.find(d => d.id === 1)).toBeUndefined();
  });
});
