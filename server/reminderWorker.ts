import { processDueAppointmentReminders } from "./appointmentReminderService";

const DEFAULT_POLL_INTERVAL_MS = 60_000;
const MIN_POLL_INTERVAL_MS = 1_000;
const MAX_POLL_INTERVAL_MS = 3_600_000;

type WorkerCycleResult = {
  claimed: number;
  sent: number;
  retryPending: number;
  skipped: number;
  invalidated: number;
  failed: number;
};

type WorkerArguments =
  | { mode: "continuous" }
  | { mode: "once"; deliveryId: number };

type TimerHandle = ReturnType<typeof setTimeout>;

type ReminderWorkerLoopOptions = {
  pollIntervalMs: number;
  processCycle: () => Promise<WorkerCycleResult>;
  schedule?: (callback: () => void, delayMs: number) => TimerHandle;
  cancel?: (handle: TimerHandle) => void;
  onCycleError?: (error: unknown) => void;
};

function isPositiveInteger(value: string | undefined): value is string {
  return Boolean(value && /^\d+$/.test(value) && Number(value) > 0 && Number.isSafeInteger(Number(value)));
}

export function parseReminderWorkerArguments(args: string[] = process.argv.slice(2)): WorkerArguments {
  const once = args.includes("--once");
  const deliveryFlagIndex = args.indexOf("--delivery-id");
  const deliveryIdValue = deliveryFlagIndex >= 0 ? args[deliveryFlagIndex + 1] : undefined;

  if (!once && deliveryFlagIndex >= 0) {
    throw new Error("--delivery-id is allowed only with --once");
  }
  if (once && !isPositiveInteger(deliveryIdValue)) {
    throw new Error("--once requires an exact positive --delivery-id");
  }
  if (once) return { mode: "once", deliveryId: Number(deliveryIdValue) };
  return { mode: "continuous" };
}

export function resolveReminderWorkerPollInterval(value = process.env.REMINDER_WORKER_POLL_INTERVAL_MS): number {
  if (value === undefined || value.trim() === "") return DEFAULT_POLL_INTERVAL_MS;
  if (!/^\d+$/.test(value)) {
    throw new Error("REMINDER_WORKER_POLL_INTERVAL_MS must be a whole number of milliseconds");
  }
  const interval = Number(value);
  if (!Number.isSafeInteger(interval) || interval < MIN_POLL_INTERVAL_MS || interval > MAX_POLL_INTERVAL_MS) {
    throw new Error(`REMINDER_WORKER_POLL_INTERVAL_MS must be between ${MIN_POLL_INTERVAL_MS} and ${MAX_POLL_INTERVAL_MS}`);
  }
  return interval;
}

/**
 * Runs cycles sequentially. The next cycle is scheduled only after the active
 * cycle has settled, preventing in-process overlap. Database claims remain the
 * authority for safety across multiple worker processes.
 */
export function createReminderWorkerLoop(options: ReminderWorkerLoopOptions) {
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs));
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle));
  let stopped = false;
  let timer: TimerHandle | null = null;
  let activeCycle: Promise<void> | null = null;

  const runCycle = () => {
    if (stopped || activeCycle) return activeCycle;
    activeCycle = (async () => {
      try {
        const result = await options.processCycle();
        console.info("[reminder-worker] cycle complete", result);
      } catch (error) {
        options.onCycleError?.(error);
      } finally {
        activeCycle = null;
        if (!stopped) {
          timer = schedule(() => {
            timer = null;
            void runCycle();
          }, options.pollIntervalMs);
        }
      }
    })();
    return activeCycle;
  };

  return {
    start() {
      void runCycle();
    },
    async stop() {
      stopped = true;
      if (timer) {
        cancel(timer);
        timer = null;
      }
      await activeCycle;
    },
    get isStopped() {
      return stopped;
    },
  };
}

async function runWorkerCli() {
  const args = parseReminderWorkerArguments();
  if (args.mode === "once") {
    const result = await processDueAppointmentReminders({ deliveryId: args.deliveryId });
    console.info("[reminder-worker] scoped cycle complete", { deliveryId: args.deliveryId, ...result });
    return;
  }

  const interval = resolveReminderWorkerPollInterval();
  const loop = createReminderWorkerLoop({
    pollIntervalMs: interval,
    processCycle: () => processDueAppointmentReminders(),
    onCycleError: (error) => console.error("[reminder-worker] cycle failed", {
      error: error instanceof Error ? error.message : "unknown",
    }),
  });
  let shutdownPromise: Promise<void> | null = null;
  const shutdown = (signal: "SIGTERM" | "SIGINT") => {
    if (shutdownPromise) return;
    console.info(`[reminder-worker] ${signal} received; waiting for active cycle to settle`);
    shutdownPromise = loop.stop()
      .then(() => console.info("[reminder-worker] stopped cleanly"))
      .catch((error) => console.error("[reminder-worker] shutdown failed", { error: error instanceof Error ? error.message : "unknown" }));
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  loop.start();
}

const invokedAsCli = Boolean(process.argv[1] && /reminder-worker(?:\.js)?$/.test(process.argv[1]));
if (invokedAsCli) {
  runWorkerCli().catch((error) => {
    console.error("[reminder-worker] unable to start", { error: error instanceof Error ? error.message : "unknown" });
    process.exitCode = 1;
  });
}
