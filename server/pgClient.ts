import postgres from "postgres";

/**
 * Postgres.js client for Supabase's transaction pooler.
 * Prepared statements stay off because transaction-mode pooling (port 6543)
 * does not keep a session between queries.
 *
 * MySQL callers read `insertId` and `affectedRows`. Inserts that omit RETURNING
 * get `RETURNING "id"` so those callers keep working after the dialect change.
 * The wrapper stays thenable and keeps `.values()`, because Drizzle calls that
 * method on the object returned by `unsafe()` before awaiting it.
 */
function attachMysqlShape(result: unknown) {
  if (!result || typeof result !== "object") return result;
  const rows = result as { id?: unknown; insertId?: number; affectedRows?: number; count?: number }[] & {
    insertId?: number;
    affectedRows?: number;
    count?: number;
  };
  const first = rows[0];
  if (first && typeof first === "object" && !Array.isArray(first) && first.id != null) {
    const numericId = Number(first.id);
    first.insertId = numericId;
    rows.insertId = numericId;
  }
  if (typeof rows.count === "number") {
    rows.affectedRows = rows.count;
    if (first && typeof first === "object" && !Array.isArray(first) && first.affectedRows == null) {
      first.affectedRows = rows.count;
    }
  }
  return result;
}

function missingIdColumn(error: unknown) {
  return /column ["']?id["']? does not exist/i.test(error instanceof Error ? error.message : String(error));
}

function patchClient(sql: postgres.Sql) {
  const marked = sql as postgres.Sql & { __fertilivPatched?: boolean };
  if (marked.__fertilivPatched) return sql;
  marked.__fertilivPatched = true;

  const originalUnsafe = sql.unsafe.bind(sql);
  sql.unsafe = ((query: string, parameters?: unknown[], queryOptions?: unknown) => {
    const isInsert = /^\s*insert\s+/i.test(query);
    const hasReturning = /\breturning\b/i.test(query);
    const executable = isInsert && !hasReturning ? `${query.replace(/;\s*$/, "")} RETURNING "id"` : query;
    const pending = originalUnsafe(executable, parameters as never[], queryOptions as never);
    const originalThen = pending.then.bind(pending);
    pending.then = ((onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
      return originalThen(
        (result: unknown) => {
          const shaped = attachMysqlShape(result);
          return onFulfilled ? onFulfilled(shaped) : shaped;
        },
        (error: unknown) => {
          if (!missingIdColumn(error) || executable === query) {
            return onRejected ? onRejected(error) : Promise.reject(error);
          }
          return originalUnsafe(query, parameters as never[], queryOptions as never).then(
            (result: unknown) => {
              const shaped = attachMysqlShape(result);
              return onFulfilled ? onFulfilled(shaped) : shaped;
            },
            onRejected,
          );
        },
      );
    }) as typeof pending.then;
    return pending;
  }) as postgres.Sql["unsafe"];

  if (typeof sql.begin === "function") {
    const originalBegin = sql.begin.bind(sql);
    sql.begin = (async (options: unknown, fn?: (tx: postgres.TransactionSql) => unknown) => {
      if (typeof options === "function") {
        return originalBegin(async (tx) => {
          patchClient(tx as unknown as postgres.Sql);
          return options(tx);
        });
      }
      return originalBegin(options as never, async (tx) => {
        patchClient(tx as unknown as postgres.Sql);
        return fn?.(tx);
      });
    }) as postgres.Sql["begin"];
  }

  return sql;
}

export function createPostgresClient(databaseUrl: string) {
  const sql = postgres(databaseUrl, {
    prepare: false,
    // Supavisor transaction mode drops pipelined queries and leaves the
    // backend waiting on ClientRead. One query in flight per connection.
    // The postgres patch keeps sql.begin working with this setting.
    max_pipeline: 0,
    max: 8,
    ssl: "require",
    connect_timeout: 15,
    idle_timeout: 20,
    connection: { application_name: "fertiliv" },
  });
  return patchClient(sql);
}
