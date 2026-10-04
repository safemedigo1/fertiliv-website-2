-- Migration 0033: Add patientId to lead_documents, make leadId nullable
-- This allows documents to be re-linked to a patient after lead conversion

ALTER TABLE `lead_documents`
  MODIFY COLUMN `leadId` INT NULL,
  ADD COLUMN IF NOT EXISTS `patientId` INT NULL;
