ALTER TABLE `invoice_settlements`
  MODIFY COLUMN `sourceType` ENUM('payment', 'credit', 'fx_rounding_adjustment') NOT NULL;

ALTER TABLE `invoice_settlements`
  ADD COLUMN `fxRoundingReason` varchar(256) NULL AFTER `creditFxSource`;

ALTER TABLE `invoice_settlements`
  ADD COLUMN `fxRoundingSourceMinorUnit` decimal(10,2) NULL AFTER `fxRoundingReason`;
