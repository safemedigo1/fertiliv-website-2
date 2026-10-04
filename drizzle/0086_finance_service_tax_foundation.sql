CREATE TABLE `service_tax_rules` (
  `id` int AUTO_INCREMENT NOT NULL,
  `label` varchar(128) NOT NULL,
  `ratePercent` decimal(7,4) NOT NULL,
  `isActive` boolean NOT NULL DEFAULT true,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `service_tax_rules_id` PRIMARY KEY(`id`)
);

CREATE TABLE `service_category_tax_defaults` (
  `category` enum('lab_test','radiology_test','pathology_test','other_test','procedure','consultation','medicine') NOT NULL,
  `taxRuleId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `service_category_tax_defaults_category` PRIMARY KEY(`category`)
);

ALTER TABLE `invoices`
  ADD COLUMN `taxModelVersion` varchar(32),
  ADD COLUMN `settlementModelVersion` varchar(32);

ALTER TABLE `invoice_items`
  ADD COLUMN `taxRuleId` int,
  ADD COLUMN `taxLabelSnapshot` varchar(128),
  ADD COLUMN `taxRateSnapshot` decimal(7,4),
  ADD COLUMN `effectiveTaxableBase` decimal(10,2),
  ADD COLUMN `taxAmount` decimal(10,2) NOT NULL DEFAULT 0;
