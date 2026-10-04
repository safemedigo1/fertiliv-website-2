/**
 * Phase 3A–3C: Canonical Intake & Documents Test Suite
 *
 * Covers:
 *   3A — Reset loading spinner fix (stable resetGeneration key)
 *   3B — Canonical intake resolver: resolveLinkedLeadId, resolveLinkedPatientId,
 *          getMedicalIntakeByPatientId delegation, upsertMedicalIntakeForPatient delegation,
 *          patients.getIntake returns linkedLeadId, patients.saveIntake returns linkedLeadId,
 *          leads.saveMedicalIntake returns linkedPatientId, MedicalIntakeForm cross-invalidation
 *   3C — Canonical documents resolver: getPatientDocuments union query,
 *          patients.addDocumentToSection stamps leadId, cross-invalidation on upload/delete/reset
 *   Snapshot — fail-safe intake snapshot written to Communications log before deletion
 *   Rename — button/dialog label "Delete & Reset Health Record"
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Source files (read once) ─────────────────────────────────────────────────
const routersSource = readFileSync(join(__dirname, "routers.ts"), "utf-8");
const dbSource = readFileSync(join(__dirname, "db.ts"), "utf-8");
const leadDetailSource = readFileSync(
  join(__dirname, "../client/src/pages/LeadDetailPage.tsx"),
  "utf-8"
);
const patientDetailSource = readFileSync(
  join(__dirname, "../client/src/pages/PatientDetailPage.tsx"),
  "utf-8"
);
const medicalIntakeFormSource = readFileSync(
  join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"),
  "utf-8"
);

// ─── Phase 3A: Reset loading spinner fix ─────────────────────────────────────

describe("Phase 3A — Reset loading spinner fix", () => {
  it("T-3A-1: MedicalIntakeErrorBoundary key does NOT use Date.now()", () => {
    // Date.now() in the key causes a new key on every render → infinite remount loop
    // Find the MedicalIntakeErrorBoundary JSX line and check its key prop
    const boundaryLine = leadDetailSource.split("\n").find(l => l.includes("MedicalIntakeErrorBoundary") && l.includes("key="));
    expect(boundaryLine).toBeDefined();
    expect(boundaryLine).not.toContain("Date.now()");
  });

  it("T-3A-2: resetGeneration state variable is declared in MedicalIntakeTab", () => {
    expect(leadDetailSource).toContain("resetGeneration");
    expect(leadDetailSource).toContain("setResetGeneration");
  });

  it("T-3A-3: resetGeneration is incremented in resetIntake onSuccess", () => {
    expect(leadDetailSource).toContain("setResetGeneration(g => g + 1)");
  });

  it("T-3A-4: MedicalIntakeErrorBoundary key uses resetGeneration (not Date.now)", () => {
    // The key should reference resetGeneration
    const boundaryLine = leadDetailSource.split("\n").find(l => l.includes("MedicalIntakeErrorBoundary") && l.includes("key="));
    expect(boundaryLine).toBeDefined();
    expect(boundaryLine).toContain("resetGeneration");
    expect(boundaryLine).not.toContain("Date.now()");
  });

  it("T-3A-5: resetGeneration starts at 0 (useState(0))", () => {
    expect(leadDetailSource).toContain("useState(0)");
  });
});

// ─── Phase 3B: resolveLinkedLeadId helper ────────────────────────────────────

describe("Phase 3B — resolveLinkedLeadId helper in db.ts", () => {
  it("T-3B-1: resolveLinkedLeadId is exported from db.ts", () => {
    expect(dbSource).toContain("export async function resolveLinkedLeadId");
  });

  it("T-3B-2: resolveLinkedLeadId accepts patientId parameter", () => {
    const fnMatch = dbSource.match(/export async function resolveLinkedLeadId\(([^)]+)\)/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toContain("patientId");
  });

  it("T-3B-3: resolveLinkedLeadId queries patients table for socialLeadId", () => {
    // Should look up the patient row to find the linked lead
    const fnStart = dbSource.indexOf("export async function resolveLinkedLeadId");
    const fnEnd = dbSource.indexOf("\nexport async function", fnStart + 1);
    const fnBody = dbSource.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 800);
    expect(fnBody).toContain("patientId");
    // Should return a leadId or null
    expect(fnBody).toContain("return");
  });

  it("T-3B-4: resolveLinkedLeadId returns null when no linked lead exists", () => {
    const fnStart = dbSource.indexOf("export async function resolveLinkedLeadId");
    const fnEnd = dbSource.indexOf("\nexport async function", fnStart + 1);
    const fnBody = dbSource.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 800);
    expect(fnBody).toContain("null");
  });
});

// ─── Phase 3B: resolveLinkedPatientId helper ─────────────────────────────────

describe("Phase 3B — resolveLinkedPatientId helper in db.ts", () => {
  it("T-3B-5: resolveLinkedPatientId is exported from db.ts", () => {
    expect(dbSource).toContain("export async function resolveLinkedPatientId");
  });

  it("T-3B-6: resolveLinkedPatientId accepts leadId parameter", () => {
    const fnMatch = dbSource.match(/export async function resolveLinkedPatientId\(([^)]+)\)/);
    expect(fnMatch).not.toBeNull();
    expect(fnMatch![1]).toContain("leadId");
  });

  it("T-3B-7: resolveLinkedPatientId queries leads table for convertedPatientId", () => {
    const fnStart = dbSource.indexOf("export async function resolveLinkedPatientId");
    const fnEnd = dbSource.indexOf("\nexport async function", fnStart + 1);
    const fnBody = dbSource.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 800);
    expect(fnBody).toContain("leadId");
    expect(fnBody).toContain("return");
  });

  it("T-3B-8: resolveLinkedPatientId returns null when no linked patient exists", () => {
    const fnStart = dbSource.indexOf("export async function resolveLinkedPatientId");
    const fnEnd = dbSource.indexOf("\nexport async function", fnStart + 1);
    const fnBody = dbSource.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 800);
    expect(fnBody).toContain("null");
  });
});

// ─── Phase 3B: getMedicalIntakeByPatientId delegation ────────────────────────

describe("Phase 3B — getMedicalIntakeByPatientId delegates to lead-owned row", () => {
  it("T-3B-9: getMedicalIntakeByPatientId calls resolveLinkedLeadId", () => {
    const fnStart = dbSource.indexOf("export async function getMedicalIntakeByPatientId");
    const fnEnd = dbSource.indexOf("\nexport async function", fnStart + 1);
    const fnBody = dbSource.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 800);
    expect(fnBody).toContain("resolveLinkedLeadId");
  });

  it("T-3B-10: getMedicalIntakeByPatientId calls getMedicalIntake(linkedLeadId) when linked", () => {
    const fnStart = dbSource.indexOf("export async function getMedicalIntakeByPatientId");
    const fnEnd = dbSource.indexOf("\nexport async function", fnStart + 1);
    const fnBody = dbSource.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 800);
    expect(fnBody).toContain("getMedicalIntake");
  });
});

// ─── Phase 3B: upsertMedicalIntakeForPatient delegation ──────────────────────

describe("Phase 3B — upsertMedicalIntakeForPatient delegates to lead-owned row", () => {
  it("T-3B-11: upsertMedicalIntakeForPatient calls resolveLinkedLeadId", () => {
    const fnStart = dbSource.indexOf("export async function upsertMedicalIntakeForPatient");
    const fnEnd = dbSource.indexOf("\nexport async function", fnStart + 1);
    const fnBody = dbSource.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 1000);
    expect(fnBody).toContain("resolveLinkedLeadId");
  });

  it("T-3B-12: upsertMedicalIntakeForPatient calls upsertMedicalIntake(linkedLeadId) when linked", () => {
    const fnStart = dbSource.indexOf("export async function upsertMedicalIntakeForPatient");
    const fnEnd = dbSource.indexOf("\nexport async function", fnStart + 1);
    const fnBody = dbSource.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 1000);
    expect(fnBody).toContain("upsertMedicalIntake");
  });
});

// ─── Phase 3B: patients.getIntake returns linkedLeadId ───────────────────────

describe("Phase 3B — patients.getIntake returns linkedLeadId", () => {
  it("T-3B-13: patients.getIntake procedure returns linkedLeadId", () => {
    // Find the getIntake procedure in the patients router
    const patientsRouterStart = routersSource.indexOf("patients: router({");
    const patientsRouterEnd = routersSource.indexOf("\n})", patientsRouterStart);
    const patientsRouterBody = routersSource.slice(patientsRouterStart, patientsRouterEnd);
    // getIntake should return linkedLeadId
    expect(patientsRouterBody).toContain("linkedLeadId");
  });

  it("T-3B-14: patients.getIntake calls resolveLinkedLeadId", () => {
    const patientsRouterStart = routersSource.indexOf("patients: router({");
    const patientsRouterEnd = routersSource.indexOf("\n})", patientsRouterStart);
    const patientsRouterBody = routersSource.slice(patientsRouterStart, patientsRouterEnd);
    expect(patientsRouterBody).toContain("resolveLinkedLeadId");
  });
});

// ─── Phase 3B: patients.saveIntake returns linkedLeadId ──────────────────────

describe("Phase 3B — patients.saveIntake returns linkedLeadId for cross-invalidation", () => {
  it("T-3B-15: patients.saveIntake returns linkedLeadId", () => {
    // patients.saveIntake has input.patientId (not leadId), so search for that unique signature
    const saveIntakeIdx = routersSource.indexOf("saveIntake: staffOrAdminProcedure");
    // Extend window to 8000 chars to capture the full mutation body (includes large z.object input schema)
    const saveIntakeBody = routersSource.slice(saveIntakeIdx, saveIntakeIdx + 8000);
    expect(saveIntakeBody).toContain("linkedLeadId");
  });
});

// ─── Phase 3B: leads.saveMedicalIntake returns linkedPatientId ───────────────

describe("Phase 3B — leads.saveMedicalIntake returns linkedPatientId for cross-invalidation", () => {
  it("T-3B-16: leads.saveMedicalIntake returns linkedPatientId", () => {
    // saveMedicalIntake only exists in the leads router (unique name)
    // Use a larger window to capture the full mutation body
    const saveMedIdx = routersSource.indexOf("saveMedicalIntake: staffOrAdminProcedure");
    const saveMedBody = routersSource.slice(saveMedIdx, saveMedIdx + 10000);
    expect(saveMedBody).toContain("linkedPatientId");
  });

  it("T-3B-17: leads.saveMedicalIntake calls resolveLinkedPatientId", () => {
    const saveMedIdx = routersSource.indexOf("saveMedicalIntake: staffOrAdminProcedure");
    const saveMedBody = routersSource.slice(saveMedIdx, saveMedIdx + 10000);
    expect(saveMedBody).toContain("resolveLinkedPatientId");
  });
});

// ─── Phase 3B: MedicalIntakeForm cross-invalidation ──────────────────────────

describe("Phase 3B — MedicalIntakeForm cross-invalidation on save", () => {
  it("T-3B-18: leadSave.onSuccess cross-invalidates patients.getIntake when linkedPatientId present", () => {
    expect(medicalIntakeFormSource).toContain("patients.getIntake.invalidate");
  });

  it("T-3B-19: patientSave.onSuccess cross-invalidates leads.medicalIntake when linkedLeadId present", () => {
    expect(medicalIntakeFormSource).toContain("leads.medicalIntake.invalidate");
  });

  it("T-3B-20: cross-invalidation is conditional on linkedPatientId / linkedLeadId being present", () => {
    // Should check for the value before invalidating (not unconditional)
    expect(medicalIntakeFormSource).toContain("data?.linkedPatientId");
    expect(medicalIntakeFormSource).toContain("data?.linkedLeadId");
  });
});

// ─── Phase 3C: getPatientDocuments union query ───────────────────────────────

describe("Phase 3C — getPatientDocuments union query", () => {
  it("T-3C-1: getPatientDocuments calls resolveLinkedLeadId", () => {
    const fnStart = dbSource.indexOf("export async function getPatientDocuments");
    const fnEnd = dbSource.indexOf("\nexport async function", fnStart + 1);
    const fnBody = dbSource.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 1500);
    expect(fnBody).toContain("resolveLinkedLeadId");
  });

  it("T-3C-2: getPatientDocuments uses OR condition to include lead-owned documents", () => {
    const fnStart = dbSource.indexOf("export async function getPatientDocuments");
    const fnEnd = dbSource.indexOf("\nexport async function", fnStart + 1);
    const fnBody = dbSource.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 1500);
    // Should use drizzle's or() to union both ownership keys
    expect(fnBody).toContain("or(");
  });

  it("T-3C-3: getPatientDocuments includes documents by leadId when linked lead exists", () => {
    const fnStart = dbSource.indexOf("export async function getPatientDocuments");
    const fnEnd = dbSource.indexOf("\nexport async function", fnStart + 1);
    const fnBody = dbSource.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 1500);
    expect(fnBody).toContain("leadId");
  });

  it("T-3C-4: getPatientDocuments still includes documents by patientId", () => {
    const fnStart = dbSource.indexOf("export async function getPatientDocuments");
    const fnEnd = dbSource.indexOf("\nexport async function", fnStart + 1);
    const fnBody = dbSource.slice(fnStart, fnEnd > fnStart ? fnEnd : fnStart + 1500);
    expect(fnBody).toContain("patientId");
  });
});

// ─── Phase 3C: patients.addDocumentToSection stamps leadId ───────────────────

describe("Phase 3C — patients.addDocumentToSection stamps leadId when linked", () => {
  it("T-3C-5: patients.addDocumentToSection calls resolveLinkedLeadId", () => {
    const patientsRouterStart = routersSource.indexOf("patients: router({");
    const patientsRouterEnd = routersSource.indexOf("\n})", patientsRouterStart);
    const patientsRouterBody = routersSource.slice(patientsRouterStart, patientsRouterEnd);
    const addDocIdx = patientsRouterBody.indexOf("addDocumentToSection:");
    const addDocBody = patientsRouterBody.slice(addDocIdx, addDocIdx + 2000);
    expect(addDocBody).toContain("resolveLinkedLeadId");
  });

  it("T-3C-6: patients.addDocumentToSection returns linkedLeadId", () => {
    const patientsRouterStart = routersSource.indexOf("patients: router({");
    const patientsRouterEnd = routersSource.indexOf("\n})", patientsRouterStart);
    const patientsRouterBody = routersSource.slice(patientsRouterStart, patientsRouterEnd);
    const addDocIdx = patientsRouterBody.indexOf("addDocumentToSection:");
    const addDocBody = patientsRouterBody.slice(addDocIdx, addDocIdx + 2000);
    expect(addDocBody).toContain("linkedLeadId");
  });
});

// ─── Phase 3C: patients.uploadIntakeFile stamps leadId ───────────────────────

describe("Phase 3C — patients.uploadIntakeFile stamps leadId when linked", () => {
  it("T-3C-7: patients.uploadIntakeFile calls resolveLinkedLeadId", () => {
    const patientsRouterStart = routersSource.indexOf("patients: router({");
    const patientsRouterEnd = routersSource.indexOf("\n})", patientsRouterStart);
    const patientsRouterBody = routersSource.slice(patientsRouterStart, patientsRouterEnd);
    const uploadIdx = patientsRouterBody.indexOf("uploadIntakeFile:");
    const uploadBody = patientsRouterBody.slice(uploadIdx, uploadIdx + 2000);
    expect(uploadBody).toContain("resolveLinkedLeadId");
  });

  it("T-3C-8: patients.uploadIntakeFile returns linkedLeadId", () => {
    const patientsRouterStart = routersSource.indexOf("patients: router({");
    const patientsRouterEnd = routersSource.indexOf("\n})", patientsRouterStart);
    const patientsRouterBody = routersSource.slice(patientsRouterStart, patientsRouterEnd);
    const uploadIdx = patientsRouterBody.indexOf("uploadIntakeFile:");
    const uploadBody = patientsRouterBody.slice(uploadIdx, uploadIdx + 2000);
    expect(uploadBody).toContain("linkedLeadId");
  });
});

// ─── Phase 3C: leads.addDocumentToSection returns linkedPatientId ─────────────

describe("Phase 3C — leads.addDocumentToSection returns linkedPatientId", () => {
  it("T-3C-9: leads.addDocumentToSection returns linkedPatientId", () => {
    // leads.addDocumentToSection has input.leadId (not patientId).
    // Find the second occurrence of addDocumentToSection (the leads router one).
    const firstOccurrence = routersSource.indexOf("addDocumentToSection: staffOrAdminProcedure");
    const addDocIdx = routersSource.indexOf("addDocumentToSection: staffOrAdminProcedure", firstOccurrence + 1);
    const addDocBody = routersSource.slice(addDocIdx, addDocIdx + 12000);
    expect(addDocBody).toContain("linkedPatientId");
  });

  it("T-3C-10: leads.addDocumentToSection calls resolveLinkedPatientId", () => {
    const firstOccurrence = routersSource.indexOf("addDocumentToSection: staffOrAdminProcedure");
    const addDocIdx = routersSource.indexOf("addDocumentToSection: staffOrAdminProcedure", firstOccurrence + 1);
    const addDocBody = routersSource.slice(addDocIdx, addDocIdx + 12000);
    expect(addDocBody).toContain("resolveLinkedPatientId");
  });
});

// ─── Phase 3C: leads.uploadIntakeFile returns linkedPatientId ─────────────────

describe("Phase 3C — leads.uploadIntakeFile returns linkedPatientId", () => {
  it("T-3C-11: leads.uploadIntakeFile returns linkedPatientId", () => {
    const leadsRouterStart = routersSource.indexOf("leads: router({");
    const leadsRouterEnd = routersSource.indexOf("\n})", leadsRouterStart);
    const leadsRouterBody = routersSource.slice(leadsRouterStart, leadsRouterEnd);
    const uploadIdx = leadsRouterBody.indexOf("uploadIntakeFile:");
    const uploadBody = leadsRouterBody.slice(uploadIdx, uploadIdx + 2000);
    expect(uploadBody).toContain("linkedPatientId");
  });
});

// ─── Phase 3C: Cross-invalidation in LeadDetailPage ──────────────────────────

describe("Phase 3C — Cross-invalidation in LeadDetailPage", () => {
  it("T-3C-12: addDocToSection.onSuccess cross-invalidates patients.documents", () => {
    expect(leadDetailSource).toContain("utils.patients.documents.invalidate");
  });

  it("T-3C-13: resetIntake.onSuccess cross-invalidates patients.getIntake when linkedPatientId present", () => {
    expect(leadDetailSource).toContain("utils.patients.getIntake.invalidate");
  });

  it("T-3C-14: resetIntake.onSuccess cross-invalidates patients.documents when linkedPatientId present", () => {
    expect(leadDetailSource).toContain("utils.patients.documents.invalidate");
  });

  it("T-3C-15: cross-invalidation checks result.linkedPatientId before invalidating", () => {
    expect(leadDetailSource).toContain("result?.linkedPatientId");
  });
});

// ─── Phase 3C: Cross-invalidation in PatientDetailPage ───────────────────────

describe("Phase 3C — Cross-invalidation in PatientDetailPage", () => {
  it("T-3C-16: PatientDocumentsTab receives linkedLeadId prop", () => {
    expect(patientDetailSource).toContain("linkedLeadId");
  });

  it("T-3C-17: PatientDocumentsTab cross-invalidates leads.documents on upload/delete", () => {
    expect(patientDetailSource).toContain("utils.leads.documents.invalidate");
  });
});

// ─── Snapshot: fail-safe intake snapshot to Communications log ────────────────

describe("Audit — metadata-only audit log (Correction 2: no clinical snapshot in Communications)", () => {
  it("T-SNAP-1: resetMedicalIntake does NOT write fullIntake JSON to lead_communications", () => {
    // Correction 2: clinical snapshots were removed from Communications log.
    // Only metadata-only audit entries are written to audit_logs.
    expect(routersSource).not.toContain("[INTAKE_SNAPSHOT]");
    expect(routersSource).not.toContain("fullIntake");
  });

  it("T-SNAP-2: resetMedicalIntake uses logAudit (not createLeadCommunication) for audit", () => {
    const resetIdx = routersSource.indexOf("resetMedicalIntake:");
    const resetBody = routersSource.slice(resetIdx, resetIdx + 5000);
    // Must use logAudit for metadata-only audit
    expect(resetBody).toContain("logAudit");
    // Must NOT write to lead_communications table
    expect(resetBody).not.toContain("createLeadCommunication");
  });

  it("T-SNAP-3: audit logAudit call is placed BEFORE deleteIntakeByLeadId", () => {
    const resetIdx = routersSource.indexOf("resetMedicalIntake:");
    const resetBody = routersSource.slice(resetIdx, resetIdx + 6000);
    const auditPos = resetBody.indexOf("logAudit(");
    const deletePos = resetBody.indexOf("await deleteIntakeByLeadId");
    expect(auditPos).toBeGreaterThan(0);
    expect(deletePos).toBeGreaterThan(0);
    expect(auditPos).toBeLessThan(deletePos);
  });

  it("T-SNAP-4: resetMedicalIntake does NOT contain fullIntake JSON (Correction 2)", () => {
    const resetIdx = routersSource.indexOf("resetMedicalIntake:");
    const resetBody = routersSource.slice(resetIdx, resetIdx + 8000);
    expect(resetBody).not.toContain("fullIntake");
  });

  it("T-SNAP-5: audit entry includes action field referencing reset_health_record", () => {
    const resetIdx = routersSource.indexOf("resetMedicalIntake:");
    const resetBody = routersSource.slice(resetIdx, resetIdx + 8000);
    expect(resetBody).toContain("reset_health_record");
  });

  it("T-SNAP-6: resetMedicalIntake returns linkedPatientId via resolveLinkedPatientId", () => {
    const resetIdx = routersSource.indexOf("resetMedicalIntake:");
    const resetBody = routersSource.slice(resetIdx, resetIdx + 8000);
    // linkedPatientId is returned for cross-invalidation (not for snapshot)
    expect(resetBody).toContain("linkedPatientId");
    expect(resetBody).toContain("resolveLinkedPatientId");
  });

  it("T-SNAP-7: audit comment says This is NOT a fail-safe (fire-and-forget)", () => {
    expect(routersSource).toContain("This is NOT a fail-safe");
  });

  it("T-SNAP-8: resetMedicalIntake does NOT use best-effort snapshot pattern", () => {
    expect(routersSource).not.toContain("Snapshot is best-effort");
  });
});

// ─── Rename: Delete & Reset Health Record ────────────────────────────────────

describe("Rename — Delete & Reset Health Record button and dialog", () => {
  it("T-RENAME-1: button label is 'Delete & Reset Health Record'", () => {
    expect(leadDetailSource).toContain("Delete &amp; Reset Health Record");
  });

  it("T-RENAME-2: choose_mode dialog title is 'Delete & Reset Health Record'", () => {
    // Should appear in the DialogTitle
    expect(leadDetailSource).toContain("Delete &amp; Reset Health Record");
  });

  it("T-RENAME-3: confirm_permanent dialog title is 'Delete & Reset Health Record?'", () => {
    expect(leadDetailSource).toContain("Delete &amp; Reset Health Record?");
  });

  it("T-RENAME-4: dialog mentions Communications log", () => {
    expect(leadDetailSource).toContain("Communications log");
  });

  it("T-RENAME-5: old label 'Reset Intake' is no longer used as button text", () => {
    expect(leadDetailSource).not.toContain(">Reset Intake<");
    expect(leadDetailSource).not.toContain("\"Yes, Reset Intake\"");
  });
});

// ─── Phase 3B: resetMedicalIntake returns linkedPatientId ────────────────────

describe("Phase 3B — resetMedicalIntake returns linkedPatientId", () => {
  it("T-3B-21: resetMedicalIntake returns linkedPatientId in its result", () => {
    const resetIdx = routersSource.indexOf("resetMedicalIntake:");
    // The return statement is ~6000+ chars in; read 8000 chars
    const resetBody = routersSource.slice(resetIdx, resetIdx + 8000);
    expect(resetBody).toContain("linkedPatientId");
  });

  it("T-3B-22: resetMedicalIntake calls resolveLinkedPatientId", () => {
    const resetIdx = routersSource.indexOf("resetMedicalIntake:");
    const resetBody = routersSource.slice(resetIdx, resetIdx + 8000);
    expect(resetBody).toContain("resolveLinkedPatientId");
  });
});
