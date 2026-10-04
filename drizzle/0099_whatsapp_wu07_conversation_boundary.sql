-- WhatsApp WU-07 Conversation boundary.
-- Additive only: transport/thread boundaries and provenance associations.
-- No historical backfill, patient/lead mutation, clinical linkage, or treatment-case data.

CREATE TABLE `whatsapp_conversations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `clinicScope` varchar(64) NOT NULL DEFAULT 'fertiliv',
  `provider` enum('meta') NOT NULL DEFAULT 'meta',
  `connectionId` int,
  `connectionRoute` enum('legacy_env','persisted'),
  `providerPhoneNumberId` varchar(128) NOT NULL,
  `providerThreadId` varchar(128),
  `conversationKey` varchar(64) NOT NULL,
  `conversationType` enum('private','group') NOT NULL,
  `identityBasis` enum('remote_endpoint','provider_thread') NOT NULL,
  `endpointResolutionState` enum('unresolved','candidate_single','candidate_multiple','confirmed') NOT NULL,
  `humanActorResolutionState` enum('unresolved','confirmed') NOT NULL DEFAULT 'unresolved',
  `medicalSubjectResolutionState` enum('unresolved') NOT NULL DEFAULT 'unresolved',
  `lifecycleState` enum('active','archived') NOT NULL DEFAULT 'active',
  `firstMessageAt` timestamp NULL,
  `lastMessageAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_conversations_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_conversations_key_uq` UNIQUE(`conversationKey`),
  INDEX `whatsapp_conversations_connection_time_ix` (`connectionId`,`lastMessageAt`),
  INDEX `whatsapp_conversations_provider_thread_ix` (`provider`,`providerPhoneNumberId`,`providerThreadId`),
  INDEX `whatsapp_conversations_type_state_ix` (`conversationType`,`lifecycleState`)
);

CREATE TABLE `whatsapp_conversation_participants` (
  `id` int AUTO_INCREMENT NOT NULL,
  `conversationId` int NOT NULL,
  `endpointId` int,
  `personIdentityId` int,
  `sourceResolutionId` int,
  `participantKey` varchar(64) NOT NULL,
  `participantRole` enum('remote_endpoint','group_participant') NOT NULL,
  `participantState` enum('unresolved','candidate','confirmed') NOT NULL DEFAULT 'unresolved',
  `providerParticipantId` varchar(128) NOT NULL,
  `providerHintDigest` varchar(64),
  `humanActorResolutionState` enum('unresolved','confirmed') NOT NULL DEFAULT 'unresolved',
  `medicalSubjectResolutionState` enum('unresolved') NOT NULL DEFAULT 'unresolved',
  `firstSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_conversation_participants_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_conversation_participants_key_uq` UNIQUE(`participantKey`),
  INDEX `whatsapp_conversation_participants_conversation_ix` (`conversationId`,`lastSeenAt`),
  INDEX `whatsapp_conversation_participants_endpoint_ix` (`endpointId`,`lastSeenAt`),
  INDEX `whatsapp_conversation_participants_person_ix` (`personIdentityId`,`lastSeenAt`)
);

CREATE TABLE `whatsapp_conversation_messages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `conversationId` int NOT NULL,
  `sourceEventId` int NOT NULL,
  `normalizedMessageId` int NOT NULL,
  `resolutionId` int,
  `provider` enum('meta') NOT NULL DEFAULT 'meta',
  `providerPhoneNumberId` varchar(128) NOT NULL,
  `providerMessageId` varchar(128),
  `providerItemKey` varchar(128) NOT NULL,
  `associationKey` varchar(64) NOT NULL,
  `correlationState` enum('correlated','quarantined') NOT NULL DEFAULT 'correlated',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_conversation_messages_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_conversation_messages_association_uq` UNIQUE(`associationKey`),
  CONSTRAINT `whatsapp_conversation_messages_normalized_message_uq` UNIQUE(`normalizedMessageId`),
  INDEX `whatsapp_conversation_messages_conversation_ix` (`conversationId`,`createdAt`),
  INDEX `whatsapp_conversation_messages_source_event_ix` (`sourceEventId`),
  INDEX `whatsapp_conversation_messages_provider_message_ix` (`provider`,`providerMessageId`)
);
