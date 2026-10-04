-- WhatsApp Linked Device / QR foundation.
-- Additive only: no Meta route changes, no production cutover, no QR payload
-- storage, no raw linked-device credentials, and no provider implementation.

CREATE TABLE `whatsapp_linked_device_lines` (
  `id` int AUTO_INCREMENT NOT NULL,
  `clinicScope` varchar(64) NOT NULL DEFAULT 'fertiliv',
  `lineName` varchar(128) NOT NULL,
  `connectionId` int,
  `providerApprovalState` enum('blocked','approved') NOT NULL DEFAULT 'blocked',
  `adapterKind` varchar(64) NOT NULL DEFAULT 'unselected',
  `lifecycleState` enum('not_started','creating_session','waiting_for_qr','qr_ready','qr_expired','linking','connected','reconnecting','disconnected','logged_out','session_invalid','failed','disabled') NOT NULL DEFAULT 'not_started',
  `healthState` enum('unknown','healthy','degraded','unavailable') NOT NULL DEFAULT 'unknown',
  `displayPhone` varchar(32),
  `normalizedDisplayPhone` varchar(32),
  `connectedAt` timestamp NULL,
  `lastSeenAt` timestamp NULL,
  `lastSuccessfulSyncAt` timestamp NULL,
  `disconnectedAt` timestamp NULL,
  `createdById` int NOT NULL,
  `updatedById` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_linked_device_lines_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_linked_device_lines_scope_name_uq` UNIQUE(`clinicScope`,`lineName`),
  INDEX `whatsapp_linked_device_lines_connection_ix` (`connectionId`),
  INDEX `whatsapp_linked_device_lines_state_ix` (`lifecycleState`,`updatedAt`)
);

CREATE TABLE `whatsapp_linked_device_line_staff` (
  `id` int AUTO_INCREMENT NOT NULL,
  `lineId` int NOT NULL,
  `userId` int NOT NULL,
  `grantedById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_linked_device_line_staff_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_linked_device_line_staff_uq` UNIQUE(`lineId`,`userId`),
  INDEX `whatsapp_linked_device_line_staff_user_ix` (`userId`,`lineId`)
);

CREATE TABLE `whatsapp_linked_device_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `lineId` int NOT NULL,
  `state` enum('not_started','creating_session','waiting_for_qr','qr_ready','qr_expired','linking','connected','reconnecting','disconnected','logged_out','session_invalid','failed','disabled') NOT NULL DEFAULT 'not_started',
  `failureCategory` varchar(80),
  `lastRequestedAt` timestamp NULL,
  `lastStateChangedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_linked_device_sessions_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_linked_device_sessions_line_uq` UNIQUE(`lineId`),
  INDEX `whatsapp_linked_device_sessions_state_ix` (`state`,`updatedAt`)
);

CREATE TABLE `whatsapp_linked_device_credentials` (
  `id` int AUTO_INCREMENT NOT NULL,
  `lineId` int NOT NULL,
  `credentialKind` varchar(64) NOT NULL,
  `encryptedCredential` longtext NOT NULL,
  `encryptionVersion` varchar(16) NOT NULL DEFAULT 'v1',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lastValidatedAt` timestamp NULL,
  CONSTRAINT `whatsapp_linked_device_credentials_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_linked_device_credentials_line_uq` UNIQUE(`lineId`),
  INDEX `whatsapp_linked_device_credentials_kind_ix` (`credentialKind`,`updatedAt`)
);
