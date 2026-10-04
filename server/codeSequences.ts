/**
 * codeSequences.ts
 * Permanent, sequential, non-reusable code generator.
 *
 * Each entity type has a row in `code_sequences` that tracks the last issued
 * number. The counter only ever moves forward — deletions never affect it.
 *
 * Format examples:
 *   patient         → FRT-00001
 *   lead            → LEAD-00001
 *   service         → SVC-00001
 *   package         → PKG-00001
 *   invoice         → INV-00001
 *   lab_order       → LAB-00001
 *   treatment_cycle → CYC-00001
 *   appointment     → APT-00001
 *   proposal        → PROP-00001
 *   partner_clinic  → CLIN-00001
 *   doctor          → DOC-00001
 */

import { getDb } from "./db";

export type EntityType =
  | "patient"
  | "lead"
  | "service"
  | "package"
  | "invoice"
  | "lab_order"
  | "treatment_cycle"
  | "appointment"
  | "proposal"
  | "partner_clinic"
  | "doctor"
  | "external_report";

const PREFIX: Record<EntityType, string> = {
  patient: "FRT",
  lead: "LEAD",
  service: "SVC",
  package: "PKG",
  invoice: "INV",
  lab_order: "LAB",
  treatment_cycle: "CYC",
  appointment: "APT",
  proposal: "PROP",
  partner_clinic: "CLIN",
  doctor: "DOC",
  external_report: "EXT",
};

function formatCode(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(5, "0")}`;
}

/**
 * Atomically increments the counter for `entityType` and returns the next code.
 * Uses UPDATE + SELECT to be safe under concurrent writes.
 */
// Maps entity type → table name and code column for self-healing sync
const ENTITY_TABLE: Partial<Record<EntityType, { table: string; col: string }>> = {
  patient: { table: "patients", col: "mrn" },
  lead: { table: "leads", col: "code" },
  invoice: { table: "invoices", col: "invoiceNumber" },
  appointment: { table: "appointments", col: "code" },
  treatment_cycle: { table: "treatment_cycles", col: "code" },
};

export async function getNextCode(entityType: EntityType): Promise<string> {
  const prefix = PREFIX[entityType];
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  // Self-healing: sync counter with actual max in DB to prevent duplicate key errors
  const entityTable = ENTITY_TABLE[entityType];
  if (entityTable) {
    try {
      const maxRows: any = await db.execute(
        // @ts-ignore
        `SELECT COALESCE(MAX(CAST(SUBSTRING(\`${entityTable.col}\`, ${prefix.length + 2}) AS UNSIGNED)), 0) AS max_n
         FROM \`${entityTable.table}\`
         WHERE \`${entityTable.col}\` LIKE '${prefix}-%'`
      );
      const maxData = Array.isArray(maxRows) && Array.isArray(maxRows[0]) ? maxRows[0] : (Array.isArray(maxRows) ? maxRows : []);
      const maxN = Number(maxData[0]?.max_n ?? maxData[0]?.[0] ?? 0);
      if (maxN > 0) {
        // Ensure counter is at least as high as the actual max
        await db.execute(
          // @ts-ignore
          `UPDATE code_sequences SET last_number = GREATEST(last_number, ${maxN}) WHERE entity_type = '${entityType}'`
        );
      }
    } catch {
      // Non-critical: if sync fails, proceed with normal increment
    }
  }

  // Atomic increment
  await db.execute(
    // @ts-ignore — raw SQL for TiDB compatibility
    `UPDATE code_sequences SET last_number = last_number + 1 WHERE entity_type = '${entityType}'`
  );

  const rows: any = await db.execute(
    // @ts-ignore
    `SELECT last_number FROM code_sequences WHERE entity_type = '${entityType}' LIMIT 1`
  );

  // db.execute returns [rowDataArray, fieldsArray] — rowDataArray is rows[0]
  const rowData = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : (Array.isArray(rows) ? rows : []);
  const firstRow = rowData[0];
  const lastNumber = Number(firstRow?.last_number ?? firstRow?.[0] ?? 1);

  return formatCode(prefix, lastNumber);
}

/**
 * Check if a code is already used by another record (for uniqueness validation on edit).
 * Returns the id of the conflicting record, or null if the code is free.
 */
