import { Pool, types, type QueryResultRow } from "pg";
import { RepositoryError, safeDatabaseError } from "./errors";
// Preserve PostgreSQL microseconds as ISO UTC strings, rather than lossy JS Dates.
types.setTypeParser(1184, (value) =>
  value.replace(" ", "T").replace(/\+00(?::00)?$/, "Z"),
);
let pool: Pool | undefined;
export function getPool(): Pool {
  if (typeof window !== "undefined")
    throw new RepositoryError("SERVER_ONLY", "configure");
  if (!pool) {
    if (!process.env.DATABASE_URL)
      throw new RepositoryError("DATABASE_URL_MISSING", "configure");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      allowExitOnIdle: true,
      options:
        "-c timezone=UTC -c statement_timeout=15000 -c lock_timeout=5000 -c search_path=public",
    });
    pool.on("error", () => console.error("Database idle connection error"));
  }
  return pool;
}
export async function query<R extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
  operation = "query",
) {
  try {
    return await getPool().query<R>(sql, values);
  } catch (error) {
    throw safeDatabaseError(error, operation);
  }
}
export async function closePool() {
  const current = pool;
  pool = undefined;
  await current?.end();
}
export async function checkDatabase() {
  await query("SELECT id FROM notices LIMIT 0", [], "health");
}
