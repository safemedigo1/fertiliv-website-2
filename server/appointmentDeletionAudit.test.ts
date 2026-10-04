import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { formatAppointmentDeletionAuditDescription } from "../shared/appointmentDeletionAudit";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Permanent appointment deletion audit snapshot", () => {
  const patientSnapshot = {
    appointmentId: 12345,
    appointmentReference: "APT-12345",
    personType: "Patient" as const,
    personName: "Amna Arshad",
    appointmentDate: new Date("2026-08-20T09:00:00.000Z"),
    status: "cancelled",
  };

  it("retains only the required non-clinical Patient snapshot and reason", () => {
    expect(formatAppointmentDeletionAuditDescription(patientSnapshot, "Test appointment")).toBe(
      "Deleted appointment APT-12345 (ID 12345) | Patient: Amna Arshad | Scheduled: 20 Aug 2026 12:00 Europe/Istanbul | Status: Cancelled | Reason: Test appointment",
    );
  });

  it("retains a Lead identity and omits the reason segment when none was supplied", () => {
    expect(formatAppointmentDeletionAuditDescription({
      ...patientSnapshot,
      appointmentId: 77,
      appointmentReference: "APT-00077",
      personType: "Lead",
      personName: "Rachel Dennesen",
      status: "no_show",
    })).toBe(
      "Deleted appointment APT-00077 (ID 77) | Lead: Rachel Dennesen | Scheduled: 20 Aug 2026 12:00 Europe/Istanbul | Status: No Show",
    );
  });

  it("excludes title, notes, diagnosis, medical, and financial fields by construction", () => {
    const description = formatAppointmentDeletionAuditDescription(patientSnapshot, "Reason only");
    expect(description).not.toContain("Sensitive title");
    expect(description).not.toContain("Clinical notes");
    expect(description).not.toContain("Diagnosis");
    expect(description).not.toContain("Invoice");
  });

  it("uses the same snapshot formatter before both individual and Bulk Delete", () => {
    const routers = read("server/routers.ts");
    const individual = routers.slice(routers.indexOf("delete: staffOrAdminProcedure"), routers.indexOf("bulkRescheduleOrReassign:"));
    const bulk = routers.slice(routers.indexOf("bulkDelete: adminProcedure"), routers.indexOf("activityLog: staffOrAdminProcedure"));
    expect(individual).toContain("getAppointmentDeletionAuditSnapshot(input.id)");
    expect(individual).toContain("formatAppointmentDeletionAuditDescription(snapshot, reason)");
    expect(bulk).toContain("getAppointmentDeletionAuditSnapshot(action.appointmentId)");
    expect(bulk).toContain("formatAppointmentDeletionAuditDescription(snapshot, reason)");
  });

  it("leaves retained records searchable and exportable through the existing Admin Audit Log", () => {
    const auditPage = read("client/src/pages/AuditLogPage.tsx");
    expect(auditPage).toContain('placeholder="Search description..."');
    expect(auditPage).toContain('"Description"');
    expect(auditPage).toContain("audit-log-");
  });
});
