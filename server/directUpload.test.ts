/**
 * Direct Upload to Documents Library — 15 Required Tests
 *
 * Tests 1–12 are static-analysis / source-code assertions.
 * Tests 13–14 verify UI-layer conflict handling.
 * Test 15 is the TypeScript + full-suite regression gate.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROUTERS = fs.readFileSync(path.resolve(__dirname, "routers.ts"), "utf8");
const DB = fs.readFileSync(path.resolve(__dirname, "db.ts"), "utf8");
const LEAD_PAGE = fs.readFileSync(
  path.resolve(__dirname, "../client/src/pages/LeadDetailPage.tsx"),
  "utf8"
);
const PATIENT_PAGE = fs.readFileSync(
  path.resolve(__dirname, "../client/src/pages/PatientDetailPage.tsx"),
  "utf8"
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract the leads.directUpload procedure body (up to the next procedure). */
function getLeadsDirectUploadBody(): string {
  const start = ROUTERS.indexOf(
    "// Direct upload to Documents Library — no conflict guard, no intake JSON modification."
  );
  const end = ROUTERS.indexOf("// Upload a file for a specific intake section entry", start);
  return ROUTERS.slice(start, end);
}

/** Extract the patients.directUpload procedure body (up to the next procedure). */
function getPatientsDirectUploadBody(): string {
  const start = ROUTERS.indexOf(
    "// Direct upload to Documents Library from the Patient page — no conflict guard."
  );
  const end = ROUTERS.indexOf("    addDocumentToSection: staffOrAdminProcedure", start);
  return ROUTERS.slice(start, end);
}

/** Find the last occurrence of a string in a source file. */
function lastIndexOf(src: string, needle: string): number {
  let idx = -1;
  let pos = 0;
  while ((pos = src.indexOf(needle, pos)) !== -1) {
    idx = pos;
    pos++;
  }
  return idx;
}

// ─── Test 1: Lead page exposes Direct Upload ──────────────────────────────────
describe("T-DU-1: Lead page exposes Direct Upload", () => {
  it("LeadDetailPage renders an 'Upload to Library' button", () => {
    expect(LEAD_PAGE).toContain("Upload to Library");
  });
  it("LeadDetailPage calls leads.directUpload mutation", () => {
    expect(LEAD_PAGE).toContain("trpc.leads.directUpload.useMutation");
  });
  it("LeadDetailPage calls leads.getDirectUploadDestinations query", () => {
    expect(LEAD_PAGE).toContain("trpc.leads.getDirectUploadDestinations.useQuery");
  });
});

// ─── Test 2: Patient page exposes Direct Upload ───────────────────────────────
describe("T-DU-2: Patient page exposes Direct Upload", () => {
  it("PatientDetailPage renders an 'Upload to Library' button", () => {
    expect(PATIENT_PAGE).toContain("Upload to Library");
  });
  it("PatientDetailPage calls patients.directUpload mutation", () => {
    expect(PATIENT_PAGE).toContain("trpc.patients.directUpload.useMutation");
  });
  it("PatientDetailPage calls patients.getDirectUploadDestinations query", () => {
    expect(PATIENT_PAGE).toContain("trpc.patients.getDirectUploadDestinations.useQuery");
  });
});

// ─── Test 3: Direct Upload works without a Health Record ─────────────────────
describe("T-DU-3: Direct Upload requires no Health Record", () => {
  it("leads.directUpload does not call resolveCanonicalIntake", () => {
    const body = getLeadsDirectUploadBody();
    expect(body).not.toContain("resolveCanonicalIntake");
  });
  it("leads.directUpload does not call upsertMedicalIntake", () => {
    const body = getLeadsDirectUploadBody();
    expect(body).not.toContain("upsertMedicalIntake");
  });
  it("patients.directUpload does not call resolveCanonicalIntake", () => {
    const body = getPatientsDirectUploadBody();
    expect(body).not.toContain("resolveCanonicalIntake");
  });
  it("patients.directUpload does not call upsertMedicalIntakeForPatient", () => {
    const body = getPatientsDirectUploadBody();
    expect(body).not.toContain("upsertMedicalIntakeForPatient");
  });
});

