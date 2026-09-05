// Historical read compatibility only. The HTTP webhook route remains retired (410).
import { query } from "./pool";
export type HistoricalWebhookEvent = {
  id: string;
  svix_id: string;
  event_type: string;
  resend_email_id: string;
  event_created_at: string;
  processed_at: string | null;
  processing_result: string | null;
  created_at: string;
};
export async function getHistoricalWebhookEvent(svixId: string) {
  return (
    (
      await query<HistoricalWebhookEvent>(
        "SELECT * FROM resend_webhook_events WHERE svix_id=$1",
        [svixId],
      )
    ).rows[0] ?? null
  );
}
