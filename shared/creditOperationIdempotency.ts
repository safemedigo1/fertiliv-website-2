export type CreditOperationIdentity = {
  patientId: number;
  financialScope: "production" | "test";
  applicationId?: number;
};

export function resolveCreditOperationIdempotency<T extends CreditOperationIdentity>(
  existing: T | null | undefined,
  expected: CreditOperationIdentity,
): { kind: "new" } | { kind: "replay"; record: T } {
  if (!existing) return { kind: "new" };
  const samePatient = existing.patientId === expected.patientId;
  const sameScope = existing.financialScope === expected.financialScope;
  const sameApplication = expected.applicationId === undefined || existing.applicationId === expected.applicationId;
  if (!samePatient || !sameScope || !sameApplication) {
    throw new Error("This request key belongs to a different financial operation.");
  }
  return { kind: "replay", record: existing };
}
