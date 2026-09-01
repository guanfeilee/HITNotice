import { loadEnvConfig } from "@next/env";
import { createInternalApiServer } from "@/lib/internal-api/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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
  checkDatabase: async () => {
    const { client } = createSupabaseAdminClient();
    if (!client) return false;
    const { error } = await client.from("notices").select("id", { head: true, count: "planned" }).limit(0);
    return !error;
  },
  subscribe,
  unsubscribe,
  getAdminNotices: async (source) => getAdminNotices(source)
});

server.listen(port, "127.0.0.1", () => {
  console.log(JSON.stringify({ event: "ecs_api_started", host: "127.0.0.1", port }));
});

function shutdown(signal: string) {
  console.log(JSON.stringify({ event: "ecs_api_stopping", signal }));
  server.close((error) => {
    process.exitCode = error ? 1 : 0;
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
