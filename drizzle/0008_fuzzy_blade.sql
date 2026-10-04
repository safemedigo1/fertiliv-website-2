CREATE TABLE `staff_availability` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`title` varchar(256) NOT NULL,
	`startDate` timestamp NOT NULL,
	`endDate` timestamp NOT NULL,
	`reason` enum('vacation','sick_leave','training','personal','other') NOT NULL DEFAULT 'other',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `staff_availability_id` PRIMARY KEY(`id`)
);
