ALTER TABLE `appointments`
  ADD COLUMN `availabilityOverrideTimeOffId` int NULL;

CREATE INDEX `idx_appointments_availabilityOverrideTimeOffId`
  ON `appointments` (`availabilityOverrideTimeOffId`);
