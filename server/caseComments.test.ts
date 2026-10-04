import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createStaffContext(): { ctx: TrpcContext } {
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
  const ctx: TrpcContext = {
    user,
    req: {
      headers: { origin: "https://fertiliv.com" },
      ip: "127.0.0.1",
    } as any,
    res: {
      cookie: () => {},
      clearCookie: () => {},
    } as any,
  };
  return { ctx };
}

function createDoctorContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 99,
    openId: "doctor-user",
    email: "doctor@fertiliv.com",
    name: "Dr. Test",
    loginMethod: "password",
    role: "doctor",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  const ctx: TrpcContext = {
    user,
    req: {
      headers: { origin: "https://fertiliv.com" },
      ip: "127.0.0.1",
    } as any,
    res: {
      cookie: () => {},
      clearCookie: () => {},
    } as any,
  };
  return { ctx };
}

describe("caseComments router", () => {
  it("should be defined on the appRouter", () => {
    expect(appRouter._def.procedures["caseComments.list"]).toBeDefined();
    expect(appRouter._def.procedures["caseComments.create"]).toBeDefined();
    expect(appRouter._def.procedures["caseComments.delete"]).toBeDefined();
  });

  it("should reject unauthenticated list requests", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: { headers: {}, ip: "127.0.0.1" } as any,
      res: { cookie: () => {}, clearCookie: () => {} } as any,
    });
    await expect(caller.caseComments.list({ patientId: 1 })).rejects.toThrow();
  });

  it("should reject unauthenticated create requests", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: { headers: {}, ip: "127.0.0.1" } as any,
      res: { cookie: () => {}, clearCookie: () => {} } as any,
    });
    await expect(
      caller.caseComments.create({ patientId: 1, content: "Test comment" })
    ).rejects.toThrow();
  });
});

describe("doctorCases router", () => {
  it("should be defined on the appRouter", () => {
    expect(appRouter._def.procedures["doctorCases.mine"]).toBeDefined();
    expect(appRouter._def.procedures["doctorCases.getCase"]).toBeDefined();
  });

  it("should return empty case lists for staff user with no doctor profile", async () => {
    const { ctx } = createStaffContext();
    const caller = appRouter.createCaller(ctx);
    // Staff users without a doctor profile get empty lists (no doctor profile found)
    const result = await caller.doctorCases.mine();
    expect(result).toHaveProperty("leads");
    expect(result).toHaveProperty("patients");
  });

  it("should be defined on the appRouter", () => {
    expect(appRouter._def.procedures["doctorCases.mine"]).toBeDefined();
    expect(appRouter._def.procedures["doctorCases.getCase"]).toBeDefined();
  });
});
