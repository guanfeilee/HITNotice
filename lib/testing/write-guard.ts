export function assertDatabaseWriteTestAllowed(
  env: Record<string, string | undefined>,
) {
  if (
    env.NODE_ENV !== "test" ||
    env.VERCEL_ENV === "production" ||
    env.ALLOW_TEST_DATABASE_RESET !== "1"
  )
    throw new Error(
      "Database tests require NODE_ENV=test and ALLOW_TEST_DATABASE_RESET=1.",
    );
  try {
    const url = new URL(env.DATABASE_URL ?? "");
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
      !/^hitnotice_test(?:_[a-z0-9_]+)?$/.test(url.pathname.slice(1)) ||
      url.search
    )
      throw new Error();
  } catch {
    throw new Error(
      "Database tests require a loopback hitnotice_test database without connection overrides.",
    );
  }
}

export function assertExternalServiceTestAllowed(
  env: Record<string, string | undefined>,
) {
  if (
    env.NODE_ENV === "production" ||
    env.VERCEL_ENV === "production" ||
    env.ALLOW_EXTERNAL_SERVICE_TEST !== "1"
  ) {
    throw new Error(
      "External service tests are disabled; use offline dry-run or an explicitly opted-in test environment.",
    );
  }
}
