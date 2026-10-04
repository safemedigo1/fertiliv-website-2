-- Finance follow-up: immutable cross-currency Patient Credit application provenance.
-- Structural only. Existing financial history remains unchanged and nullable fields
-- distinguish it from new manual conversion records.
ALTER TABLE `invoice_settlements`
  ADD COLUMN `sourceCreditCurrency` enum('USD','EUR','GBP','TRY','SAR','AED') NULL,
  ADD COLUMN `sourceCreditAmount` decimal(10,2) NULL,
  ADD COLUMN `creditConversionRateToInvoice` decimal(20,12) NULL,
  ADD COLUMN `creditFxEffectiveAt` timestamp NULL,
  ADD COLUMN `creditFxSource` varchar(64) NULL;

ALTER TABLE `credit_transactions`
  ADD COLUMN `targetInvoiceCurrency` enum('USD','EUR','GBP','TRY','SAR','AED') NULL,
  ADD COLUMN `targetSettlementAmount` decimal(10,2) NULL,
  ADD COLUMN `creditConversionRateToInvoice` decimal(20,12) NULL,
  ADD COLUMN `creditFxEffectiveAt` timestamp NULL,
  ADD COLUMN `creditFxSource` varchar(64) NULL,
  ADD COLUMN `sourceCreditAvailableBefore` decimal(10,2) NULL;
