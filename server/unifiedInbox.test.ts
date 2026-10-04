import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  deriveInboxIdentityState,
  getUnifiedInboxConversationDetail,
  isInboxConversationRead,
  listUnifiedInboxConversations,
  maskInboxEndpoint,
} from "./unifiedInbox";
import { canDisplayFullInboxPhone, classifyInboxSenderEndpoint, friendlyInboxMutationError, normalizeInboxDirectPhone, normalizeInboxPhone, reconcileInboxSelection, shouldAutoMarkInboxConversationRead, UNIFIED_INBOX_TEXT_LIMIT, UNIFIED_INBOX_TEXT_LIMIT_MESSAGE } from "../shared/unifiedInbox";

describe("Unified Inbox stabilization helpers", () => {
  it("keeps explicit selections but opens the ordinary Inbox on the conversation list", () => {
    expect(reconcileInboxSelection({ selectedId: 2, initialConversationId: 1, conversationIds: [1, 2] })).toBe(2);
    expect(reconcileInboxSelection({ selectedId: null, initialConversationId: 2, conversationIds: [1, 2] })).toBe(2);
    expect(reconcileInboxSelection({ selectedId: 2, initialConversationId: 1, conversationIds: [1] })).toBeNull();
    expect(reconcileInboxSelection({ selectedId: null, initialConversationId: null, conversationIds: [1, 2] })).toBeNull();
  });

  it("classifies only real phone-shaped endpoints as phones", () => {
    expect(normalizeInboxPhone("15550001111@c.us")).toBe("15550001111");
    expect(normalizeInboxPhone("synthetic-peer-78e94109dd20")).toBeNull();
    expect(classifyInboxSenderEndpoint("15550001111")).toBe("phone");
    expect(classifyInboxSenderEndpoint("synthetic-peer-78e94109dd20")).toBe("synthetic");
    expect(classifyInboxSenderEndpoint(null)).toBe("unavailable");
  });

  it("normalizes staff-entered international direct recipients without treating them as identity proof", () => {
    expect(normalizeInboxDirectPhone("+90 (501) 114-7060")).toBe("+905011147060");
    expect(normalizeInboxDirectPhone("905011147060")).toBe("+905011147060");
    expect(normalizeInboxDirectPhone("synthetic-peer-78e94109dd20")).toBeNull();
    expect(normalizeInboxDirectPhone("+0001234567")).toBeNull();
    expect(normalizeInboxDirectPhone("+90")).toBeNull();
  });

  it("applies phone visibility policy by role", () => {
    expect(canDisplayFullInboxPhone("full_authorized", "staff")).toBe(true);
    expect(canDisplayFullInboxPhone("mask_selected_roles", "staff")).toBe(false);
    expect(canDisplayFullInboxPhone("mask_selected_roles", "manager")).toBe(true);
    expect(canDisplayFullInboxPhone("admin_only_full", "manager")).toBe(false);
    expect(canDisplayFullInboxPhone("admin_only_full", "admin")).toBe(true);
  });

  it("keeps the transport limit explicit and hides raw validation details", () => {
    expect(UNIFIED_INBOX_TEXT_LIMIT).toBe(4096);
    expect(friendlyInboxMutationError(new Error("maximum: 4096 code: too_big path: text"))).toBe(UNIFIED_INBOX_TEXT_LIMIT_MESSAGE);
    expect(friendlyInboxMutationError(new Error("code: INTERNAL_SERVER_ERROR sql constraint failed"))).toBe("The action could not be completed. Please try again.");
    expect(friendlyInboxMutationError(new Error("The synthetic test line is unavailable."))).toBe("The synthetic test line is unavailable.");
  });

  it("does not mark the staff user's own direct-start echo unread, while a later inbound reply is unread", () => {
    expect(isInboxConversationRead({ lastDirection: "outbound_echo", latestMessageId: 4, lastReadMessageId: null })).toBe(true);
    expect(isInboxConversationRead({ lastDirection: "inbound", latestMessageId: 5, lastReadMessageId: 4 })).toBe(false);
    expect(isInboxConversationRead({ lastDirection: "inbound", latestMessageId: 5, lastReadMessageId: 5 })).toBe(true);
  });

  it("auto-marks only a selected Conversation in a visible, focused tab", () => {
    expect(shouldAutoMarkInboxConversationRead({ conversationSelected: true, documentVisible: true, windowFocused: true })).toBe(true);
    expect(shouldAutoMarkInboxConversationRead({ conversationSelected: false, documentVisible: true, windowFocused: true })).toBe(false);
    expect(shouldAutoMarkInboxConversationRead({ conversationSelected: true, documentVisible: false, windowFocused: true })).toBe(false);
    expect(shouldAutoMarkInboxConversationRead({ conversationSelected: true, documentVisible: true, windowFocused: false })).toBe(false);
  });

  it("keeps mobile navigation and composer drafts scoped to the selected Conversation", () => {
    const ui = fs.readFileSync(path.join(process.cwd(), "client/src/pages/UnifiedInboxPage.tsx"), "utf8");
    const draftHook = fs.readFileSync(path.join(process.cwd(), "client/src/hooks/useDraftForm.tsx"), "utf8");
    expect(ui).toContain("const composerDraftKey = `inbox-composer-${conversation.conversationId}`");
    expect(ui).toContain("isMeaningfulInboxComposerDraft");
    expect(draftHook).toContain("isMeaningfulDraft");
    expect(ui).toContain("<DraftBanner hasDraft={hasDraft}");
    expect(ui).toContain('url.searchParams.delete("conversation")');
    expect(ui).toContain('className={selectedConversation ? "hidden lg:flex" : "flex"}');
    expect(ui).toContain("setAttachment(null);");
  });
  it("contains the Inbox in the visible viewport and moves secondary contact actions behind mobile controls", () => {
    const inbox = fs.readFileSync(path.join(process.cwd(), "client/src/pages/UnifiedInboxPage.tsx"), "utf8");
    const shell = fs.readFileSync(path.join(process.cwd(), "client/src/components/FertilizLayout.tsx"), "utf8");
    expect(shell).toContain('h-[100dvh] min-h-0 overflow-hidden');
    expect(shell).toContain('min-w-0 min-h-0 flex-1 overflow-hidden');
    expect(inbox).toContain('documentElement.style.overflow = "hidden"');
    expect(inbox).toContain('body.style.overscrollBehavior = "none"');
    expect(inbox).toContain('h-full min-h-0 min-w-0 max-w-full overflow-hidden');
    expect(inbox).not.toContain('h-[calc(100dvh-8rem)]');
    expect(inbox).toContain('aria-label="Conversation actions"');
    expect(inbox).toContain("Contact and conversation actions");
    expect(inbox).toContain('SheetContent side="right"');
    expect(inbox).not.toContain('ContactPanel className="hidden lg:block"');
    expect(inbox).toContain('pb-[max(0.75rem,env(safe-area-inset-bottom))]');
  });

  it("keeps the compact WhatsApp-like Inbox controls above an independently scrolling list", () => {
    const inbox = fs.readFileSync(path.join(process.cwd(), "client/src/pages/UnifiedInboxPage.tsx"), "utf8");
    expect(inbox).toContain("Inbox / Chats");
    expect(inbox).toContain('aria-label="New conversation"');
    expect(inbox).toContain("Search conversations...");
    expect(inbox).toContain('const quickFilters');
    expect(inbox).toContain('Assigned to me');
    expect(inbox).toContain('const secondaryFilters');
    expect(inbox).toContain('const hasMultipleLines = lines.length > 1');
    expect(inbox).toContain('SheetContent side="left"');
    expect(inbox).not.toContain('className="h-9 w-full gap-2 bg-[#1E0566]');
  });

  it("keeps Test Mode recipient administration out of normal Inbox messaging", () => {
    const inbox = fs.readFileSync(path.join(process.cwd(), "client/src/pages/UnifiedInboxPage.tsx"), "utf8");
    const settings = fs.readFileSync(path.join(process.cwd(), "client/src/pages/SettingsPage.tsx"), "utf8");
    const testMode = fs.readFileSync(path.join(process.cwd(), "client/src/components/ControlledTestRecipientsDialog.tsx"), "utf8");
    expect(inbox).not.toContain("ControlledTestRecipientsDialog");
    expect(inbox).not.toContain("approvedRecipientId");
    expect(inbox).toContain("normalizeInboxDirectPhone");
    expect(inbox).toContain("Start conversation with");
    expect(settings).toContain("Recipient permissions");
    expect(settings).toContain("ControlledTestRecipientsDialog");
    expect(testMode).toContain("useDraftForm");
    expect(testMode).toContain("useBeforeUnload");
    expect(testMode).toContain("approveSyntheticTestRecipient");
    expect(testMode).toContain("revokeSyntheticTestRecipient");
  });

  it("keeps normal Inbox copy non-technical and media cards compact", () => {
    const inbox = fs.readFileSync(path.join(process.cwd(), "client/src/pages/UnifiedInboxPage.tsx"), "utf8");
    expect(inbox).not.toContain("Provider result is uncertain");
    expect(inbox).not.toContain("Waiting for WhatsApp connection");
    expect(inbox).not.toContain("The provider did not issue a message ID");
    expect(inbox).not.toContain("Provider rejected the previous attempt");
    expect(inbox).not.toContain("WPPConnect");
    expect(inbox).not.toContain("readiness probe");
    expect(inbox).toContain("w-fit min-w-0 max-w-full");
    expect(inbox).toContain("sm:max-w-[20rem]");
    expect(inbox).toContain("max-h-40");
    expect(inbox).toContain("sm:max-h-48");
    expect(inbox).toContain("className=\"h-7 min-w-0 gap-1 px-2 text-[10px]\"");
    expect(inbox).toContain("sm:max-w-[440px]");
    expect(inbox).not.toContain("lg:w-[300px]");
  });

  it("keeps normal outgoing text bubbles inside the narrow conversation viewport", () => {
    const inbox = fs.readFileSync(path.join(process.cwd(), "client/src/pages/UnifiedInboxPage.tsx"), "utf8");
    expect(inbox).toContain('isOutbound ? "w-full justify-end" : "justify-start"');
    expect(inbox).toContain('isOutbound ? "max-w-[calc(100%-1rem)] [overflow-wrap:anywhere]" : "max-w-[calc(100%-0.5rem)]"');
    expect(inbox).toContain('whitespace-pre-wrap break-words text-sm leading-6');
  });

  it("does not present a historical retry as a currently disconnected line", () => {
    const inbox = fs.readFileSync(path.join(process.cwd(), "client/src/pages/UnifiedInboxPage.tsx"), "utf8");
    const projection = fs.readFileSync(path.join(process.cwd(), "server/unifiedInbox.ts"), "utf8");
    expect(inbox).toContain("Message not sent. Please try again when messaging is available.");
    expect(inbox).toContain("Messaging is temporarily unavailable for this conversation.");
    expect(inbox).toContain("No automatic resend was performed.");
    expect(inbox).not.toContain("Provider rejected the previous attempt");
    expect(inbox).not.toContain("The provider result is uncertain");
    expect(inbox).toContain("lineCurrentlyHealthy");
    expect(projection).toContain("failureCategory: whatsappSendAttempts.failureCategory");
    expect(projection).toContain("failureCategory: attempt.failureCategory");
  });

  it("correlates one user action without replacing the durable idempotency key", () => {
    const ui = fs.readFileSync(path.join(process.cwd(), "client/src/pages/UnifiedInboxPage.tsx"), "utf8");
    const router = fs.readFileSync(path.join(process.cwd(), "server/routers.ts"), "utf8");
    expect(ui).toContain("composerClientActionId");
    expect(ui).toContain("onSendText(value, idempotencyKey, clientActionId)");
    expect(ui).toContain("onSendMedia({ ...attachment, caption: caption.trim() }, idempotencyKey, clientActionId)");
    expect(router).toContain("clientActionId: z.string()");
    expect(router).toContain("idempotencyKey: z.string()");
  });
});

