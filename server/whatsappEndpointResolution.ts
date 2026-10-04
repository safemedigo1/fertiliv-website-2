import { createHash } from "crypto";
import { and, eq, or, sql } from "drizzle-orm";
import {
  leads,
  patients,
  whatsappCommunicationEndpoints,
  whatsappEndpointAliases,
  whatsappEndpointEvidenceHints,
  whatsappEndpointPersonLinks,
  whatsappEndpointResolutionCandidates,
  whatsappEndpointResolutions,
  whatsappPersonIdentityRecords,
} from "../drizzle/schema";
import type { ResolvedWhatsAppConnection, WhatsAppProvider } from "../shared/whatsappPhase1Contracts";
import {
  buildPhoneCandidates,
  classifyWhatsAppResolution,
  type WhatsAppResolutionCandidate,
  type WhatsAppResolutionRoutingState,
} from "../shared/whatsappResolution";
import type { NormalizedMessagePlan } from "./whatsappNormalization";

function sha256Digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function buildWU06ResolutionKey(input: {
  sourceEventId: number;
  providerPhoneNumberId: string | null;
  providerItemKey: string;
}): string {
  return sha256Digest([
    input.sourceEventId,
    input.providerPhoneNumberId ?? "missing-phone-number-id",
    input.providerItemKey,
  ].join(":"));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function phoneDigitsSql(column: unknown) {
  const digits = sql`REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${column}, ' ', ''), '-', ''), '(', ''), ')', ''), '+', ''), '.', ''), '/', '')`;
  return sql`CASE WHEN ${digits} LIKE '00%' THEN SUBSTRING(${digits}, 3) ELSE ${digits} END`;
}

export type WU06ProviderEvidenceHint = {
  hintType: string;
  providerHintValue: string;
  providerHintDigest: string;
};

/**
 * Retains only provider-supplied hints. It deliberately never reads message
 * text, profile names as identity proof, or any semantic medical statement.
 */
export function extractWU06ProviderEvidenceHints(input: {
  value: Record<string, unknown>;
  providerEndpointId: string | null;
}): WU06ProviderEvidenceHint[] {
  const endpointId = input.providerEndpointId;
  if (!endpointId) return [];
  const hints: WU06ProviderEvidenceHint[] = [];
  const addHint = (hintType: string, value: string | null) => {
    if (!value) return;
    hints.push({
      hintType,
      providerHintValue: value.slice(0, 512),
      providerHintDigest: sha256Digest(`${hintType}:${value}`),
    });
  };

  const contacts = Array.isArray(input.value.contacts) ? input.value.contacts : [];
  for (const contactValue of contacts) {
    const contact = asRecord(contactValue);
    if (stringValue(contact?.wa_id) !== endpointId) continue;
    const profile = asRecord(contact?.profile);
    addHint("provider_profile_name", stringValue(profile?.name));
  }

  const messages = Array.isArray(input.value.messages) ? input.value.messages : [];
  for (const messageValue of messages) {
    const message = asRecord(messageValue);
    if (stringValue(message?.from) !== endpointId) continue;
    const context = asRecord(message?.context);
    addHint("provider_group_id", stringValue(message?.group_id) ?? stringValue(context?.group_id));
    addHint("provider_group_participant_id", stringValue(context?.participant));
    const identity = asRecord(message?.identity);
    addHint("provider_actor_hint", stringValue(identity?.name));
  }
  return hints;
}

async function upsertEndpoint(input: {
  tx: any;
  connection: ResolvedWhatsAppConnection | null;
  provider: WhatsAppProvider;
  providerPhoneNumberId: string | null;
  providerEndpointId: string | null;
  now: Date;
}) {
  if (!input.providerPhoneNumberId || !input.providerEndpointId) return null;
  await input.tx.insert(whatsappCommunicationEndpoints).values({
    clinicScope: "fertiliv",
    connectionId: input.connection?.id ?? null,
    connectionRoute: input.connection?.route ?? null,
    provider: input.provider,
    providerPhoneNumberId: input.providerPhoneNumberId,
    providerEndpointId: input.providerEndpointId,
    endpointKind: "phone",
    normalizedEndpointId: input.providerEndpointId.replace(/\D/g, "") || null,
    firstSeenAt: input.now,
    lastSeenAt: input.now,
  }).onConflictDoUpdate({ target: [whatsappCommunicationEndpoints.provider, whatsappCommunicationEndpoints.providerPhoneNumberId, whatsappCommunicationEndpoints.providerEndpointId],
    set: { lastSeenAt: input.now },
  });
  const [endpoint] = await input.tx.select({ id: whatsappCommunicationEndpoints.id })
    .from(whatsappCommunicationEndpoints)
    .where(and(
      eq(whatsappCommunicationEndpoints.provider, input.provider),
      eq(whatsappCommunicationEndpoints.providerPhoneNumberId, input.providerPhoneNumberId),
      eq(whatsappCommunicationEndpoints.providerEndpointId, input.providerEndpointId),
    ))
    .limit(1);
  return endpoint?.id ?? null;
}

function providerIdentityFromValue(value: Record<string, unknown>, providerMessageId: string | null) {
  const messages = Array.isArray(value.messages) ? value.messages : [];
  for (const item of messages) {
    const message = asRecord(item);
    if (stringValue(message?.id) !== providerMessageId) continue;
    return stringValue(message?.wppconnect_provider_identity);
  }
  return null;
}

async function findActiveEndpointAlias(input: {
  tx: any;
  provider: WhatsAppProvider;
  providerPhoneNumberId: string | null;
  providerIdentityId: string | null;
}) {
  if (!input.providerPhoneNumberId || !input.providerIdentityId) return null;
  const [alias] = await input.tx.select({ endpointId: whatsappEndpointAliases.endpointId })
    .from(whatsappEndpointAliases)
    .where(and(
      eq(whatsappEndpointAliases.provider, input.provider),
      eq(whatsappEndpointAliases.providerPhoneNumberId, input.providerPhoneNumberId),
      eq(whatsappEndpointAliases.providerIdentityId, input.providerIdentityId),
      eq(whatsappEndpointAliases.aliasState, "active"),
    ))
    .limit(1);
  return alias?.endpointId ?? null;
}

async function endpointIdentifierById(tx: any, endpointId: number | null) {
  if (!endpointId) return null;
  const [endpoint] = await tx.select({ providerEndpointId: whatsappCommunicationEndpoints.providerEndpointId })
    .from(whatsappCommunicationEndpoints)
    .where(eq(whatsappCommunicationEndpoints.id, endpointId))
    .limit(1);
  return endpoint?.providerEndpointId ?? null;
}

async function persistProviderIdentityAlias(input: {
  tx: any;
  sourceEventId: number;
  provider: WhatsAppProvider;
  connection: ResolvedWhatsAppConnection | null;
  providerPhoneNumberId: string | null;
  providerIdentityId: string | null;
  endpointId: number | null;
}) {
  if (!input.providerPhoneNumberId || !input.providerIdentityId || !input.endpointId) return;
  const now = new Date();
  await input.tx.insert(whatsappEndpointAliases).values({
    clinicScope: input.connection?.clinicScope ?? "fertiliv",
    provider: input.provider,
    connectionId: input.connection?.id ?? null,
    providerPhoneNumberId: input.providerPhoneNumberId,
    providerIdentityId: input.providerIdentityId,
    endpointId: input.endpointId,
    sourceEventId: input.sourceEventId,
    aliasKind: "wppconnect_peer_identity",
    aliasState: "active",
    firstSeenAt: now,
    lastSeenAt: now,
  }).onConflictDoUpdate({ target: [whatsappEndpointAliases.provider, whatsappEndpointAliases.providerPhoneNumberId, whatsappEndpointAliases.providerIdentityId],
    set: {
      endpointId: input.endpointId,
      sourceEventId: input.sourceEventId,
      connectionId: input.connection?.id ?? null,
      lastSeenAt: now,
      aliasState: "active",
    },
  });
}

async function findPhoneCandidates(tx: any, providerEndpointId: string): Promise<WhatsAppResolutionCandidate[]> {
  const digits = providerEndpointId.replace(/\D/g, "").replace(/^00/, "");
  if (!digits) return [];
  const patientPhone = phoneDigitsSql(patients.phone);
  const patientSecondaryPhone = phoneDigitsSql(patients.secondaryPhone);
  const leadPhone = phoneDigitsSql(leads.phone);
  const leadSecondaryPhone = phoneDigitsSql(leads.secondaryPhone);
  const [patientRows, leadRows] = await Promise.all([
    tx.select({
      recordId: patients.id,
      phone: patients.phone,
      secondaryPhone: patients.secondaryPhone,
    }).from(patients).where(or(
      sql`${patientPhone} = ${digits}`,
      sql`${patientSecondaryPhone} = ${digits}`,
    )),
    tx.select({
      recordId: leads.id,
      phone: leads.phone,
      secondaryPhone: leads.secondaryPhone,
      convertedPatientId: leads.convertedPatientId,
    }).from(leads).where(or(
      sql`${leadPhone} = ${digits}`,
      sql`${leadSecondaryPhone} = ${digits}`,
    )),
  ]);
  return buildPhoneCandidates({
    endpointPhone: providerEndpointId,
    records: [
      ...patientRows.map((row: any) => ({
        recordType: "patient" as const,
        recordId: row.recordId,
        phone: row.phone,
        secondaryPhone: row.secondaryPhone,
        convertedPatientId: row.recordId,
      })),
      ...leadRows.map((row: any) => ({
        recordType: "lead" as const,
        recordId: row.recordId,
        phone: row.phone,
        secondaryPhone: row.secondaryPhone,
        convertedPatientId: row.convertedPatientId ?? null,
      })),
    ],
  });
}

async function findTrustedLinks(tx: any, endpointId: number) {
  const links = await tx.select({ personIdentityId: whatsappEndpointPersonLinks.personIdentityId })
    .from(whatsappEndpointPersonLinks)
    .where(and(
      eq(whatsappEndpointPersonLinks.endpointId, endpointId),
      eq(whatsappEndpointPersonLinks.linkState, "confirmed"),
    ));
  return links;
}

async function persistOneResolution(input: {
  tx: any;
  sourceEventId: number;
  provider: WhatsAppProvider;
  providerPhoneNumberId: string | null;
  providerEndpointId: string | null;
  providerMessageId: string | null;
  providerItemKey: string;
  connection: ResolvedWhatsAppConnection | null;
  routingState: WhatsAppResolutionRoutingState;
  value: Record<string, unknown>;
}) {
  const now = new Date();
  const providerIdentityId = providerIdentityFromValue(input.value, input.providerMessageId);
  const aliasedEndpointId = await findActiveEndpointAlias({
    tx: input.tx,
    provider: input.provider,
    providerPhoneNumberId: input.providerPhoneNumberId,
    providerIdentityId,
  });
  const endpointId = aliasedEndpointId ?? await upsertEndpoint({
    tx: input.tx,
    connection: input.connection,
    provider: input.provider,
    providerPhoneNumberId: input.providerPhoneNumberId,
    providerEndpointId: input.providerEndpointId,
    now,
  });
  await persistProviderIdentityAlias({
    tx: input.tx,
    sourceEventId: input.sourceEventId,
    provider: input.provider,
    connection: input.connection,
    providerPhoneNumberId: input.providerPhoneNumberId,
    providerIdentityId,
    endpointId,
  });
  const canonicalEndpointId = await endpointIdentifierById(input.tx, endpointId) ?? input.providerEndpointId;
  const canMatchExistingRecords = input.routingState === "legacy_env" || input.routingState === "resolved";
  const candidates = canMatchExistingRecords && canonicalEndpointId
    ? await findPhoneCandidates(input.tx, canonicalEndpointId)
    : [];
  const trustedLinks = endpointId ? await findTrustedLinks(input.tx, endpointId) : [];
  const classification = classifyWhatsAppResolution({
    routingState: input.routingState,
    endpointIdentifierPresent: Boolean(input.providerEndpointId),
    candidates,
    trustedLinks,
  });
  const resolutionKey = buildWU06ResolutionKey({
    sourceEventId: input.sourceEventId,
    providerPhoneNumberId: input.providerPhoneNumberId,
    providerItemKey: input.providerItemKey,
  });
  await input.tx.insert(whatsappEndpointResolutions).values({
    sourceEventId: input.sourceEventId,
    provider: input.provider,
    connectionId: input.connection?.id ?? null,
    connectionRoute: input.connection?.route ?? null,
    providerPhoneNumberId: input.providerPhoneNumberId,
    providerEndpointId: input.providerEndpointId,
    providerMessageId: input.providerMessageId,
    routingState: input.routingState,
    endpointId,
    resolutionKey,
    resolutionState: classification.resolutionState,
    resolutionReason: classification.resolutionReason,
    confirmedPersonIdentityId: classification.confirmedPersonIdentityId,
    humanActorResolutionState: classification.humanActorResolutionState,
    medicalSubjectResolutionState: classification.medicalSubjectResolutionState,
  }).onConflictDoUpdate({ target: whatsappEndpointResolutions.resolutionKey,
    set: { updatedAt: now },
  });
  const [resolution] = await input.tx.select({ id: whatsappEndpointResolutions.id })
    .from(whatsappEndpointResolutions)
    .where(eq(whatsappEndpointResolutions.resolutionKey, resolutionKey))
    .limit(1);
  if (!resolution) throw new Error("WhatsApp endpoint resolution could not be confirmed");

  for (const candidate of candidates) {
    await input.tx.insert(whatsappEndpointResolutionCandidates).values({
      resolutionId: resolution.id,
      recordType: candidate.recordType,
      recordId: candidate.recordId,
      matchedField: candidate.matchedField,
      convertedPatientId: candidate.convertedPatientId,
      candidateKey: candidate.candidateKey,
    }).onConflictDoUpdate({ target: [whatsappEndpointResolutionCandidates.resolutionId, whatsappEndpointResolutionCandidates.candidateKey],
      set: { candidateKey: candidate.candidateKey },
    });
  }

  for (const hint of extractWU06ProviderEvidenceHints({
    value: input.value,
    providerEndpointId: input.providerEndpointId,
  })) {
    await input.tx.insert(whatsappEndpointEvidenceHints).values({
      sourceEventId: input.sourceEventId,
      resolutionId: resolution.id,
      endpointId,
      hintType: hint.hintType,
      providerHintValue: hint.providerHintValue,
      providerHintDigest: hint.providerHintDigest,
      evidenceState: "provider_hint",
    }).onConflictDoUpdate({ target: [whatsappEndpointEvidenceHints.resolutionId, whatsappEndpointEvidenceHints.hintType, whatsappEndpointEvidenceHints.providerHintDigest],
      set: { providerHintValue: hint.providerHintValue },
    });
  }

  return {
    resolutionId: resolution.id,
    resolutionState: classification.resolutionState,
    resolutionReason: classification.resolutionReason,
    candidateCount: candidates.length,
  };
}

export async function persistWU06EndpointResolutions(input: {
  tx: any;
  sourceEventId: number;
  provider: WhatsAppProvider;
  providerPhoneNumberId: string | null;
  value: Record<string, unknown>;
  messages: NormalizedMessagePlan[];
  connection: ResolvedWhatsAppConnection | null;
  routingState: WhatsAppResolutionRoutingState;
}) {
  const results = [];
  for (const message of input.messages) {
    if (message.normalizationState !== "normalized") continue;
    results.push(await persistOneResolution({
      tx: input.tx,
      sourceEventId: input.sourceEventId,
      provider: input.provider,
      providerPhoneNumberId: input.providerPhoneNumberId,
      providerEndpointId: message.providerSenderId,
      providerMessageId: message.providerMessageId,
      providerItemKey: message.providerItemKey,
      connection: input.connection,
      routingState: input.routingState,
      value: input.value,
    }));
  }
  return results;
}
