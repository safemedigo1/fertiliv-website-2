CREATE TABLE `invoice_settlements` (
  `id` int AUTO_INCREMENT NOT NULL,
  `patientId` int NOT NULL,
  `invoiceId` int NOT NULL,
  `financialScope` enum('production','test') NOT NULL DEFAULT 'production',
  `currency` enum('USD','EUR','GBP','TRY','SAR','AED') NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `sourceType` enum('payment','credit') NOT NULL,
  `paymentId` int NULL,
  `creditTransactionId` int NULL,
  `status` enum('active','voided') NOT NULL DEFAULT 'active',
  `voidedAt` timestamp NULL,
  `voidedById` int NULL,
  `voidReason` text NULL,
  `recordedById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_invoice_settlements_invoice` (`invoiceId`),
  KEY `idx_invoice_settlements_patient_scope_currency` (`patientId`, `financialScope`, `currency`)
);

ALTER TABLE `credit_transactions`
  ADD COLUMN `originPaymentId` int NULL,
  ADD COLUMN `originInvoiceId` int NULL,
  ADD COLUMN `sourceCreditTransactionId` int NULL,
  ADD COLUMN `settlementId` int NULL,
  ADD COLUMN `originPaymentMethod` enum('cash','credit_card','bank_transfer','insurance','other') NULL;
