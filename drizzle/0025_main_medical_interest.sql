-- Migration 0025: Add mainMedicalInterest to patients and leads, add callback fields to leads

ALTER TABLE `patients`
  ADD COLUMN `mainMedicalInterest` ENUM('ivf_icsi','iui','egg_freezing','fertility_checkup_couple','fertility_checkup_female','fertility_checkup_male','other') DEFAULT NULL;

ALTER TABLE `leads`
  ADD COLUMN `mainMedicalInterest` ENUM('ivf_icsi','iui','egg_freezing','fertility_checkup_couple','fertility_checkup_female','fertility_checkup_male','other') DEFAULT NULL,
  ADD COLUMN `callbackRequestedAt` TIMESTAMP NULL DEFAULT NULL,
  ADD COLUMN `callbackPreferredDate` VARCHAR(32) DEFAULT NULL,
  ADD COLUMN `callbackPreferredTime` VARCHAR(32) DEFAULT NULL,
  ADD COLUMN `callbackMethod` ENUM('whatsapp','phone','video_call','email') DEFAULT NULL,
  ADD COLUMN `intakeToken` VARCHAR(64) DEFAULT NULL;
