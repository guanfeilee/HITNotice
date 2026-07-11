import { createClient } from "@supabase/supabase-js";
import { getCrawlerHealth, type SourceHealth } from "@/lib/crawler/health";
import { crawlSources } from "@/lib/crawler/sources";
import { formatBeijingDate, formatBeijingDateTime } from "@/lib/digest/windows";
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
  status: "success" | "failed" | "no_data";
  lastDigestPeriodEnd: string | null;
  recipients: number;
  successful: number;
  failed: number;
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
  digest: HealthDigestStatus;
  overallStatus: "healthy" | "degraded" | "failed";
};

type NoticeCountRow = {
  source_id: string;
  source_name: string;
};

type EmailDeliveryRow = {
  period_end: string;
  status: "pending" | "sent" | "failed" | "skipped";
  error_message: string | null;
};

type HealthReportInput = {
  now?: Date;
  crawlerHealth: SourceHealth[];
  noticeCounts: Map<string, number>;
  digest: HealthDigestStatus;
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

export async function getDigestHealthStatus(): Promise<HealthDigestStatus> {
  const { data, error } = await getSupabaseAdmin()
    .from("email_deliveries")
    .select("period_end,status,error_message")
    .eq("digest_type", "daily_digest")
    .order("period_end", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(`Failed to load digest delivery health: ${error.message}`);
  }

  const rows = (data as EmailDeliveryRow[] | null) ?? [];
  const latestPeriodEnd = rows[0]?.period_end ?? null;

  if (!latestPeriodEnd) {
    return {
      status: "no_data",
      lastDigestPeriodEnd: null,
      recipients: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      lastError: "No digest delivery recorded"
    };
  }

  const latestRows = rows.filter((row) => row.period_end === latestPeriodEnd);
  const successful = latestRows.filter((row) => row.status === "sent").length;
  const failed = latestRows.filter((row) => row.status === "failed").length;
  const skipped = latestRows.filter((row) => row.status === "skipped").length;
  const lastError = latestRows.find((row) => row.error_message)?.error_message ?? null;

  return {
    status: failed === 0 && successful > 0 ? "success" : "failed",
    lastDigestPeriodEnd: latestPeriodEnd,
    recipients: successful + failed + skipped,
    successful,
    failed,
    skipped,
    lastError
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
  const overallStatus =
    failedSources > 0 || input.digest.status === "failed"
      ? "failed"
      : noDataSources > 0 || input.digest.status === "no_data"
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
    digest: input.digest,
    overallStatus
  };
}

export async function generateHealthReport(now = new Date()) {
  const window = getHealthWindow(now);
  const [crawlerHealth, noticeCounts, digest] = await Promise.all([
    getCrawlerHealth(),
    getNewNoticeCountsBySource(window),
    getDigestHealthStatus()
  ]);

  return buildHealthReport({
    now,
    crawlerHealth,
    noticeCounts,
    digest
  });
}

function formatSourceStatus(status: HealthSourceStatus["status"]) {
  if (status === "healthy") return "Healthy";
  if (status === "failed") return "Failed";
  return "No data";
}

function formatDigestStatus(status: HealthDigestStatus["status"]) {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  return "No data";
}

export function renderHealthReportText(report: HealthReport) {
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
    "Last digest:",
    formatDigestStatus(report.digest.status),
    "",
    "Recipients:",
    String(report.digest.recipients),
    "",
    "Successful:",
    String(report.digest.successful),
    "",
    "Failed:",
    String(report.digest.failed),
    ...(report.digest.lastError ? ["", "Reason:", report.digest.lastError] : []),
    "",
    "================================",
    "",
    "Overall Status",
    "",
    report.overallStatus
  ];

  return sections.join("\n");
}
