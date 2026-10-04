export const unifiedInboxChannelKinds = [
  "whatsapp_linked_device",
  "whatsapp_cloud_api",
  "email",
  "instagram",
  "telegram",
  "sms",
  "calls",
] as const;

export type UnifiedInboxChannelKind = (typeof unifiedInboxChannelKinds)[number];
export type UnifiedInboxIdentityState = "unresolved" | "known";
export type UnifiedInboxResolutionFilter = "all" | UnifiedInboxIdentityState;
export type UnifiedInboxOperationalFilter = "all" | "unread" | "assigned_to_me" | "unassigned" | "new_contacts" | "known_contacts";
export type UnifiedInboxDirection = "inbound" | "outbound_echo" | "unknown";
export type UnifiedInboxReadState = "read" | "unread";
export type UnifiedInboxPhoneVisibility = "full" | "masked" | "unavailable";
export const UNIFIED_INBOX_TEXT_LIMIT = 4096;
export const UNIFIED_INBOX_TEXT_LIMIT_MESSAGE = "This message is longer than WhatsApp’s 4,096-character limit. Shorten it before sending; messages are not truncated automatically.";
export const UNIFIED_INBOX_MEDIA_MAX_BYTES = 15 * 1024 * 1024;
export const UNIFIED_INBOX_MEDIA_MAX_BASE64_LENGTH = Math.ceil(UNIFIED_INBOX_MEDIA_MAX_BYTES * 4 / 3) + 8;
export const UNIFIED_INBOX_MEDIA_LIMIT_MESSAGE = "This attachment is too large. Choose a file up to 15 MB.";

const unifiedInboxAttachmentMimeByExtension: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  zip: "application/zip",
  txt: "text/plain",
  md: "text/markdown",
  markdown: "text/markdown",
};

export function unifiedInboxMediaTypeForMime(mimeType: string): "image" | "document" | null {
  const mime = mimeType.trim().toLowerCase().split(";", 1)[0] ?? "";
  if (/^image\/(jpeg|jpg|png|gif|webp|bmp|tiff|heic|heif)$/.test(mime)) return "image";
  if ([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "text/plain",
    "text/markdown",
  ].includes(mime)) return "document";
  return null;
}

/**
 * Browser pickers occasionally omit a type or return generic binary data.
 * Fall back only to this fixed extension allowlist; arbitrary filenames never
 * grant an unsupported MIME type.
 */
export function resolveUnifiedInboxAttachmentMime(browserMime: string | null | undefined, filename: string | null | undefined): string | null {
  const normalized = typeof browserMime === "string" ? browserMime.trim().toLowerCase().split(";", 1)[0] ?? "" : "";
  const extension = typeof filename === "string" ? filename.trim().toLowerCase().match(/\.([a-z0-9]{1,12})$/)?.[1] ?? "" : "";
  const extensionMime = unifiedInboxAttachmentMimeByExtension[extension] ?? null;
  if (unifiedInboxMediaTypeForMime(normalized)) {
    // Some iOS file pickers label .md as text/plain. Preserve the more useful,
    // explicitly allowed Markdown MIME without trusting unrelated extensions.
    return extensionMime === "text/markdown" ? extensionMime : normalized;
  }
  return (normalized === "" || normalized === "application/octet-stream") ? extensionMime : null;
}
export const unifiedInboxDirectSendFailureCategories = [
  "sending_line_unavailable",
  "recipient_invalid",
  "test_recipient_not_authorized",
  "provider_temporarily_unavailable",
  "session_unavailable",
  "wpp_probe_timeout",
  "wpp_probe_not_ready",
  "worker_response_contract_mismatch",
  "wpp_recipient_proof_rejected",
  "wpp_send_rejected_before_provider_id",
  "wpp_send_uncertain_after_provider_call",
  "status_unknown",
  "requires_retry",
  "feature_disabled",
] as const;
export type UnifiedInboxDirectSendFailureCategory = (typeof unifiedInboxDirectSendFailureCategories)[number];

