-- Migration: Create clinic_info table
CREATE TABLE IF NOT EXISTS `clinic_info` (
  `id` int AUTO_INCREMENT NOT NULL,
  `nameEn` varchar(256),
  `nameAr` varchar(256),
  `nameTr` varchar(256),
  `sloganEn` varchar(512),
  `sloganAr` varchar(512),
  `sloganTr` varchar(512),
  `addressEn` text,
  `addressAr` text,
  `addressTr` text,
  `bioEn` text,
  `bioAr` text,
  `bioTr` text,
  `email` varchar(256),
  `whatsapp` varchar(64),
  `website` varchar(512),
  `mapsLink` text,
  `logoEnLightKey` varchar(512),
  `logoEnDarkKey` varchar(512),
  `logoArLightKey` varchar(512),
  `logoArDarkKey` varchar(512),
  `stampKey` varchar(512),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `updatedBy` int,
  CONSTRAINT `clinic_info_id` PRIMARY KEY(`id`)
);

-- Seed with a default row so getClinicInfo() always returns a record
INSERT IGNORE INTO `clinic_info` (`id`, `nameEn`, `updatedAt`) VALUES (1, 'Fertiliv IVF Center', NOW());
