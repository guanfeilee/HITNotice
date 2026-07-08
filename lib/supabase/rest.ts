import { getSupabaseAdminEnv, getSupabaseAnonEnv } from "@/lib/supabase/config";
import type { CrawledNotice } from "@/lib/crawler/types";
import type { CrawlRunInsertRow, CrawlRunRestRow } from "@/lib/crawler/health";

export type NoticeRestRow = Record<string, unknown> & {
  id?: string;
  title?: string;
  url?: string;
  source_id?: string;
  source_name?: string;
  category?: string;
  published_at?: string | null;
  first_seen_at?: string;
  hash?: string;
  created_at?: string;
  updated_at?: string;
};

type RestKey = "anon" | "service_role";

type RestRequestOptions = {
  key: RestKey;
  method?: "GET" | "POST" | "PATCH";
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  prefer?: string;
  retries?: number;
  timeoutMs?: number;
};

export class SupabaseRestError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "SupabaseRestError";
    this.status = status;
  }
}

function getRestEnv(key: RestKey) {
  if (key === "service_role") {
    const result = getSupabaseAdminEnv();

    if (!result.ok) {
      throw new SupabaseRestError(result.error);
    }

    return {
      supabaseUrl: result.env.supabaseUrl,
      apiKey: result.env.serviceRoleKey
    };
  }

  const result = getSupabaseAnonEnv();

  if (!result.ok) {
    throw new SupabaseRestError(result.error);
  }

  return {
    supabaseUrl: result.env.supabaseUrl,
    apiKey: result.env.anonKey
  };
}

function restUrl(supabaseUrl: string, path: string, query?: Record<string, string>) {
  const url = new URL(`/rest/v1/${path.replace(/^\/+/, "")}`, supabaseUrl);

  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }

  return url;
}

function formatResponseError(status: number, body: string) {
  if (!body.trim()) return `HTTP ${status}`;

  try {
    const parsed = JSON.parse(body) as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const message = typeof parsed.message === "string" ? parsed.message : body;
    const code = typeof parsed.code === "string" ? ` (${parsed.code})` : "";
    return `HTTP ${status}${code}: ${message}`;
  } catch {
    return `HTTP ${status}: ${body.slice(0, 240)}`;
  }
}

async function requestSupabaseRest<T>(options: RestRequestOptions): Promise<T> {
  const env = getRestEnv(options.key);
  const retries = options.retries ?? 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(restUrl(env.supabaseUrl, options.path, options.query), {
        method: options.method ?? "GET",
        headers: {
          apikey: env.apiKey,
          Authorization: `Bearer ${env.apiKey}`,
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(options.prefer ? { Prefer: options.prefer } : {})
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 15000)
      });

      if (!response.ok) {
        throw new SupabaseRestError(formatResponseError(response.status, await response.text()), response.status);
      }

      if (response.status === 204) return undefined as T;

      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    } catch (error) {
      lastError = error;
      if (error instanceof SupabaseRestError || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
    }
  }

  throw lastError;
}

export async function selectNoticeRows(limit = 100, key: RestKey = "service_role") {
  return requestSupabaseRest<NoticeRestRow[]>({
    key,
    path: "notices",
    query: {
      select: "id,title,url,source_id,source_name,category,published_at,first_seen_at,hash,created_at,updated_at",
      limit: String(limit)
    }
  });
}

export async function insertNoticeRows(notices: CrawledNotice[], includeHash = true) {
  if (notices.length === 0) return;

  await requestSupabaseRest<void>({
    key: "service_role",
    method: "POST",
    path: "notices",
    body: notices.map((notice) => toNoticePayload(notice, includeHash)),
    prefer: "return=minimal"
  });
}

export async function upsertNoticeRowsByHash(notices: CrawledNotice[]) {
  if (notices.length === 0) return;

  await requestSupabaseRest<void>({
    key: "service_role",
    method: "POST",
    path: "notices",
    query: {
      on_conflict: "hash"
    },
    body: notices.map((notice) => toNoticePayload(notice, true)),
    prefer: "resolution=merge-duplicates,return=minimal"
  });
}

export async function selectExistingNoticeUrls(urls: string[]) {
  if (urls.length === 0) return [];

  return requestSupabaseRest<Array<{ url?: string }>>({
    key: "service_role",
    path: "notices",
    query: {
      select: "url",
      url: toInFilter(urls)
    }
  });
}

export async function insertCrawlRunRow(row: CrawlRunInsertRow) {
  await requestSupabaseRest<void>({
    key: "service_role",
    method: "POST",
    path: "crawl_runs",
    body: row,
    prefer: "return=minimal"
  });
}

export async function selectRecentCrawlRunRows(limit = 500) {
  return requestSupabaseRest<CrawlRunRestRow[]>({
    key: "service_role",
    path: "crawl_runs",
    query: {
      select: "source_id,source_name,started_at,finished_at,status,http_status,found_count,new_count,error_message",
      order: "started_at.desc",
      limit: String(limit)
    }
  });
}

function toNoticePayload(notice: CrawledNotice, includeHash: boolean) {
  return {
    title: notice.title,
    url: notice.url,
    source_name: notice.source_name,
    source_id: notice.source_id,
    category: notice.category,
    published_at: notice.published_at,
    first_seen_at: notice.first_seen_at,
    ...(includeHash ? { hash: notice.hash } : {})
  };
}

function toInFilter(values: string[]) {
  const escaped = values.map((value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
  return `in.(${escaped.join(",")})`;
}