export type UnifiedInboxNewConversationRecordType = "person" | "lead" | "patient";
export type UnifiedInboxNewConversationPhoneOption = {
  key: string;
  label: string;
  displayPhone: string;
};
export type UnifiedInboxNewConversationRecordTarget = {
  kind: "crm";
  recordType: UnifiedInboxNewConversationRecordType;
  recordId: number;
  label: string;
  description: string;
  phoneOptions: UnifiedInboxNewConversationPhoneOption[];
};
export type UnifiedInboxNewConversationExistingTarget = {
  kind: "conversation";
  conversationId: number;
  lineId: number;
  label: string;
  description: string;
  displayEndpoint: string;
};
export type UnifiedInboxNewConversationSearchResult =
  | UnifiedInboxNewConversationRecordTarget
  | UnifiedInboxNewConversationExistingTarget;
export type UnifiedInboxNewConversationSendingLine = {
  id: number;
  name: string;
  status: "connected";
  health: "healthy" | "unknown" | "degraded";
  suggested: boolean;
};
export type UnifiedInboxPreparedConversation = {
  line: { id: number; name: string };
  target: { displayPhone: string; source: "typed_phone" | "crm_record" | "approved_test_recipient" };
  record: { recordType: UnifiedInboxNewConversationRecordType; recordId: number; label: string } | null;
  existingConversationId: number | null;
};

export function friendlyInboxMutationError(error: unknown, fallback = "The action could not be completed. Please try again."): string {
  const raw = typeof error === "string"
    ? error
    : error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown } | null)?.message === "string"
        ? String((error as { message: string }).message)
        : "";
  if (!raw) return fallback;
  if (/too_big|maximum\s*:\s*4096|4096|zod|path\s*:|code\s*:|invalid_type|expected\s*:|received\s*:|sql|database|ER_[A-Z_]+|constraint failed|syntax error/i.test(raw)) {
    return /too_big|maximum\s*:\s*4096|4096/i.test(raw) ? UNIFIED_INBOX_TEXT_LIMIT_MESSAGE : fallback;
  }
  return raw.length <= 240 ? raw : fallback;
}

export function normalizeInboxPhone(value: string | null | undefined): string | null {
  const normalized = typeof value === "string"
    ? value.trim().replace(/@(c\.us|s\.whatsapp\.net)$/i, "")
    : "";
  if (!normalized || !/^[+0-9][0-9\s+()\-]{5,}$/.test(normalized)) return null;
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15 ? normalized : null;
}

/**
 * Validates a staff-entered international recipient number without treating the
 * number as identity proof. The returned value is display-form E.164; callers
 * must still scope transport and conversation correlation to an authorized line.
 */
export function normalizeInboxDirectPhone(value: string | null | undefined): string | null {
  const supplied = typeof value === "string" ? value.trim() : "";
  if (!supplied || !/^\+?[0-9][0-9\s()\-.]*$/.test(supplied)) return null;
  const digits = supplied.replace(/\D/g, "");
  if (!/^[1-9][0-9]{6,14}$/.test(digits)) return null;
  return `+${digits}`;
}

export function classifyInboxSenderEndpoint(value: string | null | undefined): "phone" | "synthetic" | "unavailable" {
  if (normalizeInboxPhone(value)) return "phone";
  return typeof value === "string" && value.trim() ? "synthetic" : "unavailable";
}

export function canDisplayFullInboxPhone(phoneVisibility: UnifiedInboxPolicies["phoneVisibility"] | null | undefined, role: string): boolean {
  if (phoneVisibility === "admin_only_full") return role === "admin";
  if (phoneVisibility === "mask_selected_roles") return role === "admin" || role === "manager";
  return phoneVisibility === "full_authorized";
}

