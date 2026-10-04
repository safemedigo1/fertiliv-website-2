-- Migration 0017: Add sub_specializations and doctor_sub_specializations tables
-- Also add consultationServiceId to doctors for bidirectional fee sync

CREATE TABLE IF NOT EXISTS `sub_specializations` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `name` varchar(128) NOT NULL,
  `specializationId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS `doctor_sub_specializations` (
  `id` int AUTO_INCREMENT NOT NULL PRIMARY KEY,
  `doctorId` int NOT NULL,
  `subSpecializationId` int NOT NULL
);

-- Add consultationServiceId to doctors (links to the auto-created service entry)
ALTER TABLE `doctors` ADD COLUMN IF NOT EXISTS `consultationServiceId` int;
