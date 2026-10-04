/**
 * Fix Request #2 — Regression Tests
 *
 * Tests for:
 * B1. convertCoupleToPatients idempotency guard
 * B2. deletePatient clears convertedPatientId + preserves medical_intake
 * B3. (Frontend-only — no server test needed)
 * Shared-intake: getMedicalIntakeByPatientId fallback via convertedPatientId
 * Shared-intake: upsertMedicalIntakeForPatient writes to shared row
 */

import { describe, it, expect, afterEach } from "vitest";
const TEST_TIMEOUT = 30_000;
import { getDb } from "./db";
import { leads, patients, medicalIntake } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import {
  convertCoupleToPatients,
  deletePatient,
  getMedicalIntakeByPatientId,
  upsertMedicalIntakeForPatient,
} from "./db";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTestLead(overrides: Record<string, unknown> = {}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const firstName = overrides.firstName as string ?? "FixReq2First";
  const lastName = overrides.lastName as string ?? "FixReq2Last";
  await db.insert(leads).values({
    firstName,
    lastName,
    leadStatus: "intake",
    leadOrigin: "staff-created",
    emailVerified: false,
    createdBy: 1,
    ...overrides,
  } as any);
  const all = await db.select({ id: leads.id }).from(leads)
    .where(and(eq(leads.firstName, firstName), eq(leads.lastName, lastName)));
  return all[all.length - 1].id;
}

async function createTestIntake(leadId: number, intakeMode: "female" | "male" | "general" = "general") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(medicalIntake).values({ leadId, intakeMode } as any);
  const rows = await db.select({ id: medicalIntake.id }).from(medicalIntake)
    .where(eq(medicalIntake.leadId, leadId)).limit(1);
  return rows[0].id;
}

async function hardCleanupLead(leadId: number) {
  const db = await getDb();
  if (!db) return;
  const lead = await db.select({ convertedPatientId: leads.convertedPatientId }).from(leads).where(eq(leads.id, leadId)).limit(1);
  const patientId = (lead[0] as any)?.convertedPatientId;
  await db.delete(medicalIntake).where(eq(medicalIntake.leadId, leadId));
  if (patientId) {
    await db.delete(medicalIntake).where(eq(medicalIntake.patientId, patientId));
    await db.delete(patients).where(eq(patients.id, patientId));
  }
  await db.delete(leads).where(eq(leads.id, leadId));
}

async function hardCleanupPatient(patientId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(medicalIntake).where(eq(medicalIntake.patientId, patientId));
  await db.delete(patients).where(eq(patients.id, patientId));
}

// ─── B1: Idempotency Guard ────────────────────────────────────────────────────

describe("Fix B1 — convertCoupleToPatients idempotency guard", () => {
  let lead1Id: number;
  let lead2Id: number;
  let lead3Id: number;

  afterEach(async () => {
    if (lead1Id) await hardCleanupLead(lead1Id);
    if (lead2Id) await hardCleanupLead(lead2Id);
    if (lead3Id) await hardCleanupLead(lead3Id);
  });

  it("Test 6: Cannot convert couple if lead1 is already converted", async () => {
    lead1Id = await createTestLead({ firstName: "AlreadyConverted", lastName: "B1Test", gender: "female" });
    lead2Id = await createTestLead({ firstName: "NotYetConverted", lastName: "B1Test", gender: "male" });
    lead3Id = await createTestLead({ firstName: "FreshPartner", lastName: "B1Test", gender: "male" });

    await createTestIntake(lead1Id, "female");
    await createTestIntake(lead2Id, "male");
    await createTestIntake(lead3Id, "male");

    // First conversion — should succeed
    await convertCoupleToPatients(lead1Id, lead2Id, 1);

    // Second conversion using already-converted lead1 — must throw
    await expect(
      convertCoupleToPatients(lead1Id, lead3Id, 1)
    ).rejects.toThrow(/already been converted/i);
  }, TEST_TIMEOUT);

  it("Test 6b: Cannot convert couple if lead2 is already converted", async () => {
    // Note: This test is sensitive to MRN counter parallelism when run alongside other suites.
    // The idempotency guard check (convertedPatientId) is done BEFORE consumeNextMRN(), so the
    // guard itself is correct. The test verifies the guard logic, not the MRN counter.
    lead1Id = await createTestLead({ firstName: "FreshLead6b", lastName: "B1Test2", gender: "female" });
    lead2Id = await createTestLead({ firstName: "ConvertedMale6b", lastName: "B1Test2", gender: "male" });
    lead3Id = await createTestLead({ firstName: "AnotherFemale6b", lastName: "B1Test2", gender: "female" });

    await createTestIntake(lead1Id, "female");
    await createTestIntake(lead2Id, "male");
    await createTestIntake(lead3Id, "female");

    // First conversion — should succeed
    await convertCoupleToPatients(lead1Id, lead2Id, 1);

    // Second conversion using already-converted lead2 — must throw BEFORE any patient insert
    // (idempotency guard reads convertedPatientId before calling consumeNextMRN)
    await expect(
      convertCoupleToPatients(lead3Id, lead2Id, 1)
    ).rejects.toThrow(/already been converted/i);
  }, TEST_TIMEOUT);
});

