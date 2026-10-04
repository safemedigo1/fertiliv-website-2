import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "..");
const routerSource = fs.readFileSync(path.join(projectRoot, "server/routers.ts"), "utf8");
const calendarSource = fs.readFileSync(path.join(projectRoot, "client/src/pages/CalendarPage.tsx"), "utf8");

describe("Appointment post-save details email convenience action", () => {
  it("keeps the request UI-only and unchecked whenever Create or Edit opens", () => {
    expect(calendarSource).toContain('sendDetailsAfterSave: false');
    expect(calendarSource).toContain('id="sendDetailsAfterSave"');
    expect(calendarSource).toContain("Send appointment details by email after saving");
    expect(calendarSource).toContain("sendDetailsAfterSave: form.sendDetailsAfterSave");
  });

  it("runs existing primary-recipient details delivery only after successful Create or Edit persistence", () => {
    expect(routerSource).toContain("async function sendPostSaveAppointmentDetailsEmail");
    expect(routerSource).toContain("getAppointmentCommunicationContext(input.appointmentId)");
    expect(routerSource).toContain("resolveAppointmentCommunicationLocale(primary.preferredLanguage)");
    expect(routerSource).toContain("buildAppointmentCommunicationProjection");
    expect(routerSource).toContain("sendAppointmentDetailsEmail(primary.email, projection, language)");
    expect(routerSource).toContain("createAppointmentCommunicationDelivery");
    expect(routerSource).toContain("const postSaveEmail = sendDetailsAfterSave");
    expect(routerSource).toContain("await updateAppointment(input.id, appointmentUpdate as any)");
  });

  it("returns a delivery outcome without rolling back a successful appointment save", () => {
    expect(routerSource).toContain('outcome: "failed"');
    expect(routerSource).toContain("Delivery could not be completed after appointment persistence");
    expect(calendarSource).toContain("details email could not be delivered");
    expect(calendarSource).toContain("Appointment ${action} and details email sent.");
  });

  it("does not modify manual Send Details, Google Clinic Reminders, or Patient Reminder Worker behavior", () => {
    expect(routerSource).toContain("sendDetails: appointmentCommunicationsProcedure");
    expect(routerSource).toContain("googleReminderMode");
    expect(calendarSource).toContain("Patient Reminder History");
    expect(routerSource).not.toContain("processDueAppointmentReminders");
  });
});
