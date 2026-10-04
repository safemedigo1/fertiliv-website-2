import { and, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { createHmac, randomUUID } from "node:crypto";
import {
  leads,
  patients,
  treatmentCases,
  users,
  whatsappCommunicationEndpoints,
  whatsappConversationAssignments,
  whatsappConversationActivities,
  whatsappConversationCaseLinks,
  whatsappConversationMessages,
  whatsappConversationParticipants,
  whatsappConversationReadStates,
  whatsappConversationMatchSuggestions,
  whatsappConversationTags,
  whatsappConversations,
  whatsappEndpointPersonLinks,
  whatsappInboxSettings,
  whatsappLinkedDeviceLines,
  whatsappLinkedDeviceSessions,
  whatsappSendAttempts,
  whatsappSyntheticTestRecipients,
  whatsappConnections,
  whatsappPersonIdentities,
  whatsappPersonIdentityRecords,
} from "../drizzle/schema";
import type {
  UnifiedInboxActivity,
  UnifiedInboxCrmRecord,
  UnifiedInboxCrmSuggestion,
  UnifiedInboxNewConversationRecordType,
  UnifiedInboxNewConversationSearchResult,
  UnifiedInboxNewConversationSendingLine,
  UnifiedInboxOperationalContext,
  UnifiedInboxPolicies,
  UnifiedInboxPreparedConversation,
  UnifiedInboxRelationshipRole,
} from "../shared/unifiedInbox";
import {
  canDisplayFullInboxPhone,
  normalizeInboxDirectPhone,
  normalizeInboxPhone,
  resolveUnifiedInboxAttachmentMime,
  unifiedInboxMediaTypeForMime,
  UNIFIED_INBOX_MEDIA_MAX_BYTES,
  UNIFIED_INBOX_MEDIA_LIMIT_MESSAGE,
  UNIFIED_INBOX_TEXT_LIMIT,
} from "../shared/unifiedInbox";
import {
  buildWU07ConversationKey,
  buildWU07ParticipantKey,
} from "../shared/whatsappConversation";
import type { ResolvedWhatsAppConnection } from "../shared/whatsappPhase1Contracts";
import { createLead, getDb, getStaffUsers, logAudit } from "./db";
import {
  canUserAccessLinkedDeviceLine,
  getWppConnectSandboxStatus,
  ingestWppConnectServerEvent,
  ingestWppConnectSyntheticEvent,
  workerAllocationMatchesLinkedDeviceLine,
} from "./whatsappLinkedDevice";
import {
  linkedDeviceRuntimeFromSession,
  type LinkedDeviceRuntimeBinding,
} from "./whatsappLinkedDevice";
import {
  getWppConnectRuntimeSelection,
  type LinkedDeviceProviderEvent,
  WppConnectSandboxError,
  wppConnectSandboxAdapter,
} from "./whatsappLinkedDeviceProvider";
import { validateSyntheticRecipientApproval } from "./linkedDeviceRecipientApproval";
import {
  getWppConnectServerConnectionStatus,
  isWppConnectServerAdapterEnabled,
  ownershipFromRuntime,
  sendWppConnectServerMedia,
  sendWppConnectServerText,
  type WppConnectServerOwnership,
} from "./wppConnectServerAdapter";
import { emitInboxNotification } from "./whatsappOperationalNotifications";
import {
  completeWhatsAppSendAttempt,
  createWhatsAppSendAttempt,
  sha256Digest,
} from "./whatsappPhase1Store";

export type InboxActor = { id: number; role: string; name?: string | null };
export type CaseRelationshipRole = UnifiedInboxRelationshipRole;

async function conversationAccess(conversationId: number, actor: InboxActor) {
  const db = await getDb();
  if (!db) throw new Error("Inbox is temporarily unavailable.");
  const rows = await db
    .select({
    conversationId: whatsappConversations.id,
    connectionId: whatsappConversations.connectionId,
    lineId: whatsappLinkedDeviceLines.id,
    endpointId: whatsappConversationParticipants.endpointId,
    participantId: whatsappConversationParticipants.providerParticipantId,
    providerPhoneNumberId: whatsappConversations.providerPhoneNumberId,
    adapterKind: whatsappLinkedDeviceLines.adapterKind,
    })
    .from(whatsappConversations)
    .leftJoin(
      whatsappConversationParticipants,
      and(
        eq(
          whatsappConversationParticipants.conversationId,
          whatsappConversations.id
        ),
        eq(whatsappConversationParticipants.participantRole, "remote_endpoint")
      )
    )
    .leftJoin(
      whatsappLinkedDeviceLines,
      eq(
        whatsappLinkedDeviceLines.connectionId,
        whatsappConversations.connectionId
      )
    )
    .where(
      and(
        eq(whatsappConversations.id, conversationId),
        inArray(whatsappConversations.provider, ["wppconnect", "zernio"])
      )
    );
  const row = rows.reduce<(typeof rows)[number] | undefined>((best, candidate) => {
    if (!best) return candidate;
    const rank = (value: typeof candidate) => (normalizeInboxPhone(value.participantId) ? 2 : 0);
    return rank(candidate) > rank(best) ? candidate : best;
  }, undefined);
  if (
    !row?.lineId ||
    !(await canUserAccessLinkedDeviceLine({
      lineId: row.lineId,
      userId: actor.id,
      userRole: actor.role,
    }))
  ) {
    throw new Error("You do not have access to this conversation.");
  }
  return { db, ...row };
}

function isAdmin(actor: InboxActor) {
  return actor.role === "admin" || actor.role === "manager";
}

async function audit(
  actor: InboxActor,
  action: string,
  conversationId: number,
  description: string
) {
  await logAudit({
    userId: actor.id,
    userName: actor.name ?? null,
    userRole: actor.role,
    action,
    category: "other",
    recordId: conversationId,
    recordType: "whatsapp_conversation",
    page: "/inbox",
    description,
  });
  const db = await getDb();
  if (db) {
    await db.insert(whatsappConversationActivities).values({
      conversationId,
      actorId: actor.id,
      action,
      summary: description.slice(0, 512),
      metadata: JSON.stringify({ actorRole: actor.role }),
    });
  }
}

function normalizeTag(value: string) {
  const tag = value.trim().replace(/\s+/g, " ");
  if (!tag || tag.length > 64)
    throw new Error("Enter a tag between 1 and 64 characters.");
  return tag;
}

function policyProjection(
  settings: typeof whatsappInboxSettings.$inferSelect | undefined
): UnifiedInboxPolicies {
  return {
    phoneVisibility: settings?.phoneVisibility ?? "full_authorized",
    newSenderBehavior: settings?.newSenderBehavior ?? "conversation_only",
    exactPhoneMatch: settings?.exactPhoneMatch ?? "never_auto_link",
    duplicateDetection: settings?.duplicateDetection ?? "require_confirmation",
    caseSuggestions: settings?.caseSuggestions ?? false,
    automaticPatient: false,
    automaticMrn: false,
    automaticClinicalRecord: false,
  };
}

async function currentCrmRecords(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  endpointId: number | null
): Promise<UnifiedInboxCrmRecord[]> {
  if (!endpointId) return [];
  const links = await db
    .select({ identityId: whatsappEndpointPersonLinks.personIdentityId })
    .from(whatsappEndpointPersonLinks)
    .where(
      and(
        eq(whatsappEndpointPersonLinks.endpointId, endpointId),
        eq(whatsappEndpointPersonLinks.linkState, "confirmed")
      )
    );
  if (!links.length) return [];
  const identityIds = links.map(link => link.identityId);
  const identityRecords = await db
    .select()
    .from(whatsappPersonIdentityRecords)
    .where(
      and(
        or(
          ...identityIds.map(id =>
            eq(whatsappPersonIdentityRecords.personIdentityId, id)
          )
        ),
        eq(whatsappPersonIdentityRecords.relationshipState, "active")
      )
    );
  const records: UnifiedInboxCrmRecord[] = [];
  const identitiesWithRecords = new Set<number>();
  for (const record of identityRecords) {
    identitiesWithRecords.add(record.personIdentityId);
    if (record.recordType === "lead") {
      const [lead] = await db
        .select()
        .from(leads)
        .where(eq(leads.id, record.recordId))
        .limit(1);
      if (lead)
        records.push({
          recordType: "lead",
          id: lead.id,
          label:
            [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Lead",
          phone: lead.phone,
          language: lead.primaryLanguage,
          country: lead.country,
          status: lead.leadStatus,
        });
    } else {
      const [patient] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, record.recordId))
        .limit(1);
      if (patient)
        records.push({
          recordType: "patient",
          id: patient.id,
          label:
            [patient.firstName, patient.lastName].filter(Boolean).join(" ") ||
            "Patient",
          phone: patient.phone,
          language: null,
          country: null,
          status: patient.status,
        });
    }
  }
  for (const identityId of identityIds) {
    if (!identitiesWithRecords.has(identityId)) {
      records.push({
        recordType: "person",
        id: identityId,
        label: `Person #${identityId}`,
        phone: null,
        language: null,
        country: null,
        status: "manual identity",
      });
    }
  }
  return records;
}

function normalizedSuggestionPhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : null;
}

async function pendingExactPhoneSuggestions(input: {
  conversationId: number;
  endpointId: number | null;
  participantId: string | null;
}): Promise<UnifiedInboxCrmSuggestion[]> {
  if (!input.endpointId) return [];
  const db = await getDb();
  if (!db) return [];
  const phone = normalizedSuggestionPhone(
    normalizeInboxPhone(input.participantId)
  );
  if (!phone) return [];
  const [leadRows, patientRows] = await Promise.all([
    db.select().from(leads).where(eq(leads.phone, phone)).limit(5),
    db.select().from(patients).where(eq(patients.phone, phone)).limit(5),
  ]);
  const candidates = [
    ...leadRows.map(row => ({
      candidateType: "lead" as const,
      candidateId: row.id,
      label: [row.firstName, row.lastName].filter(Boolean).join(" ") || "Lead",
    })),
    ...patientRows.map(row => ({
      candidateType: "patient" as const,
      candidateId: row.id,
      label:
        [row.firstName, row.lastName].filter(Boolean).join(" ") || "Patient",
    })),
  ];
  for (const candidate of candidates) {
    await db
      .insert(whatsappConversationMatchSuggestions)
      .values({
      conversationId: input.conversationId,
      endpointId: input.endpointId,
      candidateType: candidate.candidateType,
      candidateId: candidate.candidateId,
      matchedField: "exact_phone",
      confidence: "high",
      })
      .onConflictDoUpdate({ target: [whatsappConversationMatchSuggestions.conversationId, whatsappConversationMatchSuggestions.candidateType, whatsappConversationMatchSuggestions.candidateId],
        set: {
          endpointId: input.endpointId,
          state: "pending",
          updatedAt: new Date(),
        },
      });
  }
  const rows = await db
    .select()
    .from(whatsappConversationMatchSuggestions)
    .where(
      and(
        eq(
          whatsappConversationMatchSuggestions.conversationId,
          input.conversationId
        ),
        eq(whatsappConversationMatchSuggestions.state, "pending")
      )
    );
  return rows.map((row): UnifiedInboxCrmSuggestion => {
    const candidate = candidates.find(
      item =>
        item.candidateType === row.candidateType &&
        item.candidateId === row.candidateId
    );
    return {
      id: row.id,
      candidateType: row.candidateType,
      candidateId: row.candidateId,
      label: candidate?.label ?? `${row.candidateType} #${row.candidateId}`,
      matchedField: row.matchedField,
      confidence: row.confidence,
      state: row.state,
    };
  });
}

