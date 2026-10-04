import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Appointment Reminder Foundation V1 integration boundaries", () => {
  const schema = read("drizzle/schema.ts");
  const router = read("server/routers.ts");
  const service = read("server/appointmentReminderService.ts");
  const worker = read("server/reminderWorker.ts");
  const email = read("server/emailService.ts");
  const calendar = read("client/src/pages/CalendarPage.tsx");

  it("uses an additive dedicated delivery and append-only attempt model, not the legacy Boolean", () => {
    expect(schema).toContain('appointmentScheduleRevision: integer("appointmentScheduleRevision").default(1).notNull()');
    expect(schema).toContain('pgTable("appointment_reminder_deliveries"');
    expect(schema).toContain('pgTable("appointment_reminder_delivery_attempts"');
    expect(schema).toContain("appointment_reminder_deliveries_business_identity_uq");
    expect(service).not.toContain("reminderSent");
  });

  it("reconciles new schedules, time changes, cancellation, reactivation, no-show, and bulk rescheduling", () => {
    expect(router).toContain('reconcileAppointmentReminderSchedule({ appointmentId, source: "creation" })');
    expect(router).toContain("hasAuthoritativeAppointmentScheduleChanged(existing");
    expect(router).toContain('invalidateAppointmentReminderDeliveries(input.id, "rescheduled")');
    expect(router).toContain('restoreCancelledAppointmentReminders(input.id)');
    expect(router).toContain('invalidateAppointmentReminderDeliveries(input.id, "status_no_show")');
    expect(router).toContain('invalidateAppointmentReminderDeliveries(action.appointmentId, "cancelled")');
    expect(router).toContain('reconcileAppointmentReminderSchedule({ appointmentId: action.appointmentId, source: "reschedule" })');
    expect(router).toContain('reconcileAppointmentReminderSchedule({ appointmentId: input.appointmentId, source: "reschedule" })');
  });

  it("increments revision only at real authoritative time-change boundaries", () => {
    expect(router).toContain("if (scheduleChanged) appointmentUpdate.appointmentScheduleRevision");
    expect(router).toContain("if (action.newDate && action.newDate.getTime() !== existing.appointmentDate.getTime())");
    expect(read("server/db.ts")).toContain("appointmentScheduleRevision: Number(appointment.appointmentScheduleRevision ?? 1) + 1");
  });

  it("runs through a portable worker rather than a Manus scheduler route or task UID runtime", () => {
    expect(schema).not.toContain('pgTable("appointment_reminder_runtime"');
    expect(service).not.toContain("getAppointmentReminderSchedulerTaskUid");
    expect(read("server/_core/index.ts")).not.toContain("processAppointmentReminders");
    expect(fs.existsSync(path.join(root, "server/scheduledAppointmentReminders.ts"))).toBe(false);
    expect(worker).toContain("processDueAppointmentReminders");
    expect(worker).toContain("createReminderWorkerLoop");
    expect(worker).toContain("--once requires an exact positive --delivery-id");
    expect(service).not.toContain("setInterval(");
    expect(service).not.toContain("node-cron");
  });

  it("uses bounded conditional claims, final live revalidation, and one stable provider idempotency key", () => {
    expect(service).toContain('const CLAIM_LEASE_MS = 2 * 60_000');
    expect(service).toContain('claimToken = crypto.randomUUID()');
    expect(service).toContain('eq(appointmentReminderDeliveries.status, "claimed")');
    expect(service).toContain("appointment.appointmentScheduleRevision !== delivery.scheduleRevision");
    expect(service).toContain('`appointment-reminder/v1/${delivery.deliveryKey}`');
    expect(service).toContain("nextReminderRetryAt");
    expect(service).toContain("const deliveryScope = input.deliveryId");
    expect(service).toContain("...(deliveryScope ? [deliveryScope] : [])");
  });

  it("keeps automated delivery primary-recipient-only, localised, and free of LLM/Google behavior", () => {
    expect(service).toContain("const primary = context?.primaryRecipient");
    expect(service).not.toContain("partnerRecipient");
    expect(service).not.toContain("runGoogleCalendar");
    expect(email).toContain("export async function sendAppointmentReminderEmail");
    const sender = email.slice(email.indexOf("export async function sendAppointmentReminderEmail"));
    expect(sender).toContain("resolveAppointmentCommunicationLocale(language)");
    expect(sender).toContain("{ idempotencyKey }");
    expect(sender).not.toContain("invokeLLM");
  });

  it("provides Admin-only read-only Reminder History inside existing Appointment Details", () => {
    expect(router).toContain("reminderHistory: adminProcedure");
    expect(calendar).toContain("trpc.appointments.reminderHistory.useQuery");
    expect(calendar).toContain('enabled: user?.role === "admin"');
    expect(calendar).toContain("Reminder History");
    expect(calendar).toContain('timeZone: "Europe/Istanbul"');
  });

  it("retains manual appointment communications and Calendar behavior as separate paths", () => {
    expect(router).toContain("sendAppointmentDetailsEmail");
    expect(service).not.toContain("sendAppointmentDetailsEmail");
    expect(service).not.toContain("appointment_communication_deliveries");
    expect(calendar).toContain("AppointmentDetailsSendModal");
  });
});
