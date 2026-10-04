CREATE TABLE IF NOT EXISTS `tasks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `title` varchar(256) NOT NULL,
  `type` enum('callback_request','follow_up','send_info','consultation_request','other') NOT NULL DEFAULT 'follow_up',
  `status` enum('open','in_progress','done') NOT NULL DEFAULT 'open',
  `priority` enum('low','medium','high') NOT NULL DEFAULT 'medium',
  `dueDate` varchar(16),
  `dueTime` varchar(8),
  `communicationMethod` enum('whatsapp','phone_call','video_call','email','in_person'),
  `notes` text,
  `leadId` int,
  `patientId` int,
  `assignedToId` int,
  `createdById` int,
  `closedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT NOW(),
  `updatedAt` timestamp NOT NULL DEFAULT NOW() ON UPDATE NOW(),
  CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
