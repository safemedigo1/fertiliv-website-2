-- Migration 0037: Add case_comments table and leads.assignedDoctorId

-- Add assignedDoctorId to leads table
ALTER TABLE `leads` ADD COLUMN `assignedDoctorId` int;

-- Create case_comments table
CREATE TABLE `case_comments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `leadId` int,
  `patientId` int,
  `authorId` int NOT NULL,
  `content` text NOT NULL,
  `isSystemEvent` boolean NOT NULL DEFAULT false,
  `visibility` enum('all','doctor_only','staff_only') NOT NULL DEFAULT 'all',
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `case_comments_id` PRIMARY KEY(`id`)
);
