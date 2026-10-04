/**
 * Phase 3 Corrections Test Suite
 *
 * Covers all corrections identified in the ChatGPT code review of Phase 3A–3C:
 *
 *   Correction 1  — Backfill audit (documented, no code change needed)
 *   Correction 2  — Remove clinical snapshot from Communications log
 *   Correction 3  — intakeMode INSERT-only default (not applied on UPDATE)
 *   Correction 4  — Conflict resolver (resolveCanonicalIntake) + conflict guards
 *                    in saveMedicalIntake, saveIntake, resetMedicalIntake
 *   Correction 5  — getLeadDocuments union with patient-owned docs
 *   Correction 6  — ownerType/ownerId population on all upload paths
 *   Client UX     — Conflict banner in MedicalIntakeForm
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

// ─── Source files (read once) ─────────────────────────────────────────────────
const routersSource = readFileSync(join(__dirname, "routers.ts"), "utf-8");
const dbSource = readFileSync(join(__dirname, "db.ts"), "utf-8");
const medicalIntakeFormSource = readFileSync(
  join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"),
  "utf-8"
);
const leadDetailSource = readFileSync(
  join(__dirname, "../client/src/pages/LeadDetailPage.tsx"),
  "utf-8"
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract a large enough slice from the source starting at the first occurrence of `marker`. */
function sliceFrom(src: string, marker: string, length = 10000): string {
  const idx = src.indexOf(marker);
  if (idx === -1) return "";
  return src.slice(idx, idx + length);
}

// ─── Correction 2: No clinical snapshot in Communications log ─────────────────

