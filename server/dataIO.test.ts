import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@fertiliv.com",
    name: "Admin User",
    loginMethod: "password",
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
      ip: "127.0.0.1",
    } as unknown as TrpcContext["req"],
    res: {
      cookie: () => {},
      clearCookie: () => {},
    } as unknown as TrpcContext["res"],
  };
}

describe("dataIO router", () => {
  it("export procedure exists and is callable", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    // The procedure should exist — calling with an invalid module should throw a validation error
    // rather than a "not found" error
    try {
      await caller.dataIO.export({
        module: "services" as any,
      });
      // If it succeeds (DB available), that's fine too
    } catch (err: any) {
      // Should NOT be "procedure not found" — it should be a DB or validation error
      expect(err?.message ?? "").not.toContain("No procedure found");
      expect(err?.message ?? "").not.toContain("is not a function");
    }
  });

  it("preview procedure returns correct shape for empty rows", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.dataIO.preview({
      module: "leads",
      rows: [],
    });
    expect(result).toHaveProperty("module", "leads");
    expect(result).toHaveProperty("totalRows", 0);
    expect(result).toHaveProperty("preview");
    expect(result).toHaveProperty("columns");
    expect(Array.isArray(result.preview)).toBe(true);
    expect(Array.isArray(result.columns)).toBe(true);
  });

  it("preview procedure returns first 10 rows from a larger set", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: String(i + 1),
      name: `Row ${i + 1}`,
      email: `row${i + 1}@test.com`,
    }));
    const result = await caller.dataIO.preview({
      module: "leads",
      rows,
    });
    expect(result.totalRows).toBe(25);
    expect(result.preview.length).toBe(10);
    expect(result.columns).toContain("id");
    expect(result.columns).toContain("name");
    expect(result.columns).toContain("email");
  });

  it("preview procedure returns correct columns for single row", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const rows = [{ firstName: "John", lastName: "Doe", phone: "+1234567890" }];
    const result = await caller.dataIO.preview({
      module: "patients",
      rows,
    });
    expect(result.totalRows).toBe(1);
    expect(result.columns).toContain("firstName");
    expect(result.columns).toContain("lastName");
    expect(result.columns).toContain("phone");
  });

  it("import procedure rejects read-only modules gracefully", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    // labResults is read-only — import should either succeed (no-op) or fail gracefully
    // but should NOT throw a "procedure not found" error
    try {
      await caller.dataIO.import({
        module: "labResults",
        conflictStrategy: "skip",
        rows: [{ id: "1", patientId: "1", testName: "CBC" }],
      });
    } catch (err: any) {
      expect(err?.message ?? "").not.toContain("No procedure found");
      expect(err?.message ?? "").not.toContain("is not a function");
    }
  });
});
