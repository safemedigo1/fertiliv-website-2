import { createHmac, timingSafeEqual } from "node:crypto";
import { createHash } from "node:crypto";
import type { Express, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { whatsappConnections, whatsappLinkedDeviceLines, whatsappLinkedDeviceSessions } from "../drizzle/schema";
import { getDb } from "./db";
import { ingestWppConnectSyntheticEvent } from "./whatsappLinkedDevice";
import type { WppConnectInboundSourceKind } from "./whatsappLinkedDeviceProvider";

const INGRESS_PATH = "/api/internal/wppconnect-sandbox-event";
const MAX_TEXT_LENGTH = 4096;
const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "sticker"]);
const SOURCE_KINDS = new Set<WppConnectInboundSourceKind>([
  "private_chat", "status", "broadcast", "group", "channel", "system", "unknown_non_private",
]);

function safeString(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max
    ? value.trim()
    : null;
}

function canonicalPayload(input: {
  lineId: number;
  sessionName: string;
  providerMessageId: string;
  providerIdentityId: string;
  senderEndpointId: string;
  lineProviderId: string;
  sourceKind: WppConnectInboundSourceKind;
  timestamp: number;
  text: string;
  mediaDigest: string;
  mediaType: string;
  mimeType: string;
  filename: string;
}) {
  return [
    input.lineId,
    input.sessionName,
    input.providerMessageId,
    input.providerIdentityId,
    input.senderEndpointId,
    input.lineProviderId,
    input.sourceKind,
    input.timestamp,
    input.text,
    input.mediaDigest,
    input.mediaType,
    input.mimeType,
    input.filename,
  ].join("\n");
}

function safeSourceKind(value: unknown): WppConnectInboundSourceKind | null {
  return typeof value === "string" && SOURCE_KINDS.has(value as WppConnectInboundSourceKind)
    ? value as WppConnectInboundSourceKind
    : null;
}

function hasKnownNonPrivateIndicator(values: Array<string | null>) {
  return values.some((value) => {
    const normalized = value?.toLowerCase() ?? "";
    return /(?:^|[^a-z])(?:false_)?status@broadcast(?:_|$)/i.test(normalized)
      || /@broadcast(?:$|[_:])/i.test(normalized)
      || /@g\.us$/i.test(normalized)
      || /@(newsletter|channel)$/i.test(normalized);
  });
}

