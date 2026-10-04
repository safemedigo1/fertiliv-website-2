-- Migration 0039: Treatment Plans, Scenarios, Doctor Review Requests

CREATE TABLE IF NOT EXISTS `treatment_plans` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `leadId` int,
  `patientId` int,
  `doctorId` int,
  `status` enum('draft','confirmed','sent') NOT NULL DEFAULT 'draft',
  `clinicalSummary` text,
  `qaAnswers` json,
  `confirmedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `treatment_plan_scenarios` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `treatmentPlanId` int NOT NULL,
  `title` varchar(256) NOT NULL,
  `summary` text,
  `services` json,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS `doctor_review_requests` (
  `id` int AUTO_INCREMENT PRIMARY KEY NOT NULL,
  `leadId` int,
  `patientId` int,
  `doctorId` int NOT NULL,
  `requestedById` int NOT NULL,
  `status` enum('pending','in_review','plan_ready') NOT NULL DEFAULT 'pending',
  `requestedAt` timestamp NOT NULL DEFAULT (now()),
  `reviewStartedAt` timestamp,
  `planReadyAt` timestamp
);
