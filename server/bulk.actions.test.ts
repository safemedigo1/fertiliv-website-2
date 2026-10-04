import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@fertiliv.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: {
      cookies: {},
      headers: {},
    } as any,
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as any,
  };
}

function createStaffContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "staff-user",
    email: "staff@fertiliv.com",
    name: "Staff User",
    loginMethod: "manus",
    role: "staff",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: {
      cookies: {},
      headers: {},
    } as any,
    res: {
      cookie: vi.fn(),
      clearCookie: vi.fn(),
    } as any,
  };
}

describe("leads.bulkUpdate", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      caller.leads.bulkUpdate({ ids: [1, 2], data: { leadStatus: "contacted" } })
    ).rejects.toThrow();
  });

  it("rejects empty ids array", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.leads.bulkUpdate({ ids: [], data: { leadStatus: "contacted" } })
    ).rejects.toThrow();
  });

  it("rejects ids array with more than 500 items", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const ids = Array.from({ length: 501 }, (_, i) => i + 1);
    await expect(
      caller.leads.bulkUpdate({ ids, data: { leadStatus: "contacted" } })
    ).rejects.toThrow();
  });
});

describe("leads.bulkDelete", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      caller.leads.bulkDelete({ ids: [1, 2] })
    ).rejects.toThrow();
  });

  it("rejects empty ids array", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      caller.leads.bulkDelete({ ids: [] })
    ).rejects.toThrow();
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(createStaffContext());
    await expect(
      caller.leads.bulkDelete({ ids: [1] })
    ).rejects.toThrow();
  });
});

describe("tasks.bulkUpdate", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      (caller as any).tasks.bulkUpdate({ ids: [1], data: { status: "done" } })
    ).rejects.toThrow();
  });

  it("rejects empty ids array", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      (caller as any).tasks.bulkUpdate({ ids: [], data: { status: "done" } })
    ).rejects.toThrow();
  });
});

describe("tasks.bulkDelete", () => {
  it("requires authentication", async () => {
    const caller = appRouter.createCaller({ user: null, req: {} as any, res: {} as any });
    await expect(
      (caller as any).tasks.bulkDelete({ ids: [1] })
    ).rejects.toThrow();
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(createStaffContext());
    await expect(
      (caller as any).tasks.bulkDelete({ ids: [1] })
    ).rejects.toThrow();
  });

  it("rejects empty ids array", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    await expect(
      (caller as any).tasks.bulkDelete({ ids: [] })
    ).rejects.toThrow();
  });
});
