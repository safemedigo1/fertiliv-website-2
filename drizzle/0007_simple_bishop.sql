ALTER TABLE `medical_intake` MODIFY COLUMN `leadId` int;--> statement-breakpoint
ALTER TABLE `leads` ADD `partnerId` int;--> statement-breakpoint
ALTER TABLE `medical_intake` ADD `patientId` int;--> statement-breakpoint
ALTER TABLE `patients` ADD `partnerId` int;--> statement-breakpoint
ALTER TABLE `medical_intake` ADD CONSTRAINT `medical_intake_patientId_unique` UNIQUE(`patientId`);