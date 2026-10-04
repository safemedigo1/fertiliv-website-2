/**
 * Phase 2 Regression Tests — Convert Couple to Patients
 *
 * Tests the fix for the bug where convertCoupleToPatients was assigning
 * the female intake to the male patient and leaving the male intake unlinked.
 *
 * Scenarios:
 * 1. Convert single female Lead with Female Health Record
 * 2. Convert single male Lead with Male Health Record
 * 3. Convert linked couple — female intake stays with female patient, male with male
 * 4. Partner link remains correct after couple conversion
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
// Increase timeout for DB-heavy integration tests
const TEST_TIMEOUT = 30_000;
import { getDb } from "./db";
import { leads, patients, medicalIntake } from "../drizzle/schema";
import { eq, and, isNull } from "drizzle-orm";
import { convertLeadToPatient, convertCoupleToPatients } from "./db";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTestLead(overrides: Record<string, unknown> = {}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const firstName = overrides.firstName as string ?? "TestFirst";
  const lastName = overrides.lastName as string ?? "TestLast";
  const ts = Date.now();
  await db.insert(leads).values({
    firstName,
    lastName,
    leadStatus: "intake",
    leadOrigin: "staff-created",
    emailVerified: false,
    createdBy: 1,
    ...overrides,
  } as any);
  const rows = await db.select({ id: leads.id }).from(leads)
    .where(and(eq(leads.firstName, firstName), eq(leads.lastName, lastName)))
    .orderBy(leads.id)
    .limit(1);
  // Return the most recently inserted one
  const all = await db.select({ id: leads.id }).from(leads)
    .where(and(eq(leads.firstName, firstName), eq(leads.lastName, lastName)));
  return all[all.length - 1].id;
}

async function createTestIntake(leadId: number, intakeMode: "female" | "male" | "general") {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(medicalIntake).values({ leadId, intakeMode } as any);
  const rows = await db.select({ id: medicalIntake.id }).from(medicalIntake)
    .where(eq(medicalIntake.leadId, leadId)).limit(1);
  return rows[0].id;
}

async function cleanupLead(leadId: number) {
  const db = await getDb();
  if (!db) return;
  // Get converted patient if any
  const lead = await db.select({ convertedPatientId: leads.convertedPatientId }).from(leads).where(eq(leads.id, leadId)).limit(1);
  const patientId = lead[0]?.convertedPatientId;
  // Delete intake
  await db.delete(medicalIntake).where(eq(medicalIntake.leadId, leadId));
  if (patientId) {
    await db.delete(medicalIntake).where(eq(medicalIntake.patientId, patientId));
    await db.delete(patients).where(eq(patients.id, patientId));
  }
  await db.delete(leads).where(eq(leads.id, leadId));
}

function toDateOnly(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Phase 2 Regression — convertLeadToPatient (single)", () => {
  let leadId: number;

  afterEach(async () => {
    if (leadId) await cleanupLead(leadId);
  });

  it("Scenario 1: Female lead with Female Health Record — intake stays with female patient", async () => {
    leadId = await createTestLead({ firstName: "TestFemale", lastName: "Regression", gender: "female" });
    const intakeId = await createTestIntake(leadId, "female");

    const { patientId } = await convertLeadToPatient(leadId, 1);

    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const intake = await db.select().from(medicalIntake).where(eq(medicalIntake.id, intakeId)).limit(1);
    expect(intake[0]).toBeDefined();
    expect(intake[0].patientId).toBe(patientId);         // ← must be female patient
    expect(intake[0].intakeMode).toBe("female");          // ← intakeMode unchanged
    expect(intake[0].leadId).toBe(leadId);               // ← Rule 8: leadId preserved (shared-intake principle)
  });

  it("Scenario 2: Male lead with Male Health Record — intake stays with male patient", async () => {
    leadId = await createTestLead({ firstName: "TestMale", lastName: "Regression", gender: "male" });
    const intakeId = await createTestIntake(leadId, "male");

    const { patientId } = await convertLeadToPatient(leadId, 1);

    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const intake = await db.select().from(medicalIntake).where(eq(medicalIntake.id, intakeId)).limit(1);
    expect(intake[0]).toBeDefined();
    expect(intake[0].patientId).toBe(patientId);          // ← must be male patient
    expect(intake[0].intakeMode).toBe("male");             // ← intakeMode unchanged
    expect(intake[0].leadId).toBe(leadId);                // ← Rule 8: leadId preserved (shared-intake principle)
  });

  it("Scenario 2B: preserves saved birth date and country of residence on the created patient", async () => {
    leadId = await createTestLead({
      firstName: "Demographic",
      lastName: "Preservation",
      gender: "female",
      dateOfBirth: new Date("1988-05-12T00:00:00.000Z"),
      country: "United Arab Emirates",
      nationality: "Irish",
    });

    const { patientId } = await convertLeadToPatient(leadId, 1);
    const db = await getDb();
    if (!db) throw new Error("DB not available");
    const patient = await db.select().from(patients).where(eq(patients.id, patientId)).limit(1);

    expect(patient[0]).toBeDefined();
    expect(toDateOnly(patient[0].dateOfBirth)).toBe("1988-05-12");
    expect(patient[0].countryOfResidency).toBe("United Arab Emirates");
    expect(patient[0].country).toBe("United Arab Emirates");
    expect(patient[0].nationality).toBe("Irish");
  });
});

describe("Phase 2 Regression — convertCoupleToPatients (couple)", () => {
  let femaleLeadId: number;
  let maleLeadId: number;

  afterEach(async () => {
    if (femaleLeadId) await cleanupLead(femaleLeadId);
    if (maleLeadId) await cleanupLead(maleLeadId);
  });

  it("Scenario 3: Linked couple — female intake stays with female patient, male intake stays with male patient", async () => {
    femaleLeadId = await createTestLead({ firstName: "CoupleWife", lastName: "Regression", gender: "female", dateOfBirth: new Date("1989-02-10T00:00:00.000Z"), country: "United Arab Emirates" });
    maleLeadId = await createTestLead({ firstName: "CoupleHusband", lastName: "Regression", gender: "male", dateOfBirth: new Date("1987-06-20T00:00:00.000Z"), country: "Ireland" });

    const femaleIntakeId = await createTestIntake(femaleLeadId, "female");
    const maleIntakeId = await createTestIntake(maleLeadId, "male");

    const { patient1Id, patient2Id } = await convertCoupleToPatients(femaleLeadId, maleLeadId, 1);

    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const femaleIntake = await db.select().from(medicalIntake).where(eq(medicalIntake.id, femaleIntakeId)).limit(1);
    const maleIntake = await db.select().from(medicalIntake).where(eq(medicalIntake.id, maleIntakeId)).limit(1);

    // Female intake must be assigned to female patient (patient1Id)
    expect(femaleIntake[0].patientId).toBe(patient1Id);
    expect(femaleIntake[0].intakeMode).toBe("female");     // ← intakeMode unchanged

    // Male intake must be assigned to male patient (patient2Id)
    expect(maleIntake[0].patientId).toBe(patient2Id);
    expect(maleIntake[0].intakeMode).toBe("male");         // ← intakeMode unchanged

    // The two intakes must NOT be swapped
    expect(femaleIntake[0].patientId).not.toBe(patient2Id);
    expect(maleIntake[0].patientId).not.toBe(patient1Id);

    const [femalePatient, malePatient] = await Promise.all([
      db.select().from(patients).where(eq(patients.id, patient1Id)).limit(1),
      db.select().from(patients).where(eq(patients.id, patient2Id)).limit(1),
    ]);
    expect(toDateOnly(femalePatient[0].dateOfBirth)).toBe("1989-02-10");
    expect(femalePatient[0].countryOfResidency).toBe("United Arab Emirates");
    expect(toDateOnly(malePatient[0].dateOfBirth)).toBe("1987-06-20");
    expect(malePatient[0].countryOfResidency).toBe("Ireland");
  });

  it("Scenario 4: Partner link remains correct after couple conversion", async () => {
    femaleLeadId = await createTestLead({ firstName: "PartnerWife", lastName: "Regression", gender: "female" });
    maleLeadId = await createTestLead({ firstName: "PartnerHusband", lastName: "Regression", gender: "male" });

    await createTestIntake(femaleLeadId, "female");
    await createTestIntake(maleLeadId, "male");

    const { patient1Id, patient2Id } = await convertCoupleToPatients(femaleLeadId, maleLeadId, 1);

    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const p1 = await db.select({ partnerId: patients.partnerId }).from(patients).where(eq(patients.id, patient1Id)).limit(1);
    const p2 = await db.select({ partnerId: patients.partnerId }).from(patients).where(eq(patients.id, patient2Id)).limit(1);

    // Each patient must point to the other as partner
    expect(p1[0].partnerId).toBe(patient2Id);
    expect(p2[0].partnerId).toBe(patient1Id);
  });

  it("Scenario 5: No maleIntake data was moved during couple conversion", async () => {
    femaleLeadId = await createTestLead({ firstName: "NoMoveFemale", lastName: "Regression", gender: "female" });
    maleLeadId = await createTestLead({ firstName: "NoMoveMale", lastName: "Regression", gender: "male" });

    const femaleIntakeId = await createTestIntake(femaleLeadId, "female");
    const maleIntakeId = await createTestIntake(maleLeadId, "male");

    await convertCoupleToPatients(femaleLeadId, maleLeadId, 1);

    const db = await getDb();
    if (!db) throw new Error("DB not available");

    const femaleIntake = await db.select().from(medicalIntake).where(eq(medicalIntake.id, femaleIntakeId)).limit(1);
    const maleIntake = await db.select().from(medicalIntake).where(eq(medicalIntake.id, maleIntakeId)).limit(1);

    // maleIntake JSON field must NOT have been moved or copied
    expect(femaleIntake[0].maleIntake).toBeNull();
    expect(maleIntake[0].maleIntake).toBeNull();

    // maleIntakeMigrated must remain false
    expect(femaleIntake[0].maleIntakeMigrated).toBeFalsy();
    expect(maleIntake[0].maleIntakeMigrated).toBeFalsy();
  });

  it("Scenario 6: Both link sides are written atomically after couple conversion", async () => {
    femaleLeadId = await createTestLead({ firstName: "BothSidesFemale", lastName: "LinkTest", gender: "female" });
    maleLeadId = await createTestLead({ firstName: "BothSidesMale", lastName: "LinkTest", gender: "male" });

    await createTestIntake(femaleLeadId, "female");
    await createTestIntake(maleLeadId, "male");

    const { patient1Id, patient2Id } = await convertCoupleToPatients(femaleLeadId, maleLeadId, 1);

    const db = await getDb();
    if (!db) throw new Error("DB not available");

    // Forward links: Lead.convertedPatientId must point to the correct Patient
    const l1 = await db.select({ convertedPatientId: (leads as any).convertedPatientId }).from(leads).where(eq(leads.id, femaleLeadId)).limit(1);
    const l2 = await db.select({ convertedPatientId: (leads as any).convertedPatientId }).from(leads).where(eq(leads.id, maleLeadId)).limit(1);
    expect(l1[0].convertedPatientId).toBe(patient1Id);
    expect(l2[0].convertedPatientId).toBe(patient2Id);

    // Backward links: Patient.socialLeadId must point back to the originating Lead
    const p1 = await db.select({ socialLeadId: patients.socialLeadId }).from(patients).where(eq(patients.id, patient1Id)).limit(1);
    const p2 = await db.select({ socialLeadId: patients.socialLeadId }).from(patients).where(eq(patients.id, patient2Id)).limit(1);
    expect(String(p1[0].socialLeadId)).toBe(String(femaleLeadId));
    expect(String(p2[0].socialLeadId)).toBe(String(maleLeadId));
  });
});

describe("Phase 2 Regression — convertLeadToPatient (single) — link consistency", () => {
  let leadId: number;

  afterEach(async () => {
    if (leadId) await cleanupLead(leadId);
  });

  it("Scenario 7: Both link sides are written atomically after single conversion", async () => {
    leadId = await createTestLead({ firstName: "BothSidesSingle", lastName: "LinkTest", gender: "female" });
    await createTestIntake(leadId, "female");

    const { patientId } = await convertLeadToPatient(leadId, 1);

    const db = await getDb();
    if (!db) throw new Error("DB not available");

    // Forward link: Lead.convertedPatientId must point to the Patient
    const l = await db.select({ convertedPatientId: (leads as any).convertedPatientId }).from(leads).where(eq(leads.id, leadId)).limit(1);
    expect(l[0].convertedPatientId).toBe(patientId);

    // Backward link: Patient.socialLeadId must point back to the Lead
    const p = await db.select({ socialLeadId: patients.socialLeadId }).from(patients).where(eq(patients.id, patientId)).limit(1);
    expect(String(p[0].socialLeadId)).toBe(String(leadId));
  });
});
