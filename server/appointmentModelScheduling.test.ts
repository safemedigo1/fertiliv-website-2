import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  effectiveAppointmentEnd,
  endDateFromLocalTime,
  normalizeAppointmentTiming,
  normalizeModeScopedAppointmentFields,
  resolveEffectiveExternalLocation,
  validateOptionalMeetingLink,
} from "../shared/appointmentScheduling";
import { assertMeetingLinkActionAllowed, canUseMeetingLinkActions } from "../shared/appointmentMeetingLinkLifecycle";
import { isAppointmentReactivation } from "../shared/appointmentCancellationLifecycle";

const root = resolve(import.meta.dirname, "..");
const googleService = readFileSync(resolve(root, "server/googleCalendarService.ts"), "utf8");
const calendarPage = readFileSync(resolve(root, "client/src/pages/CalendarPage.tsx"), "utf8");
const leadPage = readFileSync(resolve(root, "client/src/pages/LeadDetailPage.tsx"), "utf8");
const patientPage = readFileSync(resolve(root, "client/src/pages/PatientDetailPage.tsx"), "utf8");
const settingsPage = readFileSync(resolve(root, "client/src/pages/SettingsPage.tsx"), "utf8");
const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
const database = readFileSync(resolve(root, "server/db.ts"), "utf8");

describe("Appointment time source of truth", () => {
  it("uses the persisted explicit end time when available", () => {
    const start = new Date("2026-12-01T09:00:00");
    const end = new Date("2026-12-01T10:15:00");
    expect(effectiveAppointmentEnd({ appointmentDate: start, endDate: end, duration: 30 })).toEqual(end);
  });

  it("keeps legacy appointments compatible through duration fallback", () => {
    const start = new Date("2026-12-01T09:00:00");
    expect(effectiveAppointmentEnd({ appointmentDate: start, duration: 45 }).getTime()).toBe(start.getTime() + 45 * 60_000);
  });

  it("supports an overnight end time and derives its synchronized duration", () => {
    const start = new Date("2026-12-01T23:30:00");
    const overnightEnd = endDateFromLocalTime(start, "00:15");
    expect(overnightEnd?.getDate()).toBe(2);
    expect(normalizeAppointmentTiming({ appointmentDate: start, endDate: overnightEnd }).duration).toBe(45);
  });

  it("rejects an end time that is not after the start", () => {
    const start = new Date("2026-12-01T09:00:00");
    expect(() => normalizeAppointmentTiming({ appointmentDate: start, endDate: new Date("2026-12-01T09:00:00") })).toThrow("after its start time");
  });

  it("derives arbitrary minute durations from an end time without a preset requirement", () => {
    const start = new Date("2026-12-01T09:00:00");
    const end = endDateFromLocalTime(start, "09:14");
    expect(normalizeAppointmentTiming({ appointmentDate: start, endDate: end }).duration).toBe(14);
  });
});

describe("Optional meeting-link validation", () => {
  it("accepts an empty link and valid http or https URLs", () => {
    expect(validateOptionalMeetingLink("")).toBeNull();
    expect(validateOptionalMeetingLink("https://meet.google.com/room")).toBeNull();
    expect(validateOptionalMeetingLink("http://example.test/room")).toBeNull();
  });

  it("returns a user-friendly error for invalid or unsafe links", () => {
    expect(validateOptionalMeetingLink("meet.google.com/room")).toBe("Please enter a valid link starting with https:// or http://");
    expect(validateOptionalMeetingLink("javascript:alert(1)")).toBe("Please enter a valid link starting with https:// or http://");
  });
});

describe("Cancellation reason lifecycle", () => {
  it("clears current cancellation state only when a cancelled appointment moves to an active status", () => {
    expect(isAppointmentReactivation("cancelled", "upcoming")).toBe(true);
    expect(isAppointmentReactivation("cancelled", "confirmed")).toBe(true);
    expect(isAppointmentReactivation("cancelled", "cancelled")).toBe(false);
    expect(isAppointmentReactivation("upcoming", "cancelled")).toBe(false);
    expect(isAppointmentReactivation("cancelled", undefined)).toBe(false);
  });

  it("records each cancellation reason in appointment history while the detail view renders stored activity values", () => {
    const routerSource = readFileSync(resolve(root, "server/routers.ts"), "utf8");
    expect(routerSource).toContain('"appointment_cancelled"');
    expect(routerSource).toContain('"appointment_reactivated"');
    expect(routerSource).toContain("cancellationReason = null");
    expect(calendarPage).toContain('log.newValue ? ` — ${log.newValue}` : ""');
  });
});

