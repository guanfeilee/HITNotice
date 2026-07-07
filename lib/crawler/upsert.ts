import { supabaseAdmin } from "@/lib/supabase/admin";
import type { CrawledNotice, UpsertResult } from "@/lib/crawler/types";

const migrationHintPath = "supabase/migrations/optional_notice_crawler_fields.sql";

function isMissingHashConstraint(message: string) {
  return /no unique|exclusion constraint|ON CONFLICT/i.test(message);
}

function isMissingColumn(message: string) {
  return /column .* does not exist|schema cache|Could not find .* column/i.test(message);
}

function toPayload(notice: CrawledNotice, includeHash = true) {
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

async function insertNewByUrl(notices: CrawledNotice[], includeHash: boolean): Promise<UpsertResult> {
  if (notices.length === 0) {
    return { insertedOrUpdated: 0, skipped: 0, mode: "none", needsMigration: false };
  }

  const urls = notices.map((notice) => notice.url);
  const existingByUrl = new Set<string>();

  const existingResult = await supabaseAdmin.from("notices").select("url").in("url", urls);
  if (existingResult.error) {
    return {
      insertedOrUpdated: 0,
      skipped: 0,
      mode: "insert-new-by-url",
      needsMigration: isMissingColumn(existingResult.error.message),
      error: existingResult.error.message
    };
  }

  for (const row of existingResult.data ?? []) {
    if (typeof row.url === "string") existingByUrl.add(row.url);
  }

  const rowsToInsert = notices.filter((notice) => !existingByUrl.has(notice.url));
  if (rowsToInsert.length === 0) {
    return {
      insertedOrUpdated: 0,
      skipped: notices.length,
      mode: "insert-new-by-url",
      needsMigration: !includeHash
    };
  }

  const insertResult = await supabaseAdmin.from("notices").insert(rowsToInsert.map((notice) => toPayload(notice, includeHash)));
  if (insertResult.error) {
    const needsMigration = isMissingColumn(insertResult.error.message);
    return {
      insertedOrUpdated: 0,
      skipped: existingByUrl.size,
      mode: "insert-new-by-url",
      needsMigration,
      error: needsMigration ? `${insertResult.error.message}. 可选迁移文件：${migrationHintPath}` : insertResult.error.message
    };
  }

  return {
    insertedOrUpdated: rowsToInsert.length,
    skipped: notices.length - rowsToInsert.length,
    mode: "insert-new-by-url",
    needsMigration: !includeHash
  };
}

export async function upsertNotices(notices: CrawledNotice[]): Promise<UpsertResult> {
  if (notices.length === 0) {
    return { insertedOrUpdated: 0, skipped: 0, mode: "none", needsMigration: false };
  }

  const payload = notices.map((notice) => toPayload(notice));
  const result = await supabaseAdmin.from("notices").upsert(payload, { onConflict: "hash" });

  if (!result.error) {
    return {
      insertedOrUpdated: notices.length,
      skipped: 0,
      mode: "upsert-hash",
      needsMigration: false
    };
  }

  if (isMissingHashConstraint(result.error.message)) {
    return insertNewByUrl(notices, true);
  }

  if (/hash/i.test(result.error.message) && isMissingColumn(result.error.message)) {
    return insertNewByUrl(notices, false);
  }

  const needsMigration = isMissingColumn(result.error.message);
  return {
    insertedOrUpdated: 0,
    skipped: 0,
    mode: "upsert-hash",
    needsMigration,
    error: needsMigration ? `${result.error.message}. 可选迁移文件：${migrationHintPath}` : result.error.message
  };
}
