import { describe, expect, it } from "vitest";
import { mysqlConnectionOptions, parseMysqlDatabaseUrl } from "./databaseUrl";

describe("Manus/TiDB DATABASE_URL parsing", () => {
  it("removes the JSON ssl query parameter and supplies verified TLS explicitly", () => {
    const input = 'mysql://db-user:p%40ss@tidb.example.com:4000/fertiliv?ssl={"rejectUnauthorized":true}&connectTimeout=10000';
    const parsed = parseMysqlDatabaseUrl(input);
    const output = new URL(parsed.url);

    expect(output.searchParams.has("ssl")).toBe(false);
    expect(output.searchParams.get("connectTimeout")).toBe("10000");
    expect(output.username).toBe("db-user");
    expect(output.password).toBe("p%40ss");
    expect(output.hostname).toBe("tidb.example.com");
    expect(parsed.ssl).toEqual({ rejectUnauthorized: true });
  });

  it("keeps local non-SSL URLs compatible", () => {
    const options = mysqlConnectionOptions("mysql://root:password@127.0.0.1:3306/fertiliv");
    expect(options.uri).toBe("mysql://root:password@127.0.0.1:3306/fertiliv");
    expect(options).not.toHaveProperty("ssl");
  });

  it("preserves ordinary URL query parameters", () => {
    const parsed = parseMysqlDatabaseUrl("mysql://user:pass@db.example/fertiliv?connectTimeout=5000&charset=utf8mb4");
    const output = new URL(parsed.url);
    expect(output.searchParams.get("connectTimeout")).toBe("5000");
    expect(output.searchParams.get("charset")).toBe("utf8mb4");
  });

  it("does not leak credentials when reporting an invalid URL", () => {
    expect(() => parseMysqlDatabaseUrl("not a database url with password=secret"))
      .toThrow("DATABASE_URL is invalid");
  });
});
