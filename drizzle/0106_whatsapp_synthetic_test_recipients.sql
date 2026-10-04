-- Synthetic-only recipient approvals for the in-app WPPConnect sandbox.
-- This is not a production patient-messaging allowlist.
CREATE TABLE `whatsapp_synthetic_test_recipients` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `clinicScope` VARCHAR(64) NOT NULL DEFAULT 'fertiliv',
  `lineId` INT NOT NULL,
  `normalizedPhone` VARCHAR(16) NOT NULL,
  `label` VARCHAR(128) NULL,
  `status` ENUM('active','revoked') NOT NULL DEFAULT 'active',
  `approvedById` INT NOT NULL,
  `approvedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revokedById` INT NULL,
  `revokedAt` TIMESTAMP NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `whatsapp_synthetic_test_recipients_line_phone_uq` (`lineId`,`normalizedPhone`),
  KEY `whatsapp_synthetic_test_recipients_line_status_ix` (`lineId`,`status`,`updatedAt`)
);
