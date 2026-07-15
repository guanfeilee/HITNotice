import type { WechatApiErrorResponse } from "@/lib/wechat/types";

const WECHAT_API_BASE_URL = "https://api.weixin.qq.com/cgi-bin";

type WechatRequestOptions = {
  method?: "GET" | "POST";
  query?: Record<string, string>;
  body?: unknown;
  formData?: FormData;
};

export class WechatApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "WechatApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getWechatError(value: unknown): WechatApiErrorResponse | null {
  if (!isRecord(value) || typeof value.errcode !== "number") {
    return null;
  }

  return {
    errcode: value.errcode,
    errmsg: typeof value.errmsg === "string" ? value.errmsg : undefined
  };
}

export async function requestWechatApi<T>(path: string, options: WechatRequestOptions = {}): Promise<T> {
  if (options.body !== undefined && options.formData !== undefined) {
    throw new WechatApiError("Wechat API request cannot contain both JSON and multipart bodies");
  }

  const url = new URL(`${WECHAT_API_BASE_URL}/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: options.formData ?? (options.body === undefined ? undefined : JSON.stringify(options.body))
    });
  } catch (error) {
    throw new WechatApiError("Wechat API network request failed", undefined, { cause: error });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new WechatApiError(`Wechat API returned invalid JSON (HTTP ${response.status})`, undefined, {
      cause: error
    });
  }

  const apiError = getWechatError(payload);
  if (apiError && apiError.errcode !== 0) {
    throw new WechatApiError(
      `Wechat API error ${apiError.errcode}: ${apiError.errmsg ?? "Unknown error"}`,
      apiError.errcode
    );
  }

  if (!response.ok) {
    throw new WechatApiError(`Wechat API request failed (HTTP ${response.status})`);
  }

  if (!isRecord(payload)) {
    throw new WechatApiError("Wechat API returned an unexpected response");
  }

  return payload as T;
}
