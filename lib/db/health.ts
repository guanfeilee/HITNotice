import { query } from "./pool";
import type { DigestType, DigestWindow } from "@/lib/digest/types";
import type { EmailDeliveryHealthRow } from "@/lib/health/report";
export async function noticeCounts(window: DigestWindow) {
  const rows = (
    await query<{ source_id: string; count: number }>(
      "SELECT source_id,count(*)::int AS count FROM notices WHERE first_seen_at >= $1 AND first_seen_at < $2 GROUP BY source_id",
      [window.start, window.end],
    )
  ).rows;
  return new Map(rows.map((row) => [row.source_id, row.count]));
}
export async function getDeliveriesForScheduledRun(
  type: DigestType,
  window: DigestWindow,
) {
  return (
    await query<EmailDeliveryHealthRow>(
      "SELECT status,accepted_at,sent_at,error_message,processing_started_at,created_at FROM email_deliveries WHERE digest_type=$1 AND period_end=$2",
      [type, window.end],
    )
  ).rows;
}
