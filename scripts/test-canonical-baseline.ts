import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createInternalApiClient, parseAdminNotices, validateInternalApiBaseUrl } from "@/lib/internal-api/transport";
import { verifyInternalApiSignature, internalApiHeaders } from "@/lib/internal-api/protocol";
import { handleInternalApiPost } from "@/lib/internal-api/proxy-handler";
import { loadAuthorizedAdminNotices } from "@/lib/internal-api/admin-loader";
import { checkEcsApi } from "@/lib/internal-api/health-check";
import { assertDatabaseWriteTestAllowed, assertExternalServiceTestAllowed } from "@/lib/testing/write-guard";
import { POST as retiredWebhook } from "@/app/api/webhooks/resend/route";
import { sources } from "@/lib/sources";

const fakeSecret = "canonical-unit-test-only-secret-32-characters";
const config = () => ({ baseUrl: "https://ecs.example.invalid", secret: fakeSecret });
const valid = { email: "fixture@example.invalid", frequency: "weekday_digest", sourceIds: [sources.find(s => s.enabled)!.id] };
const adminBody = { ok: true, selectedSource: "", notices: [{ title: "Fixture", url: "https://example.invalid/notice", source_name: "Fixture" }] };
let checks = 0;
async function test(name: string, run: () => unknown | Promise<unknown>) {
  await run(); checks += 1; console.log(`PASS ${name}`);
}
function stub(handler: (url: URL, init: RequestInit) => Response | Promise<Response>) {
  return (async (input, init) => handler(new URL(String(input)), init ?? {})) as typeof fetch;
}
function clientStatus(status: number, body: unknown = { ok: true }) {
  return createInternalApiClient(config, stub(() => Response.json(body, { status })));
}
function request(body: unknown) {
  return new Request("https://web.example.invalid/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}
async function main() {
  globalThis.fetch = stub(() => { throw new Error("Unexpected external network request"); });
  const { subscribe, unsubscribe } = await import("@/lib/subscriptions/service");
  await test("client signing binds method, path, timestamp, nonce and body", async () => {
    const nonces = new Set<string>();
    const call = createInternalApiClient(config, stub((url, init) => {
      const headers = new Headers(init.headers);
      assert.equal(verifyInternalApiSignature({ secret: fakeSecret, method: init.method!, path: url.pathname + url.search, body: String(init.body ?? ""), headers }).ok, true);
      assert.ok(Math.abs(Date.now() - Number(headers.get(internalApiHeaders.timestamp))) < 2000);
      nonces.add(headers.get(internalApiHeaders.nonce)!);
      assert.equal(init.redirect, "manual");
      assert.ok(init.signal);
      return Response.json({ ok: true, internalSecret: fakeSecret });
    }));
    for (let i = 0; i < 2; i++) assert.deepEqual(await call({ path: "/internal/subscribe", method: "POST", body: valid }), { status: 200, body: { ok: true } });
    assert.equal(nonces.size, 2);
  });
  await test("bad configuration and paths fail without network", async () => {
    let calls = 0;
    for (const baseUrl of ["http://public.example.invalid", "https://user:pass@example.invalid", "https://example.invalid/path", "bad url"]) {
      const call = createInternalApiClient(() => ({ baseUrl, secret: fakeSecret }), stub(() => { calls++; throw new Error(); }));
      assert.equal((await call({ path: "/internal/health" })).status, 503);
    }
    const call = createInternalApiClient(config, stub(() => { calls++; throw new Error(); }));
    for (const p of ["https://other.example.invalid/internal/health", "//other.example.invalid/internal/health", "/internal/../api/write", "/internal/webhook"]) assert.equal((await call({ path: p })).status, 503);
    assert.equal((await call({ path: "/internal/health", timeoutMs: Infinity })).status, 503);
    assert.equal(calls, 0);
    assert.equal(validateInternalApiBaseUrl("http://127.0.0.1:3100").hostname, "127.0.0.1");
  });
  await test("401,403,5xx and redirects are sanitized", async () => {
    for (const status of [401, 403, 500, 502, 503, 307]) {
      const result = await clientStatus(status, { error: fakeSecret })({ path: "/internal/subscribe", method: "POST", body: valid });
      assert.equal(result.status, 503); assert.ok(!JSON.stringify(result).includes(fakeSecret));
    }
  });
  await test("invalid successful responses fail closed", async () => {
    for (const body of [null, [], "invalid", {}, { ok: false, error: fakeSecret }]) assert.equal((await clientStatus(200, body)({ path: "/internal/subscribe", method: "POST" })).status, 502);
    const call = createInternalApiClient(config, stub(() => new Response("not-json")));
    assert.equal((await call({ path: "/internal/health" })).status, 503);
    const oversized = createInternalApiClient(config, stub(() => new Response("x".repeat(1024 * 1024 + 1))));
    assert.equal((await oversized({ path: "/internal/health" })).status, 503);
  });
  await test("timeout and network error make one POST attempt and expose no details", async () => {
    let calls = 0;
    const call = createInternalApiClient(config, stub((_url, init) => { calls++; assert.ok(init.signal); return new Promise<Response>(() => {}); }));
    const result = await call({ path: "/internal/subscribe", method: "POST", body: valid, timeoutMs: 5 });
    assert.equal(result.status, 503); assert.equal(calls, 1);
    const failed = createInternalApiClient(config, stub(() => { throw new Error(fakeSecret); }));
    assert.ok(!JSON.stringify(await failed({ path: "/internal/health" })).includes(fakeSecret));
  });
  await test("transport logs only allowlisted error classifications", async () => {
    const logs: string[] = [];
    const original = console.error;
    console.error = line => { logs.push(String(line)); };
    try {
      const sensitiveMarker = "DO_NOT_LOG_FIXTURE";
      const error = new Error(sensitiveMarker, { cause: { code: sensitiveMarker } });
      error.name = sensitiveMarker;
      const call = createInternalApiClient(config, stub(() => { throw error; }));
      assert.equal((await call({ path: "/internal/health" })).status, 503);
      assert.deepEqual(JSON.parse(logs[0]), { event: "internal_api_request_failed", category: "request_exception", name: "Unknown", code: "UNAVAILABLE" });
      const reset = createInternalApiClient(config, stub(() => { throw new TypeError(sensitiveMarker, { cause: { code: "ECONNRESET" } }); }));
      await reset({ path: "/internal/health" });
      assert.equal(JSON.parse(logs[1]).code, "ECONNRESET");
      assert.ok(!logs.join("").includes(sensitiveMarker));
      assert.ok(!logs.join("").includes(fakeSecret));
    } finally { console.error = original; }
  });
  await test("subscribe validation is shared, invalid input makes zero upstream calls", async () => {
    let calls = 0;
    const call = createInternalApiClient(config, stub(() => { calls++; return Response.json({ ok: true }); }));
    for (const body of [{ ...valid, email: "bad" }, { ...valid, frequency: "bad" }, { ...valid, sourceIds: [] }, { ...valid, sourceIds: ["unknown-source"] }, { ...valid, sourceIds: [1] }]) {
      assert.equal((await handleInternalApiPost(request(body), "/internal/subscribe", call)).status, 400);
      assert.equal((await subscribe(body)).status, 400);
    }
    assert.equal(calls, 0);
    assert.equal((await handleInternalApiPost(request(valid), "/internal/subscribe", call)).status, 200);
    assert.equal(calls, 1);
  });
  await test("subscribe upstream validation and server errors preserve safe contract", async () => {
    for (const [upstream, expected] of [[200, 200], [201, 200], [400, 400], [413, 413], [429, 429], [500, 503]]) {
      const response = await handleInternalApiPost(request(valid), "/internal/subscribe", clientStatus(upstream, upstream < 300 ? { ok: true } : { error: fakeSecret }));
      assert.equal(response.status, expected); assert.ok(!JSON.stringify(await response.json()).includes(fakeSecret));
    }
    const timeout = createInternalApiClient(config, stub(() => { throw new DOMException("Timeout", "TimeoutError"); }));
    assert.equal((await handleInternalApiPost(request(valid), "/internal/subscribe", timeout)).status, 503);
  });
  await test("proxy rejects malformed and oversized bodies", async () => {
    const call = clientStatus(200);
    assert.equal((await handleInternalApiPost(new Request("https://example.invalid", { method: "POST", body: "bad-json" }), "/internal/subscribe", call)).status, 400);
    assert.equal((await handleInternalApiPost(request({ data: "x".repeat(17000) }), "/internal/subscribe", call)).status, 413);
    assert.equal((await handleInternalApiPost(request(valid), "/wrong", call)).status, 404);
  });
  await test("unsubscribe token validation, repeated success, invalid token, server error and timeout", async () => {
    let calls = 0;
    const call = createInternalApiClient(config, stub(() => { calls++; return Response.json({ ok: true }); }));
    for (const token of [undefined, "", "  ", 42]) {
      assert.equal((await handleInternalApiPost(request({ token }), "/internal/unsubscribe", call)).status, 400);
      assert.equal((await unsubscribe({ token })).status, 400);
    }
    assert.equal(calls, 0);
    for (let i = 0; i < 2; i++) assert.equal((await handleInternalApiPost(request({ token: "fixture-token" }), "/internal/unsubscribe", call)).status, 200);
    for (const [upstream, expected] of [[404, 404], [400, 400], [500, 503]]) assert.equal((await handleInternalApiPost(request({ token: "fixture-token" }), "/internal/unsubscribe", clientStatus(upstream))).status, expected);
    const timeout = createInternalApiClient(config, stub(() => { throw new DOMException("Timeout", "TimeoutError"); }));
    assert.equal((await handleInternalApiPost(request({ token: "fixture-token" }), "/internal/unsubscribe", timeout)).status, 503);
  });
  await test("admin authorization happens before any ECS request", async () => {
    let calls = 0;
    const call = createInternalApiClient(config, stub(() => { calls++; return Response.json(adminBody); }));
    for (const candidate of [undefined, "wrong", "same-length-wrong"]) assert.equal((await loadAuthorizedAdminNotices(candidate, "", "fixture-admin", call)).authorized, false);
    assert.equal(calls, 0);
    const result = await loadAuthorizedAdminNotices("fixture-admin", "", "fixture-admin", call);
    assert.equal(result.authorized, true); assert.equal(calls, 1);
    if (result.authorized) assert.deepEqual(result.notices, adminBody.notices);
  });
  await test("admin rejects upstream unauthorized, errors and malformed notices", async () => {
    for (const status of [401, 403, 500]) await assert.rejects(() => loadAuthorizedAdminNotices("fixture", "", "fixture", clientStatus(status, { error: fakeSecret })), e => e instanceof Error && !e.message.includes(fakeSecret));
    for (const notices of [null, [null], [{ title: 3 }], [{ title: "x", source_name: "x", url: "javascript:alert(1)" }]]) {
      assert.equal(parseAdminNotices({ ...adminBody, notices }), null);
      await assert.rejects(() => loadAuthorizedAdminNotices("fixture", "", "fixture", clientStatus(200, { ...adminBody, notices })));
    }
  });
  await test("retired webhook returns 410 and performs no fetch", async () => {
    const previous = globalThis.fetch;
    globalThis.fetch = stub(() => { throw new Error("Unexpected network"); });
    try { assert.equal((await retiredWebhook(request({}))).status, 410); } finally { globalThis.fetch = previous; }
  });
  await test("release check supports public base and optional admin using signed GET only", async () => {
    const paths: string[] = [];
    const env = { HITNOTICE_INTERNAL_API_SECRET: fakeSecret, HITNOTICE_ECS_API_CHECK_BASE_URL: "https://ecs.example.invalid", HITNOTICE_ECS_API_CHECK_ADMIN: "true" };
    const fetcher = stub((url, init) => {
      paths.push(url.pathname); assert.equal(init.method, "GET");
      assert.equal(new Headers(init.headers).get(internalApiHeaders.clientId), "ecs-readonly-check");
      assert.equal(verifyInternalApiSignature({ secret: fakeSecret, method: "GET", path: url.pathname, body: "", headers: new Headers(init.headers) }).ok, true);
      return Response.json(url.pathname.endsWith("health") ? { status: "ok", database: "available", version: "fixture", timestamp: new Date().toISOString() } : adminBody);
    });
    const result = await checkEcsApi(env, fetcher); assert.equal(result.ok, true);
    assert.deepEqual(paths, ["/internal/health", "/internal/admin/notices"]);
    assert.ok(!JSON.stringify(result).includes("Fixture")); assert.ok(!JSON.stringify(result).includes(fakeSecret));
    paths.length = 0;
    assert.equal((await checkEcsApi({ ...env, HITNOTICE_ECS_API_CHECK_ADMIN: "false" }, fetcher)).ok, true);
    assert.equal(paths.length, 1);
    assert.equal((await checkEcsApi(env, stub(() => Response.json({ error: fakeSecret }, { status: 401 })))).ok, false);
  });
  await test("write tests fail closed for production and all remote databases", () => {
    const safe = { NODE_ENV:"test", ALLOW_TEST_DATABASE_RESET:"1", DATABASE_URL:"postgresql://fixture@127.0.0.1:55432/hitnotice_test" };
    for (const env of [{},{...safe,NODE_ENV:"production"},{...safe,VERCEL_ENV:"production"},{...safe,ALLOW_TEST_DATABASE_RESET:"0"},{...safe,DATABASE_URL:"postgresql://production.example.invalid/hitnotice_test"},{...safe,DATABASE_URL:"postgresql://localhost/hitnotice"}]) assert.throws(()=>assertDatabaseWriteTestAllowed(env));
    assert.doesNotThrow(()=>assertDatabaseWriteTestAllowed(safe));
    assert.throws(() => assertExternalServiceTestAllowed({}));
    assert.throws(() => assertExternalServiceTestAllowed({ NODE_ENV: "production", ALLOW_EXTERNAL_SERVICE_TEST: "1" }));
  });
  await test("entire app import graph has no direct Supabase or legacy webhook dependency", () => {
    const visited = new Set<string>();
    function visit(file: string) {
      if (visited.has(file)) return; visited.add(file);
      const source = readFileSync(file, "utf8");
      assert.ok(!/from [\'"]pg[\'"]|@\/lib\/db|DATABASE_URL|SUPABASE_SERVICE_ROLE_KEY|createSupabaseAdminClient|supabaseAdmin|rest\/v1|applyResendDeliveryEvent|@supabase\//.test(source), `Forbidden database dependency: ${file}`);
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      function scan(node: ts.Node) {
        let spec: string | undefined;
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) spec = node.moduleSpecifier.text;
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && ts.isStringLiteral(node.arguments[0])) spec = node.arguments[0].text;
        if (spec?.startsWith("@/") || spec?.startsWith(".")) {
          const base = spec.startsWith("@/") ? path.resolve(spec.slice(2)) : path.resolve(path.dirname(file), spec);
          const target = [base + ".ts", base + ".tsx", path.join(base, "index.ts"), path.join(base, "index.tsx")].find(existsSync);
          if (target) visit(target);
        }
        ts.forEachChild(node, scan);
      }
      scan(ast);
    }
    function walk(dir: string) { for (const entry of readdirSync(dir, { withFileTypes: true })) { const file = path.join(dir, entry.name); if (entry.isDirectory()) walk(file); else if (/\.tsx?$/.test(file)) visit(path.resolve(file)); } }
    walk("app");
    assert.ok(visited.size > 10);
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    assert.equal(pkg.scripts["send:delta"], undefined);
    assert.equal(existsSync("lib/digest/delta.ts"), false);
  });
  await test("all production modules and CLI entrypoints reject retired DB configuration", () => {
    function audit(dir: string) {
      for(const item of readdirSync(dir,{withFileTypes:true})) {
        const file=path.join(dir,item.name);
        if(item.isDirectory()) audit(file);
        else if(/\.tsx?$/.test(file) && !item.name.startsWith("test-"))
          assert.ok(!/supabase|rest\/v1|createClient/i.test(readFileSync(file,"utf8")),`Retired DB dependency: ${file}`);
      }
    }
    audit("lib");audit("app");audit("scripts");
    assert.equal(JSON.parse(readFileSync("package.json","utf8")).dependencies["@supabase/supabase-js"],undefined);
  });
  console.log(`Canonical baseline: ${checks} test groups passed; no production services used`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
