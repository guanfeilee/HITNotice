import { createClient } from "@supabase/supabase-js";
import { getCrawlerHealth, type SourceHealth } from "@/lib/crawler/health";
import { crawlSources } from "@/lib/crawler/sources";
import {
  formatBeijingDate,
  formatBeijingDateTime,
  getCurrentDigestPeriodEnd,
  getDefaultDigestWindow,
  getDueDigestTypes
} from "@/lib/digest/windows";
import { getScheduledDigestRun, type DigestRunRecord, type DigestRunStatus } from "@/lib/digest/runs";
import type { DigestType, DigestWindow } from "@/lib/digest/types";
import { getSupabaseAdminEnv, supabaseClientOptions } from "@/lib/supabase/config";

const dayMs = 24 * 60 * 60 * 1000;
export const crawlerFreshnessMs = 60 * 60 * 1000;
export const digestGraceMs = 10 * 60 * 1000;
export const pendingTimeoutMs = 30 * 60 * 1000;

export type HealthSourceStatus = {
  sourceId: string;
  sourceName: string;
  status: "healthy" | "failed" | "stale" | "no_data";
  freshness: "fresh" | "stale" | "no_data";
  lastRunAt: string | null;
  newNotices: number;
  lastError: string | null;
  crawlSuccess: boolean;
};

export type DigestHealthState =
  | "scheduled"
  | "running"
  | "success"
  | "partial_success"
  | "failed"
  | "missing"
  | "not_scheduled";

export type HealthDigestStatus = {
  digestType: DigestType;
  scheduleStatus: "scheduled" | "not_scheduled";
  status: DigestHealthState;
  runStatus: DigestRunStatus | null;
  periodStart: string | null;
  periodEnd: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  elapsedMinutes: number | null;
  users: number;
  recipients: number;
  skipped: number;
  blocked: number;
  failed: number;
  accepted: number;
  sent: number;
  delivered: number;
  suppressed: number;
  bounced: number;
  complained: number;
  pending: number;
  stalePending: number;
  deliveryFailed: number;
  successful: number;
  webhookTracking: boolean;
  reason: string | null;
  lastError: string | null;
};

export type HealthReport = {
  title: string;
  date: string;
  periodStart: string;
  periodEnd: string;
  totalSources: number;
  successfulSources: number;
  failedSources: number;
  staleSources: number;
  noDataSources: number;
  totalNewNotices: number;
  sources: HealthSourceStatus[];
  digests: Record<DigestType, HealthDigestStatus>;
  overallStatus: "healthy" | "degraded" | "failed";
};

type NoticeCountRow = {
  source_id: string;
  source_name: string;
};

export type EmailDeliveryHealthRow = {
  status:
    | "pending"
    | "accepted"
    | "sent"
    | "delivered"
    | "suppressed"
    | "bounced"
    | "complained"
    | "failed"
    | "skipped";
  accepted_at: string | null;
  sent_at: string | null;
  error_message: string | null;
  processing_started_at: string | null;
  created_at: string;
};

type HealthReportInput = {
  now?: Date;
  crawlerHealth: SourceHealth[];
  noticeCounts: Map<string, number>;
  digests: Record<DigestType, HealthDigestStatus>;
};

function getSupabaseAdmin() {
  const envResult = getSupabaseAdminEnv();
  if (!envResult.ok) throw new Error(envResult.error);
  return createClient(envResult.env.supabaseUrl, envResult.env.serviceRoleKey, supabaseClientOptions);
}

export function getHealthWindow(now = new Date()) {
  return {
    start: new Date(now.getTime() - dayMs),
    end: now
  };
}

export async function getNewNoticeCountsBySource(window = getHealthWindow()) {
  const { data, error } = await getSupabaseAdmin()
    .from("notices")
    .select("source_id,source_name")
    .gte("first_seen_at", window.start.toISOString())
    .lt("first_seen_at", window.end.toISOString())
    .limit(10000);

  if (error) throw new Error(`Failed to load health notice counts: ${error.message}`);

  const counts = new Map<string, number>();
  for (const row of ((data as NoticeCountRow[] | null) ?? [])) {
    if (!row.source_id) continue;
    counts.set(row.source_id, (counts.get(row.source_id) ?? 0) + 1);
  }
  return counts;
}

export function getDigestSchedule(
  digestType: DigestType,
  now = new Date()
): { scheduled: boolean; window: DigestWindow | null } {
  const scheduled = getDueDigestTypes(now).includes(digestType);
  if (!scheduled) return { scheduled: false, window: null };

  const periodEnd = getCurrentDigestPeriodEnd(now);
  return {
    scheduled: true,
    window: getDefaultDigestWindow(digestType, periodEnd)
  };
}

