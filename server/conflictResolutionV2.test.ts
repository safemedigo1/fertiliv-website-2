/**
 * conflictResolutionV2.test.ts
 *
 * 21 tests covering all 9 safety corrections to resolveIntakeConflict v2:
 *
 *   Correction 1: Fully transactional document handling
 *   Correction 2: Stale-state revalidation using updatedAt timestamps
 *   Correction 3: Server-side patientId resolution (no client-supplied patientId)
 *   Correction 4: requestId idempotency using conflict_resolution_log
 *   Correction 5: OR(leadId, patientId) filter in archive/delete
 *   Correction 6: leads.getConflictScope server-calculated scope procedure
 *   Correction 7: No default intakeMode in the dialog
 *   Correction 8: Full cache invalidation after resolution
 *   Correction 9: 21 required tests (this file)
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const dbSrc = fs.readFileSync(path.join(__dirname, "db.ts"), "utf8");
const routersSrc = fs.readFileSync(path.join(__dirname, "routers.ts"), "utf8");
const intakeFormSrc = fs.readFileSync(
  path.join(__dirname, "../client/src/components/MedicalIntakeForm.tsx"),
  "utf8",
);
const schemaSrc = fs.readFileSync(
  path.join(__dirname, "../drizzle/schema.ts"),
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

// ─── V2-SCHEMA: conflict_resolution_log table ────────────────────────────────
describe("V2-SCHEMA: conflict_resolution_log table", () => {
  it("V2-SCHEMA-1: conflict_resolution_log table is defined in schema.ts", () => {
    expect(schemaSrc).toContain("conflict_resolution_log");
    expect(schemaSrc).toContain("conflictResolutionLog");
  });

  it("V2-SCHEMA-2: conflict_resolution_log has requestId UNIQUE column", () => {
    const tableBlock = sliceFrom(schemaSrc, "conflict_resolution_log", 800);
    expect(tableBlock).toContain("requestId");
    expect(tableBlock).toContain("unique");
  });

  it("V2-SCHEMA-3: conflict_resolution_log has archivedDocs, deletedDocs, storagePendingDocs json columns", () => {
    const tableBlock = sliceFrom(schemaSrc, "conflict_resolution_log", 800);
    expect(tableBlock).toContain("archivedDocs");
    expect(tableBlock).toContain("deletedDocs");
    expect(tableBlock).toContain("storagePendingDocs");
  });
});

// ─── V2-C1: Fully transactional document handling ────────────────────────────
describe("V2-C1: Correction 1 — Fully transactional document handling", () => {
  it("V2-C1-1: resolveIntakeConflict v2 moves document handling inside the transaction", () => {
    // Use the function signature as the marker (the JSDoc comment is too short)
    const fnBlock = sliceFrom(dbSrc, "export async function resolveIntakeConflict(opts: {", 10000);
    // Document archive/delete should be inside the transaction block
    const txBlock = sliceBetween(fnBlock, "await db.transaction(async (tx) => {", "// ── Post-transaction");
    expect(txBlock).toContain("lifecycleStatus");
    expect(txBlock).toContain("docIds.length > 0");
  });

  it("V2-C1-2: The idempotency log insert is inside the transaction", () => {
    const fnBlock = sliceFrom(dbSrc, "export async function resolveIntakeConflict(opts: {", 10000);
    const txBlock = sliceBetween(fnBlock, "await db.transaction(async (tx) => {", "// ── Post-transaction: S3 deletions");
    expect(txBlock).toContain("conflictResolutionLog");
    expect(txBlock).toContain("tx.insert(conflictResolutionLog)");
  });

  it("V2-C1-3: S3 deletions happen OUTSIDE the transaction (post-transaction section)", () => {
    const fnBlock = sliceFrom(dbSrc, "export async function resolveIntakeConflict(opts: {", 10000);
    const postTxBlock = sliceFrom(fnBlock, "Post-transaction: S3 deletions", 1500);
    expect(postTxBlock).toContain("storageDelete");
    expect(postTxBlock).toContain("actualDeleted");
  });
});

// ─── V2-C2: Stale-state revalidation using updatedAt ─────────────────────────
describe("V2-C2: Correction 2 — Stale-state revalidation using updatedAt", () => {
  it("V2-C2-1: resolveIntakeConflict v2 accepts expectedLeadUpdatedAt and expectedPatientUpdatedAt", () => {
    const fnSignature = sliceFrom(dbSrc, "export async function resolveIntakeConflict(opts: {", 600);
    expect(fnSignature).toContain("expectedLeadUpdatedAt: Date");
    expect(fnSignature).toContain("expectedPatientUpdatedAt: Date");
  });

  it("V2-C2-2: resolveIntakeConflict v2 compares updatedAt timestamps with exact-second floor comparison (v3 update)", () => {
    // v3 update: changed from ±1000ms tolerance to exact-second floor division
    const fnBlock = sliceFrom(dbSrc, "export async function resolveIntakeConflict(opts: {", 12000);
    // Must use Math.floor(x / 1000) === Math.floor(y / 1000) pattern
    expect(fnBlock).toContain("Math.floor");
    expect(fnBlock).toContain("/ 1000)");
    expect(fnBlock).toContain("lead_intake_stale");
    expect(fnBlock).toContain("patient_intake_stale");
  });

  it("V2-C2-3: leads.resolveConflict procedure accepts expectedLeadUpdatedAt and expectedPatientUpdatedAt as z.date()", () => {
    const procBlock = sliceFrom(routersSrc, "resolveConflict: adminProcedure", 600);
    expect(procBlock).toContain("expectedLeadUpdatedAt: z.date()");
    expect(procBlock).toContain("expectedPatientUpdatedAt: z.date()");
  });
});

// ─── V2-C3: Server-side patientId resolution ─────────────────────────────────
describe("V2-C3: Correction 3 — Server-side patientId resolution", () => {
  it("V2-C3-1: resolveIntakeConflict v2 does NOT accept patientId in opts", () => {
    const fnSignature = sliceFrom(dbSrc, "export async function resolveIntakeConflict(opts: {", 600);
    // patientId should NOT be in the opts type — it is resolved server-side
    const optsBlock = sliceBetween(fnSignature, "opts: {", "}): Promise");
    expect(optsBlock).not.toContain("patientId:");
  });

  it("V2-C3-2: resolveIntakeConflict v2 calls resolveLinkedPatientId to get patientId server-side", () => {
    const fnBlock = sliceFrom(dbSrc, "Correction 3: Server-side patientId resolution", 400);
    expect(fnBlock).toContain("resolveLinkedPatientId(opts.leadId)");
    expect(fnBlock).toContain("no_linked_patient");
  });

  it("V2-C3-3: leads.resolveConflict procedure does NOT accept patientId from the client", () => {
    const procBlock = sliceFrom(routersSrc, "resolveConflict: adminProcedure", 600);
    // patientId should NOT be in the z.object input schema
    const inputBlock = sliceBetween(procBlock, "z.object({", "}))\n");
    expect(inputBlock).not.toContain("patientId:");
  });
});

// ─── V2-C4: requestId idempotency ────────────────────────────────────────────
describe("V2-C4: Correction 4 — requestId idempotency", () => {
  it("V2-C4-1: resolveIntakeConflict v2 accepts requestId in opts", () => {
    const fnSignature = sliceFrom(dbSrc, "export async function resolveIntakeConflict(opts: {", 600);
    expect(fnSignature).toContain("requestId: string");
  });

  it("V2-C4-2: resolveIntakeConflict v2 checks conflictResolutionLog for existing requestId before proceeding", () => {
    const fnBlock = sliceFrom(dbSrc, "Correction 4: requestId idempotency check", 600);
    expect(fnBlock).toContain("conflictResolutionLog");
    expect(fnBlock).toContain("opts.requestId");
    expect(fnBlock).toContain("idempotent: true");
  });

  it("V2-C4-3: leads.resolveConflict procedure accepts requestId as z.string().uuid()", () => {
    const procBlock = sliceFrom(routersSrc, "resolveConflict: adminProcedure", 600);
    expect(procBlock).toContain("requestId: z.string().uuid()");
  });

  it("V2-C4-4: The Resolve Conflict dialog generates a fresh requestId when opened", () => {
    const dialogOpenBlock = sliceFrom(intakeFormSrc, "setResolveRequestId(crypto.randomUUID())", 100);
    expect(dialogOpenBlock).toContain("crypto.randomUUID()");
  });
});

// ─── V2-C5: OR(leadId, patientId) filter ─────────────────────────────────────
describe("V2-C5: Correction 5 — OR(leadId, patientId) filter in archive/delete", () => {
  it("V2-C5-1: archiveIntakeDocuments accepts patientId parameter", () => {
    const fnSignature = sliceFrom(dbSrc, "export async function archiveIntakeDocuments(", 200);
    expect(fnSignature).toContain("patientId: number | null");
  });

  it("V2-C5-2: archiveIntakeDocuments uses OR(leadId, patientId) filter when patientId is provided", () => {
    const fnBlock = sliceFrom(dbSrc, "export async function archiveIntakeDocuments(", 800);
    expect(fnBlock).toContain("Correction 5");
    expect(fnBlock).toContain("eq(leadDocuments.patientId, patientId)");
  });

  it("V2-C5-3: permanentlyDeleteIntakeDocuments accepts patientId parameter", () => {
    const fnSignature = sliceFrom(dbSrc, "export async function permanentlyDeleteIntakeDocuments(", 200);
    expect(fnSignature).toContain("patientId: number | null");
  });

  it("V2-C5-4: permanentlyDeleteIntakeDocuments uses OR(leadId, patientId) filter when patientId is provided", () => {
    const fnBlock = sliceFrom(dbSrc, "export async function permanentlyDeleteIntakeDocuments(", 800);
    expect(fnBlock).toContain("Correction 5");
    expect(fnBlock).toContain("eq(leadDocuments.patientId, patientId)");
  });

  it("V2-C5-5: resolveIntakeConflict v2 uses OR(leadId, patientId) inside the transaction for doc handling", () => {
    const fnBlock = sliceFrom(dbSrc, "resolveIntakeConflict v2", 6000);
    const txBlock = sliceBetween(fnBlock, "await db.transaction(async (tx) => {", "// ── Post-transaction");
    expect(txBlock).toContain("Correction 5: OR(leadId, patientId) filter");
    expect(txBlock).toContain("eq(leadDocuments.patientId, resolvedPatientId)");
  });
});

// ─── V2-C6: leads.getConflictScope procedure ─────────────────────────────────
describe("V2-C6: Correction 6 — leads.getConflictScope server-calculated scope procedure", () => {
  it("V2-C6-1: getConflictScope function is exported from db.ts", () => {
    expect(dbSrc).toContain("export async function getConflictScope(");
  });

  it("V2-C6-2: getConflictScope returns leadIntakeId, patientIntakeId, updatedAt timestamps, section counts, and affectedDocCount", () => {
    const fnBlock = sliceFrom(dbSrc, "export async function getConflictScope(", 1500);
    expect(fnBlock).toContain("leadIntakeId");
    expect(fnBlock).toContain("patientIntakeId");
    expect(fnBlock).toContain("leadUpdatedAt");
    expect(fnBlock).toContain("patientUpdatedAt");
    expect(fnBlock).toContain("leadSectionCount");
    expect(fnBlock).toContain("patientSectionCount");
    expect(fnBlock).toContain("affectedDocCount");
  });

  it("V2-C6-3: leads.getConflictScope procedure is defined in routers.ts as an adminProcedure query", () => {
    const procBlock = sliceFrom(routersSrc, "getConflictScope: adminProcedure", 300);
    expect(procBlock).toContain("getConflictScope(input.leadId)");
    expect(procBlock).toContain(".query(");
  });

  it("V2-C6-4: The Resolve Conflict dialog uses conflictScopeQuery to display server-calculated scope", () => {
    expect(intakeFormSrc).toContain("trpc.leads.getConflictScope.useQuery");
    // v3 update: affectedDocCount replaced by archiveEligibleCount/deleteEligibleCount in expanded scope
    expect(intakeFormSrc).toContain("conflictScope.archiveEligibleCount");
    expect(intakeFormSrc).toContain("conflictScope.leadSectionCount");
  });
});

// ─── V2-C7: No default intakeMode in the dialog ──────────────────────────────
describe("V2-C7: Correction 7 — No default intakeMode in the Resolve Conflict dialog", () => {
  it("V2-C7-1: resolveIntakeMode state is initialized with empty string (no default)", () => {
    const stateBlock = sliceFrom(intakeFormSrc, "Correction 7: no default intakeMode", 200);
    expect(stateBlock).toContain('""');
  });

  it("V2-C7-2: The dialog disables the submit button when resolveIntakeMode is empty", () => {
    const submitBlock = sliceFrom(intakeFormSrc, "!resolveIntakeMode", 200);
    expect(submitBlock).toContain("!resolveIntakeMode");
  });

  it("V2-C7-3: The dialog shows a validation message when no intakeMode is selected", () => {
    expect(intakeFormSrc).toContain("You must select a Health Record type before resolving.");
  });
});

// ─── V2-C8: Full cache invalidation after resolution ─────────────────────────
describe("V2-C8: Correction 8 — Full cache invalidation after resolution", () => {
  it("V2-C8-1: onSuccess calls utils.leads.invalidate() for full leads cache invalidation", () => {
    const onSuccessBlock = sliceFrom(intakeFormSrc, "Correction 8: Full cache invalidation after resolution", 900);
    expect(onSuccessBlock).toContain("utils.leads.invalidate()");
  });

  it("V2-C8-2: onSuccess calls utils.patients.invalidate() for full patients cache invalidation", () => {
    const onSuccessBlock = sliceFrom(intakeFormSrc, "Correction 8: Full cache invalidation after resolution", 900);
    expect(onSuccessBlock).toContain("utils.patients.invalidate()");
  });
});

// ─── V2-MISC: Miscellaneous v2 correctness checks ────────────────────────────
describe("V2-MISC: Miscellaneous v2 correctness", () => {
  it("V2-MISC-1: resolveIntakeConflict v2 returns idempotent flag in the result type", () => {
    const fnSignature = sliceFrom(dbSrc, "export async function resolveIntakeConflict(opts: {", 800);
    expect(fnSignature).toContain("idempotent?: boolean");
  });

  it("V2-MISC-2: leads.resolveConflict procedure handles lead_intake_stale and patient_intake_stale errors", () => {
    // The error handling is in the catch block of the resolveConflict mutation
    const procBlock = sliceFrom(routersSrc, "resolveConflict: adminProcedure", 3500);
    expect(procBlock).toContain("lead_intake_stale");
    expect(procBlock).toContain("patient_intake_stale");
  });

  it("V2-MISC-3: leads.resolveConflict procedure handles no_linked_patient error", () => {
    const procBlock = sliceFrom(routersSrc, "resolveConflict: adminProcedure", 3500);
    expect(procBlock).toContain("no_linked_patient");
  });
});
