import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_CLINIC_WEEKLY_WORKING_HOURS,
  getIstanbulDateKey,
  isSourceTimeOffOverrideActive,
  isIstanbulIntervalWithinWorkingHours,
  istanbulDateTimeToUtc,
  validateWeeklyWorkingHours,
} from "../shared/availabilityFoundation";

const root = path.resolve(import.meta.dirname, "..");
const routers = fs.readFileSync(path.join(root, "server", "routers.ts"), "utf8");
const db = fs.readFileSync(path.join(root, "server", "db.ts"), "utf8");
const calendar = fs.readFileSync(path.join(root, "client", "src", "pages", "CalendarPage.tsx"), "utf8");
const schema = fs.readFileSync(path.join(root, "drizzle", "schema.ts"), "utf8");

describe("Staff Availability / Working Hours Foundation", () => {
  it("uses canonical Europe/Istanbul boundaries for whole-day Time-Off", () => {
    const start = istanbulDateTimeToUtc("2026-08-20", "00:00:00");
    const end = istanbulDateTimeToUtc("2026-08-20", "23:59:59.999");
    expect(start.toISOString()).toBe("2026-08-19T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-20T20:59:59.999Z");
    expect(getIstanbulDateKey(start)).toBe("2026-08-20");
    expect(getIstanbulDateKey(end)).toBe("2026-08-20");
  });

  it("validates non-overlapping weekly working-hour windows and keeps the clinic fallback", () => {
    expect(DEFAULT_CLINIC_WEEKLY_WORKING_HOURS).toEqual({});
    expect(validateWeeklyWorkingHours({ mon: [{ start: "09:00", end: "12:00" }, { start: "13:00", end: "17:00" }] }).mon).toHaveLength(2);
    expect(() => validateWeeklyWorkingHours({ mon: [{ start: "12:00", end: "11:00" }] })).toThrow("after its start");
    expect(() => validateWeeklyWorkingHours({ mon: [{ start: "09:00", end: "12:00" }, { start: "11:00", end: "13:00" }] })).toThrow("cannot overlap");
    expect(db).toContain("Working-hours overrides are available only for staff and doctor users.");
  });

  it("persists only appointment-specific override metadata and a clinic default schedule", () => {
    expect(schema).toContain("availabilityOverrideReason");
    expect(schema).toContain("availabilityOverrideById");
    expect(schema).toContain("availabilityOverrideAt");
    expect(schema).toContain("availabilityOverrideTimeOffId");
    expect(schema).toContain("defaultWeeklySchedule");
  });

  it("rejects appointments that cross an Istanbul midnight even when the start is inside working hours", () => {
    const schedule = { thu: [{ start: "09:00", end: "23:59" }] };
    const validStart = istanbulDateTimeToUtc("2026-08-27", "17:30:00");
    const validEnd = istanbulDateTimeToUtc("2026-08-27", "18:00:00");
    const crossMidnightStart = istanbulDateTimeToUtc("2026-08-27", "23:30:00");
    const crossMidnightEnd = istanbulDateTimeToUtc("2026-08-28", "00:00:00");
    expect(isIstanbulIntervalWithinWorkingHours(validStart, validEnd, schedule)).toBe(true);
    expect(isIstanbulIntervalWithinWorkingHours(crossMidnightStart, crossMidnightEnd, schedule)).toBe(false);
  });

  it("treats a source-linked override as active only while its exact Time-Off remains applicable", () => {
    const appointmentStart = istanbulDateTimeToUtc("2026-08-28", "11:00:00");
    const appointmentEnd = istanbulDateTimeToUtc("2026-08-28", "11:30:00");
    const coveringSource = {
      id: 210001,
      userId: 90001,
      startDate: istanbulDateTimeToUtc("2026-08-28", "00:00:00"),
      endDate: istanbulDateTimeToUtc("2026-08-28", "23:59:59"),
    };
    expect(isSourceTimeOffOverrideActive({ source: coveringSource, appointmentStart, appointmentEnd, ownerIds: [90001] })).toBe(true);
    expect(isSourceTimeOffOverrideActive({ source: null, appointmentStart, appointmentEnd, ownerIds: [90001] })).toBe(false);
    expect(isSourceTimeOffOverrideActive({
      source: { ...coveringSource, endDate: istanbulDateTimeToUtc("2026-08-28", "10:59:59") },
      appointmentStart,
      appointmentEnd,
      ownerIds: [90001],
    })).toBe(false);
    expect(isSourceTimeOffOverrideActive({
      source: coveringSource,
      appointmentStart: istanbulDateTimeToUtc("2026-08-29", "11:00:00"),
      appointmentEnd: istanbulDateTimeToUtc("2026-08-29", "11:30:00"),
      ownerIds: [90001],
    })).toBe(false);
  });

  it("uses full interval overlap and never infers ownership from staffId", () => {
    expect(db).toContain("COALESCE(${appointments.endDate}, DATE_ADD(${appointments.appointmentDate}");
    expect(db).toContain("staffAvailability.startDate} < ${input.appointmentEnd}");
    expect(db).toContain("staffAvailability.endDate} > ${input.appointmentStart}");
    expect(db).not.toContain("isNull(appointments.availabilityOverrideReason)");
    expect(db).toContain("getActiveAppointmentAvailabilityOverride");
    expect(db).toContain("staffId` is\n * intentionally excluded");
  });

  it("requires a documented Admin-only override across create, update, and manual bulk reschedule", () => {
    expect(routers).toContain("Only an administrator can approve an availability override.");
    expect(routers).toContain("availabilityOverrideReason: z.string().trim().min(3).max(500).optional()");
    expect(routers).toContain('"availability_override_applied"');
    expect(routers).toContain("bulkRescheduleOrReassign");
    expect(routers).toContain("resolveAppointmentAvailabilityOverride({");
  });

  it("retains existing appointment identity and Google G2 synchronization paths", () => {
    expect(routers).toContain("runGoogleCalendarG2Sync(appointmentId, true");
    expect(routers).toContain("runGoogleCalendarG2Sync(input.id, false");
    expect(routers).toContain("runGoogleCalendarG2Sync(action.appointmentId, false");
    expect(routers).not.toContain("createReschedulingCandidate");
    expect(routers).not.toContain("applyAllRescheduling");
  });

  it("uses an internal Calendar-only Admin override control with a user-friendly block message", () => {
    expect(calendar).toContain("Admin availability override reason");
    expect(calendar).toContain("Only an administrator can approve a documented availability override.");
    expect(calendar).toContain("Availability Override is retained");
    expect(calendar).toContain("trpc.appointments.availabilityOverrideState.useQuery");
    expect(calendar).toContain("availabilityOverrideState?.isOverridden &&");
    expect(calendar).toContain(">Availability Override<");
    expect(routers).toContain("availabilityOverrideState: staffOrAdminProcedure");
    expect(routers).toContain("timeOffId: activeOverride.timeOffId");
  });

  it("derives Needs Rescheduling from current source Time-Off overlap rather than historical override text", () => {
    expect(db).toContain("getAppointmentTimeOffReviewState");
    expect(db).toContain("const unresolved = conflicts.filter((conflict) => conflict.id !== activeOverride.timeOffId)");
    expect(db).toContain("isNeedsRescheduling: unresolved.length > 0");
    expect(routers).toContain("isNeedsRescheduling: reviewState.isNeedsRescheduling");
    expect(calendar).toContain(">Needs Rescheduling<");
    expect(calendar).toContain("availabilityOverrideState?.isNeedsRescheduling");
  });

  it("removes only the Time-Off source, retaining appointment and historical activity/audit evidence without Google or communication side effects", () => {
    const deleteSource = db.slice(db.indexOf("export async function deleteStaffAvailability"), db.indexOf("// Returns appointments that overlap"));
    const availabilitySection = routers.slice(routers.indexOf("availability: router({"));
    const availabilityDelete = availabilitySection.slice(availabilitySection.indexOf("delete: staffOrAdminProcedure"), availabilitySection.indexOf("getConflicts: staffOrAdminProcedure"));
    expect(deleteSource).toContain("db.delete(staffAvailability)");
    expect(deleteSource).not.toContain("appointments)");
    expect(deleteSource).not.toContain("appointmentActivityLog");
    expect(deleteSource).not.toContain("auditLogs");
    expect(availabilityDelete).not.toContain("runGoogleCalendarG2Sync");
    expect(availabilityDelete).not.toContain("sendAppointment");
  });
});