export function reconcileInboxSelection(input: {
  selectedId: number | null;
  initialConversationId?: number | null;
  conversationIds: number[];
}): number | null {
  const { selectedId, initialConversationId, conversationIds } = input;
  if (selectedId !== null && conversationIds.includes(selectedId)) return selectedId;
  if (selectedId === null && initialConversationId && conversationIds.includes(initialConversationId)) return initialConversationId;
  return null;
}

/**
 * Fertiliv's internal read policy is intentionally independent of WhatsApp
 * delivery/read receipts: an inbound message is auto-read only when the
 * selected Conversation is actually visible in the focused browser tab.
 */
export function shouldAutoMarkInboxConversationRead(input: {
  conversationSelected: boolean;
  documentVisible: boolean;
  windowFocused: boolean;
}): boolean {
  return input.conversationSelected && input.documentVisible && input.windowFocused;
}

export type UnifiedInboxAssignee = { id: number; name: string | null; role: string } | null;

export type UnifiedInboxConversation = {
  conversationId: number;
  conversationReference: string;
  conversationType: "private" | "group";
  channel: UnifiedInboxChannelKind;
  methodLabel: string;
  identityState: UnifiedInboxIdentityState;
  endpointResolutionState: "unresolved" | "candidate_single" | "candidate_multiple" | "confirmed";
  humanActorResolutionState: "unresolved" | "confirmed";
  medicalSubjectResolutionState: "unresolved";
  safeSenderEndpoint: string;
  senderEndpointKind?: "phone" | "synthetic" | "unavailable";
  displaySenderEndpoint?: string;
  displayName?: string | null;
  latestPreview?: string | null;
  line: { id: number | null; name: string; status: string; health: string; maskedPhone: string | null };
  lastMessage: { id: number; direction: UnifiedInboxDirection; timestamp: Date | null; messageType: string; correlationState: "correlated" | "quarantined" };
  lastActivityAt: Date | null;
  readState: UnifiedInboxReadState | "not_tracked";
  unreadCount?: number;
  assignedTo?: UnifiedInboxAssignee;
  provenance: { provider: "meta" | "wppconnect" | "zernio"; providerMessageId: string | null; sourceEventId: number; normalizedMessageId: number; endpointResolutionId: number | null };
};

export type UnifiedInboxTimelineMedia = {
  id: number;
  mediaAssetId: number | null;
  mediaType: string;
  mimeType: string | null;
  filename: string | null;
  caption: string | null;
  mediaState: "metadata_only" | "quarantined";
  providerMediaId: string | null;
  mediaAvailable: boolean;
};

export type UnifiedInboxTimelineItem = {
  id: number;
  direction: UnifiedInboxDirection;
  timestamp: Date | null;
  messageType: string;
  messageBody: string | null;
  bodyVisibility: "synthetic_safe" | "authorized" | "not_exposed";
  reactions?: string[];
  sharedContact?: { name: string; phone: string | null } | null;
  media: UnifiedInboxTimelineMedia[];
  reply: { providerMessageId: string; relationship: "reaction_reference" } | null;
  deliveryStatus: { statusValue: string; timestamp: Date | null; errorCode: string | null; errorTitle: string | null } | null;
  normalization: { state: "normalized" | "quarantined"; version: string; failureCategory: string | null };
  correlationState: "correlated" | "quarantined";
  provenance: { provider: "meta" | "wppconnect" | "zernio"; providerMessageId: string | null; providerItemKey: string; sourceEventId: number; normalizedMessageId: number; endpointResolutionId: number | null };
};

