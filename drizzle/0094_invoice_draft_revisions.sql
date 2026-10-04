CREATE TABLE `invoice_revisions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `invoiceId` int NOT NULL,
  `revisionNumber` int NOT NULL,
  `status` enum('draft','published','discarded') NOT NULL,
  `parentPublishedRevisionId` int,
  `snapshot` json NOT NULL,
  `changeSummary` json,
  `previousTotals` json,
  `publishedTotals` json,
  `createdById` int,
  `publishedById` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `publishedAt` timestamp,
  CONSTRAINT `invoice_revisions_id` PRIMARY KEY(`id`),
  CONSTRAINT `invoice_revisions_invoice_revision_unique` UNIQUE(`invoiceId`,`revisionNumber`)
);
--> statement-breakpoint
CREATE INDEX `invoice_revisions_invoice_status_idx` ON `invoice_revisions` (`invoiceId`,`status`);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `currentRevisionNumber` int NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `invoices` ADD `currentPublishedRevisionId` int;
--> statement-breakpoint
ALTER TABLE `invoices` ADD `activeDraftRevisionId` int;
