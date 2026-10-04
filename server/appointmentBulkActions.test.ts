import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getBulkCancelOutcome,
  resolveBulkAppointmentReason,
  summarizeBulkAppointmentOutcomes,
} from "../shared/appointmentBulkActions";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const procedureSection = (source: string, start: string, end: string) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

describe("Admin-only Calendar Bulk Cancel and Delete", () => {
  it("cancels only Upcoming and Confirmed appointments while preserving all other terminal histories", () => {
    expect(getBulkCancelOutcome("upcoming")).toBe("cancelled");
    expect(getBulkCancelOutcome("confirmed")).toBe("cancelled");
    expect(getBulkCancelOutcome("cancelled")).toBe("skipped_already_cancelled");
    expect(getBulkCancelOutcome("completed")).toBe("skipped_completed");
    expect(getBulkCancelOutcome("no_show")).toBe("skipped_no_show");
    expect(getBulkCancelOutcome("rescheduled")).toBe("skipped_rescheduled");
  });

  it("keeps individual reasons isolated and only uses the general reason as that appointment's fallback", () => {
    expect(resolveBulkAppointmentReason("Patient request", "Clinic closure")).toBe("Patient request");
    expect(resolveBulkAppointmentReason(undefined, "Clinic closure")).toBe("Clinic closure");
    expect(resolveBulkAppointmentReason("   ", "   ")).toBeUndefined();
  });

  it("creates explicit summaries rather than reporting a partially failed group as fully successful", () => {
    expect(summarizeBulkAppointmentOutcomes([
      { outcome: "cancelled" },
      { outcome: "cancelled" },
      { outcome: "skipped_no_show" },
      { outcome: "failed" },
    ])).toEqual({ cancelled: 2, skipped_no_show: 1, failed: 1 });
  });

  it("uses dedicated Admin-only endpoints and blocks the generic batch endpoint from cancellation", () => {
    const routers = read("server/routers.ts");
    const batchUpdate = procedureSection(routers, "batchUpdate: staffOrAdminProcedure", "bulkCancel: adminProcedure");
    const bulkCancel = procedureSection(routers, "bulkCancel: adminProcedure", "bulkDelete: adminProcedure");
    const bulkDelete = procedureSection(routers, "bulkDelete: adminProcedure", "activityLog: staffOrAdminProcedure");
    expect(batchUpdate).toContain('input.data.status === "cancelled"');
    expect(bulkCancel).toContain("cancelAppointmentWithLifecycle");
    expect(bulkCancel).toContain('successAction: "google_event_cancelled"');
    expect(bulkCancel).toContain('outcome: "failed"');
    expect(bulkDelete).toContain("await deleteAppointment(action.appointmentId)");
    expect(bulkDelete).toContain("await runGoogleCalendarG2Deletion(action.appointmentId)");
    expect(bulkDelete).not.toContain("cancelAppointmentWithLifecycle");
  });

  it("persists successful cancel lifecycle writes atomically and leaves direct deletion lifecycle-free", () => {
    const db = read("server/db.ts");
    const cancelHelper = procedureSection(db, "export async function cancelAppointmentWithLifecycle", "export async function logAppointmentActivity");
    const deleteHelper = procedureSection(db, "export async function deleteAppointment", "export async function cancelAppointmentWithLifecycle");
    expect(cancelHelper).toContain("db.transaction");
    expect(cancelHelper).toContain('action: "appointment_cancelled"');
    expect(cancelHelper).toContain('inArray(appointments.status, ["upcoming", "confirmed"])');
    expect(deleteHelper).toContain("db.transaction");
  });

  it("shows Admin-only general or individual reason controls and partial-result retry guidance in Calendar", () => {
    const calendar = read("client/src/pages/CalendarPage.tsx");
    expect(calendar).toContain('const isAdmin = user?.role === "admin"');
    expect(calendar).toContain("Cancel Selected");
    expect(calendar).toContain("Delete Selected");
    expect(calendar).toContain("Set individual reasons");
    expect(calendar).toContain("Retry failed");
    expect(calendar).toContain("No participant email will be sent.");
  });
});
