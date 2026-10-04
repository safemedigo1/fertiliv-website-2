-- Test Financial Scope & Patient Delete Safety
-- Existing data remains production until an explicit audited Admin classification.
ALTER TABLE patients
  ADD COLUMN defaultFinancialScope ENUM('production', 'test') NOT NULL DEFAULT 'production';

ALTER TABLE invoices
  ADD COLUMN financialScope ENUM('production', 'test') NOT NULL DEFAULT 'production';

ALTER TABLE payments
  ADD COLUMN financialScope ENUM('production', 'test') NOT NULL DEFAULT 'production';

ALTER TABLE refunds
  ADD COLUMN financialScope ENUM('production', 'test') NOT NULL DEFAULT 'production';

ALTER TABLE credit_transactions
  ADD COLUMN financialScope ENUM('production', 'test') NOT NULL DEFAULT 'production';

CREATE INDEX idx_invoices_financialScope ON invoices (financialScope);
CREATE INDEX idx_payments_financialScope ON payments (financialScope);
CREATE INDEX idx_refunds_financialScope ON refunds (financialScope);
CREATE INDEX idx_credit_transactions_financialScope ON credit_transactions (financialScope);
