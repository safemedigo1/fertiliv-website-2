-- Migration 0024: Sequential non-reusable codes for all major entities
-- Creates a code_sequences table to track the last issued number per entity type
-- Adds code columns to entities that don't have them yet

-- 1. Create code_sequences table
CREATE TABLE IF NOT EXISTS `code_sequences` (
  `entity_type` varchar(64) NOT NULL,
  `last_number` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`entity_type`)
);

-- 2. Seed initial rows for all entity types (counter starts at 0)
INSERT IGNORE INTO `code_sequences` (`entity_type`, `last_number`) VALUES
  ('patient', 0),
  ('lead', 0),
  ('service', 0),
  ('package', 0),
  ('invoice', 0),
  ('lab_order', 0),
  ('treatment_cycle', 0),
  ('appointment', 0),
  ('proposal', 0),
  ('partner_clinic', 0),
  ('doctor', 0);

-- 3. Add code column to doctors table (unique, nullable for existing rows)
ALTER TABLE `doctors`
  ADD COLUMN IF NOT EXISTS `code` varchar(32) UNIQUE;

-- 4. Add code column to partner_clinics table
ALTER TABLE `partner_clinics`
  ADD COLUMN IF NOT EXISTS `code` varchar(32) UNIQUE;

-- 5. Add code column to leads table
ALTER TABLE `leads`
  ADD COLUMN IF NOT EXISTS `code` varchar(32) UNIQUE;

-- 6. Add code column to appointments table
ALTER TABLE `appointments`
  ADD COLUMN IF NOT EXISTS `code` varchar(32) UNIQUE;

-- 7. Add code column to lab_orders table
ALTER TABLE `lab_orders`
  ADD COLUMN IF NOT EXISTS `code` varchar(32) UNIQUE;

-- 8. Add code column to treatment_cycles table (ivfNo already exists, add separate code)
ALTER TABLE `treatment_cycles`
  ADD COLUMN IF NOT EXISTS `code` varchar(32) UNIQUE;

-- 9. Add code column to treatment_proposals table
ALTER TABLE `treatment_proposals`
  ADD COLUMN IF NOT EXISTS `code` varchar(32) UNIQUE;

-- 10. Add code column to treatment_packages table
ALTER TABLE `treatment_packages`
  ADD COLUMN IF NOT EXISTS `code` varchar(32) UNIQUE;

-- services already has code column (nullable, no unique constraint yet)
-- invoices already has invoiceNumber (unique) — will use that as the code
-- patients already has mrn (unique) — will use that as the code