// ─── B2: deletePatient cleanup ────────────────────────────────────────────────

describe("Fix B2 — deletePatient cleanup", () => {
  let leadId: number;
  let patientId: number;

  afterEach(async () => {
    // Patient may already be deleted by the test
    try { if (patientId) await hardCleanupPatient(patientId); } catch {}
    if (leadId) await hardCleanupLead(leadId);
  });

  it("Test 7: Deleting a patient clears convertedPatientId on the original lead", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    leadId = await createTestLead({ firstName: "ToBeDeleted", lastName: "B2Test", gender: "female" });
    await createTestIntake(leadId, "female");

    // Manually stamp convertedPatientId (simulate a prior conversion)
    // We insert a patient directly to avoid full conversion side-effects
    await db.insert(patients).values({
      mrn: `TEST-B2-${Date.now()}`,
      firstName: "ToBeDeleted",
      lastName: "B2Test",
      status: "active_patient",
      createdBy: 1,
    } as any);
    const pRows = await db.select({ id: patients.id }).from(patients)
      .where(and(eq(patients.firstName, "ToBeDeleted"), eq(patients.lastName, "B2Test")))
      .orderBy(patients.id);
    patientId = pRows[pRows.length - 1].id;

    // Stamp convertedPatientId on lead
    await db.update(leads).set({ convertedPatientId: patientId } as any).where(eq(leads.id, leadId));

    // Delete the patient
    await deletePatient(patientId);

    // convertedPatientId must be cleared on the lead
    const updatedLead = await db.select({ convertedPatientId: leads.convertedPatientId }).from(leads).where(eq(leads.id, leadId)).limit(1);
    expect((updatedLead[0] as any).convertedPatientId).toBeNull();

    patientId = 0; // already deleted
  }, TEST_TIMEOUT);

  it("Test 8: Deleting a patient does NOT delete the medical_intake row", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    leadId = await createTestLead({ firstName: "IntakePreserve", lastName: "B2Test", gender: "female" });
    const intakeId = await createTestIntake(leadId, "female");

    // Insert a patient and stamp patientId on the intake
    await db.insert(patients).values({
      mrn: `TEST-B2B-${Date.now()}`,
      firstName: "IntakePreserve",
      lastName: "B2Test",
      status: "active_patient",
      createdBy: 1,
    } as any);
    const pRows = await db.select({ id: patients.id }).from(patients)
      .where(and(eq(patients.firstName, "IntakePreserve"), eq(patients.lastName, "B2Test")))
      .orderBy(patients.id);
    patientId = pRows[pRows.length - 1].id;

    await db.update(medicalIntake).set({ patientId } as any).where(eq(medicalIntake.id, intakeId));
    await db.update(leads).set({ convertedPatientId: patientId } as any).where(eq(leads.id, leadId));

    // Delete the patient
    await deletePatient(patientId);

    // medical_intake row must still exist
    const intakeRow = await db.select().from(medicalIntake).where(eq(medicalIntake.id, intakeId)).limit(1);
    expect(intakeRow[0]).toBeDefined();
    expect(intakeRow[0].intakeMode).toBe("female");

    patientId = 0;
  }, TEST_TIMEOUT);

  it("Test 9: No orphaned medical_intake.patientId after patient deletion", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    leadId = await createTestLead({ firstName: "NoOrphan", lastName: "B2Test", gender: "female" });
    const intakeId = await createTestIntake(leadId, "female");

    await db.insert(patients).values({
      mrn: `TEST-B2C-${Date.now()}`,
      firstName: "NoOrphan",
      lastName: "B2Test",
      status: "active_patient",
      createdBy: 1,
    } as any);
    const pRows = await db.select({ id: patients.id }).from(patients)
      .where(and(eq(patients.firstName, "NoOrphan"), eq(patients.lastName, "B2Test")))
      .orderBy(patients.id);
    patientId = pRows[pRows.length - 1].id;

    await db.update(medicalIntake).set({ patientId } as any).where(eq(medicalIntake.id, intakeId));
    await db.update(leads).set({ convertedPatientId: patientId } as any).where(eq(leads.id, leadId));

    await deletePatient(patientId);

    // intake.patientId must be null (not pointing to deleted patient)
    const intakeRow = await db.select().from(medicalIntake).where(eq(medicalIntake.id, intakeId)).limit(1);
    expect(intakeRow[0]).toBeDefined();
    expect(intakeRow[0].patientId).toBeNull();

    patientId = 0;
  }, TEST_TIMEOUT);
});

