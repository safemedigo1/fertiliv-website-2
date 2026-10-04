import { digitsOnly, normalizePhone } from "./phoneUtils";

export const whatsappResolutionStateValues = [
  "unresolved",
  "candidate_single",
  "candidate_multiple",
  "confirmed",
] as const;
export type WhatsAppResolutionState = (typeof whatsappResolutionStateValues)[number];

export const whatsappResolutionReasonValues = [
  "unresolved_connection",
  "unsupported_provider_field",
  "missing_endpoint_identifier",
  "no_exact_phone_match",
  "exact_phone_match",
  "multiple_exact_phone_matches",
  "trusted_endpoint_person_link",
  "multiple_trusted_endpoint_person_links",
] as const;
export type WhatsAppResolutionReason = (typeof whatsappResolutionReasonValues)[number];

export const whatsappResolutionRoutingStateValues = [
  "legacy_env",
  "resolved",
  "unmapped",
  "mismatched",
  "unsupported",
] as const;
export type WhatsAppResolutionRoutingState = (typeof whatsappResolutionRoutingStateValues)[number];

export type WhatsAppCandidateRecordType = "lead" | "patient";
export type WhatsAppCandidateMatchedField = "phone" | "secondaryPhone";

export type WhatsAppResolutionCandidate = {
  recordType: WhatsAppCandidateRecordType;
  recordId: number;
  matchedField: WhatsAppCandidateMatchedField;
  convertedPatientId: number | null;
  candidateKey: string;
};

export type WhatsAppTrustedPersonLink = {
  personIdentityId: number;
};

export type WhatsAppResolutionClassification = {
  resolutionState: WhatsAppResolutionState;
  resolutionReason: WhatsAppResolutionReason;
  confirmedPersonIdentityId: number | null;
  candidates: WhatsAppResolutionCandidate[];
  humanActorResolutionState: "unresolved";
  medicalSubjectResolutionState: "unresolved";
};

export function exactPhoneDigits(value: string | null | undefined): string {
  return digitsOnly(normalizePhone(value ?? "") ?? "");
}

function candidatePersonKey(candidate: WhatsAppResolutionCandidate): string {
  return candidate.convertedPatientId
    ? `patient:${candidate.convertedPatientId}`
    : `${candidate.recordType}:${candidate.recordId}`;
}

export function buildPhoneCandidates(input: {
  endpointPhone: string;
  records: Array<{
    recordType: WhatsAppCandidateRecordType;
    recordId: number;
    phone: string | null;
    secondaryPhone: string | null;
    convertedPatientId?: number | null;
  }>;
}): WhatsAppResolutionCandidate[] {
  const endpointDigits = exactPhoneDigits(input.endpointPhone);
  if (!endpointDigits) return [];

  const byPerson = new Map<string, WhatsAppResolutionCandidate>();
  for (const record of input.records) {
    const phoneFields: Array<[WhatsAppCandidateMatchedField, string | null]> = [
      ["phone", record.phone],
      ["secondaryPhone", record.secondaryPhone],
    ];
    for (const [matchedField, value] of phoneFields) {
      if (!value || exactPhoneDigits(value) !== endpointDigits) continue;
      const candidate: WhatsAppResolutionCandidate = {
        recordType: record.recordType,
        recordId: record.recordId,
        matchedField,
        convertedPatientId: record.convertedPatientId ?? null,
        candidateKey: candidatePersonKey({
          recordType: record.recordType,
          recordId: record.recordId,
          matchedField,
          convertedPatientId: record.convertedPatientId ?? null,
          candidateKey: "",
        }),
      };
      const existing = byPerson.get(candidate.candidateKey);
      if (!existing || existing.matchedField !== "phone" && matchedField === "phone") {
        byPerson.set(candidate.candidateKey, candidate);
      }
    }
  }
  return Array.from(byPerson.values()).sort((a, b) => a.candidateKey.localeCompare(b.candidateKey));
}

export function classifyWhatsAppResolution(input: {
  routingState: WhatsAppResolutionRoutingState;
  endpointIdentifierPresent: boolean;
  candidates: WhatsAppResolutionCandidate[];
  trustedLinks: WhatsAppTrustedPersonLink[];
}): WhatsAppResolutionClassification {
  const unresolvedBase = {
    candidates: input.candidates,
    confirmedPersonIdentityId: null,
    humanActorResolutionState: "unresolved" as const,
    medicalSubjectResolutionState: "unresolved" as const,
  };

  if (input.routingState !== "legacy_env" && input.routingState !== "resolved") {
    return {
      ...unresolvedBase,
      resolutionState: "unresolved",
      resolutionReason: input.routingState === "unsupported"
        ? "unsupported_provider_field"
        : "unresolved_connection",
    };
  }
  if (!input.endpointIdentifierPresent) {
    return {
      ...unresolvedBase,
      resolutionState: "unresolved",
      resolutionReason: "missing_endpoint_identifier",
    };
  }
  if (input.trustedLinks.length > 1) {
    return {
      ...unresolvedBase,
      resolutionState: "candidate_multiple",
      resolutionReason: "multiple_trusted_endpoint_person_links",
    };
  }
  if (input.trustedLinks.length === 1) {
    return {
      ...unresolvedBase,
      resolutionState: "confirmed",
      resolutionReason: "trusted_endpoint_person_link",
      confirmedPersonIdentityId: input.trustedLinks[0]!.personIdentityId,
    };
  }
  if (input.candidates.length === 0) {
    return {
      ...unresolvedBase,
      resolutionState: "unresolved",
      resolutionReason: "no_exact_phone_match",
    };
  }
  return {
    ...unresolvedBase,
    resolutionState: input.candidates.length === 1 ? "candidate_single" : "candidate_multiple",
    resolutionReason: input.candidates.length === 1 ? "exact_phone_match" : "multiple_exact_phone_matches",
  };
}
