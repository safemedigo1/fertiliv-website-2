import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import {
  appointmentReminderDeliveries,
  appointmentReminderDeliveryAttempts,
  appointments,
} from "../drizzle/schema";
import {
  APPOINTMENT_REMINDER_V1_CHANNEL,
  APPOINTMENT_REMINDER_V1_TEMPLATE_KEY,
  APPOINTMENT_REMINDER_V1_TEMPLATE_VERSION,
  isAppointmentReminderEligibleStatus,
  mayRestoreReminderAfterSameScheduleReactivation,
  nextReminderRetryAt,
  planAppointmentReminderDeliveries,
  type ReminderReconciliationSource,
} from "../shared/appointmentReminderPolicy";
import { resolveAppointmentCommunicationLocale } from "../shared/appointmentCommunicationLocales";
import { buildAppointmentCommunicationProjection } from "../shared/appointmentCommunication";
import { getAppointmentById, getAppointmentCommunicationContext, getDb, logAppointmentActivity, logAudit } from "./db";
import { sendAppointmentReminderEmail } from "./emailService";

const ACTIVE_PROCESSING_STATUSES = ["scheduled", "retry_pending", "claimed", "dispatching"] as const;
const CLAIM_LEASE_MS = 2 * 60_000;
const PROCESS_BATCH_SIZE = 20;

type DeliveryStatus = "scheduled" | "claimed" | "dispatching" | "retry_pending" | "sent" | "failed" | "skipped" | "invalidated";

function primaryRecipientIdentity(appointment: { patientId?: number | null; leadId?: number | null }) {
  if (appointment.patientId) return { recipientKey: `patient:${appointment.patientId}`, recipientType: "patient" as const };
  if (appointment.leadId) return { recipientKey: `lead:${appointment.leadId}`, recipientType: "lead" as const };
  return null;
}

function deliveryIdFrom(result: unknown): number {
  return Number((result as any)?.[0]?.insertId ?? (result as any)?.insertId ?? 0);
}

function retryableFailure(classification?: string | null): boolean {
  return classification !== "recipient_rejected" && classification !== "invalid_idempotent_request";
}

function offsetLabel(offsetMinutes: number): string {
  return offsetMinutes === 1440 ? "24-hour" : "2-hour";
}

async function logReminderLifecycle(appointmentId: number, action: string, detail: string) {
  await logAppointmentActivity(appointmentId, 0, action, undefined, detail);
  await logAudit({
    action,
    category: "appointment",
    description: `Appointment ${appointmentId}: ${detail}`,
    recordId: appointmentId,
    recordType: "appointment",
  });
}

/**
 * Creates immutable reminder rows only for a newly authoritative appointment
 * schedule revision. Existing business identity rows are never overwritten.
 */
export async function reconcileAppointmentReminderSchedule(input: {
  appointmentId: number;
  source: Exclude<ReminderReconciliationSource, "reactivation">;
  now?: Date;
}) {
  const db = await getDb();
  const appointment = await getAppointmentById(input.appointmentId);
  if (!db || !appointment) return { created: 0, invalidated: 0, skipped: 0 };
  const now = input.now ?? new Date();
  if (!isAppointmentReminderEligibleStatus(appointment.status)) {
    const invalidated = await invalidateAppointmentReminderDeliveries(input.appointmentId, `status_${appointment.status}`, now);
    return { created: 0, invalidated, skipped: 0 };
  }
  const recipient = primaryRecipientIdentity(appointment);
  if (!recipient) return { created: 0, invalidated: 0, skipped: 0 };
  const plans = planAppointmentReminderDeliveries({ appointmentStart: appointment.appointmentDate, now, source: input.source });
  let created = 0;
  let skipped = 0;
  for (const plan of plans) {
    const result = await db.insert(appointmentReminderDeliveries).values({
      deliveryKey: crypto.randomUUID(),
      appointmentId: appointment.id,
      recipientKey: recipient.recipientKey,
      recipientType: recipient.recipientType,
      channel: APPOINTMENT_REMINDER_V1_CHANNEL,
      scheduleRevision: appointment.appointmentScheduleRevision,
      offsetMinutes: plan.offsetMinutes,
      dueAt: plan.dueAt,
      status: plan.status,
      nextAttemptAt: plan.status === "scheduled" ? plan.dueAt : null,
      skippedReason: plan.skippedReason ?? null,
      templateKey: APPOINTMENT_REMINDER_V1_TEMPLATE_KEY,
      templateVersion: APPOINTMENT_REMINDER_V1_TEMPLATE_VERSION,
    } as any).onConflictDoUpdate({ target: [appointmentReminderDeliveries.appointmentId, appointmentReminderDeliveries.recipientKey, appointmentReminderDeliveries.channel, appointmentReminderDeliveries.offsetMinutes, appointmentReminderDeliveries.scheduleRevision], set: { updatedAt: new Date() } });
    if (deliveryIdFrom(result) > 0) {
      if (plan.status === "scheduled") created += 1;
      else skipped += 1;
    }
  }
  return { created, invalidated: 0, skipped };
}

