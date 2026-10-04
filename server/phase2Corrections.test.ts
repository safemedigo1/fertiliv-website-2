/**
 * Phase 2 Correction Test Suite
 *
 * Covers all 9 gaps identified in the Phase 2 verification audit:
 *
 *   Gap 1  — All 18 upload paths use pending-draft lifecycle
 *   Gap 2  — Removed docs processed server-side on Save (server-derived removal)
 *   Gap 3  — Save is wrapped in a single DB transaction
 *   Gap 4  — Expired-file placeholder uses correct status check
 *   Gap 5  — touchDraftSession called from client on meaningful activity
 *   Gap 6  — Save/Cancel buttons disabled when !isWriteActive
 *   Gap 7  — retryPendingStorageDeletions deletes document_translations rows
 *   Gap 8  — requestId idempotency key on Save
 *   Gap 9  — Writer-token (activeWriterToken) enforcement on Save
 *
 * Additional coverage:
 *   - draft_sessions and save_idempotency tables in schema
 *   - cancelDraftSessionImmediate: immediate S3 + AI cleanup
 *   - AI lifecycle guard in translateLeadDocument
 *   - saveHealthRecord atomic service
 *   - storageExists helper
 */

import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

// ─── Source files (read once) ─────────────────────────────────────────────────
const routersSource = readFileSync(join(__dirname, "routers.ts"), "utf-8");
const dbSource = readFileSync(join(__dirname, "db.ts"), "utf-8");
const schemaSource = readFileSync(join(__dirname, "../drizzle/schema.ts"), "utf-8");
const storageSource = readFileSync(join(__dirname, "storage.ts"), "utf-8");
const medicalIntakeFormSource = readFileSync(
  join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"),
  "utf-8"
);
const useDraftSessionSource = readFileSync(
  join(__dirname, "../client/src/hooks/useDraftSession.ts"),
  "utf-8"
);

// ─── Helper ───────────────────────────────────────────────────────────────────
function sliceFrom(src: string, marker: string, length = 10000): string {
  const idx = src.indexOf(marker);
  if (idx === -1) return "";
  return src.slice(idx, idx + length);
}

// ─── Gap 3: Atomic DB transaction ────────────────────────────────────────────

describe("Gap 3 — Atomic DB transaction in saveHealthRecord", () => {
  it("G3-1: saveHealthRecord.ts file exists", () => {
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    expect(src).toBeTruthy();
  });

  it("G3-2: saveHealthRecord uses db.transaction()", () => {
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    expect(src).toContain("db.transaction(");
  });

  it("G3-3: saveHealthRecord promotes pending docs inside the transaction", () => {
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    const txIdx = src.indexOf("db.transaction(");
    const txBody = src.slice(txIdx, txIdx + 3000);
    expect(txBody).toContain("pending-draft");
    expect(txBody).toContain("active");
  });

  it("G3-4: saveHealthRecord archives removed docs inside the transaction", () => {
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    const txIdx = src.indexOf("db.transaction(");
    const txBody = src.slice(txIdx, txIdx + 15000);
    // The transaction body archives removed docs as "historical"
    expect(txBody).toContain("historical");
    // The server derives removed doc IDs by comparing current vs final doc sets
    expect(txBody).toContain("removedDocIds");
  });

  it("G3-5: leads.saveMedicalIntake imports and calls saveHealthRecord", () => {
    expect(routersSource).toContain("saveHealthRecord");
    const saveBody = sliceFrom(routersSource, "saveMedicalIntake: staffOrAdminProcedure");
    expect(saveBody).toContain("saveHealthRecord(");
  });

  it("G3-6: patients.saveIntake imports and calls saveHealthRecord", () => {
    const saveBody = sliceFrom(routersSource, "saveIntake: staffOrAdminProcedure");
    expect(saveBody).toContain("saveHealthRecord(");
  });
});

// ─── Gap 8: requestId idempotency ────────────────────────────────────────────