describe("Appointment type stale-data protection", () => {
  it("keeps only the online meeting link for online appointments", () => {
    expect(normalizeModeScopedAppointmentFields({
      appointmentType: "online", meetingLink: "https://meet.example/room", externalLocation: "Outside", partnerClinicId: 7,
    })).toEqual({ appointmentType: "online", meetingLink: "https://meet.example/room", externalLocation: null, partnerClinicId: null });
  });

  it("keeps a selected partner clinic as the sole external-location source", () => {
    expect(normalizeModeScopedAppointmentFields({
      appointmentType: "external", meetingLink: "https://meet.example/room", externalLocation: "Partner address", partnerClinicId: 7,
    })).toEqual({ appointmentType: "external", meetingLink: null, externalLocation: null, partnerClinicId: 7 });
  });

  it("clears online and external metadata when returning to in-clinic", () => {
    expect(normalizeModeScopedAppointmentFields({
      appointmentType: "in-clinic", meetingLink: "https://meet.example/room", externalLocation: "Partner address", partnerClinicId: 7,
    })).toEqual({ appointmentType: "in-clinic", meetingLink: null, externalLocation: null, partnerClinicId: null });
  });
});

describe("Effective external location", () => {
  it("prefers the selected partner clinic over a stale manual address", () => {
    expect(resolveEffectiveExternalLocation({
      appointmentType: "external", partnerClinicId: 7, partnerClinicName: "Al-Noor Radiology Centre", partnerClinicAddress: "Clinic Avenue", externalLocation: "في البيت",
    })).toBe("Al-Noor Radiology Centre, Clinic Avenue");
  });

  it("uses the manual address only when no partner clinic is selected", () => {
    expect(resolveEffectiveExternalLocation({ appointmentType: "external", externalLocation: "في البيت" })).toBe("في البيت");
  });

  it("deactivates external location outside External mode", () => {
    expect(resolveEffectiveExternalLocation({ appointmentType: "online", externalLocation: "في البيت", partnerClinicId: 7, partnerClinicName: "Al-Noor" })).toBeNull();
  });
});

