import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await createConnection(url);

const sqls = [
  `CREATE TABLE IF NOT EXISTS \`system_settings\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`key\` varchar(128) NOT NULL,
    \`value\` text NOT NULL,
    \`description\` varchar(256),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    \`updatedBy\` int,
    CONSTRAINT \`system_settings_id\` PRIMARY KEY(\`id\`),
    CONSTRAINT \`system_settings_key_unique\` UNIQUE(\`key\`)
  )`,
  // Seed default exchange rates (TRY base = 1, others relative to TRY)
  `INSERT IGNORE INTO \`system_settings\` (\`key\`, \`value\`, \`description\`) VALUES
    ('exchange_rate_USD', '0.028', 'USD per 1 TRY'),
    ('exchange_rate_EUR', '0.026', 'EUR per 1 TRY'),
    ('exchange_rate_GBP', '0.022', 'GBP per 1 TRY'),
    ('exchange_rate_SAR', '0.105', 'SAR per 1 TRY'),
    ('exchange_rate_AED', '0.103', 'AED per 1 TRY'),
    ('foreign_price_markup_pct', '30', 'Foreign patient price markup % over local TRY price'),
    ('card_surcharge_pct', '23', 'Surcharge % for card/bank transfer payments')`,
];

for (const sql of sqls) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.slice(0, 70));
  } catch (e) {
    console.error("ERROR:", e.message, "\nSQL:", sql.slice(0, 100));
  }
}

await conn.end();
console.log("Migration complete.");
