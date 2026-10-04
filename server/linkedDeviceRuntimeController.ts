import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type { LinkedDeviceRuntimeBinding } from "./linkedDeviceRuntime";
import { allocateLinkedDeviceRuntime } from "./linkedDeviceRuntime";

const RESERVED_PORTS = new Set([4100, 8787, 8899]);
const MIN_DYNAMIC_PORT = 8900;
const MAX_DYNAMIC_PORT = 8999;
const START_TIMEOUT_MS = 45_000;
const POLL_INTERVAL_MS = 250;
const CHILD_STOP_TIMEOUT_MS = 5_000;

export type IsolatedWorkerRuntime = {
  lineId: number;
  binding: LinkedDeviceRuntimeBinding;
  child: ChildProcess;
  dataDir: string;
};

const activeWorkers = new Map<string, IsolatedWorkerRuntime>();

/**
 * The controller is deliberately limited to the development sandbox. It is
 * not a production worker supervisor and cannot take ownership of Ferti2's
 * existing runtime through the legacy 8899 fallback.
 */
export function isIsolatedLinkedDeviceControllerEnabled() {
  return process.env.NODE_ENV === "development"
    && process.env.WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED !== "true";
}

export function isReservedIsolatedPort(port: number) {
  return RESERVED_PORTS.has(port);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortAvailable(port: number) {
  return new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function nextIsolatedPort() {
  for (let port = MIN_DYNAMIC_PORT; port <= MAX_DYNAMIC_PORT; port += 1) {
    if (isReservedIsolatedPort(port)) continue;
    if (await isPortAvailable(port)) return port;
  }
  throw new Error("No isolated Linked Device runtime port is available.");
}

function runtimeRoot() {
  const configured = process.env.WHATSAPP_LINKED_DEVICE_ISOLATED_RUNTIME_ROOT?.trim();
  return configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), "../linked-device-poc/wppconnect/poc-data-isolated");
}

function harnessPath() {
  const configured = process.env.WHATSAPP_LINKED_DEVICE_HARNESS_PATH?.trim();
  return configured
    ? path.resolve(configured)
    : path.resolve(process.cwd(), "../linked-device-poc/wppconnect/wppconnect-poc.cjs");
}

function publicEndpointForPort(port: number) {
  const configuredTemplate = process.env.WHATSAPP_LINKED_DEVICE_ISOLATED_PUBLIC_ENDPOINT_TEMPLATE?.trim();
  if (configuredTemplate?.includes("{port}")) return configuredTemplate.replaceAll("{port}", String(port)).replace(/\/$/, "");
  const existing = process.env.WHATSAPP_LINKED_DEVICE_INAPP_SANDBOX_URL?.trim();
  if (!existing) return `http://127.0.0.1:${port}`;
  try {
    const parsed = new URL(existing);
    parsed.hostname = parsed.hostname.replace(/^\d+-/, `${port}-`);
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return `http://127.0.0.1:${port}`;
  }
}

function portForRuntime(binding: LinkedDeviceRuntimeBinding) {
  const parsed = new URL(binding.endpointUrl);
  const explicitPort = Number(parsed.port);
  if (Number.isInteger(explicitPort) && explicitPort >= 1024 && explicitPort <= 65535) return explicitPort;
  const gatewayPort = Number(parsed.hostname.match(/^(\d+)-/)?.[1]);
  if (Number.isInteger(gatewayPort) && gatewayPort >= 1024 && gatewayPort <= 65535) return gatewayPort;
  throw new Error("The isolated Linked Device runtime endpoint does not identify a safe port.");
}

export function buildIsolatedWorkerEnvironment(input: {
  lineId: number;
  sessionId: string;
  runtimeGeneration: string;
  port: number;
  dataDir: string;
  sessionName: string;
  ingressUrl?: string;
}) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    POC_PORT: String(input.port),
    POC_BIND_HOST: "0.0.0.0",
    POC_DATA_DIR: input.dataDir,
    POC_SESSION_NAME: input.sessionName,
    POC_SESSION_ID: input.sessionId,
    POC_RUNTIME_GENERATION: input.runtimeGeneration,
    POC_LINE_ID: String(input.lineId),
    POC_LINE_PROVIDER_ID: `wppconnect-line-${input.lineId}`,
    POC_INBOUND_BRIDGE_ENABLED: "false",
    POC_OUTBOUND_ENABLED: "false",
    WORKER_API_AUTH_REQUIRED: "",
    WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED: "false",
    FERTILIV_WPPCONNECT_INGRESS_URL: input.ingressUrl ?? "http://127.0.0.1:3000/api/internal/wppconnect-sandbox-event",
  };
  delete env.WHATSAPP_LINKED_DEVICE_WORKER_API_SECRET;
  delete env.WHATSAPP_LINKED_DEVICE_RECIPIENT_APPROVAL_SECRET;
  delete env.FERTILIV_WPPCONNECT_INGRESS_SECRET;
  delete env.JWT_SECRET;
  return env;
}

