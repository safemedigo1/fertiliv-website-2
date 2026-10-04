-- Operational Unified Inbox foundation.
-- Additive only: preserves Provider Evidence, Normalized Messages,
-- Endpoint, Conversation, WU-09, and existing Linked Device sessions.

CREATE TABLE IF NOT EXISTS `whatsapp_conversation_read_states` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversationId` int NOT NULL,
  `userId` int NOT NULL,
  `lastReadMessageId` int DEFAULT NULL,
  `readAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `whatsapp_conversation_read_states_conversation_user_uq` (`conversationId`, `userId`),
  KEY `whatsapp_conversation_read_states_user_ix` (`userId`, `updatedAt`)
);

CREATE TABLE IF NOT EXISTS `whatsapp_conversation_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversationId` int NOT NULL,
  `assignedUserId` int DEFAULT NULL,
  `assignedById` int NOT NULL,
  `assignedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `whatsapp_conversation_assignments_conversation_uq` (`conversationId`),
  KEY `whatsapp_conversation_assignments_user_ix` (`assignedUserId`, `updatedAt`)
);

CREATE TABLE IF NOT EXISTS `whatsapp_conversation_case_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversationId` int NOT NULL,
  `caseId` int NOT NULL,
  `relationshipRole` enum('patient','husband','wife','representative','family','other') NOT NULL DEFAULT 'other',
  `linkedById` int NOT NULL,
  `linkedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `retiredAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `whatsapp_conversation_case_links_active_uq` (`conversationId`, `caseId`, `relationshipRole`),
  KEY `whatsapp_conversation_case_links_conversation_ix` (`conversationId`, `retiredAt`)
);

CREATE TABLE IF NOT EXISTS `whatsapp_inbox_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clinicScope` varchar(64) NOT NULL DEFAULT 'fertiliv',
  `phoneVisibility` enum('full_authorized','mask_selected_roles','admin_only_full') NOT NULL DEFAULT 'full_authorized',
  `newSenderBehavior` enum('conversation_only','create_contact','create_lead') NOT NULL DEFAULT 'conversation_only',
  `exactPhoneMatch` enum('suggest','auto_link_trusted','never_auto_link') NOT NULL DEFAULT 'never_auto_link',
  `duplicateDetection` enum('suggest','require_confirmation') NOT NULL DEFAULT 'require_confirmation',
  `caseSuggestions` tinyint(1) NOT NULL DEFAULT 0,
  `automaticPatient` tinyint(1) NOT NULL DEFAULT 0,
  `automaticMrn` tinyint(1) NOT NULL DEFAULT 0,
  `automaticClinicalRecord` tinyint(1) NOT NULL DEFAULT 0,
  `updatedById` int DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `whatsapp_inbox_settings_scope_uq` (`clinicScope`)
);

INSERT INTO `whatsapp_inbox_settings` (`clinicScope`)
SELECT 'fertiliv'
WHERE NOT EXISTS (
  SELECT 1 FROM `whatsapp_inbox_settings` WHERE `clinicScope` = 'fertiliv'
);