export function calculateDeliveryHealthMetrics(rows: EmailDeliveryHealthRow[], now = new Date()) {
  const delivered = rows.filter((row) => row.status === "delivered").length;
  const sent = rows.filter((row) => row.status === "sent").length;
  const suppressed = rows.filter((row) => row.status === "suppressed").length;
  const bounced = rows.filter((row) => row.status === "bounced").length;
  const complained = rows.filter((row) => row.status === "complained").length;
  const deliveryFailed = rows.filter((row) => row.status === "failed").length;
  const pendingRows = rows.filter((row) => row.status === "pending");
  const pending = pendingRows.length;
  const stalePending = pendingRows.filter((row) => {
    const startedAt = new Date(row.processing_started_at ?? row.created_at).getTime();
    return Number.isFinite(startedAt) && now.getTime() - startedAt >= pendingTimeoutMs;
  }).length;
  const accepted = rows.filter(
    (row) =>
      Boolean(row.accepted_at || row.sent_at) ||
      ["accepted", "sent", "delivered", "suppressed", "bounced", "complained"].includes(row.status)
  ).length;
  const successful = Math.max(0, accepted - suppressed - bounced - complained);

  return {
    accepted,
    sent,
    delivered,
    suppressed,
    bounced,
    complained,
    pending,
    stalePending,
    deliveryFailed,
    successful
  };
}

function emptyDeliveryMetrics() {
  return calculateDeliveryHealthMetrics([]);
}

function getElapsedMinutes(startedAt: string | null, finishedAt: string | null, now: Date) {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / 60000));
}

function emptyDigestStatus(params: {
  digestType: DigestType;
  scheduleStatus: "scheduled" | "not_scheduled";
  status: DigestHealthState;
  window: DigestWindow | null;
  webhookTracking: boolean;
  reason: string;
}): HealthDigestStatus {
  return {
    digestType: params.digestType,
    scheduleStatus: params.scheduleStatus,
    status: params.status,
    runStatus: null,
    periodStart: params.window?.start.toISOString() ?? null,
    periodEnd: params.window?.end.toISOString() ?? null,
    startedAt: null,
    finishedAt: null,
    elapsedMinutes: null,
    users: 0,
    recipients: 0,
    skipped: 0,
    blocked: 0,
    failed: 0,
    ...emptyDeliveryMetrics(),
    webhookTracking: params.webhookTracking,
    reason: params.reason,
    lastError: null
  };
}

export function buildDigestHealthStatus(params: {
  digestType: DigestType;
  now: Date;
  schedule: { scheduled: boolean; window: DigestWindow | null };
  run: DigestRunRecord | null;
  deliveries: EmailDeliveryHealthRow[];
  webhookTracking: boolean;
}): HealthDigestStatus {
  const { digestType, now, schedule, run, deliveries, webhookTracking } = params;
  if (!schedule.scheduled || !schedule.window) {
    return emptyDigestStatus({
      digestType,
      scheduleStatus: "not_scheduled",
      status: "not_scheduled",
      window: null,
      webhookTracking,
      reason: "Digest is not scheduled for the current Beijing date"
    });
  }

  const deadline = schedule.window.end.getTime() + digestGraceMs;
  if (!run) {
    const beforeDeadline = now.getTime() < deadline;
    return emptyDigestStatus({
      digestType,
      scheduleStatus: "scheduled",
      status: beforeDeadline ? "scheduled" : "missing",
      window: schedule.window,
      webhookTracking,
      reason: beforeDeadline
        ? "Waiting for the scheduled digest window"
        : "Scheduled digest run not recorded"
    });
  }

  const metrics = calculateDeliveryHealthMetrics(deliveries, now);
  const elapsedMinutes = getElapsedMinutes(run.startedAt, run.finishedAt, now);
  let status: DigestHealthState;
  let reason: string | null = null;

  if (run.status === "running") {
    const stuck = now.getTime() >= deadline;
    status = stuck ? "failed" : "running";
    reason = stuck ? "Scheduled digest run is still running after the grace period" : "Scheduled digest run is active";
  } else if (run.status === "failed") {
    status = "failed";
    reason = run.errorMessage ?? "Scheduled digest run failed";
  } else if (run.status === "partial_success" || run.failed > 0) {
    status = "partial_success";
    reason = run.errorMessage ?? "Some subscriptions failed during the scheduled digest run";
  } else if (
    metrics.suppressed > 0 ||
    metrics.bounced > 0 ||
    metrics.complained > 0 ||
    metrics.deliveryFailed > 0 ||
    metrics.stalePending > 0
  ) {
    status = "partial_success";
    reason = "Scheduled digest completed with delivery warnings";
  } else {
    status = "success";
    if (run.users > 0 && run.recipients === 0 && run.skipped === run.users) {
      reason = "No matching notices for all active subscriptions";
    } else if (!webhookTracking && run.recipients > 0) {
      reason = "Final delivery tracking unavailable because the Resend webhook is not configured";
    }
  }

  const deliveryError = deliveries.find((row) => row.error_message)?.error_message ?? null;
  return {
    digestType,
    scheduleStatus: "scheduled",
    status,
    runStatus: run.status,
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    elapsedMinutes,
    users: run.users,
    recipients: run.recipients,
    skipped: run.skipped,
    blocked: run.blocked,
    failed: run.failed,
    ...metrics,
    webhookTracking,
    reason,
    lastError: run.errorMessage ?? deliveryError
  };
}

