import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isFullySuccessfulBulkResult } from "../client/src/pages/CalendarPage";

const calendar = fs.readFileSync(path.resolve(process.cwd(), "client/src/pages/CalendarPage.tsx"), "utf8");

describe("Calendar Select Mode UX", () => {
  it("keeps clear-only and full exit as distinct shared Calendar controller actions", () => {
    expect(calendar).toContain("const clearSelectionOnly = useCallback(() => setSelectedIds(new Set()), []);");
    expect(calendar).toContain("const exitSelectMode = useCallback(() => {");
    expect(calendar).toContain("setSelectMode(false);");
    expect(calendar).toContain("onClearSelection={clearSelectionOnly}");
    expect(calendar).toContain("onExitSelectMode={exitSelectMode}");
  });

  it("exposes Clear Selection separately while the panel X clears and exits Select Mode", () => {
    const bulkBar = calendar.slice(calendar.indexOf("function BulkActionBar"), calendar.indexOf("// ─── List View"));
    expect(bulkBar).toContain("Clear Selection");
    expect(bulkBar).toContain("onClick={onClearSelection}");
    expect(bulkBar).toContain("onClick={onExitSelectMode}");
    expect(bulkBar).toContain('aria-label="Clear selection and exit Select Mode"');
  });

  it("uses the requested compact top row, short action wording, and contained two-column grid", () => {
    const bulkBar = calendar.slice(calendar.indexOf("function BulkActionBar"), calendar.indexOf("// ─── List View"));
    expect(bulkBar).toContain("grid grid-cols-[auto_1fr_auto] items-start gap-2");
    expect(bulkBar).toContain("justify-self-center");
    expect(bulkBar).toContain("justify-self-end");
    expect(bulkBar).toContain("mt-2 grid grid-cols-2 gap-1.5");
    expect(bulkBar).toContain('{count} {count === 1 ? "appointment" : "appointments"} selected');
    expect(bulkBar).toContain("Confirm ({confirmableIds.length})");
    expect(bulkBar).toContain("Re-activate ({reactivatableIds.length})");
    expect(bulkBar).toContain("Cancel ({cancelableIds.length})");
    expect(bulkBar).toContain("Delete ({count})");
    expect(bulkBar).not.toContain("Confirm Selected");
    expect(bulkBar).not.toContain("Re-activate Selected");
    expect(bulkBar).not.toContain("Cancel Selected ({cancelableIds.length})");
    expect(bulkBar.match(/min-w-0 gap-1 overflow-hidden/g)).toHaveLength(4);
    expect(bulkBar.match(/className="truncate"/g)).toHaveLength(4);
    expect(bulkBar.match(/shrink-0/g)).toHaveLength(2);
    expect(bulkBar).toContain("col-span-2 h-7");
  });

  it("recognizes only complete non-pending result sets as safe to clear and exit", () => {
    expect(isFullySuccessfulBulkResult({ results: [{ outcome: "cancelled", googleSync: "synced" }, { outcome: "skipped_completed", googleSync: "not_applicable" }] })).toBe(true);
    expect(isFullySuccessfulBulkResult({ results: [{ outcome: "deleted", googleDeletion: "deleted" }] })).toBe(true);
    expect(isFullySuccessfulBulkResult({ results: [{ outcome: "failed", googleSync: "not_applicable" }] })).toBe(false);
    expect(isFullySuccessfulBulkResult({ results: [{ outcome: "deleted", googleDeletion: "pending" }] })).toBe(false);
  });

  it("uses one shared completion path for direct approved actions and fully successful Cancel/Delete responses", () => {
    const bulkBar = calendar.slice(calendar.indexOf("function BulkActionBar"), calendar.indexOf("// ─── List View"));
    expect(calendar).toContain("const completeBulkSuccess = useCallback(() => {");
    expect(calendar).toContain("refetch();");
    expect(calendar).toContain("exitSelectMode();");
    expect(bulkBar).toContain("onSuccess: (res) => { toast.success");
    expect(bulkBar).toContain("onCompleteBulkSuccess();");
    expect(bulkBar).toContain("if (isFullySuccessfulBulkResult(response))");
  });

  it("preserves partial or rejected bulk-action context instead of silently clearing selection", () => {
    const bulkBar = calendar.slice(calendar.indexOf("function BulkActionBar"), calendar.indexOf("// ─── List View"));
    expect(bulkBar).toContain("const [isResultOpen, setIsResultOpen] = useState(false);");
    expect(bulkBar).toContain("setResult({ kind, response, request: payload });");
    expect(bulkBar).toContain("setIsResultOpen(true);");
    expect(bulkBar).toContain("Retry failed");
    expect(bulkBar).toContain("Bulk action could not be completed. No unreported changes were made.");
    expect(bulkBar).not.toContain("resetResult");
  });

  it("routes Month, Week, Day, and List through the shared selection state and disables List selection outside Select Mode", () => {
    expect(calendar.match(/selectMode=\{selectMode\} selectedIds=\{selectedIds\} onToggleSelect=\{toggleSelect\}/g)).toHaveLength(4);
    const listView = calendar.slice(calendar.indexOf("function ListView"), calendar.indexOf("// ─── Month View"));
    expect(listView).toContain("selectMode ? onToggleSelect(a.id) : onApptClick(a)");
    expect(listView).toContain("{selectMode && (");
    expect(listView).toContain("Select appointment");
  });

  it("retains the shared mobile bulk-panel measurement path", () => {
    expect(calendar).toContain("const [bulkActionBarHeight, setBulkActionBarHeight] = useState(0)");
    expect(calendar).toContain("onHeightChange={setBulkActionBarHeight}");
    expect(calendar).toContain("const observer = new ResizeObserver(measure)");
  });
});
