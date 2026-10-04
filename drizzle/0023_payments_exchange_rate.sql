-- Migration: Add exchangeRateAtPayment column to payments table
-- Convention: 1 FOREIGN = X TRY (e.g. 1 EUR = 52.70 TRY). TRY payments = 1.
ALTER TABLE `payments`
  ADD COLUMN `exchangeRateAtPayment` DECIMAL(12,4) NOT NULL DEFAULT 1.0000
    COMMENT '1 FOREIGN = X TRY at time of payment. Always 1 for TRY payments.',
  MODIFY COLUMN `currency` ENUM('USD','EUR','GBP','TRY','SAR','AED') NOT NULL DEFAULT 'TRY';

-- Update exchange rates in system_settings to correct direction: 1 FOREIGN = X TRY
-- Previous values were inverted (1 TRY = X foreign)
INSERT INTO `system_settings` (`key`, `value`, `description`, `updatedBy`)
VALUES
  ('exchange_rate_USD', '45.02', '1 USD = X TRY (update daily)', NULL),
  ('exchange_rate_EUR', '52.70', '1 EUR = X TRY (update daily)', NULL),
  ('exchange_rate_GBP', '60.89', '1 GBP = X TRY (update daily)', NULL),
  ('exchange_rate_SAR', '12.01', '1 SAR = X TRY (update daily)', NULL),
  ('exchange_rate_AED', '12.26', '1 AED = X TRY (update daily)', NULL)
ON DUPLICATE KEY UPDATE
  `value` = VALUES(`value`),
  `description` = VALUES(`description`);

-- Set exchangeRateAtPayment = 1 for all existing TRY payments
UPDATE `payments` SET `exchangeRateAtPayment` = 1.0000 WHERE `currency` = 'TRY';
