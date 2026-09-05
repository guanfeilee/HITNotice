export function assertDatabaseWriteTestAllowed(env: Record<string, string | undefined>) {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production" || env.ALLOW_DATABASE_WRITE_TEST !== "1") {
    throw new Error("Database write tests are disabled; use an explicitly opted-in local test database.");
  }
  try {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        !["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
  } catch { throw new Error("Database write tests require a loopback test database."); }
}

export function assertExternalServiceTestAllowed(env: Record<string, string | undefined>) {
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production" || env.ALLOW_EXTERNAL_SERVICE_TEST !== "1") {
    throw new Error("External service tests are disabled; use offline dry-run or an explicitly opted-in test environment.");
  }
}
