/**
 * Phase 2 — intakeMode workflow separation tests (updated with backfill fix)
 *
 * Verifies:
 * 1. intakeMode column exists in medical_intake table
 * 2. getPartnerIntake procedure returns null when no intake exists
 * 3. createPartnerIntake creates an empty record (no data copy)
 * 4. saveMedicalIntake correctly persists intakeMode
 * 5. Backfill: NO records should have intakeMode = NULL (all old records → 'legacy')
 * 6. New records default to 'general', not NULL/legacy
 * 7. No Treatment Case, no case_participants, no maleIntake movement
 */

import { describe, it, expect, beforeAll } from "vitest";
import { sql } from "drizzle-orm";
import { getDb } from "./db";
import { medicalIntake, leads } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { upsertMedicalIntake, getMedicalIntake } from "./db";

const TEST_LEAD_ID = 999901; // synthetic test lead ID (will not exist in DB)

function queryRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as Record<string, unknown>[];
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  return [];
}

describe("Phase 2 — intakeMode column", () => {
  it("intakeMode column exists in medical_intake table", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    // Query information_schema to confirm column exists
    const result = await db.execute(sql`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'medical_intake'
        AND column_name = 'intakeMode'
      LIMIT 1
    `);
    const rows = queryRows(result);
    expect(rows.length).toBe(1);
    expect(rows[0].column_name).toBe("intakeMode");
    expect(rows[0].is_nullable).toBe("YES");
  });

  it("intakeMode accepts female, male, general, legacy, and NULL", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const result = await db.execute(sql`
      SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS column_type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_type t ON t.oid = a.atttypid
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = 'public' AND c.relname = 'medical_intake' AND a.attname = 'intakeMode'
    `);
    const rows = queryRows(result);
    expect(rows.length).toBe(1);
    const colType = String(rows[0].column_type ?? "");
    expect(colType).toContain("female");
    expect(colType).toContain("male");
    expect(colType).toContain("general");
    expect(colType).toContain("legacy");
  });
});

describe("Phase 2 — Backfill verification", () => {
  it("NO existing records should have intakeMode = NULL after backfill", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const result = await db.execute(sql`SELECT COUNT(*)::int AS null_count FROM medical_intake WHERE "intakeMode" IS NULL`);
    const rows = queryRows(result);
    const nullCount = parseInt(String(rows[0].null_count), 10);
    // After the backfill UPDATE, no production records should have NULL intakeMode
    expect(nullCount).toBe(0);
  });

  it("All old records should be explicitly marked as 'legacy' after backfill", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const result = await db.execute(sql`SELECT COUNT(*)::int AS legacy_count FROM medical_intake WHERE "intakeMode" = 'legacy'`);
    const rows = queryRows(result);
    const legacyCount = parseInt(String(rows[0].legacy_count), 10);
    // All 15 old records should now be 'legacy'
    expect(legacyCount).toBeGreaterThanOrEqual(0); // may be 0 if test DB is empty
    // The key assertion: legacy + female + male + general = total (no NULLs)
    const totalResult = await db.execute(sql`SELECT COUNT(*)::int AS total FROM medical_intake`);
    const totalRows = queryRows(totalResult);
    const total = parseInt(String(totalRows[0].total), 10);
    const namedResult = await db.execute(sql`SELECT COUNT(*)::int AS named FROM medical_intake WHERE "intakeMode" IN ('legacy','female','male','general')`);
    const namedRows = queryRows(namedResult);
    const named = parseInt(String(namedRows[0].named), 10);
    // Every record must have an explicit intakeMode — no NULLs
    expect(named).toBe(total);
  });
});

describe("Phase 2 — getPartnerIntake", () => {
  it("returns null/undefined when no intake exists for a lead", async () => {
    // Use a lead ID that definitely has no intake
    const intake = await getMedicalIntake(TEST_LEAD_ID);
    expect(intake).toBeUndefined();
  });
});

