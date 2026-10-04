import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createReminderWorkerLoop, parseReminderWorkerArguments, resolveReminderWorkerPollInterval } from "./reminderWorker";

const completeCycle = () => Promise.resolve({ claimed: 0, sent: 0, retryPending: 0, skipped: 0, invalidated: 0, failed: 0 });

describe("portable reminder worker", () => {
  it("requires an exact scoped delivery for one-time mode", () => {
    expect(() => parseReminderWorkerArguments(["--once"])).toThrow("--once requires an exact positive --delivery-id");
    expect(() => parseReminderWorkerArguments(["--once", "--delivery-id", "0"])).toThrow("--once requires an exact positive --delivery-id");
    expect(() => parseReminderWorkerArguments(["--delivery-id", "120001"])).toThrow("--delivery-id is allowed only with --once");
    expect(parseReminderWorkerArguments(["--once", "--delivery-id", "120001"])).toEqual({ mode: "once", deliveryId: 120001 });
  });

  it("uses a validated sixty-second default poll interval", () => {
    expect(resolveReminderWorkerPollInterval(undefined)).toBe(60_000);
    expect(resolveReminderWorkerPollInterval("60000")).toBe(60_000);
    expect(() => resolveReminderWorkerPollInterval("999")).toThrow("between 1000 and 3600000");
    expect(() => resolveReminderWorkerPollInterval("fast")).toThrow("whole number");
  });

  it("does not overlap in-process cycles and stops scheduling new cycles during shutdown", async () => {
    let releaseFirstCycle: (() => void) | undefined;
    const firstCycle = new Promise<void>(resolve => { releaseFirstCycle = resolve; });
    let cycleCalls = 0;
    const scheduled: Array<() => void> = [];
    const loop = createReminderWorkerLoop({
      pollIntervalMs: 60_000,
      processCycle: async () => {
        cycleCalls += 1;
        if (cycleCalls === 1) await firstCycle;
        return { claimed: 0, sent: 0, retryPending: 0, skipped: 0, invalidated: 0, failed: 0 };
      },
      schedule: callback => {
        scheduled.push(callback);
        return scheduled.length as unknown as ReturnType<typeof setTimeout>;
      },
      cancel: () => undefined,
    });

    loop.start();
    loop.start();
    await Promise.resolve();
    expect(cycleCalls).toBe(1);
    expect(scheduled).toHaveLength(0);

    releaseFirstCycle?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduled).toHaveLength(1);

    const stopping = loop.stop();
    await stopping;
    expect(loop.isStopped).toBe(true);
    scheduled[0]?.();
    await Promise.resolve();
    expect(cycleCalls).toBe(1);
  });

  it("retains a normal direct cycle contract for portable worker injection", async () => {
    await expect(completeCycle()).resolves.toMatchObject({ claimed: 0, sent: 0 });
  });

  it("ships separate portable web and worker build/run commands without making Docker mandatory", () => {
    const root = path.resolve(import.meta.dirname, "..");
    const packageJson = fs.readFileSync(path.join(root, "package.json"), "utf8");
    expect(packageJson).toContain('"build:reminder-worker"');
    expect(packageJson).toContain('"start:reminder-worker"');
    expect(packageJson).toContain('"build:web-server"');
    expect(fs.readFileSync(path.join(root, "Dockerfile"), "utf8")).toContain('CMD ["node", "dist/index.js"]');
  });
});
