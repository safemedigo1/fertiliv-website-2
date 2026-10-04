import { createHash, createHmac, timingSafeEqual } from "crypto";

export type MetaWebhookChange = {
  wabaId: string | null;
  phoneNumberId: string | null;
  providerField: string;
  providerEventKey: string;
  value: Record<string, unknown>;
};

function safelyComparable(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyMetaWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | string[] | undefined,
  appSecret: string | undefined,
): boolean {
  if (!appSecret || !signatureHeader || Array.isArray(signatureHeader)) return false;
  if (!signatureHeader.startsWith("sha256=")) return false;
  const suppliedHex = signatureHeader.slice("sha256=".length);
  if (!/^[a-fA-F0-9]{64}$/.test(suppliedHex)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const supplied = Buffer.from(suppliedHex, "hex");
  return safelyComparable(expected, supplied);
}

export function verifyMetaWebhookChallenge(input: {
  mode: unknown;
  token: unknown;
  configuredToken: string | undefined;
}): boolean {
  if (input.mode !== "subscribe" || typeof input.token !== "string" || !input.configuredToken) return false;
  return safelyComparable(Buffer.from(input.token), Buffer.from(input.configuredToken));
}

function stableChangeKey(change: unknown): string {
  return createHash("sha256").update(JSON.stringify(change)).digest("hex");
}

/**
 * Extract only routing metadata. Message/media/status normalization is deferred
 * to WU-05 and later; this helper never resolves a person, patient, or MRN.
 */
export function extractMetaWebhookChanges(payload: unknown): MetaWebhookChange[] {
  const root = payload as any;
  if (root?.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return [];

  const extracted: MetaWebhookChange[] = [];
  for (const entry of root.entry) {
    const wabaId = typeof entry?.id === "string" ? entry.id : null;
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const phoneNumberId = typeof change?.value?.metadata?.phone_number_id === "string"
        ? change.value.metadata.phone_number_id
        : null;
      const providerField = typeof change?.field === "string" ? change.field : "unknown";
      const value = change?.value && typeof change.value === "object" && !Array.isArray(change.value)
        ? change.value as Record<string, unknown>
        : {};
      extracted.push({
        wabaId,
        phoneNumberId,
        providerField,
        value,
        providerEventKey: stableChangeKey({
          wabaId,
          phoneNumberId,
          providerField,
          value: change?.value ?? null,
        }),
      });
    }
  }
  return extracted;
}

export function parseMetaWebhookPayload(rawBody: Buffer): unknown | null {
  try {
    return JSON.parse(rawBody.toString("utf8"));
  } catch {
    return null;
  }
}
