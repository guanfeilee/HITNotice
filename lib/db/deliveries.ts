import { startISO, endISO } from "@/lib/digest/precision";
import { query } from "./pool";
import { transaction } from "./transaction";
import { RepositoryError } from "./errors";
import {
  createDigestIdempotencyKey,
  evaluateRetryEligibility,
  isAcceptedDeliveryStatus,
  type DeliveryStatus,
} from "@/lib/digest/delivery";
import type { SerializedRequestError } from "@/lib/email/error-details";
import type { DigestType, DigestWindow } from "@/lib/digest/types";
export type DigestDeliveryRecord = {
  id: string;
  subscriptionId: string;
  digestType: DigestType;
  periodStart: string;
  periodEnd: string;
  noticeCount: number;
  status: DeliveryStatus;
  resendEmailId: string | null;
  idempotencyKey: string | null;
  attemptCount: number;
  errorMessage: string | null;
  errorDetails: SerializedRequestError | null;
  acceptedAt: string | null;
  sentAt: string | null;
  lastEventAt: string | null;
};

type DeliveryRow = {
  id: string;
  subscription_id: string;
  digest_type: DigestType;
  period_start: string;
  period_end: string;
  notice_count: number;
  status: DeliveryStatus;
  resend_email_id: string | null;
  idempotency_key: string | null;
  attempt_count: number | null;
  error_message: string | null;
  error_details: SerializedRequestError | null;
  accepted_at: string | null;
  sent_at: string | null;
  last_event_at: string | null;
};

function mapDelivery(row: DeliveryRow): DigestDeliveryRecord {
  return {
    id: row.id,
    subscriptionId: row.subscription_id,
    digestType: row.digest_type,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    noticeCount: row.notice_count,
    status: row.status,
    resendEmailId: row.resend_email_id,
    idempotencyKey: row.idempotency_key,
    attemptCount: row.attempt_count ?? 0,
    errorMessage: row.error_message,
    errorDetails: row.error_details,
    acceptedAt: row.accepted_at,
    sentAt: row.sent_at,
    lastEventAt: row.last_event_at,
  };
}