async function getDeliveriesForScheduledRun(digestType: DigestType, window: DigestWindow) {
  const { data, error } = await getSupabaseAdmin()
    .from("email_deliveries")
    .select("status,accepted_at,sent_at,error_message,processing_started_at,created_at")
    .eq("digest_type", digestType)
    .eq("period_end", window.end.toISOString());
  if (error) throw new Error(`Failed to load ${digestType} scheduled delivery health: ${error.message}`);
  return (data as EmailDeliveryHealthRow[] | null) ?? [];
}

export async function getDigestHealthStatus(
  digestType: DigestType,
  now = new Date()
): Promise<HealthDigestStatus> {
  const schedule = getDigestSchedule(digestType, now);
  const webhookTracking = Boolean(process.env.RESEND_WEBHOOK_SECRET);
  if (!schedule.scheduled || !schedule.window) {
    return buildDigestHealthStatus({
      digestType,
      now,
      schedule,
      run: null,
      deliveries: [],
      webhookTracking
    });
  }

  const run = await getScheduledDigestRun(digestType, schedule.window);
  const deliveries = run ? await getDeliveriesForScheduledRun(digestType, schedule.window) : [];
  return buildDigestHealthStatus({
    digestType,
    now,
    schedule,
    run,
    deliveries,
    webhookTracking
  });
}

export function buildHealthReport(input: HealthReportInput): HealthReport {
  const now = input.now ?? new Date();
  const window = getHealthWindow(now);
  const sourceHealthById = new Map(input.crawlerHealth.map((health) => [health.sourceId, health]));
  const sources = crawlSources.map((source) => {
    const health = sourceHealthById.get(source.id);
    const lastRunAt = health?.finishedAt ?? health?.startedAt ?? null;
    const lastRunTime = lastRunAt ? new Date(lastRunAt).getTime() : Number.NaN;
    const isFresh = Number.isFinite(lastRunTime) && now.getTime() - lastRunTime <= crawlerFreshnessMs;
    const freshness = !lastRunAt ? "no_data" : isFresh ? "fresh" : "stale";
    const status =
      freshness === "no_data"
        ? "no_data"
        : freshness === "stale"
          ? "stale"
          : health?.status === "OK"
            ? "healthy"
            : "failed";

    return {
      sourceId: source.id,
      sourceName: health?.sourceName ?? source.name,
      status,
      freshness,
      lastRunAt,
      newNotices: input.noticeCounts.get(source.id) ?? 0,
      lastError:
        status === "healthy"
          ? null
          : status === "stale"
            ? "No crawler run recorded within the freshness threshold"
            : health?.errorMessage ?? "No crawl run recorded",
      crawlSuccess: status === "healthy"
    } satisfies HealthSourceStatus;
  });

  const successfulSources = sources.filter((source) => source.status === "healthy").length;
  const failedSources = sources.filter((source) => source.status === "failed").length;
  const staleSources = sources.filter((source) => source.status === "stale").length;
  const noDataSources = sources.filter((source) => source.status === "no_data").length;
  const totalNewNotices = sources.reduce((sum, source) => sum + source.newNotices, 0);
  const digestStatuses = Object.values(input.digests);
  const overallStatus =
    failedSources > 0 ||
    staleSources > 0 ||
    noDataSources > 0 ||
    digestStatuses.some((digest) => ["failed", "missing"].includes(digest.status))
      ? "failed"
      : digestStatuses.some((digest) => ["partial_success", "running"].includes(digest.status))
        ? "degraded"
        : "healthy";

  return {
    title: "HITnotice Daily Health Report",
    date: formatBeijingDate(now),
    periodStart: window.start.toISOString(),
    periodEnd: window.end.toISOString(),
    totalSources: sources.length,
    successfulSources,
    failedSources,
    staleSources,
    noDataSources,
    totalNewNotices,
    sources,
    digests: input.digests,
    overallStatus
  };
}

