-- Finance Phase 2: Add persisted settledAmount column to payments table.
-- settledAmount stores the invoice-obligation amount settled by each payment,
-- distinct from amount (actual money received). For cash and Mode B: equals
-- amountInInvoiceCurrency. For Mode A non-cash (credit_card/bank_transfer):
-- amountInInvoiceCurrency / (1 + adjustmentRate/100).
-- Column was added as nullable, backfilled for all 21 existing rows, then made NOT NULL.
-- This migration records the final NOT NULL state for Drizzle schema tracking.
ALTER TABLE `payments` ADD COLUMN `settledAmount` DECIMAL(10,2) NOT NULL DEFAULT '0' COMMENT 'Amount of invoice obligation settled by this payment (in invoice currency). For cash and Mode B: equals amountInInvoiceCurrency. For Mode A non-cash (credit_card/bank_transfer): amountInInvoiceCurrency / (1 + adjustmentRate/100). Stored at payment creation time using the invoice snapshotted rate.';
