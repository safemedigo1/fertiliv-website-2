-- Finance: Payment Void & Transaction History Integrity
-- Preserve original payment rows and record a controlled void instead of hard deletion.
ALTER TABLE payments ADD COLUMN status ENUM('active', 'voided') NOT NULL DEFAULT 'active' AFTER settledAmount;
ALTER TABLE payments ADD COLUMN voidedAt TIMESTAMP NULL AFTER status;
ALTER TABLE payments ADD COLUMN voidedById INT NULL AFTER voidedAt;
ALTER TABLE payments ADD COLUMN voidReason TEXT NULL AFTER voidedById;
