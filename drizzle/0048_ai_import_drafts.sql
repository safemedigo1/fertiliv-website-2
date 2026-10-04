CREATE TABLE `ai_import_drafts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `draftKey` varchar(256) NOT NULL,
  `userId` int NOT NULL,
  `step` enum('input','preview') NOT NULL DEFAULT 'input',
  `pasteText` text,
  `uploadedFiles` json,
  `rows` json,
  `selectedIds` json,
  `matchOverrides` json,
  `manualMatchAliasOptIn` json,
  `lastSavedAt` timestamp NOT NULL DEFAULT (now()),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ai_import_drafts_id` PRIMARY KEY(`id`)
);
CREATE INDEX `ai_import_drafts_draftKey_userId_idx` ON `ai_import_drafts` (`draftKey`, `userId`);
