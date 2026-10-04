CREATE TABLE `appointment_communication_deliveries` (
  `id` int AUTO_INCREMENT NOT NULL,
  `appointmentId` int NOT NULL,
  `sendGroupId` varchar(64) NOT NULL,
  `communicationType` enum('manual_appointment_details') NOT NULL,
  `channel` enum('email') NOT NULL,
  `recipientEmail` varchar(320) NOT NULL,
  `recipientType` enum('patient','lead','partner','additional') NOT NULL,
  `language` enum('en','ar','tr') NOT NULL,
  `templateKey` varchar(128) NOT NULL,
  `templateVersion` varchar(64) NOT NULL,
  `sentByUserId` int NOT NULL,
  `deliveryStatus` enum('sent','failed') NOT NULL,
  `providerMessageId` varchar(256),
  `failureClassification` varchar(64),
  `failureCode` varchar(128),
  `sentAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `appointment_communication_deliveries_id` PRIMARY KEY(`id`)
);