export async function getOperationalInboxContext(
  conversationId: number,
  actor: InboxActor
): Promise<UnifiedInboxOperationalContext> {
  const access = await conversationAccess(conversationId, actor);
  const { db } = access;
  const [settings] = await db
    .select()
    .from(whatsappInboxSettings)
    .where(eq(whatsappInboxSettings.clinicScope, "fertiliv"))
    .limit(1);
  const crmRecords = await currentCrmRecords(db, access.endpointId ?? null);
  const [assignment] = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(whatsappConversationAssignments)
    .leftJoin(
      users,
      eq(users.id, whatsappConversationAssignments.assignedUserId)
    )
    .where(eq(whatsappConversationAssignments.conversationId, conversationId))
    .limit(1);
  const [caseLink] = await db
    .select({
      id: treatmentCases.id,
      caseType: treatmentCases.caseType,
      status: treatmentCases.status,
      relationshipRole: whatsappConversationCaseLinks.relationshipRole,
    })
    .from(whatsappConversationCaseLinks)
    .innerJoin(
      treatmentCases,
      eq(treatmentCases.id, whatsappConversationCaseLinks.caseId)
    )
    .where(
      and(
        eq(whatsappConversationCaseLinks.conversationId, conversationId),
        isNull(whatsappConversationCaseLinks.retiredAt)
      )
    )
    .limit(1);
  const [tagRows, activityRows] = await Promise.all([
    db
      .select({ tag: whatsappConversationTags.tag })
      .from(whatsappConversationTags)
      .where(eq(whatsappConversationTags.conversationId, conversationId)),
    db
      .select({
        id: whatsappConversationActivities.id,
        action: whatsappConversationActivities.action,
        summary: whatsappConversationActivities.summary,
        actorName: users.name,
        createdAt: whatsappConversationActivities.createdAt,
      })
      .from(whatsappConversationActivities)
      .leftJoin(users, eq(users.id, whatsappConversationActivities.actorId))
      .where(eq(whatsappConversationActivities.conversationId, conversationId))
      .orderBy(desc(whatsappConversationActivities.createdAt))
      .limit(60),
  ]);
  const staff = await getStaffUsers();
  const availableStaff = [] as Array<{
    id: number;
    name: string | null;
    role: string;
  }>;
  for (const member of staff) {
    if (
      await canUserAccessLinkedDeviceLine({
        lineId: access.lineId!,
        userId: member.id,
        userRole: member.role as string,
      })
    ) {
      availableStaff.push({
        id: member.id,
        name: member.name ?? null,
        role: member.role as string,
      });
    }
  }
  const normalizedPhone = normalizeInboxPhone(access.participantId);
  const fullPhone = canDisplayFullInboxPhone(
    settings?.phoneVisibility,
    actor.role
  );
  // An exact phone match may be shown as a reviewable hint, but it never links
  // a record or creates a business/clinical identity. Staff must invoke the
  // existing explicit, audited link action to accept any suggestion.
  const crmSuggestions = crmRecords.length
    ? []
    : await pendingExactPhoneSuggestions({
        conversationId,
        endpointId: access.endpointId ?? null,
        participantId: access.participantId ?? null,
      });
  const composerAllowed =
    access.adapterKind === "wppconnect_in_app_sandbox" &&
    wppConnectSandboxAdapter.isSandboxComposerEnabled();
  return {
    contactStatus: crmRecords.length ? "known_contact" : "new_contact",
    phone: fullPhone ? normalizedPhone : null,
    phoneVisibility: normalizedPhone
      ? fullPhone
        ? "full"
        : "masked"
      : "unavailable",
    language: crmRecords[0]?.language ?? null,
    country: crmRecords[0]?.country ?? null,
    tags: tagRows.map(row => row.tag),
    assignedTo: assignment?.id
      ? {
          id: assignment.id,
          name: assignment.name ?? null,
          role: assignment.role ?? "staff",
        }
      : null,
    crmRecords,
    caseContext: caseLink
      ? {
          id: caseLink.id,
          label: `${String(caseLink.caseType).toUpperCase()} Case #${caseLink.id}`,
          status: caseLink.status,
          relationshipRole: caseLink.relationshipRole as CaseRelationshipRole,
        }
      : null,
    availableStaff,
    activities: activityRows.map(
      (row): UnifiedInboxActivity => ({
        id: row.id,
        action: row.action,
        summary: row.summary,
        actorName: row.actorName ?? "Staff member",
        createdAt: row.createdAt,
      })
    ),
    crmSuggestions,
    canCompose: composerAllowed,
    composerNotice: composerAllowed
      ? "Synthetic test account only. Production messaging remains disabled."
      : "Messaging is not available for this channel or environment.",
  };
}

export async function markInboxConversationRead(
  conversationId: number,
  actor: InboxActor,
  read: boolean
) {
  const access = await conversationAccess(conversationId, actor);
  const latest = await access.db
    .select({ id: whatsappConversationMessages.id })
    .from(whatsappConversationMessages)
    .where(eq(whatsappConversationMessages.conversationId, conversationId))
    .orderBy(desc(whatsappConversationMessages.createdAt))
    .limit(1);
  const now = read ? new Date() : new Date(0);
  await access.db
    .insert(whatsappConversationReadStates)
    .values({
      conversationId,
      userId: actor.id,
      lastReadMessageId: read ? (latest[0]?.id ?? null) : null,
      readAt: now,
    })
    .onConflictDoUpdate({ target: [whatsappConversationReadStates.conversationId, whatsappConversationReadStates.userId],
      set: {
        lastReadMessageId: read ? (latest[0]?.id ?? null) : null,
        readAt: now,
      },
    });
  await audit(
    actor,
    read ? "inbox_mark_read" : "inbox_mark_unread",
    conversationId,
    read ? "Conversation marked read." : "Conversation marked unread."
  );
  return { ok: true, read };
}

export async function assignInboxConversation(
  conversationId: number,
  assignedUserId: number | null,
  actor: InboxActor
) {
  const access = await conversationAccess(conversationId, actor);
  const [previous] = await access.db
    .select({ assignedUserId: whatsappConversationAssignments.assignedUserId })
    .from(whatsappConversationAssignments)
    .where(eq(whatsappConversationAssignments.conversationId, conversationId))
    .limit(1);
  if (assignedUserId !== null) {
    const [user] = await access.db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, assignedUserId))
      .limit(1);
    if (
      !user ||
      !(await canUserAccessLinkedDeviceLine({
        lineId: access.lineId!,
        userId: user.id,
        userRole: user.role,
      }))
    )
      throw new Error(
        "Choose a staff member authorized for this WhatsApp line."
      );
  }
  await access.db
    .insert(whatsappConversationAssignments)
    .values({
      conversationId,
      assignedUserId,
      assignedById: actor.id,
      assignedAt: new Date(),
    })
    .onConflictDoUpdate({ target: whatsappConversationAssignments.conversationId,
      set: { assignedUserId, assignedById: actor.id, assignedAt: new Date() },
    });
  await audit(
    actor,
    "inbox_assignment_changed",
    conversationId,
    assignedUserId
      ? "Conversation assignment updated."
      : "Conversation assignment cleared."
  );
  if (assignedUserId) {
    const reassigned = Boolean(
      previous?.assignedUserId && previous.assignedUserId !== assignedUserId
    );
    await emitInboxNotification({
      lineId: access.lineId!,
      conversationId,
      kind: reassigned ? "reassignment" : "assignment",
      title: reassigned ? "Conversation reassigned" : "Conversation assigned",
      message: "A WhatsApp conversation has been assigned to you for review.",
      dedupeKey: `${conversationId}:${assignedUserId}:${Date.now()}`,
      recipientUserIds: [assignedUserId],
    });
  }
  return { ok: true };
}

export async function searchInboxCrmRecords(query: string, actor: InboxActor) {
  if (!query.trim()) return [] as UnifiedInboxCrmRecord[];
  const db = await getDb();
  if (!db) return [];
  const needle = `%${query.trim().slice(0, 80)}%`;
  const [leadRows, patientRows] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(
        or(
          like(leads.firstName, needle),
          like(leads.lastName, needle),
          like(leads.phone, needle),
          like(leads.email, needle)
        )
      )
      .limit(20),
    db
      .select()
      .from(patients)
      .where(
        or(
          like(patients.firstName, needle),
          like(patients.lastName, needle),
          like(patients.phone, needle),
          like(patients.email, needle),
          like(patients.mrn, needle)
        )
      )
      .limit(20),
  ]);
  const leadIds = leadRows.map(row => row.id);
  const patientIds = patientRows.map(row => row.id);
  const identityRows =
    leadIds.length || patientIds.length
      ? await db
          .select()
    .from(whatsappPersonIdentityRecords)
          .where(
            or(
              ...(leadIds.length
                ? [
                    and(
                      eq(whatsappPersonIdentityRecords.recordType, "lead"),
                      or(
                        ...leadIds.map(id =>
                          eq(whatsappPersonIdentityRecords.recordId, id)
                        )
                      )
                    ),
                  ]
                : []),
              ...(patientIds.length
                ? [
                    and(
                      eq(whatsappPersonIdentityRecords.recordType, "patient"),
                      or(
                        ...patientIds.map(id =>
                          eq(whatsappPersonIdentityRecords.recordId, id)
                        )
                      )
                    ),
                  ]
                : [])
            )
          )
      : [];
  void actor;
  const personResults = identityRows.map(identity => {
    const source =
      identity.recordType === "lead"
        ? leadRows.find(row => row.id === identity.recordId)
        : patientRows.find(row => row.id === identity.recordId);
    const label = source
      ? [source.firstName, source.lastName].filter(Boolean).join(" ")
      : `Person #${identity.personIdentityId}`;
    return {
      recordType: "person" as const,
      id: identity.personIdentityId,
      label: `Person — ${label}`,
      phone: source?.phone ?? null,
      email: source?.email ?? null,
      language:
        identity.recordType === "lead"
          ? ((source as (typeof leadRows)[number] | undefined)
              ?.primaryLanguage ?? null)
          : null,
      country:
        identity.recordType === "lead"
          ? ((source as (typeof leadRows)[number] | undefined)?.country ?? null)
          : null,
      status: "existing identity",
    };
  });
  return [
    ...personResults,
    ...leadRows.map(lead => ({
      recordType: "lead" as const,
      id: lead.id,
      label: [lead.firstName, lead.lastName].filter(Boolean).join(" "),
      phone: lead.phone,
      email: lead.email,
      language: lead.primaryLanguage,
      country: lead.country,
      status: lead.leadStatus,
    })),
    ...patientRows.map(patient => ({
      recordType: "patient" as const,
      id: patient.id,
      label: [patient.firstName, patient.lastName].filter(Boolean).join(" "),
      phone: patient.phone,
      email: patient.email,
      language: null,
      country: null,
      status: patient.status,
    })),
  ];
}

type DirectConversationRecordInput = {
  recordType?: UnifiedInboxNewConversationRecordType;
  recordId?: number;
  phoneKey?: string;
};

type DirectConversationTargetInput = {
  phone?: string;
  record?: DirectConversationRecordInput;
  approvedRecipientId?: number;
};

type ResolvedDirectConversationTarget = {
  providerEndpointId: string;
  displayPhone: string;
  source: "typed_phone" | "crm_record" | "approved_test_recipient";
  record: {
    recordType: UnifiedInboxNewConversationRecordType;
    recordId: number;
    label: string;
  } | null;
};

type AuthorizedDirectConversationLine = {
  id: number;
  lineName: string;
  connection: ResolvedWhatsAppConnection;
  runtime: LinkedDeviceRuntimeBinding | null;
  transport: "sandbox" | "wppconnect_server";
  serverOwnership: WppConnectServerOwnership | null;
};

type InternalDirectConversationRecordTarget = {
  kind: "crm";
  recordType: UnifiedInboxNewConversationRecordType;
  recordId: number;
  label: string;
  description: string;
  phoneOptions: Array<{
    key: string;
    label: string;
    displayPhone: string;
    normalized: string;
  }>;
};

function publicDirectConversationRecordTarget(
  target: InternalDirectConversationRecordTarget
) {
  return {
    ...target,
    phoneOptions: target.phoneOptions.map(
      ({ normalized: _normalized, ...option }) => option
    ),
  };
}

function maskedPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length <= 4
    ? "••••"
    : `${digits.slice(0, 2)}••••${digits.slice(-2)}`;
}

function phoneOption(input: {
  key: string;
  label: string;
  value: string | null | undefined;
  canDisplayFull: boolean;
}) {
  const normalized = normalizeInboxDirectPhone(input.value);
  if (!normalized) return null;
  return {
    key: input.key,
    label: input.label,
    displayPhone: input.canDisplayFull ? normalized : maskedPhone(normalized),
    normalized,
  };
}

async function directConversationVisibility(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  actor: InboxActor
) {
  const [settings] = await db
    .select({ phoneVisibility: whatsappInboxSettings.phoneVisibility })
    .from(whatsappInboxSettings)
    .where(eq(whatsappInboxSettings.clinicScope, "fertiliv"))
    .limit(1);
  return canDisplayFullInboxPhone(settings?.phoneVisibility, actor.role);
}

function requireSyntheticRecipientAdmin(actor: InboxActor) {
  if (actor.role !== "admin")
    throw new Error(
      "Only an administrator can manage controlled synthetic test recipients."
    );
}

export function isSyntheticTestRecipientLineEligible(input: {
  line: { lifecycleState: string; adapterKind: string };
  connection: { provider: string };
}) {
  return (
    input.line.lifecycleState !== "disabled" &&
    input.line.adapterKind === "wppconnect_in_app_sandbox" &&
    input.connection.provider === "wppconnect"
  );
}

async function requireSyntheticTestRecipientLine(input: {
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  lineId: number;
}) {
  const [row] = await input.db
    .select({
      line: whatsappLinkedDeviceLines,
      connection: whatsappConnections,
    })
    .from(whatsappLinkedDeviceLines)
    .innerJoin(
      whatsappConnections,
      eq(whatsappConnections.id, whatsappLinkedDeviceLines.connectionId)
    )
    .where(
      and(
      eq(whatsappLinkedDeviceLines.id, input.lineId),
        eq(whatsappLinkedDeviceLines.clinicScope, "fertiliv")
      )
    )
    .limit(1);
  if (!row) throw new Error("The selected WhatsApp line was not found.");
  if (!isSyntheticTestRecipientLineEligible(row)) {
    throw new Error(
      "Controlled test recipients are available only for an active Linked Device test line."
    );
  }
  return row;
}

