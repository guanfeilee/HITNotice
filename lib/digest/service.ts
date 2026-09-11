import closedHistory from "./closed-history.json";
import { startISO, endISO, validInstant } from "./precision";
import { sources } from "@/lib/sources";
import {
  formatBeijingDate,
  getDigestWindowFromLastSuccess,
} from "@/lib/digest/windows";
import type {
  Digest,
  DigestGroup,
  DigestNotice,
  DigestSource,
  DigestSubscription,
  DigestType,
  DigestWindow,
} from "@/lib/digest/types";
import {
  activeSubscriptions,
  subscriptionSources,
  subscriptionForRetry,
} from "@/lib/db/subscriptions";
import { digestNotices } from "@/lib/db/notices";
import { getAcceptedDigestDeliveryWindowsBefore } from "@/lib/db/deliveries";
export {
  getDigestDelivery,
  getDigestDeliveryById,
  getDigestDeliveryForPeriod,
  hasSentDigest,
  getLatestPermanentDeliveryBlock,
  claimDigestDelivery,
  recordDigestDeliveryAccepted,
  recordDigestDeliveryFailure,
  getAcceptedDigestDeliveryWindowsBefore,
  type DigestDeliveryRecord,
} from "@/lib/db/deliveries";
const sourceById = new Map(sources.map((source) => [source.id, source]));
function orderSources(sourceIds: string[]) {
  const selected = new Set(sourceIds);
  const known = sources
    .filter((source) => selected.has(source.id))
    .map((source) => ({
      id: source.id,
      name: source.name,
    }));
  const knownIds = new Set(known.map((source) => source.id));
  const unknown = sourceIds
    .filter((sourceId) => !knownIds.has(sourceId))
    .map((sourceId) => ({
      id: sourceId,
      name: sourceId,
    }));

  return [...known, ...unknown];
}

export function groupNotices(
  notices: DigestNotice[],
  subscribedSources: DigestSource[],
): DigestGroup[] {
  const groupsBySourceId = new Map<string, DigestGroup>();

  for (const source of subscribedSources) {
    groupsBySourceId.set(source.id, {
      sourceId: source.id,
      sourceName: source.name,
      notices: [],
      hasUpdates: false,
    });
  }

  for (const notice of notices) {
    const group = groupsBySourceId.get(notice.sourceId) ?? {
      sourceId: notice.sourceId,
      sourceName: notice.sourceName,
      notices: [],
      hasUpdates: false,
    };

    group.notices.push(notice);
    group.hasUpdates = group.notices.length > 0;
    groupsBySourceId.set(notice.sourceId, group);
  }

  return Array.from(groupsBySourceId.values()).map((group) => ({
    ...group,
    hasUpdates: group.notices.length > 0,
  }));
}

export async function getActiveDigestSubscriptions(
  type: DigestType,
): Promise<DigestSubscription[]> {
  return (await activeSubscriptions(type)).map((row) => ({
    id: String(row.id),
    email: String(row.email),
    frequency: type,
    unsubscribeToken: String(row.unsubscribe_token ?? ""),
  }));
}
export async function getSubscriptionSources(
  id: string,
): Promise<DigestSource[]> {
  return orderSources([
    ...new Set((await subscriptionSources(id)).map((r) => r.source_id)),
  ]);
}
export async function getNoticesForSources(
  ids: string[],
  window: DigestWindow,
): Promise<DigestNotice[]> {
  return (await digestNotices(ids, window)).map((row) => ({
    id: row.id,
    title: row.title,
    url: row.url,
    sourceId: row.source_id,
    sourceName: sourceById.get(row.source_id)?.name ?? row.source_name,
    publishedAt: row.published_at,
    firstSeenAt: row.first_seen_at,
  }));
}
export async function buildDigest(
  subscriptionId: string,
  digestType: DigestType,
  window: DigestWindow,
): Promise<Digest> {
  const subscribedSources = await getSubscriptionSources(subscriptionId);
  const notices = await getNoticesForSources(
    subscribedSources.map((source) => source.id),
    window,
  );

  return {
    digestType,
    date: formatBeijingDate(window.end),
    periodStart: startISO(window),
    periodEnd: endISO(window),
    total: notices.length,
    sources: subscribedSources,
    groups: groupNotices(notices, subscribedSources),
  };
}

export async function getDigestWindowForSubscription(
  id: string,
  type: DigestType,
  end: Date,
): Promise<DigestWindow> {
  const rows = await getAcceptedDigestDeliveryWindowsBefore(id, type, end);
  const anchor = rows[0];
  const window = getDigestWindowFromLastSuccess(type, end, anchor?.period_end);
  return { ...window,
    startIso: anchor ? validInstant(anchor.period_end) : window.start.toISOString(),
    endIso: end.toISOString(),
    startInclusive: !anchor || !(anchor.end_inclusive === true || closedHistory.includes(anchor.id)),
    endInclusive: true,
  };
}
export async function getSubscriptionForRetry(id: string) {
  const row = await subscriptionForRetry(id);
  return row
    ? {
        id: String(row.id),
        email: String(row.email),
        frequency: row.frequency as DigestType,
        status: String(row.status),
        unsubscribeToken: String(row.unsubscribe_token ?? ""),
      }
    : null;
}
