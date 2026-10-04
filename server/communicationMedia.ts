import { and, eq, isNotNull, lt } from "drizzle-orm";
import {
  communicationMediaAccessAudits,
  communicationMediaAssets,
  whatsappConversations,
  whatsappLinkedDeviceLines,
} from "../drizzle/schema";
import { getDb, logAudit } from "./db";
import { canUserAccessLinkedDeviceLine } from "./whatsappLinkedDevice";
import { storageGetBytes } from "./storage";

export type MediaActor = { id: number; role: string; name?: string | null };

async function accessibleMediaAsset(mediaAssetId: number, actor: MediaActor) {
  const db = await getDb();
  if (!db) throw new Error("Media service is temporarily unavailable.");
  const [row] = await db.select({
    asset: communicationMediaAssets,
    lineId: whatsappLinkedDeviceLines.id,
  }).from(communicationMediaAssets)
    .innerJoin(whatsappConversations, eq(whatsappConversations.id, communicationMediaAssets.conversationId))
    .leftJoin(whatsappLinkedDeviceLines, eq(whatsappLinkedDeviceLines.connectionId, whatsappConversations.connectionId))
    .where(eq(communicationMediaAssets.id, mediaAssetId)).limit(1);
  if (!row || !row.lineId || !(await canUserAccessLinkedDeviceLine({ lineId: row.lineId, userId: actor.id, userRole: actor.role }))) {
    if (row) await db.insert(communicationMediaAccessAudits).values({ mediaAssetId, conversationId: row.asset.conversationId, actorId: actor.id, action: "denied" });
    throw new Error("You do not have access to this media.");
  }
  if (row.asset.accessState !== "available") throw new Error("This media is not available.");
  return { db, ...row };
}

export async function getAuthorizedMediaBytes(mediaAssetId: number, action: "open" | "download", actor: MediaActor) {
  const row = await accessibleMediaAsset(mediaAssetId, actor);
  const file = await storageGetBytes(row.asset.storageKey);
  await row.db.insert(communicationMediaAccessAudits).values({ mediaAssetId, conversationId: row.asset.conversationId, actorId: actor.id, action });
  await logAudit({
    userId: actor.id,
    userName: actor.name ?? null,
    userRole: actor.role,
    action: `communication_media_${action}`,
    category: "other",
    recordId: mediaAssetId,
    recordType: "communication_media_asset",
    page: "/inbox",
    description: `${action === "download" ? "Downloaded" : "Opened"} an authorized communication media asset through the application proxy.`,
  });
  return { asset: row.asset, data: file.data, contentType: row.asset.mimeType ?? file.contentType };
}

export async function requestAuthorizedMediaAccess(input: { conversationId: number; mediaAssetId: number; action: "open" | "download"; actor: MediaActor }) {
  const row = await accessibleMediaAsset(input.mediaAssetId, input.actor);
  if (row.asset.conversationId !== input.conversationId) throw new Error("The media does not belong to this conversation.");
  return {
    available: true,
    action: input.action,
    label: row.asset.filename || row.asset.mediaType,
    reason: null,
    endpoint: `/api/communications/media/${row.asset.id}?action=${input.action}`,
  };
}

export async function applyMediaRetention() {
  const db = await getDb();
  if (!db) return { expired: 0 };
  const now = new Date();
  const result = await db.update(communicationMediaAssets).set({ accessState: "deleted", updatedAt: now })
    .where(and(eq(communicationMediaAssets.accessState, "available"), isNotNull(communicationMediaAssets.retentionUntil), lt(communicationMediaAssets.retentionUntil, now)));
  return { expired: Number((result as any)[0]?.affectedRows ?? 0) };
}