const accepted = [
  "accepted",
  "sent",
  "delivered",
  "suppressed",
  "bounced",
  "complained",
];
function one(rows: DeliveryRow[]) {
  if (rows.length > 1)
    throw new RepositoryError("AMBIGUOUS_DELIVERY", "read_delivery");
  return rows[0] ? mapDelivery(rows[0]) : null;
}
export async function getDigestDelivery(
  subscriptionId: string,
  digestType: DigestType,
  window: DigestWindow,
) {
  return one(
    (
      await query<DeliveryRow>(
        "SELECT * FROM email_deliveries WHERE subscription_id=$1 AND digest_type=$2 AND period_start=$3 AND period_end=$4",
        [subscriptionId, digestType, startISO(window), endISO(window)],
      )
    ).rows,
  );
}
export async function getDigestDeliveryById(id: string) {
  return one(
    (
      await query<DeliveryRow>("SELECT * FROM email_deliveries WHERE id=$1", [
        id,
      ])
    ).rows,
  );
}
export async function getDigestDeliveryForPeriod(
  id: string,
  type: DigestType,
  end: Date,
) {
  return one(
    (
      await query<DeliveryRow>(
        "SELECT * FROM email_deliveries WHERE subscription_id=$1 AND digest_type=$2 AND period_end=$3 LIMIT 2",
        [id, type, end],
      )
    ).rows,
  );
}
export async function getAcceptedDigestDeliveryWindowsBefore(
  id: string,
  type: DigestType,
  end: Date,
) {
  return (
    await query<{ id: string; period_start: string; period_end: string; end_inclusive: boolean | null }>(
      "SELECT id,period_start,period_end,(resend_response->>'window_end_inclusive')::boolean AS end_inclusive FROM email_deliveries WHERE subscription_id=$1 AND digest_type=$2 AND status=ANY($3::text[]) AND period_end<$4 ORDER BY period_end DESC",
      [id, type, accepted, end],
    )
  ).rows;
}
export async function getLatestPermanentDeliveryBlock(id: string) {
  return one(
    (
      await query<DeliveryRow>(
        "SELECT * FROM email_deliveries WHERE subscription_id=$1 AND status=ANY($2::text[]) ORDER BY period_end DESC LIMIT 1",
        [id, ["suppressed", "bounced", "complained"]],
      )
    ).rows,
  );
}
export async function hasSentDigest(
  id: string,
  type: DigestType,
  window: DigestWindow,
) {
  const d = await getDigestDelivery(id, type, window);
  return Boolean(d && (isAcceptedDeliveryStatus(d.status) || d.resendEmailId));
}
export async function claimDigestDelivery(params: {
  subscriptionId: string;
  digestType: DigestType;
  window: DigestWindow;
  noticeCount: number;
}) {
  return transaction("claim_delivery", async (client) => {
    const key = createDigestIdempotencyKey(
      params.digestType,
      params.subscriptionId,
      params.window,
    );
    const values = [
      params.subscriptionId,
      params.digestType,
      startISO(params.window),
      endISO(params.window),
      params.noticeCount,
      key,
    ];
    const inserted = await client.query<DeliveryRow>(
      `INSERT INTO email_deliveries(subscription_id,digest_type,period_start,period_end,notice_count,idempotency_key,processing_started_at)
      VALUES($1,$2,$3,$4,$5,$6,now()) ON CONFLICT DO NOTHING RETURNING *`,
      values,
    );
    if (inserted.rows[0])
      return {
        claimed: true,
        reason: "new_claim",
        delivery: mapDelivery(inserted.rows[0]),
      };
    const retry = await client.query<DeliveryRow>(
      `UPDATE email_deliveries SET status='pending',notice_count=$5,processing_started_at=now(),updated_at=now()
      WHERE subscription_id=$1 AND digest_type=$2 AND period_start=$3 AND period_end=$4 AND status='failed' AND resend_email_id IS NULL RETURNING *`,
      values.slice(0, 5),
    );
    if (retry.rows[0])
      return {
        claimed: true,
        reason: "retry_claimed",
        delivery: mapDelivery(retry.rows[0]),
      };
    const existing = await client.query<DeliveryRow>(
      "SELECT * FROM email_deliveries WHERE subscription_id=$1 AND digest_type=$2 AND period_start=$3 AND period_end=$4",
      values.slice(0, 4),
    );
    if (!existing.rows[0])
      throw new RepositoryError("CLAIM_TARGET_MISSING", "claim_delivery");
    const delivery = mapDelivery(existing.rows[0]);
    const eligibility = evaluateRetryEligibility({
      deliveryStatus: delivery.status,
      resendEmailId: delivery.resendEmailId,
      subscriptionStatus: "active",
    });
    return {
      claimed: false,
      reason: eligibility.allowed
        ? "delivery_claimed_concurrently"
        : eligibility.reason,
      delivery,
    };
  });
}
export async function recordDigestDeliveryAccepted(p: {
  deliveryId: string;
  resendEmailId: string;
  attempt: number;
  durationMs: number;
  httpStatus: number;
  responseSummary: string;
  windowEndInclusive?: boolean;
}) {
  return transaction("accept_delivery", async (client) => {
    const result = await client.query<DeliveryRow>(
      `UPDATE email_deliveries SET status='accepted',resend_email_id=$2,accepted_at=COALESCE(accepted_at,now()),sent_at=COALESCE(sent_at,now()),
      attempt_count=GREATEST(attempt_count,$3),last_attempt_duration_ms=$4,http_status=$5,
      resend_response=$6,error_message=NULL,error_details=NULL,updated_at=now()
      WHERE id=$1 AND status IN ('pending','failed') AND resend_email_id IS NULL RETURNING *`,
      [
        p.deliveryId,
        p.resendEmailId,
        p.attempt,
        p.durationMs,
        p.httpStatus,
        { id: p.resendEmailId, summary: p.responseSummary, ...(p.windowEndInclusive === undefined ? {} : { window_end_inclusive: p.windowEndInclusive }) },
      ],
    );
    if (result.rows[0]) return;
    const current = (
      await client.query<DeliveryRow>(
        "SELECT * FROM email_deliveries WHERE id=$1 FOR UPDATE",
        [p.deliveryId],
      )
    ).rows[0];
    if (
      current &&
      current.resend_email_id === p.resendEmailId &&
      isAcceptedDeliveryStatus(current.status)
    )
      return;
    throw new RepositoryError(
      current ? "DELIVERY_STATE_CONFLICT" : "DELIVERY_NOT_FOUND",
      "accept_delivery",
    );
  });
}
export async function recordDigestDeliveryFailure(p: {
  deliveryId: string;
  attempt: number;
  durationMs: number;
  httpStatus: number | null;
  errorMessage: string;
  errorDetails: SerializedRequestError;
  responseSummary: string | null;
}) {
  const result = await query(
    `UPDATE email_deliveries SET status='failed',attempt_count=GREATEST(attempt_count,$2),last_attempt_duration_ms=$3,http_status=$4,
    error_message=$5,error_details=$6,resend_response=$7,processing_started_at=NULL,updated_at=now()
    WHERE id=$1 AND status='pending' AND resend_email_id IS NULL RETURNING id`,
    [
      p.deliveryId,
      p.attempt,
      p.durationMs,
      p.httpStatus,
      p.errorMessage,
      p.errorDetails,
      p.responseSummary === null ? null : { summary: p.responseSummary },
    ],
    "fail_delivery",
  );
  if (result.rowCount) return;
  if (!(await getDigestDeliveryById(p.deliveryId)))
    throw new RepositoryError("DELIVERY_NOT_FOUND", "fail_delivery");
  return;
}
