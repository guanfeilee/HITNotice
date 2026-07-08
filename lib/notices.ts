import { sources } from "@/lib/sources";
import { selectNoticeRows, type NoticeRestRow } from "@/lib/supabase/rest";
import type { Notice, NoticeFetchResult, NoticeSourceGroup } from "@/types/notice";

type NoticeRow = NoticeRestRow & {
  sources?: SourceRow | SourceRow[] | null;
  source?: SourceRow | SourceRow[] | null;
};

type SourceRow = Record<string, unknown> & {
  id?: unknown;
  name?: unknown;
  group?: unknown;
  category?: unknown;
};

const sourceById = new Map(sources.map((source) => [source.id, source]));

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const result = stringValue(value);
    if (result) return result;
  }

  return undefined;
}

function getRelatedSource(value: unknown): SourceRow | undefined {
  if (Array.isArray(value)) {
    const [first] = value;
    return first && typeof first === "object" ? (first as SourceRow) : undefined;
  }

  return value && typeof value === "object" ? (value as SourceRow) : undefined;
}

function normalizeSourceGroup(value: unknown): NoticeSourceGroup {
  return value === "public" || value === "academic" ? value : "unknown";
}

function parseDateTime(value?: string) {
  if (!value) return 0;

  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function normalizeNotice(row: NoticeRow): Notice | null {
  const relatedSource = getRelatedSource(row.sources) ?? getRelatedSource(row.source);
  const sourceId = firstString(row.source_id, row.sourceId, relatedSource?.id);
  const localSource = sourceId ? sourceById.get(sourceId) : undefined;
  const title = firstString(row.title, row.name);
  const url = firstString(row.url, row.link, row.href, row.source_url);

  if (!title || !url) return null;

  const sourceName =
    firstString(row.source_name, row.sourceName, relatedSource?.name, localSource?.name) ?? "未知来源";
  const category = firstString(row.category, relatedSource?.category, localSource?.category);
  const sourceGroup = normalizeSourceGroup(
    firstString(row.source_group, row.sourceGroup, relatedSource?.group, localSource?.group)
  );

  return {
    id: firstString(row.id) ?? `${sourceId ?? sourceName}-${url}`,
    sourceId,
    sourceName,
    sourceGroup,
    title,
    url,
    category,
    publishedAt: firstString(row.published_at, row.publishedAt, row.date, row.publish_date),
    firstSeenAt: firstString(row.first_seen_at, row.firstSeenAt, row.discovered_at, row.fetched_at),
    createdAt: firstString(row.created_at, row.createdAt)
  };
}

function sortNotices(notices: Notice[]) {
  return [...notices].sort((a, b) => {
    const bTime = parseDateTime(b.publishedAt ?? b.firstSeenAt ?? b.createdAt);
    const aTime = parseDateTime(a.publishedAt ?? a.firstSeenAt ?? a.createdAt);
    return bTime - aTime;
  });
}

function isBrowser() {
  return typeof window !== "undefined";
}

function isNoticeFetchResult(value: unknown): value is NoticeFetchResult {
  if (!value || typeof value !== "object") return false;

  const result = value as { ok?: unknown; notices?: unknown; error?: unknown };
  if (result.ok === true) return Array.isArray(result.notices);
  if (result.ok === false) return Array.isArray(result.notices) && typeof result.error === "string";
  return false;
}

export async function fetchNotices(limit = 100): Promise<NoticeFetchResult> {
  if (isBrowser()) {
    try {
      const response = await fetch(`/api/notices?limit=${encodeURIComponent(String(limit))}`, {
        headers: {
          Accept: "application/json"
        }
      });
      const result = (await response.json()) as unknown;

      if (!response.ok || !isNoticeFetchResult(result)) {
        return {
          ok: false,
          notices: [],
          error: `Notice API failed with HTTP ${response.status}`
        };
      }

      return result;
    } catch (error) {
      return {
        ok: false,
        notices: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  try {
    const notices = sortNotices(
      (await selectNoticeRows(limit))
        .map((row) => normalizeNotice(row))
        .filter((notice): notice is Notice => Boolean(notice))
    );

    return {
      ok: true,
      notices
    };
  } catch (error) {
    return {
      ok: false,
      notices: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function formatNoticeDate(notice: Notice) {
  const value = notice.publishedAt ?? notice.firstSeenAt ?? notice.createdAt;
  if (!value) return "";

  const parsedTime = parseDateTime(value);
  if (parsedTime > 0) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(parsedTime));
  }

  return value;
}
