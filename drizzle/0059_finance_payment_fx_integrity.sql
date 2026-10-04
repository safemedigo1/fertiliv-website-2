-- Finance: Payment FX Integrity
-- Preserve exchangeRateAtPayment semantics (payment currency → TRY) and add
-- immutable direct conversion / pre-adjustment invoice-currency snapshots.
-- The application migration sequence is: add nullable → deterministically
-- backfill all rows → verify → enforce NOT NULL.
ALTER TABLE payments ADD COLUMN conversionRateToInvoice DECIMAL(20,12) NULL AFTER exchangeRateAtPayment;
ALTER TABLE payments ADD COLUMN amountInInvoiceCurrency DECIMAL(18,2) NULL AFTER conversionRateToInvoice;

-- Existing rows are deterministically supported only where currency is the same,
-- or USD is paid into a TRY invoice using its persisted payment→TRY snapshot.
UPDATE payments p
INNER JOIN invoices i ON i.id = p.invoiceId
SET
  p.conversionRateToInvoice = CASE
    WHEN p.currency = i.currency THEN CAST(1.000000000000 AS DECIMAL(20,12))
    WHEN p.currency = 'USD' AND i.currency = 'TRY' THEN CAST(p.exchangeRateAtPayment AS DECIMAL(20,12))
    ELSE NULL
  END,
  p.amountInInvoiceCurrency = CASE
    WHEN p.currency = i.currency THEN p.amount
    WHEN p.currency = 'USD' AND i.currency = 'TRY' THEN ROUND(p.amount * p.exchangeRateAtPayment, 2)
    ELSE NULL
  END;

ALTER TABLE payments MODIFY COLUMN conversionRateToInvoice DECIMAL(20,12) NOT NULL;
ALTER TABLE payments MODIFY COLUMN amountInInvoiceCurrency DECIMAL(18,2) NOT NULL;
