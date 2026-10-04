import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { state } = vi.hoisted(() => ({
  state: {
    admins: [] as Array<{ id: number }>,
    fail: null as null | "down" | "duplicate" | "missing-db",
    inserts: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("./db", () => ({
  getDb: async () => {
    if (state.fail === "missing-db") return null;
    return {
      select: () => ({
        from: () => ({
          where: async () => state.admins,
        }),
      }),
      insert: () => ({
        values: (row: Record<string, unknown>) => ({
          onConflictDoNothing: async () => {
            if (state.fail === "down") throw new Error("db down");
            if (state.fail === "duplicate") {
              const error = new Error("duplicate") as Error & { cause?: { code: string } };
              error.cause = { code: "23505" };
              throw error;
            }
            state.inserts.push(row);
          },
        }),
      }),
    };
  },
}));

import { notifyOwner } from "./_core/notification";

describe("notifyOwner", () => {
  beforeEach(() => {
    state.admins = [{ id: 7 }, { id: 8 }];
    state.fail = null;
    state.inserts = [];
  });

  it("stores one general notice for each active admin and does not log the text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const delivered = await notifyOwner({
      title: "New Intake Submission",
      content: "A new public intake arrived",
      dedupeKey: "storage-cleanup:12",
    });
    expect(delivered).toBe(true);
    expect(state.inserts).toEqual([
      expect.objectContaining({
        userId: 7,
        type: "general",
        title: "New Intake Submission",
        message: "A new public intake arrived",
        dedupeKey: "storage-cleanup:12",
      }),
      expect.objectContaining({ userId: 8, type: "general", dedupeKey: "storage-cleanup:12" }),
    ]);
    const logged = [...warn.mock.calls, ...info.mock.calls].flat().join(" ");
    expect(logged).not.toContain("A new public intake arrived");
    warn.mockRestore();
    info.mockRestore();
  });

  it("returns true and writes nothing when no active admin exists", async () => {
    state.admins = [];
    await expect(notifyOwner({ title: "Hello", content: "Body" })).resolves.toBe(true);
    expect(state.inserts).toHaveLength(0);
  });

  it("returns false when storage fails and does not throw", async () => {
    state.fail = "down";
    await expect(notifyOwner({ title: "Hello", content: "Body" })).resolves.toBe(false);
  });

  it("returns false when the database is unavailable", async () => {
    state.fail = "missing-db";
    await expect(notifyOwner({ title: "Hello", content: "Body" })).resolves.toBe(false);
    expect(state.inserts).toHaveLength(0);
  });

  it("treats a duplicate key as already delivered", async () => {
    state.fail = "duplicate";
    await expect(notifyOwner({
      title: "Storage Cleanup Alert: Persistent Deletion Failure",
      content: "Document ID: 4",
      dedupeKey: "storage-cleanup:4",
    })).resolves.toBe(true);
    expect(state.inserts).toHaveLength(0);
  });

  it("rejects an invalid payload before writing", async () => {
    await expect(notifyOwner({ title: " ", content: "Body" })).resolves.toBe(false);
    await expect(notifyOwner({ title: "x".repeat(1201), content: "Body" })).resolves.toBe(false);
    expect(state.inserts).toHaveLength(0);
  });

  it("drops a dedupe key that is not a safe token", async () => {
    await notifyOwner({ title: "Hello", content: "Body", dedupeKey: "not a key" });
    expect(state.inserts[0]?.dedupeKey).toBeNull();
  });
});

describe("owner notification and finance source contracts", () => {
  const notification = readFileSync(join(__dirname, "_core/notification.ts"), "utf8");
  const routers = readFileSync(join(__dirname, "routers.ts"), "utf8");
  const db = readFileSync(join(__dirname, "db.ts"), "utf8");
  const main = readFileSync(join(__dirname, "../client/src/main.tsx"), "utf8");
  const page = readFileSync(join(__dirname, "../client/src/pages/PatientDetailPage.tsx"), "utf8");
  const css = readFileSync(join(__dirname, "../client/src/index.css"), "utf8");

  it("does not call Forge and selects active admins only", () => {
    expect(notification).not.toContain("WebDevService");
    expect(notification).not.toContain("forgeApiUrl");
    expect(notification).not.toContain("BUILT_IN_FORGE");
    expect(notification).toContain('eq(users.role, "admin")');
    expect(notification).toContain('eq(users.status, "active")');
    expect(notification).toContain("eq(users.isActive, true)");
    expect(notification).not.toContain("manager");
  });

  it("keeps medical-note cancellation successful when the alert throws", () => {
    const start = routers.indexOf("requestCancellation:");
    const block = routers.slice(start, start + 1800);
    const notifyAt = block.indexOf("await notifyOwner");
    expect(notifyAt).toBeGreaterThan(-1);
    expect(block.lastIndexOf("try {", notifyAt)).toBeGreaterThan(-1);
    expect(block.indexOf("return { success: true }", notifyAt)).toBeGreaterThan(notifyAt);
  });

  it("marks a storage document alerted only after delivery", () => {
    const alert = db.indexOf("Storage Cleanup Alert: Persistent Deletion Failure");
    const delivered = db.indexOf("if (delivered)", alert);
    const marked = db.indexOf("cleanupAlertedAt: now", delivered);
    expect(db).toContain("dedupeKey: `storage-cleanup:${doc.id}`");
    expect(delivered).toBeGreaterThan(alert);
    expect(marked).toBeGreaterThan(delivered);
  });

  it("keeps mobile finance from rendering an empty paid state and adds line-label tags", () => {
    expect(main).toContain("maxURLLength: 1000");
    expect(page).toContain("const invoicesPending = invoicesLoading || (invoicesFailed && invoices === undefined)");
    expect(page).toContain("Finance is still loading");
    expect(page).toContain("function InvoiceLineLabelShortcuts");
    expect(page).toContain('["Cash", "Card", "Bank Transfer"]');
    expect(page).toContain("disabled={isHistoricalLine}");
    expect(css).toMatch(/html, body, #root \{\s*min-height: 100%;/);
    expect(css).not.toMatch(/html, body, #root \{\s*height: 100%/);
  });
});
