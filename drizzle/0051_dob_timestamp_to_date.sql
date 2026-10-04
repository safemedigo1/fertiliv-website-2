-- Migration: 0051_dob_timestamp_to_date
-- Change dateOfBirth columns from TIMESTAMP to DATE in patients and leads tables.
-- DOB is a calendar date (no time component), not a moment in time.
-- Migration executed with explicit UTC session timezone to ensure no day shift.
-- Pre-migration audit confirmed: all 35 non-null DOB values had time_part = 00:00:00.
-- No data loss. Rollback: MODIFY COLUMN dateOfBirth TIMESTAMP NULL (restores as midnight UTC).

SET time_zone = '+00:00';

ALTER TABLE `patients` MODIFY COLUMN `dateOfBirth` DATE NULL;
ALTER TABLE `leads` MODIFY COLUMN `dateOfBirth` DATE NULL;