/** Idempotently prevents all still-unsent reminder work for an appointment. */
export async function invalidateAppointmentReminderDeliveries(appointmentId: number, reason: string, now = new Date()) {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.update(appointmentReminderDeliveries).set({
    status: "invalidated",
    invalidatedAt: now,
    invalidationReason: reason.slice(0, 64),
    nextAttemptAt: null,
    claimToken: null,
    claimExpiresAt: null,
    updatedAt: now,
  } as any).where(and(
    eq(appointmentReminderDeliveries.appointmentId, appointmentId),
    inArray(appointmentReminderDeliveries.status, [...ACTIVE_PROCESSING_STATUSES] as DeliveryStatus[]),
  ));
  const invalidated = Number((result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0);
  if (invalidated > 0) await logReminderLifecycle(appointmentId, "appointment_reminders_invalidated", `Unsent reminders invalidated: ${reason.slice(0, 64)}.`);
  return invalidated;
}

/** Re-activation with unchanged timing restores only cancellation-invalidated rows whose due time remains future. */
export async function restoreCancelledAppointmentReminders(appointmentId: number, now = new Date()) {
  const db = await getDb();
  const appointment = await getAppointmentById(appointmentId);
  if (!db || !appointment || !isAppointmentReminderEligibleStatus(appointment.status)) return 0;
  const rows = await db.select().from(appointmentReminderDeliveries).where(and(
    eq(appointmentReminderDeliveries.appointmentId, appointmentId),
    eq(appointmentReminderDeliveries.scheduleRevision, appointment.appointmentScheduleRevision),
    eq(appointmentReminderDeliveries.status, "invalidated"),
    eq(appointmentReminderDeliveries.invalidationReason, "cancelled"),
  ));
  let restored = 0;
  for (const row of rows) {
    if (!mayRestoreReminderAfterSameScheduleReactivation(row, appointment.appointmentDate, now)) continue;
    const result = await db.update(appointmentReminderDeliveries).set({
      status: "scheduled",
      invalidatedAt: null,
      invalidationReason: null,
      nextAttemptAt: row.dueAt,
      updatedAt: now,
    } as any).where(and(eq(appointmentReminderDeliveries.id, row.id), eq(appointmentReminderDeliveries.status, "invalidated")));
    restored += Number((result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0);
  }
  return restored;
}

export async function reconcileAppointmentReminderCurrentState(appointmentId: number, now = new Date()) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment || !isAppointmentReminderEligibleStatus(appointment.status)) {
    return { created: 0, invalidated: await invalidateAppointmentReminderDeliveries(appointmentId, appointment ? `status_${appointment.status}` : "appointment_deleted", now), skipped: 0 };
  }
  return reconcileAppointmentReminderSchedule({ appointmentId, source: "creation", now });
}