// ─── Shared-intake: read/write via convertedPatientId fallback ────────────────

describe("Shared-intake principle — getMedicalIntakeByPatientId fallback", () => {
  let leadId: number;
  let patientId: number;

  afterEach(async () => {
    try { if (patientId) await hardCleanupPatient(patientId); } catch {}
    if (leadId) await hardCleanupLead(leadId);
  });

  it("Test 10: Patient view reads the same intake row as Lead view (shared-intake)", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    leadId = await createTestLead({ firstName: "SharedIntake", lastName: "Test", gender: "female" });
    const intakeId = await createTestIntake(leadId, "female");

    // Insert a patient and link via convertedPatientId (but do NOT stamp patientId on intake)
    await db.insert(patients).values({
      mrn: `TEST-SHARED-${Date.now()}`,
      firstName: "SharedIntake",
      lastName: "Test",
      status: "active_patient",
      createdBy: 1,
    } as any);
    const pRows = await db.select({ id: patients.id }).from(patients)
      .where(and(eq(patients.firstName, "SharedIntake"), eq(patients.lastName, "Test")))
      .orderBy(patients.id);
    patientId = pRows[pRows.length - 1].id;

    // Only set convertedPatientId on lead — do NOT stamp patientId on intake
    await db.update(leads).set({ convertedPatientId: patientId } as any).where(eq(leads.id, leadId));

    // Patient view should find the intake via the fallback
    const intakeFromPatient = await getMedicalIntakeByPatientId(patientId);
    expect(intakeFromPatient).toBeDefined();
    expect((intakeFromPatient as any).id).toBe(intakeId);
    expect((intakeFromPatient as any).intakeMode).toBe("female");
  }, TEST_TIMEOUT);

  it("upsertMedicalIntakeForPatient stamps patientId on shared row and does not create duplicate", async () => {
    const db = await getDb();
    if (!db) throw new Error("DB not available");

    leadId = await createTestLead({ firstName: "UpsertShared", lastName: "Test", gender: "female" });
    const intakeId = await createTestIntake(leadId, "female");

    await db.insert(patients).values({
      mrn: `TEST-UPSERT-${Date.now()}`,
      firstName: "UpsertShared",
      lastName: "Test",
      status: "active_patient",
      createdBy: 1,
    } as any);
    const pRows = await db.select({ id: patients.id }).from(patients)
      .where(and(eq(patients.firstName, "UpsertShared"), eq(patients.lastName, "Test")))
      .orderBy(patients.id);
    patientId = pRows[pRows.length - 1].id;

    await db.update(leads).set({ convertedPatientId: patientId } as any).where(eq(leads.id, leadId));

    // Upsert from patient context — should update the SAME row, not create a new one
    await upsertMedicalIntakeForPatient(patientId, { profession: "Engineer" } as any);

    // Only one intake row should exist for this lead
    const allIntakes = await db.select().from(medicalIntake).where(eq(medicalIntake.leadId, leadId));
    expect(allIntakes.length).toBe(1);
    expect(allIntakes[0].id).toBe(intakeId);
    expect((allIntakes[0] as any).profession).toBe("Engineer");
    // patientId should now be stamped on the shared row
    expect(allIntakes[0].patientId).toBe(patientId);
  }, TEST_TIMEOUT);
});
