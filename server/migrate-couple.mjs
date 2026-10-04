import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  console.log("Applying couple-centric schema migration...");

  await conn.execute("ALTER TABLE `medical_intake` MODIFY COLUMN `leadId` int");
  console.log("✓ medical_intake.leadId made nullable");

  await conn.execute("ALTER TABLE `leads` ADD COLUMN IF NOT EXISTS `partnerId` int");
  console.log("✓ leads.partnerId added");

  await conn.execute("ALTER TABLE `medical_intake` ADD COLUMN IF NOT EXISTS `patientId` int");
  console.log("✓ medical_intake.patientId added");

  await conn.execute("ALTER TABLE `patients` ADD COLUMN IF NOT EXISTS `partnerId` int");
  console.log("✓ patients.partnerId added");

  // Add unique constraint on patientId if not exists
  try {
    await conn.execute("ALTER TABLE `medical_intake` ADD CONSTRAINT `medical_intake_patientId_unique` UNIQUE(`patientId`)");
    console.log("✓ medical_intake.patientId unique constraint added");
  } catch (e) {
    if (e.code === "ER_DUP_KEYNAME") {
      console.log("~ medical_intake.patientId unique constraint already exists");
    } else throw e;
  }

  console.log("\n✅ Couple-centric migration complete.");
} catch (err) {
  console.error("Migration error:", err.message);
  process.exit(1);
} finally {
  await conn.end();
}
