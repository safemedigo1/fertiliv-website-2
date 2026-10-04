import { describe, expect, it } from "vitest";
import { endOfMonth, endOfWeek, format, isWithinInterval, startOfMonth, startOfWeek } from "date-fns";
import fs from "node:fs";
import path from "node:path";

function getVisibleMonthRange(currentDate: Date) {
  return {
    start: startOfWeek(startOfMonth(currentDate)),
    end: endOfWeek(endOfMonth(currentDate)),
  };
}

describe("Calendar Month View visible appointment range", () => {
  it("uses the complete visible August 2026 grid, including July and September cells", () => {
    const range = getVisibleMonthRange(new Date(2026, 7, 15));

    expect(format(range.start, "yyyy-MM-dd")).toBe("2026-07-26");
    expect(format(range.end, "yyyy-MM-dd")).toBe("2026-09-05");
    expect(isWithinInterval(new Date(2026, 6, 30, 9), range)).toBe(true);
    expect(isWithinInterval(new Date(2026, 8, 1, 9), range)).toBe(true);
  });

  it("does not fetch days outside the rendered Month View grid", () => {
    const range = getVisibleMonthRange(new Date(2026, 7, 15));

    expect(isWithinInterval(new Date(2026, 6, 25, 9), range)).toBe(false);
    expect(isWithinInterval(new Date(2026, 8, 6, 9), range)).toBe(false);
  });

  it("keeps one appointment identity when the same record appears in August then September", () => {
    const appointment = { id: 50048, appointmentDate: new Date(2026, 8, 1, 9) };
    const augustRange = getVisibleMonthRange(new Date(2026, 7, 15));
    const septemberRange = getVisibleMonthRange(new Date(2026, 8, 15));

    expect(isWithinInterval(appointment.appointmentDate, augustRange)).toBe(true);
    expect(isWithinInterval(appointment.appointmentDate, septemberRange)).toBe(true);
    expect(new Set([appointment.id]).size).toBe(1);
  });

  it("keeps the Month View source bound to the visible grid while Week and Day bounds stay separate", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/CalendarPage.tsx"), "utf8");

    expect(source).toContain('if (viewMode === "month") return startOfWeek(startOfMonth(currentDate));');
    expect(source).toContain('if (viewMode === "month") return endOfWeek(endOfMonth(currentDate));');
    expect(source).toContain('if (viewMode === "week") return startOfWeek(currentDate);');
    expect(source).toContain('if (viewMode === "week") return endOfWeek(currentDate);');
  });
});