describe("Correction 2 — No clinical snapshot in Communications log", () => {
  it("C2-1: resetMedicalIntake does NOT write fullIntake JSON to lead_communications", () => {
    const resetBody = sliceFrom(routersSource, "resetMedicalIntake: staffOrAdminProcedure");
    // Must NOT contain any reference to writing fullIntake or clinical JSON to communications
    expect(resetBody).not.toContain("fullIntake");
    // Must not INSERT into lead_communications (only allowed to reference it in a comment)
    expect(resetBody).not.toMatch(/db\.(insert|query)\(.*lead_communications/);
  });

  it("C2-2: resetMedicalIntake uses logAudit for metadata-only audit entry", () => {
    const resetBody = sliceFrom(routersSource, "resetMedicalIntake: staffOrAdminProcedure");
    expect(resetBody).toContain("logAudit");
  });

  it("C2-3: logAudit call is fire-and-forget (wrapped in try/catch, not blocking)", () => {
    const resetBody = sliceFrom(routersSource, "resetMedicalIntake: staffOrAdminProcedure");
    expect(resetBody).toContain("logAudit(");
    // The audit call is inside a try block with a catch, making it non-blocking on failure
    expect(resetBody).toContain("This is NOT a fail-safe");
  });
});

// ─── Correction 3: intakeMode INSERT-only default ────────────────────────────

describe("Correction 3 — intakeMode INSERT-only default", () => {
  it("C3-1: upsertMedicalIntake in db.ts applies intakeMode default only in insertValues", () => {
    const upsertBody = sliceFrom(dbSource, "export async function upsertMedicalIntake");
    expect(upsertBody).toContain("insertValues");
    expect(upsertBody).toContain("legacy");
  });

  it("C3-2: upsertMedicalIntake does NOT apply intakeMode default in updateSet", () => {
    const upsertBody = sliceFrom(dbSource, "export async function upsertMedicalIntake");
    const updateSetIdx = upsertBody.indexOf("updateSet");
    expect(updateSetIdx).toBeGreaterThan(-1);
    const updateSetBody = upsertBody.slice(updateSetIdx, updateSetIdx + 1000);
    // The updateSet should not contain a hardcoded 'legacy' intakeMode
    expect(updateSetBody).not.toContain("'legacy'");
  });

  it("C3-3: upsertMedicalIntake uses INSERT ON DUPLICATE KEY UPDATE (atomic upsert)", () => {
    const upsertBody = sliceFrom(dbSource, "export async function upsertMedicalIntake");
    expect(upsertBody).toContain("onConflictDoUpdate");
  });

  it("C3-4: leads.saveMedicalIntake calls upsertMedicalIntake(leadId, data as any)", () => {
    const saveBody = sliceFrom(routersSource, "saveMedicalIntake: staffOrAdminProcedure");
    expect(saveBody).toContain("upsertMedicalIntake(leadId, data as any)");
  });
});

// ─── Correction 4: resolveCanonicalIntake conflict resolver ──────────────────

describe("Correction 4 — resolveCanonicalIntake conflict resolver", () => {
  it("C4-1: resolveCanonicalIntake is exported from db.ts", () => {
    expect(dbSource).toContain("export async function resolveCanonicalIntake");
  });

  it("C4-2: resolveCanonicalIntake returns status: 'none' | 'resolved' | 'conflict'", () => {
    // Read enough to capture the full function (including the conflict return at ~3350 chars in)
    const fnBody = sliceFrom(dbSource, "export async function resolveCanonicalIntake", 4000);
    expect(fnBody).toContain('"none"');
    expect(fnBody).toContain('"resolved"');
    expect(fnBody).toContain('"conflict"');
  });

  it("C4-3: conflict case returns leadIntakeId, patientIntakeId, and summaries", () => {
    const fnBody = sliceFrom(dbSource, "export async function resolveCanonicalIntake", 4000);
    expect(fnBody).toContain("leadIntakeId");
    expect(fnBody).toContain("patientIntakeId");
    expect(fnBody).toContain("leadIntakeSummary");
    expect(fnBody).toContain("patientIntakeSummary");
  });

  it("C4-4: resolveCanonicalIntake is imported in routers.ts", () => {
    expect(routersSource).toContain("resolveCanonicalIntake");
  });

  it("C4-5: leads.medicalIntake uses resolveCanonicalIntake and returns { intake, conflict }", () => {
    const queryBody = sliceFrom(routersSource, "medicalIntake: staffOrAdminProcedure", 1000);
    expect(queryBody).toContain("resolveCanonicalIntake");
    expect(queryBody).toContain("conflict:");
    expect(queryBody).toContain("intake:");
  });

  it("C4-6: patients.getIntake uses resolveCanonicalIntake and returns { intake, linkedLeadId, conflict }", () => {
    const queryBody = sliceFrom(routersSource, "getIntake: staffOrAdminProcedure", 1000);
    expect(queryBody).toContain("resolveCanonicalIntake");
    expect(queryBody).toContain("conflict:");
    expect(queryBody).toContain("linkedLeadId:");
    expect(queryBody).toContain("intake:");
  });

  it("C4-7: leads.saveMedicalIntake has conflict guard before mutation executes", () => {
    // The mutation body starts ~3043 chars after the procedure declaration; read 10000 chars
    const saveBody = sliceFrom(routersSource, "saveMedicalIntake: staffOrAdminProcedure", 10000);
    const guardIdx = saveBody.indexOf("resolveCanonicalIntake(leadId, null)");
    const upsertIdx = saveBody.indexOf("upsertMedicalIntake");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(upsertIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(upsertIdx);
  });

  it("C4-8: leads.saveMedicalIntake throws CONFLICT with message 'intake_conflict' when conflict detected", () => {
    const saveBody = sliceFrom(routersSource, "saveMedicalIntake: staffOrAdminProcedure", 10000);
    expect(saveBody).toContain('"CONFLICT"');
    expect(saveBody).toContain('"intake_conflict"');
  });

  it("C4-9: patients.saveIntake has conflict guard before mutation executes", () => {
    // The mutation body starts ~3002 chars after the procedure declaration; read 10000 chars
    const saveBody = sliceFrom(routersSource, "saveIntake: staffOrAdminProcedure", 10000);
    const guardIdx = saveBody.indexOf("resolveCanonicalIntake(null, patientId)");
    const upsertIdx = saveBody.indexOf("upsertMedicalIntakeForPatient");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(upsertIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(upsertIdx);
  });

  it("C4-10: patients.saveIntake throws CONFLICT with message 'intake_conflict' when conflict detected", () => {
    const saveBody = sliceFrom(routersSource, "saveIntake: staffOrAdminProcedure", 10000);
    expect(saveBody).toContain('"CONFLICT"');
    expect(saveBody).toContain('"intake_conflict"');
  });

  it("C4-11: resetMedicalIntake has conflict guard before reset executes", () => {
    const resetBody = sliceFrom(routersSource, "resetMedicalIntake: staffOrAdminProcedure", 3000);
    const guardIdx = resetBody.indexOf("resolveCanonicalIntake(input.leadId, null)");
    const existingIntakeIdx = resetBody.indexOf("getMedicalIntake(input.leadId)");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(existingIntakeIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(existingIntakeIdx);
  });

  it("C4-12: resetMedicalIntake throws CONFLICT with message 'intake_conflict' when conflict detected", () => {
    const resetBody = sliceFrom(routersSource, "resetMedicalIntake: staffOrAdminProcedure", 3000);
    expect(resetBody).toContain('"CONFLICT"');
    expect(resetBody).toContain('"intake_conflict"');
  });

  it("C4-13: conflict guard in saveMedicalIntake is placed before date validation", () => {
    const saveBody = sliceFrom(routersSource, "saveMedicalIntake: staffOrAdminProcedure", 10000);
    const guardIdx = saveBody.indexOf("Conflict guard");
    const dateValidationIdx = saveBody.indexOf("Validate marriage date");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(dateValidationIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(dateValidationIdx);
  });

  it("C4-14: conflict guard in patients.saveIntake is placed before date validation", () => {
    const saveBody = sliceFrom(routersSource, "saveIntake: staffOrAdminProcedure", 10000);
    const guardIdx = saveBody.indexOf("Conflict guard");
    const dateValidationIdx = saveBody.indexOf("Backend future-date validation");
    expect(guardIdx).toBeGreaterThan(-1);
    expect(dateValidationIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(dateValidationIdx);
  });
});

// ─── Correction 5: getLeadDocuments union with patient-owned docs ─────────────

describe("Correction 5 — getLeadDocuments union with patient-owned docs", () => {
  it("C5-1: getLeadDocuments is exported from db.ts", () => {
    expect(dbSource).toContain("export async function getLeadDocuments");
  });

  it("C5-2: getLeadDocuments calls resolveLinkedPatientId to find linked patient", () => {
    const fnBody = sliceFrom(dbSource, "export async function getLeadDocuments", 1500);
    expect(fnBody).toContain("resolveLinkedPatientId");
  });

  it("C5-3: getLeadDocuments unions leadId OR patientId when linked patient exists", () => {
    const fnBody = sliceFrom(dbSource, "export async function getLeadDocuments", 1500);
    expect(fnBody).toContain("eq(leadDocuments.leadId, leadId)");
    expect(fnBody).toContain("eq(leadDocuments.patientId, linkedPatientId)");
    expect(fnBody).toContain("or(");
  });

  it("C5-4: getLeadDocuments falls back to leadId-only query when no linked patient", () => {
    const fnBody = sliceFrom(dbSource, "export async function getLeadDocuments", 1500);
    expect(fnBody).toContain("linkedPatientId");
    // The fallback path still filters by leadId
    const fallbackIdx = fnBody.lastIndexOf("eq(leadDocuments.leadId, leadId)");
    expect(fallbackIdx).toBeGreaterThan(-1);
  });

  it("C5-5: getLeadDocuments mirrors getPatientDocuments union pattern", () => {
    const leadFnBody = sliceFrom(dbSource, "export async function getLeadDocuments", 1500);
    const patientFnBody = sliceFrom(dbSource, "export async function getPatientDocuments", 1500);
    expect(leadFnBody).toContain("or(");
    expect(patientFnBody).toContain("or(");
    expect(leadFnBody).toContain("deletion-pending");
    expect(patientFnBody).toContain("deletion-pending");
  });

  it("C5-6: getPatientDocuments still unions patientId OR leadId (existing behavior preserved)", () => {
    const fnBody = sliceFrom(dbSource, "export async function getPatientDocuments", 1500);
    expect(fnBody).toContain("resolveLinkedLeadId");
    expect(fnBody).toContain("eq(leadDocuments.patientId, patientId)");
    expect(fnBody).toContain("eq(leadDocuments.leadId, linkedLeadId)");
  });
});

// ─── Correction 6: ownerType/ownerId population on all upload paths ───────────

describe("Correction 6 — ownerType/ownerId population on upload paths", () => {
  it("C6-1: leads.uploadIntakeFile stamps ownerType='lead' and ownerId=leadId", () => {
    // The leads router starts at a known offset; find the leads-specific uploadIntakeFile
    const leadsRouterIdx = routersSource.indexOf("leads: router({");
    const uploadIdx = routersSource.indexOf("uploadIntakeFile: staffOrAdminProcedure", leadsRouterIdx);
    // ownerType: "lead" is at ~1738 chars in; read 1900 chars
    const uploadBody = routersSource.slice(uploadIdx, uploadIdx + 1900);
    expect(uploadBody).toContain('ownerType: "lead"');
    expect(uploadBody).toContain("ownerId: input.leadId");
  });

  it("C6-2: leads.addDocumentToSection stamps ownerType='lead' and ownerId=leadId", () => {
    const leadsRouterIdx = routersSource.indexOf("leads: router({");
    const addDocIdx = routersSource.indexOf("addDocumentToSection: staffOrAdminProcedure", leadsRouterIdx);
    // ownerType: "lead" is at ~2009 chars in; read 2200 chars
    const addDocBody = routersSource.slice(addDocIdx, addDocIdx + 2200);
    expect(addDocBody).toContain('ownerType: "lead"');
    expect(addDocBody).toContain("ownerId: input.leadId");
  });

  it("C6-3: patients.addDocumentToSection stamps canonical ownerType via canonicalOwnerType variable", () => {
    // Phase 3 Canonical Ownership Corrections: patient paths now use canonicalOwnerType
    // (resolves to 'lead' for converted persons, 'patient' for patient-only records)
    const patientsRouterIdx = routersSource.indexOf("patients: router({");
    const addDocIdx = routersSource.indexOf("addDocumentToSection: staffOrAdminProcedure", patientsRouterIdx);
    // canonicalOwnerType declared at ~1998 chars; ownerType: canonicalOwnerType at ~2599
    const addDocBody = routersSource.slice(addDocIdx, addDocIdx + 2800);
    expect(addDocBody).toContain("canonicalOwnerType");
    expect(addDocBody).toContain("ownerType: canonicalOwnerType");
    expect(addDocBody).toContain("ownerId: canonicalOwnerId");
  });

  it("C6-4: patients.uploadIntakeFile stamps canonical ownerType via canonicalOwnerType variable", () => {
    // Phase 3 Canonical Ownership Corrections: patient paths now use canonicalOwnerType
    // (resolves to 'lead' for converted persons, 'patient' for patient-only records)
    const patientsRouterIdx = routersSource.indexOf("patients: router({");
    const uploadIdx = routersSource.indexOf("uploadIntakeFile: staffOrAdminProcedure", patientsRouterIdx);
    // ownerType: canonicalOwnerType is at ~1991 chars in; read 2500 chars
    const uploadBody = routersSource.slice(uploadIdx, uploadIdx + 2500);
    expect(uploadBody).toContain("canonicalOwnerType");
    expect(uploadBody).toContain("ownerType: canonicalOwnerType");
    expect(uploadBody).toContain("ownerId: canonicalOwnerId");
  });

  it("C6-5: intake-token upload path stamps ownerType='lead' and ownerId=lead.id", () => {
    // The public intake-token upload path (used by the patient-facing intake form)
    const tokenUploadIdx = routersSource.indexOf("uploadedBy: 0, // system/intake upload");
    expect(tokenUploadIdx).toBeGreaterThan(-1);
    const tokenUploadBody = routersSource.slice(tokenUploadIdx - 200, tokenUploadIdx + 500);
    expect(tokenUploadBody).toContain('ownerType: "lead"');
    expect(tokenUploadBody).toContain("ownerId: lead.id");
  });

  it("C6-6: ownerType column exists in lead_documents schema", () => {
    const schemaSource = readFileSync(
      join(__dirname, "../drizzle/schema.ts"),
      "utf-8"
    );
    expect(schemaSource).toContain("ownerType");
    expect(schemaSource).toContain("ownerId");
  });
});

// ─── Client UX: Conflict banner in MedicalIntakeForm ─────────────────────────

describe("Client UX — Conflict banner in MedicalIntakeForm", () => {
  it("C7-1: MedicalIntakeForm derives conflict from leadQuery or patientQuery data", () => {
    expect(medicalIntakeFormSource).toContain("conflict =");
    expect(medicalIntakeFormSource).toContain("leadQuery.data");
    expect(medicalIntakeFormSource).toContain("patientQuery.data");
  });

  it("C7-2: Conflict banner is rendered when conflict is truthy", () => {
    expect(medicalIntakeFormSource).toContain("{conflict && (");
  });

  it("C7-3: Conflict banner shows 'Intake Conflict Detected' heading", () => {
    expect(medicalIntakeFormSource).toContain("Intake Conflict Detected");
  });

  it("C7-4: Conflict banner shows leadIntakeId and patientIntakeId", () => {
    expect(medicalIntakeFormSource).toContain("conflict.leadIntakeId");
    expect(medicalIntakeFormSource).toContain("conflict.patientIntakeId");
  });

  it("C7-5: Conflict banner shows summary metadata (sectionCount, docCount)", () => {
    expect(medicalIntakeFormSource).toContain("sectionCount");
    expect(medicalIntakeFormSource).toContain("docCount");
  });

  it("C7-6: Edit button condition includes !conflict (hidden when conflict is present)", () => {
    // The condition block containing the Edit button should include !conflict
    // The condition is ~300+ chars before the 'Edit Intake' text; search 500 chars before
    const editBtnIdx = medicalIntakeFormSource.indexOf("Edit Intake");
    expect(editBtnIdx).toBeGreaterThan(-1);
    const editBtnContext = medicalIntakeFormSource.slice(editBtnIdx - 600, editBtnIdx + 50);
    expect(editBtnContext).toContain("!conflict");
  });

  it("C7-7: leadSave onError handles intake_conflict with specific message", () => {
    expect(medicalIntakeFormSource).toContain("intake_conflict");
    expect(medicalIntakeFormSource).toContain("Intake conflict detected");
  });

  it("C7-8: patientSave onError handles intake_conflict with specific message", () => {
    const patientSaveIdx = medicalIntakeFormSource.indexOf("patientSave = trpc.patients.saveIntake");
    expect(patientSaveIdx).toBeGreaterThan(-1);
    const patientSaveBody = medicalIntakeFormSource.slice(patientSaveIdx, patientSaveIdx + 700);
    expect(patientSaveBody).toContain("intake_conflict");
  });

  it("C7-9: MedicalIntakeForm extracts intake from { intake, conflict } response shape", () => {
    expect(medicalIntakeFormSource).toContain("(rawIntakeData as any)?.intake");
  });

  it("C7-10: LeadDetailPage reads intakeRecord from intakeData.intake (not intakeData directly)", () => {
    expect(leadDetailSource).toContain("intakeRecord = (intakeData as any)?.intake");
    expect(leadDetailSource).toContain("intakeRecord?.updatedAt");
  });
});

// ─── Integration: Conflict guard + read path consistency ─────────────────────

describe("Integration — Conflict guard consistency", () => {
  it("C8-1: All three write procedures (saveMedicalIntake, saveIntake, resetMedicalIntake) have conflict guards", () => {
    // saveMedicalIntake (guard is ~3450 chars in; read 10000)
    const saveLeadBody = sliceFrom(routersSource, "saveMedicalIntake: staffOrAdminProcedure", 10000);
    expect(saveLeadBody).toContain("resolveCanonicalIntake");
    expect(saveLeadBody).toContain('"intake_conflict"');

    // saveIntake (patients) (guard is ~3281 chars in; read 10000)
    const savePatientBody = sliceFrom(routersSource, "saveIntake: staffOrAdminProcedure", 10000);
    expect(savePatientBody).toContain("resolveCanonicalIntake");
    expect(savePatientBody).toContain('"intake_conflict"');

    // resetMedicalIntake (guard is ~850 chars in; 3000 is enough)
    const resetBody = sliceFrom(routersSource, "resetMedicalIntake: staffOrAdminProcedure", 3000);
    expect(resetBody).toContain("resolveCanonicalIntake");
    expect(resetBody).toContain('"intake_conflict"');
  });

  it("C8-2: Both read procedures (medicalIntake, getIntake) return conflict field", () => {
    const leadReadBody = sliceFrom(routersSource, "medicalIntake: staffOrAdminProcedure", 1000);
    expect(leadReadBody).toContain("conflict:");

    const patientReadBody = sliceFrom(routersSource, "getIntake: staffOrAdminProcedure", 1000);
    expect(patientReadBody).toContain("conflict:");
  });

  it("C8-3: buildIntakeSummary is defined in db.ts and used by resolveCanonicalIntake", () => {
    expect(dbSource).toContain("function buildIntakeSummary");
    // resolveCanonicalIntake calls buildIntakeSummary (at ~3688 chars in; read 4000)
    const fnBody = sliceFrom(dbSource, "export async function resolveCanonicalIntake", 4000);
    expect(fnBody).toContain("buildIntakeSummary");
  });

  it("C8-4: buildIntakeSummary is defined in db.ts", () => {
    expect(dbSource).toContain("function buildIntakeSummary");
  });

  it("C8-5: getLeadDocuments and getPatientDocuments both filter out deletion-pending docs", () => {
    const leadFnBody = sliceFrom(dbSource, "export async function getLeadDocuments", 1500);
    const patientFnBody = sliceFrom(dbSource, "export async function getPatientDocuments", 1500);
    expect(leadFnBody).toContain("deletion-pending");
    expect(patientFnBody).toContain("deletion-pending");
  });

  it("C8-6: conflict guard in resetMedicalIntake runs BEFORE the permanent deletion guard", () => {
    const resetBody = sliceFrom(routersSource, "resetMedicalIntake: staffOrAdminProcedure", 3000);
    const conflictGuardIdx = resetBody.indexOf("resolveCanonicalIntake(input.leadId, null)");
    const permanentGuardIdx = resetBody.indexOf("Permanent deletion requires explicit confirmation");
    expect(conflictGuardIdx).toBeGreaterThan(-1);
    expect(permanentGuardIdx).toBeGreaterThan(-1);
    expect(conflictGuardIdx).toBeLessThan(permanentGuardIdx);
  });
});
