-- Invoice Line Label: additive, invoice-line-local, nullable, and intentionally
-- left NULL for all historical rows. No backfill or rewrite is performed.
ALTER TABLE `invoice_items`
  ADD COLUMN `lineLabel` varchar(256) NULL;
