import type { CrawledNotice, UpsertResult } from "@/lib/crawler/types";
import {
  insertNoticeRows,
  selectExistingNoticeHashes,
  selectExistingNoticeUrls,
  updateNoticeRowsByHash
} from "@/lib/supabase/rest";

const migrationHintPath = "supabase/migrations/optional_notice_crawler_fields.sql";

function isMissingHashConstraint(message: string) {
  return /no unique|exclusion constraint|ON CONFLICT/i.test(message);
}

function isMissingColumn(message: string) {
  return /column .* does not exist|schema cache|Could not find .* column/i.test(message);
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    const cause = error.cause;
    if (cause instanceof Error) return `${error.message}; cause: ${cause.message}`;
    return error.message;
  }

  return String(error);
}

async function insertNewByUrl(notices: CrawledNotice[], includeHash: boolean): Promise<UpsertResult> {
  if (notices.length === 0) {
    return { insertedOrUpdated: 0, skipped: 0, mode: "none", needsMigration: false };
  }

  const urls = notices.map((notice) => notice.url);
  const existingByUrl = new Set<string>();

  let existingRows: Array<{ url?: string }>;

  try {
    existingRows = await selectExistingNoticeUrls(urls);
  } catch (error) {
    const message = formatError(error);
    return {
      insertedOrUpdated: 0,
      skipped: 0,
      mode: "insert-new-by-url",
      needsMigration: isMissingColumn(message),
      error: message
    };
  }

  for (const row of existingRows) {
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

  try {
    await insertNoticeRows(rowsToInsert, includeHash);
  } catch (error) {
    const message = formatError(error);
    const needsMigration = isMissingColumn(message);
    return {
      insertedOrUpdated: 0,
      skipped: existingByUrl.size,
      mode: "insert-new-by-url",
      needsMigration,
      error: needsMigration ? `${message}. 可选迁移文件：${migrationHintPath}` : message
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

  try {
    const hashes = Array.from(new Set(notices.map((notice) => notice.hash)));
    const existingRows = await selectExistingNoticeHashes(hashes);
    const existingHashes = new Set(existingRows.map((row) => row.hash).filter((hash): hash is string => Boolean(hash)));
    const rowsToInsert = notices.filter((notice) => !existingHashes.has(notice.hash));
    const rowsToUpdate = notices.filter((notice) => existingHashes.has(notice.hash));

    await insertNoticeRows(rowsToInsert, true);
    await updateNoticeRowsByHash(rowsToUpdate);

    return {
      insertedOrUpdated: notices.length,
      skipped: 0,
      mode: "upsert-hash",
      needsMigration: false
    };
  } catch (error) {
    const message = formatError(error);

    if (isMissingHashConstraint(message)) {
      return insertNewByUrl(notices, true);
    }

    if (/hash/i.test(message) && isMissingColumn(message)) {
      return insertNewByUrl(notices, false);
    }

    const needsMigration = isMissingColumn(message);
    return {
      insertedOrUpdated: 0,
      skipped: 0,
      mode: "upsert-hash",
      needsMigration,
      error: needsMigration ? `${message}. 可选迁移文件：${migrationHintPath}` : message
    };
  }
}
