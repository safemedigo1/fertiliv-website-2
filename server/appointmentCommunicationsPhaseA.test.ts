import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildAppointmentCommunicationProjection, formatAppointmentDateTimeInIstanbul } from "../shared/appointmentCommunication";
import { APPOINTMENT_COMMUNICATION_PUBLISHED_LOCALES, resolveAppointmentCommunicationLocale, resolveRecipientProfileLanguage } from "../shared/appointmentCommunicationLocales";
import { resolvePhysicalAppointmentLocation } from "../shared/appointmentPhysicalLocation";
import { getEmailHeaderPresentation, renderAppointmentDetailsEmail, wrapAppointmentCommunicationEmail } from "./emailService";

const root = resolve(import.meta.dirname, "..");
const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
const routerSource = readFileSync(resolve(root, "server/routers.ts"), "utf8");
const dbSource = readFileSync(resolve(root, "server/db.ts"), "utf8");
const emailSource = readFileSync(resolve(root, "server/emailService.ts"), "utf8");
const sendModalSource = readFileSync(resolve(root, "client/src/components/AppointmentDetailsSendModal.tsx"), "utf8");
const calendarPage = readFileSync(resolve(root, "client/src/pages/CalendarPage.tsx"), "utf8");
const leadPage = readFileSync(resolve(root, "client/src/pages/LeadDetailPage.tsx"), "utf8");
const patientPage = readFileSync(resolve(root, "client/src/pages/PatientDetailPage.tsx"), "utf8");

const baseInput = {
  recipientName: "Ayla Patient",
  appointment: {
    appointmentDate: new Date("2026-12-02T10:00:00.000Z"),
    endDate: new Date("2026-12-02T10:45:00.000Z"),
    duration: 45,
    type: "consultation",
    appointmentType: "online",
    meetingLink: "https://meet.example/room",
  },
  clinic: {
    nameEn: "Fertiliv IVF Center",
    nameAr: "مركز فيرتيليف",
    nameTr: "Fertiliv Tüp Bebek Merkezi",
    addressEn: "Istanbul",
    addressAr: "إسطنبول",
    addressTr: "İstanbul",
    mapsLink: "https://maps.example/clinic",
  },
};

describe("Communications Phase A safe appointment projection", () => {
  it("uses only approved operational fields and ignores free text or sensitive data supplied at runtime", () => {
    const projection = buildAppointmentCommunicationProjection({
      ...baseInput,
      appointment: {
        ...baseInput.appointment,
        title: "Sensitive internal title",
        notes: "Internal medical note",
        cancellationReason: "Private reason",
        mrn: "MRN-123",
      } as any,
    }, "en");

    expect(projection).toMatchObject({
      recipientName: "Ayla Patient",
      operationalLabel: "Consultation",
      modeLabel: "Online",
      meetingLink: "https://meet.example/room",
    });
    expect(JSON.stringify(projection)).not.toContain("Sensitive internal title");
    expect(JSON.stringify(projection)).not.toContain("Internal medical note");
    expect(JSON.stringify(projection)).not.toContain("Private reason");
    expect(JSON.stringify(projection)).not.toContain("MRN-123");
    expect(projection).not.toHaveProperty("title");
    expect(projection).not.toHaveProperty("notes");
    expect(projection).not.toHaveProperty("doctorName");
  });

  it("includes an active meeting link only for Online mode", () => {
    const online = buildAppointmentCommunicationProjection(baseInput, "en");
    const external = buildAppointmentCommunicationProjection({
      ...baseInput,
      appointment: {
        ...baseInput.appointment,
        appointmentType: "external",
        partnerClinicId: 7,
        externalLocation: "Stale location",
      },
      partnerClinic: { name: "Safemedigo", address: "Structured address", googleMapsUrl: "https://maps.example/safemedigo" },
    }, "en");

    expect(online.meetingLink).toBe("https://meet.example/room");
    expect(external.meetingLink).toBeUndefined();
    expect(external.locationLabel).toBe("Safemedigo, Structured address");
    expect(external.mapLink).toBe("https://maps.example/safemedigo");
  });

  it("supports only the approved EN, AR, and TR operational copy", () => {
    expect(buildAppointmentCommunicationProjection(baseInput, "en").operationalLabel).toBe("Consultation");
    expect(buildAppointmentCommunicationProjection(baseInput, "ar").operationalLabel).toBe("استشارة");
    expect(buildAppointmentCommunicationProjection(baseInput, "tr").operationalLabel).toBe("Konsültasyon randevusu");
    expect(buildAppointmentCommunicationProjection(baseInput, "ar").clinicName).toBe("مركز فيرتيليف");
  });

  it("renders a persisted 09:00 Istanbul appointment as 09:00 even when the runtime timezone is UTC", () => {
    const formatted = formatAppointmentDateTimeInIstanbul(new Date("2026-09-01T06:00:00.000Z"), "en");
    expect(formatted.time).toMatch(/09:00/);
  });

  it("resolves physical location from authoritative clinic or external sources instead of mode labels", () => {
    expect(resolvePhysicalAppointmentLocation({
      appointmentType: "in-clinic", clinicName: "Fertiliv IVF Center", clinicAddress: "Şişli, Istanbul",
    })).toBe("Fertiliv IVF Center, Şişli, Istanbul");
    expect(resolvePhysicalAppointmentLocation({
      appointmentType: "external", partnerClinicId: 5, partnerClinicName: "Safemedigo", partnerClinicAddress: "Partner Avenue",
    })).toBe("Safemedigo, Partner Avenue");
    expect(resolvePhysicalAppointmentLocation({ appointmentType: "external", externalLocation: "Manual external address" })).toBe("Manual external address");
    expect(resolvePhysicalAppointmentLocation({ appointmentType: "online", clinicName: "Fertiliv IVF Center", clinicAddress: "Istanbul" })).toBeNull();
  });
});