/** Admin-only registry for non-production synthetic test recipients, scoped per persistent line. */
export async function listInboxSyntheticTestRecipients(input: {
  lineId?: number;
  actor: InboxActor;
}) {
  requireSyntheticRecipientAdmin(input.actor);
  const db = await getDb();
  if (!db) throw new Error("Inbox is temporarily unavailable.");
  const rows = await db
    .select({
      recipient: whatsappSyntheticTestRecipients,
      lineName: whatsappLinkedDeviceLines.lineName,
    })
    .from(whatsappSyntheticTestRecipients)
    .innerJoin(
      whatsappLinkedDeviceLines,
      eq(whatsappLinkedDeviceLines.id, whatsappSyntheticTestRecipients.lineId)
    )
    .where(
      and(
      eq(whatsappSyntheticTestRecipients.clinicScope, "fertiliv"),
        ...(input.lineId
          ? [eq(whatsappSyntheticTestRecipients.lineId, input.lineId)]
          : [])
      )
    )
    .orderBy(desc(whatsappSyntheticTestRecipients.updatedAt));
  const canDisplayFull = await directConversationVisibility(db, input.actor);
  return rows.map(({ recipient, lineName }) => ({
    id: recipient.id,
    lineId: recipient.lineId,
    lineName,
    phone: canDisplayFull
      ? recipient.normalizedPhone
      : maskedPhone(recipient.normalizedPhone),
    label: recipient.label,
    status: recipient.status,
    approvedAt: recipient.approvedAt,
    approvedById: recipient.approvedById,
    revokedAt: recipient.revokedAt,
    revokedById: recipient.revokedById,
  }));
}

/** Lists active, line-authorized synthetic recipients as opaque selectable targets for Direct Conversation. */
export async function listInboxEligibleSyntheticTestRecipients(input: {
  lineId: number;
  actor: InboxActor;
}) {
  const db = await getDb();
  if (!db) return [];
  if (
    !(await canUserAccessLinkedDeviceLine({
      lineId: input.lineId,
      userId: input.actor.id,
      userRole: input.actor.role,
    }))
  )
    return [];
  const canDisplayFull = await directConversationVisibility(db, input.actor);
  const rows = await db
    .select({
    id: whatsappSyntheticTestRecipients.id,
    normalizedPhone: whatsappSyntheticTestRecipients.normalizedPhone,
    label: whatsappSyntheticTestRecipients.label,
  })
    .from(whatsappSyntheticTestRecipients)
    .where(
      and(
      eq(whatsappSyntheticTestRecipients.clinicScope, "fertiliv"),
      eq(whatsappSyntheticTestRecipients.lineId, input.lineId),
        eq(whatsappSyntheticTestRecipients.status, "active")
      )
    )
    .orderBy(desc(whatsappSyntheticTestRecipients.updatedAt));
  return rows.map(row => ({
    id: row.id,
    label: row.label || "Controlled test recipient",
    phone: canDisplayFull
      ? row.normalizedPhone
      : maskedPhone(row.normalizedPhone),
  }));
}

/**
 * Activates or reconfirms a normalized recipient on the persistent Linked Device
 * line. This registry mutation intentionally does not probe or bind a disposable
 * worker; live allocation/readiness is enforced again immediately before send.
 */
export async function approveInboxSyntheticTestRecipient(input: {
  lineId: number;
  phone: string;
  label?: string;
  actor: InboxActor;
}) {
  requireSyntheticRecipientAdmin(input.actor);
  const db = await getDb();
  if (!db) throw new Error("Inbox is temporarily unavailable.");
  const normalizedPhone = normalizeInboxDirectPhone(input.phone);
  if (!normalizedPhone)
    throw new Error(
      "Enter a valid international phone number, for example +905xxxxxxxxx."
    );
  await requireSyntheticTestRecipientLine({ db, lineId: input.lineId });
  const label = input.label?.trim().slice(0, 128) || null;
  const now = new Date();
  await db
    .insert(whatsappSyntheticTestRecipients)
    .values({
    clinicScope: "fertiliv",
    lineId: input.lineId,
    normalizedPhone,
    label,
    status: "active",
    approvedById: input.actor.id,
    approvedAt: now,
    revokedById: null,
    revokedAt: null,
    })
    .onConflictDoUpdate({ target: [whatsappSyntheticTestRecipients.lineId, whatsappSyntheticTestRecipients.normalizedPhone],
      set: {
    label,
    status: "active",
    approvedById: input.actor.id,
    approvedAt: now,
    revokedById: null,
    revokedAt: null,
    updatedAt: now,
      },
    });
  const [recipient] = await db
    .select({ id: whatsappSyntheticTestRecipients.id })
    .from(whatsappSyntheticTestRecipients)
    .where(
      and(
        eq(whatsappSyntheticTestRecipients.lineId, input.lineId),
        eq(whatsappSyntheticTestRecipients.normalizedPhone, normalizedPhone)
      )
    )
    .limit(1);
  await logAudit({
    userId: input.actor.id,
    userName: input.actor.name ?? null,
    userRole: input.actor.role,
    action: "whatsapp_synthetic_test_recipient_approved",
    category: "other",
    recordId: recipient?.id ?? null,
    recordType: "whatsapp_synthetic_test_recipient",
    page: "/inbox",
    description: `Approved or reconfirmed controlled synthetic WhatsApp test recipient ${normalizedPhone} for in-app line ${input.lineId}. This approval is sandbox-only and is not a production patient-messaging permission.`,
  });
  return {
    id: recipient?.id ?? null,
    lineId: input.lineId,
    phone: normalizedPhone,
    status: "active" as const,
  };
}

/** Revokes future outbound starts while preserving all existing Conversation evidence. */
export async function revokeInboxSyntheticTestRecipient(input: {
  recipientId: number;
  actor: InboxActor;
}) {
  requireSyntheticRecipientAdmin(input.actor);
  const db = await getDb();
  if (!db) throw new Error("Inbox is temporarily unavailable.");
  const [recipient] = await db
    .select()
    .from(whatsappSyntheticTestRecipients)
    .where(
      and(
        eq(whatsappSyntheticTestRecipients.id, input.recipientId),
        eq(whatsappSyntheticTestRecipients.clinicScope, "fertiliv")
      )
    )
    .limit(1);
  if (!recipient)
    throw new Error("The controlled synthetic test recipient was not found.");
  const now = new Date();
  await db
    .update(whatsappSyntheticTestRecipients)
    .set({
    status: "revoked",
    revokedById: input.actor.id,
    revokedAt: now,
    updatedAt: now,
    })
    .where(eq(whatsappSyntheticTestRecipients.id, recipient.id));
  await logAudit({
    userId: input.actor.id,
    userName: input.actor.name ?? null,
    userRole: input.actor.role,
    action: "whatsapp_synthetic_test_recipient_revoked",
    category: "other",
    recordId: recipient.id,
    recordType: "whatsapp_synthetic_test_recipient",
    page: "/inbox",
    description: `Revoked controlled synthetic WhatsApp test recipient ${recipient.normalizedPhone} for in-app line ${recipient.lineId}. Existing Conversation evidence was preserved.`,
  });
  return { id: recipient.id, status: "revoked" as const };
}

async function directConversationRecordTarget(
  input: DirectConversationRecordInput,
  actor: InboxActor,
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<InternalDirectConversationRecordTarget | null> {
  if (!input.recordType || !input.recordId) return null;
  const canDisplayFull = await directConversationVisibility(db, actor);
  const withPhones = (
    recordType: "lead" | "patient",
    id: number,
    label: string,
    primary: string | null,
    secondary: string | null,
    status: string | null
  ) => {
    const options = [
      phoneOption({
        key: "primary",
        label: "Primary phone",
        value: primary,
        canDisplayFull,
      }),
      phoneOption({
        key: "secondary",
        label: "Secondary phone",
        value: secondary,
        canDisplayFull,
      }),
    ].filter((option): option is NonNullable<typeof option> => Boolean(option));
    return {
      kind: "crm" as const,
      recordType,
      recordId: id,
      label,
      description: status ? String(status).replace(/_/g, " ") : "CRM record",
      phoneOptions: options,
    };
  };

  if (input.recordType === "lead") {
    const [lead] = await db
      .select()
      .from(leads)
      .where(eq(leads.id, input.recordId))
      .limit(1);
    if (!lead) throw new Error("The selected Lead is no longer available.");
    return withPhones(
      "lead",
      lead.id,
      [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Lead",
      lead.phone,
      lead.secondaryPhone,
      lead.leadStatus
    );
  }
  if (input.recordType === "patient") {
    const [patient] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, input.recordId))
      .limit(1);
    if (!patient)
      throw new Error("The selected Patient is no longer available.");
    return withPhones(
      "patient",
      patient.id,
      [patient.firstName, patient.lastName].filter(Boolean).join(" ") ||
        "Patient",
      patient.phone,
      patient.secondaryPhone,
      patient.status
    );
  }

  const [identity] = await db
    .select({ id: whatsappPersonIdentities.id })
    .from(whatsappPersonIdentities)
    .where(eq(whatsappPersonIdentities.id, input.recordId))
    .limit(1);
  if (!identity)
    throw new Error("The selected Person identity is no longer available.");
  const records = await db
    .select()
    .from(whatsappPersonIdentityRecords)
    .where(
      and(
    eq(whatsappPersonIdentityRecords.personIdentityId, identity.id),
        eq(whatsappPersonIdentityRecords.relationshipState, "active")
      )
    );
  const options: InternalDirectConversationRecordTarget["phoneOptions"] = [];
  const labels: string[] = [];
  for (const record of records) {
    if (record.recordType === "lead") {
      const [lead] = await db
        .select()
        .from(leads)
        .where(eq(leads.id, record.recordId))
        .limit(1);
      if (!lead) continue;
      const label =
        [lead.firstName, lead.lastName].filter(Boolean).join(" ") || "Lead";
      labels.push(label);
      const primary = phoneOption({
        key: `lead:${lead.id}:primary`,
        label: `${label} · Primary phone`,
        value: lead.phone,
        canDisplayFull,
      });
      const secondary = phoneOption({
        key: `lead:${lead.id}:secondary`,
        label: `${label} · Secondary phone`,
        value: lead.secondaryPhone,
        canDisplayFull,
      });
      if (primary) options.push(primary);
      if (secondary) options.push(secondary);
    } else {
      const [patient] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, record.recordId))
        .limit(1);
      if (!patient) continue;
      const label =
        [patient.firstName, patient.lastName].filter(Boolean).join(" ") ||
        "Patient";
      labels.push(label);
      const primary = phoneOption({
        key: `patient:${patient.id}:primary`,
        label: `${label} · Primary phone`,
        value: patient.phone,
        canDisplayFull,
      });
      const secondary = phoneOption({
        key: `patient:${patient.id}:secondary`,
        label: `${label} · Secondary phone`,
        value: patient.secondaryPhone,
        canDisplayFull,
      });
      if (primary) options.push(primary);
      if (secondary) options.push(secondary);
    }
  }
  return {
    kind: "crm" as const,
    recordType: "person" as const,
    recordId: identity.id,
    label: labels[0] ? `Person — ${labels[0]}` : `Person #${identity.id}`,
    description: "Existing identity",
    phoneOptions: options,
  };
}

async function resolveDirectConversationTarget(
  input: DirectConversationTargetInput,
  actor: InboxActor,
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>
): Promise<ResolvedDirectConversationTarget> {
  const typedPhone = input.phone?.trim();
  if (input.approvedRecipientId) {
    if (typedPhone || input.record?.recordType || input.record?.recordId)
      throw new Error(
        "Choose one recipient: an approved test recipient, CRM record, or entered phone number."
      );
    const [recipient] = await db
      .select()
      .from(whatsappSyntheticTestRecipients)
      .where(
        and(
        eq(whatsappSyntheticTestRecipients.id, input.approvedRecipientId),
        eq(whatsappSyntheticTestRecipients.clinicScope, "fertiliv"),
          eq(whatsappSyntheticTestRecipients.status, "active")
        )
      )
      .limit(1);
    if (!recipient)
      throw new Error(
        "The selected controlled test recipient is no longer approved. Choose another recipient or ask an administrator to approve it."
      );
    const canDisplayFull = await directConversationVisibility(db, actor);
    return {
      providerEndpointId: recipient.normalizedPhone.replace(/^\+/, ""),
      displayPhone: canDisplayFull
        ? recipient.normalizedPhone
        : maskedPhone(recipient.normalizedPhone),
      source: "approved_test_recipient",
      record: null,
    };
  }
  if (typedPhone) {
    if (input.record?.recordType || input.record?.recordId)
      throw new Error("Choose either a CRM record or enter a phone number.");
    const normalized = normalizeInboxDirectPhone(typedPhone);
    if (!normalized)
      throw new Error(
        "Enter a valid international phone number, for example +905xxxxxxxxx."
      );
    return {
      providerEndpointId: normalized.replace(/^\+/, ""),
      displayPhone: normalized,
      source: "typed_phone",
      record: null,
    };
  }

  const target = await directConversationRecordTarget(
    input.record ?? {},
    actor,
    db
  );
  if (!target) throw new Error("Search for a contact or enter a phone number.");
  if (target.phoneOptions.length === 0)
    throw new Error("The selected record does not have a valid phone number.");
  const selected = input.record?.phoneKey
    ? target.phoneOptions.find(option => option.key === input.record?.phoneKey)
    : target.phoneOptions.length === 1
      ? target.phoneOptions[0]
      : null;
  if (!selected)
    throw new Error(
      "Choose which stored phone number to use before continuing."
    );
  return {
    providerEndpointId: selected.normalized.replace(/^\+/, ""),
    displayPhone: selected.displayPhone,
    source: "crm_record",
    record: {
      recordType: target.recordType,
      recordId: target.recordId,
      label: target.label,
    },
  };
}

