import type { PoolClient } from "pg";
import { getPool } from "./pool";
import { safeDatabaseError } from "./errors";
export async function transaction<T>(
  operation: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  let client: PoolClient | undefined;
  try {
    client = await getPool().connect();
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } catch {
        client.release(true);
        client = undefined;
      }
    }
    throw safeDatabaseError(error, operation);
  } finally {
    client?.release();
  }
}
