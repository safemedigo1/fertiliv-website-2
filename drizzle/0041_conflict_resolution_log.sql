CREATE TABLE `conflict_resolution_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` varchar(128) NOT NULL,
	`leadId` int NOT NULL,
	`patientId` int NOT NULL,
	`resolvedBy` int NOT NULL,
	`newIntakeId` int,
	`docHandling` varchar(32) NOT NULL,
	`newIntakeMode` varchar(32) NOT NULL,
	`archivedDocs` json,
	`deletedDocs` json,
	`storagePendingDocs` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `conflict_resolution_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `conflict_resolution_log_requestId_unique` UNIQUE(`requestId`)
);
