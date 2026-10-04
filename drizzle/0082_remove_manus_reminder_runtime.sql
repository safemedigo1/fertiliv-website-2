-- Reminder worker migration: the runtime clock is now a portable Fertiliv
-- process. The former task UID singleton was only a Manus callback gate.
DROP TABLE IF EXISTS `appointment_reminder_runtime`;