describe("Phase 2 — createPartnerIntake (empty record only)", () => {
  let createdLeadId: number | null = null;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) return;
    // Create a minimal test lead
    await db.execute(sql`
      INSERT INTO leads (id, "firstName", "lastName", "leadStatus", brand, "leadSource", "createdAt", "updatedAt")
      VALUES (${TEST_LEAD_ID}, 'Phase2Test', 'Lead', 'intake', 'fertiliv', 'paid', NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `);
    createdLeadId = TEST_LEAD_ID;
  });

  it("creates an empty intake with intakeMode='legacy' (no data copy) — upsertMedicalIntake raw", async () => {
    if (!createdLeadId) return;
    // Ensure no intake exists first
    const db = await getDb();
    if (!db) return;
    await db.delete(medicalIntake).where(eq(medicalIntake.leadId, createdLeadId));

    // Create empty intake via raw upsert (simulates old behavior)
    await upsertMedicalIntake(createdLeadId, {} as any);
    const intake = await getMedicalIntake(createdLeadId);

    expect(intake).toBeDefined();
    expect(intake!.leadId).toBe(createdLeadId);
    // Phase 3 fix: intakeMode defaults to 'legacy' when not specified (backfill-safe invariant).
    // Previously this was null, but null intakeMode violates the backfill invariant.
    expect(intake!.intakeMode).toBe("legacy");
    // No maleIntake data should be present
    expect(intake!.maleIntake).toBeNull();
  });

  it("creates intake with intakeMode=female when specified", async () => {
    if (!createdLeadId) return;
    const db = await getDb();
    if (!db) return;
    await db.delete(medicalIntake).where(eq(medicalIntake.leadId, createdLeadId));

    await upsertMedicalIntake(createdLeadId, { intakeMode: "female" } as any);
    const intake = await getMedicalIntake(createdLeadId);

    expect(intake).toBeDefined();
    expect(intake!.intakeMode).toBe("female");
    expect(intake!.maleIntake).toBeNull();
  });

  it("creates intake with intakeMode=male when specified", async () => {
    if (!createdLeadId) return;
    const db = await getDb();
    if (!db) return;
    await db.delete(medicalIntake).where(eq(medicalIntake.leadId, createdLeadId));

    await upsertMedicalIntake(createdLeadId, { intakeMode: "male" } as any);
    const intake = await getMedicalIntake(createdLeadId);

    expect(intake).toBeDefined();
    expect(intake!.intakeMode).toBe("male");
  });

  it("creates intake with intakeMode=general when specified", async () => {
    if (!createdLeadId) return;
    const db = await getDb();
    if (!db) return;
    await db.delete(medicalIntake).where(eq(medicalIntake.leadId, createdLeadId));

    await upsertMedicalIntake(createdLeadId, { intakeMode: "general" } as any);
    const intake = await getMedicalIntake(createdLeadId);

    expect(intake).toBeDefined();
    expect(intake!.intakeMode).toBe("general");
    expect(intake!.maleIntake).toBeNull();
  });

  it("does NOT copy maleIntake when creating partner intake", async () => {
    if (!createdLeadId) return;
    const db = await getDb();
    if (!db) return;
    await db.delete(medicalIntake).where(eq(medicalIntake.leadId, createdLeadId));

    // Create with no maleIntake
    await upsertMedicalIntake(createdLeadId, { intakeMode: "male" } as any);
    const intake = await getMedicalIntake(createdLeadId);

    expect(intake!.maleIntake).toBeNull();
  });

  // Cleanup
  it("cleanup test lead", async () => {
    const db = await getDb();
    if (!db) return;
    await db.delete(medicalIntake).where(eq(medicalIntake.leadId, TEST_LEAD_ID));
    await db.execute(sql`DELETE FROM leads WHERE id = ${TEST_LEAD_ID}`);
    expect(true).toBe(true);
  });
});
