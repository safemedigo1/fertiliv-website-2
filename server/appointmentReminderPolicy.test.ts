import { describe, expect, it } from "vitest";
import {
  APPOINTMENT_REMINDER_V1_OFFSETS,
  computeAppointmentReminderDueAt,
  hasAuthoritativeAppointmentScheduleChanged,
  isAppointmentReminderEligibleStatus,
  mayRestoreReminderAfterSameScheduleReactivation,
  nextReminderRetryAt,
  planAppointmentReminderDeliveries,
} from "../shared/appointmentReminderPolicy";

const now = new Date("2026-08-28T09:00:00.000Z");

describe("Appointment Reminder Foundation V1 fixed policy", () => {
  it("uses only the two approved offsets and eligible statuses", () => {
    expect(APPOINTMENT_REMINDER_V1_OFFSETS).toEqual([1440, 120]);
    expect(isAppointmentReminderEligibleStatus("upcoming")).toBe(true);
    expect(isAppointmentReminderEligibleStatus("confirmed")).toBe(true);
    expect(isAppointmentReminderEligibleStatus("rescheduled")).toBe(true);
    expect(isAppointmentReminderEligibleStatus("cancelled")).toBe(false);
    expect(isAppointmentReminderEligibleStatus("completed")).toBe(false);
    expect(isAppointmentReminderEligibleStatus("no_show")).toBe(false);
  });

  it("schedules both reminders when creation is more than 24 hours ahead", () => {
    const start = new Date(now.getTime() + 26 * 60 * 60_000);
    expect(planAppointmentReminderDeliveries({ appointmentStart: start, now, source: "creation" })).toEqual([
      { offsetMinutes: 1440, dueAt: computeAppointmentReminderDueAt(start, 1440), status: "scheduled" },
      { offsetMinutes: 120, dueAt: computeAppointmentReminderDueAt(start, 120), status: "scheduled" },
    ]);
  });

  it("records deterministic skipped history rather than catch-up when created 23 hours ahead", () => {
    const start = new Date(now.getTime() + 23 * 60 * 60_000);
    expect(planAppointmentReminderDeliveries({ appointmentStart: start, now, source: "creation" })).toMatchObject([
      { offsetMinutes: 1440, status: "skipped", skippedReason: "skipped_due_elapsed_at_creation" },
      { offsetMinutes: 120, status: "scheduled" },
    ]);
  });

  it("records both offsets as skipped when appointment start is under two hours away", () => {
    const start = new Date(now.getTime() + 60 * 60_000);
    expect(planAppointmentReminderDeliveries({ appointmentStart: start, now, source: "creation" })).toMatchObject([
      { offsetMinutes: 1440, status: "skipped", skippedReason: "skipped_due_elapsed_at_creation" },
      { offsetMinutes: 120, status: "skipped", skippedReason: "skipped_due_elapsed_at_creation" },
    ]);
  });

  it("records terminal non-future history without any provider-send plan", () => {
    const start = new Date(now.getTime() - 30 * 60_000);
    expect(planAppointmentReminderDeliveries({ appointmentStart: start, now, source: "reschedule" })).toMatchObject([
      { status: "skipped", skippedReason: "skipped_appointment_not_future" },
      { status: "skipped", skippedReason: "skipped_appointment_not_future" },
    ]);
  });

  it("increments schedule identity only for a real authoritative interval change", () => {
    const original = { appointmentDate: new Date("2026-09-05T10:00:00.000Z"), endDate: new Date("2026-09-05T10:30:00.000Z"), duration: 30 };
    expect(hasAuthoritativeAppointmentScheduleChanged(original, { ...original })).toBe(false);
    expect(hasAuthoritativeAppointmentScheduleChanged(original, { ...original, appointmentDate: new Date("2026-09-05T11:00:00.000Z") })).toBe(true);
    expect(hasAuthoritativeAppointmentScheduleChanged(original, { ...original, duration: 45 })).toBe(true);
  });

  it("restores only cancellation-invalidated, still-future unsent reminders on same-schedule reactivation", () => {
    const start = new Date(now.getTime() + 4 * 60 * 60_000);
    expect(mayRestoreReminderAfterSameScheduleReactivation({ status: "invalidated", invalidationReason: "cancelled", dueAt: new Date(now.getTime() + 2 * 60 * 60_000) }, start, now)).toBe(true);
    expect(mayRestoreReminderAfterSameScheduleReactivation({ status: "sent", invalidationReason: null, dueAt: new Date(now.getTime() + 2 * 60 * 60_000) }, start, now)).toBe(false);
    expect(mayRestoreReminderAfterSameScheduleReactivation({ status: "invalidated", invalidationReason: "cancelled", dueAt: new Date(now.getTime() - 1) }, start, now)).toBe(false);
  });

  it("uses bounded 5-minute then 15-minute retry timing and never retries at/after start", () => {
    const start = new Date(now.getTime() + 60 * 60_000);
    expect(nextReminderRetryAt(now, 1, start)).toEqual(new Date(now.getTime() + 5 * 60_000));
    expect(nextReminderRetryAt(now, 2, start)).toEqual(new Date(now.getTime() + 15 * 60_000));
    expect(nextReminderRetryAt(now, 3, start)).toBeNull();
    expect(nextReminderRetryAt(now, 1, new Date(now.getTime() + 3 * 60_000))).toBeNull();
  });
});
