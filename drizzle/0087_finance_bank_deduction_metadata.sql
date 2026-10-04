ALTER TABLE `payments`
  ADD COLUMN `bankGrossAmountSent` decimal(10,2) NULL,
  ADD COLUMN `bankDeductionAmount` decimal(10,2) NULL,
  ADD COLUMN `bankDeductionPercent` decimal(9,4) NULL;
