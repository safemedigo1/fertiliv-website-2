/**
 * Link to Existing Patient — Test Suite
 *
 * Tests for:
 * T1. Happy path: lead with no intake linked to patient with no intake
 * T2. Happy path: lead with no intake linked to patient with real intake
 * T3. Happy path: lead with real intake linked to patient with no intake
 * T4. Conflict: both have real intakes — returns intake_conflict
 * T5. Conflict resolution: usePatientIntake
 * T6. Conflict resolution: useLeadIntake
 * T7. Guard: lead already converted — rejected
 * T8. Guard: patient already linked to another lead — warning in result
 * T9. Guard: convertedPatientId UNIQUE constraint — second link attempt fails
 */
import { describe, it, expect, afterEach } from "vitest";
const TEST_TIMEOUT = 30_000;
import { getDb } from "./db";
import { leads, patients, medicalIntake } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { linkLeadToExistingPatient } from "./db";

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function createTestLead(overrides: Record<string, unknown> = {}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.insert(leads).values({
    firstName: "LinkTest",
    lastName: "Lead",
    gender: "female",
    leadStatus: "intake",
    brand: "fertiliv",
    ...overrides,
  } as any);
  return (row as any).insertId as number;
}

async function createTestPatient(overrides: Record<string, unknown> = {}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.insert(patients).values({
    firstName: "LinkTest",
    lastName: "Patient",
    gender: "female",
    status: "inactive",
    mrn: `LTP-${Date.now()}-${Math.floor(Math.random() * 9999)}`,
    ...overrides,
  } as any);
  return (row as any).insertId as number;
}

async function createTestIntake(overrides: Record<string, unknown> = {}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.insert(medicalIntake).values({
    intakeMode: "general",
    ...overrides,
  } as any);
  return (row as any).insertId as number;
}

async function getLeadRow(leadId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  return row;
}

async function getIntakeRow(intakeId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.select().from(medicalIntake).where(eq(medicalIntake.id, intakeId)).limit(1);
  return row;
}

async function getPatientRow(patientId: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const [row] = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);
  return row;
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────
const createdLeadIds: number[] = [];
const createdPatientIds: number[] = [];
const createdIntakeIds: number[] = [];

afterEach(async () => {
  const db = await getDb();
  if (!db) return;
  for (const id of createdIntakeIds) {
    await db.delete(medicalIntake).where(eq(medicalIntake.id, id)).catch(() => {});
  }
  for (const id of createdPatientIds) {
    await db.delete(patients).where(eq(patients.id, id)).catch(() => {});
  }
  for (const id of createdLeadIds) {
    await db.delete(leads).where(eq(leads.id, id)).catch(() => {});
  }
  createdLeadIds.length = 0;
  createdPatientIds.length = 0;
  createdIntakeIds.length = 0;
});

