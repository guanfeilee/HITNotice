import assert from "node:assert/strict";
import { once } from "node:events";
import { createInternalApiServer } from "@/lib/internal-api/server";
import { createSignedInternalApiHeaders } from "@/lib/internal-api/protocol";

const secret = "test-secret-that-is-longer-than-thirty-two-characters";
const fixedNow = new Date("2026-09-01T08:00:00.000Z");

async function main() {
  const server = createInternalApiServer({
    secret,
    release: "test-commit",
    now: () => fixedNow,
    checkDatabase: async () => true,
    subscribe: async () => ({ status: 200, body: { ok: true } }),
    unsubscribe: async () => ({ status: 200, body: { ok: true } }),
    getAdminNotices: async () => ({ selectedSource: "", notices: [] })
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  const base = `http://127.0.0.1:${address.port}`;

  async function signedFetch(path: string, options: { method?: string; body?: string; now?: Date; nonce?: string; clientId?: string } = {}) {
    const method = options.method ?? "GET";
    const body = options.body ?? "";
    return fetch(`${base}${path}`, {
      method,
      headers: {
        ...createSignedInternalApiHeaders({
          secret,
          method,
          path,
          body,
          now: options.now ?? fixedNow,
          nonce: options.nonce,
          clientId: options.clientId
        }),
        ...(body ? { "content-type": "application/json" } : {})
      },
      body: body || undefined
    });
  }

  const unsigned = await fetch(`${base}/internal/health`);
  assert.equal(unsigned.status, 401);

  const expired = await signedFetch("/internal/health", { now: new Date(fixedNow.getTime() - 6 * 60 * 1000) });
  assert.equal(expired.status, 401);

  const future = await signedFetch("/internal/health", { now: new Date(fixedNow.getTime() + 6 * 60 * 1000) });
  assert.equal(future.status, 401);
  const malformed = await signedFetch("/internal/subscribe", { method: "POST", body: "null" });
  assert.equal(malformed.status, 400);
  const admin = await signedFetch("/internal/admin/notices");
  assert.equal(admin.status, 200);

  const originalBody = JSON.stringify({ email: "masked@example.invalid" });
  const tamperedHeaders = createSignedInternalApiHeaders({ secret, method: "POST", path: "/internal/subscribe", body: originalBody, now: fixedNow });
  const tampered = await fetch(`${base}/internal/subscribe`, {
    method: "POST",
    headers: { ...tamperedHeaders, "content-type": "application/json" },
    body: JSON.stringify({ email: "changed@example.invalid" })
  });
  assert.equal(tampered.status, 401);

  const nonce = "unique-test-nonce";
  const health = await signedFetch("/internal/health", { nonce });
  assert.equal(health.status, 200);
  const healthBody = await health.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(healthBody).sort(), ["database", "status", "timestamp", "version"]);
  assert.equal(JSON.stringify(healthBody).includes("secret"), false);

  const replay = await signedFetch("/internal/health", { nonce });
  assert.equal(replay.status, 409);

  const validBody = JSON.stringify({ email: "masked@example.invalid", frequency: "weekday_digest", sourceIds: ["today"] });
  const valid = await signedFetch("/internal/subscribe", { method: "POST", body: validBody });
  assert.equal(valid.status, 200);

  const oversizedBody = JSON.stringify({ payload: "x".repeat(16 * 1024) });
  const oversized = await signedFetch("/internal/subscribe", {
    method: "POST",
    body: oversizedBody,
    clientId: "body-limit-test"
  });
  assert.equal(oversized.status, 413);

  for (let index = 0; index < 20; index += 1) {
    const allowed = await signedFetch("/internal/subscribe", {
      method: "POST",
      body: validBody,
      clientId: "rate-limit-test",
      nonce: `rate-limit-${index}`
    });
    assert.equal(allowed.status, 200);
  }
  const rateLimited = await signedFetch("/internal/subscribe", {
    method: "POST",
    body: validBody,
    clientId: "rate-limit-test",
    nonce: "rate-limit-blocked"
  });
  assert.equal(rateLimited.status, 429);

  server.close();
  await once(server, "close");
  console.log("internal API security tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
