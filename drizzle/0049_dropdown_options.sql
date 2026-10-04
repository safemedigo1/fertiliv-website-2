CREATE TABLE `dropdown_options` (
  `id` int AUTO_INCREMENT NOT NULL,
  `fieldKey` varchar(64) NOT NULL,
  `label` varchar(256) NOT NULL,
  `value` varchar(256) NOT NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `dropdown_options_id` PRIMARY KEY(`id`)
);
