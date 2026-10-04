CREATE TABLE `intake_forms` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(256) NOT NULL,
  `slug` varchar(128) NOT NULL,
  `brand` enum('fertiliv','safemedigo','dr-nilay-karaca') NOT NULL DEFAULT 'fertiliv',
  `isDefault` boolean NOT NULL DEFAULT false,
  `fields` json NOT NULL,
  `translations` json NOT NULL,
  `titleTranslations` json,
  `subtitleTranslations` json,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `intake_forms_id` PRIMARY KEY(`id`),
  CONSTRAINT `intake_forms_slug_unique` UNIQUE(`slug`)
);
