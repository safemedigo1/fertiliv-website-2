ALTER TABLE `external_reports`
  ADD COLUMN `v2SubmissionKey` varchar(64) NULL,
  ADD COLUMN `v2Metadata` json NULL;

ALTER TABLE `external_reports`
  ADD UNIQUE INDEX `external_reports_v2_submission_key_unique` (`v2SubmissionKey`);
