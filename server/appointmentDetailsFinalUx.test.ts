import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const calendarPage = readFileSync(resolve(root, "client/src/pages/CalendarPage.tsx"), "utf8");
const leadPage = readFileSync(resolve(root, "client/src/pages/LeadDetailPage.tsx"), "utf8");
const patientPage = readFileSync(resolve(root, "client/src/pages/PatientDetailPage.tsx"), "utf8");
const confirmation = readFileSync(resolve(root, "client/src/components/AppointmentStatusConfirmation.tsx"), "utf8");
const secondaryLayer = readFileSync(resolve(root, "client/src/components/AppointmentDetailsSecondaryLayer.tsx"), "utf8");
const presentation = readFileSync(resolve(root, "client/src/components/AppointmentDetailsPresentation.tsx"), "utf8");

describe("Appointment Details final UX refinements", () => {
  it("uses the compact purpose title and a linked Patient or Lead display name on all appointment-detail surfaces", () => {
    expect(calendarPage).toContain('<DialogTitle className="text-sm">Appointment Details</DialogTitle>');
    expect(calendarPage).toContain("linkedRecordDisplayName");
    expect(leadPage).toContain('<DialogTitle className="text-sm">Appointment Details</DialogTitle>');
    expect(leadPage).toContain("leadName={[lead.firstName");
    expect(patientPage).toContain('<DialogTitle className="text-sm">Appointment Details</DialogTitle>');
    expect(patientPage).toContain("patientName={[patient?.firstName");
    for (const source of [calendarPage, leadPage, patientPage]) {
      expect(source).toContain("<AppointmentDetailsIdentityRow");
    }
  });

  it("requires a shared pre-mutation confirmation step for Confirm, Re-activate, Complete, and No Show only", () => {
    for (const source of [calendarPage, leadPage, patientPage]) {
      expect(source).toContain("<AppointmentStatusConfirmation");
      expect(source).toContain('setPendingStatusAction("confirm")');
      expect(source).toContain('setPendingStatusAction("reactivate")');
      expect(source).toContain('setPendingStatusAction("complete")');
      expect(source).toContain('setPendingStatusAction("no_show")');
      expect(source).toContain("setShowCancelDialog(true)");
      expect(source).toContain("setShowDeleteDialog(true)");
    }
  });

  it("provides the requested confirmation copy with a dismissible Cancel path and no reason field", () => {
    for (const message of [
      "Are you sure you want to confirm this appointment?",
      "Are you sure you want to re-activate this appointment?",
      "Are you sure you want to mark this appointment as completed?",
      "Are you sure you want to mark this appointment as No Show?",
      "Yes, Confirm",
      "Yes, Re-activate",
      "Yes, Complete",
      "Yes, Mark No Show",
    ]) {
      expect(confirmation).toContain(message);
    }
    expect(confirmation).toContain('onActionChange(null)}>Cancel</Button>');
    expect(confirmation).not.toContain("Reason");
  });

  it("dismisses only the secondary layer and retains the parent Appointment Details modal on every surface", () => {
    expect(secondaryLayer).toContain("if (!open) return null;");
    expect(secondaryLayer).toContain("onDismiss();");
    for (const source of [calendarPage, leadPage, patientPage]) {
      expect(source).toContain("<AppointmentDetailsSecondaryLayer");
      expect(source).toContain("open={showCancelDialog}");
      expect(source).toContain("open={showDeleteDialog}");
      expect(source).toContain("onDismiss={() => setShowCancelDialog(false)}");
      expect(source).toContain("onDismiss={() => setShowDeleteDialog(false)}");
      expect(source).not.toContain("<Dialog open={showCancelDialog}");
      expect(source).not.toContain("<Dialog open={showDeleteDialog}");
    }
  });

  it("keeps the selected appointment mounted and patches the visible status in place after safe actions", () => {
    for (const source of [calendarPage, leadPage, patientPage]) {
      expect(source).toContain("onRefresh={(appointmentPatch) => {");
      expect(source).toContain("if (appointmentPatch) setSelectedAppt((current: any | null) => current ? { ...current, ...appointmentPatch } : current);");
      expect(source).toContain('onRefresh({ status: "no_show" });');
      expect(source).not.toContain("onRefresh={() => { refetch(); setSelectedAppt(null); }}");
    }
    expect(calendarPage).toContain('onRefresh({ ...variables.data, ...(variables.data.status === "upcoming" ? { cancellationReason: null } : {}) });');
    expect(leadPage).toContain('onRefresh({ ...variables.data, ...(variables.data.status === "upcoming" ? { cancellationReason: null } : {}) });');
    expect(patientPage).toContain('onRefresh({ ...variables.data, ...(variables.data.status === "upcoming" ? { cancellationReason: null } : {}) });');
  });

  it("keeps the primary dialog fixed and viewport-bounded at iPhone sizes while child layers overlay it without changing its layout", () => {
    expect(secondaryLayer).toContain('className="absolute inset-0 z-20 flex items-center justify-center');
    for (const source of [calendarPage, leadPage, patientPage]) {
      expect(source).toContain('className="flex max-h-[92dvh]');
      expect(source).toContain("overflow-hidden p-0");
      expect(source).toContain("min-h-0 flex-1");
      expect(source).toContain("overflow-y-auto overscroll-contain");
      expect(source).not.toContain('className="relative flex max-h-[92dvh]');
    }
  });

  it("uses the shared compact responsive hierarchy for identity, grouped timing, information, and action groups", () => {
    expect(presentation).toContain("AppointmentDetailsTimingGroup");
    expect(presentation).toContain('label: "Date"');
    expect(presentation).toContain('label: "Start"');
    expect(presentation).toContain('label: "End"');
    expect(presentation).toContain("sm:grid-cols-4");
    expect(presentation).toContain("AppointmentDetailsActionGroup");
    for (const source of [calendarPage, leadPage, patientPage]) {
      expect(source).toContain("sm:max-w-3xl");
      expect(source).toContain("<AppointmentDetailsTimingGroup");
      expect(source).toContain('label="Primary actions"');
      expect(source).toContain('label="More"');
      expect(source).toContain('label="Danger zone" tone="danger"');
    }
    expect(calendarPage).toContain("<AppointmentDetailsDisclosure");
    expect(calendarPage).toContain('title="Activity Log"');
  });
});
