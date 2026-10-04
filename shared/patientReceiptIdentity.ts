export type PatientReceiptIdentity = {
  displayName: string;
  mrn?: string;
};

export function resolvePatientReceiptIdentity(patient?: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  mrn?: string | null;
} | null): PatientReceiptIdentity {
  const displayName = [patient?.firstName, patient?.middleName, patient?.lastName]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return {
    displayName: displayName || "Patient identity unavailable",
    mrn: patient?.mrn?.trim() || undefined,
  };
}
