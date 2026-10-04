import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const calendar = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/CalendarPage.tsx"), "utf8");

describe("Calendar mobile responsive accessibility", () => {
  it("uses a contained Create Appointment scroll owner and iOS-safe effective control sizing", () => {
    const appointmentForm = calendar.slice(calendar.indexOf("function AppointmentFormModal"), calendar.indexOf("// ─── Bulk Action Bar"));
    expect(appointmentForm).toContain("max-h-[calc(100dvh-1rem)]");
    expect(appointmentForm).toContain("overflow-x-clip overflow-y-hidden p-0 touch-pan-y");
    expect(appointmentForm).toContain("[&_input]:text-base");
    expect(appointmentForm).toContain("[&_textarea]:text-base");
    expect(appointmentForm).toContain("[&_[role=combobox]]:text-base");
    expect(appointmentForm).toContain("min-h-0 min-w-0 flex-1 flex-col overflow-x-clip");
    expect(appointmentForm).toContain("min-h-0 min-w-0 flex-1 space-y-4 overflow-x-clip overflow-y-auto overscroll-contain");
    expect(appointmentForm).toContain("grid min-w-0 grid-cols-1 gap-4 [&>div]:min-w-0");
    expect(appointmentForm).toContain('className="w-full min-w-0 max-w-full" value={form.date}');
    expect(appointmentForm).toContain('className="w-full min-w-0 max-w-full"><SelectValue');
    expect(appointmentForm).toContain("pb-[calc(0.75rem+env(safe-area-inset-bottom))]");
    expect(appointmentForm).toContain("sm:[&_input]:text-sm");
  });

  it("derives Month Calendar clearance from the actual mobile bulk-panel height", () => {
    expect(calendar).toContain("const [bulkActionBarHeight, setBulkActionBarHeight] = useState(0)");
    expect(calendar).toContain("paddingBottom: `calc(${bulkActionBarHeight}px + 0.75rem + env(safe-area-inset-bottom))`");
    expect(calendar).toContain("onHeightChange={setBulkActionBarHeight}");
    expect(calendar).toContain("const observer = new ResizeObserver(measure)");
    expect(calendar).toContain("onHeightChange(0)");
    expect(calendar).not.toContain('selectedIds.size > 0 ? "pb-44 sm:pb-0"');
    const bulkBar = calendar.slice(calendar.indexOf("function BulkActionBar"), calendar.indexOf("// ─── List View"));
    expect(bulkBar).toContain("bottom-[calc(0.75rem+env(safe-area-inset-bottom))]");
    expect(bulkBar).toContain("sm:bottom-6");
  });
});
