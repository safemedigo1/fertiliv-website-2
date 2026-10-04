CREATE TABLE `lab_dictionary` (
  `id` int AUTO_INCREMENT NOT NULL,
  `canonicalName` varchar(256) NOT NULL,
  `displayName` varchar(512) NOT NULL,
  `abbreviation` varchar(64),
  `resultType` enum('Quantitative','Qualitative','Molecular/PCR','Genetic','Microbiology Culture','Microscopy/Parasitology','Panel/Profile','Pathology/Biopsy','Semen Analysis','Semen DNA','Therapeutic Drug Monitoring','Descriptive/Report') NOT NULL DEFAULT 'Quantitative',
  `category` varchar(128),
  `specimen` varchar(128),
  `commonUnits` varchar(256),
  `suggestedModule` enum('general_lab','semen_analysis','semen_dna','genetic','radiology','pathology') DEFAULT 'general_lab',
  `notes` text,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdById` int,
  `updatedById` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `lab_dictionary_id` PRIMARY KEY(`id`)
);

CREATE TABLE `lab_dictionary_aliases` (
  `id` int AUTO_INCREMENT NOT NULL,
  `dictionaryId` int NOT NULL,
  `alias` varchar(512) NOT NULL,
  `scope` enum('global','patient') NOT NULL DEFAULT 'global',
  `patientId` int,
  `confirmedById` int,
  `confirmedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `lab_dictionary_aliases_id` PRIMARY KEY(`id`)
);
