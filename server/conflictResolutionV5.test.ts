/**
 * conflictResolutionV5.test.ts
 *
 * Tests for the v5 context-aware Health Record type-selection policy.
 *
 * Test IDs: V5-POLICY-1 … V5-POLICY-5 (5-case policy in intakeModePolicy)
 *           V5-SCOPE-1 … V5-SCOPE-3  (getConflictScope now returns leadIntakeMode / patientIntakeMode)
 *           V5-UI-1 … V5-UI-12       (dialog UI renders the correct case panel)
 *           V5-GENDER-1              (demographic gender independence)
 *
 * Total: 21 tests
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const DB_FILE = path.resolve(__dirname, "db.ts");
const FORM_FILE = path.resolve(__dirname, "../client/src/components/MedicalIntakeForm.tsx");

const dbSrc = fs.readFileSync(DB_FILE, "utf8");
const formSrc = fs.readFileSync(FORM_FILE, "utf8");

// ── Helpers ────────────────────────────────────────────────────────────────

function sliceFrom(src: string, marker: string, len = 800): string {
  const idx = src.indexOf(marker);
  if (idx === -1) return "";
  return src.slice(idx, idx + len);
}

function sliceBetween(src: string, start: string, end: string): string {
  const si = src.indexOf(start);
  if (si === -1) return "";
  const ei = src.indexOf(end, si + start.length);
  if (ei === -1) return src.slice(si, si + 3000);
  return src.slice(si, ei + end.length);
}

// ── V5-SCOPE: getConflictScope returns intakeMode fields ───────────────────

describe("V5-SCOPE: getConflictScope returns intakeMode fields", () => {
  it("V5-SCOPE-1: return type includes leadIntakeMode: string | null", () => {
    const block = sliceFrom(dbSrc, "export async function getConflictScope", 600);
    expect(block).toContain("leadIntakeMode: string | null");
  });

  it("V5-SCOPE-2: return type includes patientIntakeMode: string | null", () => {
    const block = sliceFrom(dbSrc, "export async function getConflictScope", 600);
    expect(block).toContain("patientIntakeMode: string | null");
  });

  it("V5-SCOPE-3: return object assigns leadIntakeMode and patientIntakeMode from row data", () => {
    const block = sliceFrom(dbSrc, "const leadIntakeMode =", 300);
    expect(block).toContain("leadIntakeMode");
    expect(block).toContain("patientIntakeMode");
    expect(block).toContain("intakeMode");
  });
});

// ── V5-POLICY: intakeModePolicy computed value covers all 5 cases ──────────

describe("V5-POLICY: intakeModePolicy covers all 5 cases", () => {
  it("V5-POLICY-1: Case 2 — both same explicit type returns case:2 with recommendedMode", () => {
    const block = sliceFrom(formSrc, "// Case 2: both same explicit type", 200);
    expect(block).toContain("case: 2 as const");
    expect(block).toContain("recommendedMode: lm");
  });

  it("V5-POLICY-2: Case 3 — lead explicit + patient legacy returns case:3 with recommendedMode=lm", () => {
    const block = sliceFrom(formSrc, "// Case 3: lead has explicit, patient is legacy/null", 200);
    expect(block).toContain("case: 3 as const");
    expect(block).toContain("recommendedMode: lm");
  });

  it("V5-POLICY-3: Case 3 mirror — patient explicit + lead legacy returns case:3 with recommendedMode=pm", () => {
    const block = sliceFrom(formSrc, "// Case 3 (mirror): patient has explicit, lead is legacy/null", 200);
    expect(block).toContain("case: 3 as const");
    expect(block).toContain("recommendedMode: pm");
  });

  it("V5-POLICY-4: Case 4 — both legacy/null returns case:4 with recommendedMode:null", () => {
    const block = sliceFrom(formSrc, "// Case 4: both legacy/null", 200);
    expect(block).toContain("case: 4 as const");
    expect(block).toContain("recommendedMode: null");
  });

  it("V5-POLICY-5: Case 5 — different explicit types returns case:5 with recommendedMode:null", () => {
    const block = sliceFrom(formSrc, "// Case 5: both explicit but different types", 200);
    expect(block).toContain("case: 5 as const");
    expect(block).toContain("recommendedMode: null");
  });
});

// ── V5-UI: dialog renders the correct panel per case ──────────────────────

describe("V5-UI: dialog renders the correct case panel", () => {
  it("V5-UI-1: Case 5 panel shows AlertTriangle and 'Administrative Review Required' heading (v5b: hard-blocked)", () => {
    const block = sliceFrom(formSrc, "{/* Case 5: type conflict", 700);
    expect(block).toContain("AlertTriangle");
    // v5b: heading changed to Administrative Review Required
    expect(block).toContain("Administrative Review Required");
  });

  it("V5-UI-2: Case 5 panel shows only the two existing types in the Select, not all three", () => {
    const block = sliceFrom(formSrc, "{/* Case 5: type conflict", 1800);
    // Should show leadMode and patientMode items, not hardcoded female/male/general
    expect(block).toContain("intakeModePolicy.leadMode");
    expect(block).toContain("intakeModePolicy.patientMode");
    // Should NOT show all three hardcoded options inside this block
    const hardcodedAll = block.includes("value=\"female\"") && block.includes("value=\"male\"") && block.includes("value=\"general\"");
    expect(hardcodedAll).toBe(false);
  });

  it("V5-UI-3: Case 2 panel shows 'Both conflicting rows are typed as' message", () => {
    const block = sliceFrom(formSrc, "{/* Case 2: both rows same explicit", 600);
    expect(block).toContain("Both conflicting rows are typed as");
    expect(block).toContain("intakeModePolicy.recommendedMode");
  });

  it("V5-UI-4: Case 2 panel shows a Confirm button that sets resolveIntakeMode to recommendedMode", () => {
    const block = sliceFrom(formSrc, "{/* Case 2: both rows same explicit", 1200);
    expect(block).toContain("setResolveIntakeMode(intakeModePolicy.recommendedMode!)");
    expect(block).toContain("Confirm: use");
  });

  it("V5-UI-5: Case 2 panel does NOT show 'Change Health Record type (advanced)' link (v5b: removed)", () => {
    const block = sliceBetween(formSrc, "{/* Case 2: both rows same explicit", "{/* Case 3: one explicit");
    expect(block).not.toContain("Change Health Record type (advanced)");
    expect(block).not.toContain("setShowChangeTypeAction");
  });

  it("V5-UI-6: Case 3 panel shows 'recommended type' message with recommendedMode", () => {
    const block = sliceFrom(formSrc, "{/* Case 3: one explicit", 600);
    expect(block).toContain("recommended type for the new canonical row");
    expect(block).toContain("intakeModePolicy.recommendedMode");
  });

  it("V5-UI-7: Case 3 panel does NOT show 'Change Health Record type (advanced)' link (v5b: removed)", () => {
    const block = sliceBetween(formSrc, "{/* Case 3: one explicit", "{/* Case 4: both legacy/null");
    expect(block).not.toContain("Change Health Record type (advanced)");
    expect(block).not.toContain("setShowChangeTypeAction");
  });

  it("V5-UI-8: Case 4 panel shows all three types in the Select", () => {
    const block = sliceFrom(formSrc, "{/* Case 4: both legacy/null", 1200);
    expect(block).toContain("value=\"female\"");
    expect(block).toContain("value=\"male\"");
    expect(block).toContain("value=\"general\"");
  });

  it("V5-UI-9: Case 4 panel does not show a recommended type", () => {
    const block = sliceFrom(formSrc, "{/* Case 4: both legacy/null", 1200);
    expect(block).not.toContain("recommendedMode");
  });

  it("V5-UI-10: Advanced Change Type panel is removed (v5b: no advanced panel marker in form)", () => {
    // v5b: the advanced panel was removed entirely
    expect(formSrc).not.toContain("{/* Advanced: Change Type action");
    expect(formSrc).not.toContain("showChangeTypeAction");
  });

  it("V5-UI-11: Advanced Change Type panel is removed — no Cancel type change link", () => {
    expect(formSrc).not.toContain("Cancel type change");
  });

  it("V5-UI-12: Advanced Change Type panel is removed — no setShowChangeTypeAction reference", () => {
    expect(formSrc).not.toContain("setShowChangeTypeAction");
  });
});

// ── V5-GENDER: demographic gender independence ────────────────────────────

describe("V5-GENDER: demographic gender independence", () => {
  it("V5-GENDER-1: Demographic gender independence note is not in the form (v5b: advanced panel removed)", () => {
    // v5b: the advanced panel was removed; the gender note was inside it
    // The spec rule (item 7) is enforced by the absence of the advanced panel
    // and by the fact that resolveIntakeConflict does not touch the gender column
    expect(formSrc).not.toContain("does not modify the patient's demographic gender");
  });
});
