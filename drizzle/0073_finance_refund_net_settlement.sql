ALTER TABLE `refunds`
  ADD COLUMN `amountInInvoiceCurrency` decimal(10,2) NULL AFTER `currency`;

ALTER TABLE `refunds`
  ADD COLUMN `conversionRateToInvoice` decimal(20,12) NULL AFTER `amountInInvoiceCurrency`;

ALTER TABLE `refunds`
  ADD COLUMN `fxEffectiveAt` timestamp NULL AFTER `conversionRateToInvoice`;
