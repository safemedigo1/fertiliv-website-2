export const APPOINTMENT_MODES = ["in-clinic", "online", "external"] as const;
export type AppointmentMode = (typeof APPOINTMENT_MODES)[number];

export const DEFAULT_APPOINTMENT_DURATION_MINUTES = 30;
export const MEETING_LINK_VALIDATION_MESSAGE = "Please enter a valid link starting with https:// or http://";

export function validateOptionalMeetingLink(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? null : MEETING_LINK_VALIDATION_MESSAGE;
  } catch {
    return MEETING_LINK_VALIDATION_MESSAGE;
  }
}

export type AppointmentTimingInput = {
  appointmentDate: Date;
  endDate?: Date | null;
  duration?: number | null;
};

export type NormalizedAppointmentTiming = {
  appointmentDate: Date;
  endDate: Date;
  duration: number;
};

export function effectiveAppointmentEnd(input: AppointmentTimingInput): Date {
  if (input.endDate) return new Date(input.endDate);
  const duration = input.duration ?? DEFAULT_APPOINTMENT_DURATION_MINUTES;
  return new Date(new Date(input.appointmentDate).getTime() + duration * 60_000);
}

export function normalizeAppointmentTiming(input: AppointmentTimingInput): NormalizedAppointmentTiming {
  const appointmentDate = new Date(input.appointmentDate);
  if (Number.isNaN(appointmentDate.getTime())) throw new Error("Appointment start time is invalid.");

  const endDate = effectiveAppointmentEnd(input);
  if (Number.isNaN(endDate.getTime()) || endDate <= appointmentDate) {
    throw new Error("Appointment end time must be after its start time.");
  }

  const duration = Math.round((endDate.getTime() - appointmentDate.getTime()) / 60_000);
  if (duration < 1 || duration > 24 * 60) {
    throw new Error("Appointment duration must be between 1 minute and 24 hours.");
  }

  return { appointmentDate, endDate, duration };
}

export function endDateFromLocalTime(startDate: Date, endTime: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(endTime);
  if (!match) return null;
  const end = new Date(startDate);
  end.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (end <= startDate) end.setDate(end.getDate() + 1);
  return end;
}

export function localTimeValue(date: Date): string {
  const normalized = new Date(date);
  return `${String(normalized.getHours()).padStart(2, "0")}:${String(normalized.getMinutes()).padStart(2, "0")}`;
}

export type ModeScopedAppointmentFields = {
  appointmentType: AppointmentMode;
  meetingLink: string | null;
  externalLocation: string | null;
  partnerClinicId: number | null;
};

export type ExternalLocationResolutionInput = {
  appointmentType?: string | null;
  externalLocation?: string | null;
  partnerClinicId?: number | null;
  partnerClinicName?: string | null;
  partnerClinicAddress?: string | null;
};

/**
 * The partner-clinic relationship and the manual address are mutually exclusive
 * external-location sources. A selected clinic always wins over a historical
 * manual string, so legacy stale values cannot leak to detail, ICS, or Google.
 */
export function resolveEffectiveExternalLocation(input: ExternalLocationResolutionInput): string | null {
  if (input.appointmentType !== "external") return null;
  if (input.partnerClinicId) {
    const clinicLocation = [input.partnerClinicName?.trim(), input.partnerClinicAddress?.trim()].filter(Boolean).join(", ");
    return clinicLocation || null;
  }
  return input.externalLocation?.trim() || null;
}

export function normalizeModeScopedAppointmentFields(input: ModeScopedAppointmentFields): ModeScopedAppointmentFields {
  if (input.appointmentType === "online") {
    return {
      appointmentType: input.appointmentType,
      meetingLink: input.meetingLink?.trim() || null,
      externalLocation: null,
      partnerClinicId: null,
    };
  }

  if (input.appointmentType === "external") {
    return {
      appointmentType: input.appointmentType,
      meetingLink: null,
      externalLocation: input.partnerClinicId ? null : (input.externalLocation?.trim() || null),
      partnerClinicId: input.partnerClinicId ?? null,
    };
  }

  return {
    appointmentType: "in-clinic",
    meetingLink: null,
    externalLocation: null,
    partnerClinicId: null,
  };
}
