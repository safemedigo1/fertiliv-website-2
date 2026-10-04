-- ============================================================
-- Phase 1 Foundation — ROLLBACK SCRIPT
-- Run this to completely undo all Phase 1 schema changes.
-- Safe to run: all new columns are nullable, all new tables are empty.
-- ============================================================

-- 1. Drop the 3 new empty tables (order matters: case_participants references treatment_cases)
DROP TABLE IF EXISTS `case_participants`;
DROP TABLE IF EXISTS `migration_conflict_log`;
DROP TABLE IF EXISTS `treatment_cases`;

-- 2. Remove new columns from `leads`
ALTER TABLE `leads` DROP COLUMN IF EXISTS `contact_role`;
ALTER TABLE `leads` DROP COLUMN IF EXISTS `service_for`;
ALTER TABLE `leads` DROP COLUMN IF EXISTS `profile_completeness`;

-- 3. Remove new columns from `medical_intake`
ALTER TABLE `medical_intake` DROP COLUMN IF EXISTS `person_gender`;
ALTER TABLE `medical_intake` DROP COLUMN IF EXISTS `male_intake_migrated`;
ALTER TABLE `medical_intake` DROP COLUMN IF EXISTS `male_intake_migrated_at`;
ALTER TABLE `medical_intake` DROP COLUMN IF EXISTS `male_intake_migrated_by`;

-- 4. Remove new columns from `lead_documents`
ALTER TABLE `lead_documents` DROP COLUMN IF EXISTS `owner_type`;
ALTER TABLE `lead_documents` DROP COLUMN IF EXISTS `owner_id`;

-- ============================================================
-- Verification query (run after rollback to confirm):
-- SHOW COLUMNS FROM leads LIKE 'contact_role';        -- should return 0 rows
-- SHOW COLUMNS FROM medical_intake LIKE 'person_gender'; -- should return 0 rows
-- SHOW TABLES LIKE 'treatment_cases';                 -- should return 0 rows
-- ============================================================
