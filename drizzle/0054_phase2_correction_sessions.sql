-- Phase 2 Correction: Add draft_sessions and save_idempotency tables
-- These are metadata-only tables; no clinical JSON is stored here.

CREATE TABLE IF NOT EXISTS `draft_sessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `draftSessionId` varchar(64) NOT NULL,
  `leadId` int,
  `patientId` int,
  `intakeId` int,
  `activeWriterToken` varchar(64) NOT NULL,
  `writerLeaseExpiresAt` timestamp NOT NULL,
  `lastMeaningfulActivityAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` int NOT NULL,
  `status` enum('active','saved','cancelled','expired') NOT NULL DEFAULT 'active',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `draft_sessions_pk` PRIMARY KEY (`id`),
  CONSTRAINT `draft_sessions_draftSessionId_unique` UNIQUE (`draftSessionId`)
);

CREATE TABLE IF NOT EXISTS `save_idempotency` (
  `id` int AUTO_INCREMENT NOT NULL,
  `requestId` varchar(64) NOT NULL,
  `draftSessionId` varchar(64) NOT NULL,
  `leadId` int,
  `patientId` int,
  `payloadHash` varchar(64) NOT NULL,
  `status` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
  `resultIntakeId` int,
  `resultPromotedDocIds` json,
  `resultArchivedDocIds` json,
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `save_idempotency_pk` PRIMARY KEY (`id`),
  CONSTRAINT `save_idempotency_requestId_unique` UNIQUE (`requestId`)
);
