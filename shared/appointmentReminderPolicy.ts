export const APPOINTMENT_REMINDER_V1_CHANNEL = "email" as const;
export const APPOINTMENT_REMINDER_V1_TEMPLATE_KEY = "appointment_reminder_v1" as const;
export const APPOINTMENT_REMINDER_V1_TEMPLATE_VERSION = "v1" as const;
export const APPOINTMENT_REMINDER_V1_OFFSETS = [1440, 120] as const;
export const APPOINTMENT_REMINDER_V1_MAX_PROVIDER_ATTEMPTS = 3;
export const APPOINTMENT_REMINDER_V1_RETRY_DELAYS_MINUTES = [5, 15] as const;

export type AppointmentReminderOffsetMinutes = (typeof APPOINTMENT_REMINDER_V1_OFFSETS)[number];
export type AppointmentReminderEligibleStatus = "upcoming" | "confirmed" | "rescheduled";
export type ReminderReconciliationSource = "creation" | "reschedule" | "reactivation";
export type ReminderSkippedReason =
  | "skipped_due_elapsed_at_creation"
  | "skipped_due_elapsed_at_reschedule"
  | "skipped_due_elapsed_at_reactivation"
  | "skipped_appointment_not_future";

export type ReminderPlan = {
  offsetMinutes: AppointmentReminderOffsetMinutes;
  dueAt: Date;
  status: "scheduled" | "skipped";
  skippedReason?: ReminderSkippedReason;
};

export type ReactivationCandidate = {
  status: string;
  invalidationReason?: string | null;
  dueAt: Date;
};

const ELIGIBLE_STATUSES = new Set<AppointmentReminderEligibleStatus>([
  "upcoming",
  "confirmed",
  "rescheduled",
]);

export function isAppointmentReminderEligibleStatus(
  status?: string | null,
): status is AppointmentReminderEligibleStatus {
  return Boolean(status && ELIGIBLE_STATUSES.has(status as AppointmentReminderEligibleStatus));
}

export function computeAppointmentReminderDueAt(
  appointmentStart: Date,
  offsetMinutes: AppointmentReminderOffsetMinutes,
): Date {
  return new Date(appointmentStart.getTime() - offsetMinutes * 60_000);
}

export function hasAuthoritativeAppointmentScheduleChanged(
  existing: { appointmentDate: Date; endDate?: Date | null; duration?: number | null },
  proposed: { appointmentDate: Date; endDate?: Date | null; duration?: number | null },
): boolean {
  const existingEnd = existing.endDate?.getTime() ?? null;
  const proposedEnd = proposed.endDate?.getTime() ?? null;
  return existing.appointmentDate.getTime() !== proposed.appointmentDate.getTime()
    || existingEnd !== proposedEnd
    || Number(existing.duration ?? 30) !== Number(proposed.duration ?? 30);
}

function elapsedReasonFor(source: ReminderReconciliationSource): ReminderSkippedReason {
  if (source === "creation") return "skipped_due_elapsed_at_creation";
  if (source === "reschedule") return "skipped_due_elapsed_at_reschedule";
  return "skipped_due_elapsed_at_reactivation";
}

/**
 * Reconciles both fixed V1 offsets every time an eligible schedule becomes
 * authoritative. Elapsed reminders remain visible as terminal history; they
 * are never sent retrospectively.
 */
export function planAppointmentReminderDeliveries(input: {
  appointmentStart: Date;
  now: Date;
  source: ReminderReconciliationSource;
}): ReminderPlan[] {
  const appointmentIsFuture = input.appointmentStart.getTime() > input.now.getTime();
  return APPOINTMENT_REMINDER_V1_OFFSETS.map(offsetMinutes => {
    const dueAt = computeAppointmentReminderDueAt(input.appointmentStart, offsetMinutes);
    if (!appointmentIsFuture) {
      return { offsetMinutes, dueAt, status: "skipped", skippedReason: "skipped_appointment_not_future" };
    }
    if (dueAt.getTime() <= input.now.getTime()) {
      return { offsetMinutes, dueAt, status: "skipped", skippedReason: elapsedReasonFor(input.source) };
    }
    return { offsetMinutes, dueAt, status: "scheduled" };
  });
}

/**
 * Re-activation never creates a new schedule revision just to resend a
 * reminder. Only cancellation-invalidated, still-future unsent rows may be
 * restored. Sent and elapsed/skipped history remains terminal.
 */
export function mayRestoreReminderAfterSameScheduleReactivation(
  delivery: ReactivationCandidate,
  appointmentStart: Date,
  now: Date,
): boolean {
  return delivery.status === "invalidated"
    && delivery.invalidationReason === "cancelled"
    && appointmentStart.getTime() > now.getTime()
    && delivery.dueAt.getTime() > now.getTime();
}

export function nextReminderRetryAt(
  now: Date,
  attemptCountAfterFailure: number,
  appointmentStart: Date,
): Date | null {
  if (attemptCountAfterFailure >= APPOINTMENT_REMINDER_V1_MAX_PROVIDER_ATTEMPTS) return null;
  const retryDelay = APPOINTMENT_REMINDER_V1_RETRY_DELAYS_MINUTES[attemptCountAfterFailure - 1];
  if (!retryDelay) return null;
  const retryAt = new Date(now.getTime() + retryDelay * 60_000);
  return retryAt.getTime() < appointmentStart.getTime() ? retryAt : null;
}
