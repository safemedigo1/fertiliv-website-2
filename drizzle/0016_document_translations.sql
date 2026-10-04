-- Migration 0016: Add document_translations table for AI translation feature
CREATE TABLE `document_translations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `patientId` INT NOT NULL,
  `labResultId` INT NULL,
  `originalFileUrl` TEXT NULL,
  `originalFileName` VARCHAR(256) NULL,
  `originalLanguage` VARCHAR(32) NULL,
  `targetLanguage` VARCHAR(32) NOT NULL DEFAULT 'en',
  `translatedText` TEXT NULL,
  `extractedText` TEXT NULL,
  `status` ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  `errorMessage` TEXT NULL,
  `translatedById` INT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
