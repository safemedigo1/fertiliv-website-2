import { defineConfig } from "drizzle-kit";
import { migrationDatabaseUrl } from "./server/databaseUrl";

const url = migrationDatabaseUrl();
if (!url) {
  throw new Error("A Postgres DATABASE_URL or DATABASE_PASSWORD is required");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/pg",
  dialect: "postgresql",
  dbCredentials: { url },
});
