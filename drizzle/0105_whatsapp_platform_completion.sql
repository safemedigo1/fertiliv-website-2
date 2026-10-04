-- WhatsApp communications platform completion foundation.
-- Additive only: preserves Meta/WU-09/Manual Cloud API routing and test sessions.
-- WPPConnect remains non-production and feature-controlled.

ALTER TABLE `notifications`
  MODIFY COLUMN `type` ENUM('appointment_reminder','appointment_cancellation','invoice_issued','payment_confirmed','lab_result_ready','inbox_new_conversation','inbox_new_message','inbox_assignment','inbox_reassignment','inbox_crm_review','whatsapp_line_health','general') NOT NULL;
ALTER TABLE `notifications` ADD COLUMN `dedupeKey` VARCHAR(255) NULL AFTER `relatedType`;
CREATE UNIQUE INDEX `notifications_user_dedupe_uq` ON `notifications` (`userId`,`dedupeKey`);
CREATE INDEX `notifications_user_created_ix` ON `notifications` (`userId`,`createdAt`);

ALTER TABLE `whatsapp_linked_device_sessions`
  ADD COLUMN `sessionName` VARCHAR(128) NULL,
  ADD COLUMN `providerAccountHint` VARCHAR(64) NULL,
  ADD COLUMN `providerPushName` VARCHAR(128) NULL,
  ADD COLUMN `providerPlatform` VARCHAR(64) NULL,
  ADD COLUMN `reconnectCount` INT NOT NULL DEFAULT 0,
  ADD COLUMN `lastActivityAt` TIMESTAMP NULL,
  ADD COLUMN `lastHealthCheckedAt` TIMESTAMP NULL,
  ADD COLUMN `lastErrorCategory` VARCHAR(128) NULL,
  ADD COLUMN `lastErrorAt` TIMESTAMP NULL;

CREATE TABLE `whatsapp_inbox_notification_preferences` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL UNIQUE,
  `notifyNewConversation` BOOLEAN NOT NULL DEFAULT TRUE,
  `notifyNewMessage` BOOLEAN NOT NULL DEFAULT TRUE,
  `notifyAssignment` BOOLEAN NOT NULL DEFAULT TRUE,
  `notifyHealth` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `whatsapp_conversation_match_suggestions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `conversationId` INT NOT NULL,
  `endpointId` INT NULL,
  `candidateType` ENUM('person','lead','patient') NOT NULL,
  `candidateId` INT NOT NULL,
  `matchedField` ENUM('exact_phone','provider_hint') NOT NULL,
  `confidence` ENUM('high','medium') NOT NULL DEFAULT 'high',
  `state` ENUM('pending','accepted','dismissed') NOT NULL DEFAULT 'pending',
  `reviewedById` INT NULL,
  `reviewedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `whatsapp_conversation_match_suggestions_uq` (`conversationId`,`candidateType`,`candidateId`),
  KEY `whatsapp_conversation_match_suggestions_state_ix` (`conversationId`,`state`)
);

CREATE TABLE `communication_media_assets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `conversationId` INT NOT NULL,
  `normalizedMediaId` INT NULL,
  `channelKind` VARCHAR(64) NOT NULL,
  `storageKey` VARCHAR(512) NOT NULL UNIQUE,
  `encryptedAtRest` BOOLEAN NOT NULL DEFAULT TRUE,
  `encryptionVersion` VARCHAR(32) NOT NULL DEFAULT 'storage-managed-v1',
  `mediaType` VARCHAR(64) NOT NULL,
  `mimeType` VARCHAR(128) NULL,
  `filename` VARCHAR(512) NULL,
  `sha256` VARCHAR(128) NULL,
  `accessState` ENUM('available','quarantined','deleted') NOT NULL DEFAULT 'available',
  `retentionUntil` TIMESTAMP NULL,
  `createdById` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `communication_media_assets_conversation_ix` (`conversationId`,`createdAt`),
  KEY `communication_media_assets_retention_ix` (`accessState`,`retentionUntil`)
);

CREATE TABLE `communication_media_access_audits` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `mediaAssetId` INT NOT NULL,
  `conversationId` INT NOT NULL,
  `actorId` INT NOT NULL,
  `action` ENUM('open','download','denied') NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `communication_media_access_audits_asset_ix` (`mediaAssetId`,`createdAt`),
  KEY `communication_media_access_audits_actor_ix` (`actorId`,`createdAt`)
);

INSERT INTO `whatsapp_inbox_notification_preferences` (`userId`)
SELECT `id` FROM `users`
WHERE NOT EXISTS (
  SELECT 1 FROM `whatsapp_inbox_notification_preferences` p WHERE p.`userId` = `users`.`id`
);

-- Keep the migration journal-independent, matching the project's explicit additive SQL convention.
