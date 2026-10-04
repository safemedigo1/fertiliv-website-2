ALTER TABLE `appointments`
  ADD COLUMN `appointmentScheduleRevision` int NOT NULL DEFAULT 1;

CREATE TABLE `appointment_reminder_runtime` (
  `id` int NOT NULL,
  `scheduleCronTaskUid` varchar(128) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);

CREATE TABLE `appointment_reminder_deliveries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `deliveryKey` varchar(64) NOT NULL,
  `appointmentId` int NOT NULL,
  `recipientKey` varchar(96) NOT NULL,
  `recipientType` enum('patient','lead') NOT NULL,
  `channel` enum('email') NOT NULL DEFAULT 'email',
  `scheduleRevision` int NOT NULL,
  `offsetMinutes` int NOT NULL,
  `dueAt` timestamp NOT NULL,
  `status` enum('scheduled','claimed','dispatching','retry_pending','sent','failed','skipped','invalidated') NOT NULL DEFAULT 'scheduled',
  `nextAttemptAt` timestamp NULL,
  `claimedAt` timestamp NULL,
  `claimToken` varchar(64) NULL,
  `claimExpiresAt` timestamp NULL,
  `dispatchingAt` timestamp NULL,
  `invalidatedAt` timestamp NULL,
  `invalidationReason` varchar(64) NULL,
  `skippedReason` varchar(96) NULL,
  `sentAt` timestamp NULL,
  `failedAt` timestamp NULL,
  `recipientEmail` varchar(320) NULL,
  `profileLanguage` varchar(16) NULL,
  `deliveredLanguage` varchar(16) NULL,
  `localeFallbackUsed` boolean NOT NULL DEFAULT false,
  `templateKey` varchar(128) NOT NULL,
  `templateVersion` varchar(64) NOT NULL,
  `providerMessageId` varchar(256) NULL,
  `attemptCount` int NOT NULL DEFAULT 0,
  `lastFailureClassification` varchar(64) NULL,
  `lastFailureCode` varchar(128) NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `appointment_reminder_deliveries_delivery_key_uq` UNIQUE (`deliveryKey`),
  CONSTRAINT `appointment_reminder_deliveries_business_identity_uq` UNIQUE (`appointmentId`,`recipientKey`,`channel`,`offsetMinutes`,`scheduleRevision`),
  KEY `appointment_reminder_deliveries_due_processing_ix` (`status`,`nextAttemptAt`,`dueAt`),
  KEY `appointment_reminder_deliveries_appointment_revision_ix` (`appointmentId`,`scheduleRevision`),
  KEY `appointment_reminder_deliveries_claim_expiry_ix` (`claimExpiresAt`)
);

CREATE TABLE `appointment_reminder_delivery_attempts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reminderDeliveryId` int NOT NULL,
  `attemptNumber` int NOT NULL,
  `idempotencyKey` varchar(128) NOT NULL,
  `outcome` enum('sent','retryable_failure','permanent_failure','skipped_recipient_unavailable','invalidated_before_send') NOT NULL,
  `attemptedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  `recipientEmail` varchar(320) NULL,
  `profileLanguage` varchar(16) NULL,
  `deliveredLanguage` varchar(16) NULL,
  `localeFallbackUsed` boolean NOT NULL DEFAULT false,
  `providerMessageId` varchar(256) NULL,
  `failureClassification` varchar(64) NULL,
  `failureCode` varchar(128) NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `appointment_reminder_delivery_attempts_delivery_number_uq` UNIQUE (`reminderDeliveryId`,`attemptNumber`),
  KEY `appointment_reminder_delivery_attempts_delivery_ix` (`reminderDeliveryId`)
);
