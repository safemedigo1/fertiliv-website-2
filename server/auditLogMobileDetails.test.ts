import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAppointmentDeletionAuditDetails } from "../shared/auditEventDetails";

const root = path.resolve(__dirname, "..");
const auditPage = fs.readFileSync(path.join(root, "client/src/pages/AuditLogPage.tsx"), "utf8");

describe("Audit Log mobile presentation and generic event details", () => {
  const deletionDescription = "Deleted appointment APT-12345 (ID 12345) | Patient: Amna Arshad | Scheduled: 20 Aug 2026 09:00 Europe/Istanbul | Status: Cancelled | Reason: Test appointment";

  it("parses only the existing immutable deletion snapshot fields for clear Admin detail display", () => {
    expect(parseAppointmentDeletionAuditDetails(deletionDescription)).toEqual({
      appointmentReference: "APT-12345",
      appointmentId: "12345",
      personType: "Patient",
      personName: "Amna Arshad",
      scheduledAt: "20 Aug 2026 09:00 Europe/Istanbul",
      originalStatus: "Cancelled",
      reason: "Test appointment",
    });
  });

  it("retains generic detail behavior when an event is not a deletion snapshot", () => {
    expect(parseAppointmentDeletionAuditDetails("User signed in successfully")).toBeNull();
  });

  it("uses the compact table on mobile and keeps any horizontal scrolling inside its container", () => {
    expect(auditPage).toContain("max-w-full overflow-x-auto overscroll-contain");
    expect(auditPage).toContain('Table className="min-w-[740px]"');
    expect(auditPage).not.toContain("AuditMobileCard");
    expect(auditPage).toContain("line-clamp-2 break-words");
    expect(auditPage).toContain("showDaySeparator");
    expect(auditPage).toContain("uppercase tracking-wide whitespace-nowrap");
  });

  it("uses a compact per-event three-dot menu to open the existing details dialog", () => {
    expect(auditPage).toContain("MoreHorizontal");
    expect(auditPage).toContain("More actions for audit event");
    expect(auditPage).toContain("DropdownMenuItem onSelect={() => setSelectedLog(log)}");
    expect(auditPage).toContain("View Details");
  });

  it("exposes generic details and the retained deletion snapshot without an additional audit column", () => {
    expect(auditPage).toContain("Audit Event Details");
    expect(auditPage).toContain("Deleted Appointment Snapshot");
    expect(auditPage).toContain("Appointment reference / ID");
    expect(auditPage).toContain("Original appointment date/time");
    expect(auditPage).toContain("Deletion reason");
    expect(auditPage).toContain("Full Description");
    expect(auditPage).not.toContain("Deletion Reason Column");
  });

  it("preserves existing search and full-description CSV export while making header actions responsive", () => {
    expect(auditPage).toContain('placeholder="Search description..."');
    expect(auditPage).toContain('log.description ?? ""');
    expect(auditPage).toContain("replace(/\"/g");
    expect(auditPage).toContain("flex w-full flex-wrap gap-2 sm:w-auto");
    expect(auditPage).toContain("flex-1 sm:flex-none");
  });
});
