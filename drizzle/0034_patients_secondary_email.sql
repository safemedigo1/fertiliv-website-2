-- Add secondaryEmail column to patients table (REQ-3: match lead contact fields)
ALTER TABLE `patients` ADD COLUMN `secondaryEmail` varchar(320);
