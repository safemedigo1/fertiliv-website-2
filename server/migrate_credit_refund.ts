/**
 * One-time migration: creates credit_transactions and refunds tables,
 * and updates the invoices.currency enum to include SAR and AED.
 * Run via: npx tsx server/migrate_credit_refund.ts
 */
import mysql from "mysql2/promise";

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);

  const statements = [
    `CREATE TABLE IF NOT EXISTS \`credit_transactions\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`patientId\` int NOT NULL,
      \`currency\` enum('USD','EUR','GBP','TRY','SAR','AED') NOT NULL,
      \`amount\` decimal(10,2) NOT NULL,
      \`type\` enum('overpayment','applied_to_invoice','refund_deduction','manual_adjustment') NOT NULL,
      \`invoiceId\` int,
      \`notes\` text,
      \`recordedById\` int,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS \`refunds\` (
      \`id\` int AUTO_INCREMENT PRIMARY KEY,
      \`patientId\` int NOT NULL,
      \`invoiceId\` int NOT NULL,
      \`amount\` decimal(10,2) NOT NULL,
      \`currency\` enum('USD','EUR','GBP','TRY','SAR','AED') NOT NULL,
      \`method\` enum('cash','bank_transfer','card_reversal','other') NOT NULL DEFAULT 'cash',
      \`refundDate\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`notes\` text,
      \`recordedById\` int,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `ALTER TABLE \`invoices\` MODIFY COLUMN \`currency\` enum('USD','EUR','GBP','TRY','SAR','AED') NOT NULL DEFAULT 'USD'`,
  ];

  for (const stmt of statements) {
    try {
      await conn.execute(stmt);
      console.log("✓", stmt.trim().substring(0, 70));
    } catch (e: any) {
      console.error("✗", e.message);
    }
  }

  await conn.end();
  console.log("Migration complete");
}

run().catch(console.error);
