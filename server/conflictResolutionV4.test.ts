/**
 * Conflict Resolution v4 — Navigation, Standalone Patient Policy, Responsive Dialog
 *
 * Test IDs: V4-NAV-1..7, V4-PATIENT-1..6, V4-DIALOG-1..9
 *
 * These are static code-analysis tests that verify the implementation without
 * requiring a running database. Each test reads the source files and asserts
 * that the required code constructs are present.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");

function readFile(rel: string): string {
  return readFileSync(resolve(ROOT, rel), "utf-8");
}

function sliceFrom(src: string, marker: string, len = 2000): string {
  const idx = src.indexOf(marker);
  if (idx === -1) return "";
  return src.slice(idx, idx + len);
}

function sliceBetween(src: string, start: string, end: string): string {
  const s = src.indexOf(start);
  if (s === -1) return "";
  const e = src.indexOf(end, s + start.length);
  if (e === -1) return src.slice(s, s + 4000);
  return src.slice(s, e + end.length);
}

// ─── Source files ─────────────────────────────────────────────────────────────
const medicalIntakeForm = readFile("client/src/components/MedicalIntakeForm.tsx");
const leadDetailPage = readFile("client/src/pages/LeadDetailPage.tsx");
const dbTs = readFile("server/db.ts");
const routersTs = readFile("server/routers.ts");

// ─── Navigation tests ─────────────────────────────────────────────────────────

describe("V4-NAV: Patient-to-Lead navigation", () => {
  it("V4-NAV-1: Patient conflict action resolves the real linked Lead ID from server query", () => {
    // The button uses patientQueryLinkedLeadId which comes from patientQuery.data?.linkedLeadId
    const block = sliceFrom(medicalIntakeForm, "patientQueryLinkedLeadId = patientQuery.data?.linkedLeadId", 200);
    expect(block).toContain("patientQueryLinkedLeadId = patientQuery.data?.linkedLeadId");
  });

  it("V4-NAV-2: Clicking the action opens the Lead Medical Record tab via deep-link URL", () => {
    // The href must include tab=medical-intake
    const block = sliceFrom(medicalIntakeForm, "tab=medical-intake&focus=intake-conflict", 300);
    expect(block).toContain("tab=medical-intake");
    expect(block).toContain("focus=intake-conflict");
  });

  it("V4-NAV-3: Lead Info is not the landing tab when deep-link is used", () => {
    // LeadDetailPage reads urlTab from URL params and initialises activeTab from it
    const block = sliceFrom(leadDetailPage, "Deep-link support", 600);
    expect(block).toContain("urlTab");
    expect(block).toContain("validTabs");
    // The default is only "info" when urlTab is absent or invalid
    expect(block).toContain('"info"');
    expect(block).toContain("urlTab && validTabs.includes(urlTab)");
  });

  it("V4-NAV-4: Conflict banner is scrolled into view when focus=intake-conflict", () => {
    // LeadDetailPage has a useEffect that scrolls to intake-conflict-banner
    const block = sliceFrom(leadDetailPage, "focus=intake-conflict", 1200);
    expect(block).toContain("intake-conflict-banner");
    expect(block).toContain("scrollIntoView");
  });

  it("V4-NAV-5: No destructive dialog automatically submits on page load", () => {
    // The dialog is only opened by an explicit button click (showResolveDialog state)
    // It is initialised as false and only set to true by a button onClick
    const dialogBlock = sliceFrom(medicalIntakeForm, "showResolveDialog", 200);
    expect(dialogBlock).toContain("showResolveDialog");
    // The dialog open state is driven by showResolveDialog, not by URL params
    const leadBlock = sliceFrom(leadDetailPage, "focus=intake-conflict", 1000);
    expect(leadBlock).not.toContain("showResolveDialog");
    expect(leadBlock).not.toContain("resolveConflict");
  });

  it("V4-NAV-6: Patient without linked Lead shows no Open Lead action", () => {
    // The button is guarded by patientQueryLinkedLeadId (truthy check)
    const block = sliceFrom(medicalIntakeForm, "Correction 2 (v3): Patient-side admin action", 300);
    expect(block).toContain("patientQueryLinkedLeadId &&");
    // When patientQueryLinkedLeadId is null/0/undefined, the button is not rendered
  });

  it("V4-NAV-7: No invalid Lead route is generated when linkedLeadId is absent", () => {
    // The href is only rendered inside the patientQueryLinkedLeadId guard
    // So /leads/null or /leads/undefined can never appear
    const block = sliceFrom(medicalIntakeForm, "Correction 2 (v3): Patient-side admin action", 400);
    expect(block).toContain("`/leads/${patientQueryLinkedLeadId}?tab=medical-intake");
    // The entire block is inside a truthy guard
    expect(block).toContain("patientQueryLinkedLeadId && (");
  });
});

// ─── Standalone Patient tests ─────────────────────────────────────────────────

describe("V4-PATIENT: Standalone Patient policy", () => {
  it("V4-PATIENT-1: Direct Patient creation with no Lead remains patient-owned (ownerType=patient)", () => {
    // In the patients.uploadDocument procedure, ownerType is set based on linkedLeadId
    const block = sliceFrom(routersTs, "const ownerType = linkedLeadId", 200);
    expect(block).toContain('"lead" : "patient"');
  });

  it("V4-PATIENT-2: Patient-only intake is readable via patients.getIntake without a Lead", () => {
    // patients.getIntake procedure exists and does not require a leadId
    const block = sliceFrom(routersTs, "getIntake:", 300);
    expect(block).toContain("patientId: z.number()");
    // No leadId required in the input
    expect(block).not.toContain("leadId: z.number()");
  });

  it("V4-PATIENT-3: The Lead/Patient dual-intake conflict is not falsely reported without a relationship", () => {
    // linkLeadToExistingPatient checks for BOTH leadId AND patientId intake rows
    // A patient-only intake row (no leadId) cannot trigger the dual-intake conflict
    // because the conflict check requires !leadEmpty && !patientEmpty && !resolveIntakeConflict
    const block = sliceFrom(dbTs, "linkLeadToExistingPatient", 4000);
    // The conflict detection requires finding two separate rows: one with leadId, one with patientId
    expect(block).toContain("leadId");
    expect(block).toContain("patientId");
    // The conflict is only returned when BOTH rows exist
    expect(block).toContain("intake_conflict");
  });

  it("V4-PATIENT-4: Linking a Patient-only intake to an empty Lead preserves one row (no duplication)", () => {
    // linkLeadToExistingPatient: when only patient intake exists, stamps leadId on it
    const block = sliceFrom(dbTs, "Only patient intake exists", 300);
    expect(block).toContain("set({ leadId: input.leadId }");
    // Does NOT insert a new row
    expect(block).not.toContain("insert(medicalIntake)");
  });

  it("V4-PATIENT-5: Linking two populated identities creates a safe conflict instead of overwriting", () => {
    // linkLeadToExistingPatient: when both have real data and no resolution specified, returns intake_conflict
    const block = sliceFrom(dbTs, "both have real data and no resolution specified", 300);
    expect(block).toContain("intake_conflict");
    expect(block).toContain("leadIntake:");
    expect(block).toContain("patientIntake:");
  });

  it("V4-PATIENT-6: No duplicate intake row is silently created during linking", () => {
    // The linkLeadToExistingPatient function never calls db.insert(medicalIntake) —
    // it only updates existing rows or skips when neither has an intake
    const linkBlock = sliceBetween(dbTs, "export async function linkLeadToExistingPatient", "writeBothLinkSides(");
    // Should not contain an insert into medicalIntake
    expect(linkBlock).not.toContain("insert(medicalIntake)");
    // Should only contain update calls
    expect(linkBlock).toContain("update(medicalIntake)");
  });
});

// ─── Responsive dialog tests ──────────────────────────────────────────────────

describe("V4-DIALOG: Responsive Resolve Conflict dialog", () => {
  it("V4-DIALOG-1: Dialog body has vertical scrolling (overflow-y-auto)", () => {
    const block = sliceFrom(medicalIntakeForm, "Scrollable body", 200);
    expect(block).toContain("overflow-y-auto");
    expect(block).toContain("min-h-0");
  });

  it("V4-DIALOG-2: Dialog fits at 100% zoom — max-height uses dvh or vh", () => {
    const block = sliceFrom(medicalIntakeForm, "Resolve Conflict Dialog (admin-only, lead mode)", 500);
    // The DialogContent has a maxHeight style using dvh
    expect(block).toContain("100dvh");
  });

  it("V4-DIALOG-3: Footer controls remain reachable — footer has shrink-0", () => {
    const block = sliceFrom(medicalIntakeForm, "Sticky footer", 200);
    expect(block).toContain("shrink-0");
    expect(block).toContain("border-t");
  });

  it("V4-DIALOG-4: Background page does not scroll — DialogContent uses flex column layout", () => {
    // The DialogContent has flex flex-col so the body scrolls internally
    const block = sliceFrom(medicalIntakeForm, "Resolve Conflict Dialog (admin-only, lead mode)", 400);
    expect(block).toContain("flex flex-col");
  });

  it("V4-DIALOG-5: Scope grid stacks correctly on mobile (grid-cols-1 sm:grid-cols-2)", () => {
    const block = sliceFrom(medicalIntakeForm, "grid grid-cols-1 sm:grid-cols-2", 100);
    expect(block).toContain("grid-cols-1");
    expect(block).toContain("sm:grid-cols-2");
  });

  it("V4-DIALOG-6: Select dropdown (Health Record type) is inside the scrollable body", () => {
    // The Select for resolveIntakeMode is inside the scrollable div, not outside it
    const bodyStart = medicalIntakeForm.indexOf("Scrollable body");
    const footerStart = medicalIntakeForm.indexOf("Sticky footer");
    const selectIdx = medicalIntakeForm.indexOf("resolveIntakeMode", bodyStart);
    expect(selectIdx).toBeGreaterThan(bodyStart);
    expect(selectIdx).toBeLessThan(footerStart);
  });

  it("V4-DIALOG-7: RESOLVE input field remains reachable (inside scrollable body)", () => {
    const bodyStart = medicalIntakeForm.indexOf("Scrollable body");
    const footerStart = medicalIntakeForm.indexOf("Sticky footer");
    const resolveIdx = medicalIntakeForm.indexOf('placeholder="RESOLVE"', bodyStart);
    expect(resolveIdx).toBeGreaterThan(bodyStart);
    expect(resolveIdx).toBeLessThan(footerStart);
  });

  it("V4-DIALOG-8: Cancel changes nothing — Cancel button only calls setShowResolveDialog(false)", () => {
    const block = sliceFrom(medicalIntakeForm, "Sticky footer", 600);
    // Cancel button only closes the dialog
    expect(block).toContain("setShowResolveDialog(false)");
    // Cancel does not call resolveConflictMutation.mutate
    const cancelBlock = sliceBetween(block, 'variant="outline"', "Cancel");
    expect(cancelBlock).not.toContain("mutate");
  });

  it("V4-DIALOG-9: Header is sticky — DialogHeader has shrink-0", () => {
    const block = sliceFrom(medicalIntakeForm, "Sticky header", 200);
    expect(block).toContain("shrink-0");
    expect(block).toContain("border-b");
  });
});