async function appendReminderAttempt(input: {
  reminderDeliveryId: number;
  attemptNumber: number;
  idempotencyKey: string;
  outcome: "sent" | "retryable_failure" | "permanent_failure" | "skipped_recipient_unavailable" | "invalidated_before_send";
  recipientEmail?: string | null;
  profileLanguage?: string | null;
  deliveredLanguage?: string | null;
  localeFallbackUsed?: boolean;
  providerMessageId?: string | null;
  failureClassification?: string | null;
  failureCode?: string | null;
  completedAt?: Date;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(appointmentReminderDeliveryAttempts).values({
    ...input,
    localeFallbackUsed: input.localeFallbackUsed ?? false,
    completedAt: input.completedAt ?? new Date(),
  } as any).onConflictDoUpdate({ target: [appointmentReminderDeliveryAttempts.reminderDeliveryId, appointmentReminderDeliveryAttempts.attemptNumber], set: { completedAt: input.completedAt ?? new Date() } });
}

async function invalidateClaimedBeforeSend(delivery: any, reason: string, now: Date, attemptNumber: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(appointmentReminderDeliveries).set({
    status: "invalidated",
    invalidatedAt: now,
    invalidationReason: reason.slice(0, 64),
    nextAttemptAt: null,
    claimToken: null,
    claimExpiresAt: null,
    updatedAt: now,
  } as any).where(and(eq(appointmentReminderDeliveries.id, delivery.id), inArray(appointmentReminderDeliveries.status, ["claimed", "dispatching"] as DeliveryStatus[])));
  await appendReminderAttempt({
    reminderDeliveryId: delivery.id,
    attemptNumber,
    idempotencyKey: `appointment-reminder/v1/${delivery.deliveryKey}`,
    outcome: "invalidated_before_send",
    failureClassification: "appointment_ineligible",
    failureCode: reason,
    completedAt: now,
  });
}

async function processClaimedReminder(delivery: any, claimToken: string, now: Date) {
  const db = await getDb();
  if (!db) return "failed" as const;
  const appointment = await getAppointmentById(delivery.appointmentId);
  const attemptNumber = Number(delivery.attemptCount ?? 0) + 1;
  if (!appointment || !isAppointmentReminderEligibleStatus(appointment.status) || appointment.appointmentScheduleRevision !== delivery.scheduleRevision || appointment.appointmentDate.getTime() <= now.getTime()) {
    await invalidateClaimedBeforeSend(delivery, !appointment ? "appointment_deleted" : "appointment_ineligible", now, attemptNumber);
    return "invalidated" as const;
  }
  const identity = primaryRecipientIdentity(appointment);
  if (!identity || identity.recipientKey !== delivery.recipientKey) {
    await invalidateClaimedBeforeSend(delivery, "primary_recipient_changed", now, attemptNumber);
    return "invalidated" as const;
  }
  const context = await getAppointmentCommunicationContext(delivery.appointmentId);
  const primary = context?.primaryRecipient;
  if (!context || !primary?.email?.trim()) {
    await db.update(appointmentReminderDeliveries).set({
      status: "skipped",
      skippedReason: "primary_email_unavailable",
      failedAt: now,
      attemptCount: attemptNumber,
      claimToken: null,
      claimExpiresAt: null,
      updatedAt: now,
    } as any).where(and(eq(appointmentReminderDeliveries.id, delivery.id), eq(appointmentReminderDeliveries.status, "claimed"), eq(appointmentReminderDeliveries.claimToken, claimToken)));
    await appendReminderAttempt({ reminderDeliveryId: delivery.id, attemptNumber, idempotencyKey: `appointment-reminder/v1/${delivery.deliveryKey}`, outcome: "skipped_recipient_unavailable", failureClassification: "recipient_unavailable", failureCode: "primary_email_unavailable", completedAt: now });
    await logReminderLifecycle(delivery.appointmentId, `appointment_reminder_${offsetLabel(delivery.offsetMinutes)}_skipped`, "Primary recipient email unavailable.");
    return "skipped" as const;
  }
  const locale = resolveAppointmentCommunicationLocale(primary.preferredLanguage);
  const projection = buildAppointmentCommunicationProjection({
    recipientName: primary.displayName,
    appointment: context.appointment,
    partnerClinic: context.partnerClinic,
    clinic: context.clinic,
  }, locale.deliveredLocale);
  const dispatch = await db.update(appointmentReminderDeliveries).set({
    status: "dispatching",
    dispatchingAt: now,
    attemptCount: attemptNumber,
    recipientEmail: primary.email.trim(),
    profileLanguage: primary.preferredLanguage,
    deliveredLanguage: locale.deliveredLocale,
    localeFallbackUsed: locale.fallbackUsed,
    claimExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS),
    updatedAt: now,
  } as any).where(and(eq(appointmentReminderDeliveries.id, delivery.id), eq(appointmentReminderDeliveries.status, "claimed"), eq(appointmentReminderDeliveries.claimToken, claimToken)));
  if (Number((dispatch as any)?.[0]?.affectedRows ?? (dispatch as any)?.affectedRows ?? 0) !== 1) return "invalidated" as const;
  const sent = await sendAppointmentReminderEmail(primary.email.trim(), projection, locale.deliveredLocale, delivery.offsetMinutes, `appointment-reminder/v1/${delivery.deliveryKey}`);
  const completedAt = new Date();
  if (sent.sent) {
    const result = await db.update(appointmentReminderDeliveries).set({ status: "sent", sentAt: completedAt, providerMessageId: sent.providerMessageId ?? null, claimToken: null, claimExpiresAt: null, updatedAt: completedAt } as any)
      .where(and(eq(appointmentReminderDeliveries.id, delivery.id), eq(appointmentReminderDeliveries.status, "dispatching"), eq(appointmentReminderDeliveries.claimToken, claimToken)));
    await appendReminderAttempt({ reminderDeliveryId: delivery.id, attemptNumber, idempotencyKey: `appointment-reminder/v1/${delivery.deliveryKey}`, outcome: "sent", recipientEmail: primary.email.trim(), profileLanguage: primary.preferredLanguage, deliveredLanguage: locale.deliveredLocale, localeFallbackUsed: locale.fallbackUsed, providerMessageId: sent.providerMessageId ?? null, completedAt });
    if (Number((result as any)?.[0]?.affectedRows ?? (result as any)?.affectedRows ?? 0) === 1) {
      await logReminderLifecycle(delivery.appointmentId, `appointment_reminder_${offsetLabel(delivery.offsetMinutes)}_sent`, `Reminder sent in ${locale.deliveredLocale}.`);
      return "sent" as const;
    }
    return "invalidated" as const;
  }
  const retryAt = retryableFailure(sent.failureClassification) ? nextReminderRetryAt(completedAt, attemptNumber, appointment.appointmentDate) : null;
  const terminal = retryAt ? "retry_pending" : "failed";
  await db.update(appointmentReminderDeliveries).set({
    status: terminal,
    nextAttemptAt: retryAt,
    failedAt: retryAt ? null : completedAt,
    lastFailureClassification: sent.failureClassification ?? "provider_error",
    lastFailureCode: sent.failureCode ?? "provider_delivery_error",
    claimToken: null,
    claimExpiresAt: null,
    updatedAt: completedAt,
  } as any).where(and(eq(appointmentReminderDeliveries.id, delivery.id), eq(appointmentReminderDeliveries.status, "dispatching"), eq(appointmentReminderDeliveries.claimToken, claimToken)));
  await appendReminderAttempt({ reminderDeliveryId: delivery.id, attemptNumber, idempotencyKey: `appointment-reminder/v1/${delivery.deliveryKey}`, outcome: retryAt ? "retryable_failure" : "permanent_failure", recipientEmail: primary.email.trim(), profileLanguage: primary.preferredLanguage, deliveredLanguage: locale.deliveredLocale, localeFallbackUsed: locale.fallbackUsed, failureClassification: sent.failureClassification ?? "provider_error", failureCode: sent.failureCode ?? "provider_delivery_error", completedAt });
  await logReminderLifecycle(delivery.appointmentId, `appointment_reminder_${offsetLabel(delivery.offsetMinutes)}_${retryAt ? "retry_pending" : "failed"}`, retryAt ? "Reminder delivery retry pending." : "Reminder delivery failed.");
  return terminal;
}

