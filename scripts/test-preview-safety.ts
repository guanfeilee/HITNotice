import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { sources } from "@/lib/sources";

// Runs only a local built Next.js server, with no database, email or API secrets.
async function main() {
  const reserve = createServer();
  reserve.listen(0, "127.0.0.1"); await once(reserve, "listening");
  const address = reserve.address(); assert.ok(address && typeof address !== "string");
  const port = address.port; await new Promise<void>(resolve => reserve.close(() => resolve()));
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    stdio: "ignore",
    env: { PATH: process.env.PATH, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" }
  });
  const base = `http://127.0.0.1:${port}`;
  const get = (path: string) => fetch(base + path, { signal: AbortSignal.timeout(5000) });
  const post = (path: string, body: unknown) => fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try { if ((await get("/")).status === 200) { ready = true; break; } } catch { /* startup */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready);
    assert.equal((await get("/sources")).status, 200);
    assert.equal((await get("/admin/notices-check")).status, 404);
    const valid = { email: "preview-fixture@example.invalid", frequency: "weekday_digest", sourceIds: [sources.find(s => s.enabled)!.id] };
    for (const [path, body] of [["/api/subscribe", valid], ["/api/unsubscribe", { token: "fixture-only-token" }]] as const) {
      const response = await post(path, body); assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { ok: false, error: "服务暂时不可用，请稍后重试。" });
    }
    assert.equal((await post("/api/webhooks/resend", {})).status, 410);
    console.log("Preview safety PASS: static pages available, missing API config fails closed, webhook 410; no production credentials");
  } finally {
    if (child.exitCode === null) { const exited = once(child, "exit"); child.kill("SIGTERM"); await exited; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
