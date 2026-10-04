-- Phase 40: Medical Intake Redesign
-- Drop old columns, add new comprehensive columns to medical_intake table

ALTER TABLE `medical_intake`
  -- Drop old husband/wife columns
  DROP COLUMN `husbandName`,
  DROP COLUMN `husbandAge`,
  DROP COLUMN `husbandProfession`,
  DROP COLUMN `husbandHeight`,
  DROP COLUMN `husbandWeight`,
  DROP COLUMN `husbandFertilityIssues`,
  DROP COLUMN `husbandMedications`,
  DROP COLUMN `husbandPreviousTests`,
  DROP COLUMN `husbandPreviousSurgeries`,
  DROP COLUMN `wifeName`,
  DROP COLUMN `wifeAge`,
  DROP COLUMN `wifeProfession`,
  DROP COLUMN `wifeHeight`,
  DROP COLUMN `wifeWeight`,
  DROP COLUMN `tryingDuration`,
  DROP COLUMN `previousPregnancies`,
  DROP COLUMN `miscarriages`,
  DROP COLUMN `surgeries`,
  DROP COLUMN `previousFertilityTreatments`,
  DROP COLUMN `knownDiseases`,
  DROP COLUMN `menstrualCycle`,
  DROP COLUMN `labResults`,

  -- Add new columns: Basic Info
  ADD COLUMN `infertilityType` ENUM('primary','secondary'),
  ADD COLUMN `infertilityDuration` VARCHAR(64),
  ADD COLUMN `referralSource` VARCHAR(256),
  ADD COLUMN `profession` VARCHAR(128),
  ADD COLUMN `isFirstMarriage` BOOLEAN,
  ADD COLUMN `partnerIsFirstMarriage` BOOLEAN,

  -- Physical Measurements
  ADD COLUMN `heightCm` DECIMAL(5,1),
  ADD COLUMN `weightKg` DECIMAL(5,1),
  ADD COLUMN `bmi` DECIMAL(4,1),
  ADD COLUMN `bmiManual` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `waistCm` DECIMAL(5,1),
  ADD COLUMN `hipCm` DECIMAL(5,1),

  -- Obstetric History
  ADD COLUMN `gravida` INT NOT NULL DEFAULT 0,
  ADD COLUMN `para` INT NOT NULL DEFAULT 0,
  ADD COLUMN `abortus` INT NOT NULL DEFAULT 0,
  ADD COLUMN `livingChildren` INT NOT NULL DEFAULT 0,
  ADD COLUMN `childrenFromPreviousMarriage` INT NOT NULL DEFAULT 0,

  -- Menstrual History
  ADD COLUMN `lastMenstrualPeriod` TIMESTAMP NULL,
  ADD COLUMN `cycleRegularity` ENUM('regular','irregular','absent'),
  ADD COLUMN `cycleLengthDays` INT,
  ADD COLUMN `menstrualFlowDays` INT,
  ADD COLUMN `dysmenorrhea` BOOLEAN NOT NULL DEFAULT false,

  -- JSON arrays
  ADD COLUMN `miscarriageHistory` JSON,
  ADD COLUMN `artHistory` JSON,
  ADD COLUMN `surgicalHistory` JSON,
  ADD COLUMN `previousTests` JSON,
  ADD COLUMN `previousProcedures` JSON,
  ADD COLUMN `systemicDiseases` JSON,

  -- Lifestyle
  ADD COLUMN `smoking` ENUM('never','former','current'),
  ADD COLUMN `smokingPacksPerDay` DECIMAL(3,1),
  ADD COLUMN `alcohol` ENUM('never','occasional','regular'),
  ADD COLUMN `allergies` TEXT,
  ADD COLUMN `hirsutism` BOOLEAN NOT NULL DEFAULT false,

  -- Family History
  ADD COLUMN `consanguinity` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `hereditaryDiseases` TEXT,
  ADD COLUMN `familyBreastCancer` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `familyEarlyMenopause` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `familyInfertility` BOOLEAN NOT NULL DEFAULT false,

  -- Male Intake
  ADD COLUMN `maleIntake` JSON;
