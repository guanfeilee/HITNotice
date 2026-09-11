import type { SourceCrawlResult } from "./types";

// A quarter of configured sources failing is treated as systemic, not silently tolerated.
export const systemicFailureFraction = 0.25;
export type CrawlOutcome = { status: "healthy" | "degraded" | "fatal"; total: number; failed: number; reason: string | null };
export function classifyCrawlOutcome(results: SourceCrawlResult[]): CrawlOutcome {
  const failed = results.filter(r => r.fetchStatus !== "success" || r.parseStatus !== "success").length;
  const fatalWrite = results.some(r => r.writeStatus === "failed" || (r.fetchStatus === "success" && r.writeStatus !== "success"));
  const reason = !results.length ? "CRAWL_SOURCES_EMPTY" : fatalWrite ? "CRAWL_WRITE_FAILED" : failed >= Math.ceil(results.length * systemicFailureFraction) ? "CRAWL_SYSTEMIC_SOURCE_FAILURE" : null;
  return { status: reason ? "fatal" : failed ? "degraded" : "healthy", total: results.length, failed, reason };
}
