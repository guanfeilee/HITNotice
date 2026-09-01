import "server-only";
import { createSignedInternalApiHeaders } from "@/lib/internal-api/protocol";

const defaultTimeoutMs = 8000;

type InternalApiResult<T> = {
  status: number;
  body: T;
};

function getInternalApiConfig() {
  const baseUrl = process.env.HITNOTICE_ECS_API_BASE_URL;
  const secret = process.env.HITNOTICE_INTERNAL_API_SECRET;
  if (!baseUrl || !secret) {
    throw new Error("Internal API is not configured");
  }
  return { baseUrl, secret };
}

function safeJson(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "上游服务返回了无效响应。" };
  }
  return value as Record<string, unknown>;
}

export async function requestInternalApi<T extends Record<string, unknown>>(params: {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  clientId?: string;
  timeoutMs?: number;
}): Promise<InternalApiResult<T>> {
  const { baseUrl, secret } = getInternalApiConfig();
  const method = params.method ?? "GET";
  const body = params.body === undefined ? "" : JSON.stringify(params.body);
  const url = new URL(params.path, baseUrl);
  const path = `${url.pathname}${url.search}`;
  const signedHeaders = createSignedInternalApiHeaders({
    secret,
    method,
    path,
    body,
    clientId: params.clientId ?? "vercel"
  });

  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...signedHeaders,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      body: body || undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(params.timeoutMs ?? defaultTimeoutMs)
    });
    const parsed = safeJson(await response.json().catch(() => null));
    return { status: response.status, body: parsed as T };
  } catch {
    return {
      status: 503,
      body: { ok: false, error: "服务暂时不可用，请稍后重试。" } as unknown as T
    };
  }
}
