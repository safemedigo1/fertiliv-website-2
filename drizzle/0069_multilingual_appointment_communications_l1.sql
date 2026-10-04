ALTER TABLE `appointment_communication_deliveries`
  MODIFY COLUMN `language` varchar(16) NOT NULL,
  ADD COLUMN `profileLanguage` varchar(16) NULL AFTER `recipientType`,
  ADD COLUMN `localeFallbackUsed` boolean NOT NULL DEFAULT false AFTER `language`;
