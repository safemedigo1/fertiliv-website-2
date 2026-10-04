import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const pg_role = pgEnum("pg_role", ["patient", "staff", "doctor", "admin", "manager"]);
export const pg_status = pgEnum("pg_status", ["pending", "active", "rejected"]);
export const pg_category = pgEnum("pg_category", ["auth", "patient", "lead", "appointment", "medical_note", "user_management", "navigation", "other"]);
export const pg_defaultFinancialScope = pgEnum("pg_defaultFinancialScope", ["production", "test"]);
export const pg_gender = pgEnum("pg_gender", ["male", "female", "other"]);
export const pg_interestLevel = pgEnum("pg_interestLevel", ["cold", "warm", "hot"]);
export const pg_status_2 = pgEnum("pg_status_2", ["inquiry", "lead", "qualified", "proposal_sent", "active_patient", "inactive", "archived"]);
export const pg_source = pgEnum("pg_source", ["paid", "employee-referral", "external-referral", "website", "maps", "partner", "public-relations", "instagram", "tiktok", "doctor-referral", "youtube", "facebook", "awatef-guide", "salim-guide", "organic"]);
export const pg_travelReadiness = pgEnum("pg_travelReadiness", ["ready", "considering", "prefers-home", "local-patient"]);
export const pg_ivfExperience = pgEnum("pg_ivfExperience", ["never-tried", "tried-unsuccessful", "tried-again", "tried-multiple"]);
export const pg_decisionTimeline = pgEnum("pg_decisionTimeline", ["immediately", "1-2-weeks", "1-month", "2-months", "3-months", "1-3-months", "6-months", "exploring"]);
export const pg_patientType = pgEnum("pg_patientType", ["local", "international"]);
export const pg_brand = pgEnum("pg_brand", ["fertiliv", "safemedigo", "dr-nilay-karaca"]);
export const pg_noteType = pgEnum("pg_noteType", ["consultation", "follow_up", "procedure", "lab_review", "general"]);
export const pg_cancellation_status = pgEnum("pg_cancellation_status", ["requested", "rejected"]);
export const pg_category_2 = pgEnum("pg_category_2", ["lab_test", "radiology_test", "pathology_test", "other_test", "procedure", "consultation", "medicine"]);
export const pg_status_3 = pgEnum("pg_status_3", ["active", "inactive"]);
export const pg_taxOverrideMode = pgEnum("pg_taxOverrideMode", ["inherit", "rule", "no_tax"]);
export const pg_type = pgEnum("pg_type", ["consultation", "follow_up", "procedure", "lab", "radiology", "other"]);
export const pg_appointmentType = pgEnum("pg_appointmentType", ["in-clinic", "online", "external"]);
export const pg_purpose = pgEnum("pg_purpose", ["sales-consultation", "medical-consultation", "follow-up", "procedure", "diagnostic-test"]);
export const pg_status_4 = pgEnum("pg_status_4", ["upcoming", "confirmed", "completed", "cancelled", "no_show", "rescheduled"]);
export const pg_googleReminderMode = pgEnum("pg_googleReminderMode", ["calendar_default", "custom"]);
export const pg_communicationType = pgEnum("pg_communicationType", ["manual_appointment_details"]);
export const pg_channel = pgEnum("pg_channel", ["email"]);
export const pg_recipientType = pgEnum("pg_recipientType", ["patient", "lead", "partner", "additional"]);
export const pg_deliveryStatus = pgEnum("pg_deliveryStatus", ["sent", "failed"]);
export const pg_recipientType_2 = pgEnum("pg_recipientType_2", ["patient", "lead"]);
export const pg_status_5 = pgEnum("pg_status_5", ["scheduled", "claimed", "dispatching", "retry_pending", "sent", "failed", "skipped", "invalidated"]);
export const pg_outcome = pgEnum("pg_outcome", ["sent", "retryable_failure", "permanent_failure", "skipped_recipient_unavailable", "invalidated_before_send"]);
export const pg_financialScope = pgEnum("pg_financialScope", ["production", "test"]);
export const pg_currency = pgEnum("pg_currency", ["USD", "EUR", "GBP", "TRY"]);
export const pg_status_6 = pgEnum("pg_status_6", ["draft", "issued", "paid", "partial", "overdue", "cancelled"]);
export const pg_status_7 = pgEnum("pg_status_7", ["draft", "published", "discarded"]);
export const pg_linePricingMethod = pgEnum("pg_linePricingMethod", ["none", "discount_percent", "final_line_total", "agreed_unit_price"]);
export const pg_priceEntryCurrency = pgEnum("pg_priceEntryCurrency", ["USD", "EUR", "GBP", "TRY", "SAR", "AED"]);
export const pg_priceEntryKind = pgEnum("pg_priceEntryKind", ["unit_price", "final_line_total", "tax_included_final_line_total", "agreed_unit_price", "tax_included_agreed_unit_price"]);
export const pg_priceFxSource = pgEnum("pg_priceFxSource", ["system", "manual"]);
export const pg_discountType = pgEnum("pg_discountType", ["percentage", "fixed"]);
export const pg_status_8 = pgEnum("pg_status_8", ["active", "expired", "used"]);
export const pg_priority = pgEnum("pg_priority", ["low", "medium", "high"]);
export const pg_status_9 = pgEnum("pg_status_9", ["pending", "in_progress", "completed", "cancelled"]);
export const pg_category_3 = pgEnum("pg_category_3", ["lab", "radiology", "pathology", "other"]);
export const pg_location = pgEnum("pg_location", ["in-clinic", "partner-clinic", "patient-country"]);
export const pg_status_10 = pgEnum("pg_status_10", ["ordered", "sample_collected", "processing", "completed", "cancelled"]);
export const pg_priority_2 = pgEnum("pg_priority_2", ["routine", "urgent", "stat"]);
export const pg_flag = pgEnum("pg_flag", ["normal", "low", "high", "critical"]);
export const pg_type_2 = pgEnum("pg_type_2", ["appointment_reminder", "appointment_cancellation", "invoice_issued", "payment_confirmed", "lab_result_ready", "inbox_new_conversation", "inbox_new_message", "inbox_assignment", "inbox_reassignment", "inbox_crm_review", "whatsapp_line_health", "general"]);
export const pg_patientType_2 = pgEnum("pg_patientType_2", ["local", "international", "not-specified"]);
export const pg_leadSource = pgEnum("pg_leadSource", ["paid", "employee-referral", "external-referral", "website", "maps", "partner", "public-relations", "instagram", "tiktok", "doctor-referral", "youtube", "facebook", "awatef-guide", "salim-guide", "organic"]);
export const pg_leadStatus = pgEnum("pg_leadStatus", ["intake", "attempted-to-contact", "contacted-awaiting-info", "medical-reports-received", "doctor-feedback-shared", "follow-up-negotiation", "ready-to-travel", "converted", "cold", "lost", "not-qualified", "junk"]);
export const pg_callbackMethod = pgEnum("pg_callbackMethod", ["whatsapp", "phone", "video_call", "email"]);
export const pg_leadOrigin = pgEnum("pg_leadOrigin", ["staff-created", "self-submitted"]);
export const pg_contactRole = pgEnum("pg_contactRole", ["female-patient", "male-patient", "husband-for-couple", "wife-for-couple", "family-member", "agent", "unknown"]);
export const pg_serviceFor = pgEnum("pg_serviceFor", ["female-only", "male-only", "couple"]);
export const pg_lifecycleStatus = pgEnum("pg_lifecycleStatus", ["active", "historical", "direct-upload", "deletion-pending", "pending-draft"]);
export const pg_infertilityType = pgEnum("pg_infertilityType", ["primary", "secondary"]);
export const pg_cycleRegularity = pgEnum("pg_cycleRegularity", ["regular", "irregular", "absent"]);
export const pg_smoking = pgEnum("pg_smoking", ["never", "former", "current"]);
export const pg_alcohol = pgEnum("pg_alcohol", ["never", "occasional", "regular"]);
export const pg_personGender = pgEnum("pg_personGender", ["female", "male"]);
export const pg_intakeMode = pgEnum("pg_intakeMode", ["legacy", "female", "male", "general"]);
export const pg_appliedPriceType = pgEnum("pg_appliedPriceType", ["local", "international"]);
export const pg_status_11 = pgEnum("pg_status_11", ["draft", "sent", "accepted", "rejected"]);
export const pg_module = pgEnum("pg_module", ["leads", "patients", "calendar", "finance", "lab", "settings", "analytics"]);
export const pg_status_12 = pgEnum("pg_status_12", ["connected", "needs_attention"]);
export const pg_operation = pgEnum("pg_operation", ["upsert", "delete"]);
export const pg_syncStatus = pgEnum("pg_syncStatus", ["pending", "synced", "failed", "deletion_pending", "deleted"]);
export const pg_reason = pgEnum("pg_reason", ["vacation", "sick_leave", "training", "personal", "other"]);
export const pg_protocol = pgEnum("pg_protocol", ["antagonist", "long", "oks_long", "patch_ant", "mikrodoz", "other"]);
export const pg_status_13 = pgEnum("pg_status_13", ["planned", "stimulation", "retrieval", "transfer", "completed", "cancelled"]);
export const pg_result = pgEnum("pg_result", ["positive", "negative", "biochemical", "clinical", "ongoing", "delivered", "miscarriage", "pending"]);
export const pg_status_14 = pgEnum("pg_status_14", ["pending", "processing", "completed", "failed"]);
export const pg_currency_2 = pgEnum("pg_currency_2", ["USD", "EUR", "GBP", "TRY", "SAR", "AED", "AUD"]);
export const pg_method = pgEnum("pg_method", ["cash", "credit_card", "bank_transfer", "insurance", "other"]);
export const pg_status_15 = pgEnum("pg_status_15", ["active", "voided"]);
export const pg_fxRateSource = pgEnum("pg_fxRateSource", ["system", "manual"]);
export const pg_sourceType = pgEnum("pg_sourceType", ["payment", "credit", "fx_rounding_adjustment"]);
export const pg_sourceCreditCurrency = pgEnum("pg_sourceCreditCurrency", ["USD", "EUR", "GBP", "TRY", "SAR", "AED", "AUD"]);
export const pg_provider = pgEnum("pg_provider", ["meta", "wppconnect", "zernio"]);
export const pg_onboardingMethod = pgEnum("pg_onboardingMethod", ["manual_cloud_api", "meta_embedded_signup", "meta_coexistence", "linked_device_wppconnect_sandbox", "linked_device_wppconnect_server", "zernio"]);
export const pg_credentialSource = pgEnum("pg_credentialSource", ["legacy_env", "secret_reference"]);
export const pg_lifecycleStatus_2 = pgEnum("pg_lifecycleStatus_2", ["onboarding", "connected", "needs_attention", "paused", "disconnected", "error"]);
export const pg_healthState = pgEnum("pg_healthState", ["unknown", "healthy", "degraded", "unavailable"]);
export const pg_state = pgEnum("pg_state", ["started", "cancelled", "failed", "completed"]);
export const pg_credentialKind = pgEnum("pg_credentialKind", ["business_access_token"]);
export const pg_fromOnboardingMethod = pgEnum("pg_fromOnboardingMethod", ["manual_cloud_api", "meta_embedded_signup", "meta_coexistence"]);
export const pg_toOnboardingMethod = pgEnum("pg_toOnboardingMethod", ["manual_cloud_api", "meta_embedded_signup", "meta_coexistence"]);
export const pg_fromCredentialSource = pgEnum("pg_fromCredentialSource", ["legacy_env", "secret_reference"]);
export const pg_toCredentialSource = pgEnum("pg_toCredentialSource", ["legacy_env", "secret_reference"]);
export const pg_providerApprovalState = pgEnum("pg_providerApprovalState", ["blocked", "approved"]);
export const pg_lifecycleState = pgEnum("pg_lifecycleState", ["not_started", "creating_session", "waiting_for_qr", "qr_ready", "qr_expired", "linking", "connected", "reconnecting", "disconnected", "logged_out", "session_invalid", "failed", "disabled"]);
export const pg_status_16 = pgEnum("pg_status_16", ["active", "revoked"]);
export const pg_state_2 = pgEnum("pg_state_2", ["not_started", "creating_session", "waiting_for_qr", "qr_ready", "qr_expired", "linking", "connected", "reconnecting", "disconnected", "logged_out", "session_invalid", "failed", "disabled"]);
export const pg_runtimeMode = pgEnum("pg_runtimeMode", ["sandbox", "persistent_worker"]);
export const pg_direction = pgEnum("pg_direction", ["incoming", "outgoing"]);
export const pg_connectionRoute = pgEnum("pg_connectionRoute", ["legacy_env", "persisted"]);
export const pg_intentType = pgEnum("pg_intentType", ["text", "template", "document"]);
export const pg_attemptState = pgEnum("pg_attemptState", ["pending", "submitting", "accepted", "delivered", "read", "failed", "ambiguous", "requires_retry"]);
export const pg_routingState = pgEnum("pg_routingState", ["legacy_env", "resolved", "unmapped", "mismatched", "unsupported"]);
export const pg_processingState = pgEnum("pg_processingState", ["received", "processing", "applied", "quarantined", "failed", "dead_letter"]);
export const pg_providerDirection = pgEnum("pg_providerDirection", ["inbound", "outbound_echo", "unknown"]);
export const pg_normalizationState = pgEnum("pg_normalizationState", ["normalized", "quarantined"]);
export const pg_mediaState = pgEnum("pg_mediaState", ["metadata_only", "quarantined"]);
export const pg_endpointKind = pgEnum("pg_endpointKind", ["phone"]);
export const pg_lifecycleState_2 = pgEnum("pg_lifecycleState_2", ["active", "blocked"]);
export const pg_aliasState = pgEnum("pg_aliasState", ["active", "revoked"]);
export const pg_identityKind = pgEnum("pg_identityKind", ["human"]);
export const pg_recordType = pgEnum("pg_recordType", ["lead", "patient"]);
export const pg_relationshipState = pgEnum("pg_relationshipState", ["active", "retired"]);
export const pg_trustSource = pgEnum("pg_trustSource", ["manual_confirmation", "trusted_import"]);
export const pg_linkState = pgEnum("pg_linkState", ["confirmed", "revoked"]);
export const pg_resolutionState = pgEnum("pg_resolutionState", ["unresolved", "candidate_single", "candidate_multiple", "confirmed"]);
export const pg_humanActorResolutionState = pgEnum("pg_humanActorResolutionState", ["unresolved", "confirmed"]);
export const pg_medicalSubjectResolutionState = pgEnum("pg_medicalSubjectResolutionState", ["unresolved"]);
export const pg_matchedField = pgEnum("pg_matchedField", ["phone", "secondaryPhone"]);
export const pg_evidenceState = pgEnum("pg_evidenceState", ["provider_hint"]);
export const pg_conversationType = pgEnum("pg_conversationType", ["private", "group"]);
export const pg_identityBasis = pgEnum("pg_identityBasis", ["remote_endpoint", "provider_thread"]);
export const pg_endpointResolutionState = pgEnum("pg_endpointResolutionState", ["unresolved", "candidate_single", "candidate_multiple", "confirmed"]);
export const pg_lifecycleState_3 = pgEnum("pg_lifecycleState_3", ["active", "archived"]);
export const pg_participantRole = pgEnum("pg_participantRole", ["remote_endpoint", "group_participant"]);
export const pg_participantState = pgEnum("pg_participantState", ["unresolved", "candidate", "confirmed"]);
export const pg_correlationState = pgEnum("pg_correlationState", ["correlated", "quarantined"]);
export const pg_relationshipRole = pgEnum("pg_relationshipRole", ["patient", "husband", "wife", "representative", "family", "translator", "other"]);
export const pg_phoneVisibility = pgEnum("pg_phoneVisibility", ["full_authorized", "mask_selected_roles", "admin_only_full"]);
export const pg_newSenderBehavior = pgEnum("pg_newSenderBehavior", ["conversation_only", "create_contact", "create_lead"]);
export const pg_exactPhoneMatch = pgEnum("pg_exactPhoneMatch", ["suggest", "auto_link_trusted", "never_auto_link"]);
export const pg_duplicateDetection = pgEnum("pg_duplicateDetection", ["suggest", "require_confirmation"]);
export const pg_candidateType = pgEnum("pg_candidateType", ["person", "lead", "patient"]);
export const pg_matchedField_2 = pgEnum("pg_matchedField_2", ["exact_phone", "provider_hint"]);
export const pg_confidence = pgEnum("pg_confidence", ["high", "medium"]);
export const pg_state_3 = pgEnum("pg_state_3", ["pending", "accepted", "dismissed"]);
export const pg_accessState = pgEnum("pg_accessState", ["available", "quarantined", "deleted"]);
export const pg_action = pgEnum("pg_action", ["open", "download", "denied"]);
export const pg_direction_2 = pgEnum("pg_direction_2", ["inbound", "outbound"]);
export const pg_status_17 = pgEnum("pg_status_17", ["received", "sent", "delivered", "read", "failed"]);
export const pg_type_3 = pgEnum("pg_type_3", ["overpayment", "applied_to_invoice", "applied_credit_reversal", "credit_payout", "refund_deduction", "manual_adjustment"]);
export const pg_originPaymentMethod = pgEnum("pg_originPaymentMethod", ["cash", "credit_card", "bank_transfer", "insurance", "other"]);
export const pg_targetInvoiceCurrency = pgEnum("pg_targetInvoiceCurrency", ["USD", "EUR", "GBP", "TRY", "SAR", "AED", "AUD"]);
export const pg_sourceCurrency = pgEnum("pg_sourceCurrency", ["USD", "EUR", "GBP", "TRY", "SAR", "AED", "AUD"]);
export const pg_status_18 = pgEnum("pg_status_18", ["active", "reversed"]);
export const pg_payoutCurrency = pgEnum("pg_payoutCurrency", ["USD", "EUR", "GBP", "TRY", "SAR", "AED", "AUD"]);
export const pg_method_2 = pgEnum("pg_method_2", ["cash", "bank_transfer"]);
export const pg_currency_3 = pgEnum("pg_currency_3", ["USD", "EUR", "GBP", "TRY", "SAR", "AED"]);
export const pg_method_3 = pgEnum("pg_method_3", ["cash", "bank_transfer", "card_reversal", "other"]);
export const pg_type_4 = pgEnum("pg_type_4", ["callback_request", "follow_up", "send_info", "consultation_request", "other"]);
export const pg_status_19 = pgEnum("pg_status_19", ["open", "in_progress", "done", "deferred"]);
export const pg_communicationMethod = pgEnum("pg_communicationMethod", ["whatsapp", "phone_call", "video_call", "email", "in_person"]);
export const pg_visibility = pgEnum("pg_visibility", ["all", "doctor_only", "staff_only"]);
export const pg_type_5 = pgEnum("pg_type_5", ["language", "country", "city", "nationality"]);
export const pg_status_20 = pgEnum("pg_status_20", ["draft", "confirmed", "sent"]);
export const pg_status_21 = pgEnum("pg_status_21", ["pending", "in_review", "plan_ready"]);
export const pg_monitoringType = pgEnum("pg_monitoringType", ["screen", "screenshot", "camera", "microphone"]);
export const pg_type_6 = pgEnum("pg_type_6", ["offer", "answer", "ice-candidate", "request", "reject", "end"]);
export const pg_resultType = pgEnum("pg_resultType", ["Quantitative", "Qualitative", "Molecular/PCR", "Genetic", "Microbiology Culture", "Microscopy/Parasitology", "Panel/Profile", "Pathology/Biopsy", "Semen Analysis", "Semen DNA", "Therapeutic Drug Monitoring", "Descriptive/Report"]);
export const pg_suggestedModule = pgEnum("pg_suggestedModule", ["general_lab", "semen_analysis", "semen_dna", "genetic", "radiology", "pathology"]);
export const pg_orderType = pgEnum("pg_orderType", ["Single Result Test", "Timed Component", "Protocol Name", "Genetic / Molecular"]);
export const pg_scope = pgEnum("pg_scope", ["global", "patient"]);
export const pg_changeType = pgEnum("pg_changeType", ["created", "updated", "alias_added", "alias_removed", "approved_from_pending", "bulk_enriched"]);
export const pg_status_22 = pgEnum("pg_status_22", ["draft", "final"]);
export const pg_processingStatus = pgEnum("pg_processingStatus", ["processed", "reviewed", "finalized"]);
export const pg_source_2 = pgEnum("pg_source_2", ["patient_entry", "pdf_import"]);
export const pg_aiConfidence = pgEnum("pg_aiConfidence", ["high", "medium", "low"]);
export const pg_medicalVerdict = pgEnum("pg_medicalVerdict", ["same", "different", "related_separate", "unclear"]);
export const pg_status_23 = pgEnum("pg_status_23", ["pending", "approved", "rejected", "merged"]);
export const pg_step = pgEnum("pg_step", ["input", "preview"]);
export const pg_caseType = pgEnum("pg_caseType", ["ivf", "icsi", "iui", "egg_freezing", "sperm_freezing", "micro_tese", "other"]);
export const pg_status_24 = pgEnum("pg_status_24", ["active", "completed", "cancelled", "on_hold"]);
export const pg_role_2 = pgEnum("pg_role_2", ["primary_female", "primary_male", "donor", "surrogate", "other"]);
export const pg_status_25 = pgEnum("pg_status_25", ["pending", "ready_for_admin_review", "resolved", "dismissed"]);
export const pg_status_26 = pgEnum("pg_status_26", ["active", "saved", "cancelled", "expired"]);
export const pg_status_27 = pgEnum("pg_status_27", ["pending", "processing", "completed", "failed", "canceled", "superseded"]);
export const pg_status_28 = pgEnum("pg_status_28", ["started", "succeeded", "failed"]);
export const pg_status_29 = pgEnum("pg_status_29", ["processing", "completed", "failed"]);

// ─── Users & Roles ───────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  authUserId: uuid("authUserId").unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  passwordHash: text("passwordHash"),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: pg_role("role").default("patient").notNull(),
  status: pg_status("status").default("pending").notNull(),
  avatarUrl: text("avatarUrl"),
  phone: varchar("phone", { length: 32 }),
  firstName: varchar("firstName", { length: 128 }),
  secondName: varchar("secondName", { length: 128 }),
  thirdName: varchar("thirdName", { length: 128 }),
  isActive: boolean("isActive").default(true).notNull(),
  bio: text("bio"), // Free-text bio / job description shown in coordinator picker
  jobTitle: varchar("jobTitle", { length: 128 }), // e.g. "IVF Coordinator"
  languages: jsonb("languages"), // string[] — ISO codes e.g. ["en","ar","tr"]
  primaryLanguage: varchar("primaryLanguage", { length: 16 }), // ISO code of the primary language
  weeklySchedule: jsonb("weeklySchedule"), // { mon:[{start:"09:00",end:"17:00"}], ... }
  slotDurationMinutes: integer("slotDurationMinutes").default(30), // booking slot length in minutes
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Audit Logs ──────────────────────────────────────────────────────────────

