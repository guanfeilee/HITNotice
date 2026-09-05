import { createInternalApiClient, parseAdminNotices } from "./transport";

export async function checkEcsApi(env: Record<string, string | undefined>, fetcher: typeof fetch = fetch) {
  const call = createInternalApiClient(() => ({
    secret: env.HITNOTICE_INTERNAL_API_SECRET,
    baseUrl: env.HITNOTICE_ECS_API_CHECK_BASE_URL ?? `http://127.0.0.1:${env.HITNOTICE_ECS_API_PORT ?? "3100"}`
  }), fetcher);
  const health = await call({ path: "/internal/health", clientId: "ecs-readonly-check" });
  const healthOk = health.status === 200 && health.body.status === "ok" && health.body.database === "available";
  const results: Array<Record<string, unknown>> = [{ httpStatus: health.status, healthy: healthOk }];
  let ok = healthOk;
  if (env.HITNOTICE_ECS_API_CHECK_ADMIN === "true") {
    const admin = await call({ path: "/internal/admin/notices", clientId: "ecs-readonly-check" });
    const data = admin.status === 200 ? parseAdminNotices(admin.body) : null;
    results.push({ httpStatus: admin.status, ok: Boolean(data), noticeCount: data?.notices.length ?? null });
    ok = ok && Boolean(data);
  }
  return { ok, results };
}
