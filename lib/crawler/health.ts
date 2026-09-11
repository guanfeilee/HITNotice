import { crawlSources } from "@/lib/crawler/sources";
import type { SourceCrawlResult } from "@/lib/crawler/types";
import { insertCrawlRunRow, selectSourceHealthRows } from "@/lib/db/crawl-runs";

export type CrawlRunStatus = "success" | "failed";

export type CrawlRunInsertRow = {
  source_id: string;
  source_name: string;
  started_at: string;
  finished_at: string;
  status: CrawlRunStatus;
  http_status: number | null;
  found_count: number;
  new_count: number;
  error_message: string | null;
};

export type CrawlRunRestRow = CrawlRunInsertRow;

export type SourceHealth = {
  sourceId: string;
  sourceName: string;
  status: "OK" | "FAIL" | "NO_DATA";
  foundCount: number;
  newCount: number;
  httpStatus: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastSuccessAt: string | null;
};

export function getCrawlRunStatus(result: SourceCrawlResult): CrawlRunStatus {
  return result.fetchStatus === "success" && result.parseStatus === "success" && result.writeStatus !== "failed"
    ? "success"
    : "failed";
}

export function getCrawlRunError(result: SourceCrawlResult) {
  return result.fetchError ?? result.parseError ?? result.writeError ?? null;
}

export async function recordCrawlRun(params: {
  result: SourceCrawlResult;
  startedAt: string;
  finishedAt: string;
}) {
  const { result, startedAt, finishedAt } = params;

  await insertCrawlRunRow({
    source_id: result.source.id,
    source_name: result.source.name,
    started_at: startedAt,
    finished_at: finishedAt,
    status: getCrawlRunStatus(result),
    http_status: result.httpStatus ?? null,
    found_count: result.parsed,
    new_count: result.inserted ?? result.insertedOrUpdated,
    error_message: getCrawlRunError(result)
  });
}

export async function getCrawlerHealth(): Promise<SourceHealth[]> {
  const rows = await selectSourceHealthRows();
  const latestBySource = new Map(rows.map(row => [row.source_id, row]));

  return crawlSources.map((source) => {
    const latest = latestBySource.get(source.id);

    if (!latest) {
      return {
        sourceId: source.id,
        sourceName: source.name,
        status: "NO_DATA",
        foundCount: 0,
        newCount: 0,
        httpStatus: null,
        errorMessage: "No crawl run recorded",
        startedAt: null,
        finishedAt: null,
        lastSuccessAt: null
      };
    }

    return {
      sourceId: source.id,
      sourceName: latest.source_name || source.name,
      status: latest.status === "success" ? "OK" : "FAIL",
      foundCount: latest.found_count,
      newCount: latest.new_count,
      httpStatus: latest.http_status,
      errorMessage: latest.error_message,
      startedAt: latest.started_at,
      finishedAt: latest.finished_at,
      lastSuccessAt: latest.last_success_at
    };
  });
}