export async function generateHealthReport(now = new Date()) {
  const window = getHealthWindow(now);
  const [crawlerHealth, noticeCounts, weekdayDigest, weeklyDigest] = await Promise.all([
    getCrawlerHealth(),
    getNewNoticeCountsBySource(window),
    getDigestHealthStatus("weekday_digest", now),
    getDigestHealthStatus("weekly_digest", now)
  ]);

  return buildHealthReport({
    now,
    crawlerHealth,
    noticeCounts,
    digests: {
      weekday_digest: weekdayDigest,
      weekly_digest: weeklyDigest
    }
  });
}

function displayTime(value: string | null) {
  return value ? formatBeijingDateTime(value) : "Not available";
}

export function getDigestDisplayFields(digest: HealthDigestStatus) {
  return [
    ["Schedule status", digest.scheduleStatus],
    ["Health status", digest.status],
    ["Run status", digest.runStatus ?? "Not recorded"],
    ["Period start", displayTime(digest.periodStart)],
    ["Period end", displayTime(digest.periodEnd)],
    ["Started at", displayTime(digest.startedAt)],
    ["Finished at", displayTime(digest.finishedAt)],
    ["Elapsed", digest.elapsedMinutes === null ? "Not available" : `${digest.elapsedMinutes} min`],
    ["Users", String(digest.users)],
    ["Recipients", String(digest.recipients)],
    ["Skipped: no matching notices", String(digest.skipped)],
    ["Blocked", String(digest.blocked)],
    ["User failures", String(digest.failed)],
    ["Accepted", String(digest.accepted)],
    ["Sent", String(digest.sent)],
    ["Delivered", String(digest.delivered)],
    ["Suppressed", String(digest.suppressed)],
    ["Bounced", String(digest.bounced)],
    ["Complained", String(digest.complained)],
    ["Pending", String(digest.pending)],
    ["Stale pending", String(digest.stalePending)],
    ["Delivery failed", String(digest.deliveryFailed)],
    ["Webhook tracking", digest.webhookTracking ? "Enabled" : "Not configured"],
    ["Reason", digest.reason ?? "None"],
    ["Last error", digest.lastError ?? "None"]
  ] as const;
}

export function renderHealthReportText(report: HealthReport) {
  const digestSections = (["weekday_digest", "weekly_digest"] as const).flatMap((digestType) => {
    const digest = report.digests[digestType];
    return [
      digestType,
      "",
      ...getDigestDisplayFields(digest).flatMap(([label, value]) => [`${label}:`, value, ""]),
      "--------------------------------",
      ""
    ];
  });

  const sections = [
    report.title,
    "",
    "日期：",
    report.date,
    "",
    `Crawler: ${report.successfulSources} healthy, ${report.failedSources} failed, ${report.staleSources} stale, ${report.noDataSources} no data`,
    `Weekday: ${report.digests.weekday_digest.status}, ${report.digests.weekday_digest.users} users, ${report.digests.weekday_digest.recipients} recipients, ${report.digests.weekday_digest.skipped} skipped`,
    `Weekly: ${report.digests.weekly_digest.status}, ${report.digests.weekly_digest.users} users, ${report.digests.weekly_digest.recipients} recipients, ${report.digests.weekly_digest.skipped} skipped`,
    `Overall: ${report.overallStatus}`,
    "",
    "================================",
    "",
    "Crawler Status",
    "",
    "Total sources:",
    String(report.totalSources),
    "",
    "New notices in the last 24 hours:",
    String(report.totalNewNotices),
    "",
    "Window:",
    `${formatBeijingDateTime(report.periodStart)} - ${formatBeijingDateTime(report.periodEnd)}`,
    "",
    ...report.sources.flatMap((source) => [
      source.sourceName,
      "",
      "Freshness:",
      source.freshness,
      "",
      "Last crawl:",
      displayTime(source.lastRunAt),
      "",
      "Status:",
      source.status,
      "",
      "New notices in the last 24 hours:",
      String(source.newNotices),
      "",
      "Error:",
      source.lastError ?? "None",
      "",
      "--------------------------------",
      ""
    ]),
    "================================",
    "",
    "Digest Status",
    "",
    ...digestSections,
    "================================",
    "",
    "Overall Status",
    "",
    report.overallStatus
  ];

  return sections.join("\n");
}
