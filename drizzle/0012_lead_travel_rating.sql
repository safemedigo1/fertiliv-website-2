-- Migration: Add 'local-patient' to travelReadiness enum, change rating to varchar
-- Add 'local-patient' to travelReadiness enum
ALTER TABLE `leads` MODIFY COLUMN `travelReadiness` ENUM('ready','planning','considering','not-ready','local-patient');

-- Change rating from int to varchar(64) to support descriptive labels
ALTER TABLE `leads` MODIFY COLUMN `rating` VARCHAR(64);