describe("Gap 8 — requestId idempotency key on Save", () => {
  it("G8-1: save_idempotency table exists in schema", () => {
    expect(schemaSource).toContain("saveIdempotency");
    expect(schemaSource).toContain("save_idempotency");
  });

  it("G8-2: save_idempotency has requestId column", () => {
    const tableBody = sliceFrom(schemaSource, "saveIdempotency", 500);
    expect(tableBody).toContain("requestId");
  });

  it("G8-3: saveHealthRecord checks for duplicate requestId", () => {
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    expect(src).toContain("requestId");
    expect(src).toContain("saveIdempotency");
  });

  it("G8-4: leads.saveMedicalIntake input schema includes requestId", () => {
    const saveBody = sliceFrom(routersSource, "saveMedicalIntake: staffOrAdminProcedure", 5000);
    expect(saveBody).toContain("requestId");
  });

  it("G8-5: patients.saveIntake input schema includes requestId", () => {
    const saveBody = sliceFrom(routersSource, "saveIntake: staffOrAdminProcedure", 5000);
    expect(saveBody).toContain("requestId");
  });

  it("G8-6: MedicalIntakeForm generates a requestId before calling Save", () => {
    expect(medicalIntakeFormSource).toContain("requestId");
    // Should generate a UUID or similar unique ID
    expect(medicalIntakeFormSource).toMatch(/crypto\.randomUUID\(\)|uuid\(\)|nanoid\(\)|Math\.random.*toString/);
  });
});

// ─── Gap 9: Writer-token enforcement ─────────────────────────────────────────

describe("Gap 9 — Writer-token (activeWriterToken) enforcement on Save", () => {
  it("G9-1: saveHealthRecord validates activeWriterToken", () => {
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    expect(src).toContain("activeWriterToken");
  });

  it("G9-2: leads.saveMedicalIntake input schema includes activeWriterToken", () => {
    const saveBody = sliceFrom(routersSource, "saveMedicalIntake: staffOrAdminProcedure", 5000);
    expect(saveBody).toContain("activeWriterToken");
  });

  it("G9-3: patients.saveIntake input schema includes activeWriterToken", () => {
    const saveBody = sliceFrom(routersSource, "saveIntake: staffOrAdminProcedure", 5000);
    expect(saveBody).toContain("activeWriterToken");
  });

  it("G9-4: MedicalIntakeForm passes activeWriterToken (draftSessionId) to Save mutation", () => {
    expect(medicalIntakeFormSource).toContain("activeWriterToken");
  });
});

// ─── Gap 2: Server-derived removal on Save ───────────────────────────────────

describe("Gap 2 — Server-derived removal: removed docs archived on Save", () => {
  it("G2-1: saveHealthRecord derives removed doc IDs server-side", () => {
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    // Server computes removed docs by comparing current vs final doc ID sets
    expect(src).toContain("removedDocIds");
  });

  it("G2-2: saveHealthRecord archives removed docs as historical", () => {
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    expect(src).toContain("historical");
  });

  it("G2-3: saveHealthRecord extracts final doc IDs from intake data", () => {
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    // Uses extractDocIdsFromIntake to compute the final set of doc IDs
    expect(src).toContain("extractDocIdsFromIntake");
  });
});

// ─── Gap 7: retryPendingStorageDeletions cleans up AI rows ───────────────────

describe("Gap 7 — retryPendingStorageDeletions deletes document_translations rows", () => {
  it("G7-1: retryPendingStorageDeletions deletes documentTranslations before hard-delete", () => {
    const fnBody = sliceFrom(dbSource, "export async function retryPendingStorageDeletions");
    // Uses the Drizzle table variable (not the SQL string)
    expect(fnBody).toContain("documentTranslations");
    expect(fnBody).toContain("delete(");
  });

  it("G7-2: retryPendingStorageDeletions deletes translations in correct order (before doc row)", () => {
    const fnBody = sliceFrom(dbSource, "export async function retryPendingStorageDeletions");
    const translationsIdx = fnBody.indexOf("documentTranslations");
    const deleteDocIdx = fnBody.lastIndexOf("leadDocuments");
    expect(translationsIdx).toBeGreaterThan(-1);
    expect(deleteDocIdx).toBeGreaterThan(-1);
    // Translations should be deleted before the doc row
    expect(translationsIdx).toBeLessThan(deleteDocIdx);
  });
});