export const auditLogs = pgTable("audit_logs", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId"),
  userName: varchar("userName", { length: 256 }),
  userRole: varchar("userRole", { length: 64 }),
  action: varchar("action", { length: 128 }).notNull(),
  category: pg_category("category").notNull().default("other"),
  description: text("description"),
  recordId: integer("recordId"),
  recordType: varchar("recordType", { length: 64 }),
  page: varchar("page", { length: 256 }),
  durationSeconds: integer("durationSeconds"),
  ipAddress: varchar("ipAddress", { length: 64 }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

// ─── Doctors ─────────────────────────────────────────────────────────────────

export const doctors = pgTable("doctors", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  specialty: varchar("specialty", { length: 128 }),
  licenseNumber: varchar("licenseNumber", { length: 64 }),
  bio: text("bio"),
  consultationFee: numeric("consultationFee", { precision: 10, scale: 2 }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  // Extended profile fields (added in migration 0014)
  title: varchar("title", { length: 64 }),
  firstName: varchar("firstName", { length: 128 }),
  secondName: varchar("secondName", { length: 128 }),
  thirdName: varchar("thirdName", { length: 128 }),
  specializationId: integer("specializationId"),
  // Profile picture and stamp (added in migration 0015)
  avatarUrl: text("avatarUrl"),
  stampUrl: text("stampUrl"),
  code: varchar("code", { length: 32 }), // DOC-XXXXX — permanent, non-reusable
});
export type Doctor = typeof doctors.$inferSelect;

// ─── Patients ─────────────────────────────────────────────────────────────────

export const patients = pgTable("patients", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId"),
  mrn: varchar("mrn", { length: 32 }).notNull().unique(), // Medical Record Number
  // Creation-time default only. Existing financial history always keeps its own scope.
  defaultFinancialScope: pg_defaultFinancialScope("defaultFinancialScope").notNull().default("production"),
  firstName: varchar("firstName", { length: 128 }).notNull(),
  middleName: varchar("middleName", { length: 128 }),
  lastName: varchar("lastName", { length: 128 }).notNull(),
  dateOfBirth: date("dateOfBirth", { mode: "date" }),
  gender: pg_gender("gender"),
  phone: varchar("phone", { length: 32 }),
  secondaryPhone: varchar("secondaryPhone", { length: 32 }),
  email: varchar("email", { length: 320 }),
  secondaryEmail: varchar("secondaryEmail", { length: 320 }),
  address: text("address"),
  bloodType: varchar("bloodType", { length: 8 }),
  allergies: text("allergies"),
  emergencyContactName: varchar("emergencyContactName", { length: 128 }),
  emergencyContactPhone: varchar("emergencyContactPhone", { length: 32 }),
  insuranceProvider: varchar("insuranceProvider", { length: 128 }),
  insuranceNumber: varchar("insuranceNumber", { length: 64 }),
  assignedDoctorId: integer("assignedDoctorId"),
  // Sales fields
  interestLevel: pg_interestLevel("interestLevel").default("warm"),
  leadSource: varchar("leadSource", { length: 64 }),
  interestedProcedureId: integer("interestedProcedureId"), // FK to services — copied from lead on conversion
  tags: text("tags"), // JSON array stored as text
  // Unified status covering both lead pipeline and patient lifecycle
  status: pg_status_2("status").default("active_patient").notNull(),
  notes: text("notes"),
  // CRM / Lead pipeline fields
  source: pg_source("source"),
  socialLeadId: varchar("socialLeadId", { length: 128 }),
  campaignName: varchar("campaignName", { length: 256 }),
  budgetRange: varchar("budgetRange", { length: 64 }),
  rating: varchar("rating", { length: 64 }),
  travelReadiness: pg_travelReadiness("travelReadiness"),
  fertilityDiagnosis: jsonb("fertilityDiagnosis"), // array of strings — female fertility diagnosis
  maleFertilityDiagnosis: jsonb("maleFertilityDiagnosis"), // array of strings — male fertility diagnosis
  ivfExperience: pg_ivfExperience("ivfExperience"),
  decisionTimeline: pg_decisionTimeline("decisionTimeline"),
  preferredContactMethods: jsonb("preferredContactMethods"), // string[] e.g. ["whatsapp", "email"]
  assignedStaffId: integer("assignedStaffId"),
  lastContactDate: timestamp("lastContactDate", { withTimezone: true, mode: "date" }),
  nextFollowUpDate: timestamp("nextFollowUpDate", { withTimezone: true, mode: "date" }),
  // Location
  city: varchar("city", { length: 128 }),
  country: varchar("country", { length: 64 }),
  // Logistics
  accommodationHotel: varchar("accommodationHotel", { length: 256 }),
  accommodationLocation: varchar("accommodationLocation", { length: 256 }),
  transportationAirportPickup: boolean("transportationAirportPickup"),
  transportationLocalTransfer: boolean("transportationLocalTransfer"),
  // AI-generated content
  caseSummary: text("caseSummary"),
  salesNote: text("salesNote"),
  caseSummaryTranslations: text("caseSummaryTranslations"), // JSON: { "ar": "...", "tr": "..." }
  salesNoteTranslations: text("salesNoteTranslations"),   // JSON: { "ar": "...", "tr": "..." }
  // New fields
  nationality: varchar("nationality", { length: 64 }),
  isLocalPatient: boolean("isLocalPatient").default(false),
  patientType: pg_patientType("patientType"),
  brand: pg_brand("brand").default("fertiliv"),
  createdBy: integer("createdBy"),
  modifiedBy: integer("modifiedBy"),
  modifiedAt: timestamp("modifiedAt", { withTimezone: true, mode: "date" }),
  preferredLanguages: jsonb("preferredLanguages"), // string[] e.g. ["en", "ar"]
  primaryLanguage: varchar("primaryLanguage", { length: 16 }), // ISO code of the primary language
  mainMedicalInterest: jsonb("mainMedicalInterest"), // string[] — multi-select
  // Country of residency (separate from nationality/country of origin)
  countryOfResidency: varchar("countryOfResidency", { length: 64 }),
  // Couple link — links this patient to their partner patient
  partnerId: integer("partnerId"),
  // Finance
  creditBalance: numeric("creditBalance", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type Patient = typeof patients.$inferSelect;
export type InsertPatient = typeof patients.$inferInsert;

// Atomic MRN allocator. Not a patient row. Staff never query it from the browser.
export const mrnCounter = pgTable("mrn_counter", {
  id: integer("id").primaryKey(),
  nextValue: integer("next_value").notNull(),
});

// ─── Medical Notes ────────────────────────────────────────────────────────────

export const medicalNotes = pgTable("medical_notes", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId").notNull(),
  doctorId: integer("doctorId"),
  authorId: integer("authorId").notNull(),
  noteType: pg_noteType("noteType").default("consultation").notNull(),
  chiefComplaint: text("chiefComplaint"),
  historyOfPresentIllness: text("historyOfPresentIllness"),
  physicalExamination: text("physicalExamination"),
  assessment: text("assessment"),
  plan: text("plan"),
  diagnosis: text("diagnosis"),
  medications: text("medications"),
  rawTranscript: text("rawTranscript"),
  aiSummary: text("aiSummary"),
  isAiGenerated: boolean("isAiGenerated").default(false),
  enteredById: integer("enteredById"), // staff/admin who physically entered the note (if different from doctorId)
  additionalNotes: text("additionalNotes"), // free-text for anything not covered by structured fields
  cancellationStatus: pg_cancellation_status("cancellation_status"),
  cancellationReason: text("cancellation_reason"),
  cancellationRequestedBy: integer("cancellation_requested_by"),
  cancellationRequestedAt: bigint("cancellation_requested_at", { mode: "number" }),
  visitDate: timestamp("visitDate", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type MedicalNote = typeof medicalNotes.$inferSelect;
export type InsertMedicalNote = typeof medicalNotes.$inferInsert;

// ─── Services ─────────────────────────────────────────────────────────────────

export const services = pgTable("services", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  category: pg_category_2("category").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  // Dual pricing: Turkish local vs International, 4 currencies each
  localPriceUSD: numeric("localPriceUSD", { precision: 10, scale: 2 }),
  localPriceEUR: numeric("localPriceEUR", { precision: 10, scale: 2 }),
  localPriceGBP: numeric("localPriceGBP", { precision: 10, scale: 2 }),
  localPriceTRY: numeric("localPriceTRY", { precision: 10, scale: 2 }),
  intlPriceUSD: numeric("intlPriceUSD", { precision: 10, scale: 2 }),
  intlPriceEUR: numeric("intlPriceEUR", { precision: 10, scale: 2 }),
  intlPriceGBP: numeric("intlPriceGBP", { precision: 10, scale: 2 }),
  intlPriceTRY: numeric("intlPriceTRY", { precision: 10, scale: 2 }),
  duration: integer("duration"), // minutes
  preparationInstructions: text("preparationInstructions"),
  status: pg_status_3("status").default("active").notNull(),
  code: varchar("code", { length: 32 }),
  // Future-use policy only. Invoice lines retain independent immutable Tax snapshots.
  taxOverrideMode: pg_taxOverrideMode("taxOverrideMode").notNull().default("inherit"),
  taxOverrideRuleId: integer("taxOverrideRuleId"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type Service = typeof services.$inferSelect;
export type InsertService = typeof services.$inferInsert;

// ─── Service Tax Rules (forward-only) ────────────────────────────────────────
// Tax is a configurable service-line fact. It is never inferred from payment
// method, and saved invoice lines retain immutable snapshots of their rule.
export const serviceTaxRules = pgTable("service_tax_rules", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  label: varchar("label", { length: 128 }).notNull(),
  ratePercent: numeric("ratePercent", { precision: 7, scale: 4 }).notNull(),
  isActive: boolean("isActive").notNull().default(true),
  sortOrder: integer("sortOrder").notNull().default(0),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type ServiceTaxRule = typeof serviceTaxRules.$inferSelect;
export type InsertServiceTaxRule = typeof serviceTaxRules.$inferInsert;

// Existing service categories are an enum, not a separate CRUD entity. This
// compact mapping makes a category rule an optional suggestion for *new* lines.
export const serviceCategoryTaxDefaults = pgTable("service_category_tax_defaults", {
  category: pg_category_2("category").primaryKey(),
  taxRuleId: integer("taxRuleId"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type ServiceCategoryTaxDefault = typeof serviceCategoryTaxDefaults.$inferSelect;

// ─── Partner Clinics ──────────────────────────────────────────────────────────

export const partnerClinics = pgTable("partner_clinics", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  specialty: varchar("specialty", { length: 128 }),
  address: text("address"),
  googleMapsUrl: varchar("googleMapsUrl", { length: 2048 }),
  phone: varchar("phone", { length: 32 }),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  code: varchar("code", { length: 32 }), // CLIN-XXXXX — permanent, non-reusable
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type PartnerClinic = typeof partnerClinics.$inferSelect;;
export type InsertPartnerClinic = typeof partnerClinics.$inferInsert;

// ─── Appointments ─────────────────────────────────────────────────────────────

export const appointments = pgTable("appointments", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId"),
  leadId: integer("leadId"),
  doctorId: integer("doctorId"),
  serviceId: integer("serviceId"),
  staffId: integer("staffId"),
  hostUserId: integer("hostUserId"), // any staff or doctor hosting the appointment
  title: varchar("title", { length: 256 }).notNull(),
  appointmentDate: timestamp("appointmentDate", { withTimezone: true, mode: "date" }).notNull(),
  endDate: timestamp("endDate", { withTimezone: true, mode: "date" }),
  duration: integer("duration").default(30), // minutes
  // Appointment classification
  type: pg_type("type").default("consultation").notNull(),
  appointmentType: pg_appointmentType("appointmentType").default("in-clinic"),
  purpose: pg_purpose("purpose"),
  meetingLink: text("meetingLink"),
  partnerClinicId: integer("partnerClinicId"),
  externalLocation: text("externalLocation"),
  status: pg_status_4("status").default("upcoming").notNull(),
  notes: text("notes"),
  cancellationReason: text("cancellationReason"),
  // Explicit Admin-only exception for an appointment that overlaps authoritative staff Time-Off.
  availabilityOverrideReason: text("availabilityOverrideReason"),
  availabilityOverrideById: integer("availabilityOverrideById"),
  availabilityOverrideAt: timestamp("availabilityOverrideAt", { withTimezone: true, mode: "date" }),
  // Nullable source record for explicit Rescheduling V1 keep-as-exception decisions.
  availabilityOverrideTimeOffId: integer("availabilityOverrideTimeOffId"),
  // Clinic-owned Google Calendar reminder policy for the existing mapped event.
  // This is deliberately distinct from Fertiliv Patient Reminder Worker delivery.
  googleReminderMode: pg_googleReminderMode("googleReminderMode").default("calendar_default").notNull(),
  // V1 appointment reminder identity. Increment only when the authoritative
  // scheduled interval changes; do not use legacy reminderSent as evidence.
  appointmentScheduleRevision: integer("appointmentScheduleRevision").default(1).notNull(),
  reminderSent: boolean("reminderSent").default(false),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
   updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  code: varchar("code", { length: 32 }), // APT-XXXXX — permanent, non-reusable
});
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = typeof appointments.$inferInsert;

// ─── Appointment Activity Log ─────────────────────────────────────────────────

export const appointmentActivityLog = pgTable("appointment_activity_log", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  appointmentId: integer("appointmentId").notNull(),
  userId: integer("userId").notNull(),
  action: varchar("action", { length: 128 }).notNull(), // e.g. "status_changed", "rescheduled", "notes_updated"
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type AppointmentActivityLog = typeof appointmentActivityLog.$inferSelect;

// ─── Durable Appointment Reschedule Events ────────────────────────────────────
// Deliberately no foreign keys: this immutable evidence must survive permanent
// deletion of the appointment, Time-Off record, actor, Patient, or Lead row.
export const appointmentRescheduleEvents = pgTable("appointment_reschedule_events", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  appointmentId: integer("appointmentId").notNull(),
  appointmentCode: varchar("appointmentCode", { length: 32 }),
  patientId: integer("patientId"),
  leadId: integer("leadId"),
  timeOffId: integer("timeOffId"),
  oldStart: timestamp("oldStart", { withTimezone: true, mode: "date" }).notNull(),
  oldEnd: timestamp("oldEnd", { withTimezone: true, mode: "date" }).notNull(),
  newStart: timestamp("newStart", { withTimezone: true, mode: "date" }).notNull(),
  newEnd: timestamp("newEnd", { withTimezone: true, mode: "date" }).notNull(),
  actorId: integer("actorId").notNull(),
  source: varchar("source", { length: 64 }).notNull(),
  exceptionReason: text("exceptionReason"),
  executedAt: timestamp("executedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type AppointmentRescheduleEvent = typeof appointmentRescheduleEvents.$inferSelect;

// ─── Appointment Communication Deliveries ─────────────────────────────────────
// Phase A: metadata-only audit for manual participant-facing appointment emails.
// Do not persist email bodies, meeting links, clinical notes, financial data, or identifiers here.
export const appointmentCommunicationDeliveries = pgTable("appointment_communication_deliveries", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  appointmentId: integer("appointmentId").notNull(),
  sendGroupId: varchar("sendGroupId", { length: 64 }).notNull(),
  communicationType: pg_communicationType("communicationType").notNull(),
  channel: pg_channel("channel").notNull(),
  recipientEmail: varchar("recipientEmail", { length: 320 }).notNull(),
  recipientType: pg_recipientType("recipientType").notNull(),
  profileLanguage: varchar("profileLanguage", { length: 16 }),
  language: varchar("language", { length: 16 }).notNull(),
  localeFallbackUsed: boolean("localeFallbackUsed").default(false).notNull(),
  templateKey: varchar("templateKey", { length: 128 }).notNull(),
  templateVersion: varchar("templateVersion", { length: 64 }).notNull(),
  sentByUserId: integer("sentByUserId").notNull(),
  deliveryStatus: pg_deliveryStatus("deliveryStatus").notNull(),
  providerMessageId: varchar("providerMessageId", { length: 256 }),
  failureClassification: varchar("failureClassification", { length: 64 }),
  failureCode: varchar("failureCode", { length: 128 }),
  sentAt: timestamp("sentAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type AppointmentCommunicationDelivery = typeof appointmentCommunicationDeliveries.$inferSelect;
export type InsertAppointmentCommunicationDelivery = typeof appointmentCommunicationDeliveries.$inferInsert;

// ─── Appointment Reminder Foundation V1 ──────────────────────────────────────
// Reminder history is intentionally separate from manual appointment
// communications. Never persist email subject/body, appointment title, notes,
// clinical/financial data, internal cancellation reasons, or Google metadata.
export const appointmentReminderDeliveries = pgTable("appointment_reminder_deliveries", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  deliveryKey: varchar("deliveryKey", { length: 64 }).notNull(),
  appointmentId: integer("appointmentId").notNull(),
  recipientKey: varchar("recipientKey", { length: 96 }).notNull(),
  recipientType: pg_recipientType_2("recipientType").notNull(),
  channel: pg_channel("channel").notNull().default("email"),
  scheduleRevision: integer("scheduleRevision").notNull(),
  offsetMinutes: integer("offsetMinutes").notNull(),
  dueAt: timestamp("dueAt", { withTimezone: true, mode: "date" }).notNull(),
  status: pg_status_5("status").notNull().default("scheduled"),
  nextAttemptAt: timestamp("nextAttemptAt", { withTimezone: true, mode: "date" }),
  claimedAt: timestamp("claimedAt", { withTimezone: true, mode: "date" }),
  claimToken: varchar("claimToken", { length: 64 }),
  claimExpiresAt: timestamp("claimExpiresAt", { withTimezone: true, mode: "date" }),
  dispatchingAt: timestamp("dispatchingAt", { withTimezone: true, mode: "date" }),
  invalidatedAt: timestamp("invalidatedAt", { withTimezone: true, mode: "date" }),
  invalidationReason: varchar("invalidationReason", { length: 64 }),
  skippedReason: varchar("skippedReason", { length: 96 }),
  sentAt: timestamp("sentAt", { withTimezone: true, mode: "date" }),
  failedAt: timestamp("failedAt", { withTimezone: true, mode: "date" }),
  recipientEmail: varchar("recipientEmail", { length: 320 }),
  profileLanguage: varchar("profileLanguage", { length: 16 }),
  deliveredLanguage: varchar("deliveredLanguage", { length: 16 }),
  localeFallbackUsed: boolean("localeFallbackUsed").default(false).notNull(),
  templateKey: varchar("templateKey", { length: 128 }).notNull(),
  templateVersion: varchar("templateVersion", { length: 64 }).notNull(),
  providerMessageId: varchar("providerMessageId", { length: 256 }),
  attemptCount: integer("attemptCount").default(0).notNull(),
  lastFailureClassification: varchar("lastFailureClassification", { length: 64 }),
  lastFailureCode: varchar("lastFailureCode", { length: 128 }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, table => [
  uniqueIndex("appointment_reminder_deliveries_delivery_key_uq").on(table.deliveryKey),
  uniqueIndex("appointment_reminder_deliveries_business_identity_uq").on(table.appointmentId, table.recipientKey, table.channel, table.offsetMinutes, table.scheduleRevision),
  index("appointment_reminder_deliveries_due_processing_ix").on(table.status, table.nextAttemptAt, table.dueAt),
  index("appointment_reminder_deliveries_appointment_revision_ix").on(table.appointmentId, table.scheduleRevision),
  index("appointment_reminder_deliveries_claim_expiry_ix").on(table.claimExpiresAt),
]);

export const appointmentReminderDeliveryAttempts = pgTable("appointment_reminder_delivery_attempts", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  reminderDeliveryId: integer("reminderDeliveryId").notNull(),
  attemptNumber: integer("attemptNumber").notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  outcome: pg_outcome("outcome").notNull(),
  attemptedAt: timestamp("attemptedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  completedAt: timestamp("completedAt", { withTimezone: true, mode: "date" }),
  recipientEmail: varchar("recipientEmail", { length: 320 }),
  profileLanguage: varchar("profileLanguage", { length: 16 }),
  deliveredLanguage: varchar("deliveredLanguage", { length: 16 }),
  localeFallbackUsed: boolean("localeFallbackUsed").default(false).notNull(),
  providerMessageId: varchar("providerMessageId", { length: 256 }),
  failureClassification: varchar("failureClassification", { length: 64 }),
  failureCode: varchar("failureCode", { length: 128 }),
}, table => [
  uniqueIndex("appointment_reminder_delivery_attempts_delivery_number_uq").on(table.reminderDeliveryId, table.attemptNumber),
  index("appointment_reminder_delivery_attempts_delivery_ix").on(table.reminderDeliveryId),
]);

export type AppointmentReminderDelivery = typeof appointmentReminderDeliveries.$inferSelect;
export type InsertAppointmentReminderDelivery = typeof appointmentReminderDeliveries.$inferInsert;
export type AppointmentReminderDeliveryAttempt = typeof appointmentReminderDeliveryAttempts.$inferSelect;

// ─── Finance: Invoices & Bills ────────────────────────────────────────────────

export const invoices = pgTable("invoices", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId"),
  leadId: integer("leadId"),
  // Primary official-reporting boundary. Never derived retroactively from patient state.
  financialScope: pg_financialScope("financialScope").notNull().default("production"),
  invoiceNumber: varchar("invoiceNumber", { length: 32 }).notNull().unique(),
  issueDate: timestamp("issueDate", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  dueDate: timestamp("dueDate", { withTimezone: true, mode: "date" }),
  currency: pg_currency("currency").default("USD").notNull(),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  discountAmount: numeric("discountAmount", { precision: 10, scale: 2 }).default("0"),
  discountPercent: numeric("discountPercent", { precision: 5, scale: 2 }).default("0"),
  taxAmount: numeric("taxAmount", { precision: 10, scale: 2 }).default("0"),
  totalAmount: numeric("totalAmount", { precision: 10, scale: 2 }).notNull(),
  paidAmount: numeric("paidAmount", { precision: 10, scale: 2 }).default("0"),
  status: pg_status_6("status").default("draft").notNull(),
  paymentMethod: varchar("paymentMethod", { length: 64 }),
  paymentDate: timestamp("paymentDate", { withTimezone: true, mode: "date" }),
  notes: text("notes"),
  externalReceiptKey: varchar("externalReceiptKey", { length: 512 }),
  exchangeRateSnapshot: numeric("exchangeRateSnapshot", { precision: 14, scale: 6 }),
  // Rate metadata: direction is always TRY_PER_UNIT (1 currency = X TRY)
  rateDirection: varchar("rateDirection", { length: 32 }).default("TRY_PER_UNIT"),
  snapshotSource: varchar("snapshotSource", { length: 64 }),
  snapshotRateDate: varchar("snapshotRateDate", { length: 16 }),
  createdById: integer("createdById"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  // V3 pricing mode: "discount" | "agreed" | "discount_legacy"
  pricingMode: varchar("pricingMode", { length: 32 }),
  // V3: exact staff-entered final price (Mode B / "agreed" only)
  finalAgreedAmount: numeric("finalAgreedAmount", { precision: 10, scale: 2 }),
  // V3: card_surcharge_pct snapshotted at invoice creation (null = unknown or absorbed)
  paymentAdjustmentRateSnapshot: numeric("paymentAdjustmentRateSnapshot", { precision: 5, scale: 2 }),
  // Forward-only markers. Historical rows deliberately remain NULL and retain
  // their existing Card/Bank settlement interpretation.
  taxModelVersion: varchar("taxModelVersion", { length: 32 }),
  settlementModelVersion: varchar("settlementModelVersion", { length: 32 }),
  // Versioned invoice publication. Historical rows deliberately start without
  // a stored revision snapshot; the current published state is captured only
  // when a staff member explicitly reopens that invoice for a Draft Revision.
  currentRevisionNumber: integer("currentRevisionNumber").notNull().default(1),
  currentPublishedRevisionId: integer("currentPublishedRevisionId"),
  activeDraftRevisionId: integer("activeDraftRevisionId"),
});

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

// Immutable published and server-saved draft snapshots for an invoice whose
// identity, payment history, settlements, and FX facts remain on the parent
// invoice / finance tables. A draft never changes the official invoice row.
export const invoiceRevisions = pgTable("invoice_revisions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  invoiceId: integer("invoiceId").notNull(),
  revisionNumber: integer("revisionNumber").notNull(),
  status: pg_status_7("status").notNull(),
  parentPublishedRevisionId: integer("parentPublishedRevisionId"),
  snapshot: jsonb("snapshot").notNull(),
  changeSummary: jsonb("changeSummary"),
  previousTotals: jsonb("previousTotals"),
  publishedTotals: jsonb("publishedTotals"),
  createdById: integer("createdById"),
  publishedById: integer("publishedById"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  publishedAt: timestamp("publishedAt", { withTimezone: true, mode: "date" }),
}, (table) => ({
  invoiceRevisionNumberUnique: uniqueIndex("invoice_revisions_invoice_revision_unique").on(table.invoiceId, table.revisionNumber),
  invoiceRevisionStatusIdx: index("invoice_revisions_invoice_status_idx").on(table.invoiceId, table.status),
}));

export type InvoiceRevision = typeof invoiceRevisions.$inferSelect;

export const invoiceItems = pgTable("invoice_items", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  invoiceId: integer("invoiceId").notNull(),
  serviceId: integer("serviceId"),
  // Optional invoice-local patient-facing qualifier. This never changes the
  // canonical Service Catalog name or the primary custom-line description.
  lineLabel: varchar("lineLabel", { length: 256 }),
  description: varchar("description", { length: 256 }).notNull(),
  quantity: integer("quantity").default(1).notNull(),
  // V4: immutable original/standard per-unit snapshot. Never rewritten from a negotiated final line total.
  unitPrice: numeric("unitPrice", { precision: 10, scale: 2 }).notNull(),
  // V4: canonical patient-facing final line total.
  totalPrice: numeric("totalPrice", { precision: 10, scale: 2 }).notNull(),
  linePricingMethod: pg_linePricingMethod("linePricingMethod").notNull().default("none"),
  lineDiscountPercent: numeric("lineDiscountPercent", { precision: 5, scale: 2 }),
  // Forward-only Service Tax snapshots. totalPrice remains the existing V4
  // pre-tax line total. effectiveTaxableBase is required to reproduce the
  // post-invoice-discount/agreed allocation without reading live Tax settings.
  taxRuleId: integer("taxRuleId"),
  taxLabelSnapshot: varchar("taxLabelSnapshot", { length: 128 }),
  taxRateSnapshot: numeric("taxRateSnapshot", { precision: 7, scale: 4 }),
  // Forward-only Tax treatment marker. Historical rows remain NULL and retain
  // their persisted source-price kind / tax snapshot semantics.
  taxIncludedMode: boolean("taxIncludedMode"),
  effectiveTaxableBase: numeric("effectiveTaxableBase", { precision: 10, scale: 2 }),
  taxAmount: numeric("taxAmount", { precision: 10, scale: 2 }).notNull().default("0"),
  // X1: immutable source-price/FX facts for a deliberately negotiated line.
  // Legacy and ordinary invoice-currency-only lines deliberately remain NULL.
  priceEntryCurrency: pg_priceEntryCurrency("priceEntryCurrency"),
  priceEntryAmount: numeric("priceEntryAmount", { precision: 18, scale: 2 }),
  priceEntryKind: pg_priceEntryKind("priceEntryKind"),
  // Canonical direction: 1 source-currency unit = X invoice-currency units.
  priceFxRateToInvoice: numeric("priceFxRateToInvoice", { precision: 20, scale: 12 }),
  // Supporting immutable facts follow the existing Finance TRY-per-unit convention.
  priceFxSourceToTryRate: numeric("priceFxSourceToTryRate", { precision: 20, scale: 12 }),
  priceFxInvoiceToTryRate: numeric("priceFxInvoiceToTryRate", { precision: 20, scale: 12 }),
  priceFxSource: pg_priceFxSource("priceFxSource"),
  priceFxEffectiveAt: timestamp("priceFxEffectiveAt", { withTimezone: true, mode: "date" }),
  priceFxNote: text("priceFxNote"),
});

export type InvoiceItem = typeof invoiceItems.$inferSelect;

export const offers = pgTable("offers", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId"),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  discountType: pg_discountType("discountType").default("percentage").notNull(),
  discountValue: numeric("discountValue", { precision: 10, scale: 2 }).notNull(),
  validFrom: timestamp("validFrom", { withTimezone: true, mode: "date" }),
  validUntil: timestamp("validUntil", { withTimezone: true, mode: "date" }),
  status: pg_status_8("status").default("active").notNull(),
  code: varchar("code", { length: 32 }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type Offer = typeof offers.$inferSelect;

// ─── Sales ────────────────────────────────────────────────────────────────────

export const salesNotes = pgTable("sales_notes", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId"),
  leadId: integer("leadId"),
  authorId: integer("authorId").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type SalesNote = typeof salesNotes.$inferSelect;

export const salesTasks = pgTable("sales_tasks", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId"),
  leadId: integer("leadId"),
  assignedToId: integer("assignedToId"),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  dueDate: timestamp("dueDate", { withTimezone: true, mode: "date" }),
  priority: pg_priority("priority").default("medium").notNull(),
  status: pg_status_9("status").default("pending").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type SalesTask = typeof salesTasks.$inferSelect;

// ─── Lab & Radiology Orders ───────────────────────────────────────────────────

export const labOrders = pgTable("lab_orders", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId").notNull(),
  doctorId: integer("doctorId"),
  appointmentId: integer("appointmentId"),
  serviceId: integer("serviceId"),
  partnerClinicId: integer("partnerClinicId"),
  orderNumber: varchar("orderNumber", { length: 32 }).notNull().unique(),
  testName: varchar("testName", { length: 256 }).notNull(),
  category: pg_category_3("category").default("lab").notNull(),
  location: pg_location("location").default("in-clinic"),
  status: pg_status_10("status").default("ordered").notNull(),
  priority: pg_priority_2("priority").default("routine").notNull(),
  orderedDate: timestamp("orderedDate", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  collectedDate: timestamp("collectedDate", { withTimezone: true, mode: "date" }),
  resultDate: timestamp("resultDate", { withTimezone: true, mode: "date" }),
  notes: text("notes"),
  invoiceId: integer("invoiceId"),
  invoiceStatus: varchar("invoiceStatus", { length: 32 }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  code: varchar("code", { length: 32 }), // LAB-XXXXX — permanent, non-reusable
});
export type LabOrder = typeof labOrders.$inferSelect;;
export type InsertLabOrder = typeof labOrders.$inferInsert;

export const labResults = pgTable("lab_results", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  labOrderId: integer("labOrderId").notNull(),
  patientId: integer("patientId").notNull(),
  parameter: varchar("parameter", { length: 128 }).notNull(),
  value: varchar("value", { length: 128 }).notNull(),
  unit: varchar("unit", { length: 32 }),
  referenceRange: varchar("referenceRange", { length: 64 }),
  flag: pg_flag("flag").default("normal"),
  interpretation: text("interpretation"),
  reportUrl: text("reportUrl"),
  // File attachments
  resultFileKey: text("resultFileKey"),
  resultFileUrl: text("resultFileUrl"),
  translationFileKey: text("translationFileKey"),
  translationFileUrl: text("translationFileUrl"),
  // Enhanced result fields
  sampleCollectedAt: timestamp("sampleCollectedAt", { withTimezone: true, mode: "date" }),
  reportedAt: timestamp("reportedAt", { withTimezone: true, mode: "date" }),
  refRangeFrom: varchar("refRangeFrom", { length: 32 }),
  refRangeTo: varchar("refRangeTo", { length: 32 }),
  unitConversionFormula: varchar("unitConversionFormula", { length: 256 }),
  flagManualOverride: boolean("flagManualOverride").default(false),
  clinicalInterpretation: text("clinicalInterpretation"),
  isVisibleToPatient: boolean("isVisibleToPatient").default(false).notNull(),
  enteredById: integer("enteredById"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type LabResult = typeof labResults.$inferSelect;
export type InsertLabResult = typeof labResults.$inferInsert;

// ─── Notifications ────────────────────────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  type: pg_type_2("type").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  message: text("message").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  relatedId: integer("relatedId"),
  relatedType: varchar("relatedType", { length: 64 }),
  dedupeKey: varchar("dedupeKey", { length: 255 }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("notifications_user_dedupe_uq").on(table.userId, table.dedupeKey),
  index("notifications_user_created_ix").on(table.userId, table.createdAt),
]);

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

// ─── Messages (In-App) ────────────────────────────────────────────────────────

export const messages = pgTable("messages", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  fromUserId: integer("fromUserId").notNull(),
  toUserId: integer("toUserId").notNull(),
  subject: varchar("subject", { length: 256 }),
  content: text("content").notNull(),
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type Message = typeof messages.$inferSelect;

// ─── Leads (CRM) ─────────────────────────────────────────────────────────────

export const leads = pgTable("leads", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  firstName: varchar("firstName", { length: 128 }).notNull(),
  middleName: varchar("middleName", { length: 128 }),
  lastName: varchar("lastName", { length: 128 }).notNull(),
  dateOfBirth: date("dateOfBirth", { mode: "date" }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 32 }),
  secondaryPhone: varchar("secondaryPhone", { length: 32 }),
  secondaryEmail: varchar("secondaryEmail", { length: 320 }),
  nationality: varchar("nationality", { length: 64 }),
  patientType: pg_patientType_2("patientType"),
  preferredLanguages: jsonb("preferredLanguages"), // string[] e.g. ["en", "ar"]
  primaryLanguage: varchar("primaryLanguage", { length: 16 }), // ISO code of the primary language
  preferredContactMethods: jsonb("preferredContactMethods"), // string[] e.g. ["whatsapp", "email"]
  gender: pg_gender("gender"),
  tcKimlikNo: varchar("tcKimlikNo", { length: 20 }), // Turkish ID number (optional, for local patient classification)
  passportNumber: varchar("passportNumber", { length: 32 }), // Passport number (optional, for international patient classification)
  interestedProcedureId: integer("interestedProcedureId"), // FK to services
  ivfExperience: pg_ivfExperience("ivfExperience").default("never-tried"),
  fertilityDiagnosis: jsonb("fertilityDiagnosis"), // array of strings — female fertility diagnosis (Zoho-mapped)
  maleFertilityDiagnosis: jsonb("maleFertilityDiagnosis"), // array of strings — male fertility diagnosis (new)
  leadSource: pg_leadSource("leadSource"),
  socialLeadId: varchar("socialLeadId", { length: 128 }),
  campaignName: varchar("campaignName", { length: 256 }),
  brand: pg_brand("brand").default("fertiliv"),
  budgetRange: varchar("budgetRange", { length: 64 }),
  decisionTimeline: pg_decisionTimeline("decisionTimeline"),
  travelReadiness: pg_travelReadiness("travelReadiness"),
  leadStatus: pg_leadStatus("leadStatus").default("intake").notNull(),
  rating: varchar("rating", { length: 64 }), // descriptive label (Excellent Candidate, etc.)
  interestLevel: pg_interestLevel("interestLevel"), // Cold/Warm/Hot engagement level
  assignedStaffId: integer("assignedStaffId"),
  assignedDoctorId: integer("assignedDoctorId"), // FK to doctors.id — doctor assigned to review this lead
  lastContactDate: timestamp("lastContactDate", { withTimezone: true, mode: "date" }),
  nextFollowUpDate: timestamp("nextFollowUpDate", { withTimezone: true, mode: "date" }),
  tags: jsonb("tags"), // array of strings
  // Address
  address: text("address"),
  city: varchar("city", { length: 128 }),
  country: varchar("country", { length: 64 }),
  // Logistics
  accommodationHotel: varchar("accommodationHotel", { length: 256 }),
  accommodationLocation: varchar("accommodationLocation", { length: 256 }),
  transportationAirportPickup: boolean("transportationAirportPickup").default(false),
  transportationLocalTransfer: boolean("transportationLocalTransfer").default(false),
  // AI-generated content
  caseSummary: text("caseSummary"),
  salesNote: text("salesNote"),
  caseSummaryTranslations: text("caseSummaryTranslations"), // JSON: { "ar": "...", "tr": "..." }
  salesNoteTranslations: text("salesNoteTranslations"),   // JSON: { "ar": "...", "tr": "..." }
  mainMedicalInterest: jsonb("mainMedicalInterest"), // string[] — multi-select
  // Callback request (from public intake wizard)
  callbackRequestedAt: timestamp("callbackRequestedAt", { withTimezone: true, mode: "date" }),
  callbackPreferredDate: varchar("callbackPreferredDate", { length: 32 }),
  callbackPreferredTime: varchar("callbackPreferredTime", { length: 32 }),
  callbackMethod: pg_callbackMethod("callbackMethod"),
  // Public intake token (for multi-step wizard session)
  intakeToken: varchar("intakeToken", { length: 128 }),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  formSessionToken: varchar("formSessionToken", { length: 128 }),
  otpCode: varchar("otpCode", { length: 8 }),
  otpExpiresAt: timestamp("otpExpiresAt", { withTimezone: true, mode: "date" }),
  // Origin: how the lead was created
  leadOrigin: pg_leadOrigin("leadOrigin").default("staff-created"),
  // Converted patient — UNIQUE: one Lead can only point to one Patient, and vice versa
  convertedPatientId: integer("convertedPatientId").unique(),
  // Merge tracking
  mergedIntoLeadId: integer("mergedIntoLeadId"),
  mergedAt: timestamp("mergedAt", { withTimezone: true, mode: "date" }),
  // Couple link — links this lead to their partner lead
  partnerId: integer("partnerId"),
  // Phase 1 — informational metadata (no workflow behaviour)
  contactRole: pg_contactRole("contactRole"),
  serviceFor: pg_serviceFor("serviceFor"),
  profileCompleteness: integer("profileCompleteness"),
  // Audit
  createdBy: integer("createdBy"),
  modifiedBy: integer("modifiedBy"),
  modifiedAt: timestamp("modifiedAt", { withTimezone: true, mode: "date" }),
  code: varchar("code", { length: 32 }), // LEAD-XXXXX — permanent, non-reusable
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type Lead = typeof leads.$inferSelect;;
export type InsertLead = typeof leads.$inferInsert;

// ─── Lead Communications ──────────────────────────────────────────────────────

export const leadCommunications = pgTable("lead_communications", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  leadId: integer("leadId").notNull(),
  note: text("note").notNull(),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  // Audit columns added 2026-07-13 (nullable, reversible)
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }),
  updatedBy: integer("updatedBy"),
  deletedAt: timestamp("deletedAt", { withTimezone: true, mode: "date" }),
  deletedBy: integer("deletedBy"),
});

export type LeadCommunication = typeof leadCommunications.$inferSelect;
export type InsertLeadCommunication = typeof leadCommunications.$inferInsert;

// ─── Lead Documents ───────────────────────────────────────────────────────────

export const leadDocuments = pgTable("lead_documents", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  leadId: integer("leadId"),           // nullable after conversion
  patientId: integer("patientId"),     // set during lead→patient conversion
  fileKey: text("fileKey").notNull(),
  fileUrl: text("fileUrl").notNull(),
  fileName: varchar("fileName", { length: 256 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  uploadedBy: integer("uploadedBy").notNull(),
  // Document tagging — auto-set from intake section or manually entered by staff
  tag: varchar("tag", { length: 128 }),           // e.g. "Sperm Analysis", "Hormone Panel"
  intakeSection: varchar("intakeSection", { length: 128 }), // source section in intake form
  // Password for password-protected PDFs (stored so system can unlock for AI processing/translation)
  docPassword: varchar("docPassword", { length: 256 }),
  // ── Phase 1 Foundation Columns (nullable, no behavior change) ────────────
  // ownerType: identifies which health record or case this document belongs to
  // Allowed values: 'general' | 'female_health_record' | 'male_health_record' | 'treatment_case'
  ownerType: varchar("ownerType", { length: 64 }),
  // ownerId: the ID of the owning record (health record ID or treatment case ID)
  ownerId: integer("ownerId"),
  // ── Phase 2 Lifecycle Columns ─────────────────────────────────────────────
  // lifecycleStatus: NULL = unclassified/legacy (existing rows before this migration)
  // 'active'        = currently referenced by the active Medical Intake
  // 'historical'    = belonged to a Medical Intake before it was reset/deleted
  // 'direct-upload' = uploaded directly from the Documents tab (no intake reference)
  // 'deletion-pending' = document is being permanently deleted; hidden from UI, preserved for S3 retry
  // 'pending-draft' = uploaded inside a Health Record edit form, not yet saved; excluded from Documents Library
  lifecycleStatus: pg_lifecycleStatus("lifecycleStatus"),
  // sourceIntakeId: the medical_intake.id at the time of upload (for traceability)
  sourceIntakeId: integer("sourceIntakeId"),
  // archivedAt: timestamp when the document was archived (set during Health Record reset)
  archivedAt: timestamp("archivedAt", { withTimezone: true, mode: "date" }),
  // archiveReason: why the document was archived
  // 'health-record-reset' = Health Record was reset/deleted
  archiveReason: varchar("archiveReason", { length: 64 }),
  // storageDeletePending: true when DB row was deleted but S3 object deletion failed
  // Used for retry mechanism — the storage key is preserved until deletion succeeds
  storageDeletePending: boolean("storageDeletePending").default(false),
  // ── Phase 2 Pending-Draft Metadata (nullable; only set for lifecycleStatus = 'pending-draft') ──
  // draftSessionId: stable UUID identifying the Health Record edit session that owns this pending file
  draftSessionId: varchar("draftSessionId", { length: 64 }),
  // draftLastActivityAt: last meaningful draft activity (upload, edit, AI interaction)
  draftLastActivityAt: timestamp("draftLastActivityAt", { withTimezone: true, mode: "date" }),
  // pendingExpiresAt: 24 hours after draftLastActivityAt; cleanup job removes expired pending docs
  pendingExpiresAt: timestamp("pendingExpiresAt", { withTimezone: true, mode: "date" }),
  // pendingCreatedBy: userId who initiated the pending upload
  pendingCreatedBy: integer("pendingCreatedBy"),
  // pendingSection: clinical section in the intake form (e.g. 'miscarriageHistory', 'previousTests')
  pendingSection: varchar("pendingSection", { length: 128 }),
  // pendingEntryKey: stable reference to the specific entry within the section (e.g. entry index or UUID)
  pendingEntryKey: varchar("pendingEntryKey", { length: 128 }),
  // promotedAt: timestamp when the document was promoted from pending-draft to active during Save
  promotedAt: timestamp("promotedAt", { withTimezone: true, mode: "date" }),
  // ── Storage Cleanup Retry Tracking (Phase 2 Final Acceptance) ────────────────
  // Number of failed physical-storage deletion attempts (incremented atomically on each failure)
  storageDeleteAttempts: integer("storageDeleteAttempts").default(0),
  // Timestamp of the most recent storage deletion attempt
  lastStorageDeleteAttemptAt: timestamp("lastStorageDeleteAttemptAt", { withTimezone: true, mode: "date" }),
  // Sanitized technical error from the most recent failed attempt (no clinical content)
  lastStorageDeleteError: varchar("lastStorageDeleteError", { length: 512 }),
  // Timestamp when the 3-failure operations alert was created (null = not yet alerted)
  cleanupAlertedAt: timestamp("cleanupAlertedAt", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type LeadDocument = typeof leadDocuments.$inferSelect;
export type InsertLeadDocument = typeof leadDocuments.$inferInsert;

// ─── Medical Intake (Lead / Patient) ─────────────────────────────────────────
// One record per lead or patient. JSON columns store structured arrays.
export const medicalIntake = pgTable("medical_intake", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  leadId: integer("leadId").unique(),    // nullable — set when intake belongs to a lead
  patientId: integer("patientId").unique(), // nullable — set when intake belongs to a patient

  // ── Basic Info (auto-filled from lead/patient record, not re-entered) ──────
  infertilityType: pg_infertilityType("infertilityType"),
  infertilityDuration: varchar("infertilityDuration", { length: 64 }), // e.g. "3 years"
  referralSource: varchar("referralSource", { length: 256 }),
  profession: varchar("profession", { length: 128 }),
  marriageDate: timestamp("marriageDate", { withTimezone: true, mode: "date" }),
  isFirstMarriage: boolean("isFirstMarriage"),
  partnerIsFirstMarriage: boolean("partnerIsFirstMarriage"),
  hasCivilMarriageCertificate: boolean("hasCivilMarriageCertificate").default(false),
  marriageCertStatus: varchar("marriageCertStatus", { length: 32 }).default("not_specified"), // not_specified | yes | in_progress | no
  marriageCertFileKey: varchar("marriageCertFileKey", { length: 512 }),
  marriageCertFileUrl: varchar("marriageCertFileUrl", { length: 1024 }),
  marriageCertFileName: varchar("marriageCertFileName", { length: 512 }),
  marriageCertDocId: integer("marriageCertDocId"),
  marriageCertFilePassword: varchar("marriageCertFilePassword", { length: 256 }),

  // ── Physical Measurements ────────────────────────────────────────────────
  heightCm: numeric("heightCm", { precision: 5, scale: 1 }),   // stored in cm
  weightKg: numeric("weightKg", { precision: 5, scale: 1 }),   // stored in kg
  bmi: numeric("bmi", { precision: 4, scale: 1 }),             // auto-calculated or manual
  bmiManual: boolean("bmiManual").default(false),              // true if manually entered
  waistCm: numeric("waistCm", { precision: 5, scale: 1 }),
  hipCm: numeric("hipCm", { precision: 5, scale: 1 }),

  // ── Obstetric History ────────────────────────────────────────────────────
  gravida: integer("gravida").default(0),       // total pregnancies
  para: integer("para").default(0),             // live births
  abortus: integer("abortus").default(0),       // abortions/terminations
  livingChildren: integer("livingChildren").default(0),
  childrenFromPreviousMarriage: integer("childrenFromPreviousMarriage").default(0),

  // ── Menstrual History ────────────────────────────────────────────────────
  lastMenstrualPeriod: timestamp("lastMenstrualPeriod", { withTimezone: true, mode: "date" }),
  cycleRegularity: pg_cycleRegularity("cycleRegularity"),
  cycleLengthDays: integer("cycleLengthDays"),
  menstrualFlowDays: integer("menstrualFlowDays"),
  dysmenorrhea: boolean("dysmenorrhea").default(false),

  // ── Miscarriage History (JSON array) ─────────────────────────────────────
  // [{date: string, gestationalAge: string, notes: string}]
  miscarriageHistory: jsonb("miscarriageHistory"),

  // ── Previous Fertility Treatments / ART History (JSON array) ─────────────
  // [{type: 'IVF'|'IUI'|'ICSI'|'Other', date: string, clinic: string, protocol: string,
  //   eggsCollected: number, embryosFertilized: number, embryosTransferred: number,
  //   embryoQuality: string, result: string, notes: string}]
  artHistory: jsonb("artHistory"),

  // ── Surgical History (JSON array) ────────────────────────────────────────
  // [{procedure: string, date: string, notes: string, fileKey: string, fileUrl: string, fileName: string}]
  surgicalHistory: jsonb("surgicalHistory"),

  // ── Previous Tests (JSON array) ──────────────────────────────────────────
  // [{name: string, date: string, result: string, fileKey: string, fileUrl: string, fileName: string}]
  previousTests: jsonb("previousTests"),
  // Explicit Previous Tests gate: true = Yes, false = No, null = unanswered (legacy).
  // Persisted independently so Yes+[] is distinct from No+[].
  hasPreviousTests: boolean("hasPreviousTests"),

  // ── Systemic Diseases (JSON object of booleans + free text) ──────────────
  // {diabetes, hypertension, thyroid, heartDisease, kidneyDisease, liverDisease,
  //  epilepsy, asthma, anemia, coagulationDisorder, autoimmune, cancer, other: string}
  systemicDiseases: jsonb("systemicDiseases"),

  // ── Lifestyle ────────────────────────────────────────────────────────────
  smoking: pg_smoking("smoking"),
  smokingPacksPerDay: numeric("smokingPacksPerDay", { precision: 3, scale: 1 }),
  alcohol: pg_alcohol("alcohol"),
  currentMedications: text("currentMedications"),
  allergies: text("allergies"),
  hirsutism: boolean("hirsutism").default(false),

  // ── Family History ───────────────────────────────────────────────────────
  consanguinity: boolean("consanguinity").default(false),
  hereditaryDiseases: text("hereditaryDiseases"),
  familyBreastCancer: boolean("familyBreastCancer").default(false),
  familyEarlyMenopause: boolean("familyEarlyMenopause").default(false),
  familyInfertility: boolean("familyInfertility").default(false),

  // ── Contraceptive History (JSON array) ────────────────────────────────────
  // [{method: string, duration: string, stoppedDate: string, notes: string}]
  contraceptiveHistory: jsonb("contraceptiveHistory"),

  // ── Male Intake (JSON — filled for male leads/patients) ──────────────────
  // {systemicDiseases: {...}, lifestyle: {...},
  //  semenAnalysis: [{date, volume, count, motility, morphology, result, fileKey, fileUrl, fileName}],
  //  hormonePanel: [{date, fsh, lh, testosterone, prolactin, tsh, other}],
  //  geneticTests: {karyotype: string, yDeletion: string, cfMutation: string},
  //  familyHistory: string, serology: string, additionalNotes: string}
  maleIntake: jsonb("maleIntake"),

  // ── Patient Questions (JSON array) ──────────────────────────────────────
  // [{id: string, question: string, askedBy: 'female'|'male'}]
  // Both female and male can add their own questions before the consultation
   patientQuestions: jsonb("patientQuestions"),
  // ── Doctor Answers (JSON) ─────────────────────────────────────────────────
  // { female: { [questionIndex]: string }, male: { [questionIndex]: string } }
  doctorAnswers: jsonb("doctorAnswers"),
  // ── Radiology & Imaging — Female (JSON array) ───────────────────────────
  // [{id, type: 'tvus'|'hsg'|'mri'|'ct'|'mammography'|'xray'|'other',
  //   date, performedBy, findings, conclusion,
  //   tvus: {uterusSize, uterusPosition, endometrialThickness, endometrialPattern,
  //          rightOvarySize, rightOvaryAFC, leftOvarySize, leftOvaryAFC, dominantFollicle},
  //   hsg: {uterineCavity, rightTubePatency, leftTubePatency},
  //   studyName (for other types),
  //   fileKey, fileUrl, fileName, docId,
  //   translations: {en: string, ar: string, tr: string} }]
  hasRadiologyStudies: boolean("hasRadiologyStudies").default(false),
  radiologyStudies: jsonb("radiologyStudies"),
  // ── Radiology & Imaging — Male (JSON array) ──────────────────────────────
  // [{id, type: 'scrotal'|'other', date, performedBy, findings, conclusion,
  //   scrotal: {rightTestisSize, leftTestisSize, epididymis, varicoceleGrade},
  //   studyName (for other),
  //   fileKey, fileUrl, fileName, docId,
  //   translations: {en: string, ar: string, tr: string} }]
  hasMaleRadiologyStudies: boolean("hasMaleRadiologyStudies").default(false),
  maleRadiologyStudies: jsonb("maleRadiologyStudies"),
  // ── General Attachments (JSON arrays of {fileKey, fileUrl, fileName, mimeType, tag, docPassword, docId}) ──
  generalAttachmentsFemale: jsonb("generalAttachmentsFemale"),
  generalAttachmentsMale: jsonb("generalAttachmentsMale"),
  // ── Female Genetic Tests (JSON array) ─────────────────────────────────────
  // [{test: string, date: string, result: string, notes: string,
  //   fileKey: string, fileUrl: string, fileName: string, filePassword: string, docId: number}]
  femaleGeneticTests: jsonb("femaleGeneticTests"),
  // ── General ──────────────────────────────────────────────────────────────
  additionalNotes: text("additionalNotes"),
  expectedVisitDate: timestamp("expectedVisitDate", { withTimezone: true, mode: "date" }),
  // Phase 1 — health record separation metadata
  personGender: pg_personGender("personGender"),
  maleIntakeMigrated: boolean("maleIntakeMigrated").default(false),
  maleIntakeMigratedAt: timestamp("maleIntakeMigratedAt", { withTimezone: true, mode: "date" }),
  maleIntakeMigratedBy: integer("maleIntakeMigratedBy"),
  // Phase 2 — intake mode: NULL = legacy (old two-tab layout), female/male/general = new workflow
  intakeMode: pg_intakeMode("intakeMode"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type MedicalIntake = typeof medicalIntake.$inferSelect;
export type InsertMedicalIntake = typeof medicalIntake.$inferInsert;

// ─── Treatment Packages ───────────────────────────────────────────────────────

export const treatmentPackages = pgTable("treatment_packages", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  services: jsonb("services"), // array of {serviceId, serviceName, quantity}
  // Local (Turkish) pricing × 4 currencies
  localPriceUSD: numeric("localPriceUSD", { precision: 10, scale: 2 }),
  localPriceEUR: numeric("localPriceEUR", { precision: 10, scale: 2 }),
  localPriceGBP: numeric("localPriceGBP", { precision: 10, scale: 2 }),
  localPriceTRY: numeric("localPriceTRY", { precision: 10, scale: 2 }),
  // International pricing × 4 currencies
  intlPriceUSD: numeric("intlPriceUSD", { precision: 10, scale: 2 }),
  intlPriceEUR: numeric("intlPriceEUR", { precision: 10, scale: 2 }),
  intlPriceGBP: numeric("intlPriceGBP", { precision: 10, scale: 2 }),
  intlPriceTRY: numeric("intlPriceTRY", { precision: 10, scale: 2 }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
   updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  code: varchar("code", { length: 32 }), // PKG-XXXXX — permanent, non-reusable
});
export type TreatmentPackage = typeof treatmentPackages.$inferSelect;
export type InsertTreatmentPackage = typeof treatmentPackages.$inferInsert;

// ─── Treatment Proposals ──────────────────────────────────────────────────────

export const treatmentProposals = pgTable("treatment_proposals", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  leadId: integer("leadId"),
  patientId: integer("patientId"),
  packageId: integer("packageId"),
  currency: pg_currency("currency").default("USD").notNull(),
  appliedPriceType: pg_appliedPriceType("appliedPriceType").default("international").notNull(),
  totalAmount: numeric("totalAmount", { precision: 10, scale: 2 }),
  customItems: jsonb("customItems"), // array of {description, amount} for manual additions
  aiSuggestion: text("aiSuggestion"),
  staffNotes: text("staffNotes"),
  status: pg_status_11("status").default("draft").notNull(),
  sentAt: timestamp("sentAt", { withTimezone: true, mode: "date" }),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  code: varchar("code", { length: 32 }), // PROP-XXXXX — permanent, non-reusable
});
export type TreatmentProposal = typeof treatmentProposals.$inferSelect;;
export type InsertTreatmentProposal = typeof treatmentProposals.$inferInsert;

// ─── Staff Permissions ────────────────────────────────────────────────────────

export const staffPermissions = pgTable("staff_permissions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  module: pg_module("module").notNull(),
  canView: boolean("canView").default(true).notNull(),
  canCreate: boolean("canCreate").default(false).notNull(),
  canEdit: boolean("canEdit").default(false).notNull(),
  canDelete: boolean("canDelete").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type StaffPermission = typeof staffPermissions.$inferSelect;
export type InsertStaffPermission = typeof staffPermissions.$inferInsert;

// ─── System Settings ──────────────────────────────────────────────────────────
// Key-value store for system-wide configuration (exchange rates, pricing rules, etc.)
export const systemSettings = pgTable("system_settings", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  key: varchar("key", { length: 128 }).notNull().unique(),
  value: text("value").notNull(),
  description: varchar("description", { length: 256 }),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  updatedBy: integer("updatedBy"),
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;

// ─── Google Calendar G1 Connection ───────────────────────────────────────────
// G1 intentionally stores only the clinic-level connection, destination calendar,
// and a transient non-clinical test-event reference. It never maps Fertiliv
// appointments, Leads, Patients, CRM Tasks, or clinical data to Google events.
export const googleCalendarConnections = pgTable("google_calendar_connections", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull().unique(),
  connectedAccountEmail: varchar("connectedAccountEmail", { length: 320 }).notNull(),
  encryptedRefreshToken: text("encryptedRefreshToken").notNull(),
  destinationCalendarId: varchar("destinationCalendarId", { length: 512 }),
  destinationCalendarName: varchar("destinationCalendarName", { length: 512 }),
  businessTimezone: varchar("businessTimezone", { length: 64 }).notNull().default("Europe/Istanbul"),
  status: pg_status_12("status").notNull().default("connected"),
  connectedByUserId: integer("connectedByUserId").notNull(),
  connectedAt: timestamp("connectedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  lastValidatedAt: timestamp("lastValidatedAt", { withTimezone: true, mode: "date" }),
  lastError: varchar("lastError", { length: 512 }),
  testEventId: varchar("testEventId", { length: 1024 }),
  testEventCalendarId: varchar("testEventCalendarId", { length: 512 }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type GoogleCalendarConnection = typeof googleCalendarConnections.$inferSelect;
export type InsertGoogleCalendarConnection = typeof googleCalendarConnections.$inferInsert;

// ─── Google Calendar G2 Appointment Mapping ──────────────────────────────────
// A durable, outbound-only representation of one Fertiliv appointment in Google.
// No Lead, Patient, note, or clinical data is stored here; identity remains in
// Fertiliv and Google only receives the privacy-minimized event projection.
export const googleCalendarAppointmentSyncs = pgTable("google_calendar_appointment_syncs", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  appointmentId: integer("appointmentId").notNull().unique(),
  provider: varchar("provider", { length: 32 }).notNull().default("google"),
  googleCalendarId: varchar("googleCalendarId", { length: 512 }),
  googleEventId: varchar("googleEventId", { length: 1024 }),
  operation: pg_operation("operation").notNull().default("upsert"),
  syncStatus: pg_syncStatus("syncStatus").notNull().default("pending"),
  payloadHash: varchar("payloadHash", { length: 64 }),
  googleEventHtmlLink: varchar("googleEventHtmlLink", { length: 2048 }),
  lastVerifiedEventAt: timestamp("lastVerifiedEventAt", { withTimezone: true, mode: "date" }),
  lastSyncedAt: timestamp("lastSyncedAt", { withTimezone: true, mode: "date" }),
  lastSyncError: varchar("lastSyncError", { length: 512 }),
  retryCount: integer("retryCount").notNull().default(0),
  nextRetryAt: timestamp("nextRetryAt", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type GoogleCalendarAppointmentSync = typeof googleCalendarAppointmentSyncs.$inferSelect;
export type InsertGoogleCalendarAppointmentSync = typeof googleCalendarAppointmentSyncs.$inferInsert;

// Single-use, hashed OAuth state records prevent callback replay and tie consent
// to the admin who initiated the connection without persisting raw state values.
export const googleCalendarOAuthStates = pgTable("google_calendar_oauth_states", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  stateHash: varchar("stateHash", { length: 64 }).notNull().unique(),
  userId: integer("userId").notNull(),
  expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type GoogleCalendarOAuthState = typeof googleCalendarOAuthStates.$inferSelect;

// ─── Clinic Information ───────────────────────────────────────────────────────
// Centralized clinic branding and contact details used across all documents
export const clinicInfo = pgTable("clinic_info", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  // Multilingual text fields
  nameEn: varchar("nameEn", { length: 256 }),
  nameAr: varchar("nameAr", { length: 256 }),
  nameTr: varchar("nameTr", { length: 256 }),
  sloganEn: varchar("sloganEn", { length: 512 }),
  sloganAr: varchar("sloganAr", { length: 512 }),
  sloganTr: varchar("sloganTr", { length: 512 }),
  addressEn: text("addressEn"),
  addressAr: text("addressAr"),
  addressTr: text("addressTr"),
  bioEn: text("bioEn"),
  bioAr: text("bioAr"),
  bioTr: text("bioTr"),
  // Contact details (single values)
  email: varchar("email", { length: 256 }),
  whatsapp: varchar("whatsapp", { length: 64 }),  // e.g. +905011147060
  website: varchar("website", { length: 512 }),
  mapsLink: text("mapsLink"),
  // Logo variants (S3 keys)
  logoEnLightKey: varchar("logoEnLightKey", { length: 512 }),  // EN/TR light background
  logoEnDarkKey: varchar("logoEnDarkKey", { length: 512 }),   // EN/TR dark background
  logoArLightKey: varchar("logoArLightKey", { length: 512 }),  // AR light background
  logoArDarkKey: varchar("logoArDarkKey", { length: 512 }),   // AR dark background
  // Stamp (S3 key)
  stampKey: varchar("stampKey", { length: 512 }),
  // Clinic-wide fallback used when a staff or doctor has no explicit weeklySchedule override.
  defaultWeeklySchedule: jsonb("defaultWeeklySchedule"),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  updatedBy: integer("updatedBy"),
});

export type ClinicInfo = typeof clinicInfo.$inferSelect;
export type InsertClinicInfo = typeof clinicInfo.$inferInsert;

// ─── Staff Availability / Time-Off ────────────────────────────────────────────
export const staffAvailability = pgTable("staff_availability", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  startDate: timestamp("startDate", { withTimezone: true, mode: "date" }).notNull(),
  endDate: timestamp("endDate", { withTimezone: true, mode: "date" }).notNull(),
  reason: pg_reason("reason").default("other").notNull(),
  notes: text("notes"),
  createdBy: integer("createdBy"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type StaffAvailability = typeof staffAvailability.$inferSelect;
export type InsertStaffAvailability = typeof staffAvailability.$inferInsert;

// ─── Patient Communications ───────────────────────────────────────────────────
// Mirrors leadCommunications — chronological log of staff notes/contacts per patient

export const patientCommunications = pgTable("patient_communications", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId").notNull(),
  note: text("note").notNull(),
  createdBy: integer("createdBy").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  // Audit columns added 2026-07-13 (nullable, reversible)
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }),
  updatedBy: integer("updatedBy"),
  deletedAt: timestamp("deletedAt", { withTimezone: true, mode: "date" }),
  deletedBy: integer("deletedBy"),
});

export type PatientCommunication = typeof patientCommunications.$inferSelect;
export type InsertPatientCommunication = typeof patientCommunications.$inferInsert;

// ─── Treatment Cycles (ART / IVF / IUI / OI) ─────────────────────────────────

export const treatmentCycles = pgTable("treatment_cycles", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId").notNull(),
  ivfNo: varchar("ivfNo", { length: 32 }), // clinic-assigned cycle number e.g. "IVF-001"
  cycleType: text("cycleType").notNull(), // JSON array e.g. '["ICSI","TESE"]' — merged cycle+procedure type
  protocol: pg_protocol("protocol"),
  status: pg_status_13("status").default("planned").notNull(),
  doctorId: integer("doctorId"),
  startDate: timestamp("startDate", { withTimezone: true, mode: "date" }),
  endDate: timestamp("endDate", { withTimezone: true, mode: "date" }),
  // Baseline D3 values
  d3Tsh: varchar("d3Tsh", { length: 32 }),
  d3Fsh: varchar("d3Fsh", { length: 32 }),
  d3Lh: varchar("d3Lh", { length: 32 }),
  d3E2: varchar("d3E2", { length: 32 }),
  d3Amh: varchar("d3Amh", { length: 32 }),
  d3Prl: varchar("d3Prl", { length: 32 }),
  d3Bmi: varchar("d3Bmi", { length: 16 }),
  // Infertility summary for this cycle
  infertilityDuration: varchar("infertilityDuration", { length: 64 }),
  infertilityReasonFemale: text("infertilityReasonFemale"),
  infertilityReasonMale: text("infertilityReasonMale"),
  // Procedure details (procedureType merged into cycleType multi-select)
  frozenTissue: boolean("frozenTissue").default(false),
  spermCount: varchar("spermCount", { length: 64 }),
  spermMotility: varchar("spermMotility", { length: 64 }),
  spermMorphology: varchar("spermMorphology", { length: 64 }),
  spermTmss: varchar("spermTmss", { length: 32 }),
  karyotype: varchar("karyotype", { length: 128 }),
  serology: text("serology"),
  previousTreatment: text("previousTreatment"),
  surgery: text("surgery"),
  // Adjuvant medications & procedures (free text)
  adjuvantMedications: text("adjuvantMedications"),
  notes: text("notes"),
  createdBy: integer("createdBy"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  code: varchar("code", { length: 32 }), // CYC-XXXXX — permanent, non-reusable
});
export type TreatmentCycle = typeof treatmentCycles.$inferSelect;;
export type InsertTreatmentCycle = typeof treatmentCycles.$inferInsert;

// ─── Cycle Monitoring Visits ──────────────────────────────────────────────────
// One row per monitoring visit during stimulation (follicle scan + hormones + meds)

export const cycleMonitoringVisits = pgTable("cycle_monitoring_visits", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  cycleId: integer("cycleId").notNull(),
  visitDate: timestamp("visitDate", { withTimezone: true, mode: "date" }).notNull(),
  cycleDay: integer("cycleDay"), // day of stimulation cycle
  doctorId: integer("doctorId"),
  // Hormone levels
  e2: varchar("e2", { length: 32 }),   // Estradiol pg/ml
  lh: varchar("lh", { length: 32 }),   // LH mIU/ml
  p4: varchar("p4", { length: 32 }),   // Progesterone
  // Endometrium
  endometriumMm: varchar("endometriumMm", { length: 16 }),
  // Follicle sizes — JSON arrays of numbers (mm)
  folliclesRight: jsonb("folliclesRight"), // e.g. [12, 14, 15, 16]
  folliclesLeft: jsonb("folliclesLeft"),   // e.g. [11, 13, 14]
  // Medications given this visit
  fshDose: varchar("fshDose", { length: 64 }),
  hmgDose: varchar("hmgDose", { length: 64 }),
  gnrhaDose: varchar("gnrhaDose", { length: 64 }),
  antagonistDose: varchar("antagonistDose", { length: 64 }),
  ccLetrDose: varchar("ccLetrDose", { length: 64 }),
  hcgDose: varchar("hcgDose", { length: 64 }),
  // Abstinence / other notes
  sexualAbstinence: varchar("sexualAbstinence", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type CycleMonitoringVisit = typeof cycleMonitoringVisits.$inferSelect;
export type InsertCycleMonitoringVisit = typeof cycleMonitoringVisits.$inferInsert;

// ─── Cycle Medications ────────────────────────────────────────────────────────
// Protocol medications prescribed for the cycle

export const cycleMedications = pgTable("cycle_medications", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  cycleId: integer("cycleId").notNull(),
  medicationName: varchar("medicationName", { length: 256 }).notNull(),
  dose: varchar("dose", { length: 64 }),
  frequency: varchar("frequency", { length: 128 }), // e.g. "Once daily at 9pm"
  route: varchar("route", { length: 64 }), // oral, injection, vaginal, etc.
  startDate: timestamp("startDate", { withTimezone: true, mode: "date" }),
  endDate: timestamp("endDate", { withTimezone: true, mode: "date" }),
  instructions: text("instructions"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type CycleMedication = typeof cycleMedications.$inferSelect;
export type InsertCycleMedication = typeof cycleMedications.$inferInsert;

// ─── Medication Adherence Log ─────────────────────────────────────────────────
// Patient confirms they took a medication — simple checkbox with timestamp

export const medicationAdherenceLog = pgTable("medication_adherence_log", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  cycleId: integer("cycleId").notNull(),
  medicationId: integer("medicationId").notNull(),
  patientId: integer("patientId").notNull(),
  scheduledDate: timestamp("scheduledDate", { withTimezone: true, mode: "date" }).notNull(), // which day this confirmation is for
  confirmedAt: timestamp("confirmedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(), // when patient confirmed
  confirmedByPatient: boolean("confirmedByPatient").default(true).notNull(),
  notes: text("notes"), // optional patient note
});

export type MedicationAdherenceLog = typeof medicationAdherenceLog.$inferSelect;
export type InsertMedicationAdherenceLog = typeof medicationAdherenceLog.$inferInsert;

// ─── Cycle Outcomes ───────────────────────────────────────────────────────────
// Final results of the ART cycle

export const cycleOutcomes = pgTable("cycle_outcomes", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  cycleId: integer("cycleId").notNull().unique(),
  totalOocytes: integer("totalOocytes"),
  matureOocytes: integer("matureOocytes"),  // MII
  fertilized: integer("fertilized"),
  blastocystCount: integer("blastocystCount"),
  transferred: integer("transferred"),
  cryopreserved: integer("cryopreserved"),
  embryoQuality: text("embryoQuality"), // free text description
  // Key ART dates
  triggerDate: timestamp("triggerDate", { withTimezone: true, mode: "date" }),
  opuDate: timestamp("opuDate", { withTimezone: true, mode: "date" }),
  transferDate: timestamp("transferDate", { withTimezone: true, mode: "date" }),
  // Pregnancy outcome
  hcgLevel: varchar("hcgLevel", { length: 32 }),
  pregnancyTestDate: timestamp("pregnancyTestDate", { withTimezone: true, mode: "date" }),
  result: pg_result("result"),
  notes: text("notes"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type CycleOutcome = typeof cycleOutcomes.$inferSelect;
export type InsertCycleOutcome = typeof cycleOutcomes.$inferInsert;

// ─── Clinic Tags ──────────────────────────────────────────────────────────────
// User-managed tag library — reusable across patients/leads
export const clinicTags = pgTable("clinic_tags", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 16 }).default("#6366f1").notNull(), // hex color
  createdByUserId: integer("createdByUserId"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type ClinicTag = typeof clinicTags.$inferSelect;
export type InsertClinicTag = typeof clinicTags.$inferInsert;

// ─── Specializations ──────────────────────────────────────────────────────────
// Centralized list of medical specializations used across doctors and medical notes
export const specializations = pgTable("specializations", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 128 }).notNull().unique(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type Specialization = typeof specializations.$inferSelect;
export type InsertSpecialization = typeof specializations.$inferInsert;

// ─── Sub-Specializations ─────────────────────────────────────────────────────
// Second-level specializations nested under a main specialization
export const subSpecializations = pgTable("sub_specializations", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  specializationId: integer("specializationId").notNull(), // FK to specializations
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type SubSpecialization = typeof subSpecializations.$inferSelect;
export type InsertSubSpecialization = typeof subSpecializations.$inferInsert;

// ─── Doctor Sub-Specializations (junction) ────────────────────────────────────
export const doctorSubSpecializations = pgTable("doctor_sub_specializations", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  doctorId: integer("doctorId").notNull(),
  subSpecializationId: integer("subSpecializationId").notNull(),
});
export type DoctorSubSpecialization = typeof doctorSubSpecializations.$inferSelect;

// ─── Document Translations ────────────────────────────────────────────────────
// Stores AI-generated translations of lab result files and external reports
export const documentTranslations = pgTable("document_translations", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId").notNull(),
  labResultId: integer("labResultId"),           // linked lab result (optional)
  originalFileUrl: text("originalFileUrl"),  // URL of the original document
  originalFileName: varchar("originalFileName", { length: 256 }),
  originalLanguage: varchar("originalLanguage", { length: 32 }),
  targetLanguage: varchar("targetLanguage", { length: 32 }).default("en").notNull(),
  translatedText: text("translatedText"),    // AI-translated content
  extractedText: text("extractedText"),      // OCR-extracted original text
  status: pg_status_14("status").default("pending").notNull(),
  errorMessage: text("errorMessage"),
  leadDocumentId: integer("leadDocumentId"),     // linked lead document (optional)
  translatedById: integer("translatedById"),     // user who triggered translation
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type DocumentTranslation = typeof documentTranslations.$inferSelect;
export type InsertDocumentTranslation = typeof documentTranslations.$inferInsert;

// ─── Payments ─────────────────────────────────────────────────────────────────
// Option C: separate payments table for full audit trail, partial payments, credit balance
export const payments = pgTable("payments", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId"),
  invoiceId: integer("invoiceId").notNull(),
  // Immutable inherited invoice scope. Client input is never authoritative.
  financialScope: pg_financialScope("financialScope").notNull().default("production"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: pg_currency_2("currency").default("TRY").notNull(),
  method: pg_method("method").default("cash").notNull(),
  // Exchange rate at the time of payment: 1 FOREIGN = X TRY (e.g. 1 EUR = 52.70 TRY)
  // For TRY payments this is always 1. Stored so historical recalculation uses the correct rate.
  exchangeRateAtPayment: numeric("exchangeRateAtPayment", { precision: 12, scale: 4 }).default("1").notNull(),
  // Immutable direct conversion used for this payment: 1 payment-currency unit = X invoice-currency units.
  // Example: TRY payment → USD invoice at 47.40 TRY/USD stores 0.021097046414.
  conversionRateToInvoice: numeric("conversionRateToInvoice", { precision: 20, scale: 12 }).notNull(),
  // Payment amount expressed in invoice currency before any payment-method adjustment.
  // This equals amount × conversionRateToInvoice rounded to invoice monetary precision (2dp).
  amountInInvoiceCurrency: numeric("amountInInvoiceCurrency", { precision: 18, scale: 2 }).notNull(),
  // Forward-only Bank Transfer audit facts. amount remains the net cash actually received
  // and is the sole input to FX conversion and invoice settlement. Historical rows remain NULL.
  bankGrossAmountSent: numeric("bankGrossAmountSent", { precision: 10, scale: 2 }),
  bankDeductionAmount: numeric("bankDeductionAmount", { precision: 10, scale: 2 }),
  bankDeductionPercent: numeric("bankDeductionPercent", { precision: 9, scale: 4 }),
  // Phase 2: persisted settlement amount in invoice currency.
  // For cash and Mode B (agreed): equals amountInInvoiceCurrency.
  // For Mode A non-cash (credit_card/bank_transfer): amountInInvoiceCurrency / (1 + adjustmentRate/100).
  // Stored at payment creation time using the invoice's snapshotted rate — never recomputed from live settings.
  settledAmount: numeric("settledAmount", { precision: 10, scale: 2 }).notNull().default("0"),
  // Payment Void: payment rows are immutable financial history. A void preserves the original
  // payment and excludes it from financial calculations without treating it as a refund.
  status: pg_status_15("status").notNull().default("active"),
  voidedAt: timestamp("voidedAt", { withTimezone: true, mode: "date" }),
  voidedById: integer("voidedById"),
  voidReason: text("voidReason"),
  recordedById: integer("recordedById").notNull(),
  notes: text("notes"),
  // Actual time money was received. Required for newly recorded payments, but nullable
  // for historical rows whose true transaction time was never captured.
  receivedAt: timestamp("receivedAt", { withTimezone: true, mode: "date" }),
  // Immutable effective time of the approved FX observation used for this payment.
  // Historical rows remain NULL rather than inventing an FX observation date.
  fxEffectiveAt: timestamp("fxEffectiveAt", { withTimezone: true, mode: "date" }),
  // Optional audit metadata for new cross-currency payment snapshots. Historical
  // rows deliberately remain NULL; no source or note is invented by a backfill.
  fxRateSource: pg_fxRateSource("fxRateSource"),
  fxRateNote: text("fxRateNote"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type Payment = typeof payments.$inferSelect;
export type InsertPayment = typeof payments.$inferInsert;

// ─── Invoice Settlements ──────────────────────────────────────────────────────
// A settlement allocates either a physical payment receipt or Patient Credit to
// one invoice. Receipts and allocations remain separate financial facts.
export const invoiceSettlements = pgTable("invoice_settlements", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId").notNull(),
  invoiceId: integer("invoiceId").notNull(),
  financialScope: pg_financialScope("financialScope").notNull().default("production"),
  currency: pg_currency_2("currency").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  sourceType: pg_sourceType("sourceType").notNull(),
  paymentId: integer("paymentId"),
  creditTransactionId: integer("creditTransactionId"),
  // Durable parent for new Patient Credit applications. Historical rows remain
  // null and are never inferred or rewritten during migration.
  patientCreditApplicationId: integer("patientCreditApplicationId"),
  // Cross-currency credit provenance. Null for payment and same-currency credit settlements.
  sourceCreditCurrency: pg_sourceCreditCurrency("sourceCreditCurrency"),
  sourceCreditAmount: numeric("sourceCreditAmount", { precision: 10, scale: 2 }),
  creditConversionRateToInvoice: numeric("creditConversionRateToInvoice", { precision: 20, scale: 12 }),
  creditFxEffectiveAt: timestamp("creditFxEffectiveAt", { withTimezone: true, mode: "date" }),
  creditFxSource: varchar("creditFxSource", { length: 64 }),
  // Explicit non-cash closure when cross-currency credit precision leaves an
  // unavoidable residual below one source-currency minor unit at locked FX.
  fxRoundingReason: varchar("fxRoundingReason", { length: 256 }),
  fxRoundingSourceMinorUnit: numeric("fxRoundingSourceMinorUnit", { precision: 10, scale: 2 }),
  status: pg_status_15("status").notNull().default("active"),
  voidedAt: timestamp("voidedAt", { withTimezone: true, mode: "date" }),
  voidedById: integer("voidedById"),
  voidReason: text("voidReason"),
  recordedById: integer("recordedById").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type InvoiceSettlement = typeof invoiceSettlements.$inferSelect;
export type InsertInvoiceSettlement = typeof invoiceSettlements.$inferInsert;

// ─── Proposal Items ───────────────────────────────────────────────────────────
// Multi-service line items for treatment proposals
export const proposalItems = pgTable("proposal_items", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  proposalId: integer("proposalId").notNull(),
  serviceId: integer("serviceId"),
  description: varchar("description", { length: 256 }).notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPrice: numeric("unitPrice", { precision: 10, scale: 2 }).notNull(),
  discount: numeric("discount", { precision: 10, scale: 2 }).default("0"),
  totalPrice: numeric("totalPrice", { precision: 10, scale: 2 }).notNull(),
});

export type ProposalItem = typeof proposalItems.$inferSelect;
export type InsertProposalItem = typeof proposalItems.$inferInsert;

// ─── WhatsApp Phase 1 Connections & Provider Events ──────────────────────────
// Phase 1 is deliberately connection/event-only. It does not create a
// Conversation, person-resolution, or clinical-document authority.
export const whatsappConnections = pgTable("whatsapp_connections", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  // Existing Fertiliv clinic scope only; this is not SaaS tenancy.
  clinicScope: varchar("clinicScope", { length: 64 }).notNull().default("fertiliv"),
  provider: pg_provider("provider").notNull().default("meta"),
  onboardingMethod: pg_onboardingMethod("onboardingMethod").notNull(),
  // Provider identity is the durable no-duplicate key. Display numbers are not
  // sufficient evidence for automatic connection merge.
  providerPhoneNumberId: varchar("providerPhoneNumberId", { length: 128 }).notNull(),
  wabaId: varchar("wabaId", { length: 128 }),
  businessPortfolioId: varchar("businessPortfolioId", { length: 128 }),
  displayPhone: varchar("displayPhone", { length: 32 }),
  normalizedDisplayPhone: varchar("normalizedDisplayPhone", { length: 32 }),
  displayName: varchar("displayName", { length: 256 }),
  providerMetadata: jsonb("providerMetadata"),
  // Only a server-side reference is stored. Raw tokens and app secrets never
  // belong in this table or in client state.
  credentialSource: pg_credentialSource("credentialSource").notNull(),
  credentialRef: varchar("credentialRef", { length: 512 }).notNull(),
  lifecycleStatus: pg_lifecycleStatus_2("lifecycleStatus").notNull().default("onboarding"),
  providerStateSnapshot: jsonb("providerStateSnapshot"),
  healthState: pg_healthState("healthState").notNull().default("unknown"),
  lastHealthCheckedAt: timestamp("lastHealthCheckedAt", { withTimezone: true, mode: "date" }),
  lastInboundEventAt: timestamp("lastInboundEventAt", { withTimezone: true, mode: "date" }),
  lastOutboundAcceptedAt: timestamp("lastOutboundAcceptedAt", { withTimezone: true, mode: "date" }),
  lastProviderStatusAt: timestamp("lastProviderStatusAt", { withTimezone: true, mode: "date" }),
  lastTransitionAt: timestamp("lastTransitionAt", { withTimezone: true, mode: "date" }),
  createdById: integer("createdById"),
  updatedById: integer("updatedById"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_connections_provider_phone_uq").on(table.provider, table.providerPhoneNumberId),
  index("whatsapp_connections_waba_phone_ix").on(table.wabaId, table.providerPhoneNumberId),
  index("whatsapp_connections_scope_display_phone_ix").on(table.clinicScope, table.normalizedDisplayPhone),
]);
export type WhatsAppConnection = typeof whatsappConnections.$inferSelect;
export type InsertWhatsAppConnection = typeof whatsappConnections.$inferInsert;

// WU-09 Embedded Signup attempt state. This stores only bounded, sanitized
// lifecycle metadata; the short-lived authorization code is never persisted.
export const whatsappEmbeddedSignupSessions = pgTable("whatsapp_embedded_signup_sessions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  requestId: varchar("requestId", { length: 64 }).notNull().unique(),
  startedById: integer("startedById").notNull(),
  state: pg_state("state").notNull().default("started"),
  completionEvent: varchar("completionEvent", { length: 80 }),
  currentStep: varchar("currentStep", { length: 80 }),
  failureCategory: varchar("failureCategory", { length: 80 }),
  providerWabaId: varchar("providerWabaId", { length: 128 }),
  providerPhoneNumberId: varchar("providerPhoneNumberId", { length: 128 }),
  providerBusinessPortfolioId: varchar("providerBusinessPortfolioId", { length: 128 }),
  authorizationCodeDigest: varchar("authorizationCodeDigest", { length: 64 }).unique(),
  connectionId: integer("connectionId"),
  expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
  completedAt: timestamp("completedAt", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("whatsapp_embedded_signup_sessions_state_created_ix").on(table.state, table.createdAt),
  index("whatsapp_embedded_signup_sessions_provider_identity_ix").on(table.providerWabaId, table.providerPhoneNumberId),
]);
export type WhatsAppEmbeddedSignupSession = typeof whatsappEmbeddedSignupSessions.$inferSelect;
export type InsertWhatsAppEmbeddedSignupSession = typeof whatsappEmbeddedSignupSessions.$inferInsert;

// WU-09 connection-specific business token. The raw token is never stored;
// app-level secret and webhook verify token remain project-level environment
// secrets and never appear in this table.
export const whatsappConnectionCredentials = pgTable("whatsapp_connection_credentials", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  connectionId: integer("connectionId").notNull().unique(),
  credentialKind: pg_credentialKind("credentialKind").notNull().default("business_access_token"),
  encryptedCredential: text("encryptedCredential").notNull(),
  encryptionVersion: varchar("encryptionVersion", { length: 16 }).notNull().default("v1"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  lastValidatedAt: timestamp("lastValidatedAt", { withTimezone: true, mode: "date" }),
}, (table) => [
  index("whatsapp_connection_credentials_kind_ix").on(table.credentialKind, table.updatedAt),
]);
export type WhatsAppConnectionCredential = typeof whatsappConnectionCredentials.$inferSelect;
export type InsertWhatsAppConnectionCredential = typeof whatsappConnectionCredentials.$inferInsert;

// Append-only transition metadata. The credential values remain behind their
// references; this table records only auditable method/source change facts.
export const whatsappConnectionTransitions = pgTable("whatsapp_connection_transitions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  connectionId: integer("connectionId").notNull(),
  fromOnboardingMethod: pg_fromOnboardingMethod("fromOnboardingMethod"),
  toOnboardingMethod: pg_toOnboardingMethod("toOnboardingMethod").notNull(),
  fromCredentialSource: pg_fromCredentialSource("fromCredentialSource"),
  toCredentialSource: pg_toCredentialSource("toCredentialSource").notNull(),
  transitionReason: varchar("transitionReason", { length: 128 }).notNull(),
  transitionedById: integer("transitionedById"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("whatsapp_connection_transitions_connection_ix").on(table.connectionId, table.createdAt),
]);
export type WhatsAppConnectionTransition = typeof whatsappConnectionTransitions.$inferSelect;
export type InsertWhatsAppConnectionTransition = typeof whatsappConnectionTransitions.$inferInsert;

// ─── WhatsApp Linked Device Foundation ───────────────────────────────────────
// This provider-neutral foundation deliberately remains separate from the live
// Meta connection route. It has no QR payload column and no raw session state.
// A later, approved adapter may bind a line to a normalized WhatsApp connection
// only after its provider mechanism and clinical-compliance posture are accepted.
export const whatsappLinkedDeviceLines = pgTable("whatsapp_linked_device_lines", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  clinicScope: varchar("clinicScope", { length: 64 }).notNull().default("fertiliv"),
  lineName: varchar("lineName", { length: 128 }).notNull(),
  connectionId: integer("connectionId"),
  providerApprovalState: pg_providerApprovalState("providerApprovalState").notNull().default("blocked"),
  adapterKind: varchar("adapterKind", { length: 64 }).notNull().default("unselected"),
  lifecycleState: pg_lifecycleState("lifecycleState").notNull().default("not_started"),
  healthState: pg_healthState("healthState").notNull().default("unknown"),
  displayPhone: varchar("displayPhone", { length: 32 }),
  normalizedDisplayPhone: varchar("normalizedDisplayPhone", { length: 32 }),
  connectedAt: timestamp("connectedAt", { withTimezone: true, mode: "date" }),
  lastSeenAt: timestamp("lastSeenAt", { withTimezone: true, mode: "date" }),
  lastSuccessfulSyncAt: timestamp("lastSuccessfulSyncAt", { withTimezone: true, mode: "date" }),
  disconnectedAt: timestamp("disconnectedAt", { withTimezone: true, mode: "date" }),
  // Gold standalone WhatsApp Engine ownership boundary. Administrators retain
  // full access; explicitly granted staff are represented in the existing line
  // staff table and no CRM/clinical identity is inferred from these fields.
  ownerUserId: integer("ownerUserId"),
  ownerRole: varchar("ownerRole", { length: 32 }),
  createdById: integer("createdById").notNull(),
  updatedById: integer("updatedById"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_linked_device_lines_scope_name_uq").on(table.clinicScope, table.lineName),
  index("whatsapp_linked_device_lines_connection_ix").on(table.connectionId),
  index("whatsapp_linked_device_lines_owner_ix").on(table.ownerUserId, table.lifecycleState),
  index("whatsapp_linked_device_lines_state_ix").on(table.lifecycleState, table.updatedAt),
]);
export type WhatsAppLinkedDeviceLine = typeof whatsappLinkedDeviceLines.$inferSelect;
export type InsertWhatsAppLinkedDeviceLine = typeof whatsappLinkedDeviceLines.$inferInsert;

// A line-specific access list reuses the existing user identity and role model.
// It does not create a second staff-role system.
export const whatsappLinkedDeviceLineStaff = pgTable("whatsapp_linked_device_line_staff", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  lineId: integer("lineId").notNull(),
  userId: integer("userId").notNull(),
  grantedById: integer("grantedById").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_linked_device_line_staff_uq").on(table.lineId, table.userId),
  index("whatsapp_linked_device_line_staff_user_ix").on(table.userId, table.lineId),
]);
export type WhatsAppLinkedDeviceLineStaff = typeof whatsappLinkedDeviceLineStaff.$inferSelect;
export type InsertWhatsAppLinkedDeviceLineStaff = typeof whatsappLinkedDeviceLineStaff.$inferInsert;

// Explicit allowlist for non-production synthetic recipients. This is never a
// production patient-messaging policy; it only gates the WPPConnect sandbox.
export const whatsappSyntheticTestRecipients = pgTable("whatsapp_synthetic_test_recipients", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  clinicScope: varchar("clinicScope", { length: 64 }).notNull().default("fertiliv"),
  lineId: integer("lineId").notNull(),
  normalizedPhone: varchar("normalizedPhone", { length: 16 }).notNull(),
  label: varchar("label", { length: 128 }),
  status: pg_status_16("status").notNull().default("active"),
  approvedById: integer("approvedById").notNull(),
  approvedAt: timestamp("approvedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  revokedById: integer("revokedById"),
  revokedAt: timestamp("revokedAt", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_synthetic_test_recipients_line_phone_uq").on(table.lineId, table.normalizedPhone),
  index("whatsapp_synthetic_test_recipients_line_status_ix").on(table.lineId, table.status, table.updatedAt),
]);
export type WhatsAppSyntheticTestRecipient = typeof whatsappSyntheticTestRecipients.$inferSelect;
export type InsertWhatsAppSyntheticTestRecipient = typeof whatsappSyntheticTestRecipients.$inferInsert;

// Session records contain lifecycle/diagnostic metadata only. QR content is
// intentionally never represented in this schema and cannot be persisted here.
export const whatsappLinkedDeviceSessions = pgTable("whatsapp_linked_device_sessions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  lineId: integer("lineId").notNull(),
  state: pg_state_2("state").notNull().default("not_started"),
  failureCategory: varchar("failureCategory", { length: 80 }),
  sessionName: varchar("sessionName", { length: 128 }),
  // Runtime ownership belongs to the disposable session, never to the
  // persistent Fertiliv line or to a WhatsApp identity.
  runtimeSlot: varchar("runtimeSlot", { length: 64 }),
  runtimeEndpoint: varchar("runtimeEndpoint", { length: 512 }),
  runtimeMode: pg_runtimeMode("runtimeMode"),
  runtimeGeneration: varchar("runtimeGeneration", { length: 64 }),
  runtimeProfileRef: varchar("runtimeProfileRef", { length: 512 }),
  runtimeAllocatedAt: timestamp("runtimeAllocatedAt", { withTimezone: true, mode: "date" }),
  runtimeReleasedAt: timestamp("runtimeReleasedAt", { withTimezone: true, mode: "date" }),
  providerAccountHint: varchar("providerAccountHint", { length: 64 }),
  providerPushName: varchar("providerPushName", { length: 128 }),
  providerPlatform: varchar("providerPlatform", { length: 64 }),
  reconnectCount: integer("reconnectCount").default(0).notNull(),
  lastActivityAt: timestamp("lastActivityAt", { withTimezone: true, mode: "date" }),
  lastHealthCheckedAt: timestamp("lastHealthCheckedAt", { withTimezone: true, mode: "date" }),
  lastErrorCategory: varchar("lastErrorCategory", { length: 128 }),
  lastErrorAt: timestamp("lastErrorAt", { withTimezone: true, mode: "date" }),
  lastRequestedAt: timestamp("lastRequestedAt", { withTimezone: true, mode: "date" }),
  lastStateChangedAt: timestamp("lastStateChangedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  createdById: integer("createdById").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_linked_device_sessions_line_uq").on(table.lineId),
  index("whatsapp_linked_device_sessions_state_ix").on(table.state, table.updatedAt),
]);
export type WhatsAppLinkedDeviceSession = typeof whatsappLinkedDeviceSessions.$inferSelect;
export type InsertWhatsAppLinkedDeviceSession = typeof whatsappLinkedDeviceSessions.$inferInsert;

// Reserved for a later approved adapter. Any credential envelope must be
// encrypted server-side with the existing credential crypto boundary; raw
// session secrets, QR payloads, and vendor tokens are never browser-visible.
export const whatsappLinkedDeviceCredentials = pgTable("whatsapp_linked_device_credentials", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  lineId: integer("lineId").notNull().unique(),
  credentialKind: varchar("credentialKind", { length: 64 }).notNull(),
  encryptedCredential: text("encryptedCredential").notNull(),
  encryptionVersion: varchar("encryptionVersion", { length: 16 }).notNull().default("v1"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  lastValidatedAt: timestamp("lastValidatedAt", { withTimezone: true, mode: "date" }),
}, (table) => [
  index("whatsapp_linked_device_credentials_kind_ix").on(table.credentialKind, table.updatedAt),
]);
export type WhatsAppLinkedDeviceCredential = typeof whatsappLinkedDeviceCredentials.$inferSelect;
export type InsertWhatsAppLinkedDeviceCredential = typeof whatsappLinkedDeviceCredentials.$inferInsert;

// Gold WhatsApp Engine selected-chat boundary. Discoverable provider chats are
// never persisted here until an authorized staff member explicitly selects one.
// These remain communication/transport records; they never create or link CRM
// or clinical identities automatically.
export const whatsappAllowedChats = pgTable("whatsapp_allowed_chats", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  lineId: integer("lineId").notNull(),
  externalChatId: varchar("externalChatId", { length: 191 }).notNull(),
  phone: varchar("phone", { length: 32 }).notNull(),
  name: varchar("name", { length: 256 }),
  enabled: boolean("enabled").notNull().default(true),
  addedById: integer("addedById").notNull(),
  lastSyncedAt: timestamp("lastSyncedAt", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_allowed_chats_line_chat_uq").on(table.lineId, table.externalChatId),
  index("whatsapp_allowed_chats_line_enabled_ix").on(table.lineId, table.enabled, table.updatedAt),
]);
export type WhatsAppAllowedChat = typeof whatsappAllowedChats.$inferSelect;
export type InsertWhatsAppAllowedChat = typeof whatsappAllowedChats.$inferInsert;

// Gold WhatsApp Engine transport messages. The compound key is deliberately
// line-scoped because WPPConnect provider message IDs are not global. This is
// intentionally independent of Unified Inbox until a later approved bridge.
export const whatsappLinkedDeviceMessages = pgTable("whatsapp_linked_device_messages", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  lineId: integer("lineId").notNull(),
  allowedChatId: integer("allowedChatId").notNull(),
  ownerUserId: integer("ownerUserId").notNull(),
  externalMessageId: varchar("externalMessageId", { length: 191 }).notNull(),
  direction: pg_direction("direction").notNull(),
  messageType: varchar("messageType", { length: 64 }).notNull().default("chat"),
  text: text("text"),
  mediaUrl: text("mediaUrl"),
  mediaMetadata: jsonb("mediaMetadata"),
  sentByMe: boolean("sentByMe").notNull().default(false),
  deliveryStatus: varchar("deliveryStatus", { length: 64 }),
  messageTimestamp: timestamp("messageTimestamp", { withTimezone: true, mode: "date" }).notNull(),
  rawMetadata: jsonb("rawMetadata"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_linked_messages_line_external_uq").on(table.lineId, table.externalMessageId),
  index("whatsapp_linked_messages_chat_time_ix").on(table.allowedChatId, table.messageTimestamp),
  index("whatsapp_linked_messages_owner_time_ix").on(table.ownerUserId, table.messageTimestamp),
]);
export type WhatsAppLinkedDeviceMessage = typeof whatsappLinkedDeviceMessages.$inferSelect;
export type InsertWhatsAppLinkedDeviceMessage = typeof whatsappLinkedDeviceMessages.$inferInsert;

// Outbound attempt ledger. This records selected connection, authenticated
// actor, intent digest, idempotency, and provider acceptance without claiming
// delivery before a later provider status event is processed.
export const whatsappSendAttempts = pgTable("whatsapp_send_attempts", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  conversationId: integer("conversationId"),
  connectionId: integer("connectionId"),
  connectionRoute: pg_connectionRoute("connectionRoute").notNull(),
  provider: pg_provider("provider").notNull().default("meta"),
  providerPhoneNumberId: varchar("providerPhoneNumberId", { length: 128 }).notNull(),
  actorUserId: integer("actorUserId"),
  recipientEndpoint: varchar("recipientEndpoint", { length: 64 }).notNull(),
  intentType: pg_intentType("intentType").notNull(),
  payloadDigest: varchar("payloadDigest", { length: 64 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull(),
  clientActionId: varchar("clientActionId", { length: 64 }),
  correlationId: varchar("correlationId", { length: 64 }),
  lineId: integer("lineId"),
  sessionName: varchar("sessionName", { length: 64 }),
  runtimeEndpointHost: varchar("runtimeEndpointHost", { length: 255 }),
  runtimeMode: pg_runtimeMode("runtimeMode"),
  runtimeGateValue: boolean("runtimeGateValue"),
  approvalSecretSelector: varchar("approvalSecretSelector", { length: 64 }),
  approvalProofVersion: integer("approvalProofVersion"),
  approvalExpiryState: varchar("approvalExpiryState", { length: 32 }),
  recipientFingerprint: varchar("recipientFingerprint", { length: 64 }),
  approvalReason: varchar("approvalReason", { length: 64 }),
  attemptState: pg_attemptState("attemptState").notNull().default("pending"),
  providerMessageId: varchar("providerMessageId", { length: 128 }),
  failureCategory: varchar("failureCategory", { length: 64 }),
  diagnosticStage: varchar("diagnosticStage", { length: 32 }),
  diagnosticProbe: varchar("diagnosticProbe", { length: 64 }),
  diagnosticOutcome: varchar("diagnosticOutcome", { length: 96 }),
  diagnosticAt: timestamp("diagnosticAt", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  acceptedAt: timestamp("acceptedAt", { withTimezone: true, mode: "date" }),
  completedAt: timestamp("completedAt", { withTimezone: true, mode: "date" }),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_send_attempts_idempotency_uq").on(table.idempotencyKey),
  index("whatsapp_send_attempts_conversation_ix").on(table.conversationId, table.createdAt),
  index("whatsapp_send_attempts_provider_message_ix").on(table.provider, table.providerMessageId),
  index("whatsapp_send_attempts_connection_created_ix").on(table.connectionId, table.createdAt),
  index("whatsapp_send_attempts_client_action_ix").on(table.clientActionId, table.createdAt),
  index("whatsapp_send_attempts_correlation_ix").on(table.correlationId, table.createdAt),
]);
export type WhatsAppSendAttempt = typeof whatsappSendAttempts.$inferSelect;
export type InsertWhatsAppSendAttempt = typeof whatsappSendAttempts.$inferInsert;

// One authenticated raw webhook request is retained exactly once as a batch.
// Phase 1 records this evidence without normalizing it into Messages.
export const whatsappProviderEventBatches = pgTable("whatsapp_provider_event_batches", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  provider: pg_provider("provider").notNull().default("meta"),
  rawPayloadDigest: varchar("rawPayloadDigest", { length: 64 }).notNull(),
  rawPayload: text("rawPayload").notNull(),
  signatureValid: boolean("signatureValid").notNull().default(false),
  receivedAt: timestamp("receivedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  lastReceivedAt: timestamp("lastReceivedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_provider_event_batches_payload_uq").on(table.provider, table.rawPayloadDigest),
]);
export type WhatsAppProviderEventBatch = typeof whatsappProviderEventBatches.$inferSelect;
export type InsertWhatsAppProviderEventBatch = typeof whatsappProviderEventBatches.$inferInsert;

// One retained provider change per batch. It carries routing and processing
// state only; Message/Conversation normalization is intentionally deferred.
export const whatsappProviderEvents = pgTable("whatsapp_provider_events", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  batchId: integer("batchId").notNull(),
  connectionId: integer("connectionId"),
  connectionRoute: pg_connectionRoute("connectionRoute"),
  provider: pg_provider("provider").notNull().default("meta"),
  wabaId: varchar("wabaId", { length: 128 }),
  providerPhoneNumberId: varchar("providerPhoneNumberId", { length: 128 }),
  providerField: varchar("providerField", { length: 128 }).notNull(),
  providerEventKey: varchar("providerEventKey", { length: 128 }).notNull(),
  routingState: pg_routingState("routingState").notNull(),
  processingState: pg_processingState("processingState").notNull().default("received"),
  failureCategory: varchar("failureCategory", { length: 64 }),
  receivedAt: timestamp("receivedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  processedAt: timestamp("processedAt", { withTimezone: true, mode: "date" }),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_provider_events_provider_key_uq").on(table.provider, table.providerEventKey),
  index("whatsapp_provider_events_state_received_ix").on(table.processingState, table.receivedAt),
  index("whatsapp_provider_events_connection_received_ix").on(table.connectionId, table.receivedAt),
]);
export type WhatsAppProviderEvent = typeof whatsappProviderEvents.$inferSelect;
export type InsertWhatsAppProviderEvent = typeof whatsappProviderEvents.$inferInsert;

// ─── WhatsApp WU-05 Normalized Provider Evidence ─────────────────────────────
// These are immutable provider-shaped projections. They preserve source-event
// and connection provenance, but carry no Patient/Lead/Conversation authority.
export const whatsappNormalizedMessages = pgTable("whatsapp_normalized_messages", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  sourceEventId: integer("sourceEventId").notNull(),
  connectionId: integer("connectionId"),
  connectionRoute: pg_connectionRoute("connectionRoute"),
  provider: pg_provider("provider").notNull().default("meta"),
  wabaId: varchar("wabaId", { length: 128 }),
  providerPhoneNumberId: varchar("providerPhoneNumberId", { length: 128 }),
  providerMessageId: varchar("providerMessageId", { length: 128 }),
  providerItemKey: varchar("providerItemKey", { length: 128 }).notNull(),
  providerSenderId: varchar("providerSenderId", { length: 128 }),
  providerRecipientId: varchar("providerRecipientId", { length: 128 }),
  providerTimestamp: timestamp("providerTimestamp", { withTimezone: true, mode: "date" }),
  providerDirection: pg_providerDirection("providerDirection").notNull(),
  messageType: varchar("messageType", { length: 64 }).notNull(),
  textBody: text("textBody"),
  normalizedContent: jsonb("normalizedContent"),
  normalizationVersion: varchar("normalizationVersion", { length: 32 }).notNull(),
  normalizationState: pg_normalizationState("normalizationState").notNull(),
  failureCategory: varchar("failureCategory", { length: 64 }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_normalized_messages_provider_item_uq").on(table.provider, table.providerItemKey),
  index("whatsapp_normalized_messages_source_event_ix").on(table.sourceEventId),
  index("whatsapp_normalized_messages_provider_message_ix").on(table.provider, table.providerMessageId),
  index("whatsapp_normalized_messages_connection_time_ix").on(table.connectionId, table.providerTimestamp),
]);
export type WhatsAppNormalizedMessage = typeof whatsappNormalizedMessages.$inferSelect;
export type InsertWhatsAppNormalizedMessage = typeof whatsappNormalizedMessages.$inferInsert;

export const whatsappNormalizedStatuses = pgTable("whatsapp_normalized_statuses", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  sourceEventId: integer("sourceEventId").notNull(),
  connectionId: integer("connectionId"),
  connectionRoute: pg_connectionRoute("connectionRoute"),
  provider: pg_provider("provider").notNull().default("meta"),
  wabaId: varchar("wabaId", { length: 128 }),
  providerPhoneNumberId: varchar("providerPhoneNumberId", { length: 128 }),
  providerStatusId: varchar("providerStatusId", { length: 128 }),
  providerStatusKey: varchar("providerStatusKey", { length: 128 }).notNull(),
  providerMessageId: varchar("providerMessageId", { length: 128 }),
  providerRecipientId: varchar("providerRecipientId", { length: 128 }),
  providerTimestamp: timestamp("providerTimestamp", { withTimezone: true, mode: "date" }),
  statusValue: varchar("statusValue", { length: 64 }).notNull(),
  errorCode: varchar("errorCode", { length: 64 }),
  errorTitle: varchar("errorTitle", { length: 256 }),
  normalizationVersion: varchar("normalizationVersion", { length: 32 }).notNull(),
  normalizationState: pg_normalizationState("normalizationState").notNull(),
  failureCategory: varchar("failureCategory", { length: 64 }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_normalized_statuses_provider_key_uq").on(table.provider, table.providerStatusKey),
  index("whatsapp_normalized_statuses_source_event_ix").on(table.sourceEventId),
  index("whatsapp_normalized_statuses_provider_message_ix").on(table.provider, table.providerMessageId),
  index("whatsapp_normalized_statuses_connection_time_ix").on(table.connectionId, table.providerTimestamp),
]);
export type WhatsAppNormalizedStatus = typeof whatsappNormalizedStatuses.$inferSelect;
export type InsertWhatsAppNormalizedStatus = typeof whatsappNormalizedStatuses.$inferInsert;

export const whatsappNormalizedMedia = pgTable("whatsapp_normalized_media", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  sourceEventId: integer("sourceEventId").notNull(),
  connectionId: integer("connectionId"),
  connectionRoute: pg_connectionRoute("connectionRoute"),
  provider: pg_provider("provider").notNull().default("meta"),
  wabaId: varchar("wabaId", { length: 128 }),
  providerPhoneNumberId: varchar("providerPhoneNumberId", { length: 128 }),
  sourceMessageItemKey: varchar("sourceMessageItemKey", { length: 128 }).notNull(),
  providerMediaItemKey: varchar("providerMediaItemKey", { length: 128 }).notNull(),
  providerMediaId: varchar("providerMediaId", { length: 128 }),
  mediaType: varchar("mediaType", { length: 64 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  sha256: varchar("sha256", { length: 128 }),
  filename: varchar("filename", { length: 512 }),
  caption: text("caption"),
  mediaState: pg_mediaState("mediaState").notNull(),
  failureCategory: varchar("failureCategory", { length: 64 }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_normalized_media_provider_item_uq").on(table.provider, table.providerMediaItemKey),
  index("whatsapp_normalized_media_source_event_ix").on(table.sourceEventId),
  index("whatsapp_normalized_media_provider_id_ix").on(table.provider, table.providerMediaId),
]);
export type WhatsAppNormalizedMedia = typeof whatsappNormalizedMedia.$inferSelect;
export type InsertWhatsAppNormalizedMedia = typeof whatsappNormalizedMedia.$inferInsert;

// ─── WhatsApp WU-06 Endpoint / Person Resolution ─────────────────────────────
// WU-06 keeps transport endpoints separate from people and business records.
// Candidate rows may reference existing Lead/Patient records, but no workflow
// entity is created or mutated by webhook resolution.
export const whatsappCommunicationEndpoints = pgTable("whatsapp_communication_endpoints", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  clinicScope: varchar("clinicScope", { length: 64 }).notNull().default("fertiliv"),
  connectionId: integer("connectionId"),
  connectionRoute: pg_connectionRoute("connectionRoute"),
  provider: pg_provider("provider").notNull().default("meta"),
  providerPhoneNumberId: varchar("providerPhoneNumberId", { length: 128 }).notNull(),
  providerEndpointId: varchar("providerEndpointId", { length: 128 }).notNull(),
  endpointKind: pg_endpointKind("endpointKind").notNull().default("phone"),
  normalizedEndpointId: varchar("normalizedEndpointId", { length: 128 }),
  lifecycleState: pg_lifecycleState_2("lifecycleState").notNull().default("active"),
  firstSeenAt: timestamp("firstSeenAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_endpoints_provider_phone_endpoint_uq").on(table.provider, table.providerPhoneNumberId, table.providerEndpointId),
  index("whatsapp_endpoints_normalized_endpoint_ix").on(table.provider, table.normalizedEndpointId),
  index("whatsapp_endpoints_connection_ix").on(table.connectionId, table.lastSeenAt),
]);
export type WhatsAppCommunicationEndpoint = typeof whatsappCommunicationEndpoints.$inferSelect;
export type InsertWhatsAppCommunicationEndpoint = typeof whatsappCommunicationEndpoints.$inferInsert;

// Provider identity aliases retain alternate WhatsApp representations such as
// LIDs without making them authoritative people or clinical identities.
export const whatsappEndpointAliases = pgTable("whatsapp_endpoint_aliases", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  clinicScope: varchar("clinicScope", { length: 64 }).notNull().default("fertiliv"),
  provider: pg_provider("provider").notNull().default("meta"),
  connectionId: integer("connectionId"),
  providerPhoneNumberId: varchar("providerPhoneNumberId", { length: 128 }).notNull(),
  providerIdentityId: varchar("providerIdentityId", { length: 128 }).notNull(),
  endpointId: integer("endpointId").notNull(),
  sourceEventId: integer("sourceEventId"),
  aliasKind: varchar("aliasKind", { length: 64 }).notNull().default("provider_identity"),
  aliasState: pg_aliasState("aliasState").notNull().default("active"),
  firstSeenAt: timestamp("firstSeenAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_endpoint_aliases_identity_uq").on(table.provider, table.providerPhoneNumberId, table.providerIdentityId),
  index("whatsapp_endpoint_aliases_endpoint_ix").on(table.endpointId, table.lastSeenAt),
  index("whatsapp_endpoint_aliases_connection_ix").on(table.connectionId, table.lastSeenAt),
]);
export type WhatsAppEndpointAlias = typeof whatsappEndpointAliases.$inferSelect;
export type InsertWhatsAppEndpointAlias = typeof whatsappEndpointAliases.$inferInsert;

// Stable person identity is deliberately separate from Lead/Patient workflow
// rows. It is created only for a future trusted/manual relationship.
export const whatsappPersonIdentities = pgTable("whatsapp_person_identities", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  clinicScope: varchar("clinicScope", { length: 64 }).notNull().default("fertiliv"),
  identityKind: pg_identityKind("identityKind").notNull().default("human"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type WhatsAppPersonIdentity = typeof whatsappPersonIdentities.$inferSelect;
export type InsertWhatsAppPersonIdentity = typeof whatsappPersonIdentities.$inferInsert;

export const whatsappPersonIdentityRecords = pgTable("whatsapp_person_identity_records", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  personIdentityId: integer("personIdentityId").notNull(),
  recordType: pg_recordType("recordType").notNull(),
  recordId: integer("recordId").notNull(),
  relationshipState: pg_relationshipState("relationshipState").notNull().default("active"),
  trustSource: pg_trustSource("trustSource").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_person_identity_records_identity_record_uq").on(table.personIdentityId, table.recordType, table.recordId),
  index("whatsapp_person_identity_records_record_ix").on(table.recordType, table.recordId),
]);
export type WhatsAppPersonIdentityRecord = typeof whatsappPersonIdentityRecords.$inferSelect;
export type InsertWhatsAppPersonIdentityRecord = typeof whatsappPersonIdentityRecords.$inferInsert;

// A confirmed endpoint/person link requires a trusted/manual source. WU-06
// does not expose a confirmation UI and never creates these links automatically.
export const whatsappEndpointPersonLinks = pgTable("whatsapp_endpoint_person_links", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  endpointId: integer("endpointId").notNull(),
  personIdentityId: integer("personIdentityId").notNull(),
  linkState: pg_linkState("linkState").notNull().default("confirmed"),
  trustSource: pg_trustSource("trustSource").notNull(),
  confirmedById: integer("confirmedById"),
  confirmedAt: timestamp("confirmedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  revokedAt: timestamp("revokedAt", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_endpoint_person_links_endpoint_identity_uq").on(table.endpointId, table.personIdentityId),
  index("whatsapp_endpoint_person_links_endpoint_state_ix").on(table.endpointId, table.linkState),
  index("whatsapp_endpoint_person_links_identity_state_ix").on(table.personIdentityId, table.linkState),
]);
export type WhatsAppEndpointPersonLink = typeof whatsappEndpointPersonLinks.$inferSelect;
export type InsertWhatsAppEndpointPersonLink = typeof whatsappEndpointPersonLinks.$inferInsert;

export const whatsappEndpointResolutions = pgTable("whatsapp_endpoint_resolutions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  sourceEventId: integer("sourceEventId").notNull(),
  provider: pg_provider("provider").notNull().default("meta"),
  connectionId: integer("connectionId"),
  connectionRoute: pg_connectionRoute("connectionRoute"),
  providerPhoneNumberId: varchar("providerPhoneNumberId", { length: 128 }),
  providerEndpointId: varchar("providerEndpointId", { length: 128 }),
  providerMessageId: varchar("providerMessageId", { length: 128 }),
  routingState: pg_routingState("routingState").notNull(),
  endpointId: integer("endpointId"),
  resolutionKey: varchar("resolutionKey", { length: 64 }).notNull(),
  resolutionState: pg_resolutionState("resolutionState").notNull(),
  resolutionReason: varchar("resolutionReason", { length: 128 }).notNull(),
  confirmedPersonIdentityId: integer("confirmedPersonIdentityId"),
  humanActorResolutionState: pg_humanActorResolutionState("humanActorResolutionState").notNull().default("unresolved"),
  medicalSubjectResolutionState: pg_medicalSubjectResolutionState("medicalSubjectResolutionState").notNull().default("unresolved"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_endpoint_resolutions_key_uq").on(table.resolutionKey),
  index("whatsapp_endpoint_resolutions_source_event_ix").on(table.sourceEventId),
  index("whatsapp_endpoint_resolutions_endpoint_ix").on(table.endpointId, table.createdAt),
  index("whatsapp_endpoint_resolutions_state_ix").on(table.resolutionState, table.createdAt),
]);
export type WhatsAppEndpointResolution = typeof whatsappEndpointResolutions.$inferSelect;
export type InsertWhatsAppEndpointResolution = typeof whatsappEndpointResolutions.$inferInsert;

export const whatsappEndpointResolutionCandidates = pgTable("whatsapp_endpoint_resolution_candidates", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  resolutionId: integer("resolutionId").notNull(),
  recordType: pg_recordType("recordType").notNull(),
  recordId: integer("recordId").notNull(),
  matchedField: pg_matchedField("matchedField").notNull(),
  convertedPatientId: integer("convertedPatientId"),
  candidateKey: varchar("candidateKey", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_endpoint_resolution_candidates_key_uq").on(table.resolutionId, table.candidateKey),
  index("whatsapp_endpoint_resolution_candidates_record_ix").on(table.recordType, table.recordId),
]);
export type WhatsAppEndpointResolutionCandidate = typeof whatsappEndpointResolutionCandidates.$inferSelect;
export type InsertWhatsAppEndpointResolutionCandidate = typeof whatsappEndpointResolutionCandidates.$inferInsert;

// Provider names, group/participant identifiers, and Business-App actor hints
// remain evidence-only. They never change resolution state or identity links.
export const whatsappEndpointEvidenceHints = pgTable("whatsapp_endpoint_evidence_hints", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  sourceEventId: integer("sourceEventId").notNull(),
  resolutionId: integer("resolutionId").notNull(),
  endpointId: integer("endpointId"),
  hintType: varchar("hintType", { length: 64 }).notNull(),
  providerHintValue: varchar("providerHintValue", { length: 512 }).notNull(),
  providerHintDigest: varchar("providerHintDigest", { length: 64 }).notNull(),
  evidenceState: pg_evidenceState("evidenceState").notNull().default("provider_hint"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_endpoint_evidence_hints_uq").on(table.resolutionId, table.hintType, table.providerHintDigest),
  index("whatsapp_endpoint_evidence_hints_endpoint_ix").on(table.endpointId, table.createdAt),
  index("whatsapp_endpoint_evidence_hints_source_event_ix").on(table.sourceEventId),
]);
export type WhatsAppEndpointEvidenceHint = typeof whatsappEndpointEvidenceHints.$inferSelect;
export type InsertWhatsAppEndpointEvidenceHint = typeof whatsappEndpointEvidenceHints.$inferInsert;

// ─── WhatsApp WU-07 Conversation Boundary ────────────────────────────────────
// Conversations are transport/thread boundaries. They deliberately contain no
// Patient, Lead, MRN, Treatment Case, medical-subject, or authorization owner.
export const whatsappConversations = pgTable("whatsapp_conversations", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  clinicScope: varchar("clinicScope", { length: 64 }).notNull().default("fertiliv"),
  provider: pg_provider("provider").notNull().default("meta"),
  connectionId: integer("connectionId"),
  connectionRoute: pg_connectionRoute("connectionRoute"),
  providerPhoneNumberId: varchar("providerPhoneNumberId", { length: 128 }).notNull(),
  providerThreadId: varchar("providerThreadId", { length: 128 }),
  conversationKey: varchar("conversationKey", { length: 64 }).notNull(),
  conversationType: pg_conversationType("conversationType").notNull(),
  identityBasis: pg_identityBasis("identityBasis").notNull(),
  endpointResolutionState: pg_endpointResolutionState("endpointResolutionState").notNull(),
  humanActorResolutionState: pg_humanActorResolutionState("humanActorResolutionState").notNull().default("unresolved"),
  medicalSubjectResolutionState: pg_medicalSubjectResolutionState("medicalSubjectResolutionState").notNull().default("unresolved"),
  lifecycleState: pg_lifecycleState_3("lifecycleState").notNull().default("active"),
  firstMessageAt: timestamp("firstMessageAt", { withTimezone: true, mode: "date" }),
  lastMessageAt: timestamp("lastMessageAt", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_conversations_key_uq").on(table.conversationKey),
  index("whatsapp_conversations_connection_time_ix").on(table.connectionId, table.lastMessageAt),
  index("whatsapp_conversations_provider_thread_ix").on(table.provider, table.providerPhoneNumberId, table.providerThreadId),
  index("whatsapp_conversations_type_state_ix").on(table.conversationType, table.lifecycleState),
]);
export type WhatsAppConversation = typeof whatsappConversations.$inferSelect;
export type InsertWhatsAppConversation = typeof whatsappConversations.$inferInsert;

export const whatsappConversationParticipants = pgTable("whatsapp_conversation_participants", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  conversationId: integer("conversationId").notNull(),
  endpointId: integer("endpointId"),
  personIdentityId: integer("personIdentityId"),
  sourceResolutionId: integer("sourceResolutionId"),
  participantKey: varchar("participantKey", { length: 64 }).notNull(),
  participantRole: pg_participantRole("participantRole").notNull(),
  participantState: pg_participantState("participantState").notNull().default("unresolved"),
  providerParticipantId: varchar("providerParticipantId", { length: 128 }).notNull(),
  providerHintDigest: varchar("providerHintDigest", { length: 64 }),
  humanActorResolutionState: pg_humanActorResolutionState("humanActorResolutionState").notNull().default("unresolved"),
  medicalSubjectResolutionState: pg_medicalSubjectResolutionState("medicalSubjectResolutionState").notNull().default("unresolved"),
  firstSeenAt: timestamp("firstSeenAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  lastSeenAt: timestamp("lastSeenAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_conversation_participants_key_uq").on(table.participantKey),
  index("whatsapp_conversation_participants_conversation_ix").on(table.conversationId, table.lastSeenAt),
  index("whatsapp_conversation_participants_endpoint_ix").on(table.endpointId, table.lastSeenAt),
  index("whatsapp_conversation_participants_person_ix").on(table.personIdentityId, table.lastSeenAt),
]);
export type WhatsAppConversationParticipant = typeof whatsappConversationParticipants.$inferSelect;
export type InsertWhatsAppConversationParticipant = typeof whatsappConversationParticipants.$inferInsert;

export const whatsappConversationMessages = pgTable("whatsapp_conversation_messages", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  conversationId: integer("conversationId").notNull(),
  sourceEventId: integer("sourceEventId").notNull(),
  normalizedMessageId: integer("normalizedMessageId").notNull(),
  resolutionId: integer("resolutionId"),
  provider: pg_provider("provider").notNull().default("meta"),
  providerPhoneNumberId: varchar("providerPhoneNumberId", { length: 128 }).notNull(),
  providerMessageId: varchar("providerMessageId", { length: 128 }),
  providerItemKey: varchar("providerItemKey", { length: 128 }).notNull(),
  associationKey: varchar("associationKey", { length: 64 }).notNull(),
  correlationState: pg_correlationState("correlationState").notNull().default("correlated"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_conversation_messages_association_uq").on(table.associationKey),
  uniqueIndex("whatsapp_conversation_messages_normalized_message_uq").on(table.normalizedMessageId),
  index("whatsapp_conversation_messages_conversation_ix").on(table.conversationId, table.createdAt),
  index("whatsapp_conversation_messages_source_event_ix").on(table.sourceEventId),
  index("whatsapp_conversation_messages_provider_message_ix").on(table.provider, table.providerMessageId),
]);
export type WhatsAppConversationMessage = typeof whatsappConversationMessages.$inferSelect;
export type InsertWhatsAppConversationMessage = typeof whatsappConversationMessages.$inferInsert;

// Operational Inbox state is intentionally separate from provider evidence.
// These tables add read state, assignment, and optional CRM context without
// changing the transport-only Conversation model.
export const whatsappConversationReadStates = pgTable("whatsapp_conversation_read_states", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  conversationId: integer("conversationId").notNull(),
  userId: integer("userId").notNull(),
  lastReadMessageId: integer("lastReadMessageId"),
  readAt: timestamp("readAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_conversation_read_states_conversation_user_uq").on(table.conversationId, table.userId),
  index("whatsapp_conversation_read_states_user_ix").on(table.userId, table.updatedAt),
]);
export type WhatsAppConversationReadState = typeof whatsappConversationReadStates.$inferSelect;
export type InsertWhatsAppConversationReadState = typeof whatsappConversationReadStates.$inferInsert;

export const whatsappConversationAssignments = pgTable("whatsapp_conversation_assignments", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  conversationId: integer("conversationId").notNull(),
  assignedUserId: integer("assignedUserId"),
  assignedById: integer("assignedById").notNull(),
  assignedAt: timestamp("assignedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_conversation_assignments_conversation_uq").on(table.conversationId),
  index("whatsapp_conversation_assignments_user_ix").on(table.assignedUserId, table.updatedAt),
]);
export type WhatsAppConversationAssignment = typeof whatsappConversationAssignments.$inferSelect;
export type InsertWhatsAppConversationAssignment = typeof whatsappConversationAssignments.$inferInsert;

export const whatsappConversationCaseLinks = pgTable("whatsapp_conversation_case_links", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  conversationId: integer("conversationId").notNull(),
  caseId: integer("caseId").notNull(),
  relationshipRole: pg_relationshipRole("relationshipRole").notNull().default("other"),
  linkedById: integer("linkedById").notNull(),
  linkedAt: timestamp("linkedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  retiredAt: timestamp("retiredAt", { withTimezone: true, mode: "date" }),
}, (table) => [
  uniqueIndex("whatsapp_conversation_case_links_active_uq").on(table.conversationId, table.caseId, table.relationshipRole),
  index("whatsapp_conversation_case_links_conversation_ix").on(table.conversationId, table.retiredAt),
]);
export type WhatsAppConversationCaseLink = typeof whatsappConversationCaseLinks.$inferSelect;
export type InsertWhatsAppConversationCaseLink = typeof whatsappConversationCaseLinks.$inferInsert;

export const whatsappInboxSettings = pgTable("whatsapp_inbox_settings", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  clinicScope: varchar("clinicScope", { length: 64 }).notNull().default("fertiliv"),
  phoneVisibility: pg_phoneVisibility("phoneVisibility").notNull().default("full_authorized"),
  newSenderBehavior: pg_newSenderBehavior("newSenderBehavior").notNull().default("conversation_only"),
  exactPhoneMatch: pg_exactPhoneMatch("exactPhoneMatch").notNull().default("never_auto_link"),
  duplicateDetection: pg_duplicateDetection("duplicateDetection").notNull().default("require_confirmation"),
  caseSuggestions: boolean("caseSuggestions").notNull().default(false),
  automaticPatient: boolean("automaticPatient").notNull().default(false),
  automaticMrn: boolean("automaticMrn").notNull().default(false),
  automaticClinicalRecord: boolean("automaticClinicalRecord").notNull().default(false),
  updatedById: integer("updatedById"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_inbox_settings_scope_uq").on(table.clinicScope),
]);
export type WhatsAppInboxSettings = typeof whatsappInboxSettings.$inferSelect;
export type InsertWhatsAppInboxSettings = typeof whatsappInboxSettings.$inferInsert;

export const whatsappInboxNotificationPreferences = pgTable("whatsapp_inbox_notification_preferences", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull().unique(),
  notifyNewConversation: boolean("notifyNewConversation").notNull().default(true),
  notifyNewMessage: boolean("notifyNewMessage").notNull().default(true),
  notifyAssignment: boolean("notifyAssignment").notNull().default(true),
  notifyHealth: boolean("notifyHealth").notNull().default(true),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type WhatsAppInboxNotificationPreferences = typeof whatsappInboxNotificationPreferences.$inferSelect;
export type InsertWhatsAppInboxNotificationPreferences = typeof whatsappInboxNotificationPreferences.$inferInsert;

export const whatsappConversationTags = pgTable("whatsapp_conversation_tags", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  conversationId: integer("conversationId").notNull(),
  tag: varchar("tag", { length: 64 }).notNull(),
  createdById: integer("createdById").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("whatsapp_conversation_tags_conversation_tag_uq").on(table.conversationId, table.tag),
  index("whatsapp_conversation_tags_tag_ix").on(table.tag),
]);
export type WhatsAppConversationTag = typeof whatsappConversationTags.$inferSelect;
export type InsertWhatsAppConversationTag = typeof whatsappConversationTags.$inferInsert;

export const whatsappConversationActivities = pgTable("whatsapp_conversation_activities", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  conversationId: integer("conversationId").notNull(),
  actorId: integer("actorId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  summary: varchar("summary", { length: 512 }).notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("whatsapp_conversation_activities_conversation_ix").on(table.conversationId, table.createdAt),
]);
export type WhatsAppConversationActivity = typeof whatsappConversationActivities.$inferSelect;
export type InsertWhatsAppConversationActivity = typeof whatsappConversationActivities.$inferInsert;

export const whatsappConversationMatchSuggestions = pgTable("whatsapp_conversation_match_suggestions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  conversationId: integer("conversationId").notNull(),
  endpointId: integer("endpointId"),
  candidateType: pg_candidateType("candidateType").notNull(),
  candidateId: integer("candidateId").notNull(),
  matchedField: pg_matchedField_2("matchedField").notNull(),
  confidence: pg_confidence("confidence").notNull().default("high"),
  state: pg_state_3("state").notNull().default("pending"),
  reviewedById: integer("reviewedById"),
  reviewedAt: timestamp("reviewedAt", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("whatsapp_conversation_match_suggestions_uq").on(table.conversationId, table.candidateType, table.candidateId),
  index("whatsapp_conversation_match_suggestions_state_ix").on(table.conversationId, table.state),
]);
export type WhatsAppConversationMatchSuggestion = typeof whatsappConversationMatchSuggestions.$inferSelect;
export type InsertWhatsAppConversationMatchSuggestion = typeof whatsappConversationMatchSuggestions.$inferInsert;

// Channel-neutral media custody. Provider identifiers remain evidence only;
// browser access is granted through an authorized application route.
export const communicationMediaAssets = pgTable("communication_media_assets", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  conversationId: integer("conversationId").notNull(),
  normalizedMediaId: integer("normalizedMediaId"),
  channelKind: varchar("channelKind", { length: 64 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull().unique(),
  encryptedAtRest: boolean("encryptedAtRest").notNull().default(true),
  encryptionVersion: varchar("encryptionVersion", { length: 32 }).notNull().default("storage-managed-v1"),
  mediaType: varchar("mediaType", { length: 64 }).notNull(),
  mimeType: varchar("mimeType", { length: 128 }),
  filename: varchar("filename", { length: 512 }),
  sha256: varchar("sha256", { length: 128 }),
  accessState: pg_accessState("accessState").notNull().default("available"),
  retentionUntil: timestamp("retentionUntil", { withTimezone: true, mode: "date" }),
  createdById: integer("createdById"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  index("communication_media_assets_conversation_ix").on(table.conversationId, table.createdAt),
  index("communication_media_assets_retention_ix").on(table.accessState, table.retentionUntil),
]);
export type CommunicationMediaAsset = typeof communicationMediaAssets.$inferSelect;
export type InsertCommunicationMediaAsset = typeof communicationMediaAssets.$inferInsert;

export const communicationMediaAccessAudits = pgTable("communication_media_access_audits", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  mediaAssetId: integer("mediaAssetId").notNull(),
  conversationId: integer("conversationId").notNull(),
  actorId: integer("actorId").notNull(),
  action: pg_action("action").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  index("communication_media_access_audits_asset_ix").on(table.mediaAssetId, table.createdAt),
  index("communication_media_access_audits_actor_ix").on(table.actorId, table.createdAt),
]);
export type CommunicationMediaAccessAudit = typeof communicationMediaAccessAudits.$inferSelect;
export type InsertCommunicationMediaAccessAudit = typeof communicationMediaAccessAudits.$inferInsert;

// ─── WhatsApp Messages ────────────────────────────────────────────────────────
// Legacy compatibility projection. Phase 1 preserves existing read behavior and
// deliberately does not infer connection or person identity for old rows.
export const whatsappMessages = pgTable("whatsapp_messages", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  fromPhone: varchar("fromPhone", { length: 32 }),
  toPhone: varchar("toPhone", { length: 32 }),
  direction: pg_direction_2("direction").notNull(),
  body: text("body").notNull(),
  status: pg_status_17("status").default("received").notNull(),
  leadId: integer("leadId"),
  patientId: integer("patientId"),
  externalMessageId: varchar("externalMessageId", { length: 128 }), // Meta message ID
  templateName: varchar("templateName", { length: 256 }),
  sentById: integer("sentById"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type WhatsappMessage = typeof whatsappMessages.$inferSelect;
export type InsertWhatsappMessage = typeof whatsappMessages.$inferInsert;

// ─── Credit Transactions ──────────────────────────────────────────────────────
// Audit trail for every credit change (add from overpayment, apply to invoice, refund deduction).
export const creditTransactions = pgTable("credit_transactions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId").notNull(),
  financialScope: pg_financialScope("financialScope").notNull().default("production"),
  currency: pg_currency_2("currency").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(), // positive = credit added, negative = credit used
  type: pg_type_3("type").notNull(),
  // Native-currency credit provenance. Existing historical rows remain nullable.
  originPaymentId: integer("originPaymentId"),
  originInvoiceId: integer("originInvoiceId"),
  sourceCreditTransactionId: integer("sourceCreditTransactionId"),
  settlementId: integer("settlementId"),
  patientCreditApplicationId: integer("patientCreditApplicationId"),
  patientCreditPayoutId: integer("patientCreditPayoutId"),
  originPaymentMethod: pg_originPaymentMethod("originPaymentMethod"),
  // Cross-currency application provenance. The native `currency`/`amount` remain source-of-truth.
  targetInvoiceCurrency: pg_targetInvoiceCurrency("targetInvoiceCurrency"),
  targetSettlementAmount: numeric("targetSettlementAmount", { precision: 10, scale: 2 }),
  creditConversionRateToInvoice: numeric("creditConversionRateToInvoice", { precision: 20, scale: 12 }),
  creditFxEffectiveAt: timestamp("creditFxEffectiveAt", { withTimezone: true, mode: "date" }),
  creditFxSource: varchar("creditFxSource", { length: 64 }),
  sourceCreditAvailableBefore: numeric("sourceCreditAvailableBefore", { precision: 10, scale: 2 }),
  invoiceId: integer("invoiceId"),
  notes: text("notes"),
  recordedById: integer("recordedById"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type CreditTransaction = typeof creditTransactions.$inferSelect;
export type InsertCreditTransaction = typeof creditTransactions.$inferInsert;

// ─── Patient Credit Applications ───────────────────────────────────────────────
// A durable group for a single manual same- or cross-currency credit application.
// This enables a precise full reversal without exposing FIFO mechanics to staff.
export const patientCreditApplications = pgTable("patient_credit_applications", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId").notNull(),
  invoiceId: integer("invoiceId").notNull(),
  financialScope: pg_financialScope("financialScope").notNull().default("production"),
  sourceCurrency: pg_sourceCurrency("sourceCurrency").notNull(),
  targetInvoiceCurrency: pg_targetInvoiceCurrency("targetInvoiceCurrency").notNull(),
  sourceCreditAmount: numeric("sourceCreditAmount", { precision: 10, scale: 2 }).notNull(),
  creditSettlementAmount: numeric("creditSettlementAmount", { precision: 10, scale: 2 }).notNull(),
  fxRoundingAdjustmentAmount: numeric("fxRoundingAdjustmentAmount", { precision: 10, scale: 2 }).notNull().default("0"),
  finalSettlementAmount: numeric("finalSettlementAmount", { precision: 10, scale: 2 }).notNull(),
  conversionRateToInvoice: numeric("conversionRateToInvoice", { precision: 20, scale: 12 }),
  fxEffectiveAt: timestamp("fxEffectiveAt", { withTimezone: true, mode: "date" }),
  fxSource: varchar("fxSource", { length: 64 }),
  status: pg_status_18("status").notNull().default("active"),
  reversalReason: text("reversalReason"),
  reversedAt: timestamp("reversedAt", { withTimezone: true, mode: "date" }),
  reversedById: integer("reversedById"),
  createdById: integer("createdById").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type PatientCreditApplication = typeof patientCreditApplications.$inferSelect;
export type InsertPatientCreditApplication = typeof patientCreditApplications.$inferInsert;

// One row per FIFO native-credit lot consumed by an application.
export const patientCreditApplicationAllocations = pgTable("patient_credit_application_allocations", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  applicationId: integer("applicationId").notNull(),
  sourceCreditTransactionId: integer("sourceCreditTransactionId").notNull(),
  creditDebitTransactionId: integer("creditDebitTransactionId").notNull(),
  creditSettlementId: integer("creditSettlementId").notNull(),
  nativeSourceAmount: numeric("nativeSourceAmount", { precision: 10, scale: 2 }).notNull(),
  targetSettlementAmount: numeric("targetSettlementAmount", { precision: 10, scale: 2 }).notNull(),
  reversalCreditTransactionId: integer("reversalCreditTransactionId"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type PatientCreditApplicationAllocation = typeof patientCreditApplicationAllocations.$inferSelect;
export type InsertPatientCreditApplicationAllocation = typeof patientCreditApplicationAllocations.$inferInsert;

// Audit header for an immutable full reversal of one Patient Credit application.
export const patientCreditApplicationReversals = pgTable("patient_credit_application_reversals", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  applicationId: integer("applicationId").notNull().unique(),
  patientId: integer("patientId").notNull(),
  invoiceId: integer("invoiceId").notNull(),
  financialScope: pg_financialScope("financialScope").notNull().default("production"),
  restoredSourceAmount: numeric("restoredSourceAmount", { precision: 10, scale: 2 }).notNull(),
  reversedCreditSettlementAmount: numeric("reversedCreditSettlementAmount", { precision: 10, scale: 2 }).notNull(),
  reversedFxRoundingAdjustmentAmount: numeric("reversedFxRoundingAdjustmentAmount", { precision: 10, scale: 2 }).notNull().default("0"),
  reason: text("reason"),
  idempotencyKey: varchar("idempotencyKey", { length: 64 }).notNull().unique(),
  recordedById: integer("recordedById").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type PatientCreditApplicationReversal = typeof patientCreditApplicationReversals.$inferSelect;
export type InsertPatientCreditApplicationReversal = typeof patientCreditApplicationReversals.$inferInsert;

// A cash/bank payout is a native-credit liability reduction, never an invoice refund.
export const patientCreditPayouts = pgTable("patient_credit_payouts", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId").notNull(),
  financialScope: pg_financialScope("financialScope").notNull().default("production"),
  sourceCurrency: pg_sourceCurrency("sourceCurrency").notNull(),
  sourceCreditAmount: numeric("sourceCreditAmount", { precision: 10, scale: 2 }).notNull(),
  payoutCurrency: pg_payoutCurrency("payoutCurrency").notNull(),
  payoutAmount: numeric("payoutAmount", { precision: 10, scale: 2 }).notNull(),
  conversionRateToPayout: numeric("conversionRateToPayout", { precision: 20, scale: 12 }),
  fxEffectiveAt: timestamp("fxEffectiveAt", { withTimezone: true, mode: "date" }),
  fxSource: varchar("fxSource", { length: 64 }),
  method: pg_method_2("method").notNull(),
  payoutDate: timestamp("payoutDate", { withTimezone: true, mode: "date" }).notNull(),
  reference: varchar("reference", { length: 256 }),
  notes: text("notes"),
  idempotencyKey: varchar("idempotencyKey", { length: 64 }).notNull().unique(),
  recordedById: integer("recordedById").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type PatientCreditPayout = typeof patientCreditPayouts.$inferSelect;
export type InsertPatientCreditPayout = typeof patientCreditPayouts.$inferInsert;

// One row per FIFO native-credit lot consumed by a payout.
export const patientCreditPayoutAllocations = pgTable("patient_credit_payout_allocations", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  payoutId: integer("payoutId").notNull(),
  sourceCreditTransactionId: integer("sourceCreditTransactionId").notNull(),
  creditDebitTransactionId: integer("creditDebitTransactionId").notNull(),
  nativeSourceAmount: numeric("nativeSourceAmount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type PatientCreditPayoutAllocation = typeof patientCreditPayoutAllocations.$inferSelect;
export type InsertPatientCreditPayoutAllocation = typeof patientCreditPayoutAllocations.$inferInsert;

// ─── Refunds ──────────────────────────────────────────────────────────────────
// Records a refund issued to a patient, tied to a specific invoice.
export const refunds = pgTable("refunds", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId").notNull(),
  invoiceId: integer("invoiceId").notNull(),
  financialScope: pg_financialScope("financialScope").notNull().default("production"),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: pg_currency_3("currency").notNull(),
  // Immutable refund amount expressed in the invoice currency. Historical
  // same-currency rows remain readable with this field null; every new refund
  // captures its conversion so net settlement never depends on live FX.
  amountInInvoiceCurrency: numeric("amountInInvoiceCurrency", { precision: 10, scale: 2 }),
  conversionRateToInvoice: numeric("conversionRateToInvoice", { precision: 20, scale: 12 }),
  fxEffectiveAt: timestamp("fxEffectiveAt", { withTimezone: true, mode: "date" }),
  method: pg_method_3("method").default("cash").notNull(),
  refundDate: timestamp("refundDate", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  notes: text("notes"),
  recordedById: integer("recordedById"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type Refund = typeof refunds.$inferSelect;
export type InsertRefund = typeof refunds.$inferInsert;

// ─── Code Sequences ───────────────────────────────────────────────────────────
// Permanent sequential counter per entity type. Never decremented, never reused.
export const codeSequences = pgTable("code_sequences", {
  entityType: varchar("entity_type", { length: 64 }).notNull().primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
});
export type CodeSequence = typeof codeSequences.$inferSelect;

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  title: varchar("title", { length: 256 }).notNull(),
  type: pg_type_4("type").default("follow_up").notNull(),
  status: pg_status_19("status").default("open").notNull(),
  priority: pg_priority("priority").default("medium").notNull(),
  dueDate: varchar("dueDate", { length: 16 }),       // ISO date string YYYY-MM-DD
  dueTime: varchar("dueTime", { length: 8 }),         // HH:MM
  communicationMethod: pg_communicationMethod("communicationMethod"),
  notes: text("notes"),
  leadId: integer("leadId"),
  patientId: integer("patientId"),
  assignedToId: integer("assignedToId"),
  createdById: integer("createdById"),
  tags: text("tags"), // JSON array of tag names
  closedAt: timestamp("closedAt", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

// ─── Task Tags ────────────────────────────────────────────────────────────────
export const taskTags = pgTable("task_tags", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 64 }).notNull().unique(),
  color: varchar("color", { length: 32 }).default("#6366f1"),
  createdByUserId: integer("createdByUserId"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type TaskTag = typeof taskTags.$inferSelect;

// ─── Password Reset Tokens ────────────────────────────────────────────────────
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expiresAt", { withTimezone: true, mode: "date" }).notNull(),
  usedAt: timestamp("usedAt", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// ─── Patient Doctors (many-to-many) ──────────────────────────────────────────────────────────────────────────────────
export const patientDoctors = pgTable("patient_doctors", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId").notNull(),
  doctorId: integer("doctorId").notNull(),
  isPrimary: boolean("isPrimary").default(false).notNull(),
  assignedAt: timestamp("assignedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  assignedBy: integer("assignedBy"),
});
export type PatientDoctor = typeof patientDoctors.$inferSelect;
export type InsertPatientDoctor = typeof patientDoctors.$inferInsert;

// ─── Case Comments (Collaboration Thread) ────────────────────────────────────
// Polymorphic: either leadId or patientId must be set (not both)
export const caseComments = pgTable("case_comments", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  leadId: integer("leadId"),           // set when comment is on a lead
  patientId: integer("patientId"),     // set when comment is on a patient
  authorId: integer("authorId").notNull(), // FK to users.id
  content: text("content").notNull(),
  // isSystemEvent: auto-logged change events (e.g. "Medical intake updated by [name]")
  isSystemEvent: boolean("isSystemEvent").default(false).notNull(),
  // Visibility: 'all' (staff+doctor), 'doctor_only', 'staff_only'
  visibility: pg_visibility("visibility").default("all").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type CaseComment = typeof caseComments.$inferSelect;
export type InsertCaseComment = typeof caseComments.$inferInsert;

export const referenceData = pgTable("reference_data", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  type: pg_type_5("type").notNull(),
  code: varchar("code", { length: 16 }).notNull(),  // ISO code or slug
  label: varchar("label", { length: 256 }).notNull(),
  labelAr: varchar("labelAr", { length: 256 }),     // Arabic label
  labelTr: varchar("labelTr", { length: 256 }),     // Turkish label
  sortOrder: integer("sortOrder").default(0),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type ReferenceData = typeof referenceData.$inferSelect;
export type InsertReferenceData = typeof referenceData.$inferInsert;

// ─── Treatment Plans ──────────────────────────────────────────────────────────
// Multiple treatment plans per lead/patient. Each plan is requested by staff and assigned to a doctor.
export const treatmentPlans = pgTable("treatment_plans", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  leadId: integer("leadId"),           // set when plan is for a lead
  patientId: integer("patientId"),     // set when plan is for a patient
  doctorId: integer("doctorId"),       // FK to doctors.id (primary doctor)
  title: varchar("title", { length: 256 }),  // e.g. "Treatment Plan - May 2026"
  requestNotes: text("requestNotes"),         // notes from staff when requesting
  requestedById: integer("requestedById"),        // FK to users.id (who requested)
  status: pg_status_20("status").default("draft").notNull(),
  clinicalSummary: text("clinicalSummary"),
  // Q&A: JSON array of { question: string, askedBy: 'female'|'male', answer: string }
  qaAnswers: jsonb("qaAnswers"),
  confirmedAt: timestamp("confirmedAt", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type TreatmentPlan = typeof treatmentPlans.$inferSelect;
export type InsertTreatmentPlan = typeof treatmentPlans.$inferInsert;

// ─── Treatment Plan Scenarios ─────────────────────────────────────────────────
// Each treatment plan can have 1+ scenarios. Each scenario has selected services + summary.
export const treatmentPlanScenarios = pgTable("treatment_plan_scenarios", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  treatmentPlanId: integer("treatmentPlanId").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  summary: text("summary"),
  // services: JSON array of { serviceId, serviceName, category, quantity }
  services: jsonb("services"),
  sortOrder: integer("sortOrder").default(0).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type TreatmentPlanScenario = typeof treatmentPlanScenarios.$inferSelect;
export type InsertTreatmentPlanScenario = typeof treatmentPlanScenarios.$inferInsert;

// ─── Doctor Review Requests ───────────────────────────────────────────────────
// Tracks "Request Doctor Review" workflow on leads and patients
export const doctorReviewRequests = pgTable("doctor_review_requests", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  leadId: integer("leadId"),
  patientId: integer("patientId"),
  doctorId: integer("doctorId").notNull(),
  requestedById: integer("requestedById").notNull(),
  status: pg_status_21("status").default("pending").notNull(),
  requestedAt: timestamp("requestedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  reviewStartedAt: timestamp("reviewStartedAt", { withTimezone: true, mode: "date" }),
  planReadyAt: timestamp("planReadyAt", { withTimezone: true, mode: "date" }),
});
export type DoctorReviewRequest = typeof doctorReviewRequests.$inferSelect;
export type InsertDoctorReviewRequest = typeof doctorReviewRequests.$inferInsert;

// ─── Remote Monitoring ────────────────────────────────────────────────────────

// Global monitoring feature toggles (single row, id=1)
export const monitoringSettings = pgTable("monitoring_settings", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  screenEnabled: boolean("screenEnabled").default(false).notNull(),
  screenshotEnabled: boolean("screenshotEnabled").default(false).notNull(),
  screenshotIntervalSeconds: integer("screenshotIntervalSeconds").default(60).notNull(),
  cameraEnabled: boolean("cameraEnabled").default(false).notNull(),
  microphoneEnabled: boolean("microphoneEnabled").default(false).notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
  updatedById: integer("updatedById"),
});
export type MonitoringSettings = typeof monitoringSettings.$inferSelect;
export type InsertMonitoringSettings = typeof monitoringSettings.$inferInsert;

// One row per monitoring session (screen / screenshot / camera / microphone)
export const monitoringSessions = pgTable("monitoring_sessions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  adminId: integer("adminId").notNull(),           // who initiated
  employeeId: integer("employeeId").notNull(),      // who is being monitored (staff/manager only)
  monitoringType: pg_monitoringType("monitoringType").notNull(),
  startTime: timestamp("startTime", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  endTime: timestamp("endTime", { withTimezone: true, mode: "date" }),
  durationSeconds: integer("durationSeconds"),
  // JSON array of { url, capturedAt } for screenshot sessions
  screenshotUrls: jsonb("screenshotUrls"),
  notes: text("notes"),
});
export type MonitoringSession = typeof monitoringSessions.$inferSelect;
export type InsertMonitoringSession = typeof monitoringSessions.$inferInsert;

// Tracks which employees have acknowledged the monitoring policy (per device/browser)
// Stored in localStorage on the client; this table is for server-side audit trail
export const monitoringConsents = pgTable("monitoring_consents", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  userId: integer("userId").notNull(),
  consentedAt: timestamp("consentedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  ipAddress: varchar("ipAddress", { length: 64 }),
  userAgent: text("userAgent"),
});
export type MonitoringConsent = typeof monitoringConsents.$inferSelect;
export type InsertMonitoringConsent = typeof monitoringConsents.$inferInsert;

// ─── WebRTC Signaling for Remote Monitoring ──────────────────────────────────
export const monitoringSignals = pgTable("monitoring_signals", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  type: pg_type_6("type").notNull(),
  payload: text("payload").notNull(),
  consumed: boolean("consumed").notNull().default(false),
  createdAt: integer("created_at").notNull(),
});
export type MonitoringSignal = typeof monitoringSignals.$inferSelect;

// ─── Intake Form Builder ──────────────────────────────────────────────────────
export const intakeForms = pgTable("intake_forms", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  slug: varchar("slug", { length: 128 }).notNull().unique(),
  brand: pg_brand("brand").default("fertiliv").notNull(),
  isDefault: boolean("isDefault").notNull().default(false),
  // JSON array of field IDs selected for this form
  // e.g. ["firstName","lastName","phone","gender","dateOfBirth","treatmentInterest"]
  fields: jsonb("fields").notNull().$type<string[]>(),
  // JSON object: { fieldId: { en: "...", ar: "...", tr: "..." } }
  translations: jsonb("translations").notNull().$type<Record<string, Record<string, string>>>(),
  // JSON object: { en: "Form title", ar: "عنوان النموذج", tr: "Form başlığı" }
  titleTranslations: jsonb("titleTranslations").$type<Record<string, string>>(),
  // JSON object: { en: "subtitle", ar: "...", tr: "..." }
  subtitleTranslations: jsonb("subtitleTranslations").$type<Record<string, string>>(),
  /**
   * JSON array of step metadata objects. Each entry can be:
   *   { type: "fields", id: string, title?: string, titleAr?: string, titleTr?: string,
   *     subtitle?: string, subtitleAr?: string, subtitleTr?: string, fieldIds: string[] }
   *   { type: "decision", id: string, title: string, titleAr?: string, titleTr?: string,
   *     subtitle?: string, subtitleAr?: string, subtitleTr?: string,
   *     buttons: Array<{ label: string, labelAr?: string, labelTr?: string,
   *       action: "next_step"|"whatsapp"|"schedule_call", target?: string, icon?: string }> }
   */
  stepsMeta: jsonb("stepsMeta").$type<any[]>(),
  /**
   * Per-field configuration overrides.
   * Key = fieldId, value = { enabledSubFields?: string[] } for repeatable fields.
   * e.g. { "f_art_history": { enabledSubFields: ["type","date","result"] } }
   */
  fieldConfig: jsonb("fieldConfig").$type<Record<string, { enabledSubFields?: string[] }>>(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type IntakeForm = typeof intakeForms.$inferSelect;
export type InsertIntakeForm = typeof intakeForms.$inferInsert;

// ─── Lab Test Dictionary ──────────────────────────────────────────────────────

export const labDictionary = pgTable("lab_dictionary", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  canonicalName: varchar("canonicalName", { length: 256 }).notNull(),
  displayName: varchar("displayName", { length: 512 }).notNull(),
  abbreviation: varchar("abbreviation", { length: 64 }),
  resultType: pg_resultType("resultType").notNull().default("Quantitative"),
  category: varchar("category", { length: 128 }),
  specimen: varchar("specimen", { length: 128 }),
  commonUnits: varchar("commonUnits", { length: 256 }),
  // Unit standardization fields
  canonicalUnit: varchar("canonicalUnit", { length: 64 }),          // e.g. "mg/dL" — the standard unit for this test in Turkey
  alternativeUnits: text("alternativeUnits"),                        // JSON: ["mmol/L", "mEq/L"] — other units seen in Turkish labs
  conversionFactors: text("conversionFactors"),                      // JSON: {"mmol/L": 38.67} — multiply alt unit value by factor to get canonical
  suggestedModule: pg_suggestedModule("suggestedModule").default("general_lab"),
  notes: text("notes"),
  // Medical context layer
  analyteGroup: varchar("analyteGroup", { length: 256 }),   // e.g. "Glucose / OGTT", "Thyroid", "CBC", "Testosterone"
  orderType: pg_orderType("orderType").default("Single Result Test"),
  isActive: boolean("isActive").default(true).notNull(),
  // Audit
  createdById: integer("createdById"),
  updatedById: integer("updatedById"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type LabDictionaryEntry = typeof labDictionary.$inferSelect;
export type InsertLabDictionaryEntry = typeof labDictionary.$inferInsert;

// ─── Lab Dictionary Aliases ───────────────────────────────────────────────────
// Each row is one alias/synonym for a dictionary entry.
// Scope: "global" = applies to all patients; "patient" = applies to one patient only.

export const labDictionaryAliases = pgTable("lab_dictionary_aliases", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  dictionaryId: integer("dictionaryId").notNull(), // FK → lab_dictionary.id
  alias: varchar("alias", { length: 512 }).notNull(),
  scope: pg_scope("scope").default("global").notNull(),
  patientId: integer("patientId"), // only set when scope = "patient"
  // Audit: who confirmed/added this alias
  confirmedById: integer("confirmedById"),
  confirmedAt: timestamp("confirmedAt", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type LabDictionaryAlias = typeof labDictionaryAliases.$inferSelect;
export type InsertLabDictionaryAlias = typeof labDictionaryAliases.$inferInsert;

// ─── Lab Dictionary Change Log ────────────────────────────────────────────────
// Tracks every mutation to lab_dictionary and lab_dictionary_aliases for audit
// and undo capability.
export const labDictionaryChangelog = pgTable("lab_dictionary_changelog", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  dictionaryId: integer("dictionaryId").notNull(),     // FK → lab_dictionary.id
  changeType: pg_changeType("changeType").notNull(),
  fieldName: varchar("fieldName", { length: 128 }),  // which field changed (null for created/approved)
  oldValue: text("oldValue"),                        // JSON-serialized previous value
  newValue: text("newValue"),                        // JSON-serialized new value
  aliasId: integer("aliasId"),                           // FK → lab_dictionary_aliases.id (for alias changes)
  performedById: integer("performedById"),               // FK → users.id
  performedByName: varchar("performedByName", { length: 256 }),
  isUndone: boolean("isUndone").default(false).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});

export type LabDictionaryChangelogEntry = typeof labDictionaryChangelog.$inferSelect;
export type InsertLabDictionaryChangelogEntry = typeof labDictionaryChangelog.$inferInsert;

// ─── External Reports ─────────────────────────────────────────────────────────
// Reports from external sources (labs, radiology, embryology) that have been
// AI-translated/formatted by Fertiliv for patient communication.
export const externalReports = pgTable("external_reports", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  patientId: integer("patientId").notNull(),
  reportRef: varchar("reportRef", { length: 50 }),         // e.g. EXT-00001
  sourceOrganization: varchar("sourceOrganization", { length: 255 }), // e.g. "Istanbul Lab"
  reportType: varchar("reportType", { length: 100 }),      // e.g. "Blood Test", "Embryo Report"
  reportDate: timestamp("reportDate", { withTimezone: true, mode: "date" }),                     // date of the original report
  originalContent: text("originalContent"),                // raw text extracted from files / typed by user
  processedContent: text("processedContent"),              // AI-translated/formatted content
  processingNote: varchar("processingNote", { length: 50 }).default("translated"), // "translated" | "simplified" | "formatted"
  language: varchar("language", { length: 10 }).default("en"), // output language: en | ar | tr
  // Phase A: canonical processing state for newly created/edited reports.
  // Historical processingNote/language values remain unchanged for compatibility.
  processingGoal: varchar("processingGoal", { length: 32 }),
  requestedTargetLanguage: varchar("requestedTargetLanguage", { length: 16 }),
  resolvedOutputLanguage: varchar("resolvedOutputLanguage", { length: 16 }),
  // Null preserves historical rows. New controlled processing records whether Review uses
  // the normal structured path or the independently validated plain-text fallback.
  processingRepresentation: varchar("processingRepresentation", { length: 32 }),
  // Phase B: additive structured-document foundation. Phase C will author structured AI output.
  processedDocumentJson: jsonb("processedDocumentJson"),
  processedDocumentVersion: integer("processedDocumentVersion"),
  // V2-only nullable replay/idempotency metadata. Historical rows remain null.
  v2SubmissionKey: varchar("v2SubmissionKey", { length: 64 }),
  v2Metadata: jsonb("v2Metadata"),
  activeSourceRevisionId: integer("activeSourceRevisionId"),
  // Original files uploaded by user (stored as JSON array of {key, name, mimeType})
  originalFiles: text("originalFiles"),
  status: pg_status_22("status").default("draft").notNull(),
  createdById: integer("createdById"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("external_reports_v2_submission_key_unique").on(table.v2SubmissionKey),
]);
export type ExternalReport = typeof externalReports.$inferSelect;
export type InsertExternalReport = typeof externalReports.$inferInsert;

// Immutable source capture for External Reports. A source correction creates a new revision;
// AI processing never mutates an existing revision.
export const externalReportSourceRevisions = pgTable("external_report_source_revisions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  reportId: integer("reportId").notNull(),
  revisionNumber: integer("revisionNumber").notNull(),
  sourceText: text("sourceText"),
  inputMethod: varchar("inputMethod", { length: 16 }).notNull(),
  sourceLanguage: varchar("sourceLanguage", { length: 16 }),
  sourceAssetRefs: jsonb("sourceAssetRefs"),
  sourceHash: varchar("sourceHash", { length: 64 }).notNull(),
  correctionReason: text("correctionReason"),
  capturedById: integer("capturedById"),
  capturedAt: timestamp("capturedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("external_report_source_revision_unique").on(table.reportId, table.revisionNumber),
  index("external_report_source_revision_report_idx").on(table.reportId),
]);
export type ExternalReportSourceRevision = typeof externalReportSourceRevisions.$inferSelect;
export type InsertExternalReportSourceRevision = typeof externalReportSourceRevisions.$inferInsert;

// Append-only metadata describing the processing decision that produced a finalized output.
export const externalReportProcessingRuns = pgTable("external_report_processing_runs", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  reportId: integer("reportId").notNull(),
  sourceRevisionId: integer("sourceRevisionId"),
  processingGoal: varchar("processingGoal", { length: 32 }).notNull(),
  requestedTargetLanguage: varchar("requestedTargetLanguage", { length: 16 }),
  resolvedOutputLanguage: varchar("resolvedOutputLanguage", { length: 16 }).notNull(),
  processedDocumentVersion: integer("processedDocumentVersion"),
  processingStatus: pg_processingStatus("processingStatus").default("processed").notNull(),
  processedAt: timestamp("processedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  reviewedAt: timestamp("reviewedAt", { withTimezone: true, mode: "date" }),
  reviewedById: integer("reviewedById"),
  finalizedAt: timestamp("finalizedAt", { withTimezone: true, mode: "date" }),
  finalizedById: integer("finalizedById"),
  createdById: integer("createdById"),
}, (table) => [
  index("external_report_processing_run_report_idx").on(table.reportId),
  index("external_report_processing_run_source_idx").on(table.sourceRevisionId),
]);
export type ExternalReportProcessingRun = typeof externalReportProcessingRuns.$inferSelect;
export type InsertExternalReportProcessingRun = typeof externalReportProcessingRuns.$inferInsert;

// ─── Pending Lab Tests ────────────────────────────────────────────────────────
// Tests submitted by non-admin staff that need admin approval before being
// added to the Lab Dictionary. Also used for PDF import review queue.
export const pendingLabTests = pgTable("pending_lab_tests", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  // The raw test name as submitted (may differ from canonical name)
  rawName: varchar("rawName", { length: 512 }).notNull(),
  // Source: 'patient_entry' = entered via patient record, 'pdf_import' = from PDF upload
  source: pg_source_2("source").notNull().default("patient_entry"),
  // Patient context (if submitted from a patient record)
  patientId: integer("patientId"),
  // AI-suggested fields (pre-filled, editable by admin)
  suggestedCanonicalName: varchar("suggestedCanonicalName", { length: 256 }),
  suggestedDisplayName: varchar("suggestedDisplayName", { length: 512 }),
  suggestedAbbreviation: varchar("suggestedAbbreviation", { length: 64 }),
  suggestedResultType: varchar("suggestedResultType", { length: 64 }),
  suggestedCategory: varchar("suggestedCategory", { length: 128 }),
  suggestedSpecimen: varchar("suggestedSpecimen", { length: 128 }),
  suggestedUnits: varchar("suggestedUnits", { length: 256 }),
  aiConfidence: pg_aiConfidence("aiConfidence").default("medium"),
  // Possible match in existing dictionary (fuzzy match)
  possibleMatchId: integer("possibleMatchId"), // FK → lab_dictionary.id
  possibleMatchName: varchar("possibleMatchName", { length: 256 }),
  possibleMatchScore: integer("possibleMatchScore"), // 0-100 similarity score
  // Medical Similarity Verification (on-demand AI, cached after first run)
  medicalVerdict: pg_medicalVerdict("medicalVerdict"),
  confidenceScore: integer("confidenceScore"), // 0-100
  medicalReason: text("medicalReason"),
  suggestedAction: varchar("suggestedAction", { length: 512 }),
  // Status
  status: pg_status_23("status").notNull().default("pending"),
  mergedIntoDictionaryId: integer("mergedIntoDictionaryId"), // if merged as alias
  rejectionReason: varchar("rejectionReason", { length: 512 }),
  // Audit
  submittedById: integer("submittedById").notNull(),
  reviewedById: integer("reviewedById"),
  reviewedAt: timestamp("reviewedAt", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});

export type PendingLabTest = typeof pendingLabTests.$inferSelect;
export type InsertPendingLabTest = typeof pendingLabTests.$inferInsert;

// ─── AI Import Drafts ─────────────────────────────────────────────────────────
// Stores server-side drafts of AI lab import sessions so work is never lost
// across page refreshes, session timeouts, or device switches.
// A draft is NOT a committed lab result — it becomes one only after the user
// clicks "Final Import / Save" in the review workspace.
export const aiImportDrafts = pgTable("ai_import_drafts", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  /** Scoping key — typically "{mode}_{patientId}_{section}", same as draftKey prop */
  draftKey: varchar("draftKey", { length: 256 }).notNull(),
  /** FK → users.id — the staff member who owns this draft */
  userId: integer("userId").notNull(),
  /** Current step: "input" (uploading/pasting) or "preview" (reviewing rows) */
  step: pg_step("step").default("input").notNull(),
  /** Pasted text content */
  pasteText: text("pasteText"),
  /** Uploaded file references (JSON array of UploadedFile objects without binary data) */
  uploadedFiles: jsonb("uploadedFiles"),
  /** Extracted + reviewed rows (JSON array of ImportedLabRow objects) */
  rows: jsonb("rows"),
  /** Set of selected row IDs (JSON array of strings) */
  selectedIds: jsonb("selectedIds"),
  /** Per-row match overrides: { [rowId]: { dictionaryId, canonicalName } } */
  matchOverrides: jsonb("matchOverrides"),
  /** Per-row manual alias opt-in: { [rowId]: boolean } */
  manualMatchAliasOptIn: jsonb("manualMatchAliasOptIn"),
  /** ISO timestamp of last auto-save */
  lastSavedAt: timestamp("lastSavedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type AiImportDraft = typeof aiImportDrafts.$inferSelect;
export type InsertAiImportDraft = typeof aiImportDrafts.$inferInsert;

// ─── Exchange Rates Cache ─────────────────────────────────────────────────────
// Stores fetched exchange rates with full metadata. One row per currency pair.
// is_manual_override = true means admin set this rate manually; skip auto-update for it.
export const exchangeRates = pgTable("exchange_rates", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  baseCurrency: varchar("baseCurrency", { length: 8 }).notNull(),   // e.g. "TRY"
  targetCurrency: varchar("targetCurrency", { length: 8 }).notNull(), // e.g. "USD"
  rate: numeric("rate", { precision: 18, scale: 8 }).notNull(),      // how many base = 1 target
  sourceProvider: varchar("sourceProvider", { length: 64 }),          // "frankfurter" | "exchangerate-api" | "manual"
  rateDate: varchar("rateDate", { length: 16 }),                      // "2026-06-25" (date from provider)
  fetchedAt: timestamp("fetchedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),           // when we stored it
  isManualOverride: boolean("isManualOverride").default(false).notNull(),
  overriddenBy: integer("overriddenBy"),                                  // userId who set manual override
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [
  uniqueIndex("exchange_rates_pair_uq").on(table.baseCurrency, table.targetCurrency),
]);

export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type InsertExchangeRate = typeof exchangeRates.$inferInsert;

// ─── Dropdown Options (Dynamic Field Options) ─────────────────────────────────
// Stores admin-configurable options for dropdown/multi-select fields.
// fieldKey identifies which field this option belongs to (e.g. "main_medical_interest").
export const dropdownOptions = pgTable("dropdown_options", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  fieldKey: varchar("fieldKey", { length: 64 }).notNull(), // e.g. "main_medical_interest"
  label: varchar("label", { length: 256 }).notNull(),      // display label
  value: varchar("value", { length: 256 }).notNull(),      // stored value (slug or same as label)
  sortOrder: integer("sortOrder").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  groupLabel: varchar("group_label", { length: 200 }),  // optional section header
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type DropdownOption = typeof dropdownOptions.$inferSelect;
export type InsertDropdownOption = typeof dropdownOptions.$inferInsert;

// ─── Phase 1 Foundation Tables ────────────────────────────────────────────────
// These tables are created empty in Phase 1 and will be populated in Phase 2/3.
// DO NOT populate these tables until explicitly approved.

// ─── Treatment Cases (Phase 1: empty foundation) ──────────────────────────────
// One row per treatment journey. Populated in Phase 3.
export const treatmentCases = pgTable("treatment_cases", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  // Case type — the actual procedure being performed
  caseType: pg_caseType("caseType"),
  // Primary lead/patient (usually the female partner)
  primaryLeadId: integer("primaryLeadId"),
  primaryPatientId: integer("primaryPatientId"),
  // Partner lead/patient (usually the male partner)
  partnerLeadId: integer("partnerLeadId"),
  partnerPatientId: integer("partnerPatientId"),
  // Case status
  status: pg_status_24("status").default("active"),
  // Notes
  notes: text("notes"),
  // Audit
  createdBy: integer("createdBy"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type TreatmentCase = typeof treatmentCases.$inferSelect;
export type InsertTreatmentCase = typeof treatmentCases.$inferInsert;

// ─── Case Participants (Phase 1: empty foundation) ────────────────────────────
// Junction table linking leads/patients to treatment cases. Populated in Phase 3.
export const caseParticipants = pgTable("case_participants", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  caseId: integer("caseId").notNull(),
  // Participant can be a lead or a patient (one of these will be set)
  leadId: integer("leadId"),
  patientId: integer("patientId"),
  // Role in the case
  role: pg_role_2("role"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type CaseParticipant = typeof caseParticipants.$inferSelect;
export type InsertCaseParticipant = typeof caseParticipants.$inferInsert;

// ─── Migration Conflict Log (Phase 1: empty foundation) ──────────────────────
// Logs data conflicts discovered during Health Record migration in Phase 2.
// Admin-only resolution. Populated in Phase 2.
export const migrationConflictLog = pgTable("migration_conflict_log", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  // What kind of conflict
  conflictType: varchar("conflictType", { length: 64 }), // e.g. "field_value_mismatch", "duplicate_record"
  // Source record (where the data is coming FROM)
  sourceRecordType: varchar("sourceRecordType", { length: 64 }), // e.g. "medical_intake.maleIntake"
  sourceRecordId: integer("sourceRecordId"),
  // Target record (where the data should GO)
  targetRecordType: varchar("targetRecordType", { length: 64 }), // e.g. "medical_intake"
  targetRecordId: integer("targetRecordId"),
  // Field details
  fieldName: varchar("fieldName", { length: 128 }),
  sourceValue: text("sourceValue"),   // JSON-serialized old value
  targetValue: text("targetValue"),   // JSON-serialized new/conflicting value
  // Suggested action (set by migration logic)
  suggestedAction: varchar("suggestedAction", { length: 64 }), // "keep_source" | "keep_target" | "merge" | "review"
  // Escalation workflow
  // Status: pending → ready_for_admin_review → resolved | dismissed
  status: pg_status_25("status").default("pending"),
  flaggedBy: integer("flaggedBy"),        // userId of coordinator who flagged
  flaggedAt: timestamp("flaggedAt", { withTimezone: true, mode: "date" }),
  // Admin resolution
  resolvedBy: integer("resolvedBy"),      // userId of admin who resolved
  resolvedAt: timestamp("resolvedAt", { withTimezone: true, mode: "date" }),
  resolutionDecision: varchar("resolutionDecision", { length: 64 }), // "kept_source" | "kept_target" | "merged" | "dismissed"
  adminNotes: text("adminNotes"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type MigrationConflictLog = typeof migrationConflictLog.$inferSelect;
export type InsertMigrationConflictLog = typeof migrationConflictLog.$inferInsert;

// ── Conflict Resolution Log (idempotency table for resolveIntakeConflict) ────
export const conflictResolutionLog = pgTable("conflict_resolution_log", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  requestId: varchar("requestId", { length: 128 }).notNull().unique(),
  leadId: integer("leadId").notNull(),
  patientId: integer("patientId").notNull(),
  resolvedBy: integer("resolvedBy").notNull(),
  newIntakeId: integer("newIntakeId"),
  docHandling: varchar("docHandling", { length: 32 }).notNull(),
  newIntakeMode: varchar("newIntakeMode", { length: 32 }).notNull(),
  archivedDocs: jsonb("archivedDocs"),
  deletedDocs: jsonb("deletedDocs"),
  storagePendingDocs: jsonb("storagePendingDocs"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
export type ConflictResolutionLog = typeof conflictResolutionLog.$inferSelect;
export type InsertConflictResolutionLog = typeof conflictResolutionLog.$inferInsert;

// ─── Draft Sessions (Phase 2 Correction) ─────────────────────────────────────
// Lightweight server-side metadata for Health Record edit sessions.
// Does NOT store clinical form JSON (that stays in localStorage).
// One row per active edit session; cleaned up after Save or Cancel.
export const draftSessions = pgTable("draft_sessions", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  draftSessionId: varchar("draftSessionId", { length: 64 }).notNull().unique(),
  // Canonical person identity
  leadId: integer("leadId"),
  patientId: integer("patientId"),
  intakeId: integer("intakeId"), // null for new intakes
  // Writer token — rotated on takeover; every mutation must present the current token
  activeWriterToken: varchar("activeWriterToken", { length: 64 }).notNull(),
  writerLeaseExpiresAt: timestamp("writerLeaseExpiresAt", { withTimezone: true, mode: "date" }).notNull(),
  // Activity tracking
  lastMeaningfulActivityAt: timestamp("lastMeaningfulActivityAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  createdBy: integer("createdBy").notNull(),
  // Status state machine: active → saved | cancelled | expired
  status: pg_status_26("status").default("active").notNull(),
  // Terminal-state timestamps
  pendingExpiresAt: timestamp("pendingExpiresAt", { withTimezone: true, mode: "date" }),       // when the session expires if inactive
  savedAt: timestamp("savedAt", { withTimezone: true, mode: "date" }),                         // set when status → saved
  canceledAt: timestamp("canceledAt", { withTimezone: true, mode: "date" }),                   // set when status → cancelled
  canceledBy: integer("canceledBy"),                         // userId who cancelled
  expiredAt: timestamp("expiredAt", { withTimezone: true, mode: "date" }),                     // set when status → expired
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type DraftSession = typeof draftSessions.$inferSelect;
export type InsertDraftSession = typeof draftSessions.$inferInsert;

// ─── Extraction Attempts (Phase 2 Final Correction) ──────────────────────────
// Tracks each AI extraction/translation attempt per document.
// Enables: attempt identity, retry supersession, late-write rejection.
export const extractionAttempts = pgTable("extraction_attempts", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  // Unique attempt identifier — used as the generation/attempt ID
  attemptId: varchar("attemptId", { length: 64 }).notNull().unique(),
  // The document being extracted
  documentId: integer("documentId").notNull(),
  // The draft session that owns this attempt (null for direct-upload / active docs)
  draftSessionId: varchar("draftSessionId", { length: 64 }),
  // Generation counter — incremented on each retry; late workers compare against this
  generationId: integer("generationId").notNull().default(1),
  // Status: pending | processing | completed | failed | canceled | superseded
  status: pg_status_27("status").default("pending").notNull(),
  // The linked document_translations row (set when completed)
  translationId: integer("translationId"),
  // Who started the attempt
  createdBy: integer("createdBy").notNull(),
  // Timestamps
  startedAt: timestamp("startedAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  completedAt: timestamp("completedAt", { withTimezone: true, mode: "date" }),
  canceledAt: timestamp("canceledAt", { withTimezone: true, mode: "date" }),
  // If superseded, points to the newer attemptId
  supersededBy: varchar("supersededBy", { length: 64 }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type ExtractionAttempt = typeof extractionAttempts.$inferSelect;
export type InsertExtractionAttempt = typeof extractionAttempts.$inferInsert;

// ─── AI Control Plane Foundation: metadata-only usage ledger ─────────────────
// These tables intentionally contain operational metadata only. They must never
// store prompts, responses, patient/lead identifiers, document content, file URLs,
// credentials, or raw provider errors.
export const aiUsageRequests = pgTable("ai_usage_requests", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  logicalRequestId: varchar("logicalRequestId", { length: 64 }).notNull().unique(),
  workloadId: varchar("workloadId", { length: 96 }).notNull(),
  configurationScope: varchar("configurationScope", { length: 96 }).notNull().default("platform_default"),
  status: pg_status_28("status").notNull().default("started"),
  attemptCount: integer("attemptCount").notNull().default(0),
  fallbackUsed: boolean("fallbackUsed").notNull().default(false),
  totalLatencyMs: integer("totalLatencyMs"),
  inputTokens: bigint("inputTokens", { mode: "number" }),
  outputTokens: bigint("outputTokens", { mode: "number" }),
  cachedTokens: bigint("cachedTokens", { mode: "number" }),
  totalTokens: bigint("totalTokens", { mode: "number" }),
  nonTokenUnit: varchar("nonTokenUnit", { length: 48 }),
  nonTokenQuantity: numeric("nonTokenQuantity", { precision: 14, scale: 3 }),
  estimatedCost: numeric("estimatedCost", { precision: 18, scale: 8 }),
  providerReportedCost: numeric("providerReportedCost", { precision: 18, scale: 8 }),
  costCurrency: varchar("costCurrency", { length: 8 }),
  failureCategory: varchar("failureCategory", { length: 64 }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  completedAt: timestamp("completedAt", { withTimezone: true, mode: "date" }),
});
export type AiUsageRequest = typeof aiUsageRequests.$inferSelect;

export const aiUsageAttempts = pgTable("ai_usage_attempts", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  attemptId: varchar("attemptId", { length: 64 }).notNull().unique(),
  logicalRequestId: varchar("logicalRequestId", { length: 64 }).notNull(),
  workloadId: varchar("workloadId", { length: 96 }).notNull(),
  provider: varchar("provider", { length: 64 }).notNull(),
  model: varchar("model", { length: 160 }).notNull(),
  attemptNumber: integer("attemptNumber").notNull(),
  status: pg_status_28("status").notNull().default("started"),
  latencyMs: integer("latencyMs"),
  inputTokens: bigint("inputTokens", { mode: "number" }),
  outputTokens: bigint("outputTokens", { mode: "number" }),
  cachedTokens: bigint("cachedTokens", { mode: "number" }),
  totalTokens: bigint("totalTokens", { mode: "number" }),
  nonTokenUnit: varchar("nonTokenUnit", { length: 48 }),
  nonTokenQuantity: numeric("nonTokenQuantity", { precision: 14, scale: 3 }),
  providerUsageAvailable: boolean("providerUsageAvailable").notNull().default(false),
  failureCategory: varchar("failureCategory", { length: 64 }),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  completedAt: timestamp("completedAt", { withTimezone: true, mode: "date" }),
});
export type AiUsageAttempt = typeof aiUsageAttempts.$inferSelect;

// ─── Save Idempotency (Phase 2 Correction) ────────────────────────────────────
// Records each Health Record Save attempt to prevent double-execution.
// Does NOT store full clinical JSON.
export const saveIdempotency = pgTable("save_idempotency", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  requestId: varchar("requestId", { length: 64 }).notNull().unique(),
  draftSessionId: varchar("draftSessionId", { length: 64 }).notNull(),
  // Canonical person identity
  leadId: integer("leadId"),
  patientId: integer("patientId"),
  // Payload fingerprint (SHA-256 of canonical payload, not full JSON)
  payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
  // Status: 'processing' | 'completed' | 'failed'
  status: pg_status_29("status").default("processing").notNull(),
  // Result snapshot (minimal — just the intakeId and promoted doc IDs)
  resultIntakeId: integer("resultIntakeId"),
  resultPromotedDocIds: jsonb("resultPromotedDocIds"), // number[]
  resultArchivedDocIds: jsonb("resultArchivedDocIds"), // number[]
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true, mode: "date" }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export type SaveIdempotency = typeof saveIdempotency.$inferSelect;
export type InsertSaveIdempotency = typeof saveIdempotency.$inferInsert;

export const zernioWebhookEvents = pgTable("zernio_webhook_events", {
  id: integer("id").generatedByDefaultAsIdentity().primaryKey(),
  provider: varchar("provider", { length: 32 }).notNull().default("zernio"),
  eventId: varchar("eventId", { length: 191 }).notNull(),
  eventType: varchar("eventType", { length: 128 }).notNull(),
  payloadHash: varchar("payloadHash", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).notNull().default("processing"),
  createdAt: timestamp("createdAt", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  processedAt: timestamp("processedAt", { withTimezone: true, mode: "date" }),
}, (table) => [
  uniqueIndex("zernio_webhook_events_provider_event_uq").on(table.provider, table.eventId),
]);
export type ZernioWebhookEvent = typeof zernioWebhookEvents.$inferSelect;
export type InsertZernioWebhookEvent = typeof zernioWebhookEvents.$inferInsert;
