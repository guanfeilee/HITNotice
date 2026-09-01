import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { verifyInternalApiSignature } from "@/lib/internal-api/protocol";

const maxBodyBytes = 16 * 1024;
const requestTimeoutMs = 10_000;
const nonceTtlMs = 5 * 60 * 1000;

type JsonResult = { status: number; body: Record<string, unknown> };

export type InternalApiDependencies = {
  secret: string;
  release: string;
  checkDatabase: () => Promise<boolean>;
  subscribe: (body: Record<string, unknown>) => Promise<JsonResult>;
  unsubscribe: (body: Record<string, unknown>) => Promise<JsonResult>;
  getAdminNotices: (source: string | null) => Promise<{ selectedSource: string; notices: Array<Record<string, unknown>> }>;
  now?: () => Date;
};

function json(response: ServerResponse, status: number, body: Record<string, unknown>) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(payload);
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new Error("body_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseObject(body: string) {
  const parsed = JSON.parse(body) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid_json");
  return parsed as Record<string, unknown>;
}

export function createInternalApiServer(dependencies: InternalApiDependencies) {
  const usedNonces = new Map<string, number>();
  const rateBuckets = new Map<string, { start: number; count: number }>();
  const now = dependencies.now ?? (() => new Date());

  function prune(current: number) {
    for (const [nonce, expires] of usedNonces) if (expires <= current) usedNonces.delete(nonce);
    for (const [key, bucket] of rateBuckets) if (current - bucket.start >= 60_000) rateBuckets.delete(key);
  }

  function rateAllowed(path: string, clientId: string, current: number) {
    const limit = path === "/internal/subscribe" ? 20 : path === "/internal/unsubscribe" ? 30 : 120;
    const key = `${path}:${clientId}`;
    const bucket = rateBuckets.get(key);
    if (!bucket || current - bucket.start >= 60_000) {
      rateBuckets.set(key, { start: current, count: 1 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }

  return createServer(async (request, response) => {
    const startedAt = Date.now();
    request.setTimeout(requestTimeoutMs, () => request.destroy(new Error("request_timeout")));
    const method = request.method?.toUpperCase() ?? "GET";
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = `${url.pathname}${url.search}`;
    const pathname = url.pathname;
    let status = 500;

    try {
      const declaredLength = Number(request.headers["content-length"] ?? "0");
      if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
        status = 413;
        return json(response, status, { ok: false, error: "Request body too large" });
      }
      const rawBody = await readBody(request);
      const headers = new Headers();
      for (const [name, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
        else if (value !== undefined) headers.set(name, value);
      }
      const verification = verifyInternalApiSignature({
        secret: dependencies.secret,
        method,
        path,
        body: rawBody,
        headers,
        now: now()
      });
      if (!verification.ok) {
        status = 401;
        return json(response, status, { ok: false, error: "Unauthorized" });
      }

      const current = now().getTime();
      prune(current);
      if (usedNonces.has(verification.nonce)) {
        status = 409;
        return json(response, status, { ok: false, error: "Replay rejected" });
      }
      usedNonces.set(verification.nonce, current + nonceTtlMs);
      if (!rateAllowed(pathname, verification.clientId, current)) {
        status = 429;
        return json(response, status, { ok: false, error: "Too many requests" });
      }

      if (method === "GET" && pathname === "/internal/health") {
        const databaseAvailable = await dependencies.checkDatabase().catch(() => false);
        status = databaseAvailable ? 200 : 503;
        return json(response, status, {
          status: databaseAvailable ? "ok" : "degraded",
          version: dependencies.release,
          database: databaseAvailable ? "available" : "unavailable",
          timestamp: now().toISOString()
        });
      }
      if (method === "POST" && pathname === "/internal/subscribe") {
        const result = await dependencies.subscribe(parseObject(rawBody));
        status = result.status;
        return json(response, status, result.body);
      }
      if (method === "POST" && pathname === "/internal/unsubscribe") {
        const result = await dependencies.unsubscribe(parseObject(rawBody));
        status = result.status;
        return json(response, status, result.body);
      }
      if (method === "GET" && pathname === "/internal/admin/notices") {
        const result = await dependencies.getAdminNotices(url.searchParams.get("source"));
        status = 200;
        return json(response, status, { ok: true, ...result });
      }
      status = 404;
      return json(response, status, { ok: false, error: "Not found" });
    } catch (error) {
      if (error instanceof Error && error.message === "body_too_large") status = 413;
      else if (error instanceof SyntaxError || (error instanceof Error && error.message === "invalid_json")) status = 400;
      else status = 500;
      return json(response, status, { ok: false, error: status === 400 ? "Invalid JSON" : status === 413 ? "Request body too large" : "Internal service error" });
    } finally {
      console.log(JSON.stringify({ method, path: pathname, status, duration_ms: Date.now() - startedAt }));
    }
  });
}
