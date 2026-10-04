-- Operational Inbox organization and human activity history.
-- Additive only: no transport, identity, clinical, Meta, WU-09, or session changes.
ALTER TABLE `whatsapp_conversation_case_links`
  MODIFY COLUMN `relationshipRole` enum('patient','husband','wife','representative','family','translator','other') NOT NULL DEFAULT 'other';

CREATE TABLE IF NOT EXISTS `whatsapp_conversation_tags` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversationId` int NOT NULL,
  `tag` varchar(64) NOT NULL,
  `createdById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `whatsapp_conversation_tags_conversation_tag_uq` (`conversationId`,`tag`),
  KEY `whatsapp_conversation_tags_tag_ix` (`tag`)
);

CREATE TABLE IF NOT EXISTS `whatsapp_conversation_activities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversationId` int NOT NULL,
  `actorId` int NOT NULL,
  `action` varchar(64) NOT NULL,
  `summary` varchar(512) NOT NULL,
  `metadata` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `whatsapp_conversation_activities_conversation_ix` (`conversationId`,`createdAt`)
);
