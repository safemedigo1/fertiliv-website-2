/**
 * Fertiliv - Core Application Tests
 * Tests for auth, patients, appointments, finance, lab, notifications, and analytics routers.
 */
import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ── Helpers ───────────────────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeCtx(overrides: Partial<AuthenticatedUser> = {}): { ctx: TrpcContext; clearedCookies: { name: string; options: Record<string, unknown> }[] } {
  const clearedCookies: { name: string; options: Record<string, unknown> }[] = [];

  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-001",
    email: "test@fertiliv.com",
    name: "Test User",
    loginMethod: "email",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };

  const ctx: TrpcContext = {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };

  return { ctx, clearedCookies };
}

function makeUnauthCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

// ── Auth Tests ────────────────────────────────────────────────────────────────

describe("auth", () => {
  it("me returns null when unauthenticated", async () => {
    const ctx = makeUnauthCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("me returns user when authenticated", async () => {
    const { ctx } = makeCtx({ name: "Dr. Sarah", role: "doctor" });
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).not.toBeNull();
    expect(result?.name).toBe("Dr. Sarah");
    expect(result?.role).toBe("doctor");
  });

  it("logout clears session cookie and returns success", async () => {
    const { ctx, clearedCookies } = makeCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1, httpOnly: true });
  });

  it("logout works for unauthenticated users too", async () => {
    const ctx = makeUnauthCtx();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});

// ── Role-based Access Tests ───────────────────────────────────────────────────

describe("role-based access", () => {
  it("admin role is correctly reflected in auth context", async () => {
    const { ctx } = makeCtx({ role: "admin" });
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user?.role).toBe("admin");
  });

  it("doctor role is correctly reflected in auth context", async () => {
    const { ctx } = makeCtx({ role: "doctor" });
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user?.role).toBe("doctor");
  });

  it("staff role is correctly reflected in auth context", async () => {
    const { ctx } = makeCtx({ role: "staff" });
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user?.role).toBe("staff");
  });

  it("patient role is correctly reflected in auth context", async () => {
    const { ctx } = makeCtx({ role: "patient" });
    const caller = appRouter.createCaller(ctx);
    const user = await caller.auth.me();
    expect(user?.role).toBe("patient");
  });
});

// ── System Notification Tests ─────────────────────────────────────────────────

describe("system.notifyOwner", () => {
  it("notifyOwner procedure exists and is callable", async () => {
    const { ctx } = makeCtx({ role: "admin" });
    const caller = appRouter.createCaller(ctx);
    // The procedure exists in the router. Delivery is an in-app admin row, covered separately.
    expect(typeof caller.system.notifyOwner).toBe("function");
  });
});

// ── Router Structure Tests ────────────────────────────────────────────────────

describe("router structure", () => {
  it("all expected top-level routers exist", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    // Check that key procedures exist
    const expectedPrefixes = ["auth.me", "auth.logout", "system.notifyOwner"];
    for (const prefix of expectedPrefixes) {
      expect(routerKeys.some(k => k === prefix || k.startsWith(prefix))).toBe(true);
    }
  });

  it("patient-related procedures exist", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    const patientProcedures = routerKeys.filter(k => k.startsWith("patients."));
    expect(patientProcedures.length).toBeGreaterThan(0);
  });

  it("appointment-related procedures exist", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    const apptProcedures = routerKeys.filter(k => k.startsWith("appointments."));
    expect(apptProcedures.length).toBeGreaterThan(0);
  });

  it("finance-related procedures exist", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    const financeProcedures = routerKeys.filter(k => k.startsWith("finance."));
    expect(financeProcedures.length).toBeGreaterThan(0);
  });

  it("lab-related procedures exist", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    const labProcedures = routerKeys.filter(k => k.startsWith("lab."));
    expect(labProcedures.length).toBeGreaterThan(0);
  });

  it("notification-related procedures exist", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    const notifProcedures = routerKeys.filter(k => k.startsWith("notifications."));
    expect(notifProcedures.length).toBeGreaterThan(0);
  });

  it("analytics-related procedures exist", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    const analyticsProcedures = routerKeys.filter(k => k.startsWith("analytics."));
    expect(analyticsProcedures.length).toBeGreaterThan(0);
  });

  it("services-related procedures exist", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    const servicesProcedures = routerKeys.filter(k => k.startsWith("services."));
    expect(servicesProcedures.length).toBeGreaterThan(0);
  });

  it("medicalNotes-related procedures exist", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    const notesProcedures = routerKeys.filter(k => k.startsWith("medicalNotes."));
    expect(notesProcedures.length).toBeGreaterThan(0);
  });

  it("users-related procedures exist", () => {
    const routerKeys = Object.keys(appRouter._def.procedures);
    const usersProcedures = routerKeys.filter(k => k.startsWith("users."));
    expect(usersProcedures.length).toBeGreaterThan(0);
  });
});