async function requireApprovedSyntheticTestRecipient(input: {
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>;
  lineId: number;
  target: ResolvedDirectConversationTarget;
}) {
  const normalizedPhone = `+${input.target.providerEndpointId}`;
  const [recipient] = await input.db
    .select({ id: whatsappSyntheticTestRecipients.id })
    .from(whatsappSyntheticTestRecipients)
    .where(
      and(
      eq(whatsappSyntheticTestRecipients.clinicScope, "fertiliv"),
      eq(whatsappSyntheticTestRecipients.lineId, input.lineId),
      eq(whatsappSyntheticTestRecipients.normalizedPhone, normalizedPhone),
        eq(whatsappSyntheticTestRecipients.status, "active")
      )
    )
    .limit(1);
  if (!recipient) {
    throw new Error(
      "This number is not an approved controlled synthetic test recipient for the selected line. An administrator can approve it from the Inbox test-recipient controls."
    );
  }
  return recipient;
}

function buildSyntheticRecipientApprovalProof(input: {
  recipientId: number;
  lineId: number;
  providerEndpointId: string;
  runtime: LinkedDeviceRuntimeBinding | null;
}) {
  // Keep approval proof signing separate from session JWTs, worker API auth,
  // and inbound ingress signing. The selector follows the session-owned
  // runtime binding rather than a historical worker or line assumption.
  const persistentWorkerEnabled =
    input.runtime?.mode === "persistent_worker" ||
    process.env.WHATSAPP_LINKED_DEVICE_PERSISTENT_WORKER_ENABLED === "true";
  const secret = persistentWorkerEnabled
    ? process.env.WHATSAPP_LINKED_DEVICE_RECIPIENT_APPROVAL_SECRET
    : process.env.JWT_SECRET;
  if (!secret)
    throw new Error(
      "The synthetic WhatsApp approval service is unavailable. Ask an administrator to verify the test environment."
    );
  const exp = Math.floor(Date.now() / 1000) + 60;
  const payload = Buffer.from(
    JSON.stringify({
    v: 1,
    recipientId: input.recipientId,
    lineId: input.lineId,
    endpoint: input.providerEndpointId,
    session: input.runtime?.sessionName ?? "unbound-linked-device-session",
    exp,
    })
  ).toString("base64url");
  const signature = createHmac(
    "sha256",
    `fertiliv-wppconnect-synthetic-recipient-v1:${secret}`
  )
    .update(payload)
    .digest("base64url");
  const recipientFingerprint = createHmac(
    "sha256",
    `fertiliv-wppconnect-recipient-fingerprint-v1:${secret}`
  )
    .update(input.providerEndpointId)
    .digest("hex");
  const runtime = getWppConnectRuntimeSelection(
    "inapp",
    input.runtime ?? undefined
  );
  const ttlSeconds = exp - Math.floor(Date.now() / 1000);
  return {
    proof: `${payload}.${signature}`,
    proofVersion: 1,
    expiryState:
      ttlSeconds > 30 ? "ttl_31_60s" : ttlSeconds > 0 ? "ttl_1_30s" : "expired",
    secretSelector: runtime.secretSelector,
    recipientFingerprint,
  } as const;
}

function assertCurrentSyntheticRecipientApproval(input: {
  approvalProof: string;
  recipientId: number;
  lineId: number;
  providerEndpointId: string;
  runtime: LinkedDeviceRuntimeBinding | null;
  correlationId: string;
}) {
  const result = validateSyntheticRecipientApproval(input);
  if (result.ok) return;
  throw new WppConnectSandboxError(
    "wpp_recipient_proof_rejected",
    "Message not sent. Recipient authorization could not be verified.",
    {
      stage: "recipient_approval",
      probe: `approval_proof_${result.reason}`.slice(0, 64),
      outcome: "rejected",
      timestamp: new Date().toISOString(),
      correlationId: input.correlationId,
      approvalReason: result.reason,
      lineId: input.lineId,
      sessionName: input.runtime?.sessionName ?? null,
      runtimeMode: input.runtime?.mode ?? null,
    }
  );
}

function createOutboundCorrelationId() {
  return `wpp-${randomUUID()}`;
}

function buildOutboundAttemptMetadata(input: {
  correlationId: string;
  providerEndpointId: string;
  lineId: number;
  approval: ReturnType<typeof buildSyntheticRecipientApprovalProof>;
  runtime: LinkedDeviceRuntimeBinding | null;
}) {
  const runtime = getWppConnectRuntimeSelection(
    "inapp",
    input.runtime ?? undefined
  );
  return {
    correlationId: input.correlationId,
    runtimeEndpointHost: runtime.endpointHost,
    runtimeMode: runtime.runtimeMode,
    runtimeGateValue: runtime.gateValue,
    approvalSecretSelector: input.approval.secretSelector,
    approvalProofVersion: input.approval.proofVersion,
    approvalExpiryState: input.approval.expiryState,
    recipientFingerprint: input.approval.recipientFingerprint,
    lineId: input.lineId,
    sessionName: input.runtime?.sessionName ?? null,
  };
}

async function authorizedDirectConversationLine(
  lineId: number,
  actor: InboxActor
): Promise<AuthorizedDirectConversationLine> {
  const db = await getDb();
  if (!db) throw new Error("Inbox is temporarily unavailable.");
  const [row] = await db
    .select({
      line: whatsappLinkedDeviceLines,
      connection: whatsappConnections,
    })
    .from(whatsappLinkedDeviceLines)
    .innerJoin(
      whatsappConnections,
      eq(whatsappConnections.id, whatsappLinkedDeviceLines.connectionId)
    )
    .where(
      and(
      eq(whatsappLinkedDeviceLines.id, lineId),
        eq(whatsappLinkedDeviceLines.clinicScope, "fertiliv")
      )
    )
    .limit(1);
  if (
    !row ||
    !(await canUserAccessLinkedDeviceLine({
      lineId,
      userId: actor.id,
      userRole: actor.role,
    }))
  ) {
    throw new Error("You are not authorized to use this WhatsApp line.");
  }
  if (row.connection.provider !== "wppconnect") {
    throw new Error(
      "This WhatsApp line is not available for the current test-only messaging flow."
    );
  }
  const transport =
    row.line.adapterKind === "wppconnect_in_app_sandbox"
      ? "sandbox"
      : row.line.adapterKind === "wppconnect_server"
        ? "wppconnect_server"
        : null;
  if (!transport)
    throw new Error(
      "This WhatsApp line is not available for the current test-only messaging flow."
    );
  if (
    transport === "sandbox" &&
    (!wppConnectSandboxAdapter.isSandboxUiEnabled() ||
      !wppConnectSandboxAdapter.isSandboxComposerEnabled())
  ) {
    throw new Error(
      "The non-production synthetic WhatsApp sending flow is disabled."
    );
  }
  if (
    transport === "wppconnect_server" &&
    !isWppConnectServerAdapterEnabled()
  ) {
    throw new Error("The WPPConnect Server test transport is disabled.");
  }

  const [session] = await db
    .select({
    id: whatsappLinkedDeviceSessions.id,
    runtimeSlot: whatsappLinkedDeviceSessions.runtimeSlot,
    runtimeEndpoint: whatsappLinkedDeviceSessions.runtimeEndpoint,
    runtimeMode: whatsappLinkedDeviceSessions.runtimeMode,
    runtimeGeneration: whatsappLinkedDeviceSessions.runtimeGeneration,
    runtimeProfileRef: whatsappLinkedDeviceSessions.runtimeProfileRef,
    sessionName: whatsappLinkedDeviceSessions.sessionName,
    })
    .from(whatsappLinkedDeviceSessions)
    .where(eq(whatsappLinkedDeviceSessions.lineId, lineId))
    .limit(1);
  const runtime = linkedDeviceRuntimeFromSession(session);
  if (!runtime)
    throw new Error(
      "The connected WhatsApp session could not be verified. Ask an administrator to refresh the line."
    );

  let serverOwnership: WppConnectServerOwnership | null = null;
  if (transport === "sandbox") {
    let currentStatus;
    try {
      currentStatus = await getWppConnectSandboxStatus({
        lineId,
        actor: { id: actor.id, role: actor.role, name: actor.name ?? null },
        includeQr: false,
      });
    } catch {
      throw new Error(
        "The synthetic WhatsApp test session is unavailable. Ask an administrator to verify the connected test line."
      );
    }
    if (
      currentStatus.status !== "CONNECTED" ||
      !currentStatus.outboundReady ||
      currentStatus.lifecycleState !== "connected" ||
      currentStatus.healthState !== "healthy"
    ) {
      throw new Error(
        "This WhatsApp line is not currently healthy and connected. Choose another authorized line or ask an administrator to verify the test session."
      );
    }
    if (
      !currentStatus.sessionName ||
      currentStatus.sessionName !== runtime.sessionName
    ) {
      throw new Error(
        "The connected WhatsApp session could not be verified. Ask an administrator to refresh the line."
      );
    }
    if (
      !workerAllocationMatchesLinkedDeviceLine({
    lineId,
    providerLineId: row.connection.providerPhoneNumberId,
    runtime,
    status: currentStatus,
      })
    ) {
      throw new Error(
        "The connected WhatsApp worker is not allocated to this line. Ask an administrator to refresh the line before sending."
      );
  }
  } else {
    serverOwnership = ownershipFromRuntime({
      lineId,
      providerLineId: row.connection.providerPhoneNumberId,
      runtime,
    });
    if (!serverOwnership) {
      throw new Error(
        "The WPPConnect Server runtime ownership could not be verified. Ask an administrator to refresh the line."
      );
  }
    let currentStatus;
    try {
      currentStatus = await getWppConnectServerConnectionStatus({
        ownership: serverOwnership,
      });
    } catch {
      throw new Error(
        "The WPPConnect Server test session is unavailable. Ask an administrator to verify the connected test line."
      );
    }
    if (
      !currentStatus.connected ||
      row.line.lifecycleState !== "connected" ||
      row.line.healthState !== "healthy"
    ) {
      throw new Error(
        "This WPPConnect Server line is not currently healthy and connected. Choose another authorized line or ask an administrator to verify the test session."
      );
    }
  }

  return {
    id: row.line.id,
    lineName: row.line.lineName,
    connection: {
      id: row.connection.id,
      clinicScope: row.connection.clinicScope,
      provider: "wppconnect",
      onboardingMethod: "linked_device_wppconnect_sandbox",
      phoneNumberId: row.connection.providerPhoneNumberId,
      wabaId: row.connection.wabaId,
      businessPortfolioId: row.connection.businessPortfolioId,
      displayPhone: row.connection.displayPhone,
      normalizedDisplayPhone: row.connection.normalizedDisplayPhone,
      displayName: row.connection.displayName,
      credentialSource: row.connection.credentialSource,
      credentialRef: row.connection.credentialRef,
      lifecycleStatus: row.connection.lifecycleStatus,
      route: "persisted",
    },
    runtime,
    transport,
    serverOwnership,
  };
}