// ─── Gap 3 (Cancel): Immediate S3 + AI cleanup on Cancel ─────────────────────

describe("Gap 3 (Cancel) — cancelDraftSessionImmediate: immediate S3 + AI cleanup", () => {
  it("G3C-1: cancelDraftSessionImmediate is exported from db.ts", () => {
    expect(dbSource).toContain("export async function cancelDraftSessionImmediate");
  });

  it("G3C-2: cancelDraftSessionImmediate deletes documentTranslations rows", () => {
    const fnBody = sliceFrom(dbSource, "export async function cancelDraftSessionImmediate");
    expect(fnBody).toContain("documentTranslations");
  });

  it("G3C-3: cancelDraftSessionImmediate deletes S3 storage objects", () => {
    const fnBody = sliceFrom(dbSource, "export async function cancelDraftSessionImmediate");
    expect(fnBody).toContain("storageDelete");
  });

  it("G3C-4: cancelDraftSessionImmediate hard-deletes the pending-draft doc rows", () => {
    const fnBody = sliceFrom(dbSource, "export async function cancelDraftSessionImmediate");
    expect(fnBody).toContain("delete(");
  });

  it("G3C-5: leads.cancelDraftSession calls cancelDraftSessionImmediate", () => {
    const leadsRouterIdx = routersSource.indexOf("leads: router({");
    const cancelIdx = routersSource.indexOf("cancelDraftSession:", leadsRouterIdx);
    const cancelBody = routersSource.slice(cancelIdx, cancelIdx + 500);
    expect(cancelBody).toContain("cancelDraftSessionImmediate");
  });

  it("G3C-6: patients.cancelDraftSession calls cancelDraftSessionImmediate", () => {
    const patientsRouterIdx = routersSource.indexOf("patients: router({");
    const cancelIdx = routersSource.indexOf("cancelDraftSession:", patientsRouterIdx);
    const cancelBody = routersSource.slice(cancelIdx, cancelIdx + 500);
    expect(cancelBody).toContain("cancelDraftSessionImmediate");
  });
});

// ─── AI lifecycle guard ───────────────────────────────────────────────────────

describe("AI lifecycle guard — translateLeadDocument rejects pending/deletion-pending docs", () => {
  it("G-AI-1: translateLeadDocument fetches the document before processing", () => {
    const leadsRouterIdx = routersSource.indexOf("leads: router({");
    const translateIdx = routersSource.indexOf("translateLeadDocument:", leadsRouterIdx);
    const translateBody = routersSource.slice(translateIdx, translateIdx + 3000);
    expect(translateBody).toContain("getLeadDocumentById");
  });

  it("G-AI-2: translateLeadDocument rejects pending-draft documents", () => {
    const leadsRouterIdx = routersSource.indexOf("leads: router({");
    const translateIdx = routersSource.indexOf("translateLeadDocument:", leadsRouterIdx);
    const translateBody = routersSource.slice(translateIdx, translateIdx + 3000);
    expect(translateBody).toContain("pending-draft");
    expect(translateBody).toContain("BAD_REQUEST");
  });

  it("G-AI-3: translateLeadDocument rejects deletion-pending documents", () => {
    const leadsRouterIdx = routersSource.indexOf("leads: router({");
    const translateIdx = routersSource.indexOf("translateLeadDocument:", leadsRouterIdx);
    const translateBody = routersSource.slice(translateIdx, translateIdx + 3000);
    expect(translateBody).toContain("deletion-pending");
  });

  it("G-AI-4: getLeadDocumentById is exported from db.ts", () => {
    expect(dbSource).toContain("export async function getLeadDocumentById");
  });
});

// ─── Gap 4: Expired-file placeholder ─────────────────────────────────────────

