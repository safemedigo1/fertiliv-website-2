-- Add externalReceiptKey column to invoices table
ALTER TABLE `invoices` ADD COLUMN `externalReceiptKey` varchar(512);