async function existingDirectConversation(input: {
  line: AuthorizedDirectConversationLine;
  providerEndpointId: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Inbox is temporarily unavailable.");
  const conversationKey = buildWU07ConversationKey({
    provider: "wppconnect",
    phoneNumberId: input.line.connection.phoneNumberId,
    connection: input.line.connection,
    providerEndpointId: input.providerEndpointId,
    providerThreadId: null,
  });
  const [exact] = await db
    .select({ id: whatsappConversations.id })
    .from(whatsappConversations)
    .where(eq(whatsappConversations.conversationKey, conversationKey))
    .limit(1);
  if (exact) return exact.id;
  const candidates = await db
    .select({
      id: whatsappConversations.id,
      participantId: whatsappConversationParticipants.providerParticipantId,
    })
    .from(whatsappConversations)
    .innerJoin(
      whatsappConversationParticipants,
      and(
        eq(
          whatsappConversationParticipants.conversationId,
          whatsappConversations.id
        ),
        eq(whatsappConversationParticipants.participantRole, "remote_endpoint")
      )
    )
    .where(
      and(
      eq(whatsappConversations.provider, "wppconnect"),
      eq(whatsappConversations.connectionId, input.line.connection.id!),
        eq(whatsappConversations.conversationType, "private")
      )
    )
    .limit(100);
  return (
    candidates.find(
      candidate =>
        candidate.participantId.replace(/\D/g, "") === input.providerEndpointId
    )?.id ?? null
  );
}

/**
 * Direct starts must have a durable transport-only Conversation before provider
 * submission. This is intentionally separate from identity linking: it creates
 * only the authoritative Endpoint → Conversation transport scaffolding.
 */
async function ensureDirectConversation(input: {
  line: AuthorizedDirectConversationLine;
  providerEndpointId: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Inbox is temporarily unavailable.");
  const existingConversationId = await existingDirectConversation(input);
  const conversationKey = buildWU07ConversationKey({
    provider: "wppconnect",
    phoneNumberId: input.line.connection.phoneNumberId,
    connection: input.line.connection,
    providerEndpointId: input.providerEndpointId,
    providerThreadId: null,
  });
  const participantKey = buildWU07ParticipantKey({
    conversationKey,
    participantRole: "remote_endpoint",
    providerParticipantId: input.providerEndpointId,
  });
  const now = new Date();
  return db.transaction(async tx => {
    await tx
      .insert(whatsappCommunicationEndpoints)
      .values({
      clinicScope: "fertiliv",
      connectionId: input.line.connection.id,
      connectionRoute: input.line.connection.route,
      provider: "wppconnect",
      providerPhoneNumberId: input.line.connection.phoneNumberId,
      providerEndpointId: input.providerEndpointId,
      endpointKind: "phone",
      normalizedEndpointId: input.providerEndpointId,
      lifecycleState: "active",
      firstSeenAt: now,
      lastSeenAt: now,
      })
      .onConflictDoUpdate({ target: [whatsappCommunicationEndpoints.provider, whatsappCommunicationEndpoints.providerPhoneNumberId, whatsappCommunicationEndpoints.providerEndpointId], set: { lastSeenAt: now } });
    const [endpoint] = await tx
      .select({ id: whatsappCommunicationEndpoints.id })
      .from(whatsappCommunicationEndpoints)
      .where(
        and(
        eq(whatsappCommunicationEndpoints.provider, "wppconnect"),
          eq(
            whatsappCommunicationEndpoints.providerPhoneNumberId,
            input.line.connection.phoneNumberId
          ),
          eq(
            whatsappCommunicationEndpoints.providerEndpointId,
            input.providerEndpointId
          )
        )
      )
      .limit(1);
    if (!endpoint)
      throw new Error("The recipient endpoint could not be prepared.");
    await tx
      .insert(whatsappConversations)
      .values({
      clinicScope: input.line.connection.clinicScope,
      provider: "wppconnect",
      connectionId: input.line.connection.id,
      connectionRoute: input.line.connection.route,
      providerPhoneNumberId: input.line.connection.phoneNumberId,
      providerThreadId: null,
      conversationKey,
      conversationType: "private",
      identityBasis: "remote_endpoint",
      endpointResolutionState: "unresolved",
      humanActorResolutionState: "unresolved",
      medicalSubjectResolutionState: "unresolved",
      lifecycleState: "active",
      firstMessageAt: null,
      lastMessageAt: null,
      })
      .onConflictDoUpdate({ target: whatsappConversations.conversationKey, set: { updatedAt: now } });
    const [conversation] = await tx
      .select({ id: whatsappConversations.id })
      .from(whatsappConversations)
      .where(eq(whatsappConversations.conversationKey, conversationKey))
      .limit(1);
    if (!conversation)
      throw new Error("The transport conversation could not be prepared.");
    await tx
      .insert(whatsappConversationParticipants)
      .values({
      conversationId: conversation.id,
      endpointId: endpoint.id,
      personIdentityId: null,
      sourceResolutionId: null,
      participantKey,
      participantRole: "remote_endpoint",
      participantState: "unresolved",
      providerParticipantId: input.providerEndpointId,
      providerHintDigest: null,
      humanActorResolutionState: "unresolved",
      medicalSubjectResolutionState: "unresolved",
      firstSeenAt: now,
      lastSeenAt: now,
      })
      .onConflictDoUpdate({ target: whatsappConversationParticipants.participantKey,
        set: { endpointId: endpoint.id, lastSeenAt: now },
      });
    return {
      conversationId: conversation.id,
      endpointId: endpoint.id,
      reused: Boolean(existingConversationId),
    };
  });
}

function requireOutboundIdempotencyKey(value: string | undefined) {
  const key = value?.trim() ?? "";
  if (!key || key.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new Error(
      "The message reference is missing. Refresh the Inbox and try again."
    );
  }
  return key;
}

function requireClientActionId(value: string | undefined) {
  const id = value?.trim() ?? "";
  if (!id || id.length > 64 || !/^[A-Za-z0-9._:-]+$/.test(id)) {
    throw new Error(
      "The send action reference is missing. Refresh the Inbox and try again."
    );
  }
  return id;
}

type TrackedSyntheticSend = {
  conversationId: number;
  line: AuthorizedDirectConversationLine;
  providerEndpointId: string;
  text: string;
  actor: InboxActor;
  idempotencyKey: string;
  clientActionId: string;
  approvalRecipientId: number;
};

type TrackedSyntheticMediaSend = {
  conversationId: number;
  line: AuthorizedDirectConversationLine;
  providerEndpointId: string;
  fileBase64: string;
  mimeType: string;
  filename: string;
  caption: string;
  mediaType: "image" | "document";
  actor: InboxActor;
  idempotencyKey: string;
  clientActionId: string;
  approvalRecipientId: number;
};

function validateSyntheticAttachment(input: {
  fileBase64: string;
  mimeType: string;
  filename: string;
  caption?: string;
}) {
  const fileBase64 = input.fileBase64
    .replace(/^data:[^,]+,/, "")
    .replace(/\s+/g, "");
  const filename = input.filename.trim().slice(0, 512);
  const mimeType = resolveUnifiedInboxAttachmentMime(input.mimeType, filename);
  const mediaType = mimeType ? unifiedInboxMediaTypeForMime(mimeType) : null;
  const caption = (input.caption ?? "").trim();
  if (
    !mimeType ||
    !mediaType ||
    !fileBase64 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(fileBase64)
  )
    throw new Error("Choose a supported image or document before sending.");
  if (caption.length > UNIFIED_INBOX_TEXT_LIMIT)
    throw new Error(
      "This caption is longer than WhatsApp’s 4,096-character limit. Shorten it before sending."
    );
  const bytes = Buffer.from(fileBase64, "base64");
  if (!bytes.length || bytes.length > UNIFIED_INBOX_MEDIA_MAX_BYTES)
    throw new Error(UNIFIED_INBOX_MEDIA_LIMIT_MESSAGE);
  if (!filename) throw new Error("Choose a filename before sending.");
  return { fileBase64, mimeType, filename, caption, mediaType, bytes };
}

export function classifyTrackedSyntheticSendFailure(
  error: unknown,
  label: "message" | "attachment"
) {
  const category =
    error instanceof WppConnectSandboxError ? error.category : "status_unknown";
  const diagnostic =
    error instanceof WppConnectSandboxError ? error.diagnostic : undefined;
  const retryableBeforeProvider = [
    "session_unavailable",
    "sending_line_unavailable",
    "recipient_invalid",
    "test_recipient_not_authorized",
    "feature_disabled",
    "wpp_probe_timeout",
    "wpp_probe_not_ready",
    "worker_response_contract_mismatch",
    "wpp_recipient_proof_rejected",
  ].includes(category);
  if (category === "wpp_send_rejected_before_provider_id") {
    return {
      attemptState: "failed" as const,
      failureCategory: category,
      diagnostic,
      error: new WppConnectSandboxError(
        "requires_retry",
        `The provider rejected this ${label} before issuing a message ID. It was not accepted.`,
        diagnostic
      ),
    };
  }
  if (retryableBeforeProvider) {
    return {
      attemptState: "requires_retry" as const,
      failureCategory: category,
      diagnostic,
      error: new WppConnectSandboxError(
        "requires_retry",
        category === "wpp_probe_timeout"
        ? `The test-line readiness check timed out. The ${label} was not submitted.`
          : category === "wpp_probe_not_ready"
            ? `The test line was not ready. The ${label} was not submitted.`
          : category === "worker_response_contract_mismatch"
            ? "Message not sent. The WhatsApp worker response could not be verified."
          : category === "wpp_recipient_proof_rejected"
            ? `Message not sent. Recipient authorization could not be verified.`
            : category === "test_recipient_not_authorized"
              ? `Message not sent. The controlled test recipient is not authorized.`
                  : `The synthetic WhatsApp test session is not ready. The ${label} was not submitted.`,
        diagnostic
      ),
    };
  }
  return {
    attemptState: "ambiguous" as const,
    failureCategory: category,
    diagnostic,
    error: new WppConnectSandboxError(
      "status_unknown",
      `The ${label} send result is uncertain. Do not send the same ${label} again yet.`,
      diagnostic
    ),
  };
}

async function retainTrackedLinkedDeviceOutbound(input: {
  line: AuthorizedDirectConversationLine;
  actor: InboxActor;
  providerMessageId: string;
  providerEndpointId: string;
  timestamp: Date;
  text: string;
  peerIdentityId?: string | null;
  media?: LinkedDeviceProviderEvent["media"];
  mediaBase64?: string;
}) {
  const event = {
    providerMessageId: input.providerMessageId,
    senderEndpointId: input.providerEndpointId,
    providerIdentityId: input.peerIdentityId ?? undefined,
    lineProviderId: input.line.connection.phoneNumberId,
    timestamp: input.timestamp,
    text: input.text,
    direction: "outbound" as const,
    ...(input.media ? { media: input.media } : {}),
    ...(input.mediaBase64
      ? input.line.transport === "wppconnect_server"
        ? { mediaBase64: input.mediaBase64 }
        : { syntheticMediaBase64: input.mediaBase64 }
      : {}),
  };
  const actor = {
    id: input.actor.id,
    role: input.actor.role,
    name: input.actor.name ?? null,
  };
  if (input.line.transport === "wppconnect_server") {
    if (!input.line.serverOwnership)
      throw new Error(
        "The WPPConnect Server ownership binding is unavailable."
      );
    return ingestWppConnectServerEvent({
      lineId: input.line.id,
      actor,
      ownership: input.line.serverOwnership,
      event: {
        ...event,
        sourceKind: "private_chat",
        origin: "wppconnect_server",
      },
    });
  }
  return ingestWppConnectSyntheticEvent({
    lineId: input.line.id,
    actor,
    event: { ...event, synthetic: true },
  });
}

async function sendTrackedSyntheticMedia(input: TrackedSyntheticMediaSend) {
  const db = await getDb();
  if (!db) throw new Error("Inbox is temporarily unavailable.");
  const attachment = validateSyntheticAttachment(input);
  const payloadDigest = sha256Digest(
    JSON.stringify({
    provider: "wppconnect",
    connectionId: input.line.connection.id,
    providerPhoneNumberId: input.line.connection.phoneNumberId,
    recipient: input.providerEndpointId,
    mediaType: attachment.mediaType,
    mimeType: attachment.mimeType,
    filename: attachment.filename,
    caption: attachment.caption,
    bytesDigest: sha256Digest(attachment.bytes.toString("base64")),
    })
  );
  const [existing] = await db
    .select()
    .from(whatsappSendAttempts)
    .where(eq(whatsappSendAttempts.idempotencyKey, input.idempotencyKey))
    .limit(1);
  let attemptId: number;
  const correlationId =
    existing?.correlationId ?? createOutboundCorrelationId();
  const approval = buildSyntheticRecipientApprovalProof({
    recipientId: input.approvalRecipientId,
    lineId: input.line.id,
    providerEndpointId: input.providerEndpointId,
    runtime: input.line.runtime,
  });
  assertCurrentSyntheticRecipientApproval({
    approvalProof: approval.proof,
    recipientId: input.approvalRecipientId,
    lineId: input.line.id,
    providerEndpointId: input.providerEndpointId,
    runtime: input.line.runtime,
    correlationId,
  });
  if (
    existing &&
    !existing.correlationId &&
    existing.attemptState !== "accepted" &&
    existing.attemptState !== "delivered" &&
    existing.attemptState !== "read"
  ) {
    throw new Error(
      "This historical send attempt has no diagnostic correlation. Start a new send action instead of reusing it."
    );
  }
  if (existing) {
    if (
      existing.connectionId !== input.line.connection.id ||
      existing.conversationId !== input.conversationId ||
      existing.recipientEndpoint !== `+${input.providerEndpointId}` ||
      existing.payloadDigest !== payloadDigest
    )
      throw new Error(
        "This attachment reference belongs to different content. Refresh the Inbox before sending."
      );
    if (
      existing.attemptState === "accepted" ||
      existing.attemptState === "delivered" ||
      existing.attemptState === "read"
    ) {
      if (!existing.providerMessageId)
        throw new WppConnectSandboxError(
          "status_unknown",
          "Send status unknown — checking. Do not send the same attachment again yet."
        );
      const retained = await retainTrackedLinkedDeviceOutbound({
        line: input.line,
        actor: input.actor,
          providerMessageId: existing.providerMessageId,
        providerEndpointId: input.providerEndpointId,
          timestamp: existing.acceptedAt ?? new Date(),
          text: attachment.caption,
        media: {
          providerMediaId: `${existing.providerMessageId}:media`,
          mediaType: attachment.mediaType,
          mimeType: attachment.mimeType,
          filename: attachment.filename,
          sha256: sha256Digest(attachment.bytes.toString("base64")),
          caption: attachment.caption || null,
        },
        mediaBase64: attachment.fileBase64,
      });
      return {
        providerMessageId: existing.providerMessageId,
        replayed: true,
        attemptId: existing.id,
        retained: retained.insertedEvents > 0,
        state: "accepted" as const,
      };
    }
    if (
      existing.attemptState === "pending" ||
      existing.attemptState === "submitting" ||
      existing.attemptState === "ambiguous"
    )
      throw new WppConnectSandboxError(
        "status_unknown",
        "Send status unknown — checking. Do not send the same attachment again yet."
      );
    throw new WppConnectSandboxError(
      "requires_retry",
      "The prior attachment action was not submitted. Start a new action instead of retrying the same reference."
    );
  } else {
    const metadata = buildOutboundAttemptMetadata({
      correlationId,
      providerEndpointId: input.providerEndpointId,
      lineId: input.line.id,
      approval,
      runtime: input.line.runtime,
    });
    const attempt = await createWhatsAppSendAttempt({
      connection: input.line.connection,
      conversationId: input.conversationId,
      actorUserId: input.actor.id,
      recipientEndpoint: `+${input.providerEndpointId}`,
      intentType: "document",
      payloadDigest,
      idempotencyKey: input.idempotencyKey,
      clientActionId: input.clientActionId,
      ...metadata,
    });
    attemptId = attempt.id;
  }
  await completeWhatsAppSendAttempt({
    id: attemptId,
    attemptState: "submitting",
  });
  let result;
  try {
    result =
      input.line.transport === "wppconnect_server"
        ? await sendWppConnectServerMedia({
            ownership: input.line.serverOwnership!,
            fileBase64: attachment.fileBase64,
            mimeType: attachment.mimeType,
            filename: attachment.filename,
            caption: attachment.caption,
            recipient: `+${input.providerEndpointId}`,
            approvalProof: approval.proof,
            correlationId,
            outboundAttemptId: attemptId,
          })
        : await wppConnectSandboxAdapter.sendSandboxMedia({
      fileBase64: attachment.fileBase64,
      mimeType: attachment.mimeType,
      filename: attachment.filename,
      caption: attachment.caption,
      recipient: `+${input.providerEndpointId}`,
      approvalProof: approval.proof,
      correlationId,
      outboundAttemptId: attemptId,
      idempotencyKey: input.idempotencyKey,
      intentDigest: payloadDigest,
      target: "inapp",
      runtime: input.line.runtime ?? undefined,
    });
  } catch (error) {
    const classified = classifyTrackedSyntheticSendFailure(error, "attachment");
    await completeWhatsAppSendAttempt({
      id: attemptId,
      attemptState: classified.attemptState,
      failureCategory: classified.failureCategory,
      diagnostic: classified.diagnostic,
    });
    throw classified.error;
  }
  await completeWhatsAppSendAttempt({
    id: attemptId,
    attemptState: "accepted",
    providerMessageId: result.providerMessageId,
  });
  let retained;
  try {
    retained = await retainTrackedLinkedDeviceOutbound({
      line: input.line,
      actor: input.actor,
        providerMessageId: result.providerMessageId,
      providerEndpointId: input.providerEndpointId,
        timestamp: result.timestamp,
        text: attachment.caption,
      peerIdentityId: result.peerIdentityId,
      media: {
        providerMediaId: `${result.providerMessageId}:media`,
        mediaType: attachment.mediaType,
        mimeType: attachment.mimeType,
        filename: attachment.filename,
        sha256: sha256Digest(attachment.bytes.toString("base64")),
        caption: attachment.caption || null,
      },
      mediaBase64: attachment.fileBase64,
    });
  } catch {
    throw new WppConnectSandboxError(
      "status_unknown",
      "Send status unknown — checking. Do not send the same attachment again yet."
    );
  }
  return {
    providerMessageId: result.providerMessageId,
    replayed: result.replayed,
    attemptId,
    retained: retained.insertedEvents > 0,
    state: "accepted" as const,
  };
}

async function sendTrackedSyntheticText(input: TrackedSyntheticSend) {
  const db = await getDb();
  if (!db) throw new Error("Inbox is temporarily unavailable.");
  const payloadDigest = sha256Digest(
    JSON.stringify({
    provider: "wppconnect",
    connectionId: input.line.connection.id,
    providerPhoneNumberId: input.line.connection.phoneNumberId,
    recipient: input.providerEndpointId,
    text: input.text,
    })
  );
  const [existing] = await db
    .select()
    .from(whatsappSendAttempts)
    .where(eq(whatsappSendAttempts.idempotencyKey, input.idempotencyKey))
    .limit(1);
  let attemptId: number;
  const correlationId =
    existing?.correlationId ?? createOutboundCorrelationId();
  const approval = buildSyntheticRecipientApprovalProof({
    recipientId: input.approvalRecipientId,
    lineId: input.line.id,
    providerEndpointId: input.providerEndpointId,
    runtime: input.line.runtime,
  });
  assertCurrentSyntheticRecipientApproval({
    approvalProof: approval.proof,
    recipientId: input.approvalRecipientId,
    lineId: input.line.id,
    providerEndpointId: input.providerEndpointId,
    runtime: input.line.runtime,
    correlationId,
  });
  if (
    existing &&
    !existing.correlationId &&
    existing.attemptState !== "accepted" &&
    existing.attemptState !== "delivered" &&
    existing.attemptState !== "read"
  ) {
    throw new Error(
      "This historical send attempt has no diagnostic correlation. Start a new send action instead of reusing it."
    );
  }
  if (existing) {
    if (
      existing.connectionId !== input.line.connection.id ||
      existing.conversationId !== input.conversationId ||
      existing.recipientEndpoint !== `+${input.providerEndpointId}` ||
      existing.payloadDigest !== payloadDigest
    ) {
      throw new Error(
        "This message reference belongs to different content. Refresh the Inbox before sending."
      );
    }
    if (
      existing.attemptState === "accepted" ||
      existing.attemptState === "delivered" ||
      existing.attemptState === "read"
    ) {
      if (!existing.providerMessageId) {
        throw new WppConnectSandboxError(
          "status_unknown",
          "Send status unknown — checking. Do not send the same message again yet."
        );
      }
      const retained = await retainTrackedLinkedDeviceOutbound({
        line: input.line,
        actor: input.actor,
          providerMessageId: existing.providerMessageId,
        providerEndpointId: input.providerEndpointId,
          timestamp: existing.acceptedAt ?? new Date(),
          text: input.text,
      });
      return {
        providerMessageId: existing.providerMessageId,
        replayed: true,
        attemptId: existing.id,
        retained: retained.insertedEvents > 0,
        state: "accepted" as const,
      };
    }
    if (
      existing.attemptState === "pending" ||
      existing.attemptState === "submitting" ||
      existing.attemptState === "ambiguous"
    ) {
      throw new WppConnectSandboxError(
        "status_unknown",
        "Send status unknown — checking. Do not send the same message again yet."
      );
    }
    throw new WppConnectSandboxError(
      "requires_retry",
      "The prior message action was not submitted. Start a new action instead of retrying the same reference."
    );
  } else {
    const metadata = buildOutboundAttemptMetadata({
      correlationId,
      providerEndpointId: input.providerEndpointId,
      lineId: input.line.id,
      approval,
      runtime: input.line.runtime,
    });
    const attempt = await createWhatsAppSendAttempt({
      connection: input.line.connection,
      conversationId: input.conversationId,
      actorUserId: input.actor.id,
      recipientEndpoint: `+${input.providerEndpointId}`,
      intentType: "text",
      payloadDigest,
      idempotencyKey: input.idempotencyKey,
      clientActionId: input.clientActionId,
      ...metadata,
    });
    attemptId = attempt.id;
  }

  await completeWhatsAppSendAttempt({
    id: attemptId,
    attemptState: "submitting",
  });
  let result;
  try {
    result =
      input.line.transport === "wppconnect_server"
        ? await sendWppConnectServerText({
            ownership: input.line.serverOwnership!,
            text: input.text,
            recipient: `+${input.providerEndpointId}`,
            approvalProof: approval.proof,
            correlationId,
            outboundAttemptId: attemptId,
          })
        : await wppConnectSandboxAdapter.sendSandboxText({
      text: input.text,
      recipient: `+${input.providerEndpointId}`,
      approvalProof: approval.proof,
      correlationId,
      outboundAttemptId: attemptId,
      idempotencyKey: input.idempotencyKey,
      intentDigest: payloadDigest,
      target: "inapp",
      runtime: input.line.runtime ?? undefined,
    });
  } catch (error) {
    const classified = classifyTrackedSyntheticSendFailure(error, "message");
    await completeWhatsAppSendAttempt({
      id: attemptId,
      attemptState: classified.attemptState,
      failureCategory: classified.failureCategory,
      diagnostic: classified.diagnostic,
    });
    throw classified.error;
  }
  await completeWhatsAppSendAttempt({
    id: attemptId,
    attemptState: "accepted",
    providerMessageId: result.providerMessageId,
  });
  let retained;
  try {
    retained = await retainTrackedLinkedDeviceOutbound({
      line: input.line,
      actor: input.actor,
        providerMessageId: result.providerMessageId,
      providerEndpointId: input.providerEndpointId,
        timestamp: result.timestamp,
        text: input.text,
      peerIdentityId: result.peerIdentityId,
    });
  } catch {
    throw new WppConnectSandboxError(
      "status_unknown",
      "Send status unknown — checking. Do not send the same message again yet."
    );
  }
  return {
    providerMessageId: result.providerMessageId,
    replayed: result.replayed,
    attemptId,
    retained: retained.insertedEvents > 0,
    state: "accepted" as const,
  };
}

async function linkRequestedDirectConversation(input: {
  conversationId: number;
  record: ResolvedDirectConversationTarget["record"];
  actor: InboxActor;
}) {
  if (!input.record) return { linked: false, notice: null };
  const access = await conversationAccess(input.conversationId, input.actor);
  const current = await currentCrmRecords(access.db, access.endpointId ?? null);
  if (
    current.some(
      record =>
        record.recordType === input.record?.recordType &&
        record.id === input.record?.recordId
    )
  ) {
    return { linked: true, notice: null };
  }
  if (current.length) {
    return {
      linked: false,
      notice:
        "The existing CRM link was left unchanged. Review it in the Inbox before linking a different record.",
    };
  }
  await linkInboxConversationRecord({
    conversationId: input.conversationId,
    recordType: input.record.recordType,
    recordId: input.record.recordId,
    confirmReassignment: false,
    actor: input.actor,
  });
  return { linked: true, notice: null };
}

/** Returns only connected test lines for which the staff actor holds a line grant. */
export async function listInboxNewConversationLines(
  actor: InboxActor
): Promise<UnifiedInboxNewConversationSendingLine[]> {
  const db = await getDb();
  if (!db) return [];
  const sandboxEnabled =
    wppConnectSandboxAdapter.isSandboxUiEnabled() &&
    wppConnectSandboxAdapter.isSandboxComposerEnabled();
  const serverEnabled = isWppConnectServerAdapterEnabled();
  if (!sandboxEnabled && !serverEnabled) return [];
  const refreshCandidates = sandboxEnabled
    ? await db
        .select({ id: whatsappLinkedDeviceLines.id })
    .from(whatsappLinkedDeviceLines)
        .where(
          and(
      eq(whatsappLinkedDeviceLines.clinicScope, "fertiliv"),
            eq(
              whatsappLinkedDeviceLines.adapterKind,
              "wppconnect_in_app_sandbox"
            )
          )
        )
    : [];
  await Promise.all(
    refreshCandidates.map(candidate =>
      getWppConnectSandboxStatus({
    lineId: candidate.id,
    actor: { id: actor.id, role: actor.role, name: actor.name ?? null },
    includeQr: false,
      }).catch(() => null)
    )
  );
  const rows = await db
    .select({
      line: whatsappLinkedDeviceLines,
      connection: whatsappConnections,
    })
    .from(whatsappLinkedDeviceLines)
    .innerJoin(
      whatsappConnections,
      eq(whatsappConnections.id, whatsappLinkedDeviceLines.connectionId)
    )
    .where(
      and(
      eq(whatsappLinkedDeviceLines.clinicScope, "fertiliv"),
        or(
          ...(sandboxEnabled
            ? [
                eq(
                  whatsappLinkedDeviceLines.adapterKind,
                  "wppconnect_in_app_sandbox"
                ),
              ]
            : []),
          ...(serverEnabled
            ? [eq(whatsappLinkedDeviceLines.adapterKind, "wppconnect_server")]
            : [])
        ),
      eq(whatsappLinkedDeviceLines.lifecycleState, "connected"),
      eq(whatsappLinkedDeviceLines.healthState, "healthy"),
      eq(whatsappConnections.provider, "wppconnect"),
      eq(whatsappConnections.lifecycleStatus, "connected"),
        eq(whatsappConnections.healthState, "healthy")
      )
    )
    .orderBy(
      desc(whatsappLinkedDeviceLines.lastSuccessfulSyncAt),
      desc(whatsappLinkedDeviceLines.id)
    );
  const result: UnifiedInboxNewConversationSendingLine[] = [];
  for (const row of rows) {
    if (
      !(await canUserAccessLinkedDeviceLine({
        lineId: row.line.id,
        userId: actor.id,
        userRole: actor.role,
      }))
    )
      continue;
    result.push({
      id: row.line.id,
      name: row.line.lineName,
      status: "connected",
      health:
        row.line.healthState === "unavailable"
          ? "degraded"
          : (row.line.healthState as "healthy" | "unknown" | "degraded"),
      suggested: result.length === 0,
    });
  }
  return result;
}

/** Loads an explicit CRM target and its policy-safe phone choices for a launch from Lead or Patient detail. */
export async function getInboxNewConversationRecordTarget(input: {
  recordType: UnifiedInboxNewConversationRecordType;
  recordId: number;
  actor: InboxActor;
}) {
  const db = await getDb();
  if (!db) throw new Error("Inbox is temporarily unavailable.");
  const target = await directConversationRecordTarget(
    { recordType: input.recordType, recordId: input.recordId },
    input.actor,
    db
  );
  return target ? publicDirectConversationRecordTarget(target) : null;
}

/** Searches existing authorized threads and explicit CRM choices without creating or linking any identity. */
export async function searchInboxNewConversationTargets(
  query: string,
  actor: InboxActor
): Promise<UnifiedInboxNewConversationSearchResult[]> {
  const normalized = query.trim().slice(0, 80);
  if (!normalized) return [];
  const db = await getDb();
  if (!db) return [];
  const canDisplayFull = await directConversationVisibility(db, actor);
  const needle = `%${normalized}%`;
  const [leadRows, patientRows, conversationRows] = await Promise.all([
    db
      .select()
      .from(leads)
      .where(
        or(
          like(leads.firstName, needle),
          like(leads.lastName, needle),
          like(leads.phone, needle),
          like(leads.secondaryPhone, needle),
          like(leads.email, needle)
        )
      )
      .limit(15),
    db
      .select()
      .from(patients)
      .where(
        or(
          like(patients.firstName, needle),
          like(patients.lastName, needle),
          like(patients.phone, needle),
          like(patients.secondaryPhone, needle),
          like(patients.email, needle),
          like(patients.mrn, needle)
        )
      )
      .limit(15),
    db
      .select({
        conversationId: whatsappConversations.id,
        lineId: whatsappLinkedDeviceLines.id,
        lineName: whatsappLinkedDeviceLines.lineName,
        participantId: whatsappConversationParticipants.providerParticipantId,
      })
      .from(whatsappConversations)
      .innerJoin(
        whatsappConversationParticipants,
        and(
          eq(
            whatsappConversationParticipants.conversationId,
            whatsappConversations.id
          ),
          eq(
            whatsappConversationParticipants.participantRole,
            "remote_endpoint"
          )
        )
      )
      .innerJoin(
        whatsappLinkedDeviceLines,
        eq(
          whatsappLinkedDeviceLines.connectionId,
          whatsappConversations.connectionId
        )
      )
      .where(
        and(
          eq(whatsappConversations.provider, "wppconnect"),
          eq(whatsappConversations.conversationType, "private")
        )
      )
      .orderBy(desc(whatsappConversations.lastMessageAt))
      .limit(100),
  ]);
  const records: UnifiedInboxNewConversationSearchResult[] = [];
  for (const lead of leadRows) {
    const target = await directConversationRecordTarget(
      { recordType: "lead", recordId: lead.id },
      actor,
      db
    );
    if (target) records.push(publicDirectConversationRecordTarget(target));
  }
  for (const patient of patientRows) {
    const target = await directConversationRecordTarget(
      { recordType: "patient", recordId: patient.id },
      actor,
      db
    );
    if (target) records.push(publicDirectConversationRecordTarget(target));
  }
  const identityRows =
    leadRows.length || patientRows.length
      ? await db
          .select()
          .from(whatsappPersonIdentityRecords)
          .where(
            or(
              ...(leadRows.length
                ? [
                    and(
                      eq(whatsappPersonIdentityRecords.recordType, "lead"),
                      or(
                        ...leadRows.map(lead =>
                          eq(whatsappPersonIdentityRecords.recordId, lead.id)
                        )
                      )
                    ),
                  ]
                : []),
              ...(patientRows.length
                ? [
                    and(
                      eq(whatsappPersonIdentityRecords.recordType, "patient"),
                      or(
                        ...patientRows.map(patient =>
                          eq(whatsappPersonIdentityRecords.recordId, patient.id)
                        )
                      )
                    ),
                  ]
                : [])
            )
          )
    : [];
  for (const identityId of Array.from(
    new Set(identityRows.map(row => row.personIdentityId))
  )) {
    const target = await directConversationRecordTarget(
      { recordType: "person", recordId: identityId },
      actor,
      db
    );
    if (target) records.push(publicDirectConversationRecordTarget(target));
  }
  const compactQuery = normalized.replace(/\D/g, "");
  const conversations: UnifiedInboxNewConversationSearchResult[] = [];
  for (const row of conversationRows) {
    if (
      !(await canUserAccessLinkedDeviceLine({
        lineId: row.lineId,
        userId: actor.id,
        userRole: actor.role,
      }))
    )
      continue;
    const endpoint =
      normalizeInboxPhone(row.participantId) ?? row.participantId;
    const haystack = `${row.lineName} ${endpoint}`.toLowerCase();
    if (
      !haystack.includes(normalized.toLowerCase()) &&
      (!compactQuery || !endpoint.replace(/\D/g, "").includes(compactQuery))
    )
      continue;
    conversations.push({
      kind: "conversation",
      conversationId: row.conversationId,
      lineId: row.lineId,
      label: "Existing WhatsApp conversation",
      description: `Receiving line: ${row.lineName}`,
      displayEndpoint: canDisplayFull ? endpoint : maskedPhone(endpoint),
    });
  }
  return [...conversations.slice(0, 12), ...records.slice(0, 30)];
}

/** Resolves a line-scoped endpoint and reports an existing private thread before any outbound transport call. */
export async function prepareInboxNewConversation(input: {
  lineId: number;
  phone?: string;
  record?: DirectConversationRecordInput;
  approvedRecipientId?: number;
  actor: InboxActor;
}): Promise<UnifiedInboxPreparedConversation> {
  const db = await getDb();
  if (!db) throw new Error("Inbox is temporarily unavailable.");
  const [line, target] = await Promise.all([
    authorizedDirectConversationLine(input.lineId, input.actor),
    resolveDirectConversationTarget(
      {
        phone: input.phone,
        record: input.record,
        approvedRecipientId: input.approvedRecipientId,
      },
      input.actor,
      db
    ),
  ]);
  await requireApprovedSyntheticTestRecipient({ db, lineId: line.id, target });
  const existingConversationId = await existingDirectConversation({
    line,
    providerEndpointId: target.providerEndpointId,
  });
  return {
    line: { id: line.id, name: line.lineName },
    target: { displayPhone: target.displayPhone, source: target.source },
    record: target.record,
    existingConversationId,
  };
}

/**
 * Sends the first text through the feature-controlled sandbox adapter, retains it
 * through the existing evidence → normalized message → endpoint → Conversation
 * path, then optionally performs the user-confirmed CRM link.
 */
export async function startInboxNewConversation(input: {
  lineId: number;
  phone?: string;
  record?: DirectConversationRecordInput;
  approvedRecipientId?: number;
  text: string;
  linkRecord: boolean;
  idempotencyKey?: string;
  clientActionId: string;
  actor: InboxActor;
}) {
  const db = await getDb();
  if (!db) throw new Error("Inbox is temporarily unavailable.");
  const text = input.text.trim();
  if (!text) throw new Error("Enter a message before sending.");
  if (text.length > 4096)
    throw new Error(
      "This message is longer than WhatsApp’s 4,096-character limit. Shorten it before sending; messages are not truncated automatically."
    );
  const [line, target] = await Promise.all([
    authorizedDirectConversationLine(input.lineId, input.actor),
    resolveDirectConversationTarget(
      {
        phone: input.phone,
        record: input.record,
        approvedRecipientId: input.approvedRecipientId,
      },
      input.actor,
      db
    ),
  ]);
  const approvedRecipient = await requireApprovedSyntheticTestRecipient({
    db,
    lineId: line.id,
    target,
  });
  const prepared = await ensureDirectConversation({
    line,
    providerEndpointId: target.providerEndpointId,
  });
  const conversationId = prepared.conversationId;
  const result = await sendTrackedSyntheticText({
    conversationId,
    line,
    providerEndpointId: target.providerEndpointId,
    text,
    actor: input.actor,
    idempotencyKey: requireOutboundIdempotencyKey(input.idempotencyKey),
    clientActionId: requireClientActionId(input.clientActionId),
    approvalRecipientId: approvedRecipient.id,
  });
  await audit(
    input.actor,
    prepared.reused
      ? "inbox_synthetic_text_sent"
      : "inbox_direct_conversation_started",
    conversationId,
    prepared.reused
      ? "Sent a synthetic test-only message through the existing endpoint and Conversation pipeline."
      : "Prepared the Endpoint and Conversation before submitting a synthetic test-only message. No CRM or clinical record was created automatically."
  );
  const linkResult = input.linkRecord
    ? await linkRequestedDirectConversation({
        conversationId,
        record: target.record,
        actor: input.actor,
      })
    : { linked: false, notice: null };
  return {
    conversationId,
    reused: prepared.reused,
    linked: linkResult.linked,
    linkNotice: linkResult.notice,
    sendAttemptId: result.attemptId,
    providerMessageId: result.providerMessageId,
    providerAccepted: result.state === "accepted",
    sandboxOnly: true as const,
  };
}

export async function linkInboxConversationRecord(input: {
  conversationId: number;
  recordType: "person" | "lead" | "patient";
  recordId: number;
  confirmReassignment: boolean;
  actor: InboxActor;
}) {
  const access = await conversationAccess(input.conversationId, input.actor);
  if (!access.endpointId)
    throw new Error(
      "This conversation does not have a linkable sender endpoint."
    );
  const existing = await currentCrmRecords(access.db, access.endpointId);
  if (existing.length && !input.confirmReassignment)
    throw new Error(
      "This contact is already linked. Confirm reassignment to continue."
    );
  const target =
    input.recordType === "lead"
      ? await access.db
          .select({ id: leads.id })
          .from(leads)
          .where(eq(leads.id, input.recordId))
          .limit(1)
    : input.recordType === "patient"
        ? await access.db
            .select({ id: patients.id })
            .from(patients)
            .where(eq(patients.id, input.recordId))
            .limit(1)
        : await access.db
            .select({ id: whatsappPersonIdentities.id })
            .from(whatsappPersonIdentities)
            .where(eq(whatsappPersonIdentities.id, input.recordId))
            .limit(1);
  if (!target[0]) throw new Error("The selected CRM record was not found.");
  await access.db.transaction(async tx => {
    if (existing.length) {
      await tx
        .update(whatsappEndpointPersonLinks)
        .set({ linkState: "revoked", revokedAt: new Date() })
        .where(
          and(
            eq(whatsappEndpointPersonLinks.endpointId, access.endpointId!),
            eq(whatsappEndpointPersonLinks.linkState, "confirmed")
          )
        );
    }
    let identityId = input.recordType === "person" ? input.recordId : 0;
    if (input.recordType !== "person") {
      const identityInsert = await tx
        .insert(whatsappPersonIdentities)
        .values({ clinicScope: "fertiliv", identityKind: "human" });
      identityId = Number(
        (identityInsert as any)[0]?.insertId ?? (identityInsert as any).insertId
      );
      await tx.insert(whatsappPersonIdentityRecords).values({
        personIdentityId: identityId,
        recordType: input.recordType,
        recordId: input.recordId,
        relationshipState: "active",
        trustSource: "manual_confirmation",
      });
    }
    await tx.insert(whatsappEndpointPersonLinks).values({
      endpointId: access.endpointId!,
      personIdentityId: identityId,
      linkState: "confirmed",
      trustSource: "manual_confirmation",
      confirmedById: input.actor.id,
      confirmedAt: new Date(),
  });
    await tx
      .update(whatsappConversationParticipants)
      .set({
        personIdentityId: identityId,
        participantState: "confirmed",
        humanActorResolutionState: "confirmed",
      })
      .where(
        eq(
          whatsappConversationParticipants.conversationId,
          input.conversationId
        )
      );
    await tx
      .update(whatsappConversations)
      .set({
        endpointResolutionState: "confirmed",
        humanActorResolutionState: "confirmed",
      })
      .where(eq(whatsappConversations.id, input.conversationId));
  });
  await audit(
    input.actor,
    "inbox_manual_crm_link",
    input.conversationId,
    `Manually linked conversation to ${input.recordType} ${input.recordId}.`
  );
  return { ok: true };
}

export async function createLeadAndLinkInboxConversation(input: {
  conversationId: number;
  firstName: string;
  lastName: string;
  phone?: string;
  relationshipRole: CaseRelationshipRole;
  actor: InboxActor;
}) {
  const access = await conversationAccess(input.conversationId, input.actor);
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName)
    throw new Error("First and last name are required to create a Lead.");
  const lead = await createLead({
    firstName,
    lastName,
    phone: input.phone?.trim() || access.participantId || undefined,
    leadOrigin: "staff-created",
    createdBy: input.actor.id,
    modifiedBy: input.actor.id,
  } as any);
  await linkInboxConversationRecord({
    conversationId: input.conversationId,
    recordType: "lead",
    recordId: lead.id,
    confirmReassignment: true,
    actor: input.actor,
  });
  await audit(
    input.actor,
    "inbox_create_lead_and_link",
    input.conversationId,
    `Created Lead ${lead.id} through an explicit Inbox action; no Patient, MRN, clinical record, or Treatment Case was created.`
  );
  return {
    ok: true,
    leadId: lead.id,
    relationshipRole: input.relationshipRole,
  };
}

export async function linkInboxConversationCase(input: {
  conversationId: number;
  caseId: number;
  relationshipRole: CaseRelationshipRole;
  actor: InboxActor;
}) {
  const access = await conversationAccess(input.conversationId, input.actor);
  const [caseRow] = await access.db
    .select({ id: treatmentCases.id })
    .from(treatmentCases)
    .where(eq(treatmentCases.id, input.caseId))
    .limit(1);
  if (!caseRow) throw new Error("The selected Treatment Case was not found.");
  await access.db
    .insert(whatsappConversationCaseLinks)
    .values({
      conversationId: input.conversationId,
      caseId: input.caseId,
      relationshipRole: input.relationshipRole,
      linkedById: input.actor.id,
    })
    .onConflictDoUpdate({ target: [whatsappConversationCaseLinks.conversationId, whatsappConversationCaseLinks.caseId, whatsappConversationCaseLinks.relationshipRole],
      set: {
        retiredAt: null,
        linkedById: input.actor.id,
        linkedAt: new Date(),
      },
    });
  await audit(
    input.actor,
    "inbox_manual_case_link",
    input.conversationId,
    `Manually linked conversation to Treatment Case ${input.caseId}.`
  );
  return { ok: true };
}

export async function unlinkInboxConversationRecord(
  conversationId: number,
  actor: InboxActor
) {
  const access = await conversationAccess(conversationId, actor);
  if (!access.endpointId)
    throw new Error(
      "This conversation does not have a linkable sender endpoint."
    );
  await access.db.transaction(async tx => {
    await tx
      .update(whatsappEndpointPersonLinks)
      .set({ linkState: "revoked", revokedAt: new Date() })
      .where(
        and(
          eq(whatsappEndpointPersonLinks.endpointId, access.endpointId!),
          eq(whatsappEndpointPersonLinks.linkState, "confirmed")
        )
      );
    await tx
      .update(whatsappConversationParticipants)
      .set({
        personIdentityId: null,
        participantState: "unresolved",
        humanActorResolutionState: "unresolved",
      })
      .where(
        eq(whatsappConversationParticipants.conversationId, conversationId)
      );
    await tx
      .update(whatsappConversations)
      .set({
        endpointResolutionState: "unresolved",
        humanActorResolutionState: "unresolved",
      })
      .where(eq(whatsappConversations.id, conversationId));
  });
  await audit(
    actor,
    "inbox_contact_unlinked",
    conversationId,
    "Removed the manual CRM identity link; the contact remains a separate unresolved conversation."
  );
  return { ok: true };
}

export async function unlinkInboxConversationCase(input: {
  conversationId: number;
  caseId: number;
  actor: InboxActor;
}) {
  const access = await conversationAccess(input.conversationId, input.actor);
  await access.db
    .update(whatsappConversationCaseLinks)
    .set({ retiredAt: new Date() })
    .where(
      and(
        eq(whatsappConversationCaseLinks.conversationId, input.conversationId),
        eq(whatsappConversationCaseLinks.caseId, input.caseId),
        isNull(whatsappConversationCaseLinks.retiredAt)
      )
    );
  await audit(
    input.actor,
    "inbox_case_unlinked",
    input.conversationId,
    `Removed Treatment Case ${input.caseId} as shared context; identities and endpoints remain separate.`
  );
  return { ok: true };
}

export async function setInboxConversationTag(input: {
  conversationId: number;
  tag: string;
  enabled: boolean;
  actor: InboxActor;
}) {
  const access = await conversationAccess(input.conversationId, input.actor);
  const tag = normalizeTag(input.tag);
  if (input.enabled) {
    await access.db
      .insert(whatsappConversationTags)
      .values({
        conversationId: input.conversationId,
        tag,
        createdById: input.actor.id,
      })
      .onConflictDoUpdate({ target: [whatsappConversationTags.conversationId, whatsappConversationTags.tag], set: { tag } });
  } else {
    await access.db
      .delete(whatsappConversationTags)
      .where(
        and(
          eq(whatsappConversationTags.conversationId, input.conversationId),
          eq(whatsappConversationTags.tag, tag)
        )
      );
  }
  await audit(
    input.actor,
    input.enabled ? "inbox_tag_added" : "inbox_tag_removed",
    input.conversationId,
    `${input.enabled ? "Added" : "Removed"} tag “${tag}”.`
  );
  return { ok: true };
}

export async function getInboxConversationActivity(
  conversationId: number,
  actor: InboxActor
) {
  const access = await conversationAccess(conversationId, actor);
  const rows = await access.db
    .select({
      id: whatsappConversationActivities.id,
      action: whatsappConversationActivities.action,
      summary: whatsappConversationActivities.summary,
      actorName: users.name,
      createdAt: whatsappConversationActivities.createdAt,
    })
    .from(whatsappConversationActivities)
    .leftJoin(users, eq(users.id, whatsappConversationActivities.actorId))
    .where(eq(whatsappConversationActivities.conversationId, conversationId))
    .orderBy(desc(whatsappConversationActivities.createdAt))
    .limit(100);
  return rows.map(
    (row): UnifiedInboxActivity => ({
      id: row.id,
      action: row.action,
      summary: row.summary,
      actorName: row.actorName ?? "Staff member",
      createdAt: row.createdAt,
    })
  );
}

export async function requestInboxMediaAccess(input: {
  conversationId: number;
  mediaId: number;
  action: "open" | "download";
  actor: InboxActor;
}) {
  await conversationAccess(input.conversationId, input.actor);
  const { requestAuthorizedMediaAccess } = await import("./communicationMedia");
  try {
    const result = await requestAuthorizedMediaAccess({
      conversationId: input.conversationId,
      mediaAssetId: input.mediaId,
      action: input.action,
      actor: input.actor,
    });
    await audit(
      input.actor,
      `inbox_media_${input.action}_requested`,
      input.conversationId,
      `${input.action === "download" ? "Download" : "Open"} requested for a media attachment.`
    );
    return result;
  } catch (error) {
    // Normalized provider-media metadata may exist before durable storage is configured.
    // Provider URLs, storage paths, session material, and raw credentials are never exposed.
    if (
      error instanceof Error &&
      /not available|not belong|access/i.test(error.message)
    ) {
      return {
        available: false,
        action: input.action,
        label: "Media access",
        reason:
          "This attachment is not retained in secure application storage.",
      };
    }
    throw error;
  }
}

export async function getInboxPolicies(
  actor: InboxActor
): Promise<UnifiedInboxPolicies> {
  if (!isAdmin(actor))
    throw new Error("Only administrators can view Inbox policies.");
  const db = await getDb();
  if (!db) throw new Error("Inbox is temporarily unavailable.");
  const [settings] = await db
    .select()
    .from(whatsappInboxSettings)
    .where(eq(whatsappInboxSettings.clinicScope, "fertiliv"))
    .limit(1);
  return policyProjection(settings);
}

export async function updateInboxPolicies(input: {
  policies: UnifiedInboxPolicies;
  actor: InboxActor;
}) {
  if (!isAdmin(input.actor))
    throw new Error("Only administrators can update Inbox policies.");
  const db = await getDb();
  if (!db) throw new Error("Inbox is temporarily unavailable.");
  const safePolicies: UnifiedInboxPolicies = {
    ...input.policies,
    // No policy value can enable automatic contact/Lead/identity/clinical creation.
    newSenderBehavior: "conversation_only",
    automaticPatient: false,
    automaticMrn: false,
    automaticClinicalRecord: false,
    exactPhoneMatch:
      input.policies.exactPhoneMatch === "never_auto_link"
        ? "never_auto_link"
        : "suggest",
  };
  await db
    .insert(whatsappInboxSettings)
    .values({
      clinicScope: "fertiliv",
      ...safePolicies,
      updatedById: input.actor.id,
    })
    .onConflictDoUpdate({ target: whatsappInboxSettings.clinicScope,
      set: {
        ...safePolicies,
        updatedById: input.actor.id,
        updatedAt: new Date(),
      },
    });
  await logAudit({
    userId: input.actor.id,
    userName: input.actor.name ?? null,
    userRole: input.actor.role,
    action: "inbox_policy_updated",
    category: "other",
    recordId: null,
    recordType: "whatsapp_inbox_settings",
    page: "/settings",
    description:
      "Updated safe operational Inbox policies; automatic Patient, MRN, and clinical record creation remain off.",
  });
  return safePolicies;
}

async function sendSynthetic(input: {
  conversationId: number;
  text: string;
  media: boolean;
  idempotencyKey?: string;
  clientActionId: string;
  actor: InboxActor;
  attachment?: {
    fileBase64: string;
    mimeType: string;
    filename: string;
    caption?: string;
  };
}) {
  const access = await conversationAccess(input.conversationId, input.actor);
  if (access.adapterKind !== "wppconnect_in_app_sandbox")
    throw new Error(
      "This composer is available only for the non-production in-app test line."
    );
  if (!access.participantId)
    throw new Error(
      "A synthetic recipient endpoint is required before sending."
    );
  const directRecipient = normalizeInboxDirectPhone(access.participantId);
  if (!directRecipient || !access.lineId)
    throw new Error(
      "This conversation does not have an approved international synthetic test recipient."
    );
  const approvedRecipient = await requireApprovedSyntheticTestRecipient({
    db: access.db,
    lineId: access.lineId,
    target: {
      providerEndpointId: directRecipient.replace(/^\+/, ""),
      displayPhone: directRecipient,
      source: "typed_phone",
      record: null,
    },
  });
  if (input.media) {
    if (!input.attachment)
      throw new Error("Choose an attachment before sending.");
    const line = await authorizedDirectConversationLine(
      access.lineId!,
      input.actor
    );
    if (
      line.connection.id !== access.connectionId ||
      line.connection.phoneNumberId !== access.providerPhoneNumberId
    )
      throw new Error(
        "This conversation is no longer associated with the selected synthetic test line."
      );
    const attachment = validateSyntheticAttachment(input.attachment);
    const result = await sendTrackedSyntheticMedia({
      conversationId: input.conversationId,
      line,
      providerEndpointId: directRecipient.replace(/^\+/, ""),
      ...attachment,
      actor: input.actor,
      idempotencyKey: requireOutboundIdempotencyKey(input.idempotencyKey),
      clientActionId: requireClientActionId(input.clientActionId),
      approvalRecipientId: approvedRecipient.id,
    });
    await audit(
      input.actor,
      "inbox_synthetic_media_sent",
      input.conversationId,
      "Sent a controlled test attachment through the existing evidence, Conversation, and media-custody pipeline."
    );
    return {
      ok: true,
      sandboxOnly: true,
      providerMessageId: result.providerMessageId,
      sendAttemptId: result.attemptId,
      retained: result.retained,
    };
  }
  const line = await authorizedDirectConversationLine(
    access.lineId!,
    input.actor
  );
  if (
    line.connection.id !== access.connectionId ||
    line.connection.phoneNumberId !== access.providerPhoneNumberId
  ) {
    throw new Error(
      "This conversation is no longer associated with the selected synthetic test line."
    );
  }
  const result = await sendTrackedSyntheticText({
    conversationId: input.conversationId,
    line,
    providerEndpointId: directRecipient.replace(/^\+/, ""),
    text: input.text,
    actor: input.actor,
    idempotencyKey: requireOutboundIdempotencyKey(input.idempotencyKey),
    clientActionId: requireClientActionId(input.clientActionId),
    approvalRecipientId: approvedRecipient.id,
  });
  await audit(
    input.actor,
    input.media ? "inbox_synthetic_media_sent" : "inbox_synthetic_text_sent",
    input.conversationId,
    "Synthetic test-only outbound message retained through the existing evidence and Conversation pipeline."
  );
  return {
    ok: true,
    sandboxOnly: true,
    providerMessageId: result.providerMessageId,
    sendAttemptId: result.attemptId,
    retained: result.retained,
  };
}

export async function sendInboxSyntheticText(input: {
  conversationId: number;
  text: string;
  idempotencyKey?: string;
  clientActionId: string;
  actor: InboxActor;
}) {
  return sendSynthetic({ ...input, media: false });
}
export async function sendInboxSyntheticMedia(input: {
  conversationId: number;
  fileBase64: string;
  mimeType: string;
  filename: string;
  caption?: string;
  idempotencyKey?: string;
  clientActionId: string;
  actor: InboxActor;
}) {
  return sendSynthetic({
    ...input,
    text: "",
    media: true,
    attachment: {
      fileBase64: input.fileBase64,
      mimeType: input.mimeType,
      filename: input.filename,
      caption: input.caption,
    },
  });
}
