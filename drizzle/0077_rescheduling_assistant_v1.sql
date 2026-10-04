CREATE TABLE `appointment_reschedule_events` (
  `id` int AUTO_INCREMENT NOT NULL,
  `appointmentId` int NOT NULL,
  `appointmentCode` varchar(32),
  `patientId` int,
  `leadId` int,
  `timeOffId` int,
  `oldStart` timestamp NOT NULL,
  `oldEnd` timestamp NOT NULL,
  `newStart` timestamp NOT NULL,
  `newEnd` timestamp NOT NULL,
  `actorId` int NOT NULL,
  `source` varchar(64) NOT NULL,
  `executedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `appointment_reschedule_events_id` PRIMARY KEY(`id`),
  INDEX `idx_appointment_reschedule_events_appointment` (`appointmentId`),
  INDEX `idx_appointment_reschedule_events_time_off` (`timeOffId`)
);
