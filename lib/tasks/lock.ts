import { getPool } from "@/lib/db/pool";
export const WORKFLOW_LOCK = 7276040906;
export async function withWorkflowLock<T>(fn: () => Promise<T>, timeoutMs = 20 * 60_000): Promise<T> {
  const c = await getPool().connect();
  let acquired = false;
  const lost = () => { console.error("WORKFLOW_LOCK_CONNECTION_LOST"); process.exit(75); };
  c.on("error", lost);
  try {
    const deadline = Date.now() + timeoutMs;
    do {
      acquired = (await c.query("SELECT pg_try_advisory_lock($1) AS acquired", [WORKFLOW_LOCK])).rows[0].acquired;
      if (acquired) break;
      if (Date.now() >= deadline) throw new Error("WORKFLOW_LOCK_TIMEOUT");
      await new Promise(r => setTimeout(r, 200));
    } while (true);
    return await fn();
  } finally {
    try { if (acquired) await c.query("SELECT pg_advisory_unlock($1)", [WORKFLOW_LOCK]); }
    finally { c.removeListener("error", lost); c.release(); }
  }
}
