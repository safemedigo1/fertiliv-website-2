-- Forward-only extension for the Invoice Items agreed-per-unit contract.
-- Existing final_line_total rows intentionally remain unchanged and retain
-- their whole-line semantic meaning; no backfill or data rewrite is performed.
ALTER TABLE `invoice_items`
  MODIFY COLUMN `linePricingMethod` enum('none','discount_percent','final_line_total','agreed_unit_price') NOT NULL DEFAULT 'none',
  MODIFY COLUMN `priceEntryKind` enum('unit_price','final_line_total','tax_included_final_line_total','agreed_unit_price','tax_included_agreed_unit_price') NULL;
