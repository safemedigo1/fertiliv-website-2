-- REQ-5: Add primaryLanguage column to patients and leads
ALTER TABLE `patients` ADD COLUMN IF NOT EXISTS `primaryLanguage` varchar(16);
ALTER TABLE `leads` ADD COLUMN IF NOT EXISTS `primaryLanguage` varchar(16);

-- REQ-6: Create centralized reference_data table
CREATE TABLE IF NOT EXISTS `reference_data` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `type` ENUM('language','country','city','nationality') NOT NULL,
  `code` varchar(16) NOT NULL,
  `label` varchar(256) NOT NULL,
  `labelAr` varchar(256),
  `labelTr` varchar(256),
  `sortOrder` int DEFAULT 0,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed languages
INSERT IGNORE INTO `reference_data` (`type`, `code`, `label`, `sortOrder`) VALUES
  ('language', 'en', 'English', 1),
  ('language', 'ar', 'Arabic', 2),
  ('language', 'tr', 'Turkish', 3),
  ('language', 'ru', 'Russian', 4),
  ('language', 'de', 'German', 5),
  ('language', 'fr', 'French', 6),
  ('language', 'es', 'Spanish', 7),
  ('language', 'fa', 'Persian', 8),
  ('language', 'ur', 'Urdu', 9),
  ('language', 'other', 'Other', 99);
