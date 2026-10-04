import { createConnection } from "mysql2/promise";
import bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await createConnection(process.env.DATABASE_URL);

const [rows] = await conn.execute("SELECT email, passwordHash, loginMethod FROM users LIMIT 15");

console.log("\n=== User Password Hash Check ===");
for (const row of rows) {
  const hasHash = !!row.passwordHash;
  const hashPreview = hasHash ? row.passwordHash.substring(0, 20) + "..." : "NULL";
  
  // Test a known password
  let valid = false;
  if (hasHash) {
    const testPasswords = ["Admin@1234", "Doctor@1234", "Staff@1234", "Patient@1234"];
    for (const pw of testPasswords) {
      const ok = await bcrypt.compare(pw, row.passwordHash);
      if (ok) { valid = true; break; }
    }
  }
  
  console.log(`${row.email} | method=${row.loginMethod} | hash=${hashPreview} | bcrypt_valid=${valid}`);
}

await conn.end();
