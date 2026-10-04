import { describe, expect, it } from "vitest";

const workerUrl = (process.env.WHATSAPP_LINKED_DEVICE_WORKER_URL ?? "").replace(/\/$/, "");
const workerSecret = process.env.WHATSAPP_LINKED_DEVICE_WORKER_API_SECRET ?? "";
const persistentWorkerEnabled = process.env.WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED === "true";

describe("Phase 2A persistent Linked Device worker connectivity", () => {
  it("authenticates to the prepared HTTPS health boundary while cutover remains disabled", async () => {
    expect(workerUrl).toMatch(/^https:\/\//);
    expect(workerSecret.length).toBeGreaterThanOrEqual(32);
    expect(persistentWorkerEnabled).toBe(false);

    const response = await fetch(`${workerUrl}/healthz`, {
      headers: { authorization: `Bearer ${workerSecret}` },
      signal: AbortSignal.timeout(10_000),
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      endpointState: "ready_for_migration",
      workerState: "not_started",
      whatsappState: "not_started",
    });
  });
});
