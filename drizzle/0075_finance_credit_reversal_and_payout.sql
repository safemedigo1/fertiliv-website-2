-- Additive Finance lineage for reversible Patient Credit applications and
-- native-credit Cash/Bank payouts. Historical credit applications remain untouched.

ALTER TABLE `invoice_settlements`
  ADD COLUMN `patientCreditApplicationId` int NULL;

ALTER TABLE `credit_transactions`
  MODIFY COLUMN `type` enum('overpayment','applied_to_invoice','applied_credit_reversal','credit_payout','refund_deduction','manual_adjustment') NOT NULL,
  ADD COLUMN `patientCreditApplicationId` int NULL,
  ADD COLUMN `patientCreditPayoutId` int NULL;

CREATE TABLE `patient_credit_applications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patientId` int NOT NULL,
  `invoiceId` int NOT NULL,
  `financialScope` enum('production','test') NOT NULL DEFAULT 'production',
  `sourceCurrency` enum('USD','EUR','GBP','TRY','SAR','AED') NOT NULL,
  `targetInvoiceCurrency` enum('USD','EUR','GBP','TRY','SAR','AED') NOT NULL,
  `sourceCreditAmount` decimal(10,2) NOT NULL,
  `creditSettlementAmount` decimal(10,2) NOT NULL,
  `fxRoundingAdjustmentAmount` decimal(10,2) NOT NULL DEFAULT '0',
  `finalSettlementAmount` decimal(10,2) NOT NULL,
  `conversionRateToInvoice` decimal(20,12) NULL,
  `fxEffectiveAt` timestamp NULL,
  `fxSource` varchar(64) NULL,
  `status` enum('active','reversed') NOT NULL DEFAULT 'active',
  `reversalReason` text NULL,
  `reversedAt` timestamp NULL,
  `reversedById` int NULL,
  `createdById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `patient_credit_applications_invoice_status_idx` (`invoiceId`,`status`),
  KEY `patient_credit_applications_patient_scope_idx` (`patientId`,`financialScope`,`status`)
);

CREATE TABLE `patient_credit_application_allocations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `applicationId` int NOT NULL,
  `sourceCreditTransactionId` int NOT NULL,
  `creditDebitTransactionId` int NOT NULL,
  `creditSettlementId` int NOT NULL,
  `nativeSourceAmount` decimal(10,2) NOT NULL,
  `targetSettlementAmount` decimal(10,2) NOT NULL,
  `reversalCreditTransactionId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `patient_credit_application_allocations_application_idx` (`applicationId`),
  KEY `patient_credit_application_allocations_source_idx` (`sourceCreditTransactionId`)
);

CREATE TABLE `patient_credit_application_reversals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `applicationId` int NOT NULL,
  `patientId` int NOT NULL,
  `invoiceId` int NOT NULL,
  `financialScope` enum('production','test') NOT NULL DEFAULT 'production',
  `restoredSourceAmount` decimal(10,2) NOT NULL,
  `reversedCreditSettlementAmount` decimal(10,2) NOT NULL,
  `reversedFxRoundingAdjustmentAmount` decimal(10,2) NOT NULL DEFAULT '0',
  `reason` text NULL,
  `recordedById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `patient_credit_application_reversals_application_uq` (`applicationId`),
  KEY `patient_credit_application_reversals_invoice_idx` (`invoiceId`)
);

CREATE TABLE `patient_credit_payouts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `patientId` int NOT NULL,
  `financialScope` enum('production','test') NOT NULL DEFAULT 'production',
  `sourceCurrency` enum('USD','EUR','GBP','TRY','SAR','AED') NOT NULL,
  `sourceCreditAmount` decimal(10,2) NOT NULL,
  `payoutCurrency` enum('USD','EUR','GBP','TRY','SAR','AED') NOT NULL,
  `payoutAmount` decimal(10,2) NOT NULL,
  `conversionRateToPayout` decimal(20,12) NULL,
  `fxEffectiveAt` timestamp NULL,
  `fxSource` varchar(64) NULL,
  `method` enum('cash','bank_transfer') NOT NULL,
  `payoutDate` timestamp NOT NULL,
  `reference` varchar(256) NULL,
  `notes` text NULL,
  `recordedById` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `patient_credit_payouts_patient_scope_idx` (`patientId`,`financialScope`,`createdAt`)
);

CREATE TABLE `patient_credit_payout_allocations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `payoutId` int NOT NULL,
  `sourceCreditTransactionId` int NOT NULL,
  `creditDebitTransactionId` int NOT NULL,
  `nativeSourceAmount` decimal(10,2) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `patient_credit_payout_allocations_payout_idx` (`payoutId`),
  KEY `patient_credit_payout_allocations_source_idx` (`sourceCreditTransactionId`)
);