describe("Unified Inbox read-only projection", () => {
  it("masks sender endpoints without exposing the raw identifier", () => {
    expect(maskInboxEndpoint("905011147060")).toBe("90••••60");
    expect(maskInboxEndpoint("1234")).toBe("••••");
    expect(maskInboxEndpoint(null)).toBe("Endpoint unavailable");
  });

  it("keeps unresolved endpoint conversations unresolved until trusted confirmation", () => {
    expect(deriveInboxIdentityState({
      endpointResolutionState: "unresolved",
      humanActorResolutionState: "unresolved",
    })).toBe("unresolved");
    expect(deriveInboxIdentityState({
      endpointResolutionState: "candidate_single",
      humanActorResolutionState: "unresolved",
    })).toBe("unresolved");
    expect(deriveInboxIdentityState({
      endpointResolutionState: "confirmed",
      humanActorResolutionState: "unresolved",
    })).toBe("known");
  });

  it("does not add identity or clinical writes to the projection module", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/unifiedInbox.ts"), "utf8");
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    expect(source).not.toMatch(/createPatient|createLead|createTreatment|createMedical|createPerson|MRN/i);
  });

  it("projects an unresolved Conversation detail chronologically with safe provenance", async () => {
    const projection = await listUnifiedInboxConversations({ resolution: "unresolved", limit: 10 }, { id: 1, role: "admin" });
    const conversation = projection.conversations[0];
    if (!conversation) return;

    const detail = await getUnifiedInboxConversationDetail(conversation.conversationId, { id: 1, role: "admin" });
    expect(detail).not.toBeNull();
    expect(detail?.conversation.identityState).toBe("unresolved");
    expect(detail?.conversation.channel).toBe("whatsapp_linked_device");
    expect(detail?.conversation.methodLabel).toContain("WPPConnect");
    expect(detail?.conversation.safeSenderEndpoint).toContain("••••");
    expect(detail?.diagnostics.readOnly).toBe(false);
    expect(detail?.diagnostics.identityCreation).toBe("manual_only");

    const timeline = detail?.timeline ?? [];
    expect(timeline.every((item) => item.provenance.providerMessageId || item.provenance.providerItemKey)).toBe(true);
    for (let index = 1; index < timeline.length; index += 1) {
      const previous = timeline[index - 1]?.timestamp?.getTime() ?? 0;
      const current = timeline[index]?.timestamp?.getTime() ?? 0;
      expect(current).toBeGreaterThanOrEqual(previous);
    }
    expect(timeline.every((item) => ["inbound", "outbound_echo", "unknown"].includes(item.direction))).toBe(true);
  });

  it("denies a staff actor who is not assigned to the receiving Linked Device line", async () => {
    const adminProjection = await listUnifiedInboxConversations({ limit: 10 }, { id: 1, role: "admin" });
    const restrictedConversationId = adminProjection.conversations[0]?.conversationId;
    const projection = await listUnifiedInboxConversations({ limit: 10 }, { id: 999999999, role: "staff" });
    expect(projection.conversations).toHaveLength(0);
    if (restrictedConversationId) {
      await expect(getUnifiedInboxConversationDetail(restrictedConversationId, { id: 999999999, role: "staff" })).resolves.toBeNull();
    }
  });

  it("keeps provider-specific diagnostics behind a channel-neutral contract", () => {
    const contract = fs.readFileSync(path.join(process.cwd(), "shared/unifiedInbox.ts"), "utf8");
    expect(contract).toContain('"whatsapp_linked_device"');
    expect(contract).toContain('"email"');
    expect(contract).toContain("UnifiedInboxConversationDetail");
    expect(contract).toContain("providerMessageId");
    expect(contract).toContain('"manual_only"');
  });

  it("enables bounded controlled attachments while keeping calls out of scope", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "client/src/pages/UnifiedInboxPage.tsx"), "utf8");
    const attachmentReader = fs.readFileSync(path.join(process.cwd(), "client/src/lib/inboxAttachment.ts"), "utf8");
    expect(source).toContain('type="file"');
    expect(source).toContain("UNIFIED_INBOX_MEDIA_MAX_BYTES");
    expect(source).toContain("onSendMedia");
    expect(source).toContain("readInboxAttachmentFile");
    expect(source).toContain(".md,.markdown");
    expect(source).toContain("max-w-[calc(100%-0.5rem)]");
    expect(source).toContain('className="min-w-0 flex-1 max-h-32');
    expect(source).not.toContain("Attach & send");
    expect(attachmentReader).toContain("readAsDataURL");
    expect(attachmentReader).toContain("BASE64_CHUNK_BYTES");
    expect(source).not.toContain("Calling is not available yet.");
  });

  it("projects durable outbound attempts without exposing provider internals and retains direct Conversation selection", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/unifiedInbox.ts"), "utf8");
    const operationalSource = fs.readFileSync(path.join(process.cwd(), "server/operationalInbox.ts"), "utf8");
    const ui = fs.readFileSync(path.join(process.cwd(), "client/src/pages/UnifiedInboxPage.tsx"), "utf8");
    expect(source).toContain("whatsappSendAttempts");
    expect(source).toContain("outboundAttempts");
    expect(source).toContain('statusValue: "sent"');
    expect(ui).toContain("Delivery status could not be confirmed");
    expect(ui).toContain("Message could not be sent.");
    expect(ui).toContain("This message remains protected from duplicate sending.");
    expect(ui).not.toContain("Send status unknown — checking");
    expect(ui).not.toContain("Waiting for WhatsApp connection");
    expect(ui).not.toContain("provider result is uncertain");
    expect(ui).toContain("onConversationReady(Number(result.conversationId))");
    expect(ui).toContain('url.searchParams.set("conversation", String(conversationId))');
    expect(ui).toContain("crypto.randomUUID()");
    expect(ui).toContain("visibilitychange");
    expect(ui).toContain("window.addEventListener(\"focus\"");
    expect(ui).toContain("suppressSuccess: true");
    expect(ui).toContain("shouldAutoMarkInboxConversationRead");
    expect(operationalSource).toContain("whatsappConversationReadStates");
    expect(operationalSource).not.toContain("whatsappNormalizedStatuses");
  });

  it("keeps detailed approval diagnostics admin-only in the conversation detail projection", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "server/unifiedInbox.ts"), "utf8");
    expect(source).toContain('actor.role === "admin" && attempt.correlationId');
    expect(source).toContain("correlationId: attempt.correlationId");
    expect(source).toContain("approvalReason: attempt.approvalReason");
    expect(source).toContain("recipientFingerprint: attempt.recipientFingerprint");
    expect(source).toContain("runtimeEndpointHost: attempt.runtimeEndpointHost");
    expect(source).toContain(": null,");
  });

  it("adds a draft-safe New Conversation flow and direct CRM launch paths without surfacing provider jargon", () => {
    const inboxSource = fs.readFileSync(path.join(process.cwd(), "client/src/pages/UnifiedInboxPage.tsx"), "utf8");
    const leadSource = fs.readFileSync(path.join(process.cwd(), "client/src/pages/LeadDetailPage.tsx"), "utf8");
    const patientSource = fs.readFileSync(path.join(process.cwd(), "client/src/pages/PatientDetailPage.tsx"), "utf8");
    expect(inboxSource).toContain("NewConversationDialog");
    expect(inboxSource).toContain("useDraftForm<NewConversationDraft>");
    expect(inboxSource).toContain("useBeforeUnload(open && dirty");
    expect(inboxSource).toContain("newConversationSearch");
    expect(inboxSource).toContain("startNewConversation");
    expect(inboxSource).toContain("Choose which stored phone number to use");
    expect(inboxSource).toContain("Search name, phone, email, MRN, or enter a phone number");
    expect(inboxSource).toContain("normalizeInboxDirectPhone(form.query)");
    expect(inboxSource).not.toContain("Provider message ID");
    expect(leadSource).toContain("recordType=lead");
    expect(patientSource).toContain("recordType=patient");
  });

  it("renders media captions in the same Inbox attachment card and keeps media access authorized", () => {
    const inboxSource = fs.readFileSync(path.join(process.cwd(), "client/src/pages/UnifiedInboxPage.tsx"), "utf8");
    const projectionSource = fs.readFileSync(path.join(process.cwd(), "server/unifiedInbox.ts"), "utf8");
    const mediaRoute = fs.readFileSync(path.join(process.cwd(), "server/communicationMediaRoutes.ts"), "utf8");
    const custody = fs.readFileSync(path.join(process.cwd(), "server/whatsappPhase1Store.ts"), "utf8");
    expect(inboxSource).toContain("const caption = text(media.caption, \"\")");
    expect(inboxSource).toContain("{caption && <p");
    expect(projectionSource).toContain("filename: communicationMediaAssets.filename");
    expect(projectionSource).toContain("filename: asset?.filename ?? row.filename");
    expect(mediaRoute).toContain("buildMediaFilename");
    expect(mediaRoute).toContain("Content-Disposition");
    expect(custody).toContain("buildMediaFilename");
  });
});
