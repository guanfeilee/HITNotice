import { createClient } from "@supabase/supabase-js";
import { sources } from "@/lib/sources";
import { getSupabaseAdminEnv, supabaseClientOptions } from "@/lib/supabase/config";
import { formatBeijingDate, getDigestWindowFromLastSuccess } from "@/lib/digest/windows";
import {
  createDigestIdempotencyKey,
  evaluateRetryEligibility,
  isAcceptedDeliveryStatus,
  type DeliveryStatus
} from "@/lib/digest/delivery";
import type { SerializedRequestError } from "@/lib/email/error-details";
import type {
  Digest,
  DigestGroup,
  DigestNotice,
  DigestSource,
  DigestSubscription,
  DigestType,
  DigestWindow
} from "@/lib/digest/types";

type SubscriptionSourceRow = {
  source_id: string;
};

type NoticeRow = {
  id: string;
  title: string;
  url: string;
  source_id: string;
  source_name: string;
  published_at: string | null;
  first_seen_at: string;
};

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

const deliveryColumns =
  "id,subscription_id,digest_type,period_start,period_end,notice_count,status,resend_email_id,idempotency_key,attempt_count,error_message,error_details,accepted_at,sent_at,last_event_at";

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
    lastEventAt: row.last_event_at
  };
}

const sourceById = new Map(sources.map((source) => [source.id, source]));

function getSupabaseAdmin() {
  const envResult = getSupabaseAdminEnv();

  if (!envResult.ok) {
    throw new Error(envResult.error);
  }

  return createClient(envResult.env.supabaseUrl, envResult.env.serviceRoleKey, supabaseClientOptions);
}

function orderSources(sourceIds: string[]) {
  const selected = new Set(sourceIds);
  const known = sources
    .filter((source) => selected.has(source.id))
    .map((source) => ({
      id: source.id,
      name: source.name
    }));
  const knownIds = new Set(known.map((source) => source.id));
  const unknown = sourceIds
    .filter((sourceId) => !knownIds.has(sourceId))
    .map((sourceId) => ({
      id: sourceId,
      name: sourceId
    }));

  return [...known, ...unknown];
}

export function groupNotices(notices: DigestNotice[], subscribedSources: DigestSource[]): DigestGroup[] {
  const groupsBySourceId = new Map<string, DigestGroup>();

  for (const source of subscribedSources) {
    groupsBySourceId.set(source.id, {
      sourceId: source.id,
      sourceName: source.name,
      notices: [],
      hasUpdates: false
    });
  }

  for (const notice of notices) {
    const group =
      groupsBySourceId.get(notice.sourceId) ??
      {
        sourceId: notice.sourceId,
        sourceName: notice.sourceName,
        notices: [],
        hasUpdates: false
      };

    group.notices.push(notice);
    group.hasUpdates = group.notices.length > 0;
    groupsBySourceId.set(notice.sourceId, group);
  }

  return Array.from(groupsBySourceId.values()).map((group) => ({
    ...group,
    hasUpdates: group.notices.length > 0
  }));
}

export async function getActiveDigestSubscriptions(digestType: DigestType): Promise<DigestSubscription[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("subscriptions")
    .select("id,email,frequency,unsubscribe_token")
    .eq("status", "active")
    .eq("frequency", digestType)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load active digest subscriptions: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    email: String(row.email),
    frequency: digestType,
    unsubscribeToken: String(row.unsubscribe_token ?? "")
  }));
}

export async function getSubscriptionSources(subscriptionId: string): Promise<DigestSource[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("subscription_sources")
    .select("source_id")
    .eq("subscription_id", subscriptionId);

  if (error) {
    throw new Error(`Failed to load subscription sources: ${error.message}`);
  }

  const sourceIds = (data as SubscriptionSourceRow[] | null)?.map((row) => row.source_id).filter(Boolean) ?? [];

  return orderSources(Array.from(new Set(sourceIds)));
}

export async function getNoticesForSources(sourceIds: string[], window: DigestWindow): Promise<DigestNotice[]> {
  if (sourceIds.length === 0) return [];

  const { data, error } = await getSupabaseAdmin()
    .from("notices")
    .select("id,title,url,source_id,source_name,published_at,first_seen_at")
    .in("source_id", sourceIds)
    .gte("first_seen_at", window.start.toISOString())
    .lt("first_seen_at", window.end.toISOString())
    .order("first_seen_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to load digest notices: ${error.message}`);
  }

  return ((data as NoticeRow[] | null) ?? []).map((row) => {
    const localSource = sourceById.get(row.source_id);

    return {
      id: row.id,
      title: row.title,
      url: row.url,
      sourceId: row.source_id,
      sourceName: localSource?.name ?? row.source_name,
      publishedAt: row.published_at,
      firstSeenAt: row.first_seen_at
    };
  });
}

export async function buildDigest(
  subscriptionId: string,
  digestType: DigestType,
  window: DigestWindow
): Promise<Digest> {
  const subscribedSources = await getSubscriptionSources(subscriptionId);
  const notices = await getNoticesForSources(
    subscribedSources.map((source) => source.id),
    window
  );

  return {
    digestType,
    date: formatBeijingDate(window.end),
    periodStart: window.start.toISOString(),
    periodEnd: window.end.toISOString(),
    total: notices.length,
    sources: subscribedSources,
    groups: groupNotices(notices, subscribedSources)
  };
}

