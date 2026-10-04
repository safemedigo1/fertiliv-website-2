-- Manual/Historical payment FX audit metadata only.
-- Additive and nullable by design: existing payment rows are untouched and no
-- historical source, note, rate, or FX snapshot is inferred or backfilled.
ALTER TABLE `payments`
  ADD COLUMN `fxRateSource` ENUM('system', 'manual') NULL,
  ADD COLUMN `fxRateNote` TEXT NULL;
