-- Migration: clinic_tags, specializations, doctor profile fields
-- Add clinic_tags table
CREATE TABLE IF NOT EXISTS `clinic_tags` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(64) NOT NULL,
  `color` varchar(16) NOT NULL DEFAULT '#6366f1',
  `createdByUserId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Add specializations table
CREATE TABLE IF NOT EXISTS `specializations` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `name` varchar(128) NOT NULL UNIQUE,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add doctor profile fields: title/rank, three-part name, specializationId FK
ALTER TABLE `doctors`
  ADD COLUMN IF NOT EXISTS `title` varchar(64),
  ADD COLUMN IF NOT EXISTS `firstName` varchar(128),
  ADD COLUMN IF NOT EXISTS `secondName` varchar(128),
  ADD COLUMN IF NOT EXISTS `thirdName` varchar(128),
  ADD COLUMN IF NOT EXISTS `specializationId` int;

-- Seed default specializations
INSERT IGNORE INTO `specializations` (`name`) VALUES
  ('Reproductive Endocrinology & Infertility'),
  ('Obstetrics & Gynecology'),
  ('Andrology'),
  ('Embryology'),
  ('Genetics'),
  ('Urology'),
  ('Endocrinology'),
  ('Immunology'),
  ('Nursing'),
  ('General Practice');
