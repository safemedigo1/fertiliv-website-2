import { randomUUID } from "node:crypto";

export type LinkedDeviceRuntimeMode = "sandbox" | "persistent_worker";

export type LinkedDeviceRuntimeBinding = {
  slot: string;
  endpointUrl: string;
  endpointHost: string;
  mode: LinkedDeviceRuntimeMode;
  sessionId: string | null;
  sessionName: string;
  generation: string;
  profileRef: string | null;
};

const SAFE_RUNTIME_SLOT = /^[A-Za-z0-9._-]{1,64}$/;
const SAFE_SESSION_NAME = /^[A-Za-z0-9._-]{1,128}$/;
const SAFE_SESSION_ID = /^[1-9][0-9]{0,18}$/;

function safeSlot(value: unknown) {
  const slot = typeof value === "string" ? value.trim() : "";
  return SAFE_RUNTIME_SLOT.test(slot) ? slot : null;
}

function safeSessionName(value: unknown) {
  const sessionName = typeof value === "string" ? value.trim() : "";
  return SAFE_SESSION_NAME.test(sessionName) ? sessionName : null;
}

function safeSessionId(value: unknown) {
  const sessionId = typeof value === "number" && Number.isInteger(value)
    ? String(value)
    : typeof value === "string" ? value.trim() : "";
  return SAFE_SESSION_ID.test(sessionId) ? sessionId : null;
}

function endpoint(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = new URL(value.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function endpointHost(endpointUrl: string) {
  try {
    return new URL(endpointUrl).host;
  } catch {
    return "invalid_endpoint";
  }
}

function runtimeMode(): LinkedDeviceRuntimeMode {
  return process.env.WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED === "true"
    ? "persistent_worker"
    : "sandbox";
}

/**
 * Returns the reviewed infrastructure pool’s next single-worker binding.
 * The binding is intentionally independent of line IDs, phone numbers, and
 * provider identities. A future allocator can replace this function without
 * changing Inbox or conversation code.
 */
export function allocateLinkedDeviceRuntime(input: {
  sessionId?: string | number | null;
  sessionName?: string | null;
  generation?: string | null;
  profileRef?: string | null;
  endpointUrl?: string | null;
  slot?: string | null;
} = {}): LinkedDeviceRuntimeBinding {
  const mode = runtimeMode();
  const configuredEndpoint = mode === "persistent_worker"
    ? process.env.WHATSAPP_LINKED_DEVICE_WORKER_URL
    : process.env.WHATSAPP_LINKED_DEVICE_INAPP_SANDBOX_URL;
  const endpointUrl = endpoint(input.endpointUrl ?? configuredEndpoint ?? "http://127.0.0.1:8899");
  if (!endpointUrl) {
    throw new Error("A valid Linked Device worker endpoint is not configured.");
  }

  const slot = safeSlot(input.slot ?? process.env.WHATSAPP_LINKED_DEVICE_RUNTIME_SLOT) ?? "linked-device-default";
  const generation = typeof input.generation === "string" && /^[A-Za-z0-9._-]{8,64}$/.test(input.generation)
    ? input.generation
    : randomUUID();
  const sessionName = safeSessionName(input.sessionName) ?? `fertiliv-linked-device-${generation.slice(0, 12)}`;

  return {
    slot,
    endpointUrl,
    endpointHost: endpointHost(endpointUrl),
    mode,
    sessionId: safeSessionId(input.sessionId),
    sessionName,
    generation,
    profileRef: typeof input.profileRef === "string" && input.profileRef.trim() ? input.profileRef.trim().slice(0, 512) : null,
  };
}

export function restoreLinkedDeviceRuntimeBinding(input: {
  sessionId?: string | number | null;
  slot?: string | null;
  endpointUrl?: string | null;
  mode?: string | null;
  sessionName?: string | null;
  generation?: string | null;
  profileRef?: string | null;
}): LinkedDeviceRuntimeBinding | null {
  const endpointUrl = endpoint(input.endpointUrl);
  const slot = safeSlot(input.slot);
  const sessionId = safeSessionId(input.sessionId);
  const sessionName = safeSessionName(input.sessionName);
  const mode = input.mode === "sandbox" || input.mode === "persistent_worker" ? input.mode : null;
  const generation = typeof input.generation === "string" && /^[A-Za-z0-9._-]{8,64}$/.test(input.generation)
    ? input.generation
    : null;
  if (!endpointUrl || !slot || !sessionId || !sessionName || !mode || !generation) return null;
  return {
    slot,
    endpointUrl,
    endpointHost: endpointHost(endpointUrl),
    mode,
    sessionId,
    sessionName,
    generation,
    profileRef: typeof input.profileRef === "string" && input.profileRef.trim() ? input.profileRef.trim().slice(0, 512) : null,
  };
}

export function runtimeBindingMetadata(binding: LinkedDeviceRuntimeBinding) {
  return {
    runtimeSlot: binding.slot,
    runtimeEndpoint: binding.endpointUrl,
    runtimeMode: binding.mode,
    runtimeGeneration: binding.generation,
    runtimeProfileRef: binding.profileRef,
    sessionId: binding.sessionId,
    sessionName: binding.sessionName,
  } as const;
}
