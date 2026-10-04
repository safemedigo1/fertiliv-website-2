-- Migration 0019: Update appointment purpose enum and add externalLocation field

-- Add externalLocation column to appointments table
ALTER TABLE appointments ADD COLUMN externalLocation TEXT NULL;

-- Modify purpose enum to replace external-test with diagnostic-test
-- First update any existing external-test values
UPDATE appointments SET purpose = 'diagnostic-test' WHERE purpose = 'external-test';

-- Modify the enum column
ALTER TABLE appointments MODIFY COLUMN purpose ENUM('sales-consultation', 'medical-consultation', 'follow-up', 'procedure', 'diagnostic-test') NULL;
