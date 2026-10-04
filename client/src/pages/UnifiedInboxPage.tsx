import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/_core/hooks/useAuth";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { DraftBanner, useDraftForm } from "@/hooks/useDraftForm";
import { trpc } from "@/lib/trpc";
import { inspectInboxAttachmentFile } from "@/lib/inboxAttachment";
import { deliverInboxAttachment } from "@/lib/inboxMediaUpload";
import { preferredVoiceRecorderMime, voiceRecordingFile } from "@shared/voiceRecorder";
import { friendlyInboxMutationError, normalizeInboxDirectPhone, reconcileInboxSelection, shouldAutoMarkInboxConversationRead, UNIFIED_INBOX_MEDIA_LIMIT_MESSAGE, UNIFIED_INBOX_MEDIA_MAX_BYTES, UNIFIED_INBOX_TEXT_LIMIT, UNIFIED_INBOX_TEXT_LIMIT_MESSAGE } from "@shared/unifiedInbox";
import type { UnifiedInboxConversation, UnifiedInboxTimelineItem } from "@shared/unifiedInbox";
import { format, formatDistanceToNow } from "date-fns";
import {
  Archive,
  ArrowLeft,
  AudioLines,
  Check,
  CheckCheck,
  ChevronDown,
  CircleUserRound,
  Download,
  ExternalLink,
  File,
  Filter,
  ImagePlus,
  Inbox,
  Link2,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Send,
  Shield,
  Settings2,
  Tag,
  UserPlus,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";

type AnyRecord = Record<string, any>;
type InboxFilter = "all" | "unread" | "assigned" | "unassigned" | "new" | "known";
const isMeaningfulInboxComposerDraft = (draft: { text: string; caption: string }) => Boolean(draft.text?.trim() || draft.caption?.trim());
type PolicyDraft = {
  phoneVisibility: string;
  newSenderBehavior: string;
  exactPhoneMatch: string;
  duplicateDetection: string;
  caseSuggestions: boolean;
  automaticPatient: boolean;
  automaticMrn: boolean;
  automaticClinicalRecord: boolean;
};

type CreateLeadDraft = {
  firstName: string;
  lastName: string;
  phone: string;
  relationshipRole: string;
};

type LinkExistingDraft = {
  recordType: "person" | "lead" | "patient";
  recordId: number | null;
  confirmReassignment: boolean;
};

type LinkCaseDraft = {
  caseId: string;
  relationshipRole: string;
};

type NewConversationDraft = {
  query: string;
  phone: string;
  recordType: "person" | "lead" | "patient" | "";
  recordId: number | null;
  phoneKey: string;
  lineId: string;
  text: string;
  linkRecord: boolean;
  idempotencyKey: string;
  clientActionId: string;
};

type NewConversationRecord = {
  kind: "crm";
  recordType: "person" | "lead" | "patient";
  recordId: number;
  label: string;
  description: string;
  phoneOptions: Array<{ key: string; label: string; displayPhone: string }>;
};

type NewConversationResult = NewConversationRecord | {
  kind: "conversation";
  conversationId: number;
  lineId: number;
  label: string;
  description: string;
  displayEndpoint: string;
};

function recordOf(value: unknown): AnyRecord {
  return value && typeof value === "object" ? (value as AnyRecord) : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getErrorMessage(error: unknown, fallback: string) {
  return friendlyInboxMutationError(error, fallback);
}

function isClinicWhatsApp(conversation: UnifiedInboxConversation) {
  return conversation.methodLabel === "WhatsApp" || conversation.provenance?.provider === "zernio";
}

function displayName(conversation: UnifiedInboxConversation) {
  const item = recordOf(conversation);
  const contact = recordOf(item.contact ?? item.contactRecord ?? item.crmContact);
  const endpointKind = item.senderEndpointKind ?? conversation.senderEndpointKind;
  const named = text(item.displayName ?? item.contactName ?? contact.displayName ?? contact.name);
  if (named) return named;
  if (isClinicWhatsApp(conversation)) return "WhatsApp contact";
  if (endpointKind === "synthetic") return "Synthetic test contact";
  if (endpointKind === "unavailable") return "New contact";
  return conversation.safeSenderEndpoint || "New contact";
}

function displayPhone(conversation: UnifiedInboxConversation) {
  const item = recordOf(conversation);
  const contact = recordOf(item.contact ?? item.contactRecord ?? item.crmContact);
  if (isClinicWhatsApp(conversation)) {
    if (item.senderEndpointKind === "unavailable" || conversation.senderEndpointKind === "unavailable") return "Phone number unavailable";
    return text(item.displaySenderEndpoint ?? item.fullPhoneNumber ?? item.phone ?? contact.phone ?? conversation.safeSenderEndpoint, "Phone number unavailable");
  }
  if (item.senderEndpointKind === "synthetic" || conversation.senderEndpointKind === "synthetic") return "Synthetic test contact";
  if (item.senderEndpointKind === "unavailable" || conversation.senderEndpointKind === "unavailable") return "Phone number unavailable";
  return text(item.displaySenderEndpoint ?? item.fullPhoneNumber ?? item.phone ?? contact.phone ?? conversation.safeSenderEndpoint, "Phone number unavailable");
}

function conversationPreview(conversation: UnifiedInboxConversation) {
  const preview = text(conversation.latestPreview);
  if (preview) return preview;
  const messageType = conversation.lastMessage.messageType;
  if (messageType === "image") return "Photo";
  if (messageType === "video") return "Video";
  if (messageType === "voice" || messageType === "audio") return "Voice message";
  if (messageType === "document" || messageType === "file") return "Document";
  if (messageType === "contact") return "Contact";
  if (messageType === "sticker") return "Sticker";
  return messageType === "text" ? "New message" : humanLabel(messageType);
}

function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function formatShortDate(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return format(date, "h:mm a");
}

function formatActivity(value: Date | string | null | undefined) {
  if (!value) return "No recent activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No recent activity";
  return `${format(date, "MMM d, h:mm a")} · ${formatDistanceToNow(date, { addSuffix: true })}`;
}

function humanLabel(value: unknown, fallback = "Message") {
  const valueText = text(value, fallback);
  return valueText.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function outboundAttemptLabel(attempt: { state: string; failureCategory?: string | null }, lineCurrentlyHealthy: boolean) {
  const category = attempt.failureCategory ?? "";
  if (attempt.state === "pending" || attempt.state === "submitting") return "Sending…";
  if (attempt.state === "ambiguous") return "Delivery status could not be confirmed";
  if (attempt.state === "requires_retry") {
    if (!lineCurrentlyHealthy) return "Messaging is temporarily unavailable for this conversation.";
    return "Message not sent. Please try again when messaging is available.";
  }
  if (attempt.state === "failed") return "Message could not be sent.";
  if (attempt.state === "accepted") return "Sent";
  if (attempt.state === "delivered") return "Delivered";
  if (attempt.state === "read") return "Read";
  return "Message could not be sent.";
}

function outboundAttemptDetail(attempt: { state: string; failureCategory?: string | null }, lineCurrentlyHealthy: boolean) {
  if (attempt.state === "ambiguous") return "Please do not resend this message yet.";
  if (attempt.state === "requires_retry" && !lineCurrentlyHealthy) return "Messaging is temporarily unavailable for this conversation.";
  if (attempt.state === "requires_retry") return "Please try again when messaging is available.";
  if (attempt.state === "failed") return "No automatic resend was performed.";
  return "This message remains protected from duplicate sending.";
}

function conversationUnread(conversation: UnifiedInboxConversation) {
  const item = recordOf(conversation);
  if (typeof item.unread === "boolean") return item.unread;
  if (typeof item.isUnread === "boolean") return item.isUnread;
  return Number(item.unreadCount) > 0 || item.readState === "unread";
}

function conversationAssignedToMe(conversation: UnifiedInboxConversation, userId: number | undefined) {
  if (!userId) return false;
  const item = recordOf(conversation);
  const assignment = recordOf(item.assignedTo ?? item.assignment ?? item.assignee);
  return Number(item.assignedUserId ?? assignment.id ?? assignment.userId) === userId;
}

function isNewContact(conversation: UnifiedInboxConversation) {
  return conversation.identityState === "unresolved";
}

function useInboxMutation(name: string) {
  const procedure = (trpc.inbox as any)[name] as { useMutation?: () => any } | undefined;
  return procedure?.useMutation ? procedure.useMutation() : null;
}

function useOptionalInboxQuery(name: string, input?: AnyRecord, options: AnyRecord = {}) {
  const procedure = (trpc.inbox as any)[name] as { useQuery?: (queryInput?: AnyRecord, queryOptions?: AnyRecord) => any } | undefined;
  const query = procedure?.useQuery;
  return query ? query(input, options) : null;
}

function isUnassigned(conversation: UnifiedInboxConversation) {
  const item = recordOf(conversation);
  return !item.assignedUserId && !item.assignedTo && !item.assignment && !item.assignee && !conversation.assignedTo;
}

function crmRecordLabel(record: AnyRecord) {
  return text(record.label ?? record.displayName ?? record.name, `${humanLabel(record.recordType, "Contact")} ${record.id ?? ""}`.trim());
}

function conversationAssignedName(conversation: UnifiedInboxConversation) {
  const item = recordOf(conversation);
  const assignment = recordOf(item.assignedTo ?? item.assignment ?? item.assignee);
  return text(item.assignedUserName ?? assignment.name ?? conversation.assignedTo?.name);
}

function mediaIcon(media: AnyRecord) {
  const mime = text(media.mimeType ?? media.mediaType).toLowerCase();
  if (mime.startsWith("image")) return ImagePlus;
  if (mime.startsWith("video")) return Video;
  if (mime.startsWith("audio")) return AudioLines;
  return File;
}

async function runInboxMutation(
  mutation: any,
  input: AnyRecord,
  successMessage: string,
  unavailableMessage = "This action is not available yet.",
  options: { suppressSuccess?: boolean } = {},
) {
  if (!mutation?.mutateAsync) {
    toast.error(unavailableMessage);
    return false;
  }
  try {
    await mutation.mutateAsync(input);
    if (!options.suppressSuccess) toast.success(successMessage);
    return true;
  } catch (error) {
    toast.error(getErrorMessage(error, "Something went wrong. Please try again."));
    return false;
  }
}

function getOperationalName(data: unknown) {
  const item = recordOf(data);
  const contact = recordOf(item.contact ?? item.crmContact ?? item.linkedRecord);
  return text(item.displayName ?? item.contactName ?? contact.displayName ?? contact.name);
}

function ContactAvatar({ conversation, size = "md" }: { conversation: UnifiedInboxConversation; size?: "sm" | "md" | "lg" }) {
  const name = displayName(conversation);
  return (
    <Avatar className={size === "lg" ? "h-14 w-14" : size === "sm" ? "h-9 w-9" : "h-11 w-11"}>
      <AvatarFallback className="bg-[#1E0566]/10 font-semibold text-[#1E0566]">{initials(name)}</AvatarFallback>
    </Avatar>
  );
}

function NewConversationDialog({
  open,
  onOpenChange,
  prefill,
  onConversationReady,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: { recordType: "person" | "lead" | "patient"; recordId: number } | null;
  onConversationReady: (conversationId: number) => Promise<void>;
}) {
  const initialData = useMemo<NewConversationDraft>(() => ({
    query: "",
    phone: "",
    recordType: prefill?.recordType ?? "",
    recordId: prefill?.recordId ?? null,
    phoneKey: "",
    lineId: "",
    text: "",
    linkRecord: false,
    idempotencyKey: "",
    clientActionId: "",
  }), [prefill]);
  const { form, setForm, hasDraft, clearDraft } = useDraftForm<NewConversationDraft>({
    key: `inbox-new-conversation-${prefill ? `${prefill.recordType}-${prefill.recordId}` : "manual"}`,
    initialData,
  });
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedRecord, setSelectedRecord] = useState<NewConversationRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const lineQuery = useOptionalInboxQuery("newConversationLines", undefined, { enabled: open, retry: false });
  const recordQuery = useOptionalInboxQuery(
    "newConversationRecord",
    form.recordType && form.recordId ? { recordType: form.recordType, recordId: form.recordId } : { recordType: "lead", recordId: 0 },
    { enabled: open && Boolean(form.recordType && form.recordId), retry: false },
  );
  const searchQuery = useOptionalInboxQuery(
    "newConversationSearch",
    { query: debouncedQuery },
    { enabled: open && debouncedQuery.length > 0, retry: false },
  );
  const startNewConversation = useInboxMutation("startNewConversation");
  const lines = useMemo(() => (Array.isArray(lineQuery?.data) ? lineQuery.data : []) as Array<{ id: number; name: string; status: string; health: string; suggested: boolean }>, [lineQuery?.data]);
  const searchResults = useMemo(() => (Array.isArray(searchQuery?.data) ? searchQuery.data : []) as NewConversationResult[], [searchQuery?.data]);
  const recordTarget = (selectedRecord ?? recordQuery?.data ?? null) as NewConversationRecord | null;
  const directPhone = normalizeInboxDirectPhone(form.query);
  const hasMultipleLines = lines.length > 1;
  const remaining = UNIFIED_INBOX_TEXT_LIMIT - form.text.length;
  const isOverLimit = form.text.length > UNIFIED_INBOX_TEXT_LIMIT;
  const hasAmbiguousPhone = Boolean(recordTarget && recordTarget.phoneOptions.length > 1 && !form.phoneKey);
  const dirty = Boolean(form.query || form.phone || form.recordId || form.lineId || form.text || form.linkRecord);
  useBeforeUnload(open && dirty && !saving);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedQuery(form.query.trim()), 250);
    return () => window.clearTimeout(timeout);
  }, [form.query]);

  useEffect(() => {
    if (!open || form.lineId || lines.length === 0) return;
    const preferred = lines.find((line) => line.suggested) ?? lines[0];
    if (preferred) setForm((current) => ({ ...current, lineId: String(preferred.id) }));
  }, [form.lineId, lines, open, setForm]);

  useEffect(() => {
    if (!open || !prefill || form.recordId) return;
    setForm((current) => ({ ...current, recordType: prefill.recordType, recordId: prefill.recordId, phone: "", phoneKey: "" }));
  }, [form.recordId, open, prefill, setForm]);

  useEffect(() => {
    if (!recordTarget || form.phoneKey || recordTarget.phoneOptions.length !== 1) return;
    setForm((current) => ({ ...current, phoneKey: recordTarget.phoneOptions[0]?.key ?? "" }));
  }, [form.phoneKey, recordTarget, setForm]);

  function selectRecord(record: NewConversationRecord) {
    setSelectedRecord(record);
    setForm((current) => ({
      ...current,
      phone: "",
      recordType: record.recordType,
      recordId: record.recordId,
      phoneKey: record.phoneOptions.length === 1 ? record.phoneOptions[0]?.key ?? "" : "",
    }));
  }

  function selectTypedPhone(value: string) {
    setSelectedRecord(null);
    const normalized = normalizeInboxDirectPhone(value) ?? value;
    setForm((current) => ({ ...current, query: normalized, phone: normalized, recordType: "", recordId: null, phoneKey: "" }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const lineId = Number(form.lineId);
    const textValue = form.text.trim();
    const targetPhone = normalizeInboxDirectPhone(form.phone || form.query);
    if (!Number.isInteger(lineId) || lineId <= 0) {
      toast.error("Choose an authorized WhatsApp line.");
      return;
    }
    if (!targetPhone && !form.recordId) {
      toast.error("Search for a person or enter a valid international phone number.");
      return;
    }
    if (hasAmbiguousPhone) {
      toast.error("Choose which stored phone number to use.");
      return;
    }
    if (!textValue) {
      toast.error("Enter a message before sending.");
      return;
    }
    if (textValue.length > UNIFIED_INBOX_TEXT_LIMIT) {
      toast.error(UNIFIED_INBOX_TEXT_LIMIT_MESSAGE);
      return;
    }
    if (!startNewConversation?.mutateAsync) {
      toast.error("Starting a conversation is not available yet.");
      return;
    }
    setSaving(true);
    try {
      const idempotencyKey = form.idempotencyKey || crypto.randomUUID();
      if (!form.idempotencyKey) setForm((current) => ({ ...current, idempotencyKey }));
      const clientActionId = form.clientActionId || crypto.randomUUID();
      if (!form.clientActionId) setForm((current) => ({ ...current, clientActionId }));
      const result = await startNewConversation.mutateAsync({
        lineId,
        phone: targetPhone || undefined,
        record: form.recordId && form.recordType ? { recordType: form.recordType, recordId: form.recordId, phoneKey: form.phoneKey || undefined } : undefined,
        text: textValue,
        linkRecord: form.linkRecord && Boolean(form.recordId),
        idempotencyKey,
        clientActionId,
      });
      toast.success(result.reused ? "Existing conversation opened and message sent." : "Conversation started.");
      if (result.linkNotice) toast.info(result.linkNotice);
      clearDraft();
      onOpenChange(false);
      await onConversationReady(Number(result.conversationId));
    } catch (error) {
      toast.error(getErrorMessage(error, "The conversation could not be started. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !saving) clearDraft();
    onOpenChange(nextOpen);
  }

  const searchResultContent = searchQuery?.isFetching
    ? <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Searching…</div>
    : searchResults.length > 0
      ? searchResults.map((result) => result.kind === "conversation"
        ? <button key={`conversation-${result.conversationId}`} type="button" onClick={async () => { clearDraft(); onOpenChange(false); await onConversationReady(result.conversationId); toast.success("Existing conversation opened."); }} className="flex w-full items-start justify-between rounded-md px-3 py-2 text-left hover:bg-white"><span className="min-w-0"><span className="block truncate text-sm font-medium">{result.label}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{result.displayEndpoint} · {result.description}</span></span><ArrowLeft className="mt-0.5 h-4 w-4 shrink-0 rotate-180 text-muted-foreground" /></button>
        : <button key={`${result.recordType}-${result.recordId}`} type="button" onClick={() => selectRecord(result)} className="flex w-full items-start justify-between rounded-md px-3 py-2 text-left hover:bg-white"><span className="min-w-0"><span className="block truncate text-sm font-medium">{result.label}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{humanLabel(result.recordType)} · {result.description}</span></span><Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1E0566]" /></button>)
      : directPhone
        ? <button type="button" onClick={() => selectTypedPhone(directPhone)} className="flex w-full items-start justify-between rounded-md px-3 py-3 text-left hover:bg-white"><span className="min-w-0"><span className="block truncate text-sm font-medium">Start conversation with {directPhone}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">No existing match found. CRM linking remains optional.</span></span><ArrowLeft className="mt-0.5 h-4 w-4 shrink-0 rotate-180 text-muted-foreground" /></button>
        : <p className="px-3 py-4 text-sm text-muted-foreground">No existing match found. Continue typing a name or enter a valid international phone number.</p>;

  return <Sheet open={open} onOpenChange={handleOpenChange}>
    <SheetContent side="left" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[440px]">
      <SheetHeader className="shrink-0 border-b px-5 py-4 pr-12">
        <SheetTitle className="flex items-center gap-2 text-base"><ArrowLeft className="h-4 w-4 text-[#1E0566]" />New conversation</SheetTitle>
        <SheetDescription>Search a contact or enter an international number. CRM linking stays optional and manual.</SheetDescription>
      </SheetHeader>
      <form onSubmit={submit} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        <DraftBanner hasDraft={hasDraft} onDiscard={clearDraft} />
        {hasMultipleLines && <div className="space-y-2">
            <Label htmlFor="new-conversation-line">Sending line</Label>
            <select id="new-conversation-line" value={form.lineId} onChange={(event) => setForm((current) => ({ ...current, lineId: event.target.value }))} disabled={saving || lineQuery?.isLoading} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              <option value="">Choose an authorized line</option>
              {lines.map((line) => <option key={line.id} value={String(line.id)}>{line.name}{line.suggested ? " (suggested)" : ""}</option>)}
            </select>
          </div>}
        {lines.length === 0 && !lineQuery?.isLoading && <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs leading-5 text-amber-900">No messaging line is available for this account.</p>}
        <div className="space-y-2">
          <Label htmlFor="new-conversation-search">Search name, phone, email, MRN, or enter a phone number</Label>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="new-conversation-search" value={form.query} onChange={(event) => { setSelectedRecord(null); setForm((current) => ({ ...current, query: event.target.value, phone: "", recordType: "", recordId: null, phoneKey: "" })); }} placeholder="Search name, phone, email, MRN, or enter a phone number" className="pl-9" autoFocus={!prefill} /></div>
          {debouncedQuery.length > 0 && <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border bg-muted/20 p-1" aria-live="polite">
            {searchResultContent}
          </div>}
        </div>
        {recordTarget && <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-3">
          <div><p className="text-sm font-medium">Selected: {recordTarget.label}</p><p className="text-xs text-muted-foreground">Choose the stored number that should receive this conversation.</p></div>
          {recordQuery?.isLoading ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading phone choices…</p> : recordTarget.phoneOptions.length === 0 ? <p className="text-sm text-amber-700">This record does not have a valid phone number.</p> : <div className="grid gap-2 sm:grid-cols-2">{recordTarget.phoneOptions.map((option) => <label key={option.key} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${form.phoneKey === option.key ? "border-[#1E0566] bg-white ring-1 ring-[#1E0566]/15" : "bg-white/70"}`}><input type="radio" name="new-conversation-phone-choice" checked={form.phoneKey === option.key} onChange={() => setForm((current) => ({ ...current, phoneKey: option.key }))} /><span className="min-w-0"><span className="block font-medium">{option.label}</span><span className="block text-xs text-muted-foreground">{option.displayPhone}</span></span></label>)}</div>}
          <label className="flex items-start gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={form.linkRecord} onChange={(event) => setForm((current) => ({ ...current, linkRecord: event.target.checked }))} className="mt-0.5" />Link this conversation to the selected CRM record after it is sent.</label>
        </div>}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3"><Label htmlFor="new-conversation-text">First message</Label><span className={`text-xs ${isOverLimit ? "text-red-700" : remaining < 410 ? "text-amber-700" : "text-muted-foreground"}`}>{form.text.length.toLocaleString()} / {UNIFIED_INBOX_TEXT_LIMIT.toLocaleString()}</span></div>
          <Textarea id="new-conversation-text" value={form.text} onChange={(event) => setForm((current) => ({ ...current, text: event.target.value, idempotencyKey: current.text === event.target.value ? current.idempotencyKey : "", clientActionId: current.text === event.target.value ? current.clientActionId : "" }))} rows={4} placeholder="Write the first message…" aria-invalid={isOverLimit} disabled={saving} />
          {isOverLimit && <p className="text-xs text-red-700">{UNIFIED_INBOX_TEXT_LIMIT_MESSAGE}</p>}
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || isOverLimit || !form.text.trim()} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{saving ? "Submitting…" : "Send and open"}</Button></DialogFooter>
      </form>
    </SheetContent>
  </Sheet>;
}

function NewLeadDialog({
  open,
  onOpenChange,
  conversation,
  mutation,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: UnifiedInboxConversation;
  mutation: any;
  onComplete: () => Promise<void>;
}) {
  const initialData = useMemo<CreateLeadDraft>(() => ({
    firstName: "",
    lastName: "",
    phone: displayPhone(conversation),
    relationshipRole: "other",
  }), [conversation]);
  const { form, setForm, hasDraft, clearDraft } = useDraftForm({
    key: `inbox-new-contact-${conversation.conversationId}`,
    initialData,
  });
  const isDirty = Boolean(form.firstName || form.lastName || form.phone !== displayPhone(conversation) || form.relationshipRole !== "other");
  const [isSaving, setIsSaving] = useState(false);
  useBeforeUnload(open && isDirty && !isSaving);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("Enter a first and last name.");
      return;
    }
    setIsSaving(true);
    const success = await runInboxMutation(mutation, {
      conversationId: conversation.conversationId,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim() || undefined,
      relationshipRole: (["patient", "husband", "wife", "representative", "family", "translator", "other"] as string[]).includes(form.relationshipRole) ? form.relationshipRole : "other",
    }, "Contact created and linked.", "Creating contacts is not available yet.");
    setIsSaving(false);
    if (success) {
      clearDraft();
      onOpenChange(false);
      await onComplete();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new contact</DialogTitle>
          <DialogDescription>Create a CRM lead and link this conversation. Nothing is created automatically.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <DraftBanner hasDraft={hasDraft} onDiscard={clearDraft} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="inbox-first-name">First name</Label><Input id="inbox-first-name" value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} autoFocus /></div>
            <div className="space-y-2"><Label htmlFor="inbox-last-name">Last name</Label><Input id="inbox-last-name" value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="inbox-phone">Phone number</Label><Input id="inbox-phone" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></div>
          <div className="space-y-2"><Label htmlFor="inbox-role">Relationship</Label><select id="inbox-role" value={form.relationshipRole} onChange={(event) => setForm((current) => ({ ...current, relationshipRole: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="other">Not specified</option><option value="patient">Patient</option><option value="wife">Wife / partner</option><option value="husband">Husband / partner</option><option value="family">Family member</option><option value="representative">Representative</option><option value="translator">Translator</option></select></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={isSaving} className="gap-2">{isSaving && <Loader2 className="h-4 w-4 animate-spin" />}Create and link</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinkExistingDialog({
  open,
  onOpenChange,
  conversation,
  mutation,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: UnifiedInboxConversation;
  mutation: any;
  onComplete: () => Promise<void>;
}) {
  const { form, setForm, hasDraft, clearDraft } = useDraftForm<LinkExistingDraft>({
    key: `inbox-link-existing-${conversation.conversationId}`,
    initialData: { recordType: "lead", recordId: null, confirmReassignment: false },
  });
  const [query, setQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const searchQuery = useOptionalInboxQuery("searchCrm", { query: query.trim() }, { enabled: open && query.trim().length > 0, retry: false });
  const results = useMemo(() => {
    const value = searchQuery?.data;
    return (Array.isArray(value) ? value : Array.isArray(value?.records) ? value.records : []) as AnyRecord[];
  }, [searchQuery?.data]);
  const selected = results.find((record) => Number(record.id) === form.recordId);
  useBeforeUnload(open && Boolean(form.recordId || form.confirmReassignment) && !isSaving);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.recordId || !form.recordType) {
      toast.error("Search for and select a contact first.");
      return;
    }
    setIsSaving(true);
    const success = await runInboxMutation(mutation, {
      conversationId: conversation.conversationId,
      recordType: form.recordType,
      recordId: form.recordId,
      confirmReassignment: form.confirmReassignment,
    }, "Conversation linked.", "Linking contacts is not available yet.");
    setIsSaving(false);
    if (success) {
      clearDraft();
      onOpenChange(false);
      await onComplete();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Find an existing contact</DialogTitle><DialogDescription>Search by name, phone, or email. Select the right record before linking this conversation.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <DraftBanner hasDraft={hasDraft} onDiscard={clearDraft} />
          <div className="relative space-y-2"><Label htmlFor="inbox-crm-search">Search contacts</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="inbox-crm-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, phone, or email" className="pl-9" autoFocus /></div></div>
          <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border bg-muted/20 p-1" aria-live="polite">
            {searchQuery?.isFetching ? <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Searching contacts…</div> : query.trim().length === 0 ? <p className="px-3 py-4 text-sm text-muted-foreground">Start typing to search your CRM.</p> : results.length === 0 ? <p className="px-3 py-4 text-sm text-muted-foreground">No matching contacts found.</p> : results.map((record) => { const id = Number(record.id); const active = form.recordId === id; return <button key={`${record.recordType}-${id}`} type="button" onClick={() => setForm((current) => ({ ...current, recordId: id, recordType: (["person", "lead", "patient"] as string[]).includes(record.recordType) ? record.recordType as LinkExistingDraft["recordType"] : "lead" }))} className={`flex w-full items-start justify-between rounded-md px-3 py-2 text-left transition ${active ? "bg-[#1E0566]/10 ring-1 ring-[#1E0566]/20" : "hover:bg-white"}`}><span className="min-w-0"><span className="block truncate text-sm font-medium">{crmRecordLabel(record)}</span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{humanLabel(record.recordType, "Contact")} {text(record.phone ?? record.email, "")}</span></span>{active && <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1E0566]" />}</button>; })}
          </div>
          {selected && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><span className="font-medium">Selected:</span> {crmRecordLabel(selected)}</div>}
          <label className="flex items-start gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={form.confirmReassignment} onChange={(event) => setForm((current) => ({ ...current, confirmReassignment: event.target.checked }))} className="mt-0.5" />Confirm that this conversation should be linked to the selected record.</label>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={isSaving || !form.recordId} className="gap-2">{isSaving && <Loader2 className="h-4 w-4 animate-spin" />}Link contact</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LinkCaseDialog({
  open,
  onOpenChange,
  conversation,
  mutation,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: UnifiedInboxConversation;
  mutation: any;
  onComplete: () => Promise<void>;
}) {
  const { form, setForm, hasDraft, clearDraft } = useDraftForm<LinkCaseDraft>({
    key: `inbox-link-case-${conversation.conversationId}`,
    initialData: { caseId: "", relationshipRole: "patient" },
  });
  const [isSaving, setIsSaving] = useState(false);
  useBeforeUnload(open && Boolean(form.caseId || form.relationshipRole !== "patient") && !isSaving);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const caseId = Number(form.caseId);
    if (!Number.isInteger(caseId) || caseId <= 0) {
      toast.error("Enter a valid case ID.");
      return;
    }
    setIsSaving(true);
    const success = await runInboxMutation(mutation, {
      conversationId: conversation.conversationId,
      caseId,
      relationshipRole: (["patient", "husband", "wife", "representative", "family", "translator", "other"] as string[]).includes(form.relationshipRole) ? form.relationshipRole : "other",
    }, "Case linked.", "Linking cases is not available yet.");
    setIsSaving(false);
    if (success) {
      clearDraft();
      onOpenChange(false);
      await onComplete();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Link a treatment case</DialogTitle><DialogDescription>Link this conversation to an existing case without creating a new clinical record.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <DraftBanner hasDraft={hasDraft} onDiscard={clearDraft} />
          <div className="space-y-2"><Label htmlFor="inbox-case-id">Case ID</Label><Input id="inbox-case-id" inputMode="numeric" value={form.caseId} onChange={(event) => setForm((current) => ({ ...current, caseId: event.target.value }))} placeholder="e.g. 1234" /></div>
          <div className="space-y-2"><Label htmlFor="inbox-case-role">Relationship</Label><select id="inbox-case-role" value={form.relationshipRole} onChange={(event) => setForm((current) => ({ ...current, relationshipRole: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="patient">Patient</option><option value="wife">Wife / partner</option><option value="husband">Husband / partner</option><option value="family">Family member</option><option value="representative">Representative</option><option value="translator">Translator</option><option value="other">Other</option></select></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={isSaving} className="gap-2">{isSaving && <Loader2 className="h-4 w-4 animate-spin" />}Link case</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TechnicalDetailsDialog({ open, onOpenChange, conversation, diagnostics }: { open: boolean; onOpenChange: (open: boolean) => void; conversation: UnifiedInboxConversation; diagnostics: AnyRecord }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Technical details</DialogTitle><DialogDescription>Admin-only operational references for support and troubleshooting.</DialogDescription></DialogHeader>
        <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 text-xs sm:grid-cols-2">
          <div><p className="text-muted-foreground">Provider</p><p className="mt-1 break-all font-medium">{text(diagnostics.provider, "Not available")}</p></div>
          <div><p className="text-muted-foreground">Connection / line</p><p className="mt-1 break-all font-medium">{text(diagnostics.connectionId, "Not available")} / {text(diagnostics.lineId, "Not available")}</p></div>
          <div><p className="text-muted-foreground">Endpoint reference</p><p className="mt-1 break-all font-medium">{text(diagnostics.endpointId, "Not available")}</p></div>
          <div><p className="text-muted-foreground">Message reference</p><p className="mt-1 break-all font-mono text-[10px]">{text(recordOf(conversation).provenance?.providerMessageId, "Not available")}</p></div>
        </div>
        <DialogFooter><Button type="button" onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InboxPoliciesDialog({ open, onOpenChange, query, mutation }: { open: boolean; onOpenChange: (open: boolean) => void; query: any; mutation: any }) {
  const initialData: PolicyDraft = { phoneVisibility: "mask_selected_roles", newSenderBehavior: "conversation_only", exactPhoneMatch: "suggest", duplicateDetection: "suggest", caseSuggestions: true, automaticPatient: false, automaticMrn: false, automaticClinicalRecord: false };
  const { form, setForm, hasDraft, clearDraft, initFromServer } = useDraftForm<PolicyDraft>({ key: "inbox-policies", initialData });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (query?.data) initFromServer({ ...initialData, ...recordOf(query.data) });
  }, [query?.data, initFromServer]);
  const dirty = hasDraft || JSON.stringify(form) !== JSON.stringify(initialData);
  useBeforeUnload(open && dirty && !saving);
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const success = await runInboxMutation(mutation, { policies: { ...form, automaticPatient: false, automaticMrn: false, automaticClinicalRecord: false } }, "Inbox policies saved.", "Inbox policies are not available yet.");
    setSaving(false);
    if (success) { clearDraft(); onOpenChange(false); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Inbox policies</DialogTitle><DialogDescription>Control how staff see and organize conversations. Clinical records are never created automatically.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><DraftBanner hasDraft={hasDraft} onDiscard={clearDraft} /><div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1.5 text-sm"><span className="font-medium">Phone visibility</span><select value={form.phoneVisibility} onChange={(event) => setForm((current) => ({ ...current, phoneVisibility: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="full_authorized">Full for authorized staff</option><option value="mask_selected_roles">Mask selected roles</option><option value="admin_only_full">Full for admins only</option></select></label><label className="space-y-1.5 text-sm"><span className="font-medium">New sender behavior</span><select value={form.newSenderBehavior} onChange={(event) => setForm((current) => ({ ...current, newSenderBehavior: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="conversation_only">Keep conversation only</option><option value="create_contact">Suggest a contact</option><option value="create_lead">Suggest a lead</option></select></label><label className="space-y-1.5 text-sm"><span className="font-medium">Phone matching</span><select value={form.exactPhoneMatch} onChange={(event) => setForm((current) => ({ ...current, exactPhoneMatch: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="suggest">Suggest a match</option><option value="auto_link_trusted">Auto-link trusted matches</option><option value="never_auto_link">Never auto-link</option></select></label><label className="space-y-1.5 text-sm"><span className="font-medium">Duplicate detection</span><select value={form.duplicateDetection} onChange={(event) => setForm((current) => ({ ...current, duplicateDetection: event.target.value }))} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="suggest">Suggest possible duplicates</option><option value="require_confirmation">Require confirmation</option></select></label></div><div className="space-y-2 rounded-lg border bg-muted/25 p-3"><p className="text-sm font-medium">Operational suggestions</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.caseSuggestions} onChange={(event) => setForm((current) => ({ ...current, caseSuggestions: event.target.checked }))} />Suggest related treatment cases</label><p className="text-xs text-muted-foreground">Automatic Patient, MRN, and clinical-record creation stays off for safety.</p></div><DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Save policies</Button></DialogFooter></form></DialogContent></Dialog>;
}

function ConversationList({
  conversations,
  selectedId,
  onSelect,
  filter,
  onFilter,
  search,
  onSearch,
  isLoading,
  isFetching,
  onRefresh,
  userId,
  channel,
  onChannel,
  line,
  onLine,
  channels,
  lines,
  isAdmin,
  onOpenPolicies,
  onNewConversation,
  onConnectWhatsApp,
  className,
}: {
  conversations: UnifiedInboxConversation[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  filter: InboxFilter;
  onFilter: (value: InboxFilter) => void;
  search: string;
  onSearch: (value: string) => void;
  isLoading: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  userId?: number;
  channel: string;
  onChannel: (value: string) => void;
  line: string;
  onLine: (value: string) => void;
  channels: string[];
  lines: Array<{ value: string; label: string }>;
  isAdmin: boolean;
  onOpenPolicies: () => void;
  onNewConversation: () => void;
  onConnectWhatsApp: () => void;
  className?: string;
}) {
  const quickFilters: Array<{ value: InboxFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "unread", label: "Unread" },
    { value: "assigned", label: "Assigned to me" },
  ];
  const secondaryFilters: Array<{ value: InboxFilter; label: string }> = [
    { value: "unassigned", label: "Unassigned" },
    { value: "new", label: "New contacts" },
    { value: "known", label: "Known contacts" },
  ];
  const hasSecondaryFilter = secondaryFilters.some((item) => item.value === filter);
  const hasMultipleLines = lines.length > 1;
  const hasMultipleChannels = channels.length > 1;

  return (
    <aside className={`flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden border-r border-slate-200 bg-white lg:w-[340px] lg:shrink-0 ${className ?? ""}`}>
      <div className="shrink-0 border-b border-slate-200 px-3 pb-3 pt-3 sm:px-4">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1E0566] text-white"><MessageCircle className="h-4 w-4" /></div>
            <div className="min-w-0"><h1 className="truncate text-base font-semibold tracking-tight text-slate-900">Inbox / Chats</h1><p className="truncate text-[11px] text-slate-500">Messaging workspace</p></div>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-[#1E0566] hover:bg-violet-50" onClick={onNewConversation} aria-label="New conversation"><Plus className="h-5 w-5" /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className={`h-9 w-9 text-slate-600 hover:bg-violet-50 hover:text-[#1E0566] ${hasSecondaryFilter || channel !== "all" || line !== "all" ? "bg-violet-50 text-[#1E0566]" : ""}`} aria-label="Inbox filters and actions"><Filter className="h-4 w-4" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 rounded-xl p-2">
                <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Filters</p>
                {secondaryFilters.map((option) => <DropdownMenuItem key={option.value} onClick={() => onFilter(option.value)} className="flex items-center justify-between gap-2 rounded-lg"><span>{option.label}</span>{filter === option.value && <Check className="h-4 w-4 text-[#1E0566]" />}</DropdownMenuItem>)}
                {(hasMultipleChannels || hasMultipleLines) && <DropdownMenuSeparator />}
                {hasMultipleChannels && <label className="block space-y-1.5 px-2 py-2 text-[11px] font-medium text-slate-500"><span>Channel</span><select value={channel} onChange={(event) => onChannel(event.target.value)} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"><option value="all">All channels</option>{channels.map((value) => <option key={value} value={value}>{humanLabel(value, value)}</option>)}</select></label>}
                {hasMultipleLines && <label className="block space-y-1.5 px-2 py-2 text-[11px] font-medium text-slate-500"><span>Receiving line</span><select value={line} onChange={(event) => onLine(event.target.value)} className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700"><option value="all">All lines</option>{lines.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onRefresh} disabled={isFetching} className="rounded-lg"><RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh inbox</DropdownMenuItem>
                {isAdmin && <DropdownMenuItem onClick={onOpenPolicies} className="rounded-lg"><Settings2 className="mr-2 h-4 w-4" />Inbox settings</DropdownMenuItem>}
                <DropdownMenuItem onClick={onConnectWhatsApp} className="rounded-lg"><AudioLines className="mr-2 h-4 w-4" />Connect WhatsApp</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="relative mt-3"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search conversations..." className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-9 shadow-none" aria-label="Search conversations" /></div>
        <div className="mt-2.5 flex min-w-0 items-center gap-1 overflow-x-auto pb-0.5" role="tablist" aria-label="Conversation filters">{quickFilters.map((option) => <button key={option.value} type="button" role="tab" aria-selected={filter === option.value} onClick={() => onFilter(option.value)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filter === option.value ? "bg-[#1E0566] text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}>{option.label}</button>)}<button type="button" onClick={() => onFilter(hasSecondaryFilter ? "all" : "unassigned")} className={`ml-0.5 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors ${hasSecondaryFilter ? "bg-violet-100 text-[#1E0566]" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"}`}><Filter className="h-3 w-3" />Filters</button></div>
      </div>
      <ScrollArea className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <div className="min-w-0 p-2">
          {isLoading ? <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading conversations…</div> : conversations.length === 0 ? <div className="px-5 py-12 text-center"><MessageCircle className="mx-auto h-8 w-8 text-[#1E0566]/25" /><p className="mt-3 text-sm font-medium">No conversations here</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Try another filter or search term.</p></div> : conversations.map((conversation) => {
            const name = displayName(conversation);
            const unread = conversationUnread(conversation);
            const selected = selectedId === conversation.conversationId;
            const item = recordOf(conversation);
            const preview = conversationPreview(conversation);
            const assigned = conversationAssignedName(conversation);
            return <button key={conversation.conversationId} type="button" onClick={() => onSelect(conversation.conversationId)} className={`group flex w-full min-w-0 items-center gap-3 rounded-xl px-2.5 py-3 text-left transition-colors ${selected ? "bg-violet-50 ring-1 ring-[#1E0566]/15" : "hover:bg-slate-50"}`}><ContactAvatar conversation={conversation} size="sm" /><span className="min-w-0 flex-1"><span className="flex min-w-0 items-center justify-between gap-2"><span className={`min-w-0 flex-1 truncate text-sm ${unread ? "font-bold text-slate-900" : "font-semibold text-slate-800"}`}>{name}</span><span className="shrink-0 text-[10px] text-slate-400">{formatShortDate(conversation.lastActivityAt ?? conversation.lastMessage.timestamp)}</span></span><span className="mt-1 flex min-w-0 items-center gap-2"><span className={`min-w-0 flex-1 truncate text-xs ${unread ? "font-medium text-slate-700" : "text-slate-500"}`}>{preview}</span>{unread && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-label="Unread" />}</span><span className="mt-1 flex min-w-0 items-center gap-1 text-[10px] text-slate-400"><MessageCircle className="h-3 w-3 shrink-0 text-emerald-600" /><span className="truncate">WhatsApp</span><span aria-hidden="true">·</span><span className="truncate">{assigned || (isNewContact(conversation) ? "New contact" : "Known contact")}</span></span></span></button>;
          })}
        </div>
      </ScrollArea>
      <div className="shrink-0 border-t border-slate-200 px-4 py-2.5 text-[11px] text-slate-500"><span>{conversations.length} conversation{conversations.length === 1 ? "" : "s"}</span>{userId ? <span className="float-right">Live updates on</span> : null}</div>
    </aside>
  );
}

function mediaSrc(mediaAssetId: number) {
  return `/api/communications/media/${mediaAssetId}?action=open`;
}

function MediaCard({ media, onAccess }: { media: AnyRecord; onAccess?: (mediaId: number, action: "open" | "download") => Promise<void> }) {
  const mediaAssetId = Number(media.mediaAssetId);
  const label = text(media.filename, humanLabel(media.mediaType ?? media.mimeType, "Attachment"));
  const mimeType = text(media.mimeType).toLowerCase();
  const ready = Boolean(media.mediaAvailable && mediaAssetId);
  const src = ready ? mediaSrc(mediaAssetId) : "";
  if (ready && mimeType.startsWith("image/")) {
    return <button type="button" className="block max-w-full overflow-hidden rounded-lg" onClick={() => onAccess?.(mediaAssetId, "open")}><img src={src} alt={label} className="block max-h-64 max-w-full rounded-lg object-contain" /></button>;
  }
  if (ready && mimeType.startsWith("video/")) {
    return <video controls preload="metadata" src={src} className="block max-h-64 w-full max-w-sm rounded-lg bg-black" />;
  }
  if (ready && mimeType.startsWith("audio/")) {
    return <div className="flex min-w-[14rem] items-center gap-2 rounded-lg bg-black/5 px-2 py-1.5"><AudioLines className="h-4 w-4 shrink-0" /><audio controls preload="metadata" src={src} className="h-8 min-w-0 flex-1" /></div>;
  }
  const Icon = mediaIcon(media);
  return <div className="flex w-fit min-w-[14rem] max-w-full items-center gap-2 rounded-lg bg-black/5 p-2">
    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white/80"><Icon className="h-4 w-4" /></div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium" title={label}>{label}</p>
      <p className="text-[11px] opacity-70">{mimeType === "application/pdf" ? "PDF" : "Document"}</p>
    </div>
    <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 px-2" onClick={() => onAccess?.(mediaAssetId, "open")} disabled={!ready}><ExternalLink className="h-3.5 w-3.5" /></Button>
    <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 px-2" onClick={() => onAccess?.(mediaAssetId, "download")} disabled={!ready}><Download className="h-3.5 w-3.5" /></Button>
  </div>;
}

function ContactCard({ name, phone, outbound }: { name: string; phone: string | null; outbound: boolean }) {
  return <div className={`flex min-w-[14rem] items-center gap-3 rounded-lg p-2 ${outbound ? "bg-white/10" : "bg-slate-50"}`}>
    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-xs font-semibold ${outbound ? "bg-white/20 text-white" : "bg-[#1E0566] text-white"}`}>{initials(name)}</div>
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold">{name}</p>
      {phone ? <p className={`truncate text-xs ${outbound ? "text-white/75" : "text-slate-500"}`}>{phone}</p> : <p className={`text-xs ${outbound ? "text-white/75" : "text-slate-500"}`}>Contact</p>}
    </div>
  </div>;
}

function MessageBubble({ item, onMediaAccess }: { item: UnifiedInboxTimelineItem; conversationId?: number; onMediaAccess?: (mediaId: number, action: "open" | "download") => Promise<void> }) {
  const isOutbound = item.direction === "outbound_echo";
  const contact = item.sharedContact ?? null;
  const hasMedia = item.media.length > 0;
  const rawBody = item.messageBody && (item.bodyVisibility === "synthetic_safe" || item.bodyVisibility === "authorized") ? item.messageBody.trim() : "";
  const hideBody = !rawBody || Boolean(contact && (rawBody === contact.name || rawBody.length < 40));
  const reactions = item.reactions ?? [];
  return <div className={`flex min-w-0 max-w-full ${isOutbound ? "w-full justify-end" : "justify-start"} ${reactions.length ? "mb-2" : ""}`}>
    <div className={`relative w-fit min-w-0 ${isOutbound ? "max-w-[calc(100%-1rem)] [overflow-wrap:anywhere]" : "max-w-[calc(100%-0.5rem)]"} sm:max-w-[78%] rounded-2xl px-2 py-1.5 shadow-sm ${isOutbound ? "rounded-br-md bg-[#1E0566] text-white" : "rounded-bl-md border bg-white text-foreground"}`}>
      {contact && <ContactCard name={contact.name} phone={contact.phone} outbound={isOutbound} />}
      {hasMedia && <div className="space-y-1.5">{item.media.map((media) => <MediaCard key={media.id} media={recordOf(media)} onAccess={onMediaAccess} />)}</div>}
      {!hideBody && <p className={`whitespace-pre-wrap break-words px-1.5 text-sm leading-6 ${contact || hasMedia ? "mt-1" : ""}`}>{rawBody}</p>}
      {!contact && !hasMedia && hideBody && <p className="px-1.5 text-sm leading-6 opacity-70">Message content unavailable</p>}
      <div className={`mt-0.5 flex items-center justify-end gap-1 px-1.5 text-[10px] ${isOutbound ? "text-white/65" : "text-muted-foreground"}`}><span>{formatShortDate(item.timestamp)}</span>{isOutbound && <CheckCheck className={`h-3 w-3 ${item.deliveryStatus?.statusValue === "read" ? "text-sky-200" : ""}`} />}</div>
      {reactions.length > 0 && <div className={`absolute -bottom-3 flex gap-0.5 ${isOutbound ? "left-2" : "right-2"}`}>{reactions.map((emoji) => <span key={emoji} className="rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-xs leading-none shadow-sm">{emoji}</span>)}</div>}
    </div>
  </div>;
}

function ChatPane({
  conversation,
  detail,
  detailLoading,
  onMarkRead,
  onSendText,
  sendTextPending,
  onSendMedia,
  sendMediaPending,
  onBack,
  onOpenMobileActions,
  onMediaAccess,
}: {
  conversation: UnifiedInboxConversation;
  detail: AnyRecord | null;
  detailLoading: boolean;
  onMarkRead: (options?: { force?: boolean; suppressSuccess?: boolean }) => Promise<boolean>;
  onSendText: (text: string, idempotencyKey: string, clientActionId: string) => Promise<boolean>;
  sendTextPending: boolean;
  onSendMedia: (attachment: { file: File; mimeType: string; filename: string; size: number; caption?: string }, idempotencyKey: string, clientActionId: string) => Promise<boolean>;
  sendMediaPending: boolean;
  onBack: () => void;
  onOpenMobileActions: () => void;
  onMediaAccess?: (mediaId: number, action: "open" | "download") => Promise<void>;
}) {
  const composerDraftKey = `inbox-composer-${conversation.conversationId}`;
  const { form: composerDraft, setForm: setComposerDraft, hasDraft, clearDraft } = useDraftForm<{ text: string; caption: string }>({ key: composerDraftKey, initialData: { text: "", caption: "" }, isMeaningfulDraft: isMeaningfulInboxComposerDraft });
  const composer = composerDraft.text;
  const caption = composerDraft.caption;
  const [attachment, setAttachment] = useState<{ file: File; mimeType: string; filename: string; size: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const lastTypingAt = useRef(0);
  const typing = trpc.inbox.typing.useMutation();
  const [attachmentReading, setAttachmentReading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerIdempotencyKey = useRef<string | null>(null);
  const composerClientActionId = useRef<string | null>(null);
  const readHandledMessageRef = useRef<number | null>(null);
  const readAttemptingMessageRef = useRef<number | null>(null);
  const timelineAreaRef = useRef<HTMLDivElement>(null);
  const timeline = Array.isArray(detail?.timeline) ? (detail.timeline as UnifiedInboxTimelineItem[]) : [];
  const outboundAttempts = Array.isArray(detail?.outboundAttempts) ? detail.outboundAttempts as Array<{ id: number; state: string; providerMessageId: string | null; failureCategory?: string | null; createdAt: Date | string }> : [];
  const unresolvedAttempts = outboundAttempts.filter((attempt) => !attempt.providerMessageId || ["pending", "submitting", "ambiguous", "requires_retry", "failed"].includes(attempt.state));
  const detailLine = recordOf(detail?.conversation?.line);
  const currentLineStatus = text(detailLine.status, conversation.line.status).toLowerCase();
  const currentLineHealth = text(detailLine.health, conversation.line.health).toLowerCase();
  const lineCurrentlyHealthy = currentLineStatus === "connected" && currentLineHealth === "healthy";
  const name = displayName(conversation);
  const remaining = UNIFIED_INBOX_TEXT_LIMIT - composer.length;
  const isNearLimit = composer.length >= Math.floor(UNIFIED_INBOX_TEXT_LIMIT * 0.9);
  const isOverLimit = composer.length > UNIFIED_INBOX_TEXT_LIMIT;
  const isCaptionOverLimit = caption.length > UNIFIED_INBOX_TEXT_LIMIT;
  const latestInboundMessageId = [...timeline].reverse().find((item) => item.direction === "inbound")?.id ?? null;
  const [documentVisible, setDocumentVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  const [windowFocused, setWindowFocused] = useState(() => typeof document === "undefined" || !document.hasFocus || document.hasFocus());
  const activelyViewing = shouldAutoMarkInboxConversationRead({
    conversationSelected: Boolean(conversation.conversationId),
    documentVisible,
    windowFocused,
  });
  const composerDirty = hasDraft || Boolean(attachment) || Boolean(composer || caption);
  useBeforeUnload(composerDirty && !sendTextPending && !sendMediaPending);

  useEffect(() => {
    setAttachment(null);
    composerIdempotencyKey.current = null;
    composerClientActionId.current = null;
    readHandledMessageRef.current = null;
    readAttemptingMessageRef.current = null;
  }, [conversation.conversationId]);

  async function handleAttachmentChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > UNIFIED_INBOX_MEDIA_MAX_BYTES) { toast.error(UNIFIED_INBOX_MEDIA_LIMIT_MESSAGE); return; }
    try {
      setAttachment({ file, ...inspectInboxAttachmentFile(file, { richMedia: true }) });
    } catch (error) {
      toast.error(error instanceof Error && error.message === "unsupported_attachment"
        ? "Choose a supported image, video, audio file, or document."
        : "The attachment could not be read. Choose the file again.");
    }
  }

  useEffect(() => {
    const syncActiveState = () => {
      setDocumentVisible(document.visibilityState === "visible");
      setWindowFocused(typeof document.hasFocus !== "function" || document.hasFocus());
    };
    syncActiveState();
    document.addEventListener("visibilitychange", syncActiveState);
    window.addEventListener("focus", syncActiveState);
    window.addEventListener("blur", syncActiveState);
    return () => {
      document.removeEventListener("visibilitychange", syncActiveState);
      window.removeEventListener("focus", syncActiveState);
      window.removeEventListener("blur", syncActiveState);
    };
  }, []);

  useEffect(() => {
    if (!activelyViewing || detailLoading || latestInboundMessageId === null) return;
    if (readHandledMessageRef.current === latestInboundMessageId || readAttemptingMessageRef.current === latestInboundMessageId) return;
    readAttemptingMessageRef.current = latestInboundMessageId;
    void onMarkRead({ force: true, suppressSuccess: true }).then((success) => {
      if (success) readHandledMessageRef.current = latestInboundMessageId;
      if (readAttemptingMessageRef.current === latestInboundMessageId) readAttemptingMessageRef.current = null;
    });
  }, [activelyViewing, detailLoading, latestInboundMessageId, onMarkRead]);

  useEffect(() => {
    const viewport = timelineAreaRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [conversation.conversationId, detailLoading, timeline.length]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (attachment) {
      await submitAttachment();
      return;
    }
    const value = composer.trim();
    if (!value || sendTextPending) return;
    if (value.length > UNIFIED_INBOX_TEXT_LIMIT) {
      toast.error(UNIFIED_INBOX_TEXT_LIMIT_MESSAGE);
      return;
    }
    const idempotencyKey = composerIdempotencyKey.current ?? crypto.randomUUID();
    composerIdempotencyKey.current = idempotencyKey;
    const clientActionId = composerClientActionId.current ?? crypto.randomUUID();
    composerClientActionId.current = clientActionId;
    const sent = await onSendText(value, idempotencyKey, clientActionId);
    if (sent) {
      setComposerDraft({ text: "", caption: "" });
      clearDraft();
      composerIdempotencyKey.current = null;
      composerClientActionId.current = null;
    }
  }

  async function submitAttachment() {
    if (!attachment || attachmentReading || sendMediaPending || isCaptionOverLimit) return;
    const idempotencyKey = composerIdempotencyKey.current ?? crypto.randomUUID();
    composerIdempotencyKey.current = idempotencyKey;
    const clientActionId = composerClientActionId.current ?? crypto.randomUUID();
    composerClientActionId.current = clientActionId;
    const sent = await onSendMedia({ file: attachment.file, mimeType: attachment.mimeType, filename: attachment.filename, size: attachment.size, caption: caption.trim() }, idempotencyKey, clientActionId);
    if (sent) {
      setAttachment(null);
      setComposerDraft({ text: "", caption: "" });
      clearDraft();
      composerIdempotencyKey.current = null;
      composerClientActionId.current = null;
    }
  }

  async function toggleVoice() {
    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      return;
    }
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("This browser cannot record a voice note.");
      return;
    }
    const mimeType = preferredVoiceRecorderMime((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) {
      toast.error("This browser cannot record a voice note.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: { ideal: 1 }, echoCancellation: true, noiseSuppression: true } });
    } catch (error) {
      console.warn("[inbox] microphone unavailable", { reason: error instanceof Error ? error.name : "error" });
      toast.error(error instanceof DOMException && error.name === "NotAllowedError"
        ? "Allow microphone access to record a voice note."
        : "The voice note could not be recorded. Try again.");
      return;
    }
    let recordStream = stream;
    let audioContext: AudioContext | null = null;
    try {
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const destination = audioContext.createMediaStreamDestination();
      destination.channelCount = 1;
      destination.channelCountMode = "explicit";
      source.connect(destination);
      recordStream = destination.stream;
    } catch (error) {
      console.warn("[inbox] mono voice graph skipped", { reason: error instanceof Error ? error.name : "error" });
    }
    const recordedAs = voiceRecordingFile(mimeType);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(recordStream, { mimeType });
    } catch (error) {
      console.warn("[inbox] voice recorder failed", { reason: error instanceof Error ? error.name : "error" });
      recordStream = stream;
      try {
        recorder = new MediaRecorder(stream, { mimeType });
      } catch (fallbackError) {
        stream.getTracks().forEach((track) => track.stop());
        void audioContext?.close();
        console.warn("[inbox] voice recorder failed", { reason: fallbackError instanceof Error ? fallbackError.name : "error" });
        toast.error("The voice note could not be recorded. Try again.");
        return;
      }
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
    recorder.onerror = () => {
      console.warn("[inbox] voice recorder failed");
      toast.error("The voice note could not be recorded. Try again.");
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      recordStream.getTracks().forEach((track) => track.stop());
      void audioContext?.close();
      setRecording(false);
      const file = new globalThis.File([new Blob(chunks, { type: recordedAs.mimeType })], recordedAs.filename, { type: recordedAs.mimeType });
      if (file.size < 32) {
        toast.error("Record a little longer, then send the voice note.");
        return;
      }
      void onSendMedia({ file, mimeType: recordedAs.mimeType, filename: recordedAs.filename, size: file.size }, crypto.randomUUID(), crypto.randomUUID()).catch(() => {
        toast.error("The voice note could not be sent. Try again.");
      });
    };
    recorderRef.current = recorder;
    try {
      recorder.start();
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      recordStream.getTracks().forEach((track) => track.stop());
      void audioContext?.close();
      console.warn("[inbox] voice recorder failed", { reason: error instanceof Error ? error.name : "error" });
      toast.error("The voice note could not be recorded. Try again.");
      return;
    }
    setRecording(true);
  }

  return (
    <section className="flex h-full min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden bg-[#f7f7fa]">
      <header className="flex min-w-0 shrink-0 items-center justify-between gap-3 border-b bg-white px-3 py-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={onBack} aria-label="Back to conversations"><ArrowLeft className="h-4 w-4" /></Button><ContactAvatar conversation={conversation} />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{name}</h2>
            <p className="truncate text-xs text-muted-foreground">{displayPhone(conversation)} · {conversation.line.name}</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="shrink-0 lg:hidden" aria-label="Conversation actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void onMarkRead()}><CheckCheck className="mr-2 h-4 w-4" />Mark as read</DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenMobileActions}><CircleUserRound className="mr-2 h-4 w-4" />Contact and actions</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" variant="ghost" size="icon" className="hidden shrink-0 text-slate-600 hover:bg-violet-50 hover:text-[#1E0566] lg:flex" onClick={onOpenMobileActions} aria-label="Contact and conversation actions">
          <CircleUserRound className="h-4 w-4" />
        </Button>
      </header>
      <div ref={timelineAreaRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ScrollArea className="h-full min-h-0 min-w-0 flex-1">
          <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-3 px-3 py-4 sm:px-5 sm:py-6">
            {detailLoading ? <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading messages…</div> : <>{unresolvedAttempts.map((attempt) => <div key={`attempt-${attempt.id}`} className="ml-auto max-w-[78%] rounded-2xl rounded-br-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 shadow-sm"><p className="font-medium">{outboundAttemptLabel(attempt, lineCurrentlyHealthy)}</p><p className="mt-1 text-xs text-amber-800">{outboundAttemptDetail(attempt, lineCurrentlyHealthy)}</p></div>)}{timeline.length === 0 ? <div className="rounded-2xl border border-dashed bg-white/80 px-6 py-14 text-center"><MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/35" /><p className="mt-3 text-sm font-medium">Start the conversation</p><p className="mt-1 text-xs text-muted-foreground">Your messages will appear here.</p></div> : timeline.map((item) => <MessageBubble item={item} conversationId={conversation.conversationId} onMediaAccess={onMediaAccess} key={item.id} />)}</>}
          </div>
        </ScrollArea>
      </div>
      <div className="z-10 min-w-0 shrink-0 border-t bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4 sm:pb-4">
        <form onSubmit={submit} className="mx-auto min-w-0 max-w-3xl">
          <DraftBanner hasDraft={hasDraft} onDiscard={() => { clearDraft(); setComposerDraft({ text: "", caption: "" }); setAttachment(null); composerIdempotencyKey.current = null; composerClientActionId.current = null; }} />
          <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.md,.markdown,.txt,text/markdown,.ogg" className="hidden" onChange={(event) => void handleAttachmentChange(event)} />
          {attachment && <div className="mb-2 flex min-w-0 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs"><File className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{attachment.filename} · {(attachment.size / 1024 / 1024).toFixed(2)} MB</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setAttachment(null)} aria-label="Remove attachment"><X className="h-4 w-4" /></Button></div>}
          <div className="flex min-w-0 items-end gap-2 rounded-2xl border bg-muted/25 p-2 shadow-sm focus-within:ring-2 focus-within:ring-[#1E0566]/15">
            {!attachment && <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => fileInputRef.current?.click()} disabled={attachmentReading || sendMediaPending} title="Attach an image, video, or document" aria-label="Attach a file"><Paperclip className="h-4 w-4 text-muted-foreground" /></Button>}
            {!attachment && <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => void toggleVoice()} disabled={sendMediaPending} title="Record a voice note" aria-label={recording ? "Stop voice note" : "Record a voice note"}><AudioLines className={`h-4 w-4 ${recording ? "text-red-600" : "text-muted-foreground"}`} /></Button>}
            <Textarea value={attachment ? caption : composer} onChange={(event) => { const now = Date.now(); if (now - lastTypingAt.current > 4000) { lastTypingAt.current = now; typing.mutate({ conversationId: conversation.conversationId }); } composerIdempotencyKey.current = null; composerClientActionId.current = null; setComposerDraft((current) => attachment ? ({ ...current, caption: event.target.value }) : ({ ...current, text: event.target.value })); }} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submit(event); } }} placeholder={attachment ? "Add a caption or message…" : "Write a message…"} rows={1} aria-invalid={attachment ? isCaptionOverLimit : isOverLimit} className="min-w-0 flex-1 max-h-32 min-h-10 resize-none border-0 bg-transparent px-2 py-2 shadow-none focus-visible:ring-0" />
            <Button type="submit" size="icon" disabled={(!composer.trim() && !attachment) || sendTextPending || sendMediaPending || isOverLimit || isCaptionOverLimit} className="h-10 w-10 shrink-0 rounded-xl bg-[#1E0566] hover:bg-[#2d1680]" aria-label={attachment ? "Send attachment" : "Send message"}>
              {sendTextPending || sendMediaPending || attachmentReading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <div className={"mt-2 flex min-w-0 items-start justify-between gap-3 px-2 text-[11px] " + ((attachment ? isCaptionOverLimit : isOverLimit) ? "text-red-700" : (attachment ? caption : composer).length >= Math.floor(UNIFIED_INBOX_TEXT_LIMIT * 0.9) ? "text-amber-700" : "text-muted-foreground")}>
            <span className="shrink-0">{(attachment ? caption : composer).length.toLocaleString()} / {UNIFIED_INBOX_TEXT_LIMIT.toLocaleString()} characters</span>
            <span className="min-w-0 text-right">{sendTextPending || sendMediaPending ? "Sending…" : (attachment ? isCaptionOverLimit : isOverLimit) ? "Shorten this message before sending. It will not be truncated." : attachment ? "Optional caption or message for this attachment" : isNearLimit ? String(remaining.toLocaleString()) + " characters remaining" : "Press Enter to send · Shift + Enter for a new line"}</span>
          </div>
          <p className="mt-2 px-2 text-[11px] text-muted-foreground">Images and documents up to 15 MB are sent through the controlled test line and retained through secure media custody.</p>
        </form>
      </div>
    </section>
  );
}
function ContactPanel({
  conversation,
  detail,
  operational,
  isAdmin,
  onCreateLead,
  onLinkExisting,
  onLinkCase,
  onAssign,
  onMarkUnread,
  onTechnical,
  assigning,
  onAssignStaff,
  staffAssigning,
  onToggleTag,
  tagPending,
  activity,
  activityLoading,
  className,
}: {
  conversation: UnifiedInboxConversation;
  detail: AnyRecord | null;
  operational: AnyRecord | null;
  isAdmin: boolean;
  onCreateLead: () => void;
  onLinkExisting: () => void;
  onLinkCase: () => void;
  onAssign: () => Promise<void>;
  onMarkUnread: () => Promise<void>;
  onTechnical: () => void;
  assigning: boolean;
  onAssignStaff: (staffId: number | null) => Promise<void>;
  staffAssigning: boolean;
  onToggleTag: (tag: string, enabled: boolean) => Promise<void>;
  tagPending: boolean;
  activity: AnyRecord[];
  activityLoading: boolean;
  className?: string;
}) {
  const source = operational ?? recordOf(detail?.operational) ?? detail ?? {};
  const contact = recordOf(source.contact ?? source.crmContact ?? source.linkedRecord);
  const crmRecords = Array.isArray(source.crmRecords) ? source.crmRecords : [];
  const firstCrmRecord = recordOf(crmRecords[0]);
  const name = getOperationalName(source) || text(firstCrmRecord.label) || displayName(conversation);
  const hasRealPhone = conversation.senderEndpointKind === "phone";
  const phone = hasRealPhone ? text(source.phone ?? contact.phone ?? firstCrmRecord.phone, displayPhone(conversation)) : null;
  const contactSummary = hasRealPhone ? phone : conversation.senderEndpointKind === "synthetic" ? "Synthetic test contact" : "Phone number unavailable";
  const email = text(source.email ?? contact.email);
  const assignedTo = recordOf(source.assignedTo);
  const assignedName = text(assignedTo.name, "Unassigned");
  const availableStaff = Array.isArray(source.availableStaff) ? source.availableStaff as AnyRecord[] : [];
  const tags = Array.isArray(source.tags) ? source.tags.map((tag: unknown) => text(tag)).filter(Boolean) : [];
  const crmSuggestions = Array.isArray(source.crmSuggestions) ? source.crmSuggestions as AnyRecord[] : [];
  const linkedType = text(firstCrmRecord.recordType ?? source.recordType ?? contact.recordType);
  const isLinked = source.contactStatus === "known_contact" || crmRecords.length > 0 || Boolean(source.isLinked ?? source.linked ?? conversation.identityState === "known");
  return <aside className={`w-full min-h-0 border-l bg-white/90 lg:h-full lg:shrink-0 lg:overflow-hidden ${className ?? ""}`}><ScrollArea className="h-full min-h-0 w-full"><div className="w-full space-y-5 p-5"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Contact</p><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="More contact actions"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={onMarkUnread}><Archive className="mr-2 h-4 w-4" />Mark as unread</DropdownMenuItem>{isAdmin && <><DropdownMenuSeparator /><DropdownMenuItem onClick={onTechnical}><Shield className="mr-2 h-4 w-4" />Technical details</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu></div><div className="flex flex-col items-center text-center"><ContactAvatar conversation={conversation} size="lg" /><h2 className="mt-3 text-lg font-semibold">{name}</h2><p className="mt-1 text-sm text-muted-foreground">{contactSummary}</p><Badge variant="outline" className={`mt-3 ${isLinked ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>{isLinked ? "Known contact" : "Not linked to CRM"}</Badge></div><Separator /><div className="space-y-3 text-sm"><div className="flex items-start gap-3">{hasRealPhone ? <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" /> : <CircleUserRound className="mt-0.5 h-4 w-4 text-muted-foreground" />}<div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">{hasRealPhone ? "Phone" : "Contact"}</p><p className="mt-0.5 break-all font-medium">{hasRealPhone ? phone : contactSummary}</p>{!hasRealPhone && <p className="mt-0.5 text-xs text-muted-foreground">Phone number unavailable</p>}</div></div>{email && <div className="flex items-start gap-3"><CircleUserRound className="mt-0.5 h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Email</p><p className="mt-0.5 break-all font-medium">{email}</p></div></div>}<div className="flex items-start gap-3"><UsersRound className="mt-0.5 h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Assigned to</p><p className="mt-0.5 break-words font-medium">{assignedName}</p></div></div></div>{availableStaff.length > 0 && <div className="w-full space-y-2"><Label htmlFor="inbox-staff">Assign to staff member</Label><select id="inbox-staff" value={String(assignedTo.id ?? "")} onChange={(event) => void onAssignStaff(event.target.value ? Number(event.target.value) : null)} disabled={staffAssigning} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="">Unassigned</option>{availableStaff.map((staff) => <option key={staff.id} value={staff.id}>{text(staff.name, `Staff member ${staff.id}`)}{staff.role ? ` · ${humanLabel(staff.role)}` : ""}</option>)}</select></div>}<Button type="button" variant="outline" className="w-full gap-2" onClick={onAssign} disabled={assigning}>{assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}Assign to me</Button><Separator /><div className="w-full space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CRM actions</p>{isLinked ? <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">Linked to {linkedType || "a CRM record"}.</div> : <><Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={onCreateLead}><Plus className="h-4 w-4" />Create new contact</Button><Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={onLinkExisting}><Link2 className="h-4 w-4" />Link existing contact</Button></>}<Button type="button" variant="outline" className="w-full justify-start gap-2" onClick={onLinkCase}><Link2 className="h-4 w-4" />Link treatment case</Button></div>{!isLinked && crmSuggestions.length > 0 && <div className="w-full space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3"><p className="text-xs font-semibold text-sky-900">Possible CRM matches</p><p className="text-[11px] leading-4 text-sky-800">Review-only exact-phone hints. Nothing is linked automatically.</p>{crmSuggestions.slice(0, 3).map((suggestion) => <div key={String(suggestion.id)} className="flex w-full items-center justify-between gap-2 text-xs"><span className="min-w-0 truncate">{text(suggestion.label, "CRM record")} · {text(suggestion.confidence, "review")}</span><Button type="button" size="sm" variant="outline" className="h-7 shrink-0 px-2 text-[11px]" onClick={onLinkExisting}>Review</Button></div>)}</div>}<div className="w-full space-y-2"><p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Tag className="h-3.5 w-3.5" />Tags</p><div className="flex w-full flex-wrap gap-1.5">{tags.map((tag) => <button key={tag} type="button" className="rounded-full border bg-muted/30 px-2 py-1 text-[11px]" onClick={() => void onToggleTag(tag, false)} disabled={tagPending}>{tag} ×</button>)}{tags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet</span>}</div><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const tag = text(form.get("tag")); if (tag) { void onToggleTag(tag, true); event.currentTarget.reset(); } }} className="flex w-full gap-1.5"><Input name="tag" placeholder="Add a tag" className="h-8 min-w-0 flex-1 text-xs" /><Button type="submit" size="sm" variant="outline" className="h-8 shrink-0 px-2" disabled={tagPending}><Plus className="h-3.5 w-3.5" /></Button></form></div><Separator /><div className="w-full space-y-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity history</p>{activityLoading ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading history…</p> : activity.length === 0 ? <p className="text-xs text-muted-foreground">No activity recorded yet.</p> : <div className="w-full space-y-2">{activity.slice(0, 8).map((entry) => <div key={entry.id ?? `${entry.createdAt}-${entry.summary}`} className="w-full rounded-md bg-muted/35 px-2.5 py-2 text-xs"><p className="font-medium">{text(entry.summary, humanLabel(entry.action, "Activity"))}</p><p className="mt-0.5 text-[10px] text-muted-foreground">{text(entry.actorName, "Staff member")} · {formatActivity(entry.createdAt)}</p></div>)}</div>}</div><div className="w-full rounded-lg bg-muted/45 p-3 text-xs leading-5 text-muted-foreground"><p className="font-medium text-foreground">Conversation details</p><p className="mt-1">{conversation.line.name}</p><p>{formatActivity(conversation.lastActivityAt)}</p></div></div></ScrollArea></aside>;
}

export function UnifiedInboxWorkspace({ initialConversationId }: { initialConversationId?: number | null } = {}) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const searchString = useSearch();
  const launchHandledRef = useRef(false);
  const launchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const launchRecordType = launchParams.get("recordType");
  const launchRecordId = Number(launchParams.get("recordId"));
  const urlConversationId = Number(launchParams.get("conversation"));
  const launchPrefill = launchParams.get("new") === "1"
    && (["person", "lead", "patient"] as string[]).includes(launchRecordType ?? "")
    && Number.isInteger(launchRecordId) && launchRecordId > 0
    ? { recordType: launchRecordType as "person" | "lead" | "patient", recordId: launchRecordId }
    : null;
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [line, setLine] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(() => (
    initialConversationId ?? (Number.isInteger(urlConversationId) && urlConversationId > 0 ? urlConversationId : null)
  ));
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [linkExistingOpen, setLinkExistingOpen] = useState(false);
  const [linkCaseOpen, setLinkCaseOpen] = useState(false);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [policiesOpen, setPoliciesOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [staffAssigning, setStaffAssigning] = useState(false);
  const [tagPending, setTagPending] = useState(false);

  useEffect(() => {
    if (!launchPrefill || launchHandledRef.current) return;
    launchHandledRef.current = true;
    setNewConversationOpen(true);
  }, [launchPrefill]);

  useEffect(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    const previousDocumentOverflow = documentElement.style.overflow;
    const previousBodyOverflow = body.style.overflow;
    const previousDocumentOverscroll = documentElement.style.overscrollBehavior;
    const previousBodyOverscroll = body.style.overscrollBehavior;

    // The Inbox owns its three internal scroll regions. A page-level scroll
    // would make the conversation header and composer move on touch devices.
    documentElement.style.overflow = "hidden";
    body.style.overflow = "hidden";
    documentElement.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    return () => {
      documentElement.style.overflow = previousDocumentOverflow;
      body.style.overflow = previousBodyOverflow;
      documentElement.style.overscrollBehavior = previousDocumentOverscroll;
      body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, []);

  const queryInput = useMemo(() => ({ resolution: "all" as const, search: search.trim(), limit: 100 }), [search]);
  const conversationQuery = trpc.inbox.conversations.useQuery(queryInput, { refetchInterval: 5000 });
  const conversations = conversationQuery.data?.conversations ?? [];
  const channels = useMemo(() => Array.from(new Set(conversations.map((conversation) => conversation.channel).filter(Boolean))), [conversations]);
  const lines = useMemo(() => Array.from(new Map(conversations.map((conversation) => [String(conversation.line.id ?? conversation.line.name), { value: String(conversation.line.id ?? conversation.line.name), label: conversation.line.name }])).values()), [conversations]);
  const visibleConversations = useMemo(() => conversations.filter((conversation) => {
    if (filter === "unread") return conversationUnread(conversation);
    if (filter === "assigned") return conversationAssignedToMe(conversation, user?.id);
    if (filter === "unassigned") return isUnassigned(conversation);
    if (filter === "new") return isNewContact(conversation);
    if (filter === "known") return !isNewContact(conversation);
    return true;
  }).filter((conversation) => (channel === "all" || conversation.channel === channel) && (line === "all" || String(conversation.line.id ?? conversation.line.name) === line)), [conversations, filter, user?.id, channel, line]);

  useEffect(() => {
    const nextSelectedId = reconcileInboxSelection({
      selectedId,
      initialConversationId,
      conversationIds: conversations.map((conversation) => conversation.conversationId),
    });
    if (nextSelectedId !== selectedId) setSelectedId(nextSelectedId);
  }, [initialConversationId, conversations, selectedId]);

  const selectedConversation = conversations.find((conversation) => conversation.conversationId === selectedId) ?? null;
  const detailQuery = trpc.inbox.conversationDetail.useQuery({ conversationId: selectedId ?? 0 }, { enabled: Boolean(selectedId), refetchInterval: 5000 });
  const detail = (detailQuery.data ?? null) as AnyRecord | null;
  const optionalOperationalProcedure = (trpc.inbox as any).operationalContext as { useQuery?: (input: AnyRecord, options?: AnyRecord) => any } | undefined;
  const operationalQuery = optionalOperationalProcedure?.useQuery ? optionalOperationalProcedure.useQuery({ conversationId: selectedId ?? 0 }, { enabled: Boolean(selectedId), retry: false }) : null;
  const operational = (operationalQuery?.data ?? detail?.operationalContext ?? null) as AnyRecord | null;
  const diagnostics = recordOf(detail?.diagnostics);
  const activityQuery = useOptionalInboxQuery("activity", { conversationId: selectedId ?? 0 }, { enabled: Boolean(selectedId), retry: false });
  const activity = useMemo(() => (Array.isArray(activityQuery?.data) ? activityQuery.data : Array.isArray(activityQuery?.data?.activities) ? activityQuery.data.activities : []) as AnyRecord[], [activityQuery?.data]);
  const policiesQuery = useOptionalInboxQuery("policies", undefined, { enabled: policiesOpen, retry: false });

  const markRead = useInboxMutation("markRead");
  const markUnread = useInboxMutation("markUnread");
  const assignToMe = useInboxMutation("assignToMe");
  const assign = useInboxMutation("assign");
  const linkExisting = useInboxMutation("linkExisting");
  const createLeadAndLink = useInboxMutation("createLeadAndLink");
  const linkCase = useInboxMutation("linkCase");
  const sendText = useInboxMutation("sendText");
  const sendMedia = useInboxMutation("sendMedia");
  const prepareMediaUpload = useInboxMutation("prepareMediaUpload");
  const uploadMediaPart = useInboxMutation("uploadMediaPart");
  const abortMediaUpload = useInboxMutation("abortMediaUpload");
  const [mediaUploading, setMediaUploading] = useState(false);
  const connectWhatsApp = trpc.inbox.connectWhatsApp.useMutation({
    onSuccess: (result) => { window.location.href = result.url; },
    onError: (error) => toast.error(error.message || "WhatsApp could not be connected."),
  });
  const setTag = useInboxMutation("setTag");
  const mediaAccess = useInboxMutation("mediaAccess");
  const assignStaff = useInboxMutation("assign");
  const updatePolicies = useInboxMutation("updatePolicies");

  async function refreshAfterAction() {
    await Promise.all([conversationQuery.refetch(), selectedId ? detailQuery.refetch() : Promise.resolve(), utils.inbox.conversations.invalidate(), selectedId ? utils.inbox.conversationDetail.invalidate({ conversationId: selectedId }) : Promise.resolve()]);
  }

  async function handleNewConversationReady(conversationId: number) {
    await Promise.all([
      conversationQuery.refetch(),
      utils.inbox.conversations.invalidate(),
      utils.inbox.conversationDetail.invalidate({ conversationId }),
    ]);
    setSelectedId(conversationId);
    const url = new URL(window.location.href);
    url.searchParams.set("conversation", String(conversationId));
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }

  async function handleMarkRead(options: { force?: boolean; suppressSuccess?: boolean } = {}) {
    if (!selectedId || (!options.force && !conversationUnread(selectedConversation ?? ({} as UnifiedInboxConversation)))) return false;
    const success = await runInboxMutation(markRead, { conversationId: selectedId }, "Marked as read.", "This action is not available yet.", { suppressSuccess: options.suppressSuccess });
    if (success) await refreshAfterAction();
    return success;
  }

  async function handleMarkUnread() {
    if (!selectedId) return;
    const success = await runInboxMutation(markUnread, { conversationId: selectedId }, "Marked as unread.");
    if (success) await refreshAfterAction();
  }

  async function handleAssign() {
    if (!selectedId) return;
    setAssigning(true);
    const mutation = assignToMe ?? assign;
    const input = assignToMe ? { conversationId: selectedId } : { conversationId: selectedId, assignedUserId: user?.id ?? null };
    const success = await runInboxMutation(mutation, input, "Conversation assigned to you.", "Assignment is not available yet.");
    setAssigning(false);
    if (success) await refreshAfterAction();
  }

  async function handleSendText(value: string, idempotencyKey: string, clientActionId: string) {
    if (!selectedId) return false;
    const success = await runInboxMutation(sendText, { conversationId: selectedId, text: value, idempotencyKey, clientActionId }, "Message sent.", "Sending messages is not available yet.");
    if (success) await refreshAfterAction();
    return success;
  }

  async function handleSendMedia(attachment: { file: File; mimeType: string; filename: string; size: number; caption?: string }, idempotencyKey: string, clientActionId: string) {
    if (!selectedId) return false;
    setMediaUploading(true);
    try {
      const delivered = await deliverInboxAttachment({
        conversationId: selectedId,
        file: attachment.file,
        mimeType: attachment.mimeType,
        filename: attachment.filename,
        caption: attachment.caption,
        prepare: async (value) => prepareMediaUpload?.mutateAsync ? prepareMediaUpload.mutateAsync(value) : { mode: "inline" },
        uploadPart: async (value) => {
          if (!uploadMediaPart?.mutateAsync) throw new Error("The attachment could not be sent. Try again.");
          return uploadMediaPart.mutateAsync(value);
        },
        abort: async (value) => abortMediaUpload?.mutateAsync ? abortMediaUpload.mutateAsync(value) : undefined,
      });
      const success = await runInboxMutation(sendMedia, { conversationId: selectedId, ...delivered, idempotencyKey, clientActionId }, "Attachment sent.", "Sending attachments is not available yet.");
      if (success) await refreshAfterAction();
      return success;
    } catch (error) {
      toast.error(getErrorMessage(error, "The attachment could not be sent. Try again."));
      return false;
    } finally {
      setMediaUploading(false);
    }
  }

  function handleBackToConversationList() {
    setSelectedId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("conversation");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }

  async function handleAssignStaff(staffId: number | null) {
    if (!selectedId) return;
    setStaffAssigning(true);
    const success = await runInboxMutation(assignStaff, { conversationId: selectedId, assignedUserId: staffId }, staffId ? "Conversation assigned." : "Conversation unassigned.", "Staff assignment is not available yet.");
    setStaffAssigning(false);
    if (success) await refreshAfterAction();
  }

  async function handleToggleTag(tag: string, enabled: boolean) {
    if (!selectedId) return;
    setTagPending(true);
    const success = await runInboxMutation(setTag, { conversationId: selectedId, tag: tag.trim(), enabled }, enabled ? "Tag added." : "Tag removed.", "Tags are not available yet.");
    setTagPending(false);
    if (success) await refreshAfterAction();
  }

  async function handleMediaAccess(mediaId: number, action: "open" | "download") {
    if (!selectedId) return;
    const result = mediaAccess?.mutateAsync ? await mediaAccess.mutateAsync({ conversationId: selectedId, mediaId, action }).catch((error: unknown) => { toast.error(getErrorMessage(error, "Media access is unavailable.")); return null; }) : null;
    if (!mediaAccess?.mutateAsync) { toast.error("Media access is not available yet."); return; }
    if (result?.available) {
      toast.success(`${action === "open" ? "Opening" : "Downloading"} attachment…`);
      if (result.endpoint) {
        const link = document.createElement("a");
        link.href = result.endpoint;
        link.target = action === "open" ? "_blank" : "_self";
        if (action === "download") link.download = "";
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    }
    else toast(result?.reason || "Only safe attachment metadata is available right now.");
  }

  return <div className="h-full min-h-0 min-w-0 max-w-full overflow-hidden bg-gradient-to-br from-slate-50 via-white to-violet-50/35 p-2 sm:p-3 md:p-5">
    <div className="mx-auto flex h-full min-h-0 min-w-0 max-w-[1500px] flex-col overflow-hidden rounded-2xl border bg-white shadow-[0_10px_40px_rgba(30,5,102,0.08)] lg:flex-row">
      <ConversationList className={selectedConversation ? "hidden lg:flex" : "flex"} conversations={visibleConversations} selectedId={selectedId} onSelect={setSelectedId} filter={filter} onFilter={setFilter} search={search} onSearch={setSearch} isLoading={conversationQuery.isLoading} isFetching={conversationQuery.isFetching} onRefresh={() => void conversationQuery.refetch()} userId={user?.id} channel={channel} onChannel={setChannel} line={line} onLine={setLine} channels={channels} lines={lines} isAdmin={user?.role === "admin"} onOpenPolicies={() => setPoliciesOpen(true)} onNewConversation={() => setNewConversationOpen(true)} onConnectWhatsApp={() => connectWhatsApp.mutate()} />
      {selectedConversation ? <ChatPane conversation={selectedConversation} detail={detail} detailLoading={detailQuery.isLoading} onMarkRead={handleMarkRead} onSendText={handleSendText} sendTextPending={Boolean(sendText?.isPending)} onSendMedia={handleSendMedia} sendMediaPending={Boolean(sendMedia?.isPending) || mediaUploading} onBack={handleBackToConversationList} onOpenMobileActions={() => setMobileActionsOpen(true)} onMediaAccess={handleMediaAccess} /> : <div className="hidden min-h-0 min-w-0 flex-1 items-center justify-center bg-[#f7f7fa] p-6 text-center lg:flex"><div><Inbox className="mx-auto h-10 w-10 text-[#1E0566]/35" /><h1 className="mt-4 text-lg font-semibold">Select a conversation</h1><p className="mt-1 text-sm text-muted-foreground">Choose a conversation from the list to start reading or replying.</p><Button type="button" className="mt-4 gap-2 bg-[#1E0566] hover:bg-[#2d1680]" onClick={() => setNewConversationOpen(true)}><Plus className="h-4 w-4" />New conversation</Button></div></div>}
    </div>
    <NewConversationDialog open={newConversationOpen} onOpenChange={setNewConversationOpen} prefill={launchPrefill} onConversationReady={handleNewConversationReady} />
    {selectedConversation && <Sheet open={mobileActionsOpen} onOpenChange={setMobileActionsOpen}><SheetContent side="right" className="w-full gap-0 overflow-hidden p-0 sm:max-w-[440px]"><SheetHeader className="shrink-0 border-b px-5 py-4 pr-12"><SheetTitle>Contact and conversation actions</SheetTitle><SheetDescription>Review contact details and perform manual CRM, assignment, tag, or read-state actions.</SheetDescription></SheetHeader><ContactPanel className="min-h-0 flex-1 border-l-0" conversation={selectedConversation} detail={detail} operational={operational} isAdmin={user?.role === "admin"} onCreateLead={() => { setMobileActionsOpen(false); setCreateLeadOpen(true); }} onLinkExisting={() => { setMobileActionsOpen(false); setLinkExistingOpen(true); }} onLinkCase={() => { setMobileActionsOpen(false); setLinkCaseOpen(true); }} onAssign={handleAssign} onMarkUnread={handleMarkUnread} onTechnical={() => { setMobileActionsOpen(false); setTechnicalOpen(true); }} assigning={assigning} onAssignStaff={handleAssignStaff} staffAssigning={staffAssigning} onToggleTag={handleToggleTag} tagPending={tagPending} activity={activity} activityLoading={Boolean(activityQuery?.isLoading)} /></SheetContent></Sheet>}
    {selectedConversation && <NewLeadDialog open={createLeadOpen} onOpenChange={setCreateLeadOpen} conversation={selectedConversation} mutation={createLeadAndLink} onComplete={refreshAfterAction} />}
    {selectedConversation && <LinkExistingDialog open={linkExistingOpen} onOpenChange={setLinkExistingOpen} conversation={selectedConversation} mutation={linkExisting} onComplete={refreshAfterAction} />}
    {selectedConversation && <LinkCaseDialog open={linkCaseOpen} onOpenChange={setLinkCaseOpen} conversation={selectedConversation} mutation={linkCase} onComplete={refreshAfterAction} />}
    {selectedConversation && <TechnicalDetailsDialog open={technicalOpen} onOpenChange={setTechnicalOpen} conversation={selectedConversation} diagnostics={diagnostics} />}
    <InboxPoliciesDialog open={policiesOpen} onOpenChange={setPoliciesOpen} query={policiesQuery} mutation={updatePolicies} />
  </div>;
}

export default function UnifiedInboxPage() {
  return <UnifiedInboxWorkspace />;
}
