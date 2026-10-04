ALTER TABLE `appointments`
  ADD COLUMN `googleReminderMode` enum('calendar_default','custom') NOT NULL DEFAULT 'calendar_default';
