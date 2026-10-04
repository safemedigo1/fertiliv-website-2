-- Phase 1 Foundation Migration
-- Adds nullable columns to existing tables and creates 3 empty foundation tables.
-- All changes are backward-compatible: no existing data is modified.
-- A rollback script is provided at the end of this file as comments.

-- ─── 1. Add Phase 1 columns to medical_intake ────────────────────────────────
ALTER TABLE `medical_intake`
  ADD COLUMN `personGender` ENUM('female','male') DEFAULT NULL,
  ADD COLUMN `maleIntakeMigrated` BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN `maleIntakeMigratedAt` TIMESTAMP DEFAULT NULL,
  ADD COLUMN `maleIntakeMigratedBy` INT DEFAULT NULL;

-- ─── 2. Add Phase 1 columns to leads ─────────────────────────────────────────
ALTER TABLE `leads`
  ADD COLUMN `contactRole` ENUM('wife','husband','relative','representative','unknown') DEFAULT NULL,
  ADD COLUMN `serviceFor` ENUM('self','partner','couple','unknown') DEFAULT NULL,
  ADD COLUMN `profileCompleteness` ENUM('complete','incomplete','unknown') NOT NULL DEFAULT 'unknown';

-- ─── 3. Add Phase 1 columns to lead_documents ────────────────────────────────
ALTER TABLE `lead_documents`
  ADD COLUMN `ownerType` VARCHAR(64) DEFAULT NULL,
  ADD COLUMN `ownerId` INT DEFAULT NULL;

-- ─── 4. Create treatment_cases (empty foundation table) ──────────────────────
CREATE TABLE IF NOT EXISTS `treatment_cases` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `caseType` ENUM('ivf','icsi','iui','egg_freezing','sperm_freezing','micro_tese','other') DEFAULT NULL,
  `primaryLeadId` INT DEFAULT NULL,
  `primaryPatientId` INT DEFAULT NULL,
  `partnerLeadId` INT DEFAULT NULL,
  `partnerPatientId` INT DEFAULT NULL,
  `status` ENUM('active','completed','cancelled','on_hold') NOT NULL DEFAULT 'active',
  `notes` TEXT DEFAULT NULL,
  `createdBy` INT DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── 5. Create case_participants (empty foundation table) ─────────────────────
CREATE TABLE IF NOT EXISTS `case_participants` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `caseId` INT NOT NULL,
  `leadId` INT DEFAULT NULL,
  `patientId` INT DEFAULT NULL,
  `role` ENUM('primary_female','primary_male','donor','surrogate','other') DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── 6. Create migration_conflict_log (empty foundation table) ────────────────
CREATE TABLE IF NOT EXISTS `migration_conflict_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `conflictType` VARCHAR(64) DEFAULT NULL,
  `sourceRecordType` VARCHAR(64) DEFAULT NULL,
  `sourceRecordId` INT DEFAULT NULL,
  `targetRecordType` VARCHAR(64) DEFAULT NULL,
  `targetRecordId` INT DEFAULT NULL,
  `fieldName` VARCHAR(128) DEFAULT NULL,
  `sourceValue` TEXT DEFAULT NULL,
  `targetValue` TEXT DEFAULT NULL,
  `suggestedAction` VARCHAR(64) DEFAULT NULL,
  `status` ENUM('pending','ready_for_admin_review','resolved','dismissed') NOT NULL DEFAULT 'pending',
  `flaggedBy` INT DEFAULT NULL,
  `flaggedAt` TIMESTAMP DEFAULT NULL,
  `resolvedBy` INT DEFAULT NULL,
  `resolvedAt` TIMESTAMP DEFAULT NULL,
  `resolutionDecision` VARCHAR(64) DEFAULT NULL,
  `adminNotes` TEXT DEFAULT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── ROLLBACK SCRIPT (run to undo all Phase 1 changes) ───────────────────────
-- DROP TABLE IF EXISTS `migration_conflict_log`;
-- DROP TABLE IF EXISTS `case_participants`;
-- DROP TABLE IF EXISTS `treatment_cases`;
-- ALTER TABLE `lead_documents` DROP COLUMN `ownerId`, DROP COLUMN `ownerType`;
-- ALTER TABLE `leads` DROP COLUMN `profileCompleteness`, DROP COLUMN `serviceFor`, DROP COLUMN `contactRole`;
-- ALTER TABLE `medical_intake` DROP COLUMN `maleIntakeMigratedBy`, DROP COLUMN `maleIntakeMigratedAt`, DROP COLUMN `maleIntakeMigrated`, DROP COLUMN `personGender`;
