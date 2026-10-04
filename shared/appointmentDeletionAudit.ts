export type AppointmentDeletionAuditSnapshot = {
  appointmentId: number;
  appointmentReference: string;
  personType: "Patient" | "Lead" | "Unlinked";
  personName: string;
  appointmentDate: Date;
  status: string;
};

function formatScheduledInIstanbul(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("day")} ${value("month")} ${value("year")} ${value("hour")}:${value("minute")} Europe/Istanbul`;
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

/**
 * Deliberately excludes title, notes, diagnoses, medical content, and financial data.
 * Actor identity and deletion timestamp remain in structured audit_logs fields.
 */
export function formatAppointmentDeletionAuditDescription(
  snapshot: AppointmentDeletionAuditSnapshot,
  reason?: string,
) {
  const segments = [
    `Deleted appointment ${snapshot.appointmentReference} (ID ${snapshot.appointmentId})`,
    `${snapshot.personType}: ${snapshot.personName}`,
    `Scheduled: ${formatScheduledInIstanbul(snapshot.appointmentDate)}`,
    `Status: ${formatStatus(snapshot.status)}`,
  ];
  if (reason?.trim()) segments.push(`Reason: ${reason.trim()}`);
  return segments.join(" | ");
}
