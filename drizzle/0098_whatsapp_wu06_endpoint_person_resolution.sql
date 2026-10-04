-- WhatsApp WU-06 endpoint/person resolution foundation.
-- Additive only: no backfill, no historical identity matching, and no workflow
-- entity creation. WU-05 raw/normalized evidence remains the source boundary.

CREATE TABLE `whatsapp_communication_endpoints` (
  `id` int AUTO_INCREMENT NOT NULL,
  `clinicScope` varchar(64) NOT NULL DEFAULT 'fertiliv',
  `connectionId` int,
  `connectionRoute` enum('legacy_env','persisted'),
  `provider` enum('meta') NOT NULL DEFAULT 'meta',
  `providerPhoneNumberId` varchar(128) NOT NULL,
  `providerEndpointId` varchar(128) NOT NULL,
  `endpointKind` enum('phone') NOT NULL DEFAULT 'phone',
  `normalizedEndpointId` varchar(128),
  `lifecycleState` enum('active','blocked') NOT NULL DEFAULT 'active',
  `firstSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_communication_endpoints_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_endpoints_provider_phone_endpoint_uq` UNIQUE(`provider`,`providerPhoneNumberId`,`providerEndpointId`),
  INDEX `whatsapp_endpoints_normalized_endpoint_ix` (`provider`,`normalizedEndpointId`),
  INDEX `whatsapp_endpoints_connection_ix` (`connectionId`,`lastSeenAt`)
);

CREATE TABLE `whatsapp_person_identities` (
  `id` int AUTO_INCREMENT NOT NULL,
  `clinicScope` varchar(64) NOT NULL DEFAULT 'fertiliv',
  `identityKind` enum('human') NOT NULL DEFAULT 'human',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_person_identities_id_pk` PRIMARY KEY (`id`)
);

CREATE TABLE `whatsapp_person_identity_records` (
  `id` int AUTO_INCREMENT NOT NULL,
  `personIdentityId` int NOT NULL,
  `recordType` enum('lead','patient') NOT NULL,
  `recordId` int NOT NULL,
  `relationshipState` enum('active','retired') NOT NULL DEFAULT 'active',
  `trustSource` enum('manual_confirmation','trusted_import') NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_person_identity_records_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_person_identity_records_identity_record_uq` UNIQUE(`personIdentityId`,`recordType`,`recordId`),
  INDEX `whatsapp_person_identity_records_record_ix` (`recordType`,`recordId`)
);

CREATE TABLE `whatsapp_endpoint_person_links` (
  `id` int AUTO_INCREMENT NOT NULL,
  `endpointId` int NOT NULL,
  `personIdentityId` int NOT NULL,
  `linkState` enum('confirmed','revoked') NOT NULL DEFAULT 'confirmed',
  `trustSource` enum('manual_confirmation','trusted_import') NOT NULL,
  `confirmedById` int,
  `confirmedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revokedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_endpoint_person_links_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_endpoint_person_links_endpoint_identity_uq` UNIQUE(`endpointId`,`personIdentityId`),
  INDEX `whatsapp_endpoint_person_links_endpoint_state_ix` (`endpointId`,`linkState`),
  INDEX `whatsapp_endpoint_person_links_identity_state_ix` (`personIdentityId`,`linkState`)
);

CREATE TABLE `whatsapp_endpoint_resolutions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sourceEventId` int NOT NULL,
  `provider` enum('meta') NOT NULL DEFAULT 'meta',
  `connectionId` int,
  `connectionRoute` enum('legacy_env','persisted'),
  `providerPhoneNumberId` varchar(128),
  `providerEndpointId` varchar(128),
  `providerMessageId` varchar(128),
  `routingState` enum('legacy_env','resolved','unmapped','mismatched','unsupported') NOT NULL,
  `endpointId` int,
  `resolutionKey` varchar(64) NOT NULL,
  `resolutionState` enum('unresolved','candidate_single','candidate_multiple','confirmed') NOT NULL,
  `resolutionReason` varchar(128) NOT NULL,
  `confirmedPersonIdentityId` int,
  `humanActorResolutionState` enum('unresolved','confirmed') NOT NULL DEFAULT 'unresolved',
  `medicalSubjectResolutionState` enum('unresolved') NOT NULL DEFAULT 'unresolved',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_endpoint_resolutions_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_endpoint_resolutions_key_uq` UNIQUE(`resolutionKey`),
  INDEX `whatsapp_endpoint_resolutions_source_event_ix` (`sourceEventId`),
  INDEX `whatsapp_endpoint_resolutions_endpoint_ix` (`endpointId`,`createdAt`),
  INDEX `whatsapp_endpoint_resolutions_state_ix` (`resolutionState`,`createdAt`)
);

CREATE TABLE `whatsapp_endpoint_resolution_candidates` (
  `id` int AUTO_INCREMENT NOT NULL,
  `resolutionId` int NOT NULL,
  `recordType` enum('lead','patient') NOT NULL,
  `recordId` int NOT NULL,
  `matchedField` enum('phone','secondaryPhone') NOT NULL,
  `convertedPatientId` int,
  `candidateKey` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_endpoint_resolution_candidates_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_endpoint_resolution_candidates_key_uq` UNIQUE(`resolutionId`,`candidateKey`),
  INDEX `whatsapp_endpoint_resolution_candidates_record_ix` (`recordType`,`recordId`)
);

CREATE TABLE `whatsapp_endpoint_evidence_hints` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sourceEventId` int NOT NULL,
  `resolutionId` int NOT NULL,
  `endpointId` int,
  `hintType` varchar(64) NOT NULL,
  `providerHintValue` varchar(512) NOT NULL,
  `providerHintDigest` varchar(64) NOT NULL,
  `evidenceState` enum('provider_hint') NOT NULL DEFAULT 'provider_hint',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_endpoint_evidence_hints_id_pk` PRIMARY KEY (`id`),
  CONSTRAINT `whatsapp_endpoint_evidence_hints_uq` UNIQUE(`resolutionId`,`hintType`,`providerHintDigest`),
  INDEX `whatsapp_endpoint_evidence_hints_endpoint_ix` (`endpointId`,`createdAt`),
  INDEX `whatsapp_endpoint_evidence_hints_source_event_ix` (`sourceEventId`)
);
