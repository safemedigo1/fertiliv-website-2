export type ParsedMysqlDatabaseUrl = {
  url: string;
  ssl?: { rejectUnauthorized: true };
};

/**
 * mysql2 treats a JSON value supplied as `?ssl={...}` as the name of a
 * built-in SSL profile. Convert that Manus/TiDB URL form into mysql2's
 * explicit TLS option while preserving every other query parameter.
 */
export function parseMysqlDatabaseUrl(databaseUrl: string): ParsedMysqlDatabaseUrl {
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is invalid");
  }

  const usesExplicitSsl = parsed.searchParams.has("ssl");
  parsed.searchParams.delete("ssl");

  return {
    url: parsed.toString(),
    ...(usesExplicitSsl ? { ssl: { rejectUnauthorized: true as const } } : {}),
  };
}

export function mysqlConnectionOptions(databaseUrl: string) {
  const parsed = parseMysqlDatabaseUrl(databaseUrl);
  return {
    uri: parsed.url,
    ...(parsed.ssl ? { ssl: parsed.ssl } : {}),
  };
}

const SUPABASE_PROJECT_REF = "ozhmiyiperltopgfjmbz";

/** Live TiDB URL used only by the one-time copy. Never sent to Vercel. */
export function tidbDatabaseUrl(): string | null {
  const explicit = process.env.TIDB_DATABASE_URL?.trim();
  if (explicit) return explicit;
  const current = process.env.DATABASE_URL?.trim() ?? "";
  return current.startsWith("mysql") ? current : null;
}

/**
 * App database. A postgres DATABASE_URL wins. Otherwise the Supabase
 * password and pooler host are assembled on the server and never logged.
 */
export function appDatabaseUrl(): string | null {
  const configured = process.env.DATABASE_URL?.trim() ?? "";
  if (configured.startsWith("postgres")) return configured;
  const password = process.env.DATABASE_PASSWORD?.trim();
  if (!password) return null;
  const host = process.env.SUPABASE_DB_HOST?.trim() || "aws-0-eu-west-1.pooler.supabase.com";
  const port = process.env.SUPABASE_DB_PORT?.trim() || "6543";
  const user = process.env.SUPABASE_DB_USER?.trim() || `postgres.${SUPABASE_PROJECT_REF}`;
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
}

/** Session pooler for migrations and the one-time copy. Transaction mode cannot set session flags. */
export function migrationDatabaseUrl(): string | null {
  const runtime = appDatabaseUrl();
  if (!runtime) return null;
  const url = new URL(runtime);
  url.port = "5432";
  return url.toString();
}
