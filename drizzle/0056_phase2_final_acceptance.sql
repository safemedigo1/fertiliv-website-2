-- Phase 2 Final Acceptance Corrections Migration
-- Adds storage cleanup retry tracking columns to lead_documents

ALTER TABLE `lead_documents`
  ADD COLUMN `storageDeleteAttempts` int NOT NULL DEFAULT 0,
  ADD COLUMN `lastStorageDeleteAttemptAt` timestamp NULL,
  ADD COLUMN `lastStorageDeleteError` varchar(512) NULL,
  ADD COLUMN `cleanupAlertedAt` timestamp NULL;
