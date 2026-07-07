import { createSupabaseAnonClient } from "@/lib/supabase/client";
import { sources } from "@/lib/sources";
import type { Notice, NoticeFetchResult, NoticeSourceGroup } from "@/types/notice";

type NoticeRow = Record<string, unknown> & {
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

export async function fetchNotices(limit = 100): Promise<NoticeFetchResult> {
  const { client: supabase, error: configError } = createSupabaseAnonClient();

  if (!supabase) {
    return { ok: false, notices: [], error: configError };
  }

  const withSource = await supabase.from("notices").select("*, sources(*)").limit(limit);
  const result = withSource.error
    ? await supabase.from("notices").select("*").limit(limit)
    : withSource;

  if (result.error) {
    return {
      ok: false,
      notices: [],
      error: result.error.message
    };
  }

  const notices = sortNotices(
    ((result.data ?? []) as NoticeRow[])
      .map((row) => normalizeNotice(row))
      .filter((notice): notice is Notice => Boolean(notice))
  );

  return {
    ok: true,
    notices
  };
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
