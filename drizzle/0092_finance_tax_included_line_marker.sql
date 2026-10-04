-- Forward-only marker required to rehydrate future standard Tax-Included lines.
-- Existing invoice-item snapshots remain unchanged; no backfill is performed.
ALTER TABLE `invoice_items`
  ADD COLUMN `taxIncludedMode` boolean NULL AFTER `taxRateSnapshot`;
