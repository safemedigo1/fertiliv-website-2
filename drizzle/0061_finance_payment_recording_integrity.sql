-- Finance — Pre-Phase-3 Payment Recording Integrity
-- Preserve existing historical uncertainty: do not backfill actual receipt or FX-observation times.
ALTER TABLE payments
  ADD COLUMN receivedAt TIMESTAMP NULL COMMENT 'Actual date/time money was received; required for new payment creation, NULL for historical rows with unknown actual transaction time',
  ADD COLUMN fxEffectiveAt TIMESTAMP NULL COMMENT 'Effective date/time of the approved FX observation used for this payment; NULL for historical rows where it was not retained';
