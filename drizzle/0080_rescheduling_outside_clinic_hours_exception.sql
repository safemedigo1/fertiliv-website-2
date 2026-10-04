-- Nullable by design: normal historical and future reschedules carry no exception reason.
ALTER TABLE `appointment_reschedule_events`
  ADD COLUMN `exceptionReason` text NULL;
