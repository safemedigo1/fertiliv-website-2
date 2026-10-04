CREATE TABLE IF NOT EXISTS `google_calendar_appointment_syncs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `appointmentId` int NOT NULL,
  `provider` varchar(32) NOT NULL DEFAULT 'google',
  `googleCalendarId` varchar(512),
  `googleEventId` varchar(1024) NOT NULL,
  `operation` enum('upsert','delete') NOT NULL DEFAULT 'upsert',
  `syncStatus` enum('pending','synced','failed','deletion_pending','deleted') NOT NULL DEFAULT 'pending',
  `payloadHash` varchar(64),
  `lastSyncedAt` timestamp NULL,
  `lastSyncError` varchar(512),
  `retryCount` int NOT NULL DEFAULT 0,
  `nextRetryAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `google_calendar_appointment_syncs_id` PRIMARY KEY(`id`),
  CONSTRAINT `google_calendar_appointment_syncs_appointmentId_unique` UNIQUE(`appointmentId`),
  KEY `google_calendar_appointment_syncs_retry_idx` (`syncStatus`,`nextRetryAt`)
);
