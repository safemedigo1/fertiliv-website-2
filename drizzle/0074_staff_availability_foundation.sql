-- Staff Availability / Rescheduling Foundation
-- Appointment-level Admin availability exceptions; clinic-wide default weekly working-hours fallback.
ALTER TABLE `appointments`
  ADD COLUMN `availabilityOverrideReason` text NULL,
  ADD COLUMN `availabilityOverrideById` int NULL,
  ADD COLUMN `availabilityOverrideAt` timestamp NULL;

ALTER TABLE `clinic_info`
  ADD COLUMN `defaultWeeklySchedule` json NULL;
