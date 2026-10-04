-- Migration 0052: Phase 2 Lifecycle Columns for lead_documents
-- Adds nullable lifecycleStatus, sourceIntakeId, archivedAt, archiveReason, storageDeletePending
-- Existing rows are intentionally left with lifecycleStatus = NULL (unclassified/legacy)
-- New uploads must always receive an explicit lifecycleStatus value

ALTER TABLE `lead_documents`
  ADD COLUMN `lifecycleStatus` ENUM('active','historical','direct-upload') NULL DEFAULT NULL AFTER `ownerId`,
  ADD COLUMN `sourceIntakeId` INT NULL DEFAULT NULL AFTER `lifecycleStatus`,
  ADD COLUMN `archivedAt` TIMESTAMP NULL DEFAULT NULL AFTER `sourceIntakeId`,
  ADD COLUMN `archiveReason` VARCHAR(64) NULL DEFAULT NULL AFTER `archivedAt`,
  ADD COLUMN `storageDeletePending` TINYINT(1) NOT NULL DEFAULT 0 AFTER `archiveReason`;
