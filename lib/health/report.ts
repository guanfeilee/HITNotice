import { createClient } from "@supabase/supabase-js";
import { getCrawlerHealth, type SourceHealth } from "@/lib/crawler/health";
import { crawlSources } from "@/lib/crawler/sources";
import { formatBeijingDate, formatBeijingDateTime } from "@/lib/digest/windows";
import type { DigestType } from "@/lib/digest/types";
import { getSupabaseAdminEnv, supabaseClientOptions } from "@/lib/supabase/config";

const dayMs = 24 * 60 * 60 * 1000;

export type HealthSourceStatus = {
  sourceId: string;
  sourceName: string;
  status: "healthy" | "failed" | "no_data";
  newNotices: number;
  lastError: string | null;
  crawlSuccess: boolean;
};

export type HealthDigestStatus = {
  digestType: DigestType;
  status: "success" | "partial_success" | "failed" | "no_data";
  lastDigestPeriodEnd: string | null;
  users: number;
  recipients: number;
  accepted: number;
  delivered: number;
  suppressed: number;
  bounced: number;
  complained: number;
  successful: number;
  failed: number;
  pending: number;
  skipped: number;
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

type EmailDeliveryRow = {
  period_end: string;
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
};

type HealthReportInput = {
  now?: Date;
  crawlerHealth: SourceHealth[];
  noticeCounts: Map<string, number>;
  digests: Record<DigestType, HealthDigestStatus>;
};

function getSupabaseAdmin() {
  const envResult = getSupabaseAdminEnv();

  if (!envResult.ok) {
    throw new Error(envResult.error);
  }

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

  if (error) {
    throw new Error(`Failed to load health notice counts: ${error.message}`);
  }

  const counts = new Map<string, number>();

  for (const row of ((data as NoticeCountRow[] | null) ?? [])) {
    if (!row.source_id) continue;
    counts.set(row.source_id, (counts.get(row.source_id) ?? 0) + 1);
  }

  return counts;
}

export async function getDigestHealthStatus(digestType: DigestType): Promise<HealthDigestStatus> {
  const supabase = getSupabaseAdmin();
  const [subscriptionsResult, latestDeliveryResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .eq("frequency", digestType),
    supabase
      .from("email_deliveries")
      .select("period_end")
      .eq("digest_type", digestType)
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (subscriptionsResult.error) {
    throw new Error(`Failed to load ${digestType} subscription health: ${subscriptionsResult.error.message}`);
  }

  if (latestDeliveryResult.error) {
    throw new Error(`Failed to load ${digestType} delivery health: ${latestDeliveryResult.error.message}`);
  }

  const users = subscriptionsResult.count ?? 0;
  const latestPeriodEnd = latestDeliveryResult.data?.period_end ?? null;

  if (!latestPeriodEnd) {
    return {
      digestType,
      status: "no_data",
      lastDigestPeriodEnd: null,
      users,
      recipients: 0,
      accepted: 0,
      delivered: 0,
      suppressed: 0,
      bounced: 0,
      complained: 0,
      successful: 0,
      failed: 0,
      pending: 0,
      skipped: 0,
      lastError: "No digest delivery recorded"
    };
  }

  const { data: latestRowsData, error: latestRowsError } = await supabase
    .from("email_deliveries")
    .select("period_end,status,accepted_at,sent_at,error_message")
    .eq("digest_type", digestType)
    .eq("period_end", latestPeriodEnd);
  if (latestRowsError) {
    throw new Error(`Failed to load ${digestType} latest delivery batch: ${latestRowsError.message}`);
  }
  const latestRows = (latestRowsData as EmailDeliveryRow[] | null) ?? [];
  const metrics = calculateDigestHealthMetrics(latestRows);
  const lastError = latestRows.find((row) => row.error_message)?.error_message ?? null;

  return {
    digestType,
    lastDigestPeriodEnd: latestPeriodEnd,
    users,
    ...metrics,
    lastError
  };
}

export function calculateDigestHealthMetrics(rows: EmailDeliveryRow[]) {
  const delivered = rows.filter((row) => row.status === "delivered").length;
  const suppressed = rows.filter((row) => row.status === "suppressed").length;
  const bounced = rows.filter((row) => row.status === "bounced").length;
  const complained = rows.filter((row) => row.status === "complained").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const pending = rows.filter((row) => row.status === "pending").length;
  const skipped = rows.filter((row) => row.status === "skipped").length;
  const accepted = rows.filter(
    (row) =>
      Boolean(row.accepted_at || row.sent_at) ||
      ["accepted", "sent", "delivered", "suppressed", "bounced", "complained"].includes(row.status)
  ).length;
  const adverse = suppressed + bounced + complained + failed + pending;
  const successful = Math.max(0, accepted - suppressed - bounced - complained);
  let status: HealthDigestStatus["status"] = "no_data";
  if (pending > 0) status = "failed";
  else if (adverse === 0 && successful > 0) status = "success";
  else if (successful > 0 && adverse > 0) status = "partial_success";
  else if (adverse > 0) status = "failed";

  return {
    status,
    recipients: rows.length,
    accepted,
    delivered,
    suppressed,
    bounced,
    complained,
    successful,
    failed,
    pending,
    skipped
  };
}

export function buildHealthReport(input: HealthReportInput): HealthReport {
  const now = input.now ?? new Date();
  const window = getHealthWindow(now);
  const sourceHealthById = new Map(input.crawlerHealth.map((health) => [health.sourceId, health]));
  const sources = crawlSources.map((source) => {
    const health = sourceHealthById.get(source.id);
    const status = health?.status === "OK" ? "healthy" : health?.status === "FAIL" ? "failed" : "no_data";

    return {
      sourceId: source.id,
      sourceName: health?.sourceName ?? source.name,
      status,
      newNotices: input.noticeCounts.get(source.id) ?? 0,
      lastError: status === "healthy" ? null : health?.errorMessage ?? "No crawl run recorded",
      crawlSuccess: status === "healthy"
    } satisfies HealthSourceStatus;
  });

  const successfulSources = sources.filter((source) => source.status === "healthy").length;
  const failedSources = sources.filter((source) => source.status === "failed").length;
  const noDataSources = sources.filter((source) => source.status === "no_data").length;
  const totalNewNotices = sources.reduce((sum, source) => sum + source.newNotices, 0);
  const digestStatuses = Object.values(input.digests);
  const overallStatus =
    failedSources > 0 || digestStatuses.some((digest) => digest.status === "failed")
      ? "failed"
      : noDataSources > 0 || digestStatuses.some((digest) => ["partial_success", "no_data"].includes(digest.status))
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
    getDigestHealthStatus("weekday_digest"),
    getDigestHealthStatus("weekly_digest")
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

function formatSourceStatus(status: HealthSourceStatus["status"]) {
  if (status === "healthy") return "Healthy";
  if (status === "failed") return "Failed";
  return "No data";
}

function formatDigestStatus(status: HealthDigestStatus["status"]) {
  if (status === "success") return "Success";
  if (status === "partial_success") return "Partial success";
  if (status === "failed") return "Failed";
  return "No data";
}

export function renderHealthReportText(report: HealthReport) {
  const digestSections = (["weekday_digest", "weekly_digest"] as const).flatMap((digestType) => {
    const digest = report.digests[digestType];

    return [
      digestType,
      "",
      "Status:",
      formatDigestStatus(digest.status),
      "",
      "Users:",
      String(digest.users),
      "",
      "Accepted:",
      String(digest.accepted),
      "",
      "Delivered:",
      String(digest.delivered),
      "",
      "Suppressed:",
      String(digest.suppressed),
      "",
      "Failed:",
      String(digest.failed),
      "",
      "Latest delivery:",
      digest.lastDigestPeriodEnd ? formatBeijingDateTime(digest.lastDigestPeriodEnd) : "No data",
      ...(digest.lastError ? ["", "Reason:", digest.lastError] : []),
      "",
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
    "================================",
    "",
    "Crawler Status",
    "",
    "Total sources:",
    String(report.totalSources),
    "",
    "Successful:",
    String(report.successfulSources),
    "",
    "Failed:",
    String(report.failedSources),
    "",
    "No data:",
    String(report.noDataSources),
    "",
    "New notices:",
    String(report.totalNewNotices),
    "",
    "Window:",
    `${formatBeijingDateTime(report.periodStart)} - ${formatBeijingDateTime(report.periodEnd)}`,
    "",
    "================================",
    "",
    "Source Status",
    "",
    ...report.sources.flatMap((source) => [
      source.sourceName,
      "",
      "Status:",
      formatSourceStatus(source.status),
      "",
      "New notices:",
      String(source.newNotices),
      ...(source.lastError ? ["", "Reason:", source.lastError] : []),
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
