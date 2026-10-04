-- Persist alternate provider identity forms such as WhatsApp LIDs.
-- This table stores transport aliases only and never creates or links a person,
-- Lead, Patient, MRN, treatment case, or clinical record.
CREATE TABLE `whatsapp_endpoint_aliases` (
  `id` int AUTO_INCREMENT NOT NULL,
  `clinicScope` varchar(64) NOT NULL DEFAULT 'fertiliv',
  `provider` enum('meta','wppconnect') NOT NULL DEFAULT 'meta',
  `connectionId` int,
  `providerPhoneNumberId` varchar(128) NOT NULL,
  `providerIdentityId` varchar(128) NOT NULL,
  `endpointId` int NOT NULL,
  `sourceEventId` int,
  `aliasKind` varchar(64) NOT NULL DEFAULT 'provider_identity',
  `aliasState` enum('active','revoked') NOT NULL DEFAULT 'active',
  `firstSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastSeenAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `whatsapp_endpoint_aliases_id` PRIMARY KEY(`id`),
  CONSTRAINT `whatsapp_endpoint_aliases_identity_uq` UNIQUE(`provider`,`providerPhoneNumberId`,`providerIdentityId`),
  KEY `whatsapp_endpoint_aliases_endpoint_ix` (`endpointId`,`lastSeenAt`),
  KEY `whatsapp_endpoint_aliases_connection_ix` (`connectionId`,`lastSeenAt`)
);
