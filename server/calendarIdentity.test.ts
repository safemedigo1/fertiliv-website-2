import { describe, expect, it } from "vitest";
import {
  buildLeadVisitAppointmentTitle,
  normalizeCalendarAppointmentIdentity,
} from "../shared/calendarIdentity";

describe("Calendar appointment identity normalization", () => {
  it("uses Patient identity and retains the existing MRN-capable Patient relationship", () => {
    expect(normalizeCalendarAppointmentIdentity({
      patientId: 12,
      patientFirstName: "Ayla",
      patientLastName: "Demir",
      leadId: null,
      purpose: "medical-consultation",
    })).toEqual({
      relatedEntityType: "patient",
      relatedEntityId: 12,
      relatedEntityDisplayName: "Ayla Demir",
      shortAppointmentLabel: "Medical Consultation",
    });
  });

  it("uses Lead identity when the appointment has no Patient relation", () => {
    expect(normalizeCalendarAppointmentIdentity({
      patientId: null,
      leadId: 31,
      leadFirstName: "Ahmed",
      leadLastName: "Ali",
      type: "consultation",
    })).toEqual({
      relatedEntityType: "lead",
      relatedEntityId: 31,
      relatedEntityDisplayName: "Ahmed Ali",
      shortAppointmentLabel: "Consultation",
    });
  });

  it("uses a safe explicit fallback when no Lead or Patient is linked", () => {
    expect(normalizeCalendarAppointmentIdentity({ type: "other" })).toMatchObject({
      relatedEntityType: null,
      relatedEntityId: null,
      relatedEntityDisplayName: "Unassigned appointment",
      shortAppointmentLabel: "Other",
    });
  });

  it("retains Patient-first display precedence for the discovered dual-linked legacy row", () => {
    expect(normalizeCalendarAppointmentIdentity({
      patientId: 12,
      patientFirstName: "Ayla",
      patientLastName: "Demir",
      leadId: 31,
      leadFirstName: "Ahmed",
      leadLastName: "Ali",
      type: "consultation",
    })).toMatchObject({
      relatedEntityType: "patient",
      relatedEntityId: 12,
      relatedEntityDisplayName: "Ayla Demir",
    });
  });
});

describe("Medical intake Lead visit title", () => {
  it("uses the Lead's first and last name instead of a non-existent name property", () => {
    expect(buildLeadVisitAppointmentTitle("Ahmed", "Ali")).toBe("Visit – Ahmed Ali");
  });

  it("keeps the existing safe fallback only when Lead name data is absent", () => {
    expect(buildLeadVisitAppointmentTitle(null, null)).toBe("Visit – Lead");
  });
});