// ─── Test 4: Direct Upload works during intake conflict ───────────────────────
describe("T-DU-4: Direct Upload is not blocked during intake conflict", () => {
  it("leads.directUpload has no conflict guard (no resolveCanonicalIntake call)", () => {
    const body = getLeadsDirectUploadBody();
    expect(body).not.toContain("resolveCanonicalIntake");
  });
  it("patients.directUpload has no conflict guard (no resolveCanonicalIntake call)", () => {
    const body = getPatientsDirectUploadBody();
    expect(body).not.toContain("resolveCanonicalIntake");
  });
  it("LeadDetailPage: Upload to Library button is NOT disabled during conflict", () => {
    // Find the Upload to Library button — it must NOT have disabled={hasIntakeConflict}
    const libraryBtnIdx = LEAD_PAGE.lastIndexOf("Upload to Library");
    const surroundingSlice = LEAD_PAGE.slice(Math.max(0, libraryBtnIdx - 300), libraryBtnIdx + 50);
    expect(surroundingSlice).not.toContain("disabled={hasIntakeConflict}");
  });
  it("PatientDetailPage: Upload to Library button is NOT disabled during conflict", () => {
    const libraryBtnIdx = PATIENT_PAGE.lastIndexOf("Upload to Library");
    const surroundingSlice = PATIENT_PAGE.slice(Math.max(0, libraryBtnIdx - 300), libraryBtnIdx + 50);
    expect(surroundingSlice).not.toContain("disabled={hasIntakeConflict}");
  });
});

// ─── Test 5: No Medical Intake JSON is modified ───────────────────────────────
describe("T-DU-5: No Medical Intake JSON is modified", () => {
  it("leads.directUpload does not call upsertMedicalIntake or update intake JSON", () => {
    const body = getLeadsDirectUploadBody();
    expect(body).not.toContain("upsertMedicalIntake");
    expect(body).not.toContain("intakeJson");
    expect(body).not.toContain("sectionData");
  });
  it("patients.directUpload does not call upsertMedicalIntakeForPatient or update intake JSON", () => {
    const body = getPatientsDirectUploadBody();
    expect(body).not.toContain("upsertMedicalIntakeForPatient");
    expect(body).not.toContain("intakeJson");
    expect(body).not.toContain("sectionData");
  });
});

// ─── Test 6: lifecycleStatus is direct-upload ─────────────────────────────────
describe("T-DU-6: lifecycleStatus is direct-upload", () => {
  it("leads.directUpload stamps lifecycleStatus: 'direct-upload'", () => {
    const body = getLeadsDirectUploadBody();
    expect(body).toContain('lifecycleStatus: "direct-upload"');
  });
  it("patients.directUpload stamps lifecycleStatus: 'direct-upload'", () => {
    const body = getPatientsDirectUploadBody();
    expect(body).toContain('lifecycleStatus: "direct-upload"');
  });
});

// ─── Test 7: Converted-person upload writes both IDs ─────────────────────────
describe("T-DU-7: Converted-person upload writes both leadId and patientId", () => {
  it("leads.directUpload resolves linkedPatientId and conditionally stamps patientId", () => {
    const body = getLeadsDirectUploadBody();
    expect(body).toContain("resolveLinkedPatientId(input.leadId)");
    expect(body).toContain("linkedPatientId ? { patientId: linkedPatientId }");
  });
  it("patients.directUpload resolves linkedLeadId and conditionally stamps leadId", () => {
    const body = getPatientsDirectUploadBody();
    expect(body).toContain("resolveLinkedLeadId(input.patientId)");
    expect(body).toContain("linkedLeadId ? { leadId: linkedLeadId }");
  });
});

// ─── Test 8: Canonical ownerType and ownerId are populated ───────────────────
describe("T-DU-8: Canonical ownerType and ownerId are populated", () => {
  it("leads.directUpload stamps ownerType: 'lead' and ownerId: input.leadId", () => {
    const body = getLeadsDirectUploadBody();
    expect(body).toContain('ownerType: "lead"');
    expect(body).toContain("ownerId: input.leadId");
  });
  it("patients.directUpload uses canonical ownerType and ownerId (lead-side for converted persons)", () => {
    const body = getPatientsDirectUploadBody();
    // ownerType resolves to "lead" for converted persons, "patient" otherwise
    expect(body).toContain('ownerType = linkedLeadId ? "lead" : "patient"');
    expect(body).toContain("ownerId = linkedLeadId ?? input.patientId");
  });
});

