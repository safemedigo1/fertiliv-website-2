/**
 * Conflict Resolution Tests
 *
 * Tests for:
 *   1. Conflict UX — type-selection panel hidden during conflict (C-UX-*)
 *   2. Double toast merged into single toast (C-UX-*)
 *   3. resolveIntakeConflict transactional helper (C-DB-*)
 *   4. leads.resolveConflict tRPC procedure (C-PROC-*)
 *   5. Resolve Conflict dialog (C-UI-*)
 *   6. Audit log (C-AUDIT-*)
 *   7. Reset protection for direct-upload docs (C-RESET-*)
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const routersSrc = fs.readFileSync(path.join(__dirname, "routers.ts"), "utf8");
const dbSrc = fs.readFileSync(path.join(__dirname, "db.ts"), "utf8");
const intakeFormSrc = fs.readFileSync(
  path.join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"),
  "utf8",
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sliceFrom(src: string, marker: string, length: number): string {
  const idx = src.indexOf(marker);
  if (idx === -1) return "";
  return src.slice(idx, idx + length);
}

function sliceBetween(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  if (start === -1) return "";
  const end = src.indexOf(endMarker, start + startMarker.length);
  if (end === -1) return src.slice(start);
  return src.slice(start, end);
}

// ─── C-UX: Conflict UX ───────────────────────────────────────────────────────

describe("C-UX: Conflict UX — type-selection panel hidden during conflict", () => {
  it("C-UX-1: onSetIntakeMode is passed as undefined when conflict is truthy", () => {
    // The ReadOnlyIntake call passes onSetIntakeMode={!readOnly && !conflict ? handleSetIntakeMode : undefined}
    expect(intakeFormSrc).toContain("!readOnly && !conflict ? handleSetIntakeMode : undefined");
  });

  it("C-UX-2: The type-selection panel (isGeneralMode) checks onSetIntakeMode before rendering buttons", () => {
    // The type-selection panel is gated by onSetIntakeMode being defined
    const readOnlyIntakeSrc = sliceBetween(intakeFormSrc, "function ReadOnlyIntake(", "export default function MedicalIntakeForm");
    expect(readOnlyIntakeSrc).toContain("onSetIntakeMode && (");
  });

  it("C-UX-3: handleSetIntakeMode shows a single conflict toast (not two) for intake_conflict errors", () => {
    const handleSetIntakeModeSrc = sliceFrom(intakeFormSrc, "const handleSetIntakeMode = ", 1200);
    // Should contain the single user-friendly message
    expect(handleSetIntakeModeSrc).toContain("An intake conflict is active. Resolve the conflict before identifying the Health Record type.");
    // Should NOT contain the generic "Failed to update Health Record type" as the only error handler
    // (it should only appear in the else branch)
    const conflictToastIdx = handleSetIntakeModeSrc.indexOf("An intake conflict is active");
    const genericToastIdx = handleSetIntakeModeSrc.indexOf("Failed to update Health Record type");
    // The conflict-specific toast must appear before the generic one (it's in the if branch)
    expect(conflictToastIdx).toBeLessThan(genericToastIdx);
  });

  it("C-UX-4: The conflict banner shows the Resolve Conflict button only for admins in lead mode", () => {
    // Search a larger window since the button is deeper in the conflict banner
    const conflictBannerSrc = sliceFrom(intakeFormSrc, "Intake Conflict Detected", 5000);
    expect(conflictBannerSrc).toContain("isAdmin && isLead");
    expect(conflictBannerSrc).toContain("Resolve Conflict (Admin)");
  });

  it("C-UX-5: The Resolve Conflict button opens the dialog (setShowResolveDialog(true))", () => {
    // The button text appears AFTER the onClick, so search backwards from the button text
    const idx = intakeFormSrc.indexOf("Resolve Conflict (Admin)");
    const buttonBlock = intakeFormSrc.slice(Math.max(0, idx - 400), idx + 50);
    expect(buttonBlock).toContain("setShowResolveDialog(true)");
  });
});

// ─── C-UI: Resolve Conflict Dialog ───────────────────────────────────────────

describe("C-UI: Resolve Conflict Dialog", () => {
  it("C-UI-1: Dialog renders with title 'Resolve Intake Conflict'", () => {
    expect(intakeFormSrc).toContain("Resolve Intake Conflict");
  });

  it("C-UI-2: Dialog has Archive and Delete radio options for document handling", () => {
    // v3: dialog expanded with scope display; delete radio is now ~6000 chars from title
    const dialogSrc = sliceFrom(intakeFormSrc, "Resolve Intake Conflict", 8000);
    expect(dialogSrc).toContain("resolveDocHandling === \"archive\"");
    expect(dialogSrc).toContain("resolveDocHandling === \"delete\"");
  });

  it("C-UI-3: Dialog has a Select for newIntakeMode with female/male/general options", () => {
    // v5: dialog expanded with 5-case type policy; female/male/general appear in Case 4 and Advanced panels
    const dialogSrc = sliceFrom(intakeFormSrc, "Resolve Intake Conflict", 18000);
    expect(dialogSrc).toContain("resolveIntakeMode");
    expect(dialogSrc).toContain("Female Health Record");
    expect(dialogSrc).toContain("Male Health Record");
    // Part B: General (unidentified) option removed from conflict dialog (only shown in Case 4 / legacy)
    // expect(dialogSrc).toContain("General (unidentified)");
  });

  it("C-UI-4: Dialog requires typing RESOLVE to enable the submit button", () => {
    // v5: dialog expanded; RESOLVE check is now ~18000 chars from title
    const dialogSrc = sliceFrom(intakeFormSrc, "Resolve Intake Conflict", 20000);
    expect(dialogSrc).toContain("resolveConfirmText !== \"RESOLVE\"");
  });

  it("C-UI-5: Dialog submit button calls resolveConflictMutation.mutate with all required fields", () => {
    // v2: patientId is no longer client-supplied; requestId and conflictScope timestamps are used instead
    const dialogSrc = sliceFrom(intakeFormSrc, "resolveConflictMutation.mutate({", 600);
    expect(dialogSrc).toContain("leadId: id");
    // v2: server resolves patientId; client passes requestId and scope timestamps
    expect(dialogSrc).toContain("requestId: resolveRequestId");
    expect(dialogSrc).toContain("expectedLeadIntakeId: conflictScope.leadIntakeId");
    expect(dialogSrc).toContain("expectedPatientIntakeId: conflictScope.patientIntakeId");
    expect(dialogSrc).toContain("docHandling: resolveDocHandling");
    expect(dialogSrc).toContain("newIntakeMode: resolveIntakeMode");
  });

    it("C-UI-6: onSuccess performs full cache invalidation (leads + patients)", () => {
    // v3: cache invalidation block is ~1600 chars from mutation declaration
    const onSuccessSrc = sliceFrom(intakeFormSrc, "resolveConflictMutation = trpc.leads.resolveConflict.useMutation", 2000);
    expect(onSuccessSrc).toContain("utils.leads.invalidate()");
    expect(onSuccessSrc).toContain("utils.patients.invalidate()");
  });
  it("C-UI-7: onError shows specific toast for already_resolved and state_changed errors", () => {
    // v3: onError is ~1657 chars from mutation declaration
    const onErrorSrc = sliceFrom(intakeFormSrc, "resolveConflictMutation = trpc.leads.resolveConflict.useMutation", 2000);
    expect(onErrorSrc).toContain("already been resolved");
    expect(onErrorSrc).toContain("state has changed");
  });
});

// ─── C-DB: resolveIntakeConflict helper ──────────────────────────────────────

describe("C-DB: resolveIntakeConflict transactional helper", () => {
  it("C-DB-1: Function is exported from db.ts", () => {
    expect(dbSrc).toContain("export async function resolveIntakeConflict(");
  });

  it("C-DB-2: Revalidation guard checks live DB IDs against expected IDs", () => {
    const fnSrc = sliceFrom(dbSrc, "export async function resolveIntakeConflict(", 3000);
    expect(fnSrc).toContain("conflict_already_resolved");
    expect(fnSrc).toContain("conflict_state_changed");
    expect(fnSrc).toContain("liveLeadIntakeId !== opts.expectedLeadIntakeId");
  });

  it("C-DB-3: Document collection excludes direct-upload and deletion-pending docs", () => {
    // v2: document collection is deeper in the function, need larger window
    const fnSrc = sliceFrom(dbSrc, "export async function resolveIntakeConflict(", 10000);
    expect(fnSrc).toContain("direct-upload");
    expect(fnSrc).toContain("deletion-pending");
  });

  it("C-DB-4: Archive path uses tx.update with lifecycleStatus=historical inside the transaction", () => {
    // v2: archive/delete is done inline inside the transaction, not via helper functions
    const fnSrc = sliceFrom(dbSrc, "export async function resolveIntakeConflict(", 10000);
    const txBlock = sliceBetween(fnSrc, "await db.transaction(async (tx) => {", "// ── Post-transaction: S3 deletions");
    expect(txBlock).toContain("historical");
    expect(txBlock).toContain("archiveReason");
  });

  it("C-DB-5: Delete path marks docs as deletion-pending inside the transaction", () => {
    // v2: deletion-pending is set inside the transaction; S3 deletions happen post-tx
    const fnSrc = sliceFrom(dbSrc, "export async function resolveIntakeConflict(", 10000);
    const txBlock = sliceBetween(fnSrc, "await db.transaction(async (tx) => {", "// ── Post-transaction: S3 deletions");
    expect(txBlock).toContain("deletion-pending");
    expect(txBlock).toContain("storageDeletePending");
  });

  it("C-DB-6: Transaction deletes both rows and inserts new canonical row with both leadId and resolvedPatientId", () => {
    // v2: patientId is resolvedPatientId (server-resolved), not opts.patientId
    const fnSrc = sliceFrom(dbSrc, "export async function resolveIntakeConflict(", 10000);
    const txBlock = sliceBetween(fnSrc, "await db.transaction(async (tx) => {", "// ── Post-transaction: S3 deletions");
    expect(txBlock).toContain("tx.delete(medicalIntake)");
    expect(txBlock).toContain("leadId: opts.leadId");
    expect(txBlock).toContain("patientId: resolvedPatientId");
    expect(txBlock).toContain("intakeMode: opts.newIntakeMode");
  });

  it("C-DB-7: Audit log is fire-and-forget (wrapped in try/catch outside transaction)", () => {
    const fnSrc = sliceFrom(dbSrc, "export async function resolveIntakeConflict(", 10000);
    // The audit log call must come AFTER the transaction block
    const txIdx = fnSrc.indexOf("db.transaction(");
    const auditIdx = fnSrc.indexOf("logAudit(", txIdx);
    expect(auditIdx).toBeGreaterThan(txIdx);
    // The audit call must be wrapped in try/catch
    const auditBlock = fnSrc.slice(auditIdx - 20, auditIdx + 200);
    expect(auditBlock).toContain("try {");
  });

  it("C-DB-8: Return type includes newIntakeId, archivedDocs, deletedDocs, storagePendingDocs, idempotent", () => {
    const fnSrc = sliceFrom(dbSrc, "export async function resolveIntakeConflict(", 600);
    expect(fnSrc).toContain("newIntakeId: number");
    expect(fnSrc).toContain("archivedDocs: number[]");
    expect(fnSrc).toContain("deletedDocs: number[]");
    expect(fnSrc).toContain("storagePendingDocs: number[]");
    // v2: idempotent flag added
    expect(fnSrc).toContain("idempotent");
  });
});

// ─── C-PROC: leads.resolveConflict tRPC procedure ────────────────────────────

describe("C-PROC: leads.resolveConflict tRPC procedure", () => {
  it("C-PROC-1: Procedure is admin-only (uses adminProcedure)", () => {
    const procSrc = sliceFrom(routersSrc, "resolveConflict: adminProcedure", 2000);
    expect(procSrc).toContain("adminProcedure");
  });

  it("C-PROC-2: Input schema includes all required v2 fields", () => {
    // v2: patientId removed; requestId, expectedLeadUpdatedAt, expectedPatientUpdatedAt added
    const procSrc = sliceFrom(routersSrc, "resolveConflict: adminProcedure", 800);
    expect(procSrc).toContain("leadId: z.number()");
    // v2: patientId is no longer in the input schema
    expect(procSrc).not.toContain("patientId: z.number()");
    expect(procSrc).toContain("requestId: z.string().uuid()");
    expect(procSrc).toContain("expectedLeadIntakeId: z.number()");
    expect(procSrc).toContain("expectedPatientIntakeId: z.number()");
    expect(procSrc).toContain("expectedLeadUpdatedAt: z.date()");
    expect(procSrc).toContain("expectedPatientUpdatedAt: z.date()");
    expect(procSrc).toContain("docHandling: z.enum");
    expect(procSrc).toContain("newIntakeMode: z.enum");
  });

  it("C-PROC-3: Procedure maps conflict_already_resolved to CONFLICT TRPCError", () => {
    const procSrc = sliceFrom(routersSrc, "resolveConflict: adminProcedure", 2000);
    expect(procSrc).toContain("conflict_already_resolved");
    expect(procSrc).toContain("code: \"CONFLICT\"");
  });

  it("C-PROC-4: Procedure maps conflict_state_changed to CONFLICT TRPCError", () => {
    // v2: error handling is deeper in the catch block, need larger window
    const procSrc = sliceFrom(routersSrc, "resolveConflict: adminProcedure", 3500);
    expect(procSrc).toContain("conflict_state_changed");
  });

  it("C-PROC-5: Procedure passes resolvedBy: ctx.user.id to resolveIntakeConflict", () => {
    const procSrc = sliceFrom(routersSrc, "resolveConflict: adminProcedure", 2000);
    expect(procSrc).toContain("resolvedBy: ctx.user.id");
  });
});

// ─── C-RESET: Reset protection for direct-upload docs ────────────────────────

describe("C-RESET: Direct-upload documents are excluded from Archive and Permanent Reset", () => {
  it("C-RESET-1: archiveIntakeDocuments excludes direct-upload docs", () => {
    const archiveSrc = sliceFrom(dbSrc, "async function archiveIntakeDocuments(", 1500);
    expect(archiveSrc).toContain("direct-upload");
  });

  it("C-RESET-2: permanentlyDeleteIntakeDocuments excludes direct-upload docs", () => {
    const deleteSrc = sliceFrom(dbSrc, "async function permanentlyDeleteIntakeDocuments(", 1500);
    expect(deleteSrc).toContain("direct-upload");
  });
});
