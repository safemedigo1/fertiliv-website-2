-- Finance AUD support: additive enum expansion for the existing payment/native-credit lifecycle.
-- No rows are rewritten; invoice and negotiated service-price currencies remain unchanged.
ALTER TABLE `payments`
  MODIFY COLUMN `currency` enum('USD','EUR','GBP','TRY','SAR','AED','AUD') NOT NULL DEFAULT 'TRY';

ALTER TABLE `invoice_settlements`
  MODIFY COLUMN `currency` enum('USD','EUR','GBP','TRY','SAR','AED','AUD') NOT NULL,
  MODIFY COLUMN `sourceCreditCurrency` enum('USD','EUR','GBP','TRY','SAR','AED','AUD');

ALTER TABLE `credit_transactions`
  MODIFY COLUMN `currency` enum('USD','EUR','GBP','TRY','SAR','AED','AUD') NOT NULL,
  MODIFY COLUMN `targetInvoiceCurrency` enum('USD','EUR','GBP','TRY','SAR','AED','AUD');

ALTER TABLE `patient_credit_applications`
  MODIFY COLUMN `sourceCurrency` enum('USD','EUR','GBP','TRY','SAR','AED','AUD') NOT NULL,
  MODIFY COLUMN `targetInvoiceCurrency` enum('USD','EUR','GBP','TRY','SAR','AED','AUD') NOT NULL;

ALTER TABLE `patient_credit_payouts`
  MODIFY COLUMN `sourceCurrency` enum('USD','EUR','GBP','TRY','SAR','AED','AUD') NOT NULL,
  MODIFY COLUMN `payoutCurrency` enum('USD','EUR','GBP','TRY','SAR','AED','AUD') NOT NULL;
