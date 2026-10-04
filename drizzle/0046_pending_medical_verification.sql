-- Add medical similarity verification columns to pending_lab_tests
ALTER TABLE `pending_lab_tests`
  ADD COLUMN `medicalVerdict` ENUM('same','different','related_separate','unclear') NULL,
  ADD COLUMN `confidenceScore` INT NULL,
  ADD COLUMN `medicalReason` TEXT NULL,
  ADD COLUMN `suggestedAction` VARCHAR(512) NULL;