// ── Input Validation Tests ────────────────────────────────────────────────────

describe("input validation", () => {
  it("patients.list rejects unauthenticated requests", async () => {
    const ctx = makeUnauthCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.patients.list({ page: 1, limit: 10 })).rejects.toThrow();
  });

  it("appointments.list rejects unauthenticated requests", async () => {
    const ctx = makeUnauthCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.appointments.list({ startDate: new Date(), endDate: new Date() })).rejects.toThrow();
  });

  it("finance.invoices rejects unauthenticated requests", async () => {
    const ctx = makeUnauthCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.finance.invoices({ page: 1, limit: 10 })).rejects.toThrow();
  });

  it("notifications.list rejects unauthenticated requests", async () => {
    const ctx = makeUnauthCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.notifications.list()).rejects.toThrow();
  });

  it("analytics.summary rejects unauthenticated requests", async () => {
    const ctx = makeUnauthCtx();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.analytics.summary()).rejects.toThrow();
  });
});

// ── Doctor Management Tests ───────────────────────────────────────────────────

describe("doctors", () => {
  it("list is accessible to authenticated users", async () => {
    const { ctx } = makeCtx({ role: "admin" });
    const caller = appRouter.createCaller(ctx);
    // Should not throw — returns an array (may be empty in test env)
    const result = await caller.doctors.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("create rejects non-admin users", async () => {
    const { ctx } = makeCtx({ role: "staff" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.doctors.create({
        name: "Dr. Test",
        email: "test@example.com",
        password: "Password123",
      })
    ).rejects.toThrow();
  });

  it("create rejects invalid email", async () => {
    const { ctx } = makeCtx({ role: "admin" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.doctors.create({
        name: "Dr. Test",
        email: "not-an-email",
        password: "Password123",
      })
    ).rejects.toThrow();
  });

  it("create rejects short password", async () => {
    const { ctx } = makeCtx({ role: "admin" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.doctors.create({
        name: "Dr. Test",
        email: "valid@example.com",
        password: "short",
      })
    ).rejects.toThrow();
  });

  it("create rejects short name", async () => {
    const { ctx } = makeCtx({ role: "admin" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.doctors.create({
        name: "D",
        email: "valid@example.com",
        password: "Password123",
      })
    ).rejects.toThrow();
  });

  it("update rejects non-admin users", async () => {
    const { ctx } = makeCtx({ role: "doctor" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.doctors.update({ id: 1, name: "New Name" })
    ).rejects.toThrow();
  });

  it("delete rejects non-admin users", async () => {
    const { ctx } = makeCtx({ role: "staff" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.doctors.delete({ id: 1 })
    ).rejects.toThrow();
  });

  it("get rejects non-admin users", async () => {
    const { ctx } = makeCtx({ role: "patient" });
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.doctors.get({ id: 1 })
    ).rejects.toThrow();
  });
});
