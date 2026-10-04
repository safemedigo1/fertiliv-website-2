ALTER TABLE `google_calendar_appointment_syncs` MODIFY COLUMN `googleEventId` varchar(1024) NULL;
UPDATE `google_calendar_appointment_syncs`
SET `googleEventId` = NULL
WHERE `syncStatus` != 'synced' AND `googleEventId` LIKE 'g2appt%';
