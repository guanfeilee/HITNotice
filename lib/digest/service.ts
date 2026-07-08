import { createClient } from "@supabase/supabase-js";
import { sources } from "@/lib/sources";
import { getSupabaseAdminEnv, supabaseClientOptions } from "@/lib/supabase/config";
import { formatBeijingDate } from "@/lib/digest/windows";
import type {
  DailyDigest,
  DigestGroup,
  DigestNotice,
  DigestSource,
  DigestSubscription,
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

function groupNotices(notices: DigestNotice[], subscribedSources: DigestSource[]): DigestGroup[] {
  const groupsBySourceId = new Map<string, DigestGroup>();

  for (const source of subscribedSources) {
    groupsBySourceId.set(source.id, {
      sourceId: source.id,
      sourceName: source.name,
      notices: []
    });
  }

  for (const notice of notices) {
    const group =
      groupsBySourceId.get(notice.sourceId) ??
      {
        sourceId: notice.sourceId,
        sourceName: notice.sourceName,
        notices: []
      };

    group.notices.push(notice);
    groupsBySourceId.set(notice.sourceId, group);
  }

  return Array.from(groupsBySourceId.values()).filter((group) => group.notices.length > 0);
}

export async function getActiveDailyDigestSubscriptions(): Promise<DigestSubscription[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("subscriptions")
    .select("id,email,frequency,unsubscribe_token")
    .eq("status", "active")
    .eq("frequency", "daily_digest")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load active digest subscriptions: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    email: String(row.email),
    frequency: "daily_digest",
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

export async function buildDailyDigest(subscriptionId: string, window: DigestWindow): Promise<DailyDigest> {
  const subscribedSources = await getSubscriptionSources(subscriptionId);
  const notices = await getNoticesForSources(
    subscribedSources.map((source) => source.id),
    window
  );

  return {
    digestType: "daily_digest",
    date: formatBeijingDate(window.end),
    periodStart: window.start.toISOString(),
    periodEnd: window.end.toISOString(),
    total: notices.length,
    sources: subscribedSources,
    groups: groupNotices(notices, subscribedSources)
  };
}

export async function hasSentDigest(subscriptionId: string, window: DigestWindow) {
  const { data, error } = await getSupabaseAdmin()
    .from("email_deliveries")
    .select("id")
    .eq("subscription_id", subscriptionId)
    .eq("digest_type", "daily_digest")
    .eq("period_start", window.start.toISOString())
    .eq("period_end", window.end.toISOString())
    .eq("status", "sent")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to check digest delivery state: ${error.message}`);
  }

  return Boolean(data);
}

export async function recordDigestDelivery(params: {
  subscriptionId: string;
  window: DigestWindow;
  noticeCount: number;
  status: "sent" | "failed" | "skipped";
  errorMessage?: string;
}) {
  const { error } = await getSupabaseAdmin().from("email_deliveries").upsert(
    {
      subscription_id: params.subscriptionId,
      digest_type: "daily_digest",
      period_start: params.window.start.toISOString(),
      period_end: params.window.end.toISOString(),
      notice_count: params.noticeCount,
      status: params.status,
      sent_at: params.status === "sent" ? new Date().toISOString() : null,
      error_message: params.errorMessage ?? null
    },
    {
      onConflict: "subscription_id,digest_type,period_start,period_end"
    }
  );

  if (error) {
    throw new Error(`Failed to record digest delivery: ${error.message}`);
  }
}
