-- Migration 0030: Zoho CRM field mapping update
-- Updates enum values for ivfExperience, leadSource, decisionTimeline, travelReadiness
-- Changes mainMedicalInterest from enum to json (multi-select) in leads table
-- Adds noteCreatedAt column to lead_communications for preserving Zoho note dates

-- 1. ivfExperience: replace old enum values with Zoho-aligned values
ALTER TABLE `leads`
  MODIFY COLUMN `ivfExperience` ENUM('never-tried','tried-unsuccessful','tried-again','tried-multiple') DEFAULT 'never-tried';

-- 2. leadSource: expand to full Zoho source list
ALTER TABLE `leads`
  MODIFY COLUMN `leadSource` ENUM('paid','employee-referral','external-referral','website','maps','partner','public-relations','instagram','tiktok','doctor-referral','youtube','facebook','awatef-guide','salim-guide','organic');

-- 3. decisionTimeline: replace with Zoho-aligned values
ALTER TABLE `leads`
  MODIFY COLUMN `decisionTimeline` ENUM('immediately','1-2-weeks','1-month','2-months','3-months','1-3-months','6-months','exploring');

-- 4. travelReadiness: replace with Zoho-aligned values
ALTER TABLE `leads`
  MODIFY COLUMN `travelReadiness` ENUM('ready','considering','prefers-home','local-patient');

-- 5. mainMedicalInterest: change from enum to json (multi-select support)
ALTER TABLE `leads`
  MODIFY COLUMN `mainMedicalInterest` JSON;

-- 6. Add noteCreatedAt to lead_communications for preserving original Zoho note dates
ALTER TABLE `lead_communications`
  ADD COLUMN `noteCreatedAt` TIMESTAMP NULL DEFAULT NULL;

-- 7. Update patients table enums to match new values
ALTER TABLE `patients`
  MODIFY COLUMN `source` ENUM('paid','employee-referral','external-referral','website','maps','partner','public-relations','instagram','tiktok','doctor-referral','youtube','facebook','awatef-guide','salim-guide','organic');

ALTER TABLE `patients`
  MODIFY COLUMN `travelReadiness` ENUM('ready','considering','prefers-home','local-patient');

ALTER TABLE `patients`
  MODIFY COLUMN `ivfExperience` ENUM('never-tried','tried-unsuccessful','tried-again','tried-multiple') DEFAULT 'never-tried';

ALTER TABLE `patients`
  MODIFY COLUMN `decisionTimeline` ENUM('immediately','1-2-weeks','1-month','2-months','3-months','1-3-months','6-months','exploring');
