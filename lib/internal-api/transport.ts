import { createSignedInternalApiHeaders } from "./protocol";

export type InternalApiResult<T = Record<string, unknown>> = { status: number; body: T };
export type InternalApiRequest = {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  clientId?: string;
  timeoutMs?: number;
};
export type InternalApiRequester = <T extends Record<string, unknown>>(params: InternalApiRequest) => Promise<InternalApiResult<T>>;
const unavailable = "服务暂时不可用，请稍后重试。";
const routes = new Map([
  ["/internal/subscribe", "POST"], ["/internal/unsubscribe", "POST"],
  ["/internal/admin/notices", "GET"], ["/internal/health", "GET"]
]);

export function validateInternalApiBaseUrl(value: string) {
  const url = new URL(value);
  const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Invalid internal API configuration");
  }
  return url;
}

export function parseAdminNotices(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (body.ok !== true || typeof body.selectedSource !== "string" || !Array.isArray(body.notices) || body.notices.length > 200) return null;
  const notices: Array<{ title: string; url: string; source_name: string }> = [];
  for (const item of body.notices) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (typeof row.title !== "string" || typeof row.url !== "string" || typeof row.source_name !== "string") return null;
    try { if (!["https:", "http:"].includes(new URL(row.url).protocol)) return null; } catch { return null; }
    notices.push({ title: row.title, url: row.url, source_name: row.source_name });
  }
  return { ok: true, selectedSource: body.selectedSource, notices };
}

function successBody(path: string, body: Record<string, unknown>) {
  if (path === "/internal/admin/notices") return parseAdminNotices(body);
  if (path === "/internal/health") {
    if (body.status !== "ok" || body.database !== "available" || typeof body.version !== "string" || typeof body.timestamp !== "string") return null;
    return { status: "ok", database: "available", version: body.version, timestamp: body.timestamp };
  }
  return body.ok === true ? { ok: true } : null;
}

async function readResponse(response: Response) {
  if (!response.body) throw new Error("Missing response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024 * 1024) throw new Error("Response too large");
      chunks.push(value);
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

// One attempt, including POST. A lost response must never trigger a blind mutation retry.
export function createInternalApiClient(
  config: () => { baseUrl?: string; secret?: string },
  fetcher: typeof fetch = fetch
): InternalApiRequester {
  return async <T extends Record<string, unknown>>(params: InternalApiRequest): Promise<InternalApiResult<T>> => {
    const failure = (status = 503, error = unavailable) => ({ status, body: { ok: false, error } as unknown as T });
    const diagnostic = (category: string, details: Record<string, string | number | boolean> = {}) =>
      console.error(JSON.stringify({ event: "internal_api_request_failed", category, ...details }));
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const { baseUrl, secret } = config();
      if (!baseUrl || !secret || secret.length < 32) {
        diagnostic("configuration", { baseConfigured: !!baseUrl, secretConfigured: !!secret, secretLongEnough: !!secret && secret.length >= 32 });
        return failure();
      }
      const base = validateInternalApiBaseUrl(baseUrl);
      const url = new URL(params.path, base);
      const method = params.method ?? "GET";
      if (url.origin !== base.origin || !params.path.startsWith("/internal/") || routes.get(url.pathname) !== method || url.hash) return failure();
      const body = params.body === undefined ? "" : JSON.stringify(params.body);
      if (Buffer.byteLength(body) > 16 * 1024) return failure(413, "请求体过大。");
      const timeoutMs = params.timeoutMs ?? 8000;
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) return failure();
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Request timed out")); }, timeoutMs);
      });
      const result = await Promise.race([deadline, (async () => {
        const response = await fetcher(url, {
          method, redirect: "manual", cache: "no-store", signal: controller.signal,
          headers: { ...createSignedInternalApiHeaders({ secret, method, path: url.pathname + url.search, body, clientId: params.clientId ?? "vercel" }), Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
          body: body || undefined
        });
        if (!response.ok) {
          diagnostic("upstream_status", { status: response.status });
          void response.body?.cancel().catch(() => {});
          if (response.status === 400) return failure(400, url.pathname === "/internal/unsubscribe" ? "无效的取消订阅链接。" : "请求信息无效，请检查后重试。");
          if (response.status === 404 && url.pathname === "/internal/unsubscribe") return failure(404, "无效的取消订阅链接。");
          if (response.status === 413) return failure(413, "请求体过大。");
          if (response.status === 429) return failure(429, "请求过于频繁，请稍后重试。");
          return failure();
        }
        const decoded: unknown = await readResponse(response);
        if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return failure(502);
        const safe = successBody(url.pathname, decoded as Record<string, unknown>);
        return safe ? { status: 200, body: safe as unknown as T } : failure(502);
      })()]);
      return result;
    } catch (error) {
      const cause = error && typeof error === "object" && "cause" in error ? error.cause : undefined;
      const code = cause && typeof cause === "object" && "code" in cause ? cause.code : undefined;
      const name = error instanceof Error ? error.name : "Unknown";
      diagnostic("request_exception", {
        name: ["Error", "TypeError", "RangeError", "SyntaxError", "AbortError", "TimeoutError"].includes(name) ? name : "Unknown",
        code: typeof code === "string" && ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH", "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET"].includes(code) ? code : "UNAVAILABLE"
      });
      return failure();
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  };
}
