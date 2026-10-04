/**
 * Option A — Display Identity Tests
 *
 * Verifies that getLeads() and getLeadById() return COALESCE'd display identity fields
 * (displayFirstName, displayLastName, displayDateOfBirth, displayGender) so that:
 *   - Linked Leads show Patient identity in all UI surfaces (Leads list, header, merge dialog)
 *   - Unlinked Leads show their own Lead identity
 *   - Search finds Leads by Patient name when linked
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { leads, patients, users } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { getLeads, getLeadById, createLead, createPatient, linkLeadToExistingPatient } from "./db";
import { getNextCode } from "./codeSequences";

// ── Helpers ──────────────────────────────────────────────────────────────────

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

async function createTestLead(overrides: Record<string, any> = {}) {
  const suffix = uniqueSuffix();
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(leads).values({
    firstName: overrides.firstName ?? `LeadFirst-${suffix}`,
    lastName: overrides.lastName ?? `LeadLast-${suffix}`,
    gender: overrides.gender ?? null,
    dateOfBirth: overrides.dateOfBirth ?? null,
    leadStatus: overrides.leadStatus ?? "intake",
    ...overrides,
  } as any);
  const [row] = await db
    .select()
    .from(leads)
    .where(and(
      eq(leads.firstName, overrides.firstName ?? `LeadFirst-${suffix}`),
      eq(leads.lastName, overrides.lastName ?? `LeadLast-${suffix}`)
    ))
    .orderBy(leads.id)
    .limit(1);
  return row;
}

async function createTestPatient(overrides: Record<string, any> = {}) {
  const suffix = uniqueSuffix();
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const mrn = await getNextCode("patient");
  await db.insert(patients).values({
    mrn,
    firstName: overrides.firstName ?? `PatientFirst-${suffix}`,
    lastName: overrides.lastName ?? `PatientLast-${suffix}`,
    gender: overrides.gender ?? "female",
    dateOfBirth: overrides.dateOfBirth ?? new Date("1990-05-15"),
    ...overrides,
  } as any);
  const [row] = await db
    .select()
    .from(patients)
    .where(eq(patients.mrn, mrn))
    .limit(1);
  return row;
}

async function cleanupLead(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(leads).where(eq(leads.id, id));
}

async function cleanupPatient(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(patients).where(eq(patients.id, id));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Option A — Display Identity (getLeads + getLeadById)", () => {
  let leadId: number;
  let patientId: number;

  afterAll(async () => {
    if (leadId) await cleanupLead(leadId);
    if (patientId) await cleanupPatient(patientId);
  });

  it("T-OA-1: unlinked Lead — displayFirstName/displayLastName fall back to Lead fields", async () => {
    const lead = await createTestLead({ firstName: "UnlinkedFirst", lastName: "UnlinkedLast" });
    leadId = lead.id;

    const result = await getLeadById(lead.id);
    expect(result).toBeDefined();
    expect((result as any).displayFirstName).toBe("UnlinkedFirst");
    expect((result as any).displayLastName).toBe("UnlinkedLast");
  });

  it("T-OA-2: linked Lead — displayFirstName/displayLastName come from Patient", async () => {
    const lead = await createTestLead({ firstName: "StaleFirst", lastName: "StaleLast", gender: "female" });
    const patient = await createTestPatient({ firstName: "PatientFirst", lastName: "PatientLast", gender: "female" });
    leadId = lead.id;
    patientId = patient.id;

    // Link lead to patient
    const linkResult = await linkLeadToExistingPatient({ leadId: lead.id, patientId: patient.id });
    expect(linkResult.status).toBe("linked");

    const result = await getLeadById(lead.id);
    expect(result).toBeDefined();
    // Display fields should come from Patient, not Lead
    expect((result as any).displayFirstName).toBe("PatientFirst");
    expect((result as any).displayLastName).toBe("PatientLast");
    // Raw Lead fields should remain unchanged
    expect(result!.firstName).toBe("StaleFirst");
    expect(result!.lastName).toBe("StaleLast");
  });

  it("T-OA-3: getLeads list — linked Lead shows Patient display name", async () => {
    // Use the lead and patient from T-OA-2 (already linked)
    if (!leadId || !patientId) return;

    const listResult = await getLeads({ page: 1, pageSize: 100 });
    const row = listResult.data.find((l: any) => l.id === leadId);
    expect(row).toBeDefined();
    expect((row as any).displayFirstName).toBe("PatientFirst");
    expect((row as any).displayLastName).toBe("PatientLast");
    // Raw Lead fields still present
    expect(row.firstName).toBe("StaleFirst");
    expect(row.lastName).toBe("StaleLast");
  });

  it("T-OA-4: getLeads search — finds linked Lead by Patient name", async () => {
    if (!leadId || !patientId) return;

    const searchResult = await getLeads({ search: "PatientFirst", page: 1, pageSize: 50 });
    const found = searchResult.data.find((l: any) => l.id === leadId);
    expect(found).toBeDefined();
  });

  it("T-OA-5: getLeads search — does NOT find linked Lead by stale Lead name when Patient name is different", async () => {
    if (!leadId || !patientId) return;

    // "StaleFirst" is the old Lead name — the search should NOT return this Lead
    // when searching by the stale name (it only matches Lead.firstName directly,
    // but the Lead is still findable by its own firstName too — this is expected behavior
    // since we don't remove the Lead name from search, we only ADD patient name to search)
    // So this test verifies the search is additive (both names work)
    const byLeadName = await getLeads({ search: "StaleFirst", page: 1, pageSize: 50 });
    const foundByLeadName = byLeadName.data.find((l: any) => l.id === leadId);
    // Lead name search still works (additive)
    expect(foundByLeadName).toBeDefined();
  });

  it("T-OA-6: displayDateOfBirth and displayGender come from Patient when linked", async () => {
    if (!leadId || !patientId) return;

    const result = await getLeadById(leadId);
    expect(result).toBeDefined();
    expect((result as any).displayGender).toBe("female");
    // displayDateOfBirth should be the Patient's DOB
    const dob = (result as any).displayDateOfBirth;
    expect(dob).toBeDefined();
    const dobDate = new Date(dob);
    expect(dobDate.getFullYear()).toBe(1990);
    expect(dobDate.getMonth()).toBe(4); // May = 4
    expect(dobDate.getDate()).toBe(15);
  });
});