// ─── Tests ───────────────────────────────────────────────────────────────────
describe("linkLeadToExistingPatient", () => {

  it("T1: Lead with no intake + Patient with no intake → linked successfully", async () => {
    const leadId = await createTestLead();
    const patientId = await createTestPatient();
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);

    const result = await linkLeadToExistingPatient({ leadId, patientId });

    expect(result.status).toBe("linked");
    const leadRow = await getLeadRow(leadId);
    expect(leadRow.convertedPatientId).toBe(patientId);
    const patientRow = await getPatientRow(patientId);
    expect(patientRow.socialLeadId).toBe(String(leadId));
  }, TEST_TIMEOUT);

  it("T2: Lead with no intake + Patient with real intake → linked, intake gains leadId", async () => {
    const leadId = await createTestLead();
    const patientId = await createTestPatient();
    const intakeId = await createTestIntake({ patientId, intakeMode: "female", infertilityType: "primary" });
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);
    createdIntakeIds.push(intakeId);

    const result = await linkLeadToExistingPatient({ leadId, patientId });

    expect(result.status).toBe("linked");
    const intakeRow = await getIntakeRow(intakeId);
    expect(intakeRow.leadId).toBe(leadId);
    expect(intakeRow.patientId).toBe(patientId);
  }, TEST_TIMEOUT);

  it("T3: Lead with real intake + Patient with no intake → linked, lead intake gains patientId", async () => {
    const leadId = await createTestLead();
    const patientId = await createTestPatient();
    const intakeId = await createTestIntake({ leadId, intakeMode: "female", infertilityType: "secondary" });
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);
    createdIntakeIds.push(intakeId);

    const result = await linkLeadToExistingPatient({ leadId, patientId });

    expect(result.status).toBe("linked");
    const intakeRow = await getIntakeRow(intakeId);
    expect(intakeRow.leadId).toBe(leadId);
    expect(intakeRow.patientId).toBe(patientId);
  }, TEST_TIMEOUT);

  it("T4: Both have real intakes → returns intake_conflict without making changes", async () => {
    const leadId = await createTestLead();
    const patientId = await createTestPatient();
    const leadIntakeId = await createTestIntake({ leadId, intakeMode: "female", infertilityType: "primary" });
    const patientIntakeId = await createTestIntake({ patientId, intakeMode: "female", infertilityType: "secondary" });
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);
    createdIntakeIds.push(leadIntakeId, patientIntakeId);

    const result = await linkLeadToExistingPatient({ leadId, patientId });

    expect(result.status).toBe("intake_conflict");
    // No changes made
    const leadRow = await getLeadRow(leadId);
    expect(leadRow.convertedPatientId).toBeNull();
  }, TEST_TIMEOUT);

  it("T5: Conflict resolution usePatientIntake → patient intake becomes shared, lead intake detached", async () => {
    const leadId = await createTestLead();
    const patientId = await createTestPatient();
    const leadIntakeId = await createTestIntake({ leadId, intakeMode: "female", infertilityType: "primary" });
    const patientIntakeId = await createTestIntake({ patientId, intakeMode: "female", infertilityType: "secondary" });
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);
    createdIntakeIds.push(leadIntakeId, patientIntakeId);

    const result = await linkLeadToExistingPatient({ leadId, patientId, resolveIntakeConflict: "usePatientIntake" });

    expect(result.status).toBe("linked");
    const patientIntake = await getIntakeRow(patientIntakeId);
    expect(patientIntake.leadId).toBe(leadId);
    expect(patientIntake.patientId).toBe(patientId);
    const leadIntake = await getIntakeRow(leadIntakeId);
    expect(leadIntake.leadId).toBeNull();
    expect(leadIntake.patientId).toBeNull();
  }, TEST_TIMEOUT);

  it("T6: Conflict resolution useLeadIntake → lead intake becomes shared, patient intake detached", async () => {
    const leadId = await createTestLead();
    const patientId = await createTestPatient();
    const leadIntakeId = await createTestIntake({ leadId, intakeMode: "female", infertilityType: "primary" });
    const patientIntakeId = await createTestIntake({ patientId, intakeMode: "female", infertilityType: "secondary" });
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);
    createdIntakeIds.push(leadIntakeId, patientIntakeId);

    const result = await linkLeadToExistingPatient({ leadId, patientId, resolveIntakeConflict: "useLeadIntake" });

    expect(result.status).toBe("linked");
    const leadIntake = await getIntakeRow(leadIntakeId);
    expect(leadIntake.leadId).toBe(leadId);
    expect(leadIntake.patientId).toBe(patientId);
    const patientIntake = await getIntakeRow(patientIntakeId);
    expect(patientIntake.leadId).toBeNull();
    expect(patientIntake.patientId).toBeNull();
  }, TEST_TIMEOUT);

  it("T7: Guard — lead already linked to a different patient → rejected", async () => {
    const existingPatientId = await createTestPatient({ firstName: "Existing" });
    const leadId = await createTestLead({ convertedPatientId: existingPatientId });
    const newPatientId = await createTestPatient({ firstName: "New" });
    createdLeadIds.push(leadId);
    createdPatientIds.push(existingPatientId, newPatientId);

    await expect(
      linkLeadToExistingPatient({ leadId, patientId: newPatientId })
    ).rejects.toThrow(/already linked to Patient/i);
  }, TEST_TIMEOUT);

  it("T8: Patient already linked to another lead → rejected with CONFLICT error", async () => {
    const otherLeadId = await createTestLead({ firstName: "OtherLead" });
    const leadId = await createTestLead();
    const patientId = await createTestPatient({ socialLeadId: String(otherLeadId) });
    createdLeadIds.push(leadId, otherLeadId);
    createdPatientIds.push(patientId);

    await expect(
      linkLeadToExistingPatient({ leadId, patientId })
    ).rejects.toThrow(/already linked to Lead/i);
  }, TEST_TIMEOUT);

  it("T9: UNIQUE constraint — second lead cannot link to same patient", async () => {
    const lead1Id = await createTestLead({ firstName: "Lead1" });
    const lead2Id = await createTestLead({ firstName: "Lead2" });
    const patientId = await createTestPatient();
    createdLeadIds.push(lead1Id, lead2Id);
    createdPatientIds.push(patientId);

    // First link succeeds
    const result1 = await linkLeadToExistingPatient({ leadId: lead1Id, patientId });
    expect(result1.status).toBe("linked");

    // Second link to same patient should fail
    // (Validation 3 fires first: patient.socialLeadId was set to lead1Id by the first link)
    await expect(
      linkLeadToExistingPatient({ leadId: lead2Id, patientId })
    ).rejects.toThrow(/already linked to Lead/i);
  }, TEST_TIMEOUT);

  // ─── V5 + V6 validation tests ────────────────────────────────────────────────

  it("T10: Lead gender missing + Patient gender known → allowed", async () => {
    const leadId = await createTestLead({ gender: null });
    const patientId = await createTestPatient({ gender: "female" });
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);

    const result = await linkLeadToExistingPatient({ leadId, patientId });
    expect(result.status).toBe("linked");
  }, TEST_TIMEOUT);

  it("T11: Lead gender known + Patient gender missing → allowed (no stamp by default)", async () => {
    const leadId = await createTestLead({ gender: "female" });
    const patientId = await createTestPatient({ gender: null });
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);

    const result = await linkLeadToExistingPatient({ leadId, patientId });
    expect(result.status).toBe("linked");
    // Patient gender should remain null (no stamp requested)
    const patientRow = await getPatientRow(patientId);
    expect(patientRow.gender).toBeNull();
  }, TEST_TIMEOUT);

  it("T11b: Lead gender known + Patient gender missing + stampPatientGender=true → patient gender set", async () => {
    const leadId = await createTestLead({ gender: "female" });
    const patientId = await createTestPatient({ gender: null });
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);

    const result = await linkLeadToExistingPatient({ leadId, patientId, stampPatientGender: true });
    expect(result.status).toBe("linked");
    // Patient gender should now be "female"
    const patientRow = await getPatientRow(patientId);
    expect(patientRow.gender).toBe("female");
  }, TEST_TIMEOUT);

  it("T12: Same gender → allowed", async () => {
    const leadId = await createTestLead({ gender: "female" });
    const patientId = await createTestPatient({ gender: "female" });
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);

    const result = await linkLeadToExistingPatient({ leadId, patientId });
    expect(result.status).toBe("linked");
  }, TEST_TIMEOUT);

  it("T13: Gender mismatch → hard block", async () => {
    const leadId = await createTestLead({ gender: "male" });
    const patientId = await createTestPatient({ gender: "female" });
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);

    await expect(
      linkLeadToExistingPatient({ leadId, patientId })
    ).rejects.toThrow(/Gender mismatch/i);
  }, TEST_TIMEOUT);

  it("T14: DOB match → allowed", async () => {
    const dob = new Date("1990-05-15");
    const leadId = await createTestLead({ dateOfBirth: dob });
    const patientId = await createTestPatient({ dateOfBirth: dob });
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);

    const result = await linkLeadToExistingPatient({ leadId, patientId });
    expect(result.status).toBe("linked");
  }, TEST_TIMEOUT);

  it("T15: DOB mismatch > 1 year → hard block", async () => {
    const leadId = await createTestLead({ dateOfBirth: new Date("1985-01-01") });
    const patientId = await createTestPatient({ dateOfBirth: new Date("1990-01-01") });
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);

    await expect(
      linkLeadToExistingPatient({ leadId, patientId })
    ).rejects.toThrow(/Date of birth mismatch/i);
  }, TEST_TIMEOUT);

  it("T16: DOB minor mismatch (≤ 1 year) without confirmation → returns dob_warning", async () => {
    const leadId = await createTestLead({ dateOfBirth: new Date("1990-01-01") });
    const patientId = await createTestPatient({ dateOfBirth: new Date("1990-06-15") });
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);

    const result = await linkLeadToExistingPatient({ leadId, patientId });
    expect(result.status).toBe("dob_warning");
    expect((result as any).message).toMatch(/differ slightly/i);
    // Lead should NOT be linked yet
    const leadRow = await getLeadRow(leadId);
    expect(leadRow.convertedPatientId).toBeNull();
  }, TEST_TIMEOUT);

  it("T17: DOB minor mismatch + confirmDobWarning=true → allowed", async () => {
    const leadId = await createTestLead({ dateOfBirth: new Date("1990-01-01") });
    const patientId = await createTestPatient({ dateOfBirth: new Date("1990-06-15") });
    createdLeadIds.push(leadId);
    createdPatientIds.push(patientId);

    const result = await linkLeadToExistingPatient({ leadId, patientId, confirmDobWarning: true });
    expect(result.status).toBe("linked");
    const leadRow = await getLeadRow(leadId);
    expect(leadRow.convertedPatientId).toBe(patientId);
  }, TEST_TIMEOUT);

});
