import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { createInternalApiServer } from "@/lib/internal-api/server";
import { sources } from "@/lib/sources";

async function main() {
  const secret = "local-integration-only-signing-secret-long-enough";
  const calls = { subscribe: 0, unsubscribe: 0, admin: 0 };
  let failSubscribe = false;
  const api = createInternalApiServer({
    secret, release: "local-fixture", checkDatabase: async () => true,
    subscribe: async () => { calls.subscribe++; return failSubscribe ? { status: 500, body: { error: secret } } : { status: 200, body: { ok: true } }; },
    unsubscribe: async body => { calls.unsubscribe++; return body.token === "missing-fixture" ? { status: 404, body: { ok: false } } : { status: 200, body: { ok: true } }; },
    getAdminNotices: async () => { calls.admin++; return { selectedSource: "", notices: [{ title: "Integration fixture", url: "https://example.invalid/notice", source_name: "Fixture" }] }; }
  });
  api.listen(0, "127.0.0.1"); await once(api, "listening");
  const apiAddress = api.address(); assert.ok(apiAddress && typeof apiAddress !== "string");
  const reserve = createServer(); reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
  const address = reserve.address(); assert.ok(address && typeof address !== "string");
  const port = address.port; await new Promise<void>(resolve => reserve.close(() => resolve()));
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    stdio: "ignore",
    env: { PATH: process.env.PATH, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", HITNOTICE_ECS_API_BASE_URL: `http://127.0.0.1:${apiAddress.port}`, HITNOTICE_INTERNAL_API_SECRET: secret, ADMIN_CHECK_TOKEN: "integration-admin-fixture" }
  });
  const base = `http://127.0.0.1:${port}`;
  const get = (p: string) => fetch(base + p, { signal: AbortSignal.timeout(5000) });
  const post = (p: string, body: unknown) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try { if ((await get("/")).status === 200) { ready = true; break; } } catch { /* local startup */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, "Local Next server did not start");
    const valid = { email: "fixture@example.invalid", frequency: "weekday_digest", sourceIds: [sources.find(s => s.enabled)!.id] };
    assert.equal((await post("/api/subscribe", { ...valid, email: "invalid" })).status, 400); assert.equal(calls.subscribe, 0);
    const subscribed = await post("/api/subscribe", valid); assert.equal(subscribed.status, 200); assert.deepEqual(await subscribed.json(), { ok: true }); assert.equal(calls.subscribe, 1);
    failSubscribe = true;
    const failed = await post("/api/subscribe", valid); assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes(secret)); assert.equal(calls.subscribe, 2);
    assert.equal((await post("/api/unsubscribe", { token: "" })).status, 400); assert.equal(calls.unsubscribe, 0);
    for (let i = 0; i < 2; i++) assert.equal((await post("/api/unsubscribe", { token: "valid-fixture" })).status, 200);
    assert.equal((await post("/api/unsubscribe", { token: "missing-fixture" })).status, 404);
    assert.equal((await get("/admin/notices-check?token=wrong-fixture")).status, 404); assert.equal(calls.admin, 0);
    const admin = await get("/admin/notices-check?token=integration-admin-fixture"); assert.equal(admin.status, 200); assert.ok((await admin.text()).includes("Integration fixture")); assert.equal(calls.admin, 1);
    const before = { ...calls };
    assert.equal((await post("/api/webhooks/resend", {})).status, 410); assert.deepEqual(calls, before);
    console.log("Built Next.js proxy integration passed: local signed API only, no database or email credentials");
  } finally {
    if (child.exitCode === null) { const exited = once(child, "exit"); child.kill("SIGTERM"); await exited; }
    api.closeAllConnections(); await new Promise<void>(resolve => api.close(() => resolve()));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
