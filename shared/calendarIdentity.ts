export type CalendarRelatedEntityType = "patient" | "lead" | null;

export type CalendarAppointmentIdentityInput = {
  patientId?: number | null;
  leadId?: number | null;
  patientFirstName?: string | null;
  patientLastName?: string | null;
  leadFirstName?: string | null;
  leadLastName?: string | null;
  purpose?: string | null;
  type?: string | null;
};

export type CalendarAppointmentIdentity = {
  relatedEntityType: CalendarRelatedEntityType;
  relatedEntityId: number | null;
  relatedEntityDisplayName: string;
  shortAppointmentLabel: string;
};

function joinName(firstName?: string | null, lastName?: string | null): string {
  return [firstName, lastName].filter((part): part is string => Boolean(part?.trim())).join(" ").trim();
}

function humanizeAppointmentLabel(value?: string | null): string {
  if (!value) return "Appointment";
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

export function buildLeadVisitAppointmentTitle(firstName?: string | null, lastName?: string | null): string {
  return `Visit – ${joinName(firstName, lastName) || "Lead"}`;
}

/**
 * Produces the sole relationship-aware identity contract for Calendar list rows.
 * A Patient relation takes precedence only for the existing rare dual-linked rows;
 * no relationship state is changed or inferred from the free-text title.
 */
export function normalizeCalendarAppointmentIdentity(
  appointment: CalendarAppointmentIdentityInput,
): CalendarAppointmentIdentity {
  if (appointment.patientId) {
    return {
      relatedEntityType: "patient",
      relatedEntityId: appointment.patientId,
      relatedEntityDisplayName: joinName(appointment.patientFirstName, appointment.patientLastName) || "Patient",
      shortAppointmentLabel: humanizeAppointmentLabel(appointment.purpose ?? appointment.type),
    };
  }

  if (appointment.leadId) {
    return {
      relatedEntityType: "lead",
      relatedEntityId: appointment.leadId,
      relatedEntityDisplayName: joinName(appointment.leadFirstName, appointment.leadLastName) || "Lead",
      shortAppointmentLabel: humanizeAppointmentLabel(appointment.purpose ?? appointment.type),
    };
  }

  return {
    relatedEntityType: null,
    relatedEntityId: null,
    relatedEntityDisplayName: "Unassigned appointment",
    shortAppointmentLabel: humanizeAppointmentLabel(appointment.purpose ?? appointment.type),
  };
}
