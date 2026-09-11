import { query } from "@/lib/db/pool";
import { getCurrentDigestPeriodEnd } from "@/lib/digest/windows";

export class FreshCrawlNotReady extends Error {
  constructor(readonly missingSources: string[]) { super("CRAWL_NOT_READY"); this.name = "FreshCrawlNotReady"; }
}
export function freshnessThreshold(now: Date) {
  return new Date(getCurrentDigestPeriodEnd(now).getTime() - 15 * 60_000);
}
export function isFreshSuccess(at: string | null, now: Date, observedAt = new Date()) {
  const time = at ? Date.parse(at) : NaN;
  return Number.isFinite(time) && time >= freshnessThreshold(now).getTime() && time <= observedAt.getTime();
}
export async function freshSourceIds(now: Date, observedAt = new Date()): Promise<Set<string>> {
  const rows = (await query<{source_id:string}>(
    "SELECT DISTINCT source_id FROM crawl_runs WHERE status='success' AND finished_at >= $1 AND finished_at <= $2",
    [freshnessThreshold(now).toISOString(), observedAt.toISOString()]
  )).rows;
  return new Set(rows.map(r => r.source_id));
}
