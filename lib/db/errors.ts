export class RepositoryError extends Error {
  constructor(
    public readonly code: string,
    public readonly operation: string,
  ) {
    super(`Database operation failed (${operation}; ${code})`);
    this.name = "RepositoryError";
  }
}
const codes = new Set([
  "23505",
  "23503",
  "23514",
  "40001",
  "40P01",
  "23502",
  "42501",
]);
export function safeDatabaseError(
  error: unknown,
  operation: string,
): RepositoryError {
  if (error instanceof RepositoryError) return error;
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  return new RepositoryError(
    codes.has(code) ? code : "DB_UNAVAILABLE",
    operation,
  );
}
