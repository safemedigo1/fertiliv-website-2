export type AppointmentBulkCancelStatus = "upcoming" | "confirmed" | "cancelled" | "completed" | "no_show" | "rescheduled";

export type BulkCancelOutcome = "cancelled" | "skipped_already_cancelled" | "skipped_completed" | "skipped_no_show" | "skipped_rescheduled";

export function getBulkCancelOutcome(status: AppointmentBulkCancelStatus): BulkCancelOutcome {
  if (status === "cancelled") return "skipped_already_cancelled";
  if (status === "completed") return "skipped_completed";
  if (status === "no_show") return "skipped_no_show";
  if (status === "rescheduled") return "skipped_rescheduled";
  return "cancelled";
}

export function resolveBulkAppointmentReason(individualReason?: string | null, generalReason?: string | null) {
  const individual = individualReason?.trim();
  if (individual) return individual;
  const general = generalReason?.trim();
  return general || undefined;
}

export function summarizeBulkAppointmentOutcomes<T extends { outcome: string }>(results: T[]) {
  return results.reduce<Record<string, number>>((summary, result) => {
    summary[result.outcome] = (summary[result.outcome] ?? 0) + 1;
    return summary;
  }, {});
}
