CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`doctorId` int,
	`serviceId` int,
	`staffId` int,
	`title` varchar(256) NOT NULL,
	`appointmentDate` timestamp NOT NULL,
	`endDate` timestamp,
	`duration` int DEFAULT 30,
	`type` enum('consultation','follow_up','procedure','lab','radiology','other') NOT NULL DEFAULT 'consultation',
	`status` enum('upcoming','confirmed','completed','cancelled','no_show','rescheduled') NOT NULL DEFAULT 'upcoming',
	`notes` text,
	`cancellationReason` text,
	`reminderSent` boolean DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `doctors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`specialty` varchar(128),
	`licenseNumber` varchar(64),
	`bio` text,
	`consultationFee` decimal(10,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `doctors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoice_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`serviceId` int,
	`description` varchar(256) NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`unitPrice` decimal(10,2) NOT NULL,
	`totalPrice` decimal(10,2) NOT NULL,
	CONSTRAINT `invoice_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`invoiceNumber` varchar(32) NOT NULL,
	`issueDate` timestamp NOT NULL DEFAULT (now()),
	`dueDate` timestamp,
	`subtotal` decimal(10,2) NOT NULL,
	`discountAmount` decimal(10,2) DEFAULT '0',
	`taxAmount` decimal(10,2) DEFAULT '0',
	`totalAmount` decimal(10,2) NOT NULL,
	`paidAmount` decimal(10,2) DEFAULT '0',
	`status` enum('draft','issued','paid','partial','overdue','cancelled') NOT NULL DEFAULT 'draft',
	`paymentMethod` varchar(64),
	`paymentDate` timestamp,
	`notes` text,
	`createdById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoiceNumber_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `lab_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`doctorId` int,
	`appointmentId` int,
	`serviceId` int,
	`orderNumber` varchar(32) NOT NULL,
	`testName` varchar(256) NOT NULL,
	`category` enum('lab','radiology','pathology','other') NOT NULL DEFAULT 'lab',
	`status` enum('ordered','sample_collected','processing','completed','cancelled') NOT NULL DEFAULT 'ordered',
	`priority` enum('routine','urgent','stat') NOT NULL DEFAULT 'routine',
	`orderedDate` timestamp NOT NULL DEFAULT (now()),
	`collectedDate` timestamp,
	`resultDate` timestamp,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lab_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `lab_orders_orderNumber_unique` UNIQUE(`orderNumber`)
);
--> statement-breakpoint
CREATE TABLE `lab_results` (
	`id` int AUTO_INCREMENT NOT NULL,
	`labOrderId` int NOT NULL,
	`patientId` int NOT NULL,
	`parameter` varchar(128) NOT NULL,
	`value` varchar(128) NOT NULL,
	`unit` varchar(32),
	`referenceRange` varchar(64),
	`flag` enum('normal','low','high','critical') DEFAULT 'normal',
	`interpretation` text,
	`reportUrl` text,
	`enteredById` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `lab_results_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `medical_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`doctorId` int,
	`authorId` int NOT NULL,
	`noteType` enum('consultation','follow_up','procedure','lab_review','general') NOT NULL DEFAULT 'consultation',
	`chiefComplaint` text,
	`historyOfPresentIllness` text,
	`physicalExamination` text,
	`assessment` text,
	`plan` text,
	`diagnosis` text,
	`medications` text,
	`rawTranscript` text,
	`aiSummary` text,
	`isAiGenerated` boolean DEFAULT false,
	`visitDate` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `medical_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fromUserId` int NOT NULL,
	`toUserId` int NOT NULL,
	`subject` varchar(256),
	`content` text NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('appointment_reminder','appointment_cancellation','invoice_issued','payment_confirmed','lab_result_ready','general') NOT NULL,
	`title` varchar(256) NOT NULL,
	`message` text NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`relatedId` int,
	`relatedType` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int,
	`title` varchar(256) NOT NULL,
	`description` text,
	`discountType` enum('percentage','fixed') NOT NULL DEFAULT 'percentage',
	`discountValue` decimal(10,2) NOT NULL,
	`validFrom` timestamp,
	`validUntil` timestamp,
	`status` enum('active','expired','used') NOT NULL DEFAULT 'active',
	`code` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `offers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`mrn` varchar(32) NOT NULL,
	`firstName` varchar(128) NOT NULL,
	`lastName` varchar(128) NOT NULL,
	`dateOfBirth` timestamp,
	`gender` enum('male','female','other'),
	`phone` varchar(32),
	`email` varchar(320),
	`address` text,
	`bloodType` varchar(8),
	`allergies` text,
	`emergencyContactName` varchar(128),
	`emergencyContactPhone` varchar(32),
	`insuranceProvider` varchar(128),
	`insuranceNumber` varchar(64),
	`assignedDoctorId` int,
	`interestLevel` enum('cold','warm','hot') DEFAULT 'warm',
	`leadSource` varchar(64),
	`tags` text,
	`status` enum('active','inactive','archived') NOT NULL DEFAULT 'active',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_id` PRIMARY KEY(`id`),
	CONSTRAINT `patients_mrn_unique` UNIQUE(`mrn`)
);
--> statement-breakpoint
CREATE TABLE `sales_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`authorId` int NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`assignedToId` int,
	`title` varchar(256) NOT NULL,
	`description` text,
	`dueDate` timestamp,
	`priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
	`status` enum('pending','in_progress','completed','cancelled') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sales_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(256) NOT NULL,
	`category` enum('lab_test','radiology_test','pathology_test','other_test','procedure') NOT NULL,
	`description` text,
	`price` decimal(10,2) NOT NULL,
	`duration` int,
	`preparationInstructions` text,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`code` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `services_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('patient','staff','doctor','admin') NOT NULL DEFAULT 'patient';--> statement-breakpoint
ALTER TABLE `users` ADD `avatarUrl` text;--> statement-breakpoint
ALTER TABLE `users` ADD `phone` varchar(32);