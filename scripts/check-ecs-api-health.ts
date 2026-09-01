import {
  createSignedInternalApiHeaders,
} from "../lib/internal-api/protocol";

async function main() {
  const secret = process.env.HITNOTICE_INTERNAL_API_SECRET;
  const port = process.env.HITNOTICE_ECS_API_PORT ?? "3100";

  if (!secret) {
    throw new Error("HITNOTICE_INTERNAL_API_SECRET is not configured");
  }

  const path = "/internal/health";
  const headers = createSignedInternalApiHeaders({
    secret,
    method: "GET",
    path,
    body: "",
    clientId: "ecs-local-health-check",
  });

  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    headers,
  });
  const payload = await response.json();

  console.log(
    JSON.stringify({
      httpStatus: response.status,
      status: payload.status,
      database: payload.database,
      version: payload.version,
      hasTimestamp: typeof payload.timestamp === "string",
    }),
  );

  if (!response.ok || payload.status !== "ok" || payload.database !== "available") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "health check failed");
  process.exitCode = 1;
});