export type UnifiedInboxOutboundAttempt = {
  id: number;
  state: "pending" | "submitting" | "accepted" | "delivered" | "read" | "failed" | "ambiguous" | "requires_retry";
  createdAt: Date;
  providerMessageId: string | null;
  failureCategory: string | null;
  clientActionId?: string | null;
  diagnostic?: {
    stage: string;
    probe: string;
    outcome: string;
    timestamp: Date;
    correlationId?: string | null;
    approvalReason?: string | null;
    lineId?: number | null;
    sessionName?: string | null;
    runtimeEndpointHost?: string | null;
    runtimeMode?: "sandbox" | "persistent_worker" | null;
    gateValue?: boolean | null;
    secretSelector?: "jwt_secret" | "persistent_worker_approval_secret" | null;
    proofVersion?: number | null;
    expiryState?: string | null;
    recipientFingerprint?: string | null;
  } | null;
};

export type UnifiedInboxCrmRecord = { recordType: "person" | "lead" | "patient"; id: number; label: string; phone: string | null; email?: string | null; language: string | null; country: string | null; status: string | null };
export type UnifiedInboxRelationshipRole = "patient" | "husband" | "wife" | "representative" | "family" | "translator" | "other";
export type UnifiedInboxCaseContext = { id: number; label: string; status: string | null; relationshipRole: UnifiedInboxRelationshipRole } | null;
export type UnifiedInboxActivity = { id: number; action: string; summary: string; actorName: string; createdAt: Date };
export type UnifiedInboxMediaAccess = { available: boolean; action: "open" | "download"; label: string; reason: string | null; endpoint?: string | null };
export type UnifiedInboxCrmSuggestion = {
  id: number;
  candidateType: "person" | "lead" | "patient";
  candidateId: number;
  label: string;
  matchedField: "exact_phone" | "provider_hint";
  confidence: "high" | "medium";
  state: "pending" | "accepted" | "dismissed";
};
export type UnifiedInboxNotificationPreferences = {
  notifyNewConversation: boolean;
  notifyNewMessage: boolean;
  notifyAssignment: boolean;
  notifyHealth: boolean;
};
export type UnifiedInboxPolicies = {
  phoneVisibility: "full_authorized" | "mask_selected_roles" | "admin_only_full";
  newSenderBehavior: "conversation_only" | "create_contact" | "create_lead";
  exactPhoneMatch: "suggest" | "auto_link_trusted" | "never_auto_link";
  duplicateDetection: "suggest" | "require_confirmation";
  caseSuggestions: boolean;
  automaticPatient: boolean;
  automaticMrn: boolean;
  automaticClinicalRecord: boolean;
};

export type UnifiedInboxOperationalContext = {
  contactStatus: "new_contact" | "known_contact";
  phone: string | null;
  phoneVisibility: UnifiedInboxPhoneVisibility;
  language: string | null;
  country: string | null;
  tags: string[];
  assignedTo: UnifiedInboxAssignee;
  crmRecords: UnifiedInboxCrmRecord[];
  caseContext: UnifiedInboxCaseContext;
  availableStaff: Array<{ id: number; name: string | null; role: string }>;
  activities: UnifiedInboxActivity[];
  crmSuggestions?: UnifiedInboxCrmSuggestion[];
  canCompose: boolean;
  composerNotice: string | null;
};

export type UnifiedInboxConversationDetail = {
  conversation: UnifiedInboxConversation;
  firstActivityAt: Date | null;
  lastActivityAt: Date | null;
  timeline: UnifiedInboxTimelineItem[];
  outboundAttempts: UnifiedInboxOutboundAttempt[];
  operational: UnifiedInboxOperationalContext;
  diagnostics: {
    readOnly: boolean;
    identityCreation: "disabled" | "manual_only";
    provider: "meta" | "wppconnect" | "zernio";
    connectionId: number | null;
    lineId: number | null;
    endpointId: number | null;
    providerPhoneNumberId: string;
    syntheticSafeBody: boolean;
  };
};

export type UnifiedInboxProjection = {
  conversations: UnifiedInboxConversation[];
  total: number;
  filters: { channel: "whatsapp_linked_device"; resolution: UnifiedInboxResolutionFilter; search: string; operational?: UnifiedInboxOperationalFilter };
  readOnly: boolean;
  identityCreation: "disabled" | "manual_only";
};