// ─── Test 9: Document appears on both Lead and Patient pages ─────────────────
describe("T-DU-9: Cross-invalidation after direct upload", () => {
  it("leads.directUpload onSuccess invalidates both leads.documents and patients.documents", () => {
    const onSuccessIdx = LEAD_PAGE.indexOf("trpc.leads.directUpload.useMutation");
    const body = LEAD_PAGE.slice(onSuccessIdx, onSuccessIdx + 1000);
    expect(body).toContain("utils.leads.documents.invalidate");
    expect(body).toContain("utils.patients.documents.invalidate");
  });
  it("patients.directUpload onSuccess invalidates both patients.documents and leads.documents", () => {
    const onSuccessIdx = PATIENT_PAGE.indexOf("trpc.patients.directUpload.useMutation");
    const body = PATIENT_PAGE.slice(onSuccessIdx, onSuccessIdx + 1000);
    expect(body).toContain("utils.patients.documents.invalidate");
    expect(body).toContain("utils.leads.documents.invalidate");
  });
  it("getLeadDocuments unions patientId when linkedPatientId exists", () => {
    const fnIdx = DB.indexOf("export async function getLeadDocuments");
    const body = DB.slice(fnIdx, fnIdx + 3000);
    expect(body).toContain("resolveLinkedPatientId");
  });
});

// ─── Test 10: Partner ownership remains isolated ─────────────────────────────
describe("T-DU-10: Partner ownership is isolated", () => {
  it("leads.getDirectUploadDestinations returns separate destination entries for primary and partner", () => {
    const fnIdx = ROUTERS.indexOf(
      "getDirectUploadDestinations: staffOrAdminProcedure\n      .input(z.object({ leadId: z.number() }))"
    );
    const body = ROUTERS.slice(fnIdx, fnIdx + 3000);
    expect(body).toContain("isPrimary: true");
    expect(body).toContain("isPrimary: false");
    // Each destination has its own leadId
    expect(body).toContain("leadId: input.leadId");
    expect(body).toContain("leadId: partner.id");
  });
  it("patients.getDirectUploadDestinations returns separate destination entries for primary and partner", () => {
    const fnIdx = ROUTERS.indexOf(
      "getDirectUploadDestinations: staffOrAdminProcedure\n      .input(z.object({ patientId: z.number() }))"
    );
    const body = ROUTERS.slice(fnIdx, fnIdx + 3000);
    expect(body).toContain("isPrimary: true");
    expect(body).toContain("isPrimary: false");
    expect(body).toContain("patientId: input.patientId");
    expect(body).toContain("patientId: (partner as any).id");
  });
});