describe("Outbound-only Google and ICS contract", () => {
  it("keeps Partner Clinic address and optional Maps Link separate across all appointment outputs", () => {
    expect(schema).toContain('googleMapsUrl: varchar("googleMapsUrl", { length: 2048 })');
    expect(settingsPage).toContain("Google Maps Link");
    expect(settingsPage).toContain("Enter a valid Google Maps URL or leave the field empty.");
    expect(database).toContain("partnerClinicGoogleMapsUrl: partnerClinics.googleMapsUrl");
    expect(googleService).toContain("Map: ${source.partnerClinicGoogleMapsUrl}");
    expect(calendarPage).toContain("const mapLink = appt.appointmentType === \"in-clinic\"");
    expect(calendarPage).toContain("Map: ${mapLink}");
    for (const page of [calendarPage, leadPage, patientPage]) {
      expect(page).toContain("partnerClinicGoogleMapsUrl");
      expect(page).toContain("Open Map");
    }
  });

  it("preserves the existing event while requesting an idempotent optional conference", () => {
    expect(googleService).toContain("conferenceDataVersion=1");
    expect(googleService).toContain("conferenceSolutionKey: { type: \"hangoutsMeet\" }");
    expect(googleService).toContain("const requestId = `fertiliv-${appointmentId}-${mapping.googleEventId}`");
    expect(googleService).toContain("source.appointmentType === \"online\" && source.meetingLink");
    expect(googleService).toContain('method: "PATCH"');
  });

  it("uses the same effective end time and mode-scoped link/location in ICS", () => {
    expect(calendarPage).toContain("effectiveAppointmentEnd({ appointmentDate: start");
    expect(calendarPage).toContain("resolvePhysicalAppointmentLocation({ ...appt, clinicName, clinicAddress })");
    expect(calendarPage).toContain("appt.appointmentType === \"online\"");
  });

  it("exposes the manual Meet action and user-friendly validation in every appointment workflow", () => {
    for (const page of [calendarPage, leadPage, patientPage]) {
      expect(page).toContain("Generate Google Meet");
      expect(page).toContain("validateOptionalMeetingLink");
      expect(page).toContain("grid-cols-1");
      expect(page).toContain("sm:grid-cols-2");
    }
    expect(calendarPage).toContain('a.appointmentType === "online" && !effectiveMeetingLink');
    expect(leadPage).toContain('a.appointmentType === "online" && !a.meetingLink');
    expect(patientPage).toContain('a.appointmentType === "online" && !a.meetingLink');
    expect(calendarPage).toContain("canGenerateMeetFromSavedAppointment");
    expect(calendarPage).toContain('editAppointment.appointmentType === "online"');
    expect(calendarPage).toContain("liveMeetingLink");
    expect(calendarPage).toContain("setLiveMeetingLink(result.meetingLink)");
  });

  it("shows the overnight helper only for an earlier end clock and keeps duration in the time section", () => {
    for (const page of [calendarPage, leadPage, patientPage]) {
      expect(page).toContain("form.endTime < form.time");
    }
    const endTimeIndex = calendarPage.indexOf("<Label>End Time</Label>");
    const durationIndex = calendarPage.indexOf("<Label>Duration <span");
    const typeIndex = calendarPage.indexOf("<Label>Appointment Type</Label>");
    expect(endTimeIndex).toBeGreaterThan(-1);
    expect(durationIndex).toBeGreaterThan(endTimeIndex);
    expect(durationIndex).toBeLessThan(typeIndex);
  });

  it("waits briefly after a new sync before resolving or exposing the mapped Google event link", () => {
    expect(calendarPage).toContain("const [eventOpenReady, setEventOpenReady] = useState(false)");
    expect(calendarPage).toContain('const [eventReadinessPhase, setEventReadinessPhase] = useState<"idle" | "settling" | "verifying" | "ready" | "timeout">("idle")');
    expect(calendarPage).toContain("5_000 - (Date.now() - synchronizedAt)");
    expect(calendarPage).toContain("enabled: Boolean(googleSync?.canOpenInGoogle && eventOpenReady)");
    expect(calendarPage).toContain("Synchronizing appointment with Google Calendar… ${eventSecondsRemaining}s");
    expect(calendarPage).toContain("Verifying that the mapped Google Calendar event is ready…");
    expect(calendarPage).toContain("Google Calendar readiness could not be confirmed yet.");
    expect(calendarPage).toContain("Retry verification");
    expect(calendarPage).toContain('googleSync.canOpenInGoogle && eventReadinessPhase === "ready" && resolvedGoogleEventUrl');
    expect(calendarPage).toContain("window.clearInterval(countdownTimer);");
    expect(calendarPage).toContain("const transitionTimer = window.setTimeout");
    expect(calendarPage).toContain("setEventReadinessPhase(\"ready\")");
    expect(calendarPage).toContain("setEventReadinessPhase(\"timeout\")");
    expect(calendarPage).toContain("if (googleSync.verifiedEventUrl)");
    expect(calendarPage).toContain("const resolvedGoogleEventUrl = googleSync?.verifiedEventUrl || googleEventLink?.url");
    expect(calendarPage).toContain("Transient Google errors retain the last-known Ready UI state.");
  });

  it("gates manual Google Meet generation behind the same mapped-event preparation state", () => {
    expect(calendarPage).toContain('const isMappedEventPreparing = Boolean(googleSync?.canOpenInGoogle && eventReadinessPhase !== "ready")');
    expect(calendarPage).toContain("disabled={generateGoogleMeet.isPending || isMappedEventPreparing}");
    expect(calendarPage).toContain("Preparing Google event…");
    expect(calendarPage).toContain("Google Meet will be available once the mapped event is ready.");
  });

  it("blocks active meeting-link actions for cancelled appointments while retaining historical link data", () => {
    for (const page of [calendarPage, leadPage, patientPage]) {
      expect(page).toContain('a.status === "cancelled"');
      expect(page).toContain("Previously Saved Meeting Link");
      expect(page).toContain("Meeting-link actions are unavailable while this appointment is cancelled.");
      expect(page).toContain("Re-activate it to create or replace a meeting link.");
    }
    expect(calendarPage).toContain('const isCancelledEdit = Boolean(isEdit && editAppointment?.status === "cancelled")');
    expect(googleService).toContain("canUseMeetingLinkActions(source.status)");
  });

  it("rejects server-side meeting-link add, change, and clear actions before mutation while allowing reactivated appointments", () => {
    expect(() => assertMeetingLinkActionAllowed("cancelled")).toThrow("Meeting links cannot be changed while an appointment is cancelled");
    expect(canUseMeetingLinkActions("cancelled")).toBe(false);
    expect(canUseMeetingLinkActions("upcoming")).toBe(true);
    expect(() => assertMeetingLinkActionAllowed("upcoming")).not.toThrow();
    const routerSource = readFileSync(resolve(root, "server/routers.ts"), "utf8");
    expect(routerSource).toContain("if (dbData.meetingLink !== undefined)");
    expect(routerSource).toContain("assertMeetingLinkActionAllowed(existing.status)");
  });

  it("sends an explicit null when a saved Online meeting link is cleared and uses direct same-tab Google navigation", () => {
    expect(calendarPage).toContain('form.meetingLink.trim() || (isEdit ? null : undefined)');
    expect(leadPage).toContain('editForm.meetingLink.trim() || null');
    expect(patientPage).toContain('editForm.meetingLink.trim() || null');
    expect(calendarPage).toContain('window.location.assign(resolvedGoogleEventUrl)');
    expect(calendarPage).not.toContain('window.open(googleEventLink.url!, "_blank"');
  });

  it("offers a local clear control in every Online meeting-link form without auto-saving", () => {
    for (const page of [calendarPage, leadPage, patientPage]) {
      expect(page).toContain('aria-label="Clear meeting link"');
      expect(page).toContain('meetingLink: ""');
      expect(page).toContain('type="button" variant="ghost" size="icon"');
    }
  });

  it("attempts one bounded Google Meet generation only after a new Online appointment has a successful mapped event", () => {
    const routerSource = readFileSync(resolve(root, "server/routers.ts"), "utf8");
    expect(routerSource).toContain('const initialGoogleSync = await runGoogleCalendarG2Sync(appointmentId, true');
    expect(routerSource).toContain('modeFields.appointmentType === "online" && !modeFields.meetingLink && initialGoogleSync.status === "synced"');
    expect(routerSource).toContain("const meetResult = await generateGoogleCalendarAppointmentMeet(appointmentId)");
  });
});

