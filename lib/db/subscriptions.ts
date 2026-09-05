import { randomBytes } from "node:crypto";
import { query } from "./pool";
import { transaction } from "./transaction";
import type { DigestType } from "@/lib/digest/types";
type SubscriptionRow = {
  id: string;
  email: string;
  frequency: DigestType;
  status: "active" | "unsubscribed";
  unsubscribe_token: string | null;
  unsubscribed_at: string | null;
};
type UnsubscribeRow = Pick<
  SubscriptionRow,
  "id" | "status" | "unsubscribed_at"
>;
export async function saveSubscription(
  email: string,
  frequency: DigestType,
  sourceIds: string[],
) {
  return transaction("subscribe", async (client) => {
    const token = randomBytes(32).toString("hex");
    const inserted = await client.query<{
      id: string;
      unsubscribe_token: string;
    }>(
      `INSERT INTO subscriptions(email,frequency,unsubscribe_token) VALUES($1,$2,$3)
       ON CONFLICT(email) DO NOTHING RETURNING id,unsubscribe_token`,
      [email, frequency, token],
    );
    const isFirstSubscription = inserted.rowCount === 1;
    const result = isFirstSubscription
      ? inserted
      : await client.query<{ id: string; unsubscribe_token: string }>(
          `UPDATE subscriptions SET frequency=$2,status='active',
       unsubscribe_token=COALESCE(NULLIF(unsubscribe_token,''),$3) WHERE email=$1 RETURNING id,unsubscribe_token`,
          [email, frequency, token],
        );
    const subscription = result.rows[0];
    await client.query(
      "DELETE FROM subscription_sources WHERE subscription_id=$1",
      [subscription.id],
    );
    await client.query(
      "INSERT INTO subscription_sources(subscription_id,source_id) SELECT $1,unnest($2::text[])",
      [subscription.id, [...new Set(sourceIds)]],
    );
    return { ...subscription, isFirstSubscription };
  });
}
export async function unsubscribeByToken(token: string) {
  return transaction("unsubscribe", async (client) => {
    const current = await client.query<UnsubscribeRow>(
      "SELECT id,status,unsubscribed_at FROM subscriptions WHERE unsubscribe_token=$1 FOR UPDATE",
      [token],
    );
    if (!current.rows[0]) return null;
    if (current.rows[0].status === "unsubscribed") return current.rows[0];
    return (
      await client.query<UnsubscribeRow>(
        "UPDATE subscriptions SET status='unsubscribed',unsubscribed_at=COALESCE(unsubscribed_at,now()) WHERE id=$1 RETURNING id,status,unsubscribed_at",
        [current.rows[0].id],
      )
    ).rows[0];
  });
}
export async function activeSubscriptions(type: DigestType) {
  return (
    await query<
      Pick<SubscriptionRow, "id" | "email" | "frequency" | "unsubscribe_token">
    >(
      "SELECT id,email,frequency,unsubscribe_token FROM subscriptions WHERE status='active' AND frequency=$1 ORDER BY created_at",
      [type],
    )
  ).rows;
}
export async function subscriptionSources(id: string) {
  return (
    await query<{ source_id: string }>(
      "SELECT source_id FROM subscription_sources WHERE subscription_id=$1",
      [id],
    )
  ).rows;
}
export async function subscriptionForRetry(id: string) {
  return (
    (
      await query<Omit<SubscriptionRow, "unsubscribed_at">>(
        "SELECT id,email,frequency,status,unsubscribe_token FROM subscriptions WHERE id=$1",
        [id],
      )
    ).rows[0] ?? null
  );
}
