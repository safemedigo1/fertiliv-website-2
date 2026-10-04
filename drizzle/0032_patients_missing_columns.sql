-- Migration 0032: Add all missing columns to patients table
-- These columns exist in schema.ts but were never added via ALTER TABLE

-- 1. middleName (never added)
ALTER TABLE `patients` ADD COLUMN IF NOT EXISTS `middleName` VARCHAR(128) NULL;

-- 2. secondaryPhone (never added)
ALTER TABLE `patients` ADD COLUMN IF NOT EXISTS `secondaryPhone` VARCHAR(32) NULL;

-- 3. preferredLanguages as JSON (0010 added preferredLanguage singular as ENUM — different column)
ALTER TABLE `patients` ADD COLUMN IF NOT EXISTS `preferredLanguages` JSON NULL;

-- 4. preferredContactMethods as JSON (0013 added preferredContactMethod singular as ENUM — different column)
ALTER TABLE `patients` ADD COLUMN IF NOT EXISTS `preferredContactMethods` JSON NULL;

-- 5. patientType (never added to patients, only leads had it)
ALTER TABLE `patients` ADD COLUMN IF NOT EXISTS `patientType` ENUM('local','international') NOT NULL DEFAULT 'international';

-- 6. creditBalance (never added)
ALTER TABLE `patients` ADD COLUMN IF NOT EXISTS `creditBalance` DECIMAL(10,2) NOT NULL DEFAULT 0;

-- 7. mainMedicalInterest: was added as ENUM in 0025, needs to be JSON for multi-select
--    Use MODIFY to change from ENUM to JSON (safe — existing single values become JSON strings)
ALTER TABLE `patients` MODIFY COLUMN `mainMedicalInterest` JSON NULL;
