-- Invoice Pricing V4: unitPrice remains the immutable original/standard per-unit
-- invoice snapshot; totalPrice remains the canonical final line total.
-- Historical lines receive the deterministic no-adjustment baseline.
ALTER TABLE invoice_items
  ADD COLUMN linePricingMethod ENUM('none', 'discount_percent', 'final_line_total') NOT NULL DEFAULT 'none' AFTER totalPrice;
ALTER TABLE invoice_items
  ADD COLUMN lineDiscountPercent DECIMAL(5,2) NULL AFTER linePricingMethod;

-- No historical line discount is inferred. Existing unitPrice, quantity, and
-- totalPrice are preserved; a later verification must confirm all `none` rows
-- remain compatible with totalPrice = ROUND(unitPrice * quantity, 2).