export async function getDigestWindowForSubscription(
  subscriptionId: string,
  digestType: DigestType,
  periodEnd: Date
): Promise<DigestWindow> {
  const { data, error } = await getSupabaseAdmin()
    .from("email_deliveries")
    .select("period_end")
    .eq("subscription_id", subscriptionId)
    .eq("digest_type", digestType)
    .in("status", ["accepted", "sent", "delivered", "suppressed", "bounced", "complained"])
    .lt("period_end", periodEnd.toISOString())
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load previous digest delivery: ${error.message}`);
  }

  return getDigestWindowFromLastSuccess(digestType, periodEnd, data?.period_end);
}

export async function getDigestDelivery(
  subscriptionId: string,
  digestType: DigestType,
  window: DigestWindow
): Promise<DigestDeliveryRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("email_deliveries")
    .select(deliveryColumns)
    .eq("subscription_id", subscriptionId)
    .eq("digest_type", digestType)
    .eq("period_start", window.start.toISOString())
    .eq("period_end", window.end.toISOString())
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load digest delivery state: ${error.message}`);
  }

  return data ? mapDelivery(data as DeliveryRow) : null;
}

export async function getDigestDeliveryById(deliveryId: string): Promise<DigestDeliveryRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("email_deliveries")
    .select(deliveryColumns)
    .eq("id", deliveryId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load digest delivery: ${error.message}`);
  return data ? mapDelivery(data as DeliveryRow) : null;
}

export async function getDigestDeliveryForPeriod(
  subscriptionId: string,
  digestType: DigestType,
  periodEnd: Date
): Promise<DigestDeliveryRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("email_deliveries")
    .select(deliveryColumns)
    .eq("subscription_id", subscriptionId)
    .eq("digest_type", digestType)
    .eq("period_end", periodEnd.toISOString())
    .maybeSingle();
  if (error) throw new Error(`Failed to locate digest delivery for period: ${error.message}`);
  return data ? mapDelivery(data as DeliveryRow) : null;
}

export async function hasSentDigest(subscriptionId: string, digestType: DigestType, window: DigestWindow) {
  const delivery = await getDigestDelivery(subscriptionId, digestType, window);
  return Boolean(delivery && (isAcceptedDeliveryStatus(delivery.status) || delivery.resendEmailId));
}

export async function getLatestPermanentDeliveryBlock(subscriptionId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("email_deliveries")
    .select(deliveryColumns)
    .eq("subscription_id", subscriptionId)
    .in("status", ["suppressed", "bounced", "complained"])
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to check permanent delivery block: ${error.message}`);
  return data ? mapDelivery(data as DeliveryRow) : null;
}

export async function claimDigestDelivery(params: {
  subscriptionId: string;
  digestType: DigestType;
  window: DigestWindow;
  noticeCount: number;
}) {
  const supabase = getSupabaseAdmin();
  const existing = await getDigestDelivery(params.subscriptionId, params.digestType, params.window);
  const now = new Date().toISOString();
  const idempotencyKey = createDigestIdempotencyKey(params.digestType, params.subscriptionId, params.window);

  if (existing) {
    const eligibility = evaluateRetryEligibility({
      deliveryStatus: existing.status,
      resendEmailId: existing.resendEmailId,
      subscriptionStatus: "active"
    });
    if (!eligibility.allowed) return { claimed: false, reason: eligibility.reason, delivery: existing } as const;

    const { data, error } = await supabase
      .from("email_deliveries")
      .update({
        status: "pending",
        notice_count: params.noticeCount,
        idempotency_key: existing.idempotencyKey ?? idempotencyKey,
        processing_started_at: now,
        updated_at: now
      })
      .eq("id", existing.id)
      .eq("status", "failed")
      .is("resend_email_id", null)
      .select(deliveryColumns)
      .maybeSingle();
    if (error) throw new Error(`Failed to claim failed digest delivery: ${error.message}`);
    if (!data) return { claimed: false, reason: "delivery_claimed_concurrently", delivery: existing } as const;
    return { claimed: true, reason: "retry_claimed", delivery: mapDelivery(data as DeliveryRow) } as const;
  }

  const { data, error } = await supabase
    .from("email_deliveries")
    .insert({
      subscription_id: params.subscriptionId,
      digest_type: params.digestType,
      period_start: params.window.start.toISOString(),
      period_end: params.window.end.toISOString(),
      notice_count: params.noticeCount,
      status: "pending",
      idempotency_key: idempotencyKey,
      processing_started_at: now,
      updated_at: now
    })
    .select(deliveryColumns)
    .single();
  if (error) {
    if (error.code === "23505") {
      const concurrent = await getDigestDelivery(params.subscriptionId, params.digestType, params.window);
      if (concurrent) return { claimed: false, reason: "delivery_claimed_concurrently", delivery: concurrent } as const;
    }
    throw new Error(`Failed to create digest delivery claim: ${error.message}`);
  }
  return { claimed: true, reason: "new_claim", delivery: mapDelivery(data as DeliveryRow) } as const;
}

