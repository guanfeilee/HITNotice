import { startISO, endISO } from "@/lib/digest/precision";
import type { CrawledNotice } from "@/lib/crawler/types";
import type { DigestWindow } from "@/lib/digest/types";
import { query } from "./pool";
import { transaction } from "./transaction";
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

export function toNoticeInsertPayload(
  notice: CrawledNotice,
  includeHash: boolean,
) {
  return {
    title: notice.title,
    url: notice.url,
    source_name: notice.source_name,
    source_id: notice.source_id,
    category: notice.category,
    published_at: notice.published_at,
    first_seen_at: notice.first_seen_at,
    ...(includeHash ? { hash: notice.hash } : {}),
  };
}

export function toNoticeUpdatePayload(notice: CrawledNotice) {
  return {
    title: notice.title,
    url: notice.url,
    source_name: notice.source_name,
    source_id: notice.source_id,
    category: notice.category,
    published_at: notice.published_at,
  };
}

export async function selectNoticeRows(limit = 100) {
  return (await query<NoticeRestRow>("SELECT * FROM notices LIMIT $1", [limit]))
    .rows;
}
export async function selectExistingNoticeHashes(hashes: string[]) {
  return (
    await query<{ hash: string }>(
      "SELECT hash FROM notices WHERE hash=ANY($1::text[])",
      [hashes],
    )
  ).rows;
}
export async function selectExistingNoticeUrls(urls: string[]) {
  return (
    await query<{ url: string }>(
      "SELECT url FROM notices WHERE url=ANY($1::text[])",
      [urls],
    )
  ).rows;
}
const inputSql = `jsonb_to_recordset($1::jsonb) AS x(title text,url text,source_name text,source_id text,category text,published_at timestamptz,first_seen_at timestamptz,hash text)`;
const columns =
  "title,url,source_name,source_id,category,published_at,first_seen_at,hash";
export async function insertNoticeRows(notices: CrawledNotice[]) {
  if (!notices.length) return;
  await query(
    `INSERT INTO notices(${columns}) SELECT ${columns} FROM ${inputSql}`,
    [JSON.stringify(notices)],
    "insert_notices",
  );
}
// Sorted advisory locks serialize repository writers by hash without inspecting system xmin/xmax.
// The INSERT and conditional UPDATE are batched on one transaction/connection.
export async function upsertNoticeBatch(
  notices: CrawledNotice[],
  updateOnly = false,
) {
  const unique = [...new Map(notices.map((n) => [n.hash, n])).values()].sort(
    (a, b) => a.hash.localeCompare(b.hash),
  );
  if (!unique.length) return { inserted: 0, updated: 0, unchanged: 0 };
  return transaction("upsert_notices", async (client) => {
    await client.query(
      `SELECT pg_advisory_xact_lock(lock_id) FROM
      (SELECT DISTINCT hashtextextended(h,0) AS lock_id FROM unnest($1::text[]) h ORDER BY lock_id) locks`,
      [unique.map((n) => n.hash)],
    );
    const json = JSON.stringify(unique);
    const inserted = updateOnly
      ? { rows: [] as { hash: string }[], rowCount: 0 }
      : await client.query<{ hash: string }>(
          `INSERT INTO notices(${columns}) SELECT ${columns} FROM ${inputSql} ON CONFLICT(hash) DO NOTHING RETURNING hash`,
          [json],
        );
    const updated = await client.query(
      `UPDATE notices n SET title=x.title,url=x.url,source_name=x.source_name,
      source_id=x.source_id,category=x.category,published_at=x.published_at FROM ${inputSql}
      WHERE n.hash=x.hash AND NOT(n.hash=ANY($2::text[]))
      AND (n.title,n.url,n.source_name,n.source_id,n.category,n.published_at)
      IS DISTINCT FROM (x.title,x.url,x.source_name,x.source_id,x.category,x.published_at) RETURNING n.hash`,
      [json, inserted.rows.map((r) => r.hash)],
    );
    return {
      inserted: inserted.rowCount ?? 0,
      updated: updated.rowCount ?? 0,
      unchanged:
        unique.length - (inserted.rowCount ?? 0) - (updated.rowCount ?? 0),
    };
  });
}
export async function updateNoticeRowsByHash(notices: CrawledNotice[]) {
  return upsertNoticeBatch(notices, true);
}
export type DigestNoticeRow = {
  id: string;
  title: string;
  url: string;
  source_id: string;
  source_name: string;
  published_at: string | null;
  first_seen_at: string;
};
export async function digestNotices(ids: string[], window: DigestWindow) {
  return (
    await query<DigestNoticeRow>(
      `SELECT id,title,url,source_id,source_name,published_at,first_seen_at FROM notices WHERE source_id=ANY($1::text[]) AND first_seen_at ${window.startInclusive === false ? ">" : ">="} $2::timestamptz AND first_seen_at ${window.endInclusive === true ? "<=" : "<"} $3::timestamptz ORDER BY first_seen_at DESC`,
      [ids, startISO(window), endISO(window)],
    )
  ).rows;
}
export async function adminNotices(source: string) {
  return (
    await query<{ title: string; url: string; source_name: string }>(
      "SELECT title,url,source_name FROM notices WHERE ($1::text='' OR source_name=$1) ORDER BY first_seen_at DESC LIMIT 200",
      [source],
    )
  ).rows;
}
