import type { CrawlRunInsertRow, CrawlRunRestRow } from "@/lib/crawler/health";
import { query } from "./pool";
export async function insertCrawlRunRow(row: CrawlRunInsertRow) {
  await query(
    `INSERT INTO crawl_runs(source_id,source_name,started_at,finished_at,status,http_status,found_count,new_count,error_message)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      row.source_id,
      row.source_name,
      row.started_at,
      row.finished_at,
      row.status,
      row.http_status,
      row.found_count,
      row.new_count,
      row.error_message,
    ],
    "record_crawl",
  );
}
export async function selectRecentCrawlRunRows(limit = 500) {
  return (
    await query<CrawlRunRestRow>(
      "SELECT source_id,source_name,started_at,finished_at,status,http_status,found_count,new_count,error_message FROM crawl_runs ORDER BY started_at DESC LIMIT $1",
      [limit],
    )
  ).rows;
}
