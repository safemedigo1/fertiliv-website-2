import { and, eq } from "drizzle-orm";
import { notifications, users } from "../../drizzle/schema";
import { getDb } from "../db";

export type NotificationPayload = {
  title: string;
  content: string;
  /** Stable key so the same operational alert is stored once per admin. */
  dedupeKey?: string | null;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;
const STORED_TITLE_LENGTH = 256;

const trimValue = (value: string): string => value.trim();

function isUniqueViolation(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as { code?: string; errno?: number };
    if (record.code === "23505" || record.code === "ER_DUP_ENTRY" || record.errno === 1062) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function cleanDedupeKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.trim().slice(0, 255);
  return /^[A-Za-z0-9:_-]{1,255}$/.test(cleaned) ? cleaned : null;
}

function validatePayload(input: NotificationPayload): { title: string; content: string } | null {
  const title = typeof input.title === "string" ? trimValue(input.title) : "";
  const content = typeof input.content === "string" ? trimValue(input.content) : "";
  if (!title || !content) return null;
  if (title.length > TITLE_MAX_LENGTH || content.length > CONTENT_MAX_LENGTH) return null;
  const storedTitle = title.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, STORED_TITLE_LENGTH);
  const storedContent = content.replace(/\u0000/g, "").slice(0, CONTENT_MAX_LENGTH);
  if (!storedTitle || !storedContent) return null;
  return { title: storedTitle, content: storedContent };
}

/**
 * Stores one in-app notice for every active admin.
 * A database failure returns false and does not throw, so intake, cancellation,
 * and storage cleanup can finish even when the notice cannot be saved.
 * The notice text is not written to logs.
 */
export async function notifyOwner(payload: NotificationPayload): Promise<boolean> {
  const validated = validatePayload(payload);
  if (!validated) {
    console.warn("[Notification] Owner alert skipped; title or content is invalid.");
    return false;
  }
  const dedupeKey = cleanDedupeKey(payload.dedupeKey);

  try {
    const db = await getDb();
    if (!db) {
      console.warn("[Notification] Owner alert skipped; database is unavailable.");
      return false;
    }
    const admins = await db.select({ id: users.id }).from(users).where(and(
      eq(users.role, "admin"),
      eq(users.status, "active"),
      eq(users.isActive, true),
    ));
    if (admins.length === 0) {
      console.info("[Notification] Owner alert skipped; no active admin.");
      return true;
    }
    for (const admin of admins) {
      try {
        await db.insert(notifications).values({
          userId: admin.id,
          type: "general",
          title: validated.title,
          message: validated.content,
          dedupeKey,
        }).onConflictDoNothing({
          target: [notifications.userId, notifications.dedupeKey],
        });
      } catch (error) {
        // A duplicate key means this admin already has the alert.
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }
    console.info("[Notification] Owner alert stored", { admins: admins.length, deduped: Boolean(dedupeKey) });
    return true;
  } catch (error) {
    console.warn("[Notification] Owner alert failed", error instanceof Error ? error.name : "error");
    return false;
  }
}