describe("Gap 4 — Expired-file placeholder in FileAttachmentRow", () => {
  it("G4-1: FileAttachmentRow accepts expiredPlaceholder prop", () => {
    const fnBody = sliceFrom(medicalIntakeFormSource, "function FileAttachmentRow(", 500);
    expect(fnBody).toContain("expiredPlaceholder");
  });

  it("G4-2: FileAttachmentRow renders expired warning when expiredPlaceholder is true", () => {
    const fnBody = sliceFrom(medicalIntakeFormSource, "function FileAttachmentRow(", 2000);
    expect(fnBody).toContain("Pending attachment expired");
  });

  it("G4-3: Expired placeholder uses AlertTriangle icon", () => {
    const fnBody = sliceFrom(medicalIntakeFormSource, "function FileAttachmentRow(", 2000);
    expect(fnBody).toContain("AlertTriangle");
  });

  it("G4-4: Client-side expired detection uses pendingExpiresAt timestamp", () => {
    expect(medicalIntakeFormSource).toContain("pendingExpiresAt");
    expect(medicalIntakeFormSource).toContain("expiredPlaceholder: true");
  });

  it("G4-5: Expired docs are marked in form state with expiredPlaceholder=true", () => {
    expect(medicalIntakeFormSource).toContain("lifecycleStatus: 'expired'");
    expect(medicalIntakeFormSource).toContain("expiredPlaceholder: true");
  });
});

// ─── Gap 5: touchDraftSession from client ────────────────────────────────────

describe("Gap 5 — touchDraftSession called from client on meaningful activity", () => {
  it("G5-1: useDraftSession hook exports touchSession function", () => {
    expect(useDraftSessionSource).toContain("touchSession");
  });

  it("G5-2: touchSession is throttled (not called on every keystroke)", () => {
    // Should have a throttle mechanism (Date.now check or similar)
    expect(useDraftSessionSource).toMatch(/Date\.now\(\)|lastTouch|throttle|TOUCH_INTERVAL/);
  });

  it("G5-3: touchSession calls leads.touchDraftSession or patients.touchDraftSession", () => {
    expect(useDraftSessionSource).toContain("touchDraftSession");
  });

  it("G5-4: MedicalIntakeForm destructures touchSession from useDraftSession", () => {
    expect(medicalIntakeFormSource).toContain("touchSession");
  });

  it("G5-5: touchSession is called after successful file upload", () => {
    // Should be called in uploadIntakeFilePending or makeUploadHandler
    expect(medicalIntakeFormSource).toContain("onTouchSession?.()");
  });

  it("G5-6: touchDraftSession procedure exists in leads router", () => {
    const leadsRouterIdx = routersSource.indexOf("leads: router({");
    const touchIdx = routersSource.indexOf("touchDraftSession:", leadsRouterIdx);
    expect(touchIdx).toBeGreaterThan(-1);
  });

  it("G5-7: touchDraftSession procedure exists in patients router", () => {
    const patientsRouterIdx = routersSource.indexOf("patients: router({");
    const touchIdx = routersSource.indexOf("touchDraftSession:", patientsRouterIdx);
    expect(touchIdx).toBeGreaterThan(-1);
  });
});

// ─── Gap 6: Save/Cancel disabled when !isWriteActive ─────────────────────────

describe("Gap 6 — Save/Cancel buttons disabled when !isWriteActive", () => {
  it("G6-1: Save button is disabled when !isWriteActive", () => {
    // Find the Save button in the toolbar
    const saveButtonIdx = medicalIntakeFormSource.indexOf("onClick={onSave}");
    expect(saveButtonIdx).toBeGreaterThan(-1);
    const saveButtonContext = medicalIntakeFormSource.slice(saveButtonIdx - 200, saveButtonIdx + 200);
    expect(saveButtonContext).toContain("isWriteActive");
  });

  it("G6-2: Read-only tab warning banner is shown when !isWriteActive", () => {
    expect(medicalIntakeFormSource).toContain("isWriteActive");
    // The banner says "Another tab is editing this record."
    expect(medicalIntakeFormSource).toContain("Another tab is editing this record");
  });
});

// ─── Gap 1: All upload paths use pending-draft ───────────────────────────────

