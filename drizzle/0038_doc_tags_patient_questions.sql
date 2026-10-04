-- Migration 0038: Document tagging + patient questions in medical intake
-- Add tag and intakeSection columns to lead_documents
ALTER TABLE `lead_documents`
  ADD COLUMN `tag` varchar(128) NULL,
  ADD COLUMN `intakeSection` varchar(128) NULL;

-- Add patientQuestions JSON column to medical_intake
ALTER TABLE `medical_intake`
  ADD COLUMN `patientQuestions` json NULL;
