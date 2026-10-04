-- Google Calendar G1: clinic-level OAuth connection, selected destination,
-- and single-use callback state. No Fertiliv appointment mapping is introduced.
CREATE TABLE `google_calendar_connections` (
  `id` int AUTO_INCREMENT NOT NULL,
  `provider` varchar(32) NOT NULL,
  `connectedAccountEmail` varchar(320) NOT NULL,
  `encryptedRefreshToken` text NOT NULL,
  `destinationCalendarId` varchar(512),
  `destinationCalendarName` varchar(512),
  `businessTimezone` varchar(64) NOT NULL DEFAULT 'Europe/Istanbul',
  `status` enum('connected','needs_attention') NOT NULL DEFAULT 'connected',
  `connectedByUserId` int NOT NULL,
  `connectedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `lastValidatedAt` timestamp NULL,
  `lastError` varchar(512),
  `testEventId` varchar(1024),
  `testEventCalendarId` varchar(512),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `google_calendar_connections_id` PRIMARY KEY(`id`),
  CONSTRAINT `google_calendar_connections_provider_unique` UNIQUE(`provider`)
);

CREATE TABLE `google_calendar_oauth_states` (
  `id` int AUTO_INCREMENT NOT NULL,
  `stateHash` varchar(64) NOT NULL,
  `userId` int NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `google_calendar_oauth_states_id` PRIMARY KEY(`id`),
  CONSTRAINT `google_calendar_oauth_states_stateHash_unique` UNIQUE(`stateHash`)
);
