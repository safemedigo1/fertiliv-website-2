ALTER TABLE `google_calendar_appointment_syncs`
  ADD COLUMN `googleEventHtmlLink` varchar(2048) NULL,
  ADD COLUMN `lastVerifiedEventAt` timestamp NULL;
