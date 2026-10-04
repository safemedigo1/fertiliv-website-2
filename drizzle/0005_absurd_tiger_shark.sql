ALTER TABLE `lab_results` ADD `sampleCollectedAt` timestamp;--> statement-breakpoint
ALTER TABLE `lab_results` ADD `reportedAt` timestamp;--> statement-breakpoint
ALTER TABLE `lab_results` ADD `refRangeFrom` varchar(32);--> statement-breakpoint
ALTER TABLE `lab_results` ADD `refRangeTo` varchar(32);--> statement-breakpoint
ALTER TABLE `lab_results` ADD `unitConversionFormula` varchar(256);--> statement-breakpoint
ALTER TABLE `lab_results` ADD `flagManualOverride` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `lab_results` ADD `clinicalInterpretation` text;