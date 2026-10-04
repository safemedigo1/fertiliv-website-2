-- Add enteredById column to medical_notes table
ALTER TABLE `medical_notes` ADD COLUMN `enteredById` int DEFAULT NULL;