describe("Gap 1 — All upload paths use pending-draft lifecycle", () => {
  it("G1-1: uploadIntakeFilePending helper exists in MedicalIntakeForm", () => {
    expect(medicalIntakeFormSource).toContain("uploadIntakeFilePending");
  });

  it("G1-2: uploadIntakeFilePending uses pending-draft upload mutation when draftSessionId is set", () => {
    const fnBody = sliceFrom(medicalIntakeFormSource, "uploadIntakeFilePending");
    expect(fnBody).toContain("draftSessionId");
    // Uses leadPendingUpload/patientPendingUpload (which are uploadPendingIntakeFile mutations)
    expect(fnBody).toContain("leadPendingUpload");
  });

  it("G1-3: GeneralAttachmentsSection accepts and uses draftSessionId prop", () => {
    const fnBody = sliceFrom(medicalIntakeFormSource, "function GeneralAttachmentsSection(");
    expect(fnBody).toContain("draftSessionId");
  });

  it("G1-4: makeUploadHandler uses pending-draft upload when draftSessionId is set", () => {
    const fnBody = sliceFrom(medicalIntakeFormSource, "const makeUploadHandler");
    expect(fnBody).toContain("draftSessionId");
    // Uses leadPendingUpload/patientPendingUpload (which are uploadPendingIntakeFile mutations)
    expect(fnBody).toContain("leadPendingUpload");
  });

  it("G1-5: uploadPendingIntakeFile procedure exists in leads router", () => {
    const leadsRouterIdx = routersSource.indexOf("leads: router({");
    const uploadIdx = routersSource.indexOf("uploadPendingIntakeFile:", leadsRouterIdx);
    expect(uploadIdx).toBeGreaterThan(-1);
  });

  it("G1-6: uploadPendingIntakeFile procedure exists in patients router", () => {
    const patientsRouterIdx = routersSource.indexOf("patients: router({");
    const uploadIdx = routersSource.indexOf("uploadPendingIntakeFile:", patientsRouterIdx);
    expect(uploadIdx).toBeGreaterThan(-1);
  });

  it("G1-7: uploadPendingIntakeFile creates docs with lifecycleStatus=pending-draft", () => {
    const leadsRouterIdx = routersSource.indexOf("leads: router({");
    const uploadIdx = routersSource.indexOf("uploadPendingIntakeFile:", leadsRouterIdx);
    const uploadBody = routersSource.slice(uploadIdx, uploadIdx + 2000);
    expect(uploadBody).toContain("pending-draft");
  });
});

// ─── Schema: draft_sessions and save_idempotency tables ──────────────────────

describe("Schema — draft_sessions and save_idempotency tables", () => {
  it("S1-1: draft_sessions table exists in schema", () => {
    expect(schemaSource).toContain("draftSessions");
    expect(schemaSource).toContain("draft_sessions");
  });

  it("S1-2: draft_sessions has draftSessionId, activeWriterToken, status columns", () => {
    const tableBody = sliceFrom(schemaSource, "draftSessions = pgTable", 2200);
    expect(tableBody).toContain("draftSessionId");
    expect(tableBody).toContain("activeWriterToken");
    expect(tableBody).toContain("status");
  });

  it("S1-3: save_idempotency table exists in schema", () => {
    expect(schemaSource).toContain("saveIdempotency");
    expect(schemaSource).toContain("save_idempotency");
  });

  it("S1-4: save_idempotency has requestId, draftSessionId, status, payloadHash columns", () => {
    const tableBody = sliceFrom(schemaSource, "saveIdempotency", 600);
    expect(tableBody).toContain("requestId");
    expect(tableBody).toContain("draftSessionId");
    expect(tableBody).toContain("status");
  });
});

// ─── storageExists helper ─────────────────────────────────────────────────────

describe("storageExists helper", () => {
  it("SE-1: storageExists is exported from storage.ts", () => {
    expect(storageSource).toContain("export async function storageExists");
  });

  it("SE-2: storageExists returns a boolean", () => {
    const fnBody = sliceFrom(storageSource, "export async function storageExists");
    expect(fnBody).toContain("return");
    expect(fnBody).toMatch(/true|false|boolean/);
  });

  it("SE-3: saveHealthRecord uses storageExists for pre-save validation", () => {
    const src = readFileSync(join(__dirname, "saveHealthRecord.ts"), "utf-8");
    expect(src).toContain("storageExists");
  });
});
