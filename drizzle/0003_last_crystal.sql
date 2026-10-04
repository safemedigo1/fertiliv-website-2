CREATE TABLE `appointment_activity_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appointmentId` int NOT NULL,
	`userId` int NOT NULL,
	`action` varchar(128) NOT NULL,
	`oldValue` text,
	`newValue` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appointment_activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lead_communications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`note` text NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lead_communications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lead_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`fileKey` text NOT NULL,
	`fileUrl` text NOT NULL,
	`fileName` varchar(256) NOT NULL,
	`mimeType` varchar(128),
	`uploadedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lead_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`firstName` varchar(128) NOT NULL,
	`lastName` varchar(128) NOT NULL,
	`email` varchar(320),
	`phone` varchar(32),
	`nationality` varchar(64),
	`preferredLanguage` enum('en','ar','tr','fr','es','ru','it','other') DEFAULT 'en',
	`preferredContactMethod` enum('whatsapp','email','phone','telegram') DEFAULT 'whatsapp',
	`interestedProcedureId` int,
	`ivfExperience` enum('none','1-2','3-5','more-than-5') DEFAULT 'none',
	`fertilityDiagnosis` json,
	`leadSource` enum('organic','social-media-ads','google-ads','reference','safemedigo-platform','dr-nilay-patient','website'),
	`socialLeadId` varchar(128),
	`campaignName` varchar(256),
	`brand` enum('fertiliv','safemedigo','dr-nilay-karaca') DEFAULT 'fertiliv',
	`budgetRange` varchar(64),
	`decisionTimeline` enum('immediate','1-3-months','3-6-months','6-12-months','not-sure'),
	`travelReadiness` enum('ready','planning','considering','not-ready'),
	`leadStatus` enum('intake','attempted-to-contact','contacted-awaiting-info','medical-reports-received','doctor-feedback-shared','follow-up-negotiation','ready-to-travel','converted','cold','lost','not-qualified','junk') NOT NULL DEFAULT 'intake',
	`rating` int DEFAULT 0,
	`assignedStaffId` int,
	`lastContactDate` timestamp,
	`nextFollowUpDate` timestamp,
	`tags` json,
	`address` text,
	`city` varchar(128),
	`country` varchar(64),
	`accommodationHotel` varchar(256),
	`accommodationLocation` varchar(256),
	`transportationAirportPickup` boolean DEFAULT false,
	`transportationLocalTransfer` boolean DEFAULT false,
	`convertedPatientId` int,
	`createdBy` int,
	`modifiedBy` int,
	`modifiedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `leads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `medical_intake` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int NOT NULL,
	`husbandName` varchar(256),
	`husbandAge` int,
	`husbandProfession` varchar(128),
	`husbandHeight` int,
	`husbandWeight` int,
	`husbandFertilityIssues` text,
	`husbandMedications` text,
	`husbandPreviousTests` text,
	`husbandPreviousSurgeries` text,
	`wifeName` varchar(256),
	`wifeAge` int,
	`wifeProfession` varchar(128),
	`wifeHeight` int,
	`wifeWeight` int,
	`marriageDate` timestamp,
	`tryingDuration` varchar(64),
	`previousPregnancies` int DEFAULT 0,
	`miscarriages` int DEFAULT 0,
	`surgeries` text,
	`previousFertilityTreatments` json,
	`knownDiseases` text,
	`menstrualCycle` varchar(128),
	`currentMedications` text,
	`labResults` json,
	`additionalNotes` text,
	`expectedVisitDate` timestamp,
	`hasCivilMarriageCertificate` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `medical_intake_id` PRIMARY KEY(`id`),
	CONSTRAINT `medical_intake_leadId_unique` UNIQUE(`leadId`)
);
--> statement-breakpoint
CREATE TABLE `partner_clinics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`specialty` varchar(128),
	`address` text,
	`phone` varchar(32),
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partner_clinics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `staff_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`module` enum('leads','patients','calendar','finance','lab','settings','analytics') NOT NULL,
	`canView` boolean NOT NULL DEFAULT true,
	`canCreate` boolean NOT NULL DEFAULT false,
	`canEdit` boolean NOT NULL DEFAULT false,
	`canDelete` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `staff_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `treatment_packages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`description` text,
	`services` json,
	`localPriceUSD` decimal(10,2),
	`localPriceEUR` decimal(10,2),
	`localPriceGBP` decimal(10,2),
	`localPriceTRY` decimal(10,2),
	`intlPriceUSD` decimal(10,2),
	`intlPriceEUR` decimal(10,2),
	`intlPriceGBP` decimal(10,2),
	`intlPriceTRY` decimal(10,2),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `treatment_packages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `treatment_proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`leadId` int,
	`patientId` int,
	`packageId` int,
	`currency` enum('USD','EUR','GBP','TRY') NOT NULL DEFAULT 'USD',
	`appliedPriceType` enum('local','international') NOT NULL DEFAULT 'international',
	`totalAmount` decimal(10,2),
	`customItems` json,
	`aiSuggestion` text,
	`staffNotes` text,
	`status` enum('draft','sent','accepted','rejected') NOT NULL DEFAULT 'draft',
	`sentAt` timestamp,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `treatment_proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `appointments` MODIFY COLUMN `patientId` int;--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `patientId` int;--> statement-breakpoint
ALTER TABLE `appointments` ADD `leadId` int;--> statement-breakpoint
ALTER TABLE `appointments` ADD `hostUserId` int;--> statement-breakpoint
ALTER TABLE `appointments` ADD `appointmentType` enum('in-clinic','online','external') DEFAULT 'in-clinic';--> statement-breakpoint
ALTER TABLE `appointments` ADD `purpose` enum('sales-consultation','medical-consultation','follow-up','procedure','external-test');--> statement-breakpoint
ALTER TABLE `appointments` ADD `meetingLink` text;--> statement-breakpoint
ALTER TABLE `appointments` ADD `partnerClinicId` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `leadId` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `currency` enum('USD','EUR','GBP','TRY') DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE `lab_orders` ADD `partnerClinicId` int;--> statement-breakpoint
ALTER TABLE `lab_orders` ADD `location` enum('in-clinic','partner-clinic','patient-country') DEFAULT 'in-clinic';--> statement-breakpoint
ALTER TABLE `lab_results` ADD `resultFileKey` text;--> statement-breakpoint
ALTER TABLE `lab_results` ADD `resultFileUrl` text;--> statement-breakpoint
ALTER TABLE `lab_results` ADD `translationFileKey` text;--> statement-breakpoint
ALTER TABLE `lab_results` ADD `translationFileUrl` text;--> statement-breakpoint
ALTER TABLE `lab_results` ADD `isVisibleToPatient` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `patients` ADD `nationality` varchar(64);--> statement-breakpoint
ALTER TABLE `patients` ADD `isLocalPatient` boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE `patients` ADD `brand` enum('fertiliv','safemedigo','dr-nilay-karaca') DEFAULT 'fertiliv';--> statement-breakpoint
ALTER TABLE `patients` ADD `createdBy` int;--> statement-breakpoint
ALTER TABLE `patients` ADD `modifiedBy` int;--> statement-breakpoint
ALTER TABLE `patients` ADD `modifiedAt` timestamp;--> statement-breakpoint
ALTER TABLE `services` ADD `localPriceUSD` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `localPriceEUR` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `localPriceGBP` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `localPriceTRY` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `intlPriceUSD` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `intlPriceEUR` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `intlPriceGBP` decimal(10,2);--> statement-breakpoint
ALTER TABLE `services` ADD `intlPriceTRY` decimal(10,2);