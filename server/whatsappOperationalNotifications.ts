import { and, eq, inArray } from "drizzle-orm";
import {
  notifications,
  users,
  whatsappConversationAssignments,
  whatsappInboxNotificationPreferences,
  whatsappLinkedDeviceLineStaff,
} from "../drizzle/schema";
import { getDb } from "./db";

export type InboxNotificationKind = "new_conversation" | "new_message" | "assignment" | "reassignment" | "crm_review" | "line_health";

const typeByKind = {
  new_conversation: "inbox_new_conversation",
  new_message: "inbox_new_message",
  assignment: "inbox_assignment",
  reassignment: "inbox_reassignment",
  crm_review: "inbox_crm_review",
  line_health: "whatsapp_line_health",
} as const;

type NotificationPreferenceRow = {
  notifyNewConversation: boolean;
  notifyNewMessage: boolean;
  notifyAssignment: boolean;
  notifyHealth: boolean;
};

function preferenceAllows(kind: InboxNotificationKind, preference: NotificationPreferenceRow | undefined) {
  if (!preference) return true;
  if (kind === "new_conversation") return preference.notifyNewConversation;
  if (kind === "new_message" || kind === "crm_review") return preference.notifyNewMessage;
  if (kind === "assignment" || kind === "reassignment") return preference.notifyAssignment;
  return preference.notifyHealth;
}

async function lineRecipients(lineId: number, conversationId: number | null) {
  const db = await getDb();
  if (!db) return [] as number[];
  const assigned = conversationId ? await db.select({ userId: whatsappConversationAssignments.assignedUserId })
    .from(whatsappConversationAssignments)
    .where(eq(whatsappConversationAssignments.conversationId, conversationId))
    .limit(1) : [];
  if (assigned[0]?.userId) return [assigned[0].userId];
  const staff = await db.select({ userId: whatsappLinkedDeviceLineStaff.userId })
    .from(whatsappLinkedDeviceLineStaff)
    .where(eq(whatsappLinkedDeviceLineStaff.lineId, lineId));
  const admins = await db.select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ["admin", "manager"]), eq(users.status, "active")));
  return Array.from(new Set([...staff.map((row) => row.userId), ...admins.map((row) => row.id)]));
}

export async function emitInboxNotification(input: {
  lineId: number;
  conversationId: number | null;
  kind: InboxNotificationKind;
  title: string;
  message: string;
  dedupeKey: string;
  recipientUserIds?: number[];
}) {
  const db = await getDb();
  if (!db) return { delivered: 0 };
  const candidateIds = input.recipientUserIds?.length
    ? Array.from(new Set(input.recipientUserIds))
    : await lineRecipients(input.lineId, input.conversationId);
  if (!candidateIds.length) return { delivered: 0 };
  const preferences = await db.select().from(whatsappInboxNotificationPreferences)
    .where(inArray(whatsappInboxNotificationPreferences.userId, candidateIds));
  const byUser = new Map(preferences.map((row) => [row.userId, row]));
  let delivered = 0;
  for (const userId of candidateIds) {
    if (!preferenceAllows(input.kind, byUser.get(userId))) continue;
    await db.insert(notifications).values({
      userId,
      type: typeByKind[input.kind],
      title: input.title.slice(0, 256),
      message: input.message.slice(0, 1024),
      relatedId: input.conversationId,
      relatedType: input.conversationId ? "whatsapp_conversation" : "whatsapp_line",
      dedupeKey: `${input.kind}:${input.dedupeKey}`.slice(0, 255),
    }).onConflictDoUpdate({ target: [notifications.userId, notifications.dedupeKey], set: { createdAt: new Date(), isRead: false, title: input.title.slice(0, 256), message: input.message.slice(0, 1024) } });
    delivered += 1;
  }
  return { delivered };
}

export async function getInboxNotificationPreferences(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Notifications are temporarily unavailable.");
  const [preference] = await db.select().from(whatsappInboxNotificationPreferences)
    .where(eq(whatsappInboxNotificationPreferences.userId, userId)).limit(1);
  if (preference) return preference;
  await db.insert(whatsappInboxNotificationPreferences).values({ userId });
  const [created] = await db.select().from(whatsappInboxNotificationPreferences)
    .where(eq(whatsappInboxNotificationPreferences.userId, userId)).limit(1);
  return created!;
}

export async function updateInboxNotificationPreferences(userId: number, input: NotificationPreferenceRow) {
  const db = await getDb();
  if (!db) throw new Error("Notifications are temporarily unavailable.");
  await db.insert(whatsappInboxNotificationPreferences).values({ userId, ...input })
    .onConflictDoUpdate({ target: whatsappInboxNotificationPreferences.userId, set: { ...input, updatedAt: new Date() } });
  return getInboxNotificationPreferences(userId);
}
