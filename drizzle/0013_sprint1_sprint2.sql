-- Sprint 1: Expand patients table with CRM/lead fields + new status enum
-- Sprint 2: Add treatment cycle tables

-- ─── 1. Modify patients.status enum ─────────────────────────────────────────
ALTER TABLE `patients` MODIFY COLUMN `status` ENUM('inquiry','lead','qualified','proposal_sent','active_patient','inactive','archived') NOT NULL DEFAULT 'active_patient';

-- ─── 2. Add CRM fields to patients table ────────────────────────────────────
ALTER TABLE `patients`
  ADD COLUMN `source` ENUM('organic','social-media-ads','google-ads','reference','safemedigo-platform','dr-nilay-patient','website') NULL,
  ADD COLUMN `socialLeadId` VARCHAR(128) NULL,
  ADD COLUMN `campaignName` VARCHAR(256) NULL,
  ADD COLUMN `budgetRange` VARCHAR(64) NULL,
  ADD COLUMN `rating` VARCHAR(64) NULL,
  ADD COLUMN `travelReadiness` ENUM('ready','planning','considering','not-ready','local-patient') NULL,
  ADD COLUMN `fertilityDiagnosis` JSON NULL,
  ADD COLUMN `ivfExperience` ENUM('none','1-2','3-5','more-than-5') NULL DEFAULT 'none',
  ADD COLUMN `decisionTimeline` ENUM('immediate','1-3-months','3-6-months','6-12-months','not-sure') NULL,
  ADD COLUMN `preferredContactMethod` ENUM('whatsapp','email','phone','telegram') NULL DEFAULT 'whatsapp',
  ADD COLUMN `assignedStaffId` INT NULL,
  ADD COLUMN `lastContactDate` TIMESTAMP NULL,
  ADD COLUMN `nextFollowUpDate` TIMESTAMP NULL,
  ADD COLUMN `city` VARCHAR(128) NULL,
  ADD COLUMN `country` VARCHAR(64) NULL,
  ADD COLUMN `accommodationHotel` VARCHAR(256) NULL,
  ADD COLUMN `accommodationLocation` VARCHAR(256) NULL,
  ADD COLUMN `transportationAirportPickup` BOOLEAN NULL DEFAULT false,
  ADD COLUMN `transportationLocalTransfer` BOOLEAN NULL DEFAULT false,
  ADD COLUMN `caseSummary` TEXT NULL,
  ADD COLUMN `salesNote` TEXT NULL;

-- ─── 3. Patient Communications table ────────────────────────────────────────
CREATE TABLE `patient_communications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `patientId` INT NOT NULL,
  `note` TEXT NOT NULL,
  `createdBy` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── 4. Treatment Cycles table ───────────────────────────────────────────────
CREATE TABLE `treatment_cycles` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `patientId` INT NOT NULL,
  `ivfNo` VARCHAR(32) NULL,
  `cycleType` ENUM('IVF','ICSI','IUI','OI','FET','Egg_Freezing','Donor_Egg','Other') NOT NULL,
  `protocol` ENUM('antagonist','long','oks_long','patch_ant','mikrodoz','other') NULL,
  `status` ENUM('planned','stimulation','retrieval','transfer','completed','cancelled') NOT NULL DEFAULT 'planned',
  `doctorId` INT NULL,
  `startDate` TIMESTAMP NULL,
  `endDate` TIMESTAMP NULL,
  `d3Tsh` VARCHAR(32) NULL,
  `d3Fsh` VARCHAR(32) NULL,
  `d3Lh` VARCHAR(32) NULL,
  `d3E2` VARCHAR(32) NULL,
  `d3Amh` VARCHAR(32) NULL,
  `d3Prl` VARCHAR(32) NULL,
  `d3Bmi` VARCHAR(16) NULL,
  `infertilityDuration` VARCHAR(64) NULL,
  `infertilityReasonFemale` TEXT NULL,
  `infertilityReasonMale` TEXT NULL,
  `procedureType` ENUM('IVF','ICSI','IUI','OI','TESE','TFSA','CF_Mut','Other') NULL,
  `frozenTissue` BOOLEAN NULL DEFAULT false,
  `spermCount` VARCHAR(64) NULL,
  `spermMotility` VARCHAR(64) NULL,
  `spermMorphology` VARCHAR(64) NULL,
  `spermTmss` VARCHAR(32) NULL,
  `karyotype` VARCHAR(128) NULL,
  `serology` TEXT NULL,
  `previousTreatment` TEXT NULL,
  `surgery` TEXT NULL,
  `adjuvantMedications` TEXT NULL,
  `notes` TEXT NULL,
  `createdBy` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── 5. Cycle Monitoring Visits table ───────────────────────────────────────
CREATE TABLE `cycle_monitoring_visits` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cycleId` INT NOT NULL,
  `visitDate` TIMESTAMP NOT NULL,
  `cycleDay` INT NULL,
  `doctorId` INT NULL,
  `e2` VARCHAR(32) NULL,
  `lh` VARCHAR(32) NULL,
  `p4` VARCHAR(32) NULL,
  `endometriumMm` VARCHAR(16) NULL,
  `folliclesRight` JSON NULL,
  `folliclesLeft` JSON NULL,
  `fshDose` VARCHAR(64) NULL,
  `hmgDose` VARCHAR(64) NULL,
  `gnrhaDose` VARCHAR(64) NULL,
  `antagonistDose` VARCHAR(64) NULL,
  `ccLetrDose` VARCHAR(64) NULL,
  `hcgDose` VARCHAR(64) NULL,
  `sexualAbstinence` VARCHAR(64) NULL,
  `notes` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ─── 6. Cycle Medications table ─────────────────────────────────────────────
CREATE TABLE `cycle_medications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cycleId` INT NOT NULL,
  `medicationName` VARCHAR(256) NOT NULL,
  `dose` VARCHAR(64) NULL,
  `frequency` VARCHAR(128) NULL,
  `route` VARCHAR(64) NULL,
  `startDate` TIMESTAMP NULL,
  `endDate` TIMESTAMP NULL,
  `instructions` TEXT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ─── 7. Medication Adherence Log table ──────────────────────────────────────
CREATE TABLE `medication_adherence_log` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cycleId` INT NOT NULL,
  `medicationId` INT NOT NULL,
  `patientId` INT NOT NULL,
  `scheduledDate` TIMESTAMP NOT NULL,
  `confirmedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confirmedByPatient` BOOLEAN NOT NULL DEFAULT true,
  `notes` TEXT NULL
);

-- ─── 8. Cycle Outcomes table ─────────────────────────────────────────────────
CREATE TABLE `cycle_outcomes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `cycleId` INT NOT NULL UNIQUE,
  `totalOocytes` INT NULL,
  `matureOocytes` INT NULL,
  `fertilized` INT NULL,
  `transferred` INT NULL,
  `cryopreserved` INT NULL,
  `embryoQuality` TEXT NULL,
  `hcgLevel` VARCHAR(32) NULL,
  `pregnancyTestDate` TIMESTAMP NULL,
  `result` ENUM('positive','negative','biochemical','clinical','ongoing','delivered','miscarriage','pending') NULL,
  `notes` TEXT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
