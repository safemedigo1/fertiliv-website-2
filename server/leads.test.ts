import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the db module so tests don't need a real database
vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getLeads: vi.fn().mockResolvedValue([]),
    getLeadById: vi.fn().mockResolvedValue(undefined),
    createLead: vi.fn().mockResolvedValue({ id: 1, firstName: "Test", lastName: "Lead", leadStatus: "intake", createdAt: new Date() }),
    updateLead: vi.fn().mockResolvedValue(undefined),
    getLeadCommunications: vi.fn().mockResolvedValue([]),
    createLeadCommunication: vi.fn().mockResolvedValue(undefined),
    getLeadDocuments: vi.fn().mockResolvedValue([]),
    createLeadDocument: vi.fn().mockResolvedValue(undefined),
    getMedicalIntake: vi.fn().mockResolvedValue(undefined),
    upsertMedicalIntake: vi.fn().mockResolvedValue(undefined),
    convertLeadToPatient: vi.fn().mockResolvedValue({ patientId: 42 }),
    getLeadStats: vi.fn().mockResolvedValue({ total: 5, intake: 3, converted: 1, lost: 1 }),
    getTreatmentPackages: vi.fn().mockResolvedValue([]),
    createTreatmentPackage: vi.fn().mockResolvedValue({ id: 1, name: "IVF Package", isActive: true }),
    updateTreatmentPackage: vi.fn().mockResolvedValue(undefined),
    getTreatmentProposals: vi.fn().mockResolvedValue([]),
    createTreatmentProposal: vi.fn().mockResolvedValue({ id: 1, status: "draft" }),
    updateTreatmentProposal: vi.fn().mockResolvedValue(undefined),
  };
});

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createStaffContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "staff-user",
    email: "staff@fertiliv.com",
    name: "Staff User",
    loginMethod: "password",
    role: "staff",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("leads.stats", () => {
  it("returns lead statistics", async () => {
    const ctx = createStaffContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.leads.stats();
    expect(result).toMatchObject({ total: 5, intake: 3, converted: 1, lost: 1 });
  });
});

describe("leads.list", () => {
  it("returns empty array when no leads", async () => {
    const ctx = createStaffContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.leads.list({});
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("leads.create", () => {
  it("creates a lead with required fields", async () => {
    const ctx = createStaffContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.leads.create({
      firstName: "Test",
      lastName: "Lead",
    });
    expect(result).toMatchObject({ firstName: "Test", lastName: "Lead" });
  });
});

describe("leads.convert", () => {
  it("converts a lead to a patient and returns patientId", async () => {
    const ctx = createStaffContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.leads.convert({ leadId: 1 });
    expect(result).toMatchObject({ patientId: 42 });
  });
});

describe("treatmentPackages.list", () => {
  it("returns list of treatment packages", async () => {
    const ctx = createStaffContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.treatmentPackages.list();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("treatmentPackages.create", () => {
  it("creates a treatment package", async () => {
    const ctx = createStaffContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.treatmentPackages.create({ name: "IVF Package" });
    expect(result).toMatchObject({ name: "IVF Package" });
  });
});

describe("treatmentProposals.create", () => {
  it("creates a treatment proposal", async () => {
    const ctx = createStaffContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.treatmentProposals.create({ leadId: 1, currency: "USD" });
    expect(result).toMatchObject({ status: "draft" });
  });
});
