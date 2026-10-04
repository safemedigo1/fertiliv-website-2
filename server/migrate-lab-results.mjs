import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }

const conn = await createConnection(url);

const sqls = [
  "ALTER TABLE `lab_results` ADD `sampleCollectedAt` timestamp",
  "ALTER TABLE `lab_results` ADD `reportedAt` timestamp",
  "ALTER TABLE `lab_results` ADD `refRangeFrom` varchar(32)",
  "ALTER TABLE `lab_results` ADD `refRangeTo` varchar(32)",
  "ALTER TABLE `lab_results` ADD `unitConversionFormula` varchar(256)",
  "ALTER TABLE `lab_results` ADD `flagManualOverride` boolean DEFAULT false",
  "ALTER TABLE `lab_results` ADD `clinicalInterpretation` text",
];

for (const sql of sqls) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.slice(0, 70));
  } catch (e) {
    if (e.message?.includes("Duplicate column")) {
      console.log("SKIP (already exists):", sql.slice(0, 70));
    } else {
      console.error("ERROR:", e.message, "\nSQL:", sql);
    }
  }
}

await conn.end();
console.log("Migration complete.");