describe("Direct appointment deletion lifecycle", () => {
  const routerSource = readFileSync(resolve(root, "server/routers.ts"), "utf8");
  const deleteStart = routerSource.indexOf("delete: staffOrAdminProcedure");
  const deleteEnd = routerSource.indexOf("bulkRescheduleOrReassign", deleteStart);
  const deleteProcedure = routerSource.slice(deleteStart, deleteEnd);

  it("allows direct deletion regardless of current appointment status", () => {
    expect(deleteProcedure).not.toContain("Cannot delete a completed appointment");
    expect(deleteProcedure).not.toContain("appt?.status");
    expect(deleteProcedure).toContain("await deleteAppointment(input.id)");
  });

  it("records an optional deletion reason without creating cancellation or participant-email side effects", () => {
    expect(deleteProcedure).toContain('const reason = input.reason?.trim() || undefined');
    expect(deleteProcedure).toContain('"deleted", undefined, reason ?? "No reason provided"');
    expect(deleteProcedure).toContain("getAppointmentDeletionAuditSnapshot(input.id)");
    expect(deleteProcedure).toContain("formatAppointmentDeletionAuditDescription(snapshot, reason)");
    expect(deleteProcedure).toContain("delete_appointment");
    expect(deleteProcedure).not.toContain("appointment_cancelled");
    expect(deleteProcedure).not.toContain("cancellationReason");
    expect(deleteProcedure).not.toContain("sendAppointment");
  });

  it("keeps the existing mapped Google-event deletion after Fertiliv deletion and never creates a new event", () => {
    expect(deleteProcedure.indexOf("await deleteAppointment(input.id)")).toBeLessThan(deleteProcedure.indexOf("runGoogleCalendarG2Deletion(input.id)"));
    expect(deleteProcedure).toContain("google_event_removed");
    expect(deleteProcedure).not.toContain("runGoogleCalendarG2Sync(input.id, true");
    expect(googleService).toContain("deleteGoogleCalendarAppointmentEvent");
    expect(googleService).toContain('method: "DELETE"');
  });

  it("removes cancel-first UI gates while retaining separate Cancel and delete-confirmation actions", () => {
    for (const page of [calendarPage, leadPage, patientPage]) {
      expect(page).not.toContain("Cancel Before Deleting");
      expect(page).not.toContain("Cancel Appointment First");
      expect(page).not.toContain("showCancelFirstDialog");
      expect(page).toContain("setShowDeleteDialog(true)");
      expect(page).toContain("Reason for deletion (optional)");
      expect(page).toContain("Permanently Delete");
      expect(page).toContain("Cancel Appointment");
      expect(page.lastIndexOf("setShowDeleteDialog(true)")).toBeGreaterThan(
        page.indexOf('a.status !== "completed" && a.status !== "cancelled"'),
      );
    }
  });

  it("preserves the ordinary cancel and re-activate lifecycle", () => {
    expect(routerSource).toContain('"appointment_cancelled"');
    expect(routerSource).toContain('"appointment_reactivated"');
  });
});
