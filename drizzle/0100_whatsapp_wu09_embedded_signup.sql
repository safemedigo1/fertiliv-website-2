-- WhatsApp WU-09: standard Meta Embedded Signup onboarding foundation.
-- Additive only: no backfill, no legacy route cutover, no raw authorization-code
-- retention, and no plaintext/provider credential storage.

CREATE TABLE `whatsapp_embedded_signup_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `requestId` varchar(64) NOT NULL,
  `startedById` int NOT NULL,
  `state` enum('started','cancelled','failed','completed') NOT NULL DEFAULT 'started',
  `completionEvent` varchar(80),
  `currentStep` varchar(80),
  `failureCategory` varchar(80),
  `providerWabaId` varchar(128),
  `providerPhoneNumberId` varchar(128),
  `providerBusinessPortfolioId` varchar(128),
  `authorizationCodeDigest` varchar(64),
  `connectionId` int,
  `expiresAt` timestamp NOT NULL,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_embedded_signup_sessions_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_embedded_signup_sessions_request_uq` UNIQUE(`requestId`),
  CONSTRAINT `whatsapp_embedded_signup_sessions_code_digest_uq` UNIQUE(`authorizationCodeDigest`),
  INDEX `whatsapp_embedded_signup_sessions_state_created_ix` (`state`,`createdAt`),
  INDEX `whatsapp_embedded_signup_sessions_provider_identity_ix` (`providerWabaId`,`providerPhoneNumberId`)
);

CREATE TABLE `whatsapp_connection_credentials` (
  `id` int AUTO_INCREMENT NOT NULL,
  `connectionId` int NOT NULL,
  `credentialKind` enum('business_access_token') NOT NULL DEFAULT 'business_access_token',
  `encryptedCredential` longtext NOT NULL,
  `encryptionVersion` varchar(16) NOT NULL DEFAULT 'v1',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `lastValidatedAt` timestamp NULL,
  CONSTRAINT `whatsapp_connection_credentials_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_connection_credentials_connection_uq` UNIQUE(`connectionId`),
  INDEX `whatsapp_connection_credentials_kind_ix` (`credentialKind`,`updatedAt`)
);
