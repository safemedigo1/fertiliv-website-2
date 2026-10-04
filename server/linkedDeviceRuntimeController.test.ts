import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  activeIsolatedLinkedDeviceWorkerCount,
  buildIsolatedWorkerEnvironment,
  isReservedIsolatedPort,
  isolatedRuntimeRootForTests,
} from "./linkedDeviceRuntimeController";

describe("isolated Linked Device runtime controller", () => {
  it("never allocates the live or historical test ports", () => {
    expect(isReservedIsolatedPort(4100)).toBe(true);
    expect(isReservedIsolatedPort(8787)).toBe(true);
    expect(isReservedIsolatedPort(8899)).toBe(true);
    expect(isReservedIsolatedPort(8900)).toBe(false);
  });

  it("builds a QR-only child environment scoped to the requested line", () => {
    const env = buildIsolatedWorkerEnvironment({
      lineId: 123456,
      sessionId: "987654",
      runtimeGeneration: "generation-isolated-a",
      port: 8910,
      dataDir: "/tmp/fertiliv-isolated/isolated-a",
      sessionName: "fertiliv-linked-device-isolated-a",
    });
    expect(env).toMatchObject({
      POC_PORT: "8910",
      POC_BIND_HOST: "0.0.0.0",
      POC_LINE_ID: "123456",
      POC_LINE_PROVIDER_ID: "wppconnect-line-123456",
      POC_SESSION_ID: "987654",
      POC_RUNTIME_GENERATION: "generation-isolated-a",
      POC_INBOUND_BRIDGE_ENABLED: "false",
      POC_OUTBOUND_ENABLED: "false",
      WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED: "false",
    });
    expect(env.POC_DATA_DIR).toBe("/tmp/fertiliv-isolated/isolated-a");
    expect(env.POC_SESSION_ID).toBe("987654");
    expect(env.POC_RUNTIME_GENERATION).toBe("generation-isolated-a");
    expect(env.WHATSAPP_LINKED_DEVICE_WORKER_API_SECRET).toBeUndefined();
    expect(env.WHATSAPP_LINKED_DEVICE_RECIPIENT_APPROVAL_SECRET).toBeUndefined();
    expect(env.FERTILIV_WPPCONNECT_INGRESS_SECRET).toBeUndefined();
    expect(env.JWT_SECRET).toBeUndefined();
  });

  it("has no active child before the UI requests a fresh isolated session", () => {
    expect(activeIsolatedLinkedDeviceWorkerCount()).toBe(0);
  });

  it("uses a separate runtime root and does not encode the live Ferti2 profile", () => {
    const root = isolatedRuntimeRootForTests();
    expect(root).toMatch(/poc-data-isolated/);
    expect(root).not.toMatch(/poc-data-inapp[\\/]fertiliv-inapp-wppconnect/);
    const source = fs.readFileSync(path.resolve(import.meta.dirname, "linkedDeviceRuntimeController.ts"), "utf8");
    expect(source).toContain("RESERVED_PORTS = new Set([4100, 8787, 8899])");
    expect(source).toContain('POC_OUTBOUND_ENABLED: "false"');
    expect(source).toContain("delete env.WHATSAPP_LINKED_DEVICE_WORKER_API_SECRET");
    expect(source).toContain("startIsolatedLinkedDeviceWorker");
  });
});
