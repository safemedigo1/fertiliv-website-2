export const CANCELLED_MEETING_LINK_GUARD_MESSAGE = "Meeting links cannot be changed while an appointment is cancelled. Re-activate the appointment first.";

export function assertMeetingLinkActionAllowed(status: string | null | undefined): void {
  if (status === "cancelled") {
    throw new Error(CANCELLED_MEETING_LINK_GUARD_MESSAGE);
  }
}

export function canUseMeetingLinkActions(status: string | null | undefined): boolean {
  return status !== "cancelled";
}
