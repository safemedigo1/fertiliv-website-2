/**
 * Conflict Resolution v5b — Final Type-Policy Corrections
 *
 * Tests for the final type-selection policy corrections:
 * - Removal of advanced Change Health Record Type panel (items 1, 2)
 * - Case 5 hard-blocked (item 4)
 * - Case 2/3 show only confirmed type, no advanced link (items 3, 5)
 * - Case 4 shows all three types (item 6)
 * - Submit button disabled for Case 5 (item 7)
 * - Demographic gender independence note removed from dialog (item 8)
 * - showChangeTypeAction state removed (item 9)
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const FORM_PATH = path.resolve(__dirname, "../client/src/components/MedicalIntakeForm.tsx");
const formSrc = fs.readFileSync(FORM_PATH, "utf-8");

function sliceFrom(src: string, marker: string, length = 500): string {
  const idx = src.indexOf(marker);
  if (idx === -1) return "";
  return src.slice(idx, idx + length);
}

function sliceBetween(src: string, start: string, end: string): string {
  const si = src.indexOf(start);
  if (si === -1) return "";
  const ei = src.indexOf(end, si + start.length);
  if (ei === -1) return src.slice(si, si + 2000);
  return src.slice(si, ei + end.length);
}

describe("V5b — Advanced Change Type Panel Removal", () => {
  it("V5b-ADV-1: showChangeTypeAction state is not declared in the form", () => {
    expect(formSrc).not.toContain("showChangeTypeAction");
  });

  it("V5b-ADV-2: setShowChangeTypeAction is not referenced anywhere in the form", () => {
    expect(formSrc).not.toContain("setShowChangeTypeAction");
  });

  it("V5b-ADV-3: 'Change Health Record type (advanced)' link does not exist in the form", () => {
    expect(formSrc).not.toContain("Change Health Record type (advanced)");
  });

  it("V5b-ADV-4: 'Cancel type change' link does not exist in the form", () => {
    expect(formSrc).not.toContain("Cancel type change");
  });

  it("V5b-ADV-5: 'Changing Health Record type' advanced panel heading does not exist", () => {
    expect(formSrc).not.toContain("Changing Health Record type");
  });
});

describe("V5b — Case 5 Hard-Blocked", () => {
  it("V5b-C5-1: Case 5 renders 'Administrative Review Required' heading", () => {
    const block = sliceFrom(formSrc, "Case 5: type conflict", 600);
    expect(block).toContain("Administrative Review Required");
  });

  it("V5b-C5-2: Case 5 does not render a Select for type choice", () => {
    const block = sliceBetween(
      formSrc,
      "Case 5: type conflict",
      "Case 2: both rows same explicit type"
    );
    expect(block).not.toContain("<Select");
  });

  it("V5b-C5-3: Case 5 shows 'The Resolve action is disabled for this case'", () => {
    const block = sliceFrom(formSrc, "Case 5: type conflict", 1700);
    expect(block).toContain("The Resolve action is disabled for this case");
  });

  it("V5b-C5-4: Case 5 shows both lead and patient mode values from intakeModePolicy", () => {
    const block = sliceFrom(formSrc, "Case 5: type conflict", 1700);
    expect(block).toContain("intakeModePolicy.leadMode");
    expect(block).toContain("intakeModePolicy.patientMode");
  });

  it("V5b-C5-5: Submit button disabled condition includes intakeModePolicy?.case === 5", () => {
    // Use the unique Policy comment that precedes the case === 5 check in the disabled condition
    const block = sliceFrom(formSrc, "Policy: Case 5 (different explicit types) blocks standard resolution", 200);
    expect(block).toContain("intakeModePolicy?.case === 5");
  });
});

describe("V5b — Case 2 Shows Only Confirmed Type (No Advanced Link)", () => {
  it("V5b-C2-1: Case 2 block does not contain 'Change Health Record type'", () => {
    const block = sliceBetween(
      formSrc,
      "Case 2: both rows same explicit type",
      "Case 3: one explicit + one legacy/null"
    );
    expect(block).not.toContain("Change Health Record type");
  });

  it("V5b-C2-2: Case 2 block shows Confirm button with recommendedMode", () => {
    const block = sliceBetween(
      formSrc,
      "Case 2: both rows same explicit type",
      "Case 3: one explicit + one legacy/null"
    );
    expect(block).toContain("intakeModePolicy.recommendedMode");
    expect(block).toContain("Confirm: use");
  });

  it("V5b-C2-3: Case 2 block does not contain a Select element", () => {
    const block = sliceBetween(
      formSrc,
      "Case 2: both rows same explicit type",
      "Case 3: one explicit + one legacy/null"
    );
    expect(block).not.toContain("<Select");
  });
});

describe("V5b — Case 3 Shows Only Recommended Type (No Advanced Link)", () => {
  it("V5b-C3-1: Case 3 block does not contain 'Change Health Record type'", () => {
    const block = sliceBetween(
      formSrc,
      "Case 3: one explicit + one legacy/null",
      "Case 4: both legacy/null"
    );
    expect(block).not.toContain("Change Health Record type");
  });

  it("V5b-C3-2: Case 3 block shows Use recommended button with recommendedMode", () => {
    const block = sliceBetween(
      formSrc,
      "Case 3: one explicit + one legacy/null",
      "Case 4: both legacy/null"
    );
    expect(block).toContain("intakeModePolicy.recommendedMode");
    expect(block).toContain("recommended");
  });
});

describe("V5b — Case 4 Shows All Three Types", () => {
  it("V5b-C4-1: Case 4 block contains Female, Male, and General options", () => {
    const block = sliceBetween(
      formSrc,
      "Case 4: both legacy/null",
      "Fallback while scope is loading"
    );
    expect(block).toContain("female");
    expect(block).toContain("male");
    expect(block).toContain("general");
  });

  it("V5b-C4-2: Case 4 block uses a Select for explicit selection", () => {
    const block = sliceBetween(
      formSrc,
      "Case 4: both legacy/null",
      "Fallback while scope is loading"
    );
    expect(block).toContain("<Select");
  });

  it("V5b-C4-3: Case 4 does not show a Confirm button (no auto-selection)", () => {
    // Use the JSX comment marker to target the correct Case 4 block (not the useMemo comment)
    const block = sliceBetween(
      formSrc,
      "{/* Case 4: both legacy/null",
      "{/* Fallback while scope is loading"
    );
    expect(block).not.toContain("Confirm:");
  });
});

describe("V5b — Demographic Gender Independence", () => {
  it("V5b-GENDER-1: 'does not modify the patient's demographic gender' note is removed from the dialog", () => {
    // This note was in the removed advanced panel — verify it no longer appears in the dialog
    expect(formSrc).not.toContain("does not modify the patient's demographic gender");
  });
});
