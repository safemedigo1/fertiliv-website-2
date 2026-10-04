-- X1 Mixed-Currency Service-Line Pricing Foundation
-- Additive only. Existing invoice items intentionally remain NULL / unchanged.
ALTER TABLE `invoice_items`
  ADD COLUMN `priceEntryCurrency` enum('USD','EUR','GBP','TRY','SAR','AED'),
  ADD COLUMN `priceEntryAmount` decimal(18,2),
  ADD COLUMN `priceEntryKind` enum('unit_price','final_line_total','tax_included_final_line_total'),
  ADD COLUMN `priceFxRateToInvoice` decimal(20,12),
  ADD COLUMN `priceFxSourceToTryRate` decimal(20,12),
  ADD COLUMN `priceFxInvoiceToTryRate` decimal(20,12),
  ADD COLUMN `priceFxSource` enum('system','manual'),
  ADD COLUMN `priceFxEffectiveAt` timestamp NULL,
  ADD COLUMN `priceFxNote` text;
