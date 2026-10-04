-- WhatsApp Phase 1 foundation: connection identity, reversible legacy routing,
-- outbound-attempt provenance, and authenticated provider-event capture.
-- Additive only: no legacy message rewrite, no backfill, no Patient/Lead creation,
-- no credential values, and no production cutover.

CREATE TABLE `whatsapp_connections` (
  `id` int AUTO_INCREMENT NOT NULL,
  `clinicScope` varchar(64) NOT NULL DEFAULT 'fertiliv',
  `provider` enum('meta') NOT NULL DEFAULT 'meta',
  `onboardingMethod` enum('manual_cloud_api','meta_embedded_signup','meta_coexistence') NOT NULL,
  `providerPhoneNumberId` varchar(128) NOT NULL,
  `wabaId` varchar(128),
  `businessPortfolioId` varchar(128),
  `displayPhone` varchar(32),
  `normalizedDisplayPhone` varchar(32),
  `displayName` varchar(256),
  `providerMetadata` json,
  `credentialSource` enum('legacy_env','secret_reference') NOT NULL,
  `credentialRef` varchar(512) NOT NULL,
  `lifecycleStatus` enum('onboarding','connected','needs_attention','paused','disconnected','error') NOT NULL DEFAULT 'onboarding',
  `providerStateSnapshot` json,
  `healthState` enum('unknown','healthy','degraded','unavailable') NOT NULL DEFAULT 'unknown',
  `lastHealthCheckedAt` timestamp NULL,
  `lastInboundEventAt` timestamp NULL,
  `lastOutboundAcceptedAt` timestamp NULL,
  `lastProviderStatusAt` timestamp NULL,
  `lastTransitionAt` timestamp NULL,
  `createdById` int,
  `updatedById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_connections_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_connections_provider_phone_uq` UNIQUE(`provider`,`providerPhoneNumberId`),
  INDEX `whatsapp_connections_waba_phone_ix` (`wabaId`,`providerPhoneNumberId`),
  INDEX `whatsapp_connections_scope_display_phone_ix` (`clinicScope`,`normalizedDisplayPhone`)
);

CREATE TABLE `whatsapp_connection_transitions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `connectionId` int NOT NULL,
  `fromOnboardingMethod` enum('manual_cloud_api','meta_embedded_signup','meta_coexistence'),
  `toOnboardingMethod` enum('manual_cloud_api','meta_embedded_signup','meta_coexistence') NOT NULL,
  `fromCredentialSource` enum('legacy_env','secret_reference'),
  `toCredentialSource` enum('legacy_env','secret_reference') NOT NULL,
  `transitionReason` varchar(128) NOT NULL,
  `transitionedById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_connection_transitions_id_pk` PRIMARY KEY (`id`),
  INDEX `whatsapp_connection_transitions_connection_ix` (`connectionId`,`createdAt`)
);

CREATE TABLE `whatsapp_send_attempts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `connectionId` int,
  `connectionRoute` enum('legacy_env','persisted') NOT NULL,
  `provider` enum('meta') NOT NULL DEFAULT 'meta',
  `providerPhoneNumberId` varchar(128) NOT NULL,
  `actorUserId` int,
  `recipientEndpoint` varchar(64) NOT NULL,
  `intentType` enum('text','template','document') NOT NULL,
  `payloadDigest` varchar(64) NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `attemptState` enum('pending','accepted','failed','ambiguous') NOT NULL DEFAULT 'pending',
  `providerMessageId` varchar(128),
  `failureCategory` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `acceptedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_send_attempts_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_send_attempts_idempotency_uq` UNIQUE(`idempotencyKey`),
  INDEX `whatsapp_send_attempts_provider_message_ix` (`provider`,`providerMessageId`),
  INDEX `whatsapp_send_attempts_connection_created_ix` (`connectionId`,`createdAt`)
);

CREATE TABLE `whatsapp_provider_event_batches` (
  `id` int AUTO_INCREMENT NOT NULL,
  `provider` enum('meta') NOT NULL DEFAULT 'meta',
  `rawPayloadDigest` varchar(64) NOT NULL,
  `rawPayload` longtext NOT NULL,
  `signatureValid` boolean NOT NULL DEFAULT false,
  `receivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastReceivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_provider_event_batches_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_provider_event_batches_payload_uq` UNIQUE(`provider`,`rawPayloadDigest`)
);

CREATE TABLE `whatsapp_provider_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `batchId` int NOT NULL,
  `connectionId` int,
  `connectionRoute` enum('legacy_env','persisted'),
  `provider` enum('meta') NOT NULL DEFAULT 'meta',
  `wabaId` varchar(128),
  `providerPhoneNumberId` varchar(128),
  `providerField` varchar(128) NOT NULL,
  `providerEventKey` varchar(128) NOT NULL,
  `routingState` enum('legacy_env','resolved','unmapped','mismatched','unsupported') NOT NULL,
  `processingState` enum('received','processing','applied','quarantined','failed','dead_letter') NOT NULL DEFAULT 'received',
  `failureCategory` varchar(64),
  `receivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processedAt` timestamp NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_provider_events_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_provider_events_provider_key_uq` UNIQUE(`provider`,`providerEventKey`),
  INDEX `whatsapp_provider_events_state_received_ix` (`processingState`,`receivedAt`),
  INDEX `whatsapp_provider_events_connection_received_ix` (`connectionId`,`receivedAt`)
);
