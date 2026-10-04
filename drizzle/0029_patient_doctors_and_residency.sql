-- Migration 0029: Add countryOfResidency to patients and create patient_doctors join table

-- Add countryOfResidency column to patients
ALTER TABLE `patients` ADD COLUMN `countryOfResidency` varchar(64);

-- Create patient_doctors many-to-many join table
CREATE TABLE IF NOT EXISTS `patient_doctors` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `patientId` int NOT NULL,
  `doctorId` int NOT NULL,
  `isPrimary` boolean NOT NULL DEFAULT false,
  `assignedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `assignedBy` int
);

-- Seed patient_doctors from existing assignedDoctorId (migrate existing data)
INSERT INTO `patient_doctors` (`patientId`, `doctorId`, `isPrimary`)
SELECT `id`, `assignedDoctorId`, true
FROM `patients`
WHERE `assignedDoctorId` IS NOT NULL;
