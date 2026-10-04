export type AppointmentDeletionAuditDetails = {
  appointmentReference: string;
  appointmentId: string;
  personType: "Patient" | "Lead" | "Unlinked";
  personName: string;
  scheduledAt: string;
  originalStatus: string;
  reason?: string;
};

/** Parses only the established non-clinical snapshot format; all other audit events remain generic. */
export function parseAppointmentDeletionAuditDetails(description?: string | null): AppointmentDeletionAuditDetails | null {
  if (!description) return null;
  const match = description.match(
    /^Deleted appointment (.+) \(ID (\d+)\) \| (Patient|Lead|Unlinked): (.+) \| Scheduled: (.+) \| Status: (.+?)(?: \| Reason: (.+))?$/,
  );
  if (!match) return null;
  return {
    appointmentReference: match[1],
    appointmentId: match[2],
    personType: match[3] as AppointmentDeletionAuditDetails["personType"],
    personName: match[4],
    scheduledAt: match[5],
    originalStatus: match[6],
    reason: match[7] || undefined,
  };
}