/** Scheduler-only processor entry point. It is inert until a managed callback invokes it. */
export async function processDueAppointmentReminders(input: { now?: Date; deliveryId?: number } = {}) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const now = input.now ?? new Date();
  const deliveryScope = input.deliveryId ? eq(appointmentReminderDeliveries.id, input.deliveryId) : undefined;
  const reclaimableAt = new Date(now.getTime() - 1);
  await db.update(appointmentReminderDeliveries).set({ status: "retry_pending", nextAttemptAt: now, claimToken: null, claimExpiresAt: null, updatedAt: now } as any)
    .where(and(
      inArray(appointmentReminderDeliveries.status, ["claimed", "dispatching"] as DeliveryStatus[]),
      lte(appointmentReminderDeliveries.claimExpiresAt, reclaimableAt),
      ...(deliveryScope ? [deliveryScope] : []),
    ));
  const due = await db.select().from(appointmentReminderDeliveries).where(and(
    inArray(appointmentReminderDeliveries.status, ["scheduled", "retry_pending"] as DeliveryStatus[]),
    lte(appointmentReminderDeliveries.nextAttemptAt, now),
    lte(appointmentReminderDeliveries.dueAt, now),
    ...(deliveryScope ? [deliveryScope] : []),
  )).orderBy(asc(appointmentReminderDeliveries.dueAt), asc(appointmentReminderDeliveries.id)).limit(PROCESS_BATCH_SIZE);
  const counts = { claimed: 0, sent: 0, retryPending: 0, skipped: 0, invalidated: 0, failed: 0 };
  for (const delivery of due) {
    const claimToken = crypto.randomUUID();
    const claim = await db.update(appointmentReminderDeliveries).set({ status: "claimed", claimedAt: now, claimToken, claimExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS), updatedAt: now } as any)
      .where(and(eq(appointmentReminderDeliveries.id, delivery.id), inArray(appointmentReminderDeliveries.status, ["scheduled", "retry_pending"] as DeliveryStatus[]), lte(appointmentReminderDeliveries.nextAttemptAt, now)));
    if (Number((claim as any)?.[0]?.affectedRows ?? (claim as any)?.affectedRows ?? 0) !== 1) continue;
    counts.claimed += 1;
    const outcome = await processClaimedReminder(delivery, claimToken, now);
    if (outcome === "sent") counts.sent += 1;
    else if (outcome === "retry_pending") counts.retryPending += 1;
    else if (outcome === "skipped") counts.skipped += 1;
    else if (outcome === "invalidated") counts.invalidated += 1;
    else counts.failed += 1;
  }
  return counts;
}