function validSignature(body: Parameters<typeof canonicalPayload>[0], candidate: string | undefined) {
  // Phase 2A introduces a separate ingress secret for the future persistent
  // worker. Preserve the existing 8899 JWT contract until the separately
  // approved migration explicitly enables the persistent-worker boundary.
  const persistentWorkerEnabled = process.env.WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED === "true";
  const secret = persistentWorkerEnabled
    ? process.env.FERTILIV_WPPCONNECT_INGRESS_SECRET
    : process.env.JWT_SECRET;
  if (!secret || !candidate || candidate.length > 128) return false;
  const expected = createHmac("sha256", `fertiliv-wppconnect-sandbox-ingress-v1:${secret}`)
    .update(canonicalPayload(body))
    .digest("base64url");
  return candidate.length === expected.length
    && timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

/**
 * This is not a public provider webhook. It accepts only a signed localhost
 * event from the isolated 8899 synthetic harness. It never enables production
 * Linked Device ingress or creates business/clinical identities.
 */
export function registerWppConnectSandboxIngress(app: Express) {
  app.post(INGRESS_PATH, async (req: Request, res: Response) => {
    const body = req.body && typeof req.body === "object" ? req.body as Record<string, unknown> : null;
    const lineId = Number(body?.lineId);
    const sessionName = safeString(body?.sessionName, 128);
    const providerMessageId = safeString(body?.providerMessageId, 128);
    const providerIdentityId = safeString(body?.providerIdentityId, 128);
    const senderEndpointId = safeString(body?.senderEndpointId, 128);
    const lineProviderId = safeString(body?.lineProviderId, 128);
    const sourceKind = safeSourceKind(body?.sourceKind);
    const timestamp = Number(body?.timestamp);
    const text = safeString(body?.text, MAX_TEXT_LENGTH);
    if (!Number.isInteger(lineId) || lineId <= 0 || !sessionName
      || !providerMessageId || !providerIdentityId || !senderEndpointId || !lineProviderId
    || !Number.isFinite(timestamp) || timestamp <= 0 || (!text && typeof body?.mediaType !== "string")) {
      const mediaBase64 = typeof body?.mediaBase64 === "string" ? body.mediaBase64 : "";
      if ((!mediaBase64 && typeof body?.mediaType !== "string") || !Number.isInteger(lineId) || lineId <= 0 || !sessionName
        || !providerMessageId || !providerIdentityId || !senderEndpointId || !lineProviderId
        || !Number.isFinite(timestamp) || timestamp <= 0) {
        return res.status(400).json({ ok: false, error: "invalid_synthetic_event" });
      }
    }
    if (!sourceKind) return res.status(422).json({ ok: false, error: "source_classification_required" });
    if (sourceKind !== "private_chat") return res.status(422).json({ ok: false, error: "non_private_source_rejected" });
    if (hasKnownNonPrivateIndicator([providerMessageId, providerIdentityId, senderEndpointId])) {
      return res.status(422).json({ ok: false, error: "known_non_private_source_rejected" });
    }
    const mediaBase64 = typeof body?.mediaBase64 === "string" ? body.mediaBase64 : "";
    const mediaType = safeString(body?.mediaType, 32);
    const mimeType = safeString(body?.mimeType, 128);
    const filename = safeString(body?.filename, 256) ?? "attachment";
    const mediaDigest = safeString(body?.mediaDigest, 128) ?? (mediaBase64 ? createHash("sha256").update(Buffer.from(mediaBase64, "base64")).digest("hex") : "");
    if (mediaType && (!MEDIA_TYPES.has(mediaType) || !mimeType || !/^[\w.+-]+\/[\w.+-]+$/.test(mimeType))) {
      return res.status(400).json({ ok: false, error: "invalid_synthetic_media_metadata" });
    }
    if (mediaBase64) {
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(mediaBase64) || mediaBase64.length > Math.ceil(MAX_MEDIA_BYTES * 4 / 3) + 8
        || !mediaType || !MEDIA_TYPES.has(mediaType) || !mimeType || !/^[\w.+-]+\/[\w.+-]+$/.test(mimeType)
        || !/^[a-f0-9]{64}$/i.test(mediaDigest)
        || createHash("sha256").update(Buffer.from(mediaBase64, "base64")).digest("hex") !== mediaDigest) {
        return res.status(400).json({ ok: false, error: "invalid_synthetic_media" });
      }
    }
    const signed = {
      lineId,
      sessionName,
      providerMessageId,
      providerIdentityId,
      senderEndpointId,
      lineProviderId,
      sourceKind,
      timestamp,
      text: text || "",
      mediaDigest: mediaDigest || "",
      mediaType: mediaType || "",
      mimeType: mimeType || "",
      filename,
    };
    if (!validSignature(signed, req.header("x-fertiliv-sandbox-signature") ?? undefined)) {
      return res.status(401).json({ ok: false, error: "invalid_synthetic_signature" });
    }
    const db = await getDb();
    if (!db) return res.status(503).json({ ok: false, error: "storage_unavailable" });
    const [line] = await db.select({
      id: whatsappLinkedDeviceLines.id,
      createdById: whatsappLinkedDeviceLines.createdById,
      adapterKind: whatsappLinkedDeviceLines.adapterKind,
      lifecycleState: whatsappLinkedDeviceLines.lifecycleState,
      sessionName: whatsappLinkedDeviceSessions.sessionName,
      sessionState: whatsappLinkedDeviceSessions.state,
      providerPhoneNumberId: whatsappConnections.providerPhoneNumberId,
    })
      .from(whatsappLinkedDeviceLines)
      .leftJoin(whatsappLinkedDeviceSessions, eq(whatsappLinkedDeviceSessions.lineId, whatsappLinkedDeviceLines.id))
      .leftJoin(whatsappConnections, eq(whatsappConnections.id, whatsappLinkedDeviceLines.connectionId))
      .where(and(
        eq(whatsappLinkedDeviceLines.id, lineId),
        eq(whatsappLinkedDeviceLines.clinicScope, "fertiliv"),
      ))
      .limit(1);
    if (!line || line.adapterKind !== "wppconnect_in_app_sandbox" || line.lifecycleState === "disabled"
      || !line.sessionName || line.sessionName !== sessionName
      || !line.sessionState || ["logged_out", "failed", "session_invalid"].includes(line.sessionState)
      || (line.providerPhoneNumberId && line.providerPhoneNumberId !== lineProviderId)) {
      return res.status(403).json({ ok: false, error: "synthetic_line_not_allowed" });
    }
    try {
      const retained = await ingestWppConnectSyntheticEvent({
        lineId,
        actor: { id: line.createdById, name: "Synthetic test bridge", role: "admin" },
        event: {
          providerMessageId,
          providerIdentityId,
          senderEndpointId,
          lineProviderId,
          sourceKind,
          timestamp: new Date(timestamp * 1000),
          text: text || (mediaType ? `[${mediaType}]` : ""),
          ...(mediaType ? {
            syntheticMediaBase64: mediaBase64,
            media: {
              providerMediaId: safeString(body?.providerMediaId, 128),
              mediaType: mediaType as "image" | "audio" | "video" | "document" | "sticker",
              mimeType: mimeType ?? "application/octet-stream",
              filename,
              sha256: mediaDigest,
              caption: text || null,
            },
          } : {}),
          direction: "inbound",
          synthetic: true,
        },
      });
      return res.status(200).json({ ok: true, insertedEvents: retained.insertedEvents, duplicateEvents: retained.duplicateEvents });
    } catch (error) {
      // Do not expose provider payload, endpoint, or staff data to the harness.
      console.error("[wppconnect-sandbox-ingress] capture failed", {
        name: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message.slice(0, 240) : "unknown_error",
      });
      return res.status(503).json({ ok: false, error: "synthetic_event_capture_failed" });
    }
  });
}

export { INGRESS_PATH };
