import { createHmac, timingSafeEqual } from "node:crypto";
import type { LinkedDeviceRuntimeBinding } from "./linkedDeviceRuntime";
import type { WppConnectApprovalRejectionReason } from "./whatsappLinkedDeviceProvider";

export type SyntheticRecipientApprovalPayload = {
  v: number;
  recipientId: number;
  lineId: number;
  endpoint: string;
  session: string;
  exp: number;
};

function approvalSecret(runtime: LinkedDeviceRuntimeBinding | null) {
  const persistentWorkerEnabled = runtime?.mode === "persistent_worker"
    || process.env.WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED === "true";
  return persistentWorkerEnabled
    ? process.env.WHATSAPP_LINKED_DEVICE_RECIPIENT_APPROVAL_SECRET
    : process.env.JWT_SECRET;
}

function decodedPayload(value: string): SyntheticRecipientApprovalPayload | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    return Number.isInteger(parsed.v)
      && Number.isInteger(parsed.recipientId)
      && Number.isInteger(parsed.lineId)
      && typeof parsed.endpoint === "string"
      && typeof parsed.session === "string"
      && Number.isInteger(parsed.exp)
      ? parsed as SyntheticRecipientApprovalPayload
      : null;
  } catch {
    return null;
  }
}

export function validateSyntheticRecipientApproval(input: {
  approvalProof: unknown;
  recipientId: number;
  lineId: number;
  providerEndpointId: string;
  runtime: LinkedDeviceRuntimeBinding | null;
  nowSeconds?: number;
}): { ok: true } | { ok: false; reason: WppConnectApprovalRejectionReason } {
  const proof = typeof input.approvalProof === "string" ? input.approvalProof : "";
  if (!proof) return { ok: false, reason: "missing" };
  const [payloadEncoded, signature, ...extra] = proof.split(".");
  if (!payloadEncoded || !signature || extra.length || signature.length > 128) {
    return { ok: false, reason: "malformed" };
  }
  const payload = decodedPayload(payloadEncoded);
  if (!payload) return { ok: false, reason: "malformed" };
  if (payload.v !== 1) return { ok: false, reason: "unsupported_version" };
  const secret = approvalSecret(input.runtime);
  if (!secret) return { ok: false, reason: "other_safe_rejection" };
  const expected = createHmac("sha256", `fertiliv-wppconnect-synthetic-recipient-v1:${secret}`)
    .update(payloadEncoded)
    .digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return { ok: false, reason: "signature_mismatch" };
  }
  if (payload.exp <= (input.nowSeconds ?? Math.floor(Date.now() / 1000))) return { ok: false, reason: "expired" };
  if (payload.recipientId !== input.recipientId || payload.endpoint !== input.providerEndpointId) {
    return { ok: false, reason: "recipient_mismatch" };
  }
  if (payload.lineId !== input.lineId) return { ok: false, reason: "line_mismatch" };
  if (!input.runtime?.sessionName || payload.session !== input.runtime.sessionName) {
    return { ok: false, reason: "session_mismatch" };
  }
  return { ok: true };
}