export async function getAppointmentReminderHistory(appointmentId: number) {
  const db = await getDb();
  if (!db) return [];
  const deliveries = await db.select().from(appointmentReminderDeliveries)
    .where(eq(appointmentReminderDeliveries.appointmentId, appointmentId))
    .orderBy(asc(appointmentReminderDeliveries.scheduleRevision), asc(appointmentReminderDeliveries.offsetMinutes));
  const attempts = deliveries.length === 0 ? [] : await db.select().from(appointmentReminderDeliveryAttempts)
    .where(inArray(appointmentReminderDeliveryAttempts.reminderDeliveryId, deliveries.map(delivery => delivery.id)))
    .orderBy(asc(appointmentReminderDeliveryAttempts.reminderDeliveryId), asc(appointmentReminderDeliveryAttempts.attemptNumber));
  return deliveries.map(delivery => ({
    ...delivery,
    attempts: attempts.filter(attempt => attempt.reminderDeliveryId === delivery.id).map(attempt => ({
      attemptNumber: attempt.attemptNumber,
      outcome: attempt.outcome,
      attemptedAt: attempt.attemptedAt,
      completedAt: attempt.completedAt,
      deliveredLanguage: attempt.deliveredLanguage,
      localeFallbackUsed: attempt.localeFallbackUsed,
      providerMessageId: attempt.providerMessageId,
      failureClassification: attempt.failureClassification,
      failureCode: attempt.failureCode,
    })),
  }));
}
