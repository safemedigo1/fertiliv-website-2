-- Phase 2 Final Correction: Expand draft_sessions state machine + add extraction_attempts table

-- ── 1. Add terminal-state timestamp columns to draft_sessions ─────────────────
ALTER TABLE `draft_sessions`
  ADD COLUMN `pendingExpiresAt` timestamp NULL COMMENT 'when the session expires if inactive',
  ADD COLUMN `savedAt` timestamp NULL COMMENT 'set when status → saved',
  ADD COLUMN `canceledAt` timestamp NULL COMMENT 'set when status → cancelled',
  ADD COLUMN `canceledBy` int NULL COMMENT 'userId who cancelled',
  ADD COLUMN `expiredAt` timestamp NULL COMMENT 'set when status → expired';

-- ── 2. Create extraction_attempts table ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS `extraction_attempts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `attemptId` varchar(64) NOT NULL,
  `documentId` int NOT NULL,
  `draftSessionId` varchar(64),
  `generationId` int NOT NULL DEFAULT 1,
  `status` enum('pending','processing','completed','failed','canceled','superseded') NOT NULL DEFAULT 'pending',
  `translationId` int,
  `createdBy` int NOT NULL,
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  `canceledAt` timestamp NULL,
  `supersededBy` varchar(64),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `extraction_attempts_pk` PRIMARY KEY (`id`),
  CONSTRAINT `extraction_attempts_attemptId_unique` UNIQUE (`attemptId`),
  INDEX `extraction_attempts_documentId_idx` (`documentId`),
  INDEX `extraction_attempts_draftSessionId_idx` (`draftSessionId`)
);
