-- Migration 0018: Add consultation to services category enum
ALTER TABLE `services` MODIFY COLUMN `category` ENUM('lab_test','radiology_test','pathology_test','other_test','procedure','consultation') NOT NULL;