async function waitForWorkerState(binding: LinkedDeviceRuntimeBinding) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  let lastError = "worker_not_reachable";
  const localBaseUrl = `http://127.0.0.1:${portForRuntime(binding)}`;
  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1_500);
    try {
      const response = await fetch(`${localBaseUrl}/state`, {
        headers: { accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) {
        const state = await response.json() as { status?: string; qrDataUrl?: string | null; error?: string | null };
        if (state.status === "QR_READY" && state.qrDataUrl) return state;
        if (state.status === "FAILED" || state.status === "UNAVAILABLE") {
          throw new Error(state.error || "The isolated Linked Device worker failed to start.");
        }
        lastError = `worker_${String(state.status || "starting").toLowerCase()}`;
      } else {
        lastError = `worker_http_${response.status}`;
      }
    } catch (error) {
      if (error instanceof Error && /failed to start/.test(error.message)) throw error;
      lastError = "worker_not_reachable";
    } finally {
      clearTimeout(timer);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`The isolated Linked Device worker did not become QR-ready (${lastError}).`);
}

function stopChild(child: ChildProcess) {
  return new Promise<void>((resolve) => {
    if (!child.pid || child.exitCode !== null) return resolve();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    child.once("exit", finish);
    try { process.kill(-child.pid, "SIGTERM"); } catch { try { child.kill("SIGTERM"); } catch { finish(); } }
    setTimeout(() => {
      if (settled) return;
      try { process.kill(-child.pid!, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} }
      finish();
    }, CHILD_STOP_TIMEOUT_MS).unref();
  });
}

export async function startIsolatedLinkedDeviceWorker(input: { lineId: number; binding: LinkedDeviceRuntimeBinding }) {
  if (!isIsolatedLinkedDeviceControllerEnabled()) {
    throw new Error("The isolated Linked Device controller is available only in the development sandbox.");
  }
  if (!Number.isInteger(input.lineId) || input.lineId <= 0) throw new Error("A valid Linked Device line is required.");
  if (!input.binding.sessionId) throw new Error("A persisted Linked Device session identity is required.");

  const dataDir = input.binding.profileRef?.trim() || path.join(runtimeRoot(), input.binding.generation);
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const runtime = { ...input.binding, profileRef: dataDir };
  const env = buildIsolatedWorkerEnvironment({
    lineId: input.lineId,
    sessionId: runtime.sessionId ?? "",
    runtimeGeneration: runtime.generation,
    port: portForRuntime(runtime),
    dataDir,
    sessionName: runtime.sessionName,
  });
  const child = spawn(process.execPath, [harnessPath()], {
    cwd: path.dirname(harnessPath()),
    env,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  const record: IsolatedWorkerRuntime = { lineId: input.lineId, binding: runtime, child, dataDir };
  activeWorkers.set(runtime.generation, record);
  child.once("exit", () => {
    const current = activeWorkers.get(runtime.generation);
    if (current?.child === child) activeWorkers.delete(runtime.generation);
  });

  try {
    await waitForWorkerState(runtime);
    return record;
  } catch (error) {
    activeWorkers.delete(runtime.generation);
    await stopChild(child);
    throw error;
  }
}

export async function allocateIsolatedLinkedDeviceRuntime() {
  const port = await nextIsolatedPort();
  const generation = `isolated-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const sessionName = `fertiliv-linked-device-${generation}`;
  const dataDir = path.join(runtimeRoot(), generation);
  return allocateLinkedDeviceRuntime({
    endpointUrl: publicEndpointForPort(port),
    slot: `isolated-${port}`,
    sessionName,
    generation,
    profileRef: dataDir,
  });
}

export async function allocateAndStartIsolatedLinkedDeviceWorker(input: { lineId: number }) {
  const binding = await allocateIsolatedLinkedDeviceRuntime();
  return startIsolatedLinkedDeviceWorker({ lineId: input.lineId, binding });
}

export async function stopIsolatedLinkedDeviceWorker(runtime: Pick<LinkedDeviceRuntimeBinding, "generation">) {
  const record = activeWorkers.get(runtime.generation);
  if (!record) return false;
  activeWorkers.delete(runtime.generation);
  await stopChild(record.child);
  return true;
}

export function activeIsolatedLinkedDeviceWorkerCount() {
  return activeWorkers.size;
}

export function isolatedRuntimeRootForTests() {
  return runtimeRoot();
}

export function isolatedWorkerPlatformForTests() {
  return os.platform();
}
