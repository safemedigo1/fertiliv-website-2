import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { orderCalendarAppointments } from "../client/src/pages/CalendarPage";
import { effectiveAppointmentEnd } from "../shared/appointmentScheduling";

const calendar = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/CalendarPage.tsx"), "utf8");

describe("Calendar-only same-day appointment ordering", () => {
  it("orders by authoritative appointmentDate ascending and uses id only for exact start-time ties", () => {
    const appointments = [
      { id: 40, appointmentDate: new Date("2026-09-01T16:15:00") },
      { id: 12, appointmentDate: new Date("2026-09-01T11:30:00") },
      { id: 9, appointmentDate: new Date("2026-09-01T09:00:00") },
      { id: 4, appointmentDate: new Date("2026-09-01T14:00:00") },
      { id: 2, appointmentDate: new Date("2026-09-01T14:00:00") },
    ];

    expect(orderCalendarAppointments(appointments).map((appointment) => appointment.id)).toEqual([9, 12, 2, 4, 40]);
  });

  it("does not mutate the source or cached appointment array", () => {
    const appointments = [
      { id: 2, appointmentDate: new Date("2026-09-01T11:30:00") },
      { id: 1, appointmentDate: new Date("2026-09-01T09:00:00") },
    ];
    const sourceOrder = appointments.map((appointment) => appointment.id);

    const ordered = orderCalendarAppointments(appointments);

    expect(ordered).not.toBe(appointments);
    expect(ordered.map((appointment) => appointment.id)).toEqual([1, 2]);
    expect(appointments.map((appointment) => appointment.id)).toEqual(sourceOrder);
  });

  it("routes Month, Week, Day, and List through one ordered Calendar array", () => {
    expect(calendar).toContain("const orderedCalendarAppointments = useMemo(");
    expect(calendar).toContain("() => orderCalendarAppointments(filteredAppointments)");
    expect(calendar.match(/appointments=\{orderedCalendarAppointments\}/g)).toHaveLength(4);
  });

  it("keeps Month truncation after ordering so the earliest three remain visible and +N remains accurate", () => {
    const appointments = [
      { id: 5, appointmentDate: new Date("2026-09-01T16:15:00") },
      { id: 4, appointmentDate: new Date("2026-09-01T14:00:00") },
      { id: 3, appointmentDate: new Date("2026-09-01T11:30:00") },
      { id: 2, appointmentDate: new Date("2026-09-01T10:00:00") },
      { id: 1, appointmentDate: new Date("2026-09-01T09:00:00") },
    ];

    const dayAppointments = orderCalendarAppointments(appointments);
    expect(dayAppointments.slice(0, 3).map((appointment) => appointment.id)).toEqual([1, 2, 3]);
    expect(dayAppointments.length - 3).toBe(2);
    expect(calendar).toContain("dayAppts.slice(0, 3)");
    expect(calendar).toContain("+{dayAppts.length - 3} more");
  });

  it("does not change legacy duration fallback or overnight start-day timing behavior", () => {
    const start = new Date("2026-09-01T23:30:00");
    expect(effectiveAppointmentEnd({ appointmentDate: start, duration: 45 }).getTime()).toBe(start.getTime() + 45 * 60_000);
    expect(orderCalendarAppointments([
      { id: 2, appointmentDate: new Date("2026-09-02T09:00:00") },
      { id: 1, appointmentDate: start },
    ]).map((appointment) => appointment.id)).toEqual([1, 2]);
  });
});