export async function findCodeConflict(
  table: string,
  code: string,
  excludeId?: number
): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;

  const excludeClause = excludeId ? ` AND id != ${excludeId}` : "";
  const rows: any = await db.execute(
    // @ts-ignore
    `SELECT id FROM \`${table}\` WHERE code = ${JSON.stringify(code)}${excludeClause} LIMIT 1`
  );

  // db.execute returns [rowDataArray, fieldsArray] — rowDataArray is rows[0]
  const rowData = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : (Array.isArray(rows) ? rows : []);
  return rowData.length > 0 ? Number(rowData[0]?.id ?? rowData[0]?.[0]) : null;
}

export type DuplicateConflict = {
  field: "email" | "phone" | "secondaryPhone";
  conflictId: number;
  conflictName: string;
};

/**
 * Check for duplicate email, phone, or secondaryPhone across a given table.
 *
 * This is a SOFT WARNING — it returns all conflicts found but does NOT block saving.
 * The frontend is responsible for showing the warning and letting staff override.
 *
 * Supports excludeId to skip the record being edited (e.g. during lead→patient conversion
 * or when editing an existing record — the source record's own contact details should not
 * trigger a false duplicate).
 *
 * Returns an array of all conflicts found (may be multiple if both email and phone match
 * different records). Returns empty array if no duplicates.
 */
export async function checkDuplicate(
  table: string,
  fields: { email?: string | null; phone?: string | null; secondaryPhone?: string | null },
  excludeId?: number
): Promise<DuplicateConflict[]> {
  const db = await getDb();
  if (!db) return [];

  const { email, phone, secondaryPhone } = fields;
  const excludeClause = excludeId ? ` AND id != ${excludeId}` : "";
  const conflicts: DuplicateConflict[] = [];

  // Helper to run a single field check
  async function checkField(
    fieldName: "email" | "phone" | "secondaryPhone",
    value: string
  ) {
    // Check primary phone column
    const colName = fieldName === "secondaryPhone" ? "secondaryPhone" : fieldName;
    // Some tables (users, doctors via users) may not have secondaryPhone — skip gracefully
    let rows: any;
    try {
      rows = await db!.execute(
          // @ts-ignore
          `SELECT id,
                TRIM(CONCAT(COALESCE(firstName,''), ' ', COALESCE(lastName,''))) AS fullName
         FROM \`${table}\`
         WHERE \`${colName}\` = ${JSON.stringify(value)}${excludeClause}
         LIMIT 1`
      );
    } catch {
      // Column doesn't exist in this table — skip
      return;
    }
    // db.execute returns [rowDataArray, fieldsArray]
    const arr = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : (Array.isArray(rows) ? rows : []);
    if (arr.length > 0) {
      conflicts.push({
        field: fieldName,
        conflictId: Number(arr[0]?.id ?? arr[0]?.[0]),
        conflictName: String(arr[0]?.fullName ?? arr[0]?.[1] ?? ""),
      });
    }

    // Also check the OTHER phone column for cross-column duplicates
    // e.g. new primary phone matches an existing secondary phone
    if (fieldName === "phone") {
      let rows2: any;
      try {
        rows2 = await db!.execute(
          // @ts-ignore
          `SELECT id,
                  TRIM(CONCAT(COALESCE(firstName,''), ' ', COALESCE(lastName,''))) AS fullName
           FROM \`${table}\`
           WHERE \`secondaryPhone\` = ${JSON.stringify(value)}${excludeClause}
           LIMIT 1`
        );
        const arr2 = Array.isArray(rows2) && Array.isArray(rows2[0]) ? rows2[0] : (Array.isArray(rows2) ? rows2 : []);
        if (arr2.length > 0 && !conflicts.find(c => c.conflictId === Number(arr2[0]?.id ?? arr2[0]?.[0]))) {
          conflicts.push({
            field: "phone",
            conflictId: Number(arr2[0]?.id ?? arr2[0]?.[0]),
            conflictName: String(arr2[0]?.fullName ?? arr2[0]?.[1] ?? ""),
          });
        }
      } catch {
        // secondaryPhone column doesn't exist — skip
      }
    }
  }

  if (email?.trim()) await checkField("email", email.trim());
  if (phone?.trim()) await checkField("phone", phone.trim());
  if (secondaryPhone?.trim()) await checkField("secondaryPhone", secondaryPhone.trim());

  return conflicts;
}
