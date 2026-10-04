import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const calendarPage = readFileSync(resolve(root, "client/src/pages/CalendarPage.tsx"), "utf8");
const routers = readFileSync(resolve(root, "server/routers.ts"), "utf8");
const schema = readFileSync(resolve(root, "drizzle/schema.ts"), "utf8");
const presentation = readFileSync(resolve(root, "client/src/components/AppointmentDetailsPresentation.tsx"), "utf8");

describe("Google Calendar Clinic Reminder mode contract", () => {
  it("persists an explicit Calendar Default or Custom mode with Calendar Default as the safe default", () => {
    expect(schema).toContain('googleReminderMode: pg_googleReminderMode("googleReminderMode").default("calendar_default").notNull()');
    expect(routers).toContain('googleReminderMode: z.enum(["calendar_default", "custom"]).optional()');
  });

  it("uses one shared Create/Edit form control and sends its persisted reminder mode through the normal appointment payload", () => {
    expect(calendarPage).toContain('googleReminderMode: "calendar_default" as "calendar_default" | "custom"');
    expect(calendarPage).toContain('googleReminderMode: editAppointment.googleReminderMode === "custom" ? "custom" : "calendar_default"');
    expect(calendarPage).toContain('googleReminderMode: form.googleReminderMode');
    expect(calendarPage).toContain("Clinic Google Calendar Reminders");
    expect(calendarPage).toContain("Use Calendar Default");
    expect(calendarPage).toContain("Custom — 24h Email + 2h Popup");
    expect(calendarPage).not.toContain("Custom — Email 24 hours before, Popup 2 hours before");
    expect(calendarPage).toContain("It does not send a patient email or add attendees.");
  });

  it("does not couple Clinic Google Calendar Reminders to the frozen Patient Reminder Worker", () => {
    const reminderControl = calendarPage.slice(calendarPage.indexOf("Clinic Google Calendar Reminders"), calendarPage.indexOf("Clinic Google Calendar Reminders") + 1_500);
    expect(reminderControl).not.toContain("reminderWorker");
    expect(reminderControl).not.toContain("appointmentReminder");
  });

  it("labels the existing automated-reminder evidence as Patient Reminder History and clarifies that the worker is inactive", () => {
    expect(calendarPage).toContain("Patient Reminder History");
    expect(calendarPage).toContain("Automatic Fertiliv patient reminders are not currently active.");
    expect(calendarPage).not.toContain('font-semibold text-muted-foreground">Reminder History</p>');
  });

  it("keeps Patient Reminder History collapsed by default with a compact status summary and preserves the existing expanded cards", () => {
    expect(calendarPage).toContain('const [showPatientReminderHistory, setShowPatientReminderHistory] = useState(false);');
    expect(calendarPage).toContain("<AppointmentDetailsDisclosure");
    expect(calendarPage).toContain('title="Patient Reminder History"');
    expect(calendarPage).toContain('open={showPatientReminderHistory}');
    expect(calendarPage).toContain('onToggle={() => setShowPatientReminderHistory(v => !v)}');
    expect(calendarPage).toContain('patientReminderHistorySummary');
    expect(calendarPage).toContain('{showPatientReminderHistory && (');
    expect(calendarPage).toContain('reminderHistory.map((reminder: any) => (');
    expect(calendarPage).toContain('reminder.offsetMinutes === 1440 ? "24-hour" : "2-hour"');
    expect(presentation).toContain("aria-expanded={open}");
    expect(presentation).toContain("{open && <div className=\"mt-2\">{children}</div>}");
  });
});
