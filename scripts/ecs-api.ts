import { loadEnvConfig } from "@next/env";
import { createInternalApiServer } from "@/lib/internal-api/server";
import { checkDatabase, closePool, query } from "@/lib/db/pool";
import { cutoverClientId, cutoverTestEmail, productionWriteMode } from "@/lib/internal-api/write-mode";
import { subscribe, unsubscribe } from "@/lib/subscriptions/service";
import { getAdminNotices } from "@/lib/admin/notices-service";

loadEnvConfig(process.cwd());

const secret = process.env.HITNOTICE_INTERNAL_API_SECRET;
if (!secret || secret.length < 32) throw new Error("HITNOTICE_INTERNAL_API_SECRET must be at least 32 characters");
const port = Number(process.env.HITNOTICE_ECS_API_PORT ?? "3100");
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid HITNOTICE_ECS_API_PORT");

const server = createInternalApiServer({
  secret,
  release: process.env.HITNOTICE_RELEASE_COMMIT ?? "unknown",
  allowWrite: async (path, body, clientId) => {
    const mode = productionWriteMode();
    if (mode === "open") return true;
    if (mode !== "synthetic" || clientId !== cutoverClientId) return false;
    if (path === "/internal/subscribe") return body.email === cutoverTestEmail;
    if (typeof body.token !== "string") return false;
    const match = await query("SELECT 1 FROM subscriptions WHERE email=$1 AND unsubscribe_token=$2", [cutoverTestEmail, body.token]);
    return match.rowCount === 1;
  },
  checkDatabase: async () => { try { await checkDatabase(); return true; } catch { return false; } },
  subscribe,
  unsubscribe,
  getAdminNotices: async (source) => getAdminNotices(source)
});

server.listen(port, "127.0.0.1", () => {
  console.log(JSON.stringify({ event: "ecs_api_started", host: "127.0.0.1", port, writeMode: productionWriteMode(), release: process.env.HITNOTICE_RELEASE_COMMIT }));
});

function shutdown(signal: string) {
  console.log(JSON.stringify({ event: "ecs_api_stopping", signal }));
  server.close(async (error) => {
    try { await closePool(); process.exitCode = error ? 1 : 0; }
    catch { process.exitCode = 1; console.error("Database shutdown failed"); }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
