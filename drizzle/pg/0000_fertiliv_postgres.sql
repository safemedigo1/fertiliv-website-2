CREATE TYPE "public"."pg_accessState" AS ENUM('available', 'quarantined', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."pg_action" AS ENUM('open', 'download', 'denied');--> statement-breakpoint
CREATE TYPE "public"."pg_aiConfidence" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."pg_alcohol" AS ENUM('never', 'occasional', 'regular');--> statement-breakpoint
CREATE TYPE "public"."pg_aliasState" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."pg_appliedPriceType" AS ENUM('local', 'international');--> statement-breakpoint
CREATE TYPE "public"."pg_appointmentType" AS ENUM('in-clinic', 'online', 'external');--> statement-breakpoint
CREATE TYPE "public"."pg_attemptState" AS ENUM('pending', 'submitting', 'accepted', 'delivered', 'read', 'failed', 'ambiguous', 'requires_retry');--> statement-breakpoint
CREATE TYPE "public"."pg_brand" AS ENUM('fertiliv', 'safemedigo', 'dr-nilay-karaca');--> statement-breakpoint
CREATE TYPE "public"."pg_callbackMethod" AS ENUM('whatsapp', 'phone', 'video_call', 'email');--> statement-breakpoint
CREATE TYPE "public"."pg_cancellation_status" AS ENUM('requested', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."pg_candidateType" AS ENUM('person', 'lead', 'patient');--> statement-breakpoint
CREATE TYPE "public"."pg_caseType" AS ENUM('ivf', 'icsi', 'iui', 'egg_freezing', 'sperm_freezing', 'micro_tese', 'other');--> statement-breakpoint
CREATE TYPE "public"."pg_category" AS ENUM('auth', 'patient', 'lead', 'appointment', 'medical_note', 'user_management', 'navigation', 'other');--> statement-breakpoint
CREATE TYPE "public"."pg_category_2" AS ENUM('lab_test', 'radiology_test', 'pathology_test', 'other_test', 'procedure', 'consultation', 'medicine');--> statement-breakpoint
CREATE TYPE "public"."pg_category_3" AS ENUM('lab', 'radiology', 'pathology', 'other');--> statement-breakpoint
CREATE TYPE "public"."pg_changeType" AS ENUM('created', 'updated', 'alias_added', 'alias_removed', 'approved_from_pending', 'bulk_enriched');--> statement-breakpoint
CREATE TYPE "public"."pg_channel" AS ENUM('email');--> statement-breakpoint
CREATE TYPE "public"."pg_communicationMethod" AS ENUM('whatsapp', 'phone_call', 'video_call', 'email', 'in_person');--> statement-breakpoint
CREATE TYPE "public"."pg_communicationType" AS ENUM('manual_appointment_details');--> statement-breakpoint
CREATE TYPE "public"."pg_confidence" AS ENUM('high', 'medium');--> statement-breakpoint
CREATE TYPE "public"."pg_connectionRoute" AS ENUM('legacy_env', 'persisted');--> statement-breakpoint
CREATE TYPE "public"."pg_contactRole" AS ENUM('female-patient', 'male-patient', 'husband-for-couple', 'wife-for-couple', 'family-member', 'agent', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."pg_conversationType" AS ENUM('private', 'group');--> statement-breakpoint
CREATE TYPE "public"."pg_correlationState" AS ENUM('correlated', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."pg_credentialKind" AS ENUM('business_access_token');--> statement-breakpoint
CREATE TYPE "public"."pg_credentialSource" AS ENUM('legacy_env', 'secret_reference');--> statement-breakpoint
CREATE TYPE "public"."pg_currency" AS ENUM('USD', 'EUR', 'GBP', 'TRY');--> statement-breakpoint
CREATE TYPE "public"."pg_currency_2" AS ENUM('USD', 'EUR', 'GBP', 'TRY', 'SAR', 'AED', 'AUD');--> statement-breakpoint
CREATE TYPE "public"."pg_currency_3" AS ENUM('USD', 'EUR', 'GBP', 'TRY', 'SAR', 'AED');--> statement-breakpoint
CREATE TYPE "public"."pg_cycleRegularity" AS ENUM('regular', 'irregular', 'absent');--> statement-breakpoint
CREATE TYPE "public"."pg_decisionTimeline" AS ENUM('immediately', '1-2-weeks', '1-month', '2-months', '3-months', '1-3-months', '6-months', 'exploring');--> statement-breakpoint
CREATE TYPE "public"."pg_defaultFinancialScope" AS ENUM('production', 'test');--> statement-breakpoint
CREATE TYPE "public"."pg_deliveryStatus" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."pg_direction" AS ENUM('incoming', 'outgoing');--> statement-breakpoint
CREATE TYPE "public"."pg_direction_2" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TYPE "public"."pg_discountType" AS ENUM('percentage', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."pg_duplicateDetection" AS ENUM('suggest', 'require_confirmation');--> statement-breakpoint
CREATE TYPE "public"."pg_endpointKind" AS ENUM('phone');--> statement-breakpoint
CREATE TYPE "public"."pg_endpointResolutionState" AS ENUM('unresolved', 'candidate_single', 'candidate_multiple', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."pg_evidenceState" AS ENUM('provider_hint');--> statement-breakpoint
CREATE TYPE "public"."pg_exactPhoneMatch" AS ENUM('suggest', 'auto_link_trusted', 'never_auto_link');--> statement-breakpoint
CREATE TYPE "public"."pg_financialScope" AS ENUM('production', 'test');--> statement-breakpoint
CREATE TYPE "public"."pg_flag" AS ENUM('normal', 'low', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."pg_fromCredentialSource" AS ENUM('legacy_env', 'secret_reference');--> statement-breakpoint
CREATE TYPE "public"."pg_fromOnboardingMethod" AS ENUM('manual_cloud_api', 'meta_embedded_signup', 'meta_coexistence');--> statement-breakpoint
CREATE TYPE "public"."pg_fxRateSource" AS ENUM('system', 'manual');--> statement-breakpoint
CREATE TYPE "public"."pg_gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."pg_googleReminderMode" AS ENUM('calendar_default', 'custom');--> statement-breakpoint
CREATE TYPE "public"."pg_healthState" AS ENUM('unknown', 'healthy', 'degraded', 'unavailable');--> statement-breakpoint
CREATE TYPE "public"."pg_humanActorResolutionState" AS ENUM('unresolved', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."pg_identityBasis" AS ENUM('remote_endpoint', 'provider_thread');--> statement-breakpoint
CREATE TYPE "public"."pg_identityKind" AS ENUM('human');--> statement-breakpoint
CREATE TYPE "public"."pg_infertilityType" AS ENUM('primary', 'secondary');--> statement-breakpoint
CREATE TYPE "public"."pg_intakeMode" AS ENUM('legacy', 'female', 'male', 'general');--> statement-breakpoint
CREATE TYPE "public"."pg_intentType" AS ENUM('text', 'template', 'document');--> statement-breakpoint
CREATE TYPE "public"."pg_interestLevel" AS ENUM('cold', 'warm', 'hot');--> statement-breakpoint
CREATE TYPE "public"."pg_ivfExperience" AS ENUM('never-tried', 'tried-unsuccessful', 'tried-again', 'tried-multiple');--> statement-breakpoint
CREATE TYPE "public"."pg_leadOrigin" AS ENUM('staff-created', 'self-submitted');--> statement-breakpoint
CREATE TYPE "public"."pg_leadSource" AS ENUM('paid', 'employee-referral', 'external-referral', 'website', 'maps', 'partner', 'public-relations', 'instagram', 'tiktok', 'doctor-referral', 'youtube', 'facebook', 'awatef-guide', 'salim-guide', 'organic');--> statement-breakpoint
CREATE TYPE "public"."pg_leadStatus" AS ENUM('intake', 'attempted-to-contact', 'contacted-awaiting-info', 'medical-reports-received', 'doctor-feedback-shared', 'follow-up-negotiation', 'ready-to-travel', 'converted', 'cold', 'lost', 'not-qualified', 'junk');--> statement-breakpoint
CREATE TYPE "public"."pg_lifecycleState" AS ENUM('not_started', 'creating_session', 'waiting_for_qr', 'qr_ready', 'qr_expired', 'linking', 'connected', 'reconnecting', 'disconnected', 'logged_out', 'session_invalid', 'failed', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."pg_lifecycleState_2" AS ENUM('active', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."pg_lifecycleState_3" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."pg_lifecycleStatus" AS ENUM('active', 'historical', 'direct-upload', 'deletion-pending', 'pending-draft');--> statement-breakpoint
CREATE TYPE "public"."pg_lifecycleStatus_2" AS ENUM('onboarding', 'connected', 'needs_attention', 'paused', 'disconnected', 'error');--> statement-breakpoint
CREATE TYPE "public"."pg_linePricingMethod" AS ENUM('none', 'discount_percent', 'final_line_total', 'agreed_unit_price');--> statement-breakpoint
CREATE TYPE "public"."pg_linkState" AS ENUM('confirmed', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."pg_location" AS ENUM('in-clinic', 'partner-clinic', 'patient-country');--> statement-breakpoint
CREATE TYPE "public"."pg_matchedField" AS ENUM('phone', 'secondaryPhone');--> statement-breakpoint
CREATE TYPE "public"."pg_matchedField_2" AS ENUM('exact_phone', 'provider_hint');--> statement-breakpoint
CREATE TYPE "public"."pg_mediaState" AS ENUM('metadata_only', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."pg_medicalSubjectResolutionState" AS ENUM('unresolved');--> statement-breakpoint
CREATE TYPE "public"."pg_medicalVerdict" AS ENUM('same', 'different', 'related_separate', 'unclear');--> statement-breakpoint
CREATE TYPE "public"."pg_method" AS ENUM('cash', 'credit_card', 'bank_transfer', 'insurance', 'other');--> statement-breakpoint
CREATE TYPE "public"."pg_method_2" AS ENUM('cash', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."pg_method_3" AS ENUM('cash', 'bank_transfer', 'card_reversal', 'other');--> statement-breakpoint
CREATE TYPE "public"."pg_module" AS ENUM('leads', 'patients', 'calendar', 'finance', 'lab', 'settings', 'analytics');--> statement-breakpoint
CREATE TYPE "public"."pg_monitoringType" AS ENUM('screen', 'screenshot', 'camera', 'microphone');--> statement-breakpoint
CREATE TYPE "public"."pg_newSenderBehavior" AS ENUM('conversation_only', 'create_contact', 'create_lead');--> statement-breakpoint
CREATE TYPE "public"."pg_normalizationState" AS ENUM('normalized', 'quarantined');--> statement-breakpoint
CREATE TYPE "public"."pg_noteType" AS ENUM('consultation', 'follow_up', 'procedure', 'lab_review', 'general');--> statement-breakpoint
CREATE TYPE "public"."pg_onboardingMethod" AS ENUM('manual_cloud_api', 'meta_embedded_signup', 'meta_coexistence', 'linked_device_wppconnect_sandbox', 'linked_device_wppconnect_server', 'zernio');--> statement-breakpoint
CREATE TYPE "public"."pg_operation" AS ENUM('upsert', 'delete');--> statement-breakpoint
CREATE TYPE "public"."pg_orderType" AS ENUM('Single Result Test', 'Timed Component', 'Protocol Name', 'Genetic / Molecular');--> statement-breakpoint
CREATE TYPE "public"."pg_originPaymentMethod" AS ENUM('cash', 'credit_card', 'bank_transfer', 'insurance', 'other');--> statement-breakpoint
CREATE TYPE "public"."pg_outcome" AS ENUM('sent', 'retryable_failure', 'permanent_failure', 'skipped_recipient_unavailable', 'invalidated_before_send');--> statement-breakpoint
CREATE TYPE "public"."pg_participantRole" AS ENUM('remote_endpoint', 'group_participant');--> statement-breakpoint
CREATE TYPE "public"."pg_participantState" AS ENUM('unresolved', 'candidate', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."pg_patientType" AS ENUM('local', 'international');--> statement-breakpoint
CREATE TYPE "public"."pg_patientType_2" AS ENUM('local', 'international', 'not-specified');--> statement-breakpoint
CREATE TYPE "public"."pg_payoutCurrency" AS ENUM('USD', 'EUR', 'GBP', 'TRY', 'SAR', 'AED', 'AUD');--> statement-breakpoint
CREATE TYPE "public"."pg_personGender" AS ENUM('female', 'male');--> statement-breakpoint
CREATE TYPE "public"."pg_phoneVisibility" AS ENUM('full_authorized', 'mask_selected_roles', 'admin_only_full');--> statement-breakpoint
CREATE TYPE "public"."pg_priceEntryCurrency" AS ENUM('USD', 'EUR', 'GBP', 'TRY', 'SAR', 'AED');--> statement-breakpoint
CREATE TYPE "public"."pg_priceEntryKind" AS ENUM('unit_price', 'final_line_total', 'tax_included_final_line_total', 'agreed_unit_price', 'tax_included_agreed_unit_price');--> statement-breakpoint
CREATE TYPE "public"."pg_priceFxSource" AS ENUM('system', 'manual');--> statement-breakpoint
CREATE TYPE "public"."pg_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."pg_priority_2" AS ENUM('routine', 'urgent', 'stat');--> statement-breakpoint
CREATE TYPE "public"."pg_processingState" AS ENUM('received', 'processing', 'applied', 'quarantined', 'failed', 'dead_letter');--> statement-breakpoint
CREATE TYPE "public"."pg_processingStatus" AS ENUM('processed', 'reviewed', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."pg_protocol" AS ENUM('antagonist', 'long', 'oks_long', 'patch_ant', 'mikrodoz', 'other');--> statement-breakpoint
CREATE TYPE "public"."pg_provider" AS ENUM('meta', 'wppconnect', 'zernio');--> statement-breakpoint
CREATE TYPE "public"."pg_providerApprovalState" AS ENUM('blocked', 'approved');--> statement-breakpoint
CREATE TYPE "public"."pg_providerDirection" AS ENUM('inbound', 'outbound_echo', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."pg_purpose" AS ENUM('sales-consultation', 'medical-consultation', 'follow-up', 'procedure', 'diagnostic-test');--> statement-breakpoint
CREATE TYPE "public"."pg_reason" AS ENUM('vacation', 'sick_leave', 'training', 'personal', 'other');--> statement-breakpoint
CREATE TYPE "public"."pg_recipientType" AS ENUM('patient', 'lead', 'partner', 'additional');--> statement-breakpoint
CREATE TYPE "public"."pg_recipientType_2" AS ENUM('patient', 'lead');--> statement-breakpoint
CREATE TYPE "public"."pg_recordType" AS ENUM('lead', 'patient');--> statement-breakpoint
CREATE TYPE "public"."pg_relationshipRole" AS ENUM('patient', 'husband', 'wife', 'representative', 'family', 'translator', 'other');--> statement-breakpoint
CREATE TYPE "public"."pg_relationshipState" AS ENUM('active', 'retired');--> statement-breakpoint
CREATE TYPE "public"."pg_resolutionState" AS ENUM('unresolved', 'candidate_single', 'candidate_multiple', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."pg_result" AS ENUM('positive', 'negative', 'biochemical', 'clinical', 'ongoing', 'delivered', 'miscarriage', 'pending');--> statement-breakpoint
CREATE TYPE "public"."pg_resultType" AS ENUM('Quantitative', 'Qualitative', 'Molecular/PCR', 'Genetic', 'Microbiology Culture', 'Microscopy/Parasitology', 'Panel/Profile', 'Pathology/Biopsy', 'Semen Analysis', 'Semen DNA', 'Therapeutic Drug Monitoring', 'Descriptive/Report');--> statement-breakpoint
CREATE TYPE "public"."pg_role" AS ENUM('patient', 'staff', 'doctor', 'admin', 'manager');--> statement-breakpoint
CREATE TYPE "public"."pg_role_2" AS ENUM('primary_female', 'primary_male', 'donor', 'surrogate', 'other');--> statement-breakpoint
CREATE TYPE "public"."pg_routingState" AS ENUM('legacy_env', 'resolved', 'unmapped', 'mismatched', 'unsupported');--> statement-breakpoint
CREATE TYPE "public"."pg_runtimeMode" AS ENUM('sandbox', 'persistent_worker');--> statement-breakpoint
CREATE TYPE "public"."pg_scope" AS ENUM('global', 'patient');--> statement-breakpoint
CREATE TYPE "public"."pg_serviceFor" AS ENUM('female-only', 'male-only', 'couple');--> statement-breakpoint
CREATE TYPE "public"."pg_smoking" AS ENUM('never', 'former', 'current');--> statement-breakpoint
CREATE TYPE "public"."pg_source" AS ENUM('paid', 'employee-referral', 'external-referral', 'website', 'maps', 'partner', 'public-relations', 'instagram', 'tiktok', 'doctor-referral', 'youtube', 'facebook', 'awatef-guide', 'salim-guide', 'organic');--> statement-breakpoint
CREATE TYPE "public"."pg_sourceCreditCurrency" AS ENUM('USD', 'EUR', 'GBP', 'TRY', 'SAR', 'AED', 'AUD');--> statement-breakpoint
CREATE TYPE "public"."pg_sourceCurrency" AS ENUM('USD', 'EUR', 'GBP', 'TRY', 'SAR', 'AED', 'AUD');--> statement-breakpoint
CREATE TYPE "public"."pg_sourceType" AS ENUM('payment', 'credit', 'fx_rounding_adjustment');--> statement-breakpoint
CREATE TYPE "public"."pg_source_2" AS ENUM('patient_entry', 'pdf_import');--> statement-breakpoint
CREATE TYPE "public"."pg_state" AS ENUM('started', 'cancelled', 'failed', 'completed');--> statement-breakpoint
CREATE TYPE "public"."pg_state_2" AS ENUM('not_started', 'creating_session', 'waiting_for_qr', 'qr_ready', 'qr_expired', 'linking', 'connected', 'reconnecting', 'disconnected', 'logged_out', 'session_invalid', 'failed', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."pg_state_3" AS ENUM('pending', 'accepted', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."pg_status" AS ENUM('pending', 'active', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."pg_status_10" AS ENUM('ordered', 'sample_collected', 'processing', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pg_status_11" AS ENUM('draft', 'sent', 'accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."pg_status_12" AS ENUM('connected', 'needs_attention');--> statement-breakpoint
CREATE TYPE "public"."pg_status_13" AS ENUM('planned', 'stimulation', 'retrieval', 'transfer', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pg_status_14" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."pg_status_15" AS ENUM('active', 'voided');--> statement-breakpoint
CREATE TYPE "public"."pg_status_16" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."pg_status_17" AS ENUM('received', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."pg_status_18" AS ENUM('active', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."pg_status_19" AS ENUM('open', 'in_progress', 'done', 'deferred');--> statement-breakpoint
CREATE TYPE "public"."pg_status_2" AS ENUM('inquiry', 'lead', 'qualified', 'proposal_sent', 'active_patient', 'inactive', 'archived');--> statement-breakpoint
CREATE TYPE "public"."pg_status_20" AS ENUM('draft', 'confirmed', 'sent');--> statement-breakpoint
CREATE TYPE "public"."pg_status_21" AS ENUM('pending', 'in_review', 'plan_ready');--> statement-breakpoint
CREATE TYPE "public"."pg_status_22" AS ENUM('draft', 'final');--> statement-breakpoint
CREATE TYPE "public"."pg_status_23" AS ENUM('pending', 'approved', 'rejected', 'merged');--> statement-breakpoint
CREATE TYPE "public"."pg_status_24" AS ENUM('active', 'completed', 'cancelled', 'on_hold');--> statement-breakpoint
CREATE TYPE "public"."pg_status_25" AS ENUM('pending', 'ready_for_admin_review', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."pg_status_26" AS ENUM('active', 'saved', 'cancelled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."pg_status_27" AS ENUM('pending', 'processing', 'completed', 'failed', 'canceled', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."pg_status_28" AS ENUM('started', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."pg_status_29" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."pg_status_3" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."pg_status_4" AS ENUM('upcoming', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled');--> statement-breakpoint
CREATE TYPE "public"."pg_status_5" AS ENUM('scheduled', 'claimed', 'dispatching', 'retry_pending', 'sent', 'failed', 'skipped', 'invalidated');--> statement-breakpoint
CREATE TYPE "public"."pg_status_6" AS ENUM('draft', 'issued', 'paid', 'partial', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pg_status_7" AS ENUM('draft', 'published', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."pg_status_8" AS ENUM('active', 'expired', 'used');--> statement-breakpoint
CREATE TYPE "public"."pg_status_9" AS ENUM('pending', 'in_progress', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."pg_step" AS ENUM('input', 'preview');--> statement-breakpoint
CREATE TYPE "public"."pg_suggestedModule" AS ENUM('general_lab', 'semen_analysis', 'semen_dna', 'genetic', 'radiology', 'pathology');--> statement-breakpoint
CREATE TYPE "public"."pg_syncStatus" AS ENUM('pending', 'synced', 'failed', 'deletion_pending', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."pg_targetInvoiceCurrency" AS ENUM('USD', 'EUR', 'GBP', 'TRY', 'SAR', 'AED', 'AUD');--> statement-breakpoint
CREATE TYPE "public"."pg_taxOverrideMode" AS ENUM('inherit', 'rule', 'no_tax');--> statement-breakpoint
CREATE TYPE "public"."pg_toCredentialSource" AS ENUM('legacy_env', 'secret_reference');--> statement-breakpoint
CREATE TYPE "public"."pg_toOnboardingMethod" AS ENUM('manual_cloud_api', 'meta_embedded_signup', 'meta_coexistence');--> statement-breakpoint
CREATE TYPE "public"."pg_travelReadiness" AS ENUM('ready', 'considering', 'prefers-home', 'local-patient');--> statement-breakpoint
CREATE TYPE "public"."pg_trustSource" AS ENUM('manual_confirmation', 'trusted_import');--> statement-breakpoint
CREATE TYPE "public"."pg_type" AS ENUM('consultation', 'follow_up', 'procedure', 'lab', 'radiology', 'other');--> statement-breakpoint
CREATE TYPE "public"."pg_type_2" AS ENUM('appointment_reminder', 'appointment_cancellation', 'invoice_issued', 'payment_confirmed', 'lab_result_ready', 'inbox_new_conversation', 'inbox_new_message', 'inbox_assignment', 'inbox_reassignment', 'inbox_crm_review', 'whatsapp_line_health', 'general');--> statement-breakpoint
CREATE TYPE "public"."pg_type_3" AS ENUM('overpayment', 'applied_to_invoice', 'applied_credit_reversal', 'credit_payout', 'refund_deduction', 'manual_adjustment');--> statement-breakpoint
CREATE TYPE "public"."pg_type_4" AS ENUM('callback_request', 'follow_up', 'send_info', 'consultation_request', 'other');--> statement-breakpoint
CREATE TYPE "public"."pg_type_5" AS ENUM('language', 'country', 'city', 'nationality');--> statement-breakpoint
CREATE TYPE "public"."pg_type_6" AS ENUM('offer', 'answer', 'ice-candidate', 'request', 'reject', 'end');--> statement-breakpoint
CREATE TYPE "public"."pg_visibility" AS ENUM('all', 'doctor_only', 'staff_only');--> statement-breakpoint
CREATE TABLE "ai_import_drafts" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "ai_import_drafts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"draftKey" varchar(256) NOT NULL,
	"userId" integer NOT NULL,
	"step" "pg_step" DEFAULT 'input' NOT NULL,
	"pasteText" text,
	"uploadedFiles" jsonb,
	"rows" jsonb,
	"selectedIds" jsonb,
	"matchOverrides" jsonb,
	"manualMatchAliasOptIn" jsonb,
	"lastSavedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_attempts" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "ai_usage_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attemptId" varchar(64) NOT NULL,
	"logicalRequestId" varchar(64) NOT NULL,
	"workloadId" varchar(96) NOT NULL,
	"provider" varchar(64) NOT NULL,
	"model" varchar(160) NOT NULL,
	"attemptNumber" integer NOT NULL,
	"status" "pg_status_28" DEFAULT 'started' NOT NULL,
	"latencyMs" integer,
	"inputTokens" bigint,
	"outputTokens" bigint,
	"cachedTokens" bigint,
	"totalTokens" bigint,
	"nonTokenUnit" varchar(48),
	"nonTokenQuantity" numeric(14, 3),
	"providerUsageAvailable" boolean DEFAULT false NOT NULL,
	"failureCategory" varchar(64),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone,
	CONSTRAINT "ai_usage_attempts_attemptId_unique" UNIQUE("attemptId")
);
--> statement-breakpoint
CREATE TABLE "ai_usage_requests" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "ai_usage_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"logicalRequestId" varchar(64) NOT NULL,
	"workloadId" varchar(96) NOT NULL,
	"configurationScope" varchar(96) DEFAULT 'platform_default' NOT NULL,
	"status" "pg_status_28" DEFAULT 'started' NOT NULL,
	"attemptCount" integer DEFAULT 0 NOT NULL,
	"fallbackUsed" boolean DEFAULT false NOT NULL,
	"totalLatencyMs" integer,
	"inputTokens" bigint,
	"outputTokens" bigint,
	"cachedTokens" bigint,
	"totalTokens" bigint,
	"nonTokenUnit" varchar(48),
	"nonTokenQuantity" numeric(14, 3),
	"estimatedCost" numeric(18, 8),
	"providerReportedCost" numeric(18, 8),
	"costCurrency" varchar(8),
	"failureCategory" varchar(64),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone,
	CONSTRAINT "ai_usage_requests_logicalRequestId_unique" UNIQUE("logicalRequestId")
);
--> statement-breakpoint
CREATE TABLE "appointment_activity_log" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "appointment_activity_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"appointmentId" integer NOT NULL,
	"userId" integer NOT NULL,
	"action" varchar(128) NOT NULL,
	"oldValue" text,
	"newValue" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_communication_deliveries" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "appointment_communication_deliveries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"appointmentId" integer NOT NULL,
	"sendGroupId" varchar(64) NOT NULL,
	"communicationType" "pg_communicationType" NOT NULL,
	"channel" "pg_channel" NOT NULL,
	"recipientEmail" varchar(320) NOT NULL,
	"recipientType" "pg_recipientType" NOT NULL,
	"profileLanguage" varchar(16),
	"language" varchar(16) NOT NULL,
	"localeFallbackUsed" boolean DEFAULT false NOT NULL,
	"templateKey" varchar(128) NOT NULL,
	"templateVersion" varchar(64) NOT NULL,
	"sentByUserId" integer NOT NULL,
	"deliveryStatus" "pg_deliveryStatus" NOT NULL,
	"providerMessageId" varchar(256),
	"failureClassification" varchar(64),
	"failureCode" varchar(128),
	"sentAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_reminder_deliveries" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "appointment_reminder_deliveries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"deliveryKey" varchar(64) NOT NULL,
	"appointmentId" integer NOT NULL,
	"recipientKey" varchar(96) NOT NULL,
	"recipientType" "pg_recipientType_2" NOT NULL,
	"channel" "pg_channel" DEFAULT 'email' NOT NULL,
	"scheduleRevision" integer NOT NULL,
	"offsetMinutes" integer NOT NULL,
	"dueAt" timestamp with time zone NOT NULL,
	"status" "pg_status_5" DEFAULT 'scheduled' NOT NULL,
	"nextAttemptAt" timestamp with time zone,
	"claimedAt" timestamp with time zone,
	"claimToken" varchar(64),
	"claimExpiresAt" timestamp with time zone,
	"dispatchingAt" timestamp with time zone,
	"invalidatedAt" timestamp with time zone,
	"invalidationReason" varchar(64),
	"skippedReason" varchar(96),
	"sentAt" timestamp with time zone,
	"failedAt" timestamp with time zone,
	"recipientEmail" varchar(320),
	"profileLanguage" varchar(16),
	"deliveredLanguage" varchar(16),
	"localeFallbackUsed" boolean DEFAULT false NOT NULL,
	"templateKey" varchar(128) NOT NULL,
	"templateVersion" varchar(64) NOT NULL,
	"providerMessageId" varchar(256),
	"attemptCount" integer DEFAULT 0 NOT NULL,
	"lastFailureClassification" varchar(64),
	"lastFailureCode" varchar(128),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointment_reminder_delivery_attempts" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "appointment_reminder_delivery_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"reminderDeliveryId" integer NOT NULL,
	"attemptNumber" integer NOT NULL,
	"idempotencyKey" varchar(128) NOT NULL,
	"outcome" "pg_outcome" NOT NULL,
	"attemptedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone,
	"recipientEmail" varchar(320),
	"profileLanguage" varchar(16),
	"deliveredLanguage" varchar(16),
	"localeFallbackUsed" boolean DEFAULT false NOT NULL,
	"providerMessageId" varchar(256),
	"failureClassification" varchar(64),
	"failureCode" varchar(128)
);
--> statement-breakpoint
CREATE TABLE "appointment_reschedule_events" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "appointment_reschedule_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"appointmentId" integer NOT NULL,
	"appointmentCode" varchar(32),
	"patientId" integer,
	"leadId" integer,
	"timeOffId" integer,
	"oldStart" timestamp with time zone NOT NULL,
	"oldEnd" timestamp with time zone NOT NULL,
	"newStart" timestamp with time zone NOT NULL,
	"newEnd" timestamp with time zone NOT NULL,
	"actorId" integer NOT NULL,
	"source" varchar(64) NOT NULL,
	"exceptionReason" text,
	"executedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appointments" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "appointments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer,
	"leadId" integer,
	"doctorId" integer,
	"serviceId" integer,
	"staffId" integer,
	"hostUserId" integer,
	"title" varchar(256) NOT NULL,
	"appointmentDate" timestamp with time zone NOT NULL,
	"endDate" timestamp with time zone,
	"duration" integer DEFAULT 30,
	"type" "pg_type" DEFAULT 'consultation' NOT NULL,
	"appointmentType" "pg_appointmentType" DEFAULT 'in-clinic',
	"purpose" "pg_purpose",
	"meetingLink" text,
	"partnerClinicId" integer,
	"externalLocation" text,
	"status" "pg_status_4" DEFAULT 'upcoming' NOT NULL,
	"notes" text,
	"cancellationReason" text,
	"availabilityOverrideReason" text,
	"availabilityOverrideById" integer,
	"availabilityOverrideAt" timestamp with time zone,
	"availabilityOverrideTimeOffId" integer,
	"googleReminderMode" "pg_googleReminderMode" DEFAULT 'calendar_default' NOT NULL,
	"appointmentScheduleRevision" integer DEFAULT 1 NOT NULL,
	"reminderSent" boolean DEFAULT false,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"code" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "audit_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer,
	"userName" varchar(256),
	"userRole" varchar(64),
	"action" varchar(128) NOT NULL,
	"category" "pg_category" DEFAULT 'other' NOT NULL,
	"description" text,
	"recordId" integer,
	"recordType" varchar(64),
	"page" varchar(256),
	"durationSeconds" integer,
	"ipAddress" varchar(64),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_comments" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "case_comments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"leadId" integer,
	"patientId" integer,
	"authorId" integer NOT NULL,
	"content" text NOT NULL,
	"isSystemEvent" boolean DEFAULT false NOT NULL,
	"visibility" "pg_visibility" DEFAULT 'all' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "case_participants" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "case_participants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"caseId" integer NOT NULL,
	"leadId" integer,
	"patientId" integer,
	"role" "pg_role_2",
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clinic_info" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "clinic_info_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"nameEn" varchar(256),
	"nameAr" varchar(256),
	"nameTr" varchar(256),
	"sloganEn" varchar(512),
	"sloganAr" varchar(512),
	"sloganTr" varchar(512),
	"addressEn" text,
	"addressAr" text,
	"addressTr" text,
	"bioEn" text,
	"bioAr" text,
	"bioTr" text,
	"email" varchar(256),
	"whatsapp" varchar(64),
	"website" varchar(512),
	"mapsLink" text,
	"logoEnLightKey" varchar(512),
	"logoEnDarkKey" varchar(512),
	"logoArLightKey" varchar(512),
	"logoArDarkKey" varchar(512),
	"stampKey" varchar(512),
	"defaultWeeklySchedule" jsonb,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedBy" integer
);
--> statement-breakpoint
CREATE TABLE "clinic_tags" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "clinic_tags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(64) NOT NULL,
	"color" varchar(16) DEFAULT '#6366f1' NOT NULL,
	"createdByUserId" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_sequences" (
	"entity_type" varchar(64) PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_media_access_audits" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "communication_media_access_audits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"mediaAssetId" integer NOT NULL,
	"conversationId" integer NOT NULL,
	"actorId" integer NOT NULL,
	"action" "pg_action" NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_media_assets" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "communication_media_assets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversationId" integer NOT NULL,
	"normalizedMediaId" integer,
	"channelKind" varchar(64) NOT NULL,
	"storageKey" varchar(512) NOT NULL,
	"encryptedAtRest" boolean DEFAULT true NOT NULL,
	"encryptionVersion" varchar(32) DEFAULT 'storage-managed-v1' NOT NULL,
	"mediaType" varchar(64) NOT NULL,
	"mimeType" varchar(128),
	"filename" varchar(512),
	"sha256" varchar(128),
	"accessState" "pg_accessState" DEFAULT 'available' NOT NULL,
	"retentionUntil" timestamp with time zone,
	"createdById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "communication_media_assets_storageKey_unique" UNIQUE("storageKey")
);
--> statement-breakpoint
CREATE TABLE "conflict_resolution_log" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "conflict_resolution_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"requestId" varchar(128) NOT NULL,
	"leadId" integer NOT NULL,
	"patientId" integer NOT NULL,
	"resolvedBy" integer NOT NULL,
	"newIntakeId" integer,
	"docHandling" varchar(32) NOT NULL,
	"newIntakeMode" varchar(32) NOT NULL,
	"archivedDocs" jsonb,
	"deletedDocs" jsonb,
	"storagePendingDocs" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conflict_resolution_log_requestId_unique" UNIQUE("requestId")
);
--> statement-breakpoint
CREATE TABLE "credit_transactions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "credit_transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer NOT NULL,
	"financialScope" "pg_financialScope" DEFAULT 'production' NOT NULL,
	"currency" "pg_currency_2" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"type" "pg_type_3" NOT NULL,
	"originPaymentId" integer,
	"originInvoiceId" integer,
	"sourceCreditTransactionId" integer,
	"settlementId" integer,
	"patientCreditApplicationId" integer,
	"patientCreditPayoutId" integer,
	"originPaymentMethod" "pg_originPaymentMethod",
	"targetInvoiceCurrency" "pg_targetInvoiceCurrency",
	"targetSettlementAmount" numeric(10, 2),
	"creditConversionRateToInvoice" numeric(20, 12),
	"creditFxEffectiveAt" timestamp with time zone,
	"creditFxSource" varchar(64),
	"sourceCreditAvailableBefore" numeric(10, 2),
	"invoiceId" integer,
	"notes" text,
	"recordedById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycle_medications" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "cycle_medications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cycleId" integer NOT NULL,
	"medicationName" varchar(256) NOT NULL,
	"dose" varchar(64),
	"frequency" varchar(128),
	"route" varchar(64),
	"startDate" timestamp with time zone,
	"endDate" timestamp with time zone,
	"instructions" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycle_monitoring_visits" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "cycle_monitoring_visits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cycleId" integer NOT NULL,
	"visitDate" timestamp with time zone NOT NULL,
	"cycleDay" integer,
	"doctorId" integer,
	"e2" varchar(32),
	"lh" varchar(32),
	"p4" varchar(32),
	"endometriumMm" varchar(16),
	"folliclesRight" jsonb,
	"folliclesLeft" jsonb,
	"fshDose" varchar(64),
	"hmgDose" varchar(64),
	"gnrhaDose" varchar(64),
	"antagonistDose" varchar(64),
	"ccLetrDose" varchar(64),
	"hcgDose" varchar(64),
	"sexualAbstinence" varchar(64),
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycle_outcomes" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "cycle_outcomes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cycleId" integer NOT NULL,
	"totalOocytes" integer,
	"matureOocytes" integer,
	"fertilized" integer,
	"blastocystCount" integer,
	"transferred" integer,
	"cryopreserved" integer,
	"embryoQuality" text,
	"triggerDate" timestamp with time zone,
	"opuDate" timestamp with time zone,
	"transferDate" timestamp with time zone,
	"hcgLevel" varchar(32),
	"pregnancyTestDate" timestamp with time zone,
	"result" "pg_result",
	"notes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cycle_outcomes_cycleId_unique" UNIQUE("cycleId")
);
--> statement-breakpoint
CREATE TABLE "doctor_review_requests" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "doctor_review_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"leadId" integer,
	"patientId" integer,
	"doctorId" integer NOT NULL,
	"requestedById" integer NOT NULL,
	"status" "pg_status_21" DEFAULT 'pending' NOT NULL,
	"requestedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewStartedAt" timestamp with time zone,
	"planReadyAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "doctor_sub_specializations" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "doctor_sub_specializations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"doctorId" integer NOT NULL,
	"subSpecializationId" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctors" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "doctors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"specialty" varchar(128),
	"licenseNumber" varchar(64),
	"bio" text,
	"consultationFee" numeric(10, 2),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"title" varchar(64),
	"firstName" varchar(128),
	"secondName" varchar(128),
	"thirdName" varchar(128),
	"specializationId" integer,
	"avatarUrl" text,
	"stampUrl" text,
	"code" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "document_translations" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "document_translations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer NOT NULL,
	"labResultId" integer,
	"originalFileUrl" text,
	"originalFileName" varchar(256),
	"originalLanguage" varchar(32),
	"targetLanguage" varchar(32) DEFAULT 'en' NOT NULL,
	"translatedText" text,
	"extractedText" text,
	"status" "pg_status_14" DEFAULT 'pending' NOT NULL,
	"errorMessage" text,
	"leadDocumentId" integer,
	"translatedById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_sessions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "draft_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"draftSessionId" varchar(64) NOT NULL,
	"leadId" integer,
	"patientId" integer,
	"intakeId" integer,
	"activeWriterToken" varchar(64) NOT NULL,
	"writerLeaseExpiresAt" timestamp with time zone NOT NULL,
	"lastMeaningfulActivityAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdBy" integer NOT NULL,
	"status" "pg_status_26" DEFAULT 'active' NOT NULL,
	"pendingExpiresAt" timestamp with time zone,
	"savedAt" timestamp with time zone,
	"canceledAt" timestamp with time zone,
	"canceledBy" integer,
	"expiredAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_sessions_draftSessionId_unique" UNIQUE("draftSessionId")
);
--> statement-breakpoint
CREATE TABLE "dropdown_options" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "dropdown_options_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"fieldKey" varchar(64) NOT NULL,
	"label" varchar(256) NOT NULL,
	"value" varchar(256) NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"group_label" varchar(200),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "exchange_rates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"baseCurrency" varchar(8) NOT NULL,
	"targetCurrency" varchar(8) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"sourceProvider" varchar(64),
	"rateDate" varchar(16),
	"fetchedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"isManualOverride" boolean DEFAULT false NOT NULL,
	"overriddenBy" integer,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_report_processing_runs" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "external_report_processing_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"reportId" integer NOT NULL,
	"sourceRevisionId" integer,
	"processingGoal" varchar(32) NOT NULL,
	"requestedTargetLanguage" varchar(16),
	"resolvedOutputLanguage" varchar(16) NOT NULL,
	"processedDocumentVersion" integer,
	"processingStatus" "pg_processingStatus" DEFAULT 'processed' NOT NULL,
	"processedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewedAt" timestamp with time zone,
	"reviewedById" integer,
	"finalizedAt" timestamp with time zone,
	"finalizedById" integer,
	"createdById" integer
);
--> statement-breakpoint
CREATE TABLE "external_report_source_revisions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "external_report_source_revisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"reportId" integer NOT NULL,
	"revisionNumber" integer NOT NULL,
	"sourceText" text,
	"inputMethod" varchar(16) NOT NULL,
	"sourceLanguage" varchar(16),
	"sourceAssetRefs" jsonb,
	"sourceHash" varchar(64) NOT NULL,
	"correctionReason" text,
	"capturedById" integer,
	"capturedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_reports" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "external_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer NOT NULL,
	"reportRef" varchar(50),
	"sourceOrganization" varchar(255),
	"reportType" varchar(100),
	"reportDate" timestamp with time zone,
	"originalContent" text,
	"processedContent" text,
	"processingNote" varchar(50) DEFAULT 'translated',
	"language" varchar(10) DEFAULT 'en',
	"processingGoal" varchar(32),
	"requestedTargetLanguage" varchar(16),
	"resolvedOutputLanguage" varchar(16),
	"processingRepresentation" varchar(32),
	"processedDocumentJson" jsonb,
	"processedDocumentVersion" integer,
	"v2SubmissionKey" varchar(64),
	"v2Metadata" jsonb,
	"activeSourceRevisionId" integer,
	"originalFiles" text,
	"status" "pg_status_22" DEFAULT 'draft' NOT NULL,
	"createdById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extraction_attempts" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "extraction_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attemptId" varchar(64) NOT NULL,
	"documentId" integer NOT NULL,
	"draftSessionId" varchar(64),
	"generationId" integer DEFAULT 1 NOT NULL,
	"status" "pg_status_27" DEFAULT 'pending' NOT NULL,
	"translationId" integer,
	"createdBy" integer NOT NULL,
	"startedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"completedAt" timestamp with time zone,
	"canceledAt" timestamp with time zone,
	"supersededBy" varchar(64),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extraction_attempts_attemptId_unique" UNIQUE("attemptId")
);
--> statement-breakpoint
CREATE TABLE "google_calendar_appointment_syncs" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "google_calendar_appointment_syncs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"appointmentId" integer NOT NULL,
	"provider" varchar(32) DEFAULT 'google' NOT NULL,
	"googleCalendarId" varchar(512),
	"googleEventId" varchar(1024),
	"operation" "pg_operation" DEFAULT 'upsert' NOT NULL,
	"syncStatus" "pg_syncStatus" DEFAULT 'pending' NOT NULL,
	"payloadHash" varchar(64),
	"googleEventHtmlLink" varchar(2048),
	"lastVerifiedEventAt" timestamp with time zone,
	"lastSyncedAt" timestamp with time zone,
	"lastSyncError" varchar(512),
	"retryCount" integer DEFAULT 0 NOT NULL,
	"nextRetryAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_calendar_appointment_syncs_appointmentId_unique" UNIQUE("appointmentId")
);
--> statement-breakpoint
CREATE TABLE "google_calendar_connections" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "google_calendar_connections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"provider" varchar(32) NOT NULL,
	"connectedAccountEmail" varchar(320) NOT NULL,
	"encryptedRefreshToken" text NOT NULL,
	"destinationCalendarId" varchar(512),
	"destinationCalendarName" varchar(512),
	"businessTimezone" varchar(64) DEFAULT 'Europe/Istanbul' NOT NULL,
	"status" "pg_status_12" DEFAULT 'connected' NOT NULL,
	"connectedByUserId" integer NOT NULL,
	"connectedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastValidatedAt" timestamp with time zone,
	"lastError" varchar(512),
	"testEventId" varchar(1024),
	"testEventCalendarId" varchar(512),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_calendar_connections_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
CREATE TABLE "google_calendar_oauth_states" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "google_calendar_oauth_states_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"stateHash" varchar(64) NOT NULL,
	"userId" integer NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "google_calendar_oauth_states_stateHash_unique" UNIQUE("stateHash")
);
--> statement-breakpoint
CREATE TABLE "intake_forms" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "intake_forms_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(256) NOT NULL,
	"slug" varchar(128) NOT NULL,
	"brand" "pg_brand" DEFAULT 'fertiliv' NOT NULL,
	"isDefault" boolean DEFAULT false NOT NULL,
	"fields" jsonb NOT NULL,
	"translations" jsonb NOT NULL,
	"titleTranslations" jsonb,
	"subtitleTranslations" jsonb,
	"stepsMeta" jsonb,
	"fieldConfig" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intake_forms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "invoice_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"invoiceId" integer NOT NULL,
	"serviceId" integer,
	"lineLabel" varchar(256),
	"description" varchar(256) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unitPrice" numeric(10, 2) NOT NULL,
	"totalPrice" numeric(10, 2) NOT NULL,
	"linePricingMethod" "pg_linePricingMethod" DEFAULT 'none' NOT NULL,
	"lineDiscountPercent" numeric(5, 2),
	"taxRuleId" integer,
	"taxLabelSnapshot" varchar(128),
	"taxRateSnapshot" numeric(7, 4),
	"taxIncludedMode" boolean,
	"effectiveTaxableBase" numeric(10, 2),
	"taxAmount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"priceEntryCurrency" "pg_priceEntryCurrency",
	"priceEntryAmount" numeric(18, 2),
	"priceEntryKind" "pg_priceEntryKind",
	"priceFxRateToInvoice" numeric(20, 12),
	"priceFxSourceToTryRate" numeric(20, 12),
	"priceFxInvoiceToTryRate" numeric(20, 12),
	"priceFxSource" "pg_priceFxSource",
	"priceFxEffectiveAt" timestamp with time zone,
	"priceFxNote" text
);
--> statement-breakpoint
CREATE TABLE "invoice_revisions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "invoice_revisions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"invoiceId" integer NOT NULL,
	"revisionNumber" integer NOT NULL,
	"status" "pg_status_7" NOT NULL,
	"parentPublishedRevisionId" integer,
	"snapshot" jsonb NOT NULL,
	"changeSummary" jsonb,
	"previousTotals" jsonb,
	"publishedTotals" jsonb,
	"createdById" integer,
	"publishedById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"publishedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "invoice_settlements" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "invoice_settlements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer NOT NULL,
	"invoiceId" integer NOT NULL,
	"financialScope" "pg_financialScope" DEFAULT 'production' NOT NULL,
	"currency" "pg_currency_2" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"sourceType" "pg_sourceType" NOT NULL,
	"paymentId" integer,
	"creditTransactionId" integer,
	"patientCreditApplicationId" integer,
	"sourceCreditCurrency" "pg_sourceCreditCurrency",
	"sourceCreditAmount" numeric(10, 2),
	"creditConversionRateToInvoice" numeric(20, 12),
	"creditFxEffectiveAt" timestamp with time zone,
	"creditFxSource" varchar(64),
	"fxRoundingReason" varchar(256),
	"fxRoundingSourceMinorUnit" numeric(10, 2),
	"status" "pg_status_15" DEFAULT 'active' NOT NULL,
	"voidedAt" timestamp with time zone,
	"voidedById" integer,
	"voidReason" text,
	"recordedById" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "invoices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer,
	"leadId" integer,
	"financialScope" "pg_financialScope" DEFAULT 'production' NOT NULL,
	"invoiceNumber" varchar(32) NOT NULL,
	"issueDate" timestamp with time zone DEFAULT now() NOT NULL,
	"dueDate" timestamp with time zone,
	"currency" "pg_currency" DEFAULT 'USD' NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"discountAmount" numeric(10, 2) DEFAULT '0',
	"discountPercent" numeric(5, 2) DEFAULT '0',
	"taxAmount" numeric(10, 2) DEFAULT '0',
	"totalAmount" numeric(10, 2) NOT NULL,
	"paidAmount" numeric(10, 2) DEFAULT '0',
	"status" "pg_status_6" DEFAULT 'draft' NOT NULL,
	"paymentMethod" varchar(64),
	"paymentDate" timestamp with time zone,
	"notes" text,
	"externalReceiptKey" varchar(512),
	"exchangeRateSnapshot" numeric(14, 6),
	"rateDirection" varchar(32) DEFAULT 'TRY_PER_UNIT',
	"snapshotSource" varchar(64),
	"snapshotRateDate" varchar(16),
	"createdById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"pricingMode" varchar(32),
	"finalAgreedAmount" numeric(10, 2),
	"paymentAdjustmentRateSnapshot" numeric(5, 2),
	"taxModelVersion" varchar(32),
	"settlementModelVersion" varchar(32),
	"currentRevisionNumber" integer DEFAULT 1 NOT NULL,
	"currentPublishedRevisionId" integer,
	"activeDraftRevisionId" integer,
	CONSTRAINT "invoices_invoiceNumber_unique" UNIQUE("invoiceNumber")
);
--> statement-breakpoint
CREATE TABLE "lab_dictionary" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "lab_dictionary_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"canonicalName" varchar(256) NOT NULL,
	"displayName" varchar(512) NOT NULL,
	"abbreviation" varchar(64),
	"resultType" "pg_resultType" DEFAULT 'Quantitative' NOT NULL,
	"category" varchar(128),
	"specimen" varchar(128),
	"commonUnits" varchar(256),
	"canonicalUnit" varchar(64),
	"alternativeUnits" text,
	"conversionFactors" text,
	"suggestedModule" "pg_suggestedModule" DEFAULT 'general_lab',
	"notes" text,
	"analyteGroup" varchar(256),
	"orderType" "pg_orderType" DEFAULT 'Single Result Test',
	"isActive" boolean DEFAULT true NOT NULL,
	"createdById" integer,
	"updatedById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_dictionary_aliases" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "lab_dictionary_aliases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"dictionaryId" integer NOT NULL,
	"alias" varchar(512) NOT NULL,
	"scope" "pg_scope" DEFAULT 'global' NOT NULL,
	"patientId" integer,
	"confirmedById" integer,
	"confirmedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_dictionary_changelog" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "lab_dictionary_changelog_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"dictionaryId" integer NOT NULL,
	"changeType" "pg_changeType" NOT NULL,
	"fieldName" varchar(128),
	"oldValue" text,
	"newValue" text,
	"aliasId" integer,
	"performedById" integer,
	"performedByName" varchar(256),
	"isUndone" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lab_orders" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "lab_orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer NOT NULL,
	"doctorId" integer,
	"appointmentId" integer,
	"serviceId" integer,
	"partnerClinicId" integer,
	"orderNumber" varchar(32) NOT NULL,
	"testName" varchar(256) NOT NULL,
	"category" "pg_category_3" DEFAULT 'lab' NOT NULL,
	"location" "pg_location" DEFAULT 'in-clinic',
	"status" "pg_status_10" DEFAULT 'ordered' NOT NULL,
	"priority" "pg_priority_2" DEFAULT 'routine' NOT NULL,
	"orderedDate" timestamp with time zone DEFAULT now() NOT NULL,
	"collectedDate" timestamp with time zone,
	"resultDate" timestamp with time zone,
	"notes" text,
	"invoiceId" integer,
	"invoiceStatus" varchar(32),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"code" varchar(32),
	CONSTRAINT "lab_orders_orderNumber_unique" UNIQUE("orderNumber")
);
--> statement-breakpoint
CREATE TABLE "lab_results" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "lab_results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"labOrderId" integer NOT NULL,
	"patientId" integer NOT NULL,
	"parameter" varchar(128) NOT NULL,
	"value" varchar(128) NOT NULL,
	"unit" varchar(32),
	"referenceRange" varchar(64),
	"flag" "pg_flag" DEFAULT 'normal',
	"interpretation" text,
	"reportUrl" text,
	"resultFileKey" text,
	"resultFileUrl" text,
	"translationFileKey" text,
	"translationFileUrl" text,
	"sampleCollectedAt" timestamp with time zone,
	"reportedAt" timestamp with time zone,
	"refRangeFrom" varchar(32),
	"refRangeTo" varchar(32),
	"unitConversionFormula" varchar(256),
	"flagManualOverride" boolean DEFAULT false,
	"clinicalInterpretation" text,
	"isVisibleToPatient" boolean DEFAULT false NOT NULL,
	"enteredById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_communications" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "lead_communications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"leadId" integer NOT NULL,
	"note" text NOT NULL,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" integer,
	"deletedAt" timestamp with time zone,
	"deletedBy" integer
);
--> statement-breakpoint
CREATE TABLE "lead_documents" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "lead_documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"leadId" integer,
	"patientId" integer,
	"fileKey" text NOT NULL,
	"fileUrl" text NOT NULL,
	"fileName" varchar(256) NOT NULL,
	"mimeType" varchar(128),
	"uploadedBy" integer NOT NULL,
	"tag" varchar(128),
	"intakeSection" varchar(128),
	"docPassword" varchar(256),
	"ownerType" varchar(64),
	"ownerId" integer,
	"lifecycleStatus" "pg_lifecycleStatus",
	"sourceIntakeId" integer,
	"archivedAt" timestamp with time zone,
	"archiveReason" varchar(64),
	"storageDeletePending" boolean DEFAULT false,
	"draftSessionId" varchar(64),
	"draftLastActivityAt" timestamp with time zone,
	"pendingExpiresAt" timestamp with time zone,
	"pendingCreatedBy" integer,
	"pendingSection" varchar(128),
	"pendingEntryKey" varchar(128),
	"promotedAt" timestamp with time zone,
	"storageDeleteAttempts" integer DEFAULT 0,
	"lastStorageDeleteAttemptAt" timestamp with time zone,
	"lastStorageDeleteError" varchar(512),
	"cleanupAlertedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "leads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"firstName" varchar(128) NOT NULL,
	"middleName" varchar(128),
	"lastName" varchar(128) NOT NULL,
	"dateOfBirth" date,
	"email" varchar(320),
	"phone" varchar(32),
	"secondaryPhone" varchar(32),
	"secondaryEmail" varchar(320),
	"nationality" varchar(64),
	"patientType" "pg_patientType_2",
	"preferredLanguages" jsonb,
	"primaryLanguage" varchar(16),
	"preferredContactMethods" jsonb,
	"gender" "pg_gender",
	"tcKimlikNo" varchar(20),
	"passportNumber" varchar(32),
	"interestedProcedureId" integer,
	"ivfExperience" "pg_ivfExperience" DEFAULT 'never-tried',
	"fertilityDiagnosis" jsonb,
	"maleFertilityDiagnosis" jsonb,
	"leadSource" "pg_leadSource",
	"socialLeadId" varchar(128),
	"campaignName" varchar(256),
	"brand" "pg_brand" DEFAULT 'fertiliv',
	"budgetRange" varchar(64),
	"decisionTimeline" "pg_decisionTimeline",
	"travelReadiness" "pg_travelReadiness",
	"leadStatus" "pg_leadStatus" DEFAULT 'intake' NOT NULL,
	"rating" varchar(64),
	"interestLevel" "pg_interestLevel",
	"assignedStaffId" integer,
	"assignedDoctorId" integer,
	"lastContactDate" timestamp with time zone,
	"nextFollowUpDate" timestamp with time zone,
	"tags" jsonb,
	"address" text,
	"city" varchar(128),
	"country" varchar(64),
	"accommodationHotel" varchar(256),
	"accommodationLocation" varchar(256),
	"transportationAirportPickup" boolean DEFAULT false,
	"transportationLocalTransfer" boolean DEFAULT false,
	"caseSummary" text,
	"salesNote" text,
	"caseSummaryTranslations" text,
	"salesNoteTranslations" text,
	"mainMedicalInterest" jsonb,
	"callbackRequestedAt" timestamp with time zone,
	"callbackPreferredDate" varchar(32),
	"callbackPreferredTime" varchar(32),
	"callbackMethod" "pg_callbackMethod",
	"intakeToken" varchar(128),
	"emailVerified" boolean DEFAULT false NOT NULL,
	"formSessionToken" varchar(128),
	"otpCode" varchar(8),
	"otpExpiresAt" timestamp with time zone,
	"leadOrigin" "pg_leadOrigin" DEFAULT 'staff-created',
	"convertedPatientId" integer,
	"mergedIntoLeadId" integer,
	"mergedAt" timestamp with time zone,
	"partnerId" integer,
	"contactRole" "pg_contactRole",
	"serviceFor" "pg_serviceFor",
	"profileCompleteness" integer,
	"createdBy" integer,
	"modifiedBy" integer,
	"modifiedAt" timestamp with time zone,
	"code" varchar(32),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_convertedPatientId_unique" UNIQUE("convertedPatientId")
);
--> statement-breakpoint
CREATE TABLE "medical_intake" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "medical_intake_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"leadId" integer,
	"patientId" integer,
	"infertilityType" "pg_infertilityType",
	"infertilityDuration" varchar(64),
	"referralSource" varchar(256),
	"profession" varchar(128),
	"marriageDate" timestamp with time zone,
	"isFirstMarriage" boolean,
	"partnerIsFirstMarriage" boolean,
	"hasCivilMarriageCertificate" boolean DEFAULT false,
	"marriageCertStatus" varchar(32) DEFAULT 'not_specified',
	"marriageCertFileKey" varchar(512),
	"marriageCertFileUrl" varchar(1024),
	"marriageCertFileName" varchar(512),
	"marriageCertDocId" integer,
	"marriageCertFilePassword" varchar(256),
	"heightCm" numeric(5, 1),
	"weightKg" numeric(5, 1),
	"bmi" numeric(4, 1),
	"bmiManual" boolean DEFAULT false,
	"waistCm" numeric(5, 1),
	"hipCm" numeric(5, 1),
	"gravida" integer DEFAULT 0,
	"para" integer DEFAULT 0,
	"abortus" integer DEFAULT 0,
	"livingChildren" integer DEFAULT 0,
	"childrenFromPreviousMarriage" integer DEFAULT 0,
	"lastMenstrualPeriod" timestamp with time zone,
	"cycleRegularity" "pg_cycleRegularity",
	"cycleLengthDays" integer,
	"menstrualFlowDays" integer,
	"dysmenorrhea" boolean DEFAULT false,
	"miscarriageHistory" jsonb,
	"artHistory" jsonb,
	"surgicalHistory" jsonb,
	"previousTests" jsonb,
	"hasPreviousTests" boolean,
	"systemicDiseases" jsonb,
	"smoking" "pg_smoking",
	"smokingPacksPerDay" numeric(3, 1),
	"alcohol" "pg_alcohol",
	"currentMedications" text,
	"allergies" text,
	"hirsutism" boolean DEFAULT false,
	"consanguinity" boolean DEFAULT false,
	"hereditaryDiseases" text,
	"familyBreastCancer" boolean DEFAULT false,
	"familyEarlyMenopause" boolean DEFAULT false,
	"familyInfertility" boolean DEFAULT false,
	"contraceptiveHistory" jsonb,
	"maleIntake" jsonb,
	"patientQuestions" jsonb,
	"doctorAnswers" jsonb,
	"hasRadiologyStudies" boolean DEFAULT false,
	"radiologyStudies" jsonb,
	"hasMaleRadiologyStudies" boolean DEFAULT false,
	"maleRadiologyStudies" jsonb,
	"generalAttachmentsFemale" jsonb,
	"generalAttachmentsMale" jsonb,
	"femaleGeneticTests" jsonb,
	"additionalNotes" text,
	"expectedVisitDate" timestamp with time zone,
	"personGender" "pg_personGender",
	"maleIntakeMigrated" boolean DEFAULT false,
	"maleIntakeMigratedAt" timestamp with time zone,
	"maleIntakeMigratedBy" integer,
	"intakeMode" "pg_intakeMode",
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "medical_intake_leadId_unique" UNIQUE("leadId"),
	CONSTRAINT "medical_intake_patientId_unique" UNIQUE("patientId")
);
--> statement-breakpoint
CREATE TABLE "medical_notes" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "medical_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer NOT NULL,
	"doctorId" integer,
	"authorId" integer NOT NULL,
	"noteType" "pg_noteType" DEFAULT 'consultation' NOT NULL,
	"chiefComplaint" text,
	"historyOfPresentIllness" text,
	"physicalExamination" text,
	"assessment" text,
	"plan" text,
	"diagnosis" text,
	"medications" text,
	"rawTranscript" text,
	"aiSummary" text,
	"isAiGenerated" boolean DEFAULT false,
	"enteredById" integer,
	"additionalNotes" text,
	"cancellation_status" "pg_cancellation_status",
	"cancellation_reason" text,
	"cancellation_requested_by" integer,
	"cancellation_requested_at" bigint,
	"visitDate" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_adherence_log" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "medication_adherence_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cycleId" integer NOT NULL,
	"medicationId" integer NOT NULL,
	"patientId" integer NOT NULL,
	"scheduledDate" timestamp with time zone NOT NULL,
	"confirmedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmedByPatient" boolean DEFAULT true NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"fromUserId" integer NOT NULL,
	"toUserId" integer NOT NULL,
	"subject" varchar(256),
	"content" text NOT NULL,
	"isRead" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "migration_conflict_log" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "migration_conflict_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conflictType" varchar(64),
	"sourceRecordType" varchar(64),
	"sourceRecordId" integer,
	"targetRecordType" varchar(64),
	"targetRecordId" integer,
	"fieldName" varchar(128),
	"sourceValue" text,
	"targetValue" text,
	"suggestedAction" varchar(64),
	"status" "pg_status_25" DEFAULT 'pending',
	"flaggedBy" integer,
	"flaggedAt" timestamp with time zone,
	"resolvedBy" integer,
	"resolvedAt" timestamp with time zone,
	"resolutionDecision" varchar(64),
	"adminNotes" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitoring_consents" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "monitoring_consents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"consentedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"ipAddress" varchar(64),
	"userAgent" text
);
--> statement-breakpoint
CREATE TABLE "monitoring_sessions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "monitoring_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"adminId" integer NOT NULL,
	"employeeId" integer NOT NULL,
	"monitoringType" "pg_monitoringType" NOT NULL,
	"startTime" timestamp with time zone DEFAULT now() NOT NULL,
	"endTime" timestamp with time zone,
	"durationSeconds" integer,
	"screenshotUrls" jsonb,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "monitoring_settings" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "monitoring_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"screenEnabled" boolean DEFAULT false NOT NULL,
	"screenshotEnabled" boolean DEFAULT false NOT NULL,
	"screenshotIntervalSeconds" integer DEFAULT 60 NOT NULL,
	"cameraEnabled" boolean DEFAULT false NOT NULL,
	"microphoneEnabled" boolean DEFAULT false NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedById" integer
);
--> statement-breakpoint
CREATE TABLE "monitoring_signals" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "monitoring_signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"session_id" varchar(64) NOT NULL,
	"from_user_id" integer NOT NULL,
	"to_user_id" integer NOT NULL,
	"type" "pg_type_6" NOT NULL,
	"payload" text NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"created_at" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "notifications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"type" "pg_type_2" NOT NULL,
	"title" varchar(256) NOT NULL,
	"message" text NOT NULL,
	"isRead" boolean DEFAULT false NOT NULL,
	"relatedId" integer,
	"relatedType" varchar(64),
	"dedupeKey" varchar(255),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "offers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer,
	"title" varchar(256) NOT NULL,
	"description" text,
	"discountType" "pg_discountType" DEFAULT 'percentage' NOT NULL,
	"discountValue" numeric(10, 2) NOT NULL,
	"validFrom" timestamp with time zone,
	"validUntil" timestamp with time zone,
	"status" "pg_status_8" DEFAULT 'active' NOT NULL,
	"code" varchar(32),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_clinics" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "partner_clinics_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(256) NOT NULL,
	"specialty" varchar(128),
	"address" text,
	"googleMapsUrl" varchar(2048),
	"phone" varchar(32),
	"notes" text,
	"isActive" boolean DEFAULT true NOT NULL,
	"code" varchar(32),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "password_reset_tokens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"token" varchar(128) NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"usedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "patient_communications" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "patient_communications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer NOT NULL,
	"note" text NOT NULL,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone,
	"updatedBy" integer,
	"deletedAt" timestamp with time zone,
	"deletedBy" integer
);
--> statement-breakpoint
CREATE TABLE "patient_credit_application_allocations" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "patient_credit_application_allocations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"applicationId" integer NOT NULL,
	"sourceCreditTransactionId" integer NOT NULL,
	"creditDebitTransactionId" integer NOT NULL,
	"creditSettlementId" integer NOT NULL,
	"nativeSourceAmount" numeric(10, 2) NOT NULL,
	"targetSettlementAmount" numeric(10, 2) NOT NULL,
	"reversalCreditTransactionId" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_credit_application_reversals" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "patient_credit_application_reversals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"applicationId" integer NOT NULL,
	"patientId" integer NOT NULL,
	"invoiceId" integer NOT NULL,
	"financialScope" "pg_financialScope" DEFAULT 'production' NOT NULL,
	"restoredSourceAmount" numeric(10, 2) NOT NULL,
	"reversedCreditSettlementAmount" numeric(10, 2) NOT NULL,
	"reversedFxRoundingAdjustmentAmount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"reason" text,
	"idempotencyKey" varchar(64) NOT NULL,
	"recordedById" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_credit_application_reversals_applicationId_unique" UNIQUE("applicationId"),
	CONSTRAINT "patient_credit_application_reversals_idempotencyKey_unique" UNIQUE("idempotencyKey")
);
--> statement-breakpoint
CREATE TABLE "patient_credit_applications" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "patient_credit_applications_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer NOT NULL,
	"invoiceId" integer NOT NULL,
	"financialScope" "pg_financialScope" DEFAULT 'production' NOT NULL,
	"sourceCurrency" "pg_sourceCurrency" NOT NULL,
	"targetInvoiceCurrency" "pg_targetInvoiceCurrency" NOT NULL,
	"sourceCreditAmount" numeric(10, 2) NOT NULL,
	"creditSettlementAmount" numeric(10, 2) NOT NULL,
	"fxRoundingAdjustmentAmount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"finalSettlementAmount" numeric(10, 2) NOT NULL,
	"conversionRateToInvoice" numeric(20, 12),
	"fxEffectiveAt" timestamp with time zone,
	"fxSource" varchar(64),
	"status" "pg_status_18" DEFAULT 'active' NOT NULL,
	"reversalReason" text,
	"reversedAt" timestamp with time zone,
	"reversedById" integer,
	"createdById" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_credit_payout_allocations" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "patient_credit_payout_allocations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"payoutId" integer NOT NULL,
	"sourceCreditTransactionId" integer NOT NULL,
	"creditDebitTransactionId" integer NOT NULL,
	"nativeSourceAmount" numeric(10, 2) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_credit_payouts" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "patient_credit_payouts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer NOT NULL,
	"financialScope" "pg_financialScope" DEFAULT 'production' NOT NULL,
	"sourceCurrency" "pg_sourceCurrency" NOT NULL,
	"sourceCreditAmount" numeric(10, 2) NOT NULL,
	"payoutCurrency" "pg_payoutCurrency" NOT NULL,
	"payoutAmount" numeric(10, 2) NOT NULL,
	"conversionRateToPayout" numeric(20, 12),
	"fxEffectiveAt" timestamp with time zone,
	"fxSource" varchar(64),
	"method" "pg_method_2" NOT NULL,
	"payoutDate" timestamp with time zone NOT NULL,
	"reference" varchar(256),
	"notes" text,
	"idempotencyKey" varchar(64) NOT NULL,
	"recordedById" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_credit_payouts_idempotencyKey_unique" UNIQUE("idempotencyKey")
);
--> statement-breakpoint
CREATE TABLE "patient_doctors" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "patient_doctors_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer NOT NULL,
	"doctorId" integer NOT NULL,
	"isPrimary" boolean DEFAULT false NOT NULL,
	"assignedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"assignedBy" integer
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "patients_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer,
	"mrn" varchar(32) NOT NULL,
	"defaultFinancialScope" "pg_defaultFinancialScope" DEFAULT 'production' NOT NULL,
	"firstName" varchar(128) NOT NULL,
	"middleName" varchar(128),
	"lastName" varchar(128) NOT NULL,
	"dateOfBirth" date,
	"gender" "pg_gender",
	"phone" varchar(32),
	"secondaryPhone" varchar(32),
	"email" varchar(320),
	"secondaryEmail" varchar(320),
	"address" text,
	"bloodType" varchar(8),
	"allergies" text,
	"emergencyContactName" varchar(128),
	"emergencyContactPhone" varchar(32),
	"insuranceProvider" varchar(128),
	"insuranceNumber" varchar(64),
	"assignedDoctorId" integer,
	"interestLevel" "pg_interestLevel" DEFAULT 'warm',
	"leadSource" varchar(64),
	"interestedProcedureId" integer,
	"tags" text,
	"status" "pg_status_2" DEFAULT 'active_patient' NOT NULL,
	"notes" text,
	"source" "pg_source",
	"socialLeadId" varchar(128),
	"campaignName" varchar(256),
	"budgetRange" varchar(64),
	"rating" varchar(64),
	"travelReadiness" "pg_travelReadiness",
	"fertilityDiagnosis" jsonb,
	"maleFertilityDiagnosis" jsonb,
	"ivfExperience" "pg_ivfExperience",
	"decisionTimeline" "pg_decisionTimeline",
	"preferredContactMethods" jsonb,
	"assignedStaffId" integer,
	"lastContactDate" timestamp with time zone,
	"nextFollowUpDate" timestamp with time zone,
	"city" varchar(128),
	"country" varchar(64),
	"accommodationHotel" varchar(256),
	"accommodationLocation" varchar(256),
	"transportationAirportPickup" boolean,
	"transportationLocalTransfer" boolean,
	"caseSummary" text,
	"salesNote" text,
	"caseSummaryTranslations" text,
	"salesNoteTranslations" text,
	"nationality" varchar(64),
	"isLocalPatient" boolean DEFAULT false,
	"patientType" "pg_patientType",
	"brand" "pg_brand" DEFAULT 'fertiliv',
	"createdBy" integer,
	"modifiedBy" integer,
	"modifiedAt" timestamp with time zone,
	"preferredLanguages" jsonb,
	"primaryLanguage" varchar(16),
	"mainMedicalInterest" jsonb,
	"countryOfResidency" varchar(64),
	"partnerId" integer,
	"creditBalance" numeric(10, 2) DEFAULT '0',
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patients_mrn_unique" UNIQUE("mrn")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer,
	"invoiceId" integer NOT NULL,
	"financialScope" "pg_financialScope" DEFAULT 'production' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" "pg_currency_2" DEFAULT 'TRY' NOT NULL,
	"method" "pg_method" DEFAULT 'cash' NOT NULL,
	"exchangeRateAtPayment" numeric(12, 4) DEFAULT '1' NOT NULL,
	"conversionRateToInvoice" numeric(20, 12) NOT NULL,
	"amountInInvoiceCurrency" numeric(18, 2) NOT NULL,
	"bankGrossAmountSent" numeric(10, 2),
	"bankDeductionAmount" numeric(10, 2),
	"bankDeductionPercent" numeric(9, 4),
	"settledAmount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" "pg_status_15" DEFAULT 'active' NOT NULL,
	"voidedAt" timestamp with time zone,
	"voidedById" integer,
	"voidReason" text,
	"recordedById" integer NOT NULL,
	"notes" text,
	"receivedAt" timestamp with time zone,
	"fxEffectiveAt" timestamp with time zone,
	"fxRateSource" "pg_fxRateSource",
	"fxRateNote" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pending_lab_tests" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "pending_lab_tests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"rawName" varchar(512) NOT NULL,
	"source" "pg_source_2" DEFAULT 'patient_entry' NOT NULL,
	"patientId" integer,
	"suggestedCanonicalName" varchar(256),
	"suggestedDisplayName" varchar(512),
	"suggestedAbbreviation" varchar(64),
	"suggestedResultType" varchar(64),
	"suggestedCategory" varchar(128),
	"suggestedSpecimen" varchar(128),
	"suggestedUnits" varchar(256),
	"aiConfidence" "pg_aiConfidence" DEFAULT 'medium',
	"possibleMatchId" integer,
	"possibleMatchName" varchar(256),
	"possibleMatchScore" integer,
	"medicalVerdict" "pg_medicalVerdict",
	"confidenceScore" integer,
	"medicalReason" text,
	"suggestedAction" varchar(512),
	"status" "pg_status_23" DEFAULT 'pending' NOT NULL,
	"mergedIntoDictionaryId" integer,
	"rejectionReason" varchar(512),
	"submittedById" integer NOT NULL,
	"reviewedById" integer,
	"reviewedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_items" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "proposal_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"proposalId" integer NOT NULL,
	"serviceId" integer,
	"description" varchar(256) NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unitPrice" numeric(10, 2) NOT NULL,
	"discount" numeric(10, 2) DEFAULT '0',
	"totalPrice" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_data" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "reference_data_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" "pg_type_5" NOT NULL,
	"code" varchar(16) NOT NULL,
	"label" varchar(256) NOT NULL,
	"labelAr" varchar(256),
	"labelTr" varchar(256),
	"sortOrder" integer DEFAULT 0,
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refunds" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "refunds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer NOT NULL,
	"invoiceId" integer NOT NULL,
	"financialScope" "pg_financialScope" DEFAULT 'production' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" "pg_currency_3" NOT NULL,
	"amountInInvoiceCurrency" numeric(10, 2),
	"conversionRateToInvoice" numeric(20, 12),
	"fxEffectiveAt" timestamp with time zone,
	"method" "pg_method_3" DEFAULT 'cash' NOT NULL,
	"refundDate" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"recordedById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_notes" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "sales_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer,
	"leadId" integer,
	"authorId" integer NOT NULL,
	"content" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_tasks" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "sales_tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer,
	"leadId" integer,
	"assignedToId" integer,
	"title" varchar(256) NOT NULL,
	"description" text,
	"dueDate" timestamp with time zone,
	"priority" "pg_priority" DEFAULT 'medium' NOT NULL,
	"status" "pg_status_9" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "save_idempotency" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "save_idempotency_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"requestId" varchar(64) NOT NULL,
	"draftSessionId" varchar(64) NOT NULL,
	"leadId" integer,
	"patientId" integer,
	"payloadHash" varchar(64) NOT NULL,
	"status" "pg_status_29" DEFAULT 'processing' NOT NULL,
	"resultIntakeId" integer,
	"resultPromotedDocIds" jsonb,
	"resultArchivedDocIds" jsonb,
	"errorMessage" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "save_idempotency_requestId_unique" UNIQUE("requestId")
);
--> statement-breakpoint
CREATE TABLE "service_category_tax_defaults" (
	"category" "pg_category_2" PRIMARY KEY NOT NULL,
	"taxRuleId" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_tax_rules" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "service_tax_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"label" varchar(128) NOT NULL,
	"ratePercent" numeric(7, 4) NOT NULL,
	"isActive" boolean DEFAULT true NOT NULL,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "services_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(256) NOT NULL,
	"category" "pg_category_2" NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"localPriceUSD" numeric(10, 2),
	"localPriceEUR" numeric(10, 2),
	"localPriceGBP" numeric(10, 2),
	"localPriceTRY" numeric(10, 2),
	"intlPriceUSD" numeric(10, 2),
	"intlPriceEUR" numeric(10, 2),
	"intlPriceGBP" numeric(10, 2),
	"intlPriceTRY" numeric(10, 2),
	"duration" integer,
	"preparationInstructions" text,
	"status" "pg_status_3" DEFAULT 'active' NOT NULL,
	"code" varchar(32),
	"taxOverrideMode" "pg_taxOverrideMode" DEFAULT 'inherit' NOT NULL,
	"taxOverrideRuleId" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "specializations" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "specializations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(128) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "specializations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "staff_availability" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "staff_availability_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"title" varchar(256) NOT NULL,
	"startDate" timestamp with time zone NOT NULL,
	"endDate" timestamp with time zone NOT NULL,
	"reason" "pg_reason" DEFAULT 'other' NOT NULL,
	"notes" text,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_permissions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "staff_permissions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"module" "pg_module" NOT NULL,
	"canView" boolean DEFAULT true NOT NULL,
	"canCreate" boolean DEFAULT false NOT NULL,
	"canEdit" boolean DEFAULT false NOT NULL,
	"canDelete" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_specializations" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "sub_specializations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(128) NOT NULL,
	"specializationId" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "system_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" varchar(128) NOT NULL,
	"value" text NOT NULL,
	"description" varchar(256),
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedBy" integer,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "task_tags" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "task_tags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(64) NOT NULL,
	"color" varchar(32) DEFAULT '#6366f1',
	"createdByUserId" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" varchar(256) NOT NULL,
	"type" "pg_type_4" DEFAULT 'follow_up' NOT NULL,
	"status" "pg_status_19" DEFAULT 'open' NOT NULL,
	"priority" "pg_priority" DEFAULT 'medium' NOT NULL,
	"dueDate" varchar(16),
	"dueTime" varchar(8),
	"communicationMethod" "pg_communicationMethod",
	"notes" text,
	"leadId" integer,
	"patientId" integer,
	"assignedToId" integer,
	"createdById" integer,
	"tags" text,
	"closedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_cases" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "treatment_cases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"caseType" "pg_caseType",
	"primaryLeadId" integer,
	"primaryPatientId" integer,
	"partnerLeadId" integer,
	"partnerPatientId" integer,
	"status" "pg_status_24" DEFAULT 'active',
	"notes" text,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_cycles" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "treatment_cycles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"patientId" integer NOT NULL,
	"ivfNo" varchar(32),
	"cycleType" text NOT NULL,
	"protocol" "pg_protocol",
	"status" "pg_status_13" DEFAULT 'planned' NOT NULL,
	"doctorId" integer,
	"startDate" timestamp with time zone,
	"endDate" timestamp with time zone,
	"d3Tsh" varchar(32),
	"d3Fsh" varchar(32),
	"d3Lh" varchar(32),
	"d3E2" varchar(32),
	"d3Amh" varchar(32),
	"d3Prl" varchar(32),
	"d3Bmi" varchar(16),
	"infertilityDuration" varchar(64),
	"infertilityReasonFemale" text,
	"infertilityReasonMale" text,
	"frozenTissue" boolean DEFAULT false,
	"spermCount" varchar(64),
	"spermMotility" varchar(64),
	"spermMorphology" varchar(64),
	"spermTmss" varchar(32),
	"karyotype" varchar(128),
	"serology" text,
	"previousTreatment" text,
	"surgery" text,
	"adjuvantMedications" text,
	"notes" text,
	"createdBy" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"code" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "treatment_packages" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "treatment_packages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" varchar(256) NOT NULL,
	"description" text,
	"services" jsonb,
	"localPriceUSD" numeric(10, 2),
	"localPriceEUR" numeric(10, 2),
	"localPriceGBP" numeric(10, 2),
	"localPriceTRY" numeric(10, 2),
	"intlPriceUSD" numeric(10, 2),
	"intlPriceEUR" numeric(10, 2),
	"intlPriceGBP" numeric(10, 2),
	"intlPriceTRY" numeric(10, 2),
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"code" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "treatment_plan_scenarios" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "treatment_plan_scenarios_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"treatmentPlanId" integer NOT NULL,
	"title" varchar(256) NOT NULL,
	"summary" text,
	"services" jsonb,
	"sortOrder" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_plans" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "treatment_plans_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"leadId" integer,
	"patientId" integer,
	"doctorId" integer,
	"title" varchar(256),
	"requestNotes" text,
	"requestedById" integer,
	"status" "pg_status_20" DEFAULT 'draft' NOT NULL,
	"clinicalSummary" text,
	"qaAnswers" jsonb,
	"confirmedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatment_proposals" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "treatment_proposals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"leadId" integer,
	"patientId" integer,
	"packageId" integer,
	"currency" "pg_currency" DEFAULT 'USD' NOT NULL,
	"appliedPriceType" "pg_appliedPriceType" DEFAULT 'international' NOT NULL,
	"totalAmount" numeric(10, 2),
	"customItems" jsonb,
	"aiSuggestion" text,
	"staffNotes" text,
	"status" "pg_status_11" DEFAULT 'draft' NOT NULL,
	"sentAt" timestamp with time zone,
	"createdBy" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"code" varchar(32)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"passwordHash" text,
	"loginMethod" varchar(64),
	"role" "pg_role" DEFAULT 'patient' NOT NULL,
	"status" "pg_status" DEFAULT 'pending' NOT NULL,
	"avatarUrl" text,
	"phone" varchar(32),
	"firstName" varchar(128),
	"secondName" varchar(128),
	"thirdName" varchar(128),
	"isActive" boolean DEFAULT true NOT NULL,
	"bio" text,
	"jobTitle" varchar(128),
	"languages" jsonb,
	"primaryLanguage" varchar(16),
	"weeklySchedule" jsonb,
	"slotDurationMinutes" integer DEFAULT 30,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_allowed_chats" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_allowed_chats_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lineId" integer NOT NULL,
	"externalChatId" varchar(191) NOT NULL,
	"phone" varchar(32) NOT NULL,
	"name" varchar(256),
	"enabled" boolean DEFAULT true NOT NULL,
	"addedById" integer NOT NULL,
	"lastSyncedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_communication_endpoints" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_communication_endpoints_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"clinicScope" varchar(64) DEFAULT 'fertiliv' NOT NULL,
	"connectionId" integer,
	"connectionRoute" "pg_connectionRoute",
	"provider" "pg_provider" DEFAULT 'meta' NOT NULL,
	"providerPhoneNumberId" varchar(128) NOT NULL,
	"providerEndpointId" varchar(128) NOT NULL,
	"endpointKind" "pg_endpointKind" DEFAULT 'phone' NOT NULL,
	"normalizedEndpointId" varchar(128),
	"lifecycleState" "pg_lifecycleState_2" DEFAULT 'active' NOT NULL,
	"firstSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_connection_credentials" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_connection_credentials_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"connectionId" integer NOT NULL,
	"credentialKind" "pg_credentialKind" DEFAULT 'business_access_token' NOT NULL,
	"encryptedCredential" text NOT NULL,
	"encryptionVersion" varchar(16) DEFAULT 'v1' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastValidatedAt" timestamp with time zone,
	CONSTRAINT "whatsapp_connection_credentials_connectionId_unique" UNIQUE("connectionId")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_connection_transitions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_connection_transitions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"connectionId" integer NOT NULL,
	"fromOnboardingMethod" "pg_fromOnboardingMethod",
	"toOnboardingMethod" "pg_toOnboardingMethod" NOT NULL,
	"fromCredentialSource" "pg_fromCredentialSource",
	"toCredentialSource" "pg_toCredentialSource" NOT NULL,
	"transitionReason" varchar(128) NOT NULL,
	"transitionedById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_connections" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_connections_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"clinicScope" varchar(64) DEFAULT 'fertiliv' NOT NULL,
	"provider" "pg_provider" DEFAULT 'meta' NOT NULL,
	"onboardingMethod" "pg_onboardingMethod" NOT NULL,
	"providerPhoneNumberId" varchar(128) NOT NULL,
	"wabaId" varchar(128),
	"businessPortfolioId" varchar(128),
	"displayPhone" varchar(32),
	"normalizedDisplayPhone" varchar(32),
	"displayName" varchar(256),
	"providerMetadata" jsonb,
	"credentialSource" "pg_credentialSource" NOT NULL,
	"credentialRef" varchar(512) NOT NULL,
	"lifecycleStatus" "pg_lifecycleStatus_2" DEFAULT 'onboarding' NOT NULL,
	"providerStateSnapshot" jsonb,
	"healthState" "pg_healthState" DEFAULT 'unknown' NOT NULL,
	"lastHealthCheckedAt" timestamp with time zone,
	"lastInboundEventAt" timestamp with time zone,
	"lastOutboundAcceptedAt" timestamp with time zone,
	"lastProviderStatusAt" timestamp with time zone,
	"lastTransitionAt" timestamp with time zone,
	"createdById" integer,
	"updatedById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversation_activities" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_conversation_activities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversationId" integer NOT NULL,
	"actorId" integer NOT NULL,
	"action" varchar(64) NOT NULL,
	"summary" varchar(512) NOT NULL,
	"metadata" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversation_assignments" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_conversation_assignments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversationId" integer NOT NULL,
	"assignedUserId" integer,
	"assignedById" integer NOT NULL,
	"assignedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversation_case_links" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_conversation_case_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversationId" integer NOT NULL,
	"caseId" integer NOT NULL,
	"relationshipRole" "pg_relationshipRole" DEFAULT 'other' NOT NULL,
	"linkedById" integer NOT NULL,
	"linkedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"retiredAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversation_match_suggestions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_conversation_match_suggestions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversationId" integer NOT NULL,
	"endpointId" integer,
	"candidateType" "pg_candidateType" NOT NULL,
	"candidateId" integer NOT NULL,
	"matchedField" "pg_matchedField_2" NOT NULL,
	"confidence" "pg_confidence" DEFAULT 'high' NOT NULL,
	"state" "pg_state_3" DEFAULT 'pending' NOT NULL,
	"reviewedById" integer,
	"reviewedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversation_messages" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_conversation_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversationId" integer NOT NULL,
	"sourceEventId" integer NOT NULL,
	"normalizedMessageId" integer NOT NULL,
	"resolutionId" integer,
	"provider" "pg_provider" DEFAULT 'meta' NOT NULL,
	"providerPhoneNumberId" varchar(128) NOT NULL,
	"providerMessageId" varchar(128),
	"providerItemKey" varchar(128) NOT NULL,
	"associationKey" varchar(64) NOT NULL,
	"correlationState" "pg_correlationState" DEFAULT 'correlated' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversation_participants" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_conversation_participants_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversationId" integer NOT NULL,
	"endpointId" integer,
	"personIdentityId" integer,
	"sourceResolutionId" integer,
	"participantKey" varchar(64) NOT NULL,
	"participantRole" "pg_participantRole" NOT NULL,
	"participantState" "pg_participantState" DEFAULT 'unresolved' NOT NULL,
	"providerParticipantId" varchar(128) NOT NULL,
	"providerHintDigest" varchar(64),
	"humanActorResolutionState" "pg_humanActorResolutionState" DEFAULT 'unresolved' NOT NULL,
	"medicalSubjectResolutionState" "pg_medicalSubjectResolutionState" DEFAULT 'unresolved' NOT NULL,
	"firstSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversation_read_states" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_conversation_read_states_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversationId" integer NOT NULL,
	"userId" integer NOT NULL,
	"lastReadMessageId" integer,
	"readAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversation_tags" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_conversation_tags_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversationId" integer NOT NULL,
	"tag" varchar(64) NOT NULL,
	"createdById" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_conversations" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_conversations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"clinicScope" varchar(64) DEFAULT 'fertiliv' NOT NULL,
	"provider" "pg_provider" DEFAULT 'meta' NOT NULL,
	"connectionId" integer,
	"connectionRoute" "pg_connectionRoute",
	"providerPhoneNumberId" varchar(128) NOT NULL,
	"providerThreadId" varchar(128),
	"conversationKey" varchar(64) NOT NULL,
	"conversationType" "pg_conversationType" NOT NULL,
	"identityBasis" "pg_identityBasis" NOT NULL,
	"endpointResolutionState" "pg_endpointResolutionState" NOT NULL,
	"humanActorResolutionState" "pg_humanActorResolutionState" DEFAULT 'unresolved' NOT NULL,
	"medicalSubjectResolutionState" "pg_medicalSubjectResolutionState" DEFAULT 'unresolved' NOT NULL,
	"lifecycleState" "pg_lifecycleState_3" DEFAULT 'active' NOT NULL,
	"firstMessageAt" timestamp with time zone,
	"lastMessageAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_embedded_signup_sessions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_embedded_signup_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"requestId" varchar(64) NOT NULL,
	"startedById" integer NOT NULL,
	"state" "pg_state" DEFAULT 'started' NOT NULL,
	"completionEvent" varchar(80),
	"currentStep" varchar(80),
	"failureCategory" varchar(80),
	"providerWabaId" varchar(128),
	"providerPhoneNumberId" varchar(128),
	"providerBusinessPortfolioId" varchar(128),
	"authorizationCodeDigest" varchar(64),
	"connectionId" integer,
	"expiresAt" timestamp with time zone NOT NULL,
	"completedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_embedded_signup_sessions_requestId_unique" UNIQUE("requestId"),
	CONSTRAINT "whatsapp_embedded_signup_sessions_authorizationCodeDigest_unique" UNIQUE("authorizationCodeDigest")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_endpoint_aliases" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_endpoint_aliases_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"clinicScope" varchar(64) DEFAULT 'fertiliv' NOT NULL,
	"provider" "pg_provider" DEFAULT 'meta' NOT NULL,
	"connectionId" integer,
	"providerPhoneNumberId" varchar(128) NOT NULL,
	"providerIdentityId" varchar(128) NOT NULL,
	"endpointId" integer NOT NULL,
	"sourceEventId" integer,
	"aliasKind" varchar(64) DEFAULT 'provider_identity' NOT NULL,
	"aliasState" "pg_aliasState" DEFAULT 'active' NOT NULL,
	"firstSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_endpoint_evidence_hints" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_endpoint_evidence_hints_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sourceEventId" integer NOT NULL,
	"resolutionId" integer NOT NULL,
	"endpointId" integer,
	"hintType" varchar(64) NOT NULL,
	"providerHintValue" varchar(512) NOT NULL,
	"providerHintDigest" varchar(64) NOT NULL,
	"evidenceState" "pg_evidenceState" DEFAULT 'provider_hint' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_endpoint_person_links" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_endpoint_person_links_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"endpointId" integer NOT NULL,
	"personIdentityId" integer NOT NULL,
	"linkState" "pg_linkState" DEFAULT 'confirmed' NOT NULL,
	"trustSource" "pg_trustSource" NOT NULL,
	"confirmedById" integer,
	"confirmedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"revokedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_endpoint_resolution_candidates" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_endpoint_resolution_candidates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"resolutionId" integer NOT NULL,
	"recordType" "pg_recordType" NOT NULL,
	"recordId" integer NOT NULL,
	"matchedField" "pg_matchedField" NOT NULL,
	"convertedPatientId" integer,
	"candidateKey" varchar(128) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_endpoint_resolutions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_endpoint_resolutions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sourceEventId" integer NOT NULL,
	"provider" "pg_provider" DEFAULT 'meta' NOT NULL,
	"connectionId" integer,
	"connectionRoute" "pg_connectionRoute",
	"providerPhoneNumberId" varchar(128),
	"providerEndpointId" varchar(128),
	"providerMessageId" varchar(128),
	"routingState" "pg_routingState" NOT NULL,
	"endpointId" integer,
	"resolutionKey" varchar(64) NOT NULL,
	"resolutionState" "pg_resolutionState" NOT NULL,
	"resolutionReason" varchar(128) NOT NULL,
	"confirmedPersonIdentityId" integer,
	"humanActorResolutionState" "pg_humanActorResolutionState" DEFAULT 'unresolved' NOT NULL,
	"medicalSubjectResolutionState" "pg_medicalSubjectResolutionState" DEFAULT 'unresolved' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_inbox_notification_preferences" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_inbox_notification_preferences_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"notifyNewConversation" boolean DEFAULT true NOT NULL,
	"notifyNewMessage" boolean DEFAULT true NOT NULL,
	"notifyAssignment" boolean DEFAULT true NOT NULL,
	"notifyHealth" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "whatsapp_inbox_notification_preferences_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_inbox_settings" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_inbox_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"clinicScope" varchar(64) DEFAULT 'fertiliv' NOT NULL,
	"phoneVisibility" "pg_phoneVisibility" DEFAULT 'full_authorized' NOT NULL,
	"newSenderBehavior" "pg_newSenderBehavior" DEFAULT 'conversation_only' NOT NULL,
	"exactPhoneMatch" "pg_exactPhoneMatch" DEFAULT 'never_auto_link' NOT NULL,
	"duplicateDetection" "pg_duplicateDetection" DEFAULT 'require_confirmation' NOT NULL,
	"caseSuggestions" boolean DEFAULT false NOT NULL,
	"automaticPatient" boolean DEFAULT false NOT NULL,
	"automaticMrn" boolean DEFAULT false NOT NULL,
	"automaticClinicalRecord" boolean DEFAULT false NOT NULL,
	"updatedById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_linked_device_credentials" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_linked_device_credentials_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lineId" integer NOT NULL,
	"credentialKind" varchar(64) NOT NULL,
	"encryptedCredential" text NOT NULL,
	"encryptionVersion" varchar(16) DEFAULT 'v1' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastValidatedAt" timestamp with time zone,
	CONSTRAINT "whatsapp_linked_device_credentials_lineId_unique" UNIQUE("lineId")
);
--> statement-breakpoint
CREATE TABLE "whatsapp_linked_device_line_staff" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_linked_device_line_staff_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lineId" integer NOT NULL,
	"userId" integer NOT NULL,
	"grantedById" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_linked_device_lines" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_linked_device_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"clinicScope" varchar(64) DEFAULT 'fertiliv' NOT NULL,
	"lineName" varchar(128) NOT NULL,
	"connectionId" integer,
	"providerApprovalState" "pg_providerApprovalState" DEFAULT 'blocked' NOT NULL,
	"adapterKind" varchar(64) DEFAULT 'unselected' NOT NULL,
	"lifecycleState" "pg_lifecycleState" DEFAULT 'not_started' NOT NULL,
	"healthState" "pg_healthState" DEFAULT 'unknown' NOT NULL,
	"displayPhone" varchar(32),
	"normalizedDisplayPhone" varchar(32),
	"connectedAt" timestamp with time zone,
	"lastSeenAt" timestamp with time zone,
	"lastSuccessfulSyncAt" timestamp with time zone,
	"disconnectedAt" timestamp with time zone,
	"ownerUserId" integer,
	"ownerRole" varchar(32),
	"createdById" integer NOT NULL,
	"updatedById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_linked_device_messages" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_linked_device_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lineId" integer NOT NULL,
	"allowedChatId" integer NOT NULL,
	"ownerUserId" integer NOT NULL,
	"externalMessageId" varchar(191) NOT NULL,
	"direction" "pg_direction" NOT NULL,
	"messageType" varchar(64) DEFAULT 'chat' NOT NULL,
	"text" text,
	"mediaUrl" text,
	"mediaMetadata" jsonb,
	"sentByMe" boolean DEFAULT false NOT NULL,
	"deliveryStatus" varchar(64),
	"messageTimestamp" timestamp with time zone NOT NULL,
	"rawMetadata" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_linked_device_sessions" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_linked_device_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"lineId" integer NOT NULL,
	"state" "pg_state_2" DEFAULT 'not_started' NOT NULL,
	"failureCategory" varchar(80),
	"sessionName" varchar(128),
	"runtimeSlot" varchar(64),
	"runtimeEndpoint" varchar(512),
	"runtimeMode" "pg_runtimeMode",
	"runtimeGeneration" varchar(64),
	"runtimeProfileRef" varchar(512),
	"runtimeAllocatedAt" timestamp with time zone,
	"runtimeReleasedAt" timestamp with time zone,
	"providerAccountHint" varchar(64),
	"providerPushName" varchar(128),
	"providerPlatform" varchar(64),
	"reconnectCount" integer DEFAULT 0 NOT NULL,
	"lastActivityAt" timestamp with time zone,
	"lastHealthCheckedAt" timestamp with time zone,
	"lastErrorCategory" varchar(128),
	"lastErrorAt" timestamp with time zone,
	"lastRequestedAt" timestamp with time zone,
	"lastStateChangedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"createdById" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"fromPhone" varchar(32),
	"toPhone" varchar(32),
	"direction" "pg_direction_2" NOT NULL,
	"body" text NOT NULL,
	"status" "pg_status_17" DEFAULT 'received' NOT NULL,
	"leadId" integer,
	"patientId" integer,
	"externalMessageId" varchar(128),
	"templateName" varchar(256),
	"sentById" integer,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_normalized_media" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_normalized_media_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sourceEventId" integer NOT NULL,
	"connectionId" integer,
	"connectionRoute" "pg_connectionRoute",
	"provider" "pg_provider" DEFAULT 'meta' NOT NULL,
	"wabaId" varchar(128),
	"providerPhoneNumberId" varchar(128),
	"sourceMessageItemKey" varchar(128) NOT NULL,
	"providerMediaItemKey" varchar(128) NOT NULL,
	"providerMediaId" varchar(128),
	"mediaType" varchar(64) NOT NULL,
	"mimeType" varchar(128),
	"sha256" varchar(128),
	"filename" varchar(512),
	"caption" text,
	"mediaState" "pg_mediaState" NOT NULL,
	"failureCategory" varchar(64),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_normalized_messages" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_normalized_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sourceEventId" integer NOT NULL,
	"connectionId" integer,
	"connectionRoute" "pg_connectionRoute",
	"provider" "pg_provider" DEFAULT 'meta' NOT NULL,
	"wabaId" varchar(128),
	"providerPhoneNumberId" varchar(128),
	"providerMessageId" varchar(128),
	"providerItemKey" varchar(128) NOT NULL,
	"providerSenderId" varchar(128),
	"providerRecipientId" varchar(128),
	"providerTimestamp" timestamp with time zone,
	"providerDirection" "pg_providerDirection" NOT NULL,
	"messageType" varchar(64) NOT NULL,
	"textBody" text,
	"normalizedContent" jsonb,
	"normalizationVersion" varchar(32) NOT NULL,
	"normalizationState" "pg_normalizationState" NOT NULL,
	"failureCategory" varchar(64),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_normalized_statuses" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_normalized_statuses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sourceEventId" integer NOT NULL,
	"connectionId" integer,
	"connectionRoute" "pg_connectionRoute",
	"provider" "pg_provider" DEFAULT 'meta' NOT NULL,
	"wabaId" varchar(128),
	"providerPhoneNumberId" varchar(128),
	"providerStatusId" varchar(128),
	"providerStatusKey" varchar(128) NOT NULL,
	"providerMessageId" varchar(128),
	"providerRecipientId" varchar(128),
	"providerTimestamp" timestamp with time zone,
	"statusValue" varchar(64) NOT NULL,
	"errorCode" varchar(64),
	"errorTitle" varchar(256),
	"normalizationVersion" varchar(32) NOT NULL,
	"normalizationState" "pg_normalizationState" NOT NULL,
	"failureCategory" varchar(64),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_person_identities" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_person_identities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"clinicScope" varchar(64) DEFAULT 'fertiliv' NOT NULL,
	"identityKind" "pg_identityKind" DEFAULT 'human' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_person_identity_records" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_person_identity_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"personIdentityId" integer NOT NULL,
	"recordType" "pg_recordType" NOT NULL,
	"recordId" integer NOT NULL,
	"relationshipState" "pg_relationshipState" DEFAULT 'active' NOT NULL,
	"trustSource" "pg_trustSource" NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_provider_event_batches" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_provider_event_batches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"provider" "pg_provider" DEFAULT 'meta' NOT NULL,
	"rawPayloadDigest" varchar(64) NOT NULL,
	"rawPayload" text NOT NULL,
	"signatureValid" boolean DEFAULT false NOT NULL,
	"receivedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastReceivedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_provider_events" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_provider_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"batchId" integer NOT NULL,
	"connectionId" integer,
	"connectionRoute" "pg_connectionRoute",
	"provider" "pg_provider" DEFAULT 'meta' NOT NULL,
	"wabaId" varchar(128),
	"providerPhoneNumberId" varchar(128),
	"providerField" varchar(128) NOT NULL,
	"providerEventKey" varchar(128) NOT NULL,
	"routingState" "pg_routingState" NOT NULL,
	"processingState" "pg_processingState" DEFAULT 'received' NOT NULL,
	"failureCategory" varchar(64),
	"receivedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"processedAt" timestamp with time zone,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_send_attempts" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_send_attempts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"conversationId" integer,
	"connectionId" integer,
	"connectionRoute" "pg_connectionRoute" NOT NULL,
	"provider" "pg_provider" DEFAULT 'meta' NOT NULL,
	"providerPhoneNumberId" varchar(128) NOT NULL,
	"actorUserId" integer,
	"recipientEndpoint" varchar(64) NOT NULL,
	"intentType" "pg_intentType" NOT NULL,
	"payloadDigest" varchar(64) NOT NULL,
	"idempotencyKey" varchar(128) NOT NULL,
	"clientActionId" varchar(64),
	"correlationId" varchar(64),
	"lineId" integer,
	"sessionName" varchar(64),
	"runtimeEndpointHost" varchar(255),
	"runtimeMode" "pg_runtimeMode",
	"runtimeGateValue" boolean,
	"approvalSecretSelector" varchar(64),
	"approvalProofVersion" integer,
	"approvalExpiryState" varchar(32),
	"recipientFingerprint" varchar(64),
	"approvalReason" varchar(64),
	"attemptState" "pg_attemptState" DEFAULT 'pending' NOT NULL,
	"providerMessageId" varchar(128),
	"failureCategory" varchar(64),
	"diagnosticStage" varchar(32),
	"diagnosticProbe" varchar(64),
	"diagnosticOutcome" varchar(96),
	"diagnosticAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"acceptedAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_synthetic_test_recipients" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "whatsapp_synthetic_test_recipients_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"clinicScope" varchar(64) DEFAULT 'fertiliv' NOT NULL,
	"lineId" integer NOT NULL,
	"normalizedPhone" varchar(16) NOT NULL,
	"label" varchar(128),
	"status" "pg_status_16" DEFAULT 'active' NOT NULL,
	"approvedById" integer NOT NULL,
	"approvedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"revokedById" integer,
	"revokedAt" timestamp with time zone,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "zernio_webhook_events" (
	"id" integer PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY (sequence name "zernio_webhook_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"provider" varchar(32) DEFAULT 'zernio' NOT NULL,
	"eventId" varchar(191) NOT NULL,
	"eventType" varchar(128) NOT NULL,
	"payloadHash" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'processing' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"processedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_reminder_deliveries_delivery_key_uq" ON "appointment_reminder_deliveries" USING btree ("deliveryKey");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_reminder_deliveries_business_identity_uq" ON "appointment_reminder_deliveries" USING btree ("appointmentId","recipientKey","channel","offsetMinutes","scheduleRevision");--> statement-breakpoint
CREATE INDEX "appointment_reminder_deliveries_due_processing_ix" ON "appointment_reminder_deliveries" USING btree ("status","nextAttemptAt","dueAt");--> statement-breakpoint
CREATE INDEX "appointment_reminder_deliveries_appointment_revision_ix" ON "appointment_reminder_deliveries" USING btree ("appointmentId","scheduleRevision");--> statement-breakpoint
CREATE INDEX "appointment_reminder_deliveries_claim_expiry_ix" ON "appointment_reminder_deliveries" USING btree ("claimExpiresAt");--> statement-breakpoint
CREATE UNIQUE INDEX "appointment_reminder_delivery_attempts_delivery_number_uq" ON "appointment_reminder_delivery_attempts" USING btree ("reminderDeliveryId","attemptNumber");--> statement-breakpoint
CREATE INDEX "appointment_reminder_delivery_attempts_delivery_ix" ON "appointment_reminder_delivery_attempts" USING btree ("reminderDeliveryId");--> statement-breakpoint
CREATE INDEX "communication_media_access_audits_asset_ix" ON "communication_media_access_audits" USING btree ("mediaAssetId","createdAt");--> statement-breakpoint
CREATE INDEX "communication_media_access_audits_actor_ix" ON "communication_media_access_audits" USING btree ("actorId","createdAt");--> statement-breakpoint
CREATE INDEX "communication_media_assets_conversation_ix" ON "communication_media_assets" USING btree ("conversationId","createdAt");--> statement-breakpoint
CREATE INDEX "communication_media_assets_retention_ix" ON "communication_media_assets" USING btree ("accessState","retentionUntil");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_rates_pair_uq" ON "exchange_rates" USING btree ("baseCurrency","targetCurrency");--> statement-breakpoint
CREATE INDEX "external_report_processing_run_report_idx" ON "external_report_processing_runs" USING btree ("reportId");--> statement-breakpoint
CREATE INDEX "external_report_processing_run_source_idx" ON "external_report_processing_runs" USING btree ("sourceRevisionId");--> statement-breakpoint
CREATE UNIQUE INDEX "external_report_source_revision_unique" ON "external_report_source_revisions" USING btree ("reportId","revisionNumber");--> statement-breakpoint
CREATE INDEX "external_report_source_revision_report_idx" ON "external_report_source_revisions" USING btree ("reportId");--> statement-breakpoint
CREATE UNIQUE INDEX "external_reports_v2_submission_key_unique" ON "external_reports" USING btree ("v2SubmissionKey");--> statement-breakpoint
CREATE UNIQUE INDEX "invoice_revisions_invoice_revision_unique" ON "invoice_revisions" USING btree ("invoiceId","revisionNumber");--> statement-breakpoint
CREATE INDEX "invoice_revisions_invoice_status_idx" ON "invoice_revisions" USING btree ("invoiceId","status");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_uq" ON "notifications" USING btree ("userId","dedupeKey");--> statement-breakpoint
CREATE INDEX "notifications_user_created_ix" ON "notifications" USING btree ("userId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_allowed_chats_line_chat_uq" ON "whatsapp_allowed_chats" USING btree ("lineId","externalChatId");--> statement-breakpoint
CREATE INDEX "whatsapp_allowed_chats_line_enabled_ix" ON "whatsapp_allowed_chats" USING btree ("lineId","enabled","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_endpoints_provider_phone_endpoint_uq" ON "whatsapp_communication_endpoints" USING btree ("provider","providerPhoneNumberId","providerEndpointId");--> statement-breakpoint
CREATE INDEX "whatsapp_endpoints_normalized_endpoint_ix" ON "whatsapp_communication_endpoints" USING btree ("provider","normalizedEndpointId");--> statement-breakpoint
CREATE INDEX "whatsapp_endpoints_connection_ix" ON "whatsapp_communication_endpoints" USING btree ("connectionId","lastSeenAt");--> statement-breakpoint
CREATE INDEX "whatsapp_connection_credentials_kind_ix" ON "whatsapp_connection_credentials" USING btree ("credentialKind","updatedAt");--> statement-breakpoint
CREATE INDEX "whatsapp_connection_transitions_connection_ix" ON "whatsapp_connection_transitions" USING btree ("connectionId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_connections_provider_phone_uq" ON "whatsapp_connections" USING btree ("provider","providerPhoneNumberId");--> statement-breakpoint
CREATE INDEX "whatsapp_connections_waba_phone_ix" ON "whatsapp_connections" USING btree ("wabaId","providerPhoneNumberId");--> statement-breakpoint
CREATE INDEX "whatsapp_connections_scope_display_phone_ix" ON "whatsapp_connections" USING btree ("clinicScope","normalizedDisplayPhone");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_activities_conversation_ix" ON "whatsapp_conversation_activities" USING btree ("conversationId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversation_assignments_conversation_uq" ON "whatsapp_conversation_assignments" USING btree ("conversationId");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_assignments_user_ix" ON "whatsapp_conversation_assignments" USING btree ("assignedUserId","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversation_case_links_active_uq" ON "whatsapp_conversation_case_links" USING btree ("conversationId","caseId","relationshipRole");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_case_links_conversation_ix" ON "whatsapp_conversation_case_links" USING btree ("conversationId","retiredAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversation_match_suggestions_uq" ON "whatsapp_conversation_match_suggestions" USING btree ("conversationId","candidateType","candidateId");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_match_suggestions_state_ix" ON "whatsapp_conversation_match_suggestions" USING btree ("conversationId","state");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversation_messages_association_uq" ON "whatsapp_conversation_messages" USING btree ("associationKey");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversation_messages_normalized_message_uq" ON "whatsapp_conversation_messages" USING btree ("normalizedMessageId");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_messages_conversation_ix" ON "whatsapp_conversation_messages" USING btree ("conversationId","createdAt");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_messages_source_event_ix" ON "whatsapp_conversation_messages" USING btree ("sourceEventId");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_messages_provider_message_ix" ON "whatsapp_conversation_messages" USING btree ("provider","providerMessageId");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversation_participants_key_uq" ON "whatsapp_conversation_participants" USING btree ("participantKey");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_participants_conversation_ix" ON "whatsapp_conversation_participants" USING btree ("conversationId","lastSeenAt");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_participants_endpoint_ix" ON "whatsapp_conversation_participants" USING btree ("endpointId","lastSeenAt");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_participants_person_ix" ON "whatsapp_conversation_participants" USING btree ("personIdentityId","lastSeenAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversation_read_states_conversation_user_uq" ON "whatsapp_conversation_read_states" USING btree ("conversationId","userId");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_read_states_user_ix" ON "whatsapp_conversation_read_states" USING btree ("userId","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversation_tags_conversation_tag_uq" ON "whatsapp_conversation_tags" USING btree ("conversationId","tag");--> statement-breakpoint
CREATE INDEX "whatsapp_conversation_tags_tag_ix" ON "whatsapp_conversation_tags" USING btree ("tag");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_conversations_key_uq" ON "whatsapp_conversations" USING btree ("conversationKey");--> statement-breakpoint
CREATE INDEX "whatsapp_conversations_connection_time_ix" ON "whatsapp_conversations" USING btree ("connectionId","lastMessageAt");--> statement-breakpoint
CREATE INDEX "whatsapp_conversations_provider_thread_ix" ON "whatsapp_conversations" USING btree ("provider","providerPhoneNumberId","providerThreadId");--> statement-breakpoint
CREATE INDEX "whatsapp_conversations_type_state_ix" ON "whatsapp_conversations" USING btree ("conversationType","lifecycleState");--> statement-breakpoint
CREATE INDEX "whatsapp_embedded_signup_sessions_state_created_ix" ON "whatsapp_embedded_signup_sessions" USING btree ("state","createdAt");--> statement-breakpoint
CREATE INDEX "whatsapp_embedded_signup_sessions_provider_identity_ix" ON "whatsapp_embedded_signup_sessions" USING btree ("providerWabaId","providerPhoneNumberId");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_endpoint_aliases_identity_uq" ON "whatsapp_endpoint_aliases" USING btree ("provider","providerPhoneNumberId","providerIdentityId");--> statement-breakpoint
CREATE INDEX "whatsapp_endpoint_aliases_endpoint_ix" ON "whatsapp_endpoint_aliases" USING btree ("endpointId","lastSeenAt");--> statement-breakpoint
CREATE INDEX "whatsapp_endpoint_aliases_connection_ix" ON "whatsapp_endpoint_aliases" USING btree ("connectionId","lastSeenAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_endpoint_evidence_hints_uq" ON "whatsapp_endpoint_evidence_hints" USING btree ("resolutionId","hintType","providerHintDigest");--> statement-breakpoint
CREATE INDEX "whatsapp_endpoint_evidence_hints_endpoint_ix" ON "whatsapp_endpoint_evidence_hints" USING btree ("endpointId","createdAt");--> statement-breakpoint
CREATE INDEX "whatsapp_endpoint_evidence_hints_source_event_ix" ON "whatsapp_endpoint_evidence_hints" USING btree ("sourceEventId");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_endpoint_person_links_endpoint_identity_uq" ON "whatsapp_endpoint_person_links" USING btree ("endpointId","personIdentityId");--> statement-breakpoint
CREATE INDEX "whatsapp_endpoint_person_links_endpoint_state_ix" ON "whatsapp_endpoint_person_links" USING btree ("endpointId","linkState");--> statement-breakpoint
CREATE INDEX "whatsapp_endpoint_person_links_identity_state_ix" ON "whatsapp_endpoint_person_links" USING btree ("personIdentityId","linkState");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_endpoint_resolution_candidates_key_uq" ON "whatsapp_endpoint_resolution_candidates" USING btree ("resolutionId","candidateKey");--> statement-breakpoint
CREATE INDEX "whatsapp_endpoint_resolution_candidates_record_ix" ON "whatsapp_endpoint_resolution_candidates" USING btree ("recordType","recordId");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_endpoint_resolutions_key_uq" ON "whatsapp_endpoint_resolutions" USING btree ("resolutionKey");--> statement-breakpoint
CREATE INDEX "whatsapp_endpoint_resolutions_source_event_ix" ON "whatsapp_endpoint_resolutions" USING btree ("sourceEventId");--> statement-breakpoint
CREATE INDEX "whatsapp_endpoint_resolutions_endpoint_ix" ON "whatsapp_endpoint_resolutions" USING btree ("endpointId","createdAt");--> statement-breakpoint
CREATE INDEX "whatsapp_endpoint_resolutions_state_ix" ON "whatsapp_endpoint_resolutions" USING btree ("resolutionState","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_inbox_settings_scope_uq" ON "whatsapp_inbox_settings" USING btree ("clinicScope");--> statement-breakpoint
CREATE INDEX "whatsapp_linked_device_credentials_kind_ix" ON "whatsapp_linked_device_credentials" USING btree ("credentialKind","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_linked_device_line_staff_uq" ON "whatsapp_linked_device_line_staff" USING btree ("lineId","userId");--> statement-breakpoint
CREATE INDEX "whatsapp_linked_device_line_staff_user_ix" ON "whatsapp_linked_device_line_staff" USING btree ("userId","lineId");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_linked_device_lines_scope_name_uq" ON "whatsapp_linked_device_lines" USING btree ("clinicScope","lineName");--> statement-breakpoint
CREATE INDEX "whatsapp_linked_device_lines_connection_ix" ON "whatsapp_linked_device_lines" USING btree ("connectionId");--> statement-breakpoint
CREATE INDEX "whatsapp_linked_device_lines_owner_ix" ON "whatsapp_linked_device_lines" USING btree ("ownerUserId","lifecycleState");--> statement-breakpoint
CREATE INDEX "whatsapp_linked_device_lines_state_ix" ON "whatsapp_linked_device_lines" USING btree ("lifecycleState","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_linked_messages_line_external_uq" ON "whatsapp_linked_device_messages" USING btree ("lineId","externalMessageId");--> statement-breakpoint
CREATE INDEX "whatsapp_linked_messages_chat_time_ix" ON "whatsapp_linked_device_messages" USING btree ("allowedChatId","messageTimestamp");--> statement-breakpoint
CREATE INDEX "whatsapp_linked_messages_owner_time_ix" ON "whatsapp_linked_device_messages" USING btree ("ownerUserId","messageTimestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_linked_device_sessions_line_uq" ON "whatsapp_linked_device_sessions" USING btree ("lineId");--> statement-breakpoint
CREATE INDEX "whatsapp_linked_device_sessions_state_ix" ON "whatsapp_linked_device_sessions" USING btree ("state","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_normalized_media_provider_item_uq" ON "whatsapp_normalized_media" USING btree ("provider","providerMediaItemKey");--> statement-breakpoint
CREATE INDEX "whatsapp_normalized_media_source_event_ix" ON "whatsapp_normalized_media" USING btree ("sourceEventId");--> statement-breakpoint
CREATE INDEX "whatsapp_normalized_media_provider_id_ix" ON "whatsapp_normalized_media" USING btree ("provider","providerMediaId");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_normalized_messages_provider_item_uq" ON "whatsapp_normalized_messages" USING btree ("provider","providerItemKey");--> statement-breakpoint
CREATE INDEX "whatsapp_normalized_messages_source_event_ix" ON "whatsapp_normalized_messages" USING btree ("sourceEventId");--> statement-breakpoint
CREATE INDEX "whatsapp_normalized_messages_provider_message_ix" ON "whatsapp_normalized_messages" USING btree ("provider","providerMessageId");--> statement-breakpoint
CREATE INDEX "whatsapp_normalized_messages_connection_time_ix" ON "whatsapp_normalized_messages" USING btree ("connectionId","providerTimestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_normalized_statuses_provider_key_uq" ON "whatsapp_normalized_statuses" USING btree ("provider","providerStatusKey");--> statement-breakpoint
CREATE INDEX "whatsapp_normalized_statuses_source_event_ix" ON "whatsapp_normalized_statuses" USING btree ("sourceEventId");--> statement-breakpoint
CREATE INDEX "whatsapp_normalized_statuses_provider_message_ix" ON "whatsapp_normalized_statuses" USING btree ("provider","providerMessageId");--> statement-breakpoint
CREATE INDEX "whatsapp_normalized_statuses_connection_time_ix" ON "whatsapp_normalized_statuses" USING btree ("connectionId","providerTimestamp");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_person_identity_records_identity_record_uq" ON "whatsapp_person_identity_records" USING btree ("personIdentityId","recordType","recordId");--> statement-breakpoint
CREATE INDEX "whatsapp_person_identity_records_record_ix" ON "whatsapp_person_identity_records" USING btree ("recordType","recordId");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_provider_event_batches_payload_uq" ON "whatsapp_provider_event_batches" USING btree ("provider","rawPayloadDigest");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_provider_events_provider_key_uq" ON "whatsapp_provider_events" USING btree ("provider","providerEventKey");--> statement-breakpoint
CREATE INDEX "whatsapp_provider_events_state_received_ix" ON "whatsapp_provider_events" USING btree ("processingState","receivedAt");--> statement-breakpoint
CREATE INDEX "whatsapp_provider_events_connection_received_ix" ON "whatsapp_provider_events" USING btree ("connectionId","receivedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_send_attempts_idempotency_uq" ON "whatsapp_send_attempts" USING btree ("idempotencyKey");--> statement-breakpoint
CREATE INDEX "whatsapp_send_attempts_conversation_ix" ON "whatsapp_send_attempts" USING btree ("conversationId","createdAt");--> statement-breakpoint
CREATE INDEX "whatsapp_send_attempts_provider_message_ix" ON "whatsapp_send_attempts" USING btree ("provider","providerMessageId");--> statement-breakpoint
CREATE INDEX "whatsapp_send_attempts_connection_created_ix" ON "whatsapp_send_attempts" USING btree ("connectionId","createdAt");--> statement-breakpoint
CREATE INDEX "whatsapp_send_attempts_client_action_ix" ON "whatsapp_send_attempts" USING btree ("clientActionId","createdAt");--> statement-breakpoint
CREATE INDEX "whatsapp_send_attempts_correlation_ix" ON "whatsapp_send_attempts" USING btree ("correlationId","createdAt");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_synthetic_test_recipients_line_phone_uq" ON "whatsapp_synthetic_test_recipients" USING btree ("lineId","normalizedPhone");--> statement-breakpoint
CREATE INDEX "whatsapp_synthetic_test_recipients_line_status_ix" ON "whatsapp_synthetic_test_recipients" USING btree ("lineId","status","updatedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "zernio_webhook_events_provider_event_uq" ON "zernio_webhook_events" USING btree ("provider","eventId");