-- Migration: Cycle type multi-select + outcome new fields
-- 1. Change cycleType from enum to text (JSON array storage)
ALTER TABLE `treatment_cycles` MODIFY COLUMN `cycleType` TEXT NOT NULL;

-- 2. Drop procedureType enum column (merged into cycleType)
ALTER TABLE `treatment_cycles` DROP COLUMN `procedureType`;

-- 3. Add new outcome fields to cycle_outcomes
ALTER TABLE `cycle_outcomes`
  ADD COLUMN `blastocystCount` INT NULL,
  ADD COLUMN `triggerDate` TIMESTAMP NULL,
  ADD COLUMN `opuDate` TIMESTAMP NULL,
  ADD COLUMN `transferDate` TIMESTAMP NULL;