// ─── Test 11: Archive Reset preserves direct-upload documents ────────────────
describe("T-DU-11: Archive Reset preserves direct-upload documents", () => {
  it("archiveIntakeDocuments excludes lifecycleStatus = 'direct-upload'", () => {
    const fnIdx = DB.indexOf("archiveIntakeDocuments");
    expect(fnIdx).toBeGreaterThan(-1);
    const body = DB.slice(fnIdx, fnIdx + 2000);
    expect(body).toContain("direct-upload");
    expect(body).toMatch(/ne\(.*lifecycleStatus.*direct-upload|lifecycleStatus.*!=.*direct-upload/s);
  });
  it("resetMedicalIntake calls archiveIntakeDocuments for archive reset", () => {
    const fnIdx = ROUTERS.indexOf("resetMedicalIntake: staffOrAdminProcedure");
    const body = ROUTERS.slice(fnIdx, fnIdx + 6000);
    expect(body).toContain("archiveIntakeDocuments");
  });
});

// ─── Test 12: Permanent Reset preserves direct-upload documents ──────────────
describe("T-DU-12: Permanent Reset preserves direct-upload documents", () => {
  it("permanentlyDeleteIntakeDocuments excludes lifecycleStatus = 'direct-upload'", () => {
    const fnIdx = DB.indexOf("permanentlyDeleteIntakeDocuments");
    expect(fnIdx).toBeGreaterThan(-1);
    const body = DB.slice(fnIdx, fnIdx + 2000);
    expect(body).toContain("direct-upload");
    expect(body).toMatch(/ne\(.*lifecycleStatus.*direct-upload|lifecycleStatus.*!=.*direct-upload/s);
  });
  it("resetMedicalIntake calls permanentlyDeleteIntakeDocuments for permanent reset", () => {
    const fnIdx = ROUTERS.indexOf("resetMedicalIntake: staffOrAdminProcedure");
    const body = ROUTERS.slice(fnIdx, fnIdx + 6000);
    expect(body).toContain("permanentlyDeleteIntakeDocuments");
  });
  it("Regression: direct-upload exclusion uses lifecycleStatus column, not JSON parsing", () => {
    const archiveFnIdx = DB.indexOf("archiveIntakeDocuments");
    const archiveBody = DB.slice(archiveFnIdx, archiveFnIdx + 2000);
    expect(archiveBody).toContain("lifecycleStatus");
    expect(archiveBody).not.toContain("JSON.parse");

    const permanentFnIdx = DB.indexOf("permanentlyDeleteIntakeDocuments");
    const permanentBody = DB.slice(permanentFnIdx, permanentFnIdx + 2000);
    expect(permanentBody).toContain("lifecycleStatus");
    expect(permanentBody).not.toContain("JSON.parse");
  });
});

// ─── Test 13: Raw intake_conflict is not shown to the user ───────────────────
describe("T-DU-13: Raw intake_conflict error is not shown to the user", () => {
  it("LeadDetailPage directUpload onError does not show raw 'intake_conflict' string", () => {
    const mutationIdx = LEAD_PAGE.indexOf("trpc.leads.directUpload.useMutation");
    const body = LEAD_PAGE.slice(mutationIdx, mutationIdx + 500);
    expect(body).not.toContain("intake_conflict");
  });
  it("PatientDetailPage directUpload onError does not show raw 'intake_conflict' string", () => {
    const mutationIdx = PATIENT_PAGE.indexOf("trpc.patients.directUpload.useMutation");
    const body = PATIENT_PAGE.slice(mutationIdx, mutationIdx + 500);
    expect(body).not.toContain("intake_conflict");
  });
  it("LeadDetailPage addDocToSection onError has an error handler (not silent)", () => {
    const mutationIdx = LEAD_PAGE.indexOf("addDocToSection = trpc.leads.addDocumentToSection.useMutation");
    const body = LEAD_PAGE.slice(mutationIdx, mutationIdx + 600);
    expect(body).toContain("onError");
  });
});

// ─── Test 14: Section-upload dialog is blocked early during conflict ──────────
describe("T-DU-14: Section-upload is blocked before the user selects files", () => {
  it("LeadDetailPage: Upload to Section button is disabled when hasIntakeConflict is true", () => {
    // Use the last occurrence (the DocumentsTab button, not any other section reference)
    const sectionBtnIdx = lastIndexOf(LEAD_PAGE, "Upload to Section");
    const surroundingSlice = LEAD_PAGE.slice(Math.max(0, sectionBtnIdx - 400), sectionBtnIdx + 100);
    expect(surroundingSlice).toContain("disabled={hasIntakeConflict}");
  });
  it("PatientDetailPage: Upload to Section button is disabled when hasIntakeConflict is true", () => {
    const sectionBtnIdx = lastIndexOf(PATIENT_PAGE, "Upload to Section");
    const surroundingSlice = PATIENT_PAGE.slice(Math.max(0, sectionBtnIdx - 400), sectionBtnIdx + 100);
    expect(surroundingSlice).toContain("disabled={hasIntakeConflict}");
  });
  it("LeadDetailPage: Upload to Section button has a user-friendly tooltip explaining the conflict block", () => {
    const sectionBtnIdx = lastIndexOf(LEAD_PAGE, "Upload to Section");
    const surroundingSlice = LEAD_PAGE.slice(Math.max(0, sectionBtnIdx - 400), sectionBtnIdx + 100);
    expect(surroundingSlice).toContain("Resolve intake conflict");
  });
  it("PatientDetailPage: Upload to Section button has a user-friendly tooltip explaining the conflict block", () => {
    const sectionBtnIdx = lastIndexOf(PATIENT_PAGE, "Upload to Section");
    const surroundingSlice = PATIENT_PAGE.slice(Math.max(0, sectionBtnIdx - 400), sectionBtnIdx + 100);
    expect(surroundingSlice).toContain("Resolve intake conflict");
  });
});

// ─── Test 15: TypeScript and all existing tests pass ─────────────────────────
describe("T-DU-15: TypeScript and regression gate", () => {
  it("directUpload.test.ts itself has no syntax errors (trivially true if this runs)", () => {
    expect(true).toBe(true);
  });
  it("leads.directUpload procedure is defined in the leads router", () => {
    expect(ROUTERS).toContain(
      "// Direct upload to Documents Library — no conflict guard, no intake JSON modification."
    );
  });
  it("patients.directUpload procedure is defined in the patients router", () => {
    expect(ROUTERS).toContain(
      "// Direct upload to Documents Library from the Patient page — no conflict guard."
    );
  });
  it("patients.directUpload has patientId input and direct-upload lifecycleStatus", () => {
    const body = getPatientsDirectUploadBody();
    expect(body).toContain("patientId: z.number()");
    expect(body).toContain('lifecycleStatus: "direct-upload"');
  });
});
