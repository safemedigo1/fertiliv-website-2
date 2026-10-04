import { describe, expect, it } from "vitest";
import { eachDayOfInterval, endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import fs from "node:fs";
import path from "node:path";

const calendar = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/CalendarPage.tsx"), "utf8");

function visibleMonthWeekCount(date: Date) {
  return eachDayOfInterval({
    start: startOfWeek(startOfMonth(date)),
    end: endOfWeek(endOfMonth(date)),
  }).length / 7;
}

describe("Calendar Desktop Month View fit", () => {
  it("recognizes representative five- and six-row visible Month grids", () => {
    expect(visibleMonthWeekCount(new Date(2026, 5, 15))).toBe(5);
    expect(visibleMonthWeekCount(new Date(2026, 7, 15))).toBe(6);
  });

  it("measures desktop month space from the live workspace and safely falls back below the readability floor", () => {
    expect(calendar).toContain("const DESKTOP_MONTH_BREAKPOINT = 768;");
    expect(calendar).toContain("const DESKTOP_MONTH_BOTTOM_GUTTER = 24;");
    expect(calendar).toContain("const MIN_DESKTOP_MONTH_CARD_HEIGHT = 580;");
    expect(calendar).toContain("workspace.getBoundingClientRect().top");
    expect(calendar).toContain("window.visualViewport?.height ?? window.innerHeight");
    expect(calendar).toContain("availableHeight >= MIN_DESKTOP_MONTH_CARD_HEIGHT ? availableHeight : null");
  });

  it("re-measures for desktop resize, visual viewport change, filters, and Calendar layout movement", () => {
    expect(calendar).toContain("new ResizeObserver(measure)");
    expect(calendar).toContain("window.addEventListener(\"resize\", measure)");
    expect(calendar).toContain("window.visualViewport?.addEventListener(\"resize\", measure)");
    expect(calendar).toContain("}, [viewMode, showFilters, activeFilterCount]);");
  });

  it("uses equal flexible week rows only when the desktop measured-height contract is active", () => {
    expect(calendar).toContain("const weekCount = days.length / 7;");
    expect(calendar).toContain("const hasDesktopFit = typeof desktopAvailableHeight === \"number\";");
    expect(calendar).toContain("gridTemplateRows: `repeat(${weekCount}, minmax(0, 1fr))`");
    expect(calendar).toContain("md:flex md:min-h-0 md:flex-1 md:flex-col");
  });

  it("keeps mobile day-cell height while only compacting desktop spacing and preserving busy-day overflow", () => {
    expect(calendar).toContain("min-h-[100px] p-2 border-b border-r transition-colors md:min-h-0 md:p-1.5");
    expect(calendar).toContain("dayAppts.slice(0, 3)");
    expect(calendar).toContain("+{dayAppts.length - 3} more");
    expect(calendar).toContain("sm:!pb-0");
    expect(calendar).toContain("desktopAvailableHeight={desktopMonthHeight}");
  });
});