export async function recordDigestDeliveryAccepted(params: {
  deliveryId: string;
  resendEmailId: string;
  attempt: number;
  durationMs: number;
  httpStatus: number;
  responseSummary: string;
}) {
  const now = new Date().toISOString();
  const { error } = await getSupabaseAdmin()
    .from("email_deliveries")
    .update({
      status: "accepted",
      resend_email_id: params.resendEmailId,
      accepted_at: now,
      sent_at: now,
      attempt_count: params.attempt,
      last_attempt_duration_ms: params.durationMs,
      http_status: params.httpStatus,
      resend_response: { id: params.resendEmailId, summary: params.responseSummary },
      error_message: null,
      error_details: null,
      updated_at: now
    })
    .eq("id", params.deliveryId)
    .select("id")
    .single();
  if (error) throw new Error(`Failed to record accepted digest delivery: ${error.message}`);
}

export async function recordDigestDeliveryFailure(params: {
  deliveryId: string;
  attempt: number;
  durationMs: number;
  httpStatus: number | null;
  errorMessage: string;
  errorDetails: SerializedRequestError;
  responseSummary: string | null;
}) {
  const { error } = await getSupabaseAdmin()
    .from("email_deliveries")
    .update({
      status: "failed",
      attempt_count: params.attempt,
      last_attempt_duration_ms: params.durationMs,
      http_status: params.httpStatus,
      error_message: params.errorMessage,
      error_details: params.errorDetails,
      resend_response: params.responseSummary ? { summary: params.responseSummary } : null,
      processing_started_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", params.deliveryId)
    .select("id")
    .single();
  if (error) throw new Error(`Failed to record failed digest delivery: ${error.message}`);
}

export async function getSubscriptionForRetry(subscriptionId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from("subscriptions")
    .select("id,email,frequency,status,unsubscribe_token")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (error) throw new Error(`Failed to load retry subscription: ${error.message}`);
  return data
    ? {
        id: String(data.id),
        email: String(data.email),
        frequency: data.frequency as DigestType,
        status: String(data.status),
        unsubscribeToken: String(data.unsubscribe_token ?? "")
      }
    : null;
}

export async function applyResendDeliveryEvent(params: {
  svixId: string;
  eventType: string;
  resendEmailId: string;
  eventCreatedAt: string;
  status: Extract<DeliveryStatus, "accepted" | "delivered" | "suppressed" | "bounced" | "complained" | "failed">;
  safeDetails: Record<string, unknown> | null;
}) {
  const supabase = getSupabaseAdmin();
  const { error: eventError } = await supabase.from("resend_webhook_events").insert({
    svix_id: params.svixId,
    event_type: params.eventType,
    resend_email_id: params.resendEmailId,
    event_created_at: params.eventCreatedAt
  });
  if (eventError?.code === "23505") {
    const { data: existingEvent, error: existingEventError } = await supabase
      .from("resend_webhook_events")
      .select("processed_at")
      .eq("svix_id", params.svixId)
      .single();
    if (existingEventError) throw new Error(`Failed to load duplicate Resend event: ${existingEventError.message}`);
    if (existingEvent.processed_at) return { processed: false, reason: "duplicate_event" } as const;
  }
  if (eventError && eventError.code !== "23505") {
    throw new Error(`Failed to record Resend webhook event: ${eventError.message}`);
  }

  const { data, error } = await supabase
    .from("email_deliveries")
    .select(deliveryColumns)
    .eq("resend_email_id", params.resendEmailId)
    .maybeSingle();
  if (error) throw new Error(`Failed to locate delivery for Resend webhook: ${error.message}`);
  if (!data) return { processed: false, reason: "delivery_not_found" } as const;

  const delivery = mapDelivery(data as DeliveryRow);
  if (delivery.lastEventAt && new Date(delivery.lastEventAt) > new Date(params.eventCreatedAt)) {
    await supabase
      .from("resend_webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_result: "stale_event" })
      .eq("svix_id", params.svixId);
    return { processed: false, reason: "stale_event" } as const;
  }

  const update: Record<string, unknown> = {
    status: params.status,
    last_event_at: params.eventCreatedAt,
    webhook_details: params.safeDetails,
    updated_at: new Date().toISOString()
  };
  if (params.status === "delivered") update.delivered_at = params.eventCreatedAt;
  if (params.status === "failed") update.error_message = "Resend webhook reported email.failed";

  const { error: updateError } = await supabase.from("email_deliveries").update(update).eq("id", delivery.id);
  if (updateError) throw new Error(`Failed to apply Resend webhook event: ${updateError.message}`);
  const { error: processedError } = await supabase
    .from("resend_webhook_events")
    .update({ processed_at: new Date().toISOString(), processing_result: "updated" })
    .eq("svix_id", params.svixId);
  if (processedError) throw new Error(`Failed to mark Resend webhook event processed: ${processedError.message}`);
  return { processed: true, reason: "updated" } as const;
}
