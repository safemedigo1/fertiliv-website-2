import { resolveEffectiveExternalLocation } from "./appointmentScheduling";

export type PhysicalAppointmentLocationInput = {
  appointmentType?: string | null;
  externalLocation?: string | null;
  partnerClinicId?: number | null;
  partnerClinicName?: string | null;
  partnerClinicAddress?: string | null;
  clinicName?: string | null;
  clinicAddress?: string | null;
};

/**
 * Resolves the physical destination of an appointment. Mode is deliberately not
 * used as a location label: Online has no physical destination, while In-Clinic
 * derives its destination from the authoritative clinic configuration.
 */
export function resolvePhysicalAppointmentLocation(input: PhysicalAppointmentLocationInput): string | null {
  if (input.appointmentType === "online") return null;
  if (input.appointmentType === "external") {
    return resolveEffectiveExternalLocation(input);
  }

  const clinicLocation = [input.clinicName?.trim(), input.clinicAddress?.trim()].filter(Boolean).join(", ");
  return clinicLocation || null;
}
