-- Explicit request keys prevent duplicate submission/retry from creating a second
-- Patient Credit reversal or payout. Existing tables are empty on introduction.
ALTER TABLE `patient_credit_application_reversals`
  ADD COLUMN `idempotencyKey` varchar(64) NOT NULL;

ALTER TABLE `patient_credit_payouts`
  ADD COLUMN `idempotencyKey` varchar(64) NOT NULL;

ALTER TABLE `patient_credit_application_reversals`
  ADD UNIQUE KEY `patient_credit_application_reversals_idempotency_uq` (`idempotencyKey`);

ALTER TABLE `patient_credit_payouts`
  ADD UNIQUE KEY `patient_credit_payouts_idempotency_uq` (`idempotencyKey`);
