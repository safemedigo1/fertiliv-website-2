export function isAppointmentReactivation(
  previousStatus: string | null | undefined,
  nextStatus: string | null | undefined,
): boolean {
  return previousStatus === "cancelled" && nextStatus !== undefined && nextStatus !== "cancelled";
}
