import type { CrawledNotice, UpsertResult } from "@/lib/crawler/types";
import { upsertNoticeBatch } from "@/lib/db/notices";
export async function upsertNotices(
  notices: CrawledNotice[],
): Promise<UpsertResult> {
  try {
    const stats = await upsertNoticeBatch(notices);
    return {
      ...stats,
      insertedOrUpdated: stats.inserted + stats.updated,
      skipped: stats.unchanged,
      mode: notices.length ? "upsert-hash" : "none",
      needsMigration: false,
    };
  } catch {
    return {
      inserted: 0,
      updated: 0,
      unchanged: 0,
      insertedOrUpdated: 0,
      skipped: 0,
      mode: "upsert-hash",
      needsMigration: false,
      error: "Database notice upsert failed",
    };
  }
}
