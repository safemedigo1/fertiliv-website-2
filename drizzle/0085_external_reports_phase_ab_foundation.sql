ALTER TABLE `external_reports`
  ADD COLUMN `processingGoal` varchar(32),
  ADD COLUMN `requestedTargetLanguage` varchar(16),
  ADD COLUMN `resolvedOutputLanguage` varchar(16),
  ADD COLUMN `processedDocumentJson` json,
  ADD COLUMN `processedDocumentVersion` int,
  ADD COLUMN `activeSourceRevisionId` int;

CREATE TABLE `external_report_source_revisions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `reportId` int NOT NULL,
  `revisionNumber` int NOT NULL,
  `sourceText` text,
  `inputMethod` varchar(16) NOT NULL,
  `sourceLanguage` varchar(16),
  `sourceAssetRefs` json,
  `sourceHash` varchar(64) NOT NULL,
  `correctionReason` text,
  `capturedById` int,
  `capturedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `external_report_source_revisions_id` PRIMARY KEY (`id`),
  CONSTRAINT `external_report_source_revision_unique` UNIQUE(`reportId`,`revisionNumber`),
  KEY `external_report_source_revision_report_idx` (`reportId`)
);

CREATE TABLE `external_report_processing_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `reportId` int NOT NULL,
  `sourceRevisionId` int,
  `processingGoal` varchar(32) NOT NULL,
  `requestedTargetLanguage` varchar(16),
  `resolvedOutputLanguage` varchar(16) NOT NULL,
  `processedDocumentVersion` int,
  `processingStatus` enum('processed','reviewed','finalized') NOT NULL DEFAULT 'processed',
  `processedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reviewedAt` timestamp,
  `reviewedById` int,
  `finalizedAt` timestamp,
  `finalizedById` int,
  `createdById` int,
  CONSTRAINT `external_report_processing_runs_id` PRIMARY KEY (`id`),
  KEY `external_report_processing_run_report_idx` (`reportId`),
  KEY `external_report_processing_run_source_idx` (`sourceRevisionId`)
);