describe("Communications Phase A contracts", () => {
  it("keeps delivery audit metadata-only with one row per recipient and no body snapshot", () => {
    expect(schema).toContain('appointmentCommunicationDeliveries = pgTable("appointment_communication_deliveries"');
    expect(schema).toContain('sendGroupId: varchar("sendGroupId"');
    expect(schema).toContain('pgEnum("pg_recipientType", ["patient", "lead", "partner", "additional"])');
    expect(schema).toContain('profileLanguage: varchar("profileLanguage"');
    expect(schema).toContain('localeFallbackUsed: boolean("localeFallbackUsed")');
    expect(schema).toContain('providerMessageId: varchar("providerMessageId"');
    expect(schema).not.toContain("bodySnapshot");
  });

  it("uses a staff-or-admin manual send procedure with explicit recipient validation and no Google operation", () => {
    const start = routerSource.indexOf("sendDetails: appointmentCommunicationsProcedure");
    const end = routerSource.indexOf("googleSyncStatus: staffOrAdminProcedure", start);
    const procedure = routerSource.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(routerSource).toContain("const appointmentCommunicationsProcedure = protectedProcedure.use");
    expect(routerSource).toContain('ctx.user.role !== "admin" && ctx.user.role !== "staff"');
    expect(procedure).toContain('source: z.enum(["primary", "partner", "additional"])');
    expect(procedure).toContain('language: z.string().trim().min(2).max(16)');
    expect(procedure).toContain("resolveAppointmentCommunicationLocale");
    expect(procedure).toContain("isManualAppointmentCommunicationStatus(context.appointment.status)");
    expect(procedure).toContain("createAppointmentCommunicationDelivery");
    expect(procedure).toContain("sendGroupId");
    expect(procedure).toContain('"appointment_details_email_manual_send"');
    expect(procedure).not.toContain("runGoogleCalendarG2Sync");
    expect(procedure).not.toContain("googleCalendar");
  });

  it("disables all legacy automatic participant appointment emails while retaining the manual sender", () => {
    expect(routerSource).not.toContain("sendAppointmentCreatedEmail(");
    expect(routerSource).not.toContain("sendAppointmentConfirmedEmail(");
    expect(routerSource).not.toContain("sendAppointmentCancelledEmail(");
    expect(routerSource).not.toContain("sendAppointmentRescheduledEmail(");
    expect(routerSource).toContain("createNotification({");
    expect(routerSource).toContain("runGoogleCalendarG2Sync");
    expect(routerSource).toContain("sendAppointmentDetailsEmail(recipient.email");
  });

  it("uses the shared physical-location resolver in Google and ICS while keeping the mapped-event contract unchanged", () => {
    const googleService = readFileSync(resolve(root, "server/googleCalendarService.ts"), "utf8");
    const database = readFileSync(resolve(root, "server/db.ts"), "utf8");
    expect(googleService).toContain('import { resolvePhysicalAppointmentLocation } from "../shared/appointmentPhysicalLocation"');
    expect(googleService).toContain("return resolvePhysicalAppointmentLocation(source) ?? undefined;");
    expect(googleService).not.toContain('return "In-Clinic"');
    expect(database).toContain("clinicName: clinic?.nameEn?.trim()");
    expect(calendarPage).toContain("resolvePhysicalAppointmentLocation({ ...appt, clinicName, clinicAddress })");
    expect(calendarPage).toContain("downloadICS(a, clinicInfo)");
    expect(googleService).toContain('timeZone: G2_TIMEZONE');
    expect(googleService).toContain('"fertiliv.g2": "1"');
  });

  it("uses static approved-language templates rather than automatic translation fallback", () => {
    const start = emailSource.indexOf("export async function sendAppointmentDetailsEmail");
    const end = emailSource.indexOf("// ─── Public API", start);
    const sender = emailSource.slice(start, end);
    expect(emailSource).toContain('export type AppointmentDetailsLanguage = string');
    expect(emailSource).toContain("export function renderAppointmentDetailsEmail");
    expect(sender).toContain("resolveAppointmentCommunicationLocale(language).deliveredLocale");
    expect(sender).toContain("renderAppointmentDetailsEmail({ ...data, whatsAppLink: waLink }, deliveredLanguage)");
    expect(sender).not.toContain("translateContent");
    expect(sender).not.toContain("sendInline");
  });

  it("shows an optional, unchecked linked partner and the same entry point on all appointment-detail surfaces", () => {
    expect(sendModalSource).toContain('selected: recipient.source === "primary"');
    expect(sendModalSource).toContain("linked partner");
    expect(sendModalSource).toContain("Add another email");
    expect(sendModalSource).toContain("useDraftForm");
    expect(sendModalSource).toContain("useBeforeUnload");
    for (const page of [calendarPage, leadPage, patientPage]) {
      expect(page).toContain("AppointmentDetailsSendModal");
      expect(page).toContain("appointmentCommunicationActionLabel(a.status)");
    }
  });

  it("renders complete confirmed details and a safe cancellation notice with a clinic-configured WhatsApp CTA", () => {
    const base = {
      recipientName: "Ayla Patient", appointmentDate: "01 September 2026", startTime: "09:00", endTime: "10:00",
      operationalLabel: "Consultation", modeLabel: "Online", locationLabel: "Fertiliv IVF Center, Istanbul",
      mapLink: "https://maps.example/fertiliv", meetingLink: "https://meet.example/room", whatsAppLink: "https://wa.me/905011147060",
    };
    const confirmed = renderAppointmentDetailsEmail({ ...base, communicationKind: "confirmation" }, "en");
    expect(confirmed.subject).toContain("Appointment Confirmed");
    for (const expected of ["01 September 2026", "09:00", "10:00", "Consultation", "Online", "Open map", "Join meeting"]) {
      expect(confirmed.body).toContain(expected);
    }
    expect(confirmed.body).toContain("appointment-info-table");
    expect(confirmed.body).toContain("https://wa.me/905011147060");

    const cancelled = renderAppointmentDetailsEmail({ ...base, communicationKind: "cancellation" }, "ar");
    expect(cancelled.subject).toContain("تم إلغاء موعدك");
    expect(cancelled.body).toContain("تم إلغاء موعدكم");
    expect(cancelled.body).not.toContain("https://maps.example/fertiliv");
    expect(cancelled.body).not.toContain("https://meet.example/room");
    expect(cancelled.body).not.toContain("Cancellation Reason");
    expect(cancelled.body).toContain("لترتيب موعد جديد");
  });

  it("uses the existing dark/navy logo for light email headers, preserves the white CID logo for dark headers, and protects WhatsApp CTA text contrast", () => {
    expect(getEmailHeaderPresentation("light")).toMatchObject({
      backgroundColor: "#E3B2B0",
      logoSrc: "https://pro.fertiliv.com/manus-storage/fertiliv-logo-darkblue_72725610.png",
    });
    expect(getEmailHeaderPresentation("dark")).toMatchObject({
      backgroundColor: "#1E0566",
      logoSrc: "cid:fertiliv-logo-white",
    });

    const body = renderAppointmentDetailsEmail({
      recipientName: "Ayla", appointmentDate: "01 September 2026", startTime: "09:00", endTime: "10:00",
      operationalLabel: "Consultation", modeLabel: "In-clinic", whatsAppLink: "https://wa.me/905011147060",
    }, "en").body;
    const html = wrapAppointmentCommunicationEmail(body, "en");
    expect(html).toContain('background-image:linear-gradient(#25D366,#25D366)');
    expect(html).toContain('color:#ffffff !important;-webkit-text-fill-color:#ffffff !important;');
    expect(html).toContain('<span style="color:#ffffff !important;-webkit-text-fill-color:#ffffff !important;">Contact us on WhatsApp</span>');
    expect(html).toContain('<meta name="color-scheme" content="light only" />');
    expect(html).toContain('class="header" style="background-color:#E3B2B0;background-image:linear-gradient(#E3B2B0,#E3B2B0);"');
    expect(html).toContain('class="footer" style="background-color:#E3B2B0;background-image:linear-gradient(#E3B2B0,#E3B2B0);"');
  });

  it("does not emit citation-like artifacts in the Phase A subject or rendered HTML", () => {
    for (const language of ["en", "ar", "tr"] as const) {
      const rendered = renderAppointmentDetailsEmail({
        recipientName: "Ayla", appointmentDate: "01 September 2026", startTime: "09:00", endTime: "10:00",
        operationalLabel: "Consultation", modeLabel: "In-clinic", communicationKind: "details",
      }, language);
      expect(`${rendered.subject}\n${rendered.body}`).not.toMatch(/\[cite(?::|\])/i);
    }
  });

  it("keeps Appointment Details mobile-safe with explicit close controls and unambiguous destructive actions", () => {
    for (const page of [calendarPage, leadPage, patientPage]) {
      expect(page).toContain('max-h-[92dvh]');
      expect(page).toContain("overflow-y-auto overscroll-contain");
      expect(page).toContain(">Close</Button>");
      expect(page).toContain("Cancel Appointment");
      expect(page).toContain("Delete Appointment");
    }
  });

  it("styles the Google open-event action as success-ready only from the existing verified-ready condition", () => {
    expect(calendarPage).toContain('eventReadinessPhase === "ready" && resolvedGoogleEventUrl');
    expect(calendarPage).toContain("border-emerald-200 bg-emerald-50");
    expect(calendarPage).toContain('eventReadinessPhase !== "ready" && eventReadinessPhase !== "timeout"');
    expect(calendarPage).toContain("Verifying Google event…");
    expect(calendarPage).toContain("setEventReadinessPhase");
  });

  it("publishes fixed reviewed L1 resources and resolves unsupported or other profile languages to English", () => {
    expect(APPOINTMENT_COMMUNICATION_PUBLISHED_LOCALES).toHaveLength(29);
    for (const locale of APPOINTMENT_COMMUNICATION_PUBLISHED_LOCALES) {
      expect(resolveAppointmentCommunicationLocale(locale)).toMatchObject({ deliveredLocale: locale, fallbackUsed: false });
    }
    expect(resolveAppointmentCommunicationLocale("ar")).toMatchObject({ deliveredLocale: "ar", fallbackUsed: false });
    expect(resolveAppointmentCommunicationLocale("ur")).toMatchObject({ deliveredLocale: "ur", fallbackUsed: false });
    expect(resolveAppointmentCommunicationLocale("fa")).toMatchObject({ deliveredLocale: "fa", fallbackUsed: false });
    expect(resolveAppointmentCommunicationLocale("so")).toMatchObject({ deliveredLocale: "so", fallbackUsed: false });
    expect(resolveAppointmentCommunicationLocale("fr")).toMatchObject({ deliveredLocale: "fr", fallbackUsed: false });
    expect(resolveAppointmentCommunicationLocale("ko")).toMatchObject({ deliveredLocale: "ko", fallbackUsed: false });
    expect(resolveAppointmentCommunicationLocale("pt")).toMatchObject({ deliveredLocale: "pt", fallbackUsed: false });
    expect(resolveAppointmentCommunicationLocale("no")).toMatchObject({ deliveredLocale: "no", fallbackUsed: false });
    expect(resolveAppointmentCommunicationLocale("other")).toMatchObject({ deliveredLocale: "en", fallbackUsed: true });
    expect(resolveAppointmentCommunicationLocale(null)).toMatchObject({ deliveredLocale: "en", fallbackUsed: false });
  });

  it("resolves each primary and linked partner from that recipient's own authoritative profile language", () => {
    expect(resolveRecipientProfileLanguage("ur", "ur")).toBe("ur");
    expect(resolveRecipientProfileLanguage("fa", "fa")).toBe("fa");
    expect(resolveRecipientProfileLanguage("ur", "fa")).toBe("fa");
    expect(resolveRecipientProfileLanguage("fa", "ur")).toBe("ur");
    expect(resolveRecipientProfileLanguage(null, null)).toBeNull();
    expect(resolveAppointmentCommunicationLocale(resolveRecipientProfileLanguage("so", "so"))).toMatchObject({ deliveredLocale: "so", fallbackUsed: false });
    expect(resolveAppointmentCommunicationLocale(resolveRecipientProfileLanguage("fa", "fa"))).toMatchObject({ deliveredLocale: "fa", fallbackUsed: false });
    expect(resolveAppointmentCommunicationLocale(resolveRecipientProfileLanguage("ur", "ur"))).toMatchObject({ deliveredLocale: "ur", fallbackUsed: false });
  });

  it("renders each published L1 locale deterministically and preserves cancellation link restrictions", () => {
    for (const locale of APPOINTMENT_COMMUNICATION_PUBLISHED_LOCALES) {
      const rendered = renderAppointmentDetailsEmail({ recipientName: "Ayla", appointmentDate: "01 September 2026", startTime: "09:00", endTime: "10:00", operationalLabel: "Consultation", modeLabel: "Online", locationLabel: "Istanbul", mapLink: "https://maps.example/x", meetingLink: "https://meet.example/x", communicationKind: "cancellation" }, locale);
      expect(rendered.subject).toBeTruthy();
      expect(rendered.body).not.toContain("https://maps.example/x");
      expect(rendered.body).not.toContain("https://meet.example/x");
      expect(`${rendered.subject}\n${rendered.body}`).not.toMatch(/\[cite(?::|\])/i);
    }
  });

  it("uses each published RTL appointment locale for the complete email shell", () => {
    const body = "<p>Appointment communication</p>";
    for (const language of ["ar", "fa", "ur", "he"] as const) {
      const html = wrapAppointmentCommunicationEmail(body, language);
      expect(html).toContain(`<html lang="${language}" dir="rtl">`);
      expect(html).toContain("direction: rtl; text-align: right;");
    }

    const englishHtml = wrapAppointmentCommunicationEmail(body, "en");
    expect(englishHtml).toContain('<html lang="en" dir="ltr">');
    expect(englishHtml).toContain("direction: ltr; text-align: left;");
  });

  it("passes per-recipient delivered defaults and transparent fallback metadata to the modal without reusing pre-L1 drafts", () => {
    expect(routerSource).toContain("defaultLanguage: locale.deliveredLocale");
    expect(routerSource).toContain("localeFallbackUsed: locale.fallbackUsed");
    expect(sendModalSource).toContain("language: normalizeSupportedLanguage(recipient.defaultLanguage)");
    expect(sendModalSource).toContain("appointment-details-email-l1-${appointmentId}");
    expect(sendModalSource).toContain("English fallback from");
    expect(sendModalSource).toContain('refetchOnMount: "always"');
    expect(sendModalSource).toContain("!open || !options || isFetching");
    expect(dbSource).toContain("eq(leads.convertedPatientId, appointment.patientId)");
    expect(dbSource).toContain("resolveRecipientProfileLanguage(");
    expect(dbSource).toContain("eq(leads.convertedPatientId, partner.id)");
    expect(dbSource).toContain("effectivePartnerLanguage");
    expect(emailSource).toContain("wrapAppointmentCommunicationEmail(template.body, deliveredLanguage");
    expect(emailSource).toContain("getAppointmentCommunicationLocaleResource(locale)");
  });
});
