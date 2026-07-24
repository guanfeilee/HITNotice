import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminEnv, supabaseClientOptions } from "@/lib/supabase/config";
import type { DigestType, DigestWindow } from "@/lib/digest/types";

export type DigestRunKind = "scheduled" | "retry";
export type DigestRunStatus = "running" | "success" | "partial_success" | "failed";
export type CompletedDigestRunStatus = Exclude<DigestRunStatus, "running">;

export type DigestRunStats = {
  users: number;
  recipients: number;
  skipped: number;
  blocked: number;
  failed: number;
  notices: number;
  accepted: number;
  deliverySkipped: number;
};

export type DigestRunRecord = {
  id: string;
  digestType: DigestType;
  runKind: DigestRunKind;
  periodStart: string;
  periodEnd: string;
  startedAt: string;
  finishedAt: string | null;
  status: DigestRunStatus;
  users: number;
  recipients: number;
  skipped: number;
  blocked: number;
  failed: number;
  errorMessage: string | null;
  metadata: Record<string, unknown>;
};

type DigestRunRow = {
  id: string;
  digest_type: DigestType;
  run_kind: DigestRunKind;
  period_start: string;
  period_end: string;
  started_at: string;
  finished_at: string | null;
  status: DigestRunStatus;
  users: number;
  recipients: number;
  skipped: number;
  blocked: number;
  failed: number;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
};

const digestRunColumns =
  "id,digest_type,run_kind,period_start,period_end,started_at,finished_at,status,users,recipients,skipped,blocked,failed,error_message,metadata";

function getSupabaseAdmin() {
  const envResult = getSupabaseAdminEnv();
  if (!envResult.ok) throw new Error(envResult.error);
  return createClient(envResult.env.supabaseUrl, envResult.env.serviceRoleKey, supabaseClientOptions);
}

function mapDigestRun(row: DigestRunRow): DigestRunRecord {
  return {
    id: row.id,
    digestType: row.digest_type,
    runKind: row.run_kind,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    status: row.status,
    users: row.users,
    recipients: row.recipients,
    skipped: row.skipped,
    blocked: row.blocked,
    failed: row.failed,
    errorMessage: row.error_message,
    metadata: row.metadata ?? {}
  };
}

export function createEmptyDigestRunStats(): DigestRunStats {
  return {
    users: 0,
    recipients: 0,
    skipped: 0,
    blocked: 0,
    failed: 0,
    notices: 0,
    accepted: 0,
    deliverySkipped: 0
  };
}

export function getCompletedDigestRunStatus(stats: DigestRunStats): CompletedDigestRunStatus {
  if (stats.failed === 0) return "success";
  if (stats.accepted > 0 || stats.skipped > 0 || stats.blocked > 0 || stats.deliverySkipped > 0) {
    return "partial_success";
  }
  return "failed";
}

export async function claimScheduledDigestRun(params: {
  digestType: DigestType;
  window: DigestWindow;
}) {
  const supabase = getSupabaseAdmin();
  const startedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("digest_runs")
    .insert({
      digest_type: params.digestType,
      run_kind: "scheduled",
      period_start: params.window.start.toISOString(),
      period_end: params.window.end.toISOString(),
      started_at: startedAt,
      status: "running",
      metadata: {
        window_strategy: "scheduled_default_with_per_subscription_catchup"
      }
    })
    .select(digestRunColumns)
    .single();

  if (!error && data) {
    return { claimed: true, run: mapDigestRun(data as DigestRunRow) } as const;
  }

  if (error?.code !== "23505") {
    throw new Error(`Failed to create scheduled digest run: ${error?.message ?? "unknown error"}`);
  }

  const existing = await getScheduledDigestRun(params.digestType, params.window);
  if (!existing) {
    throw new Error("Scheduled digest run conflict occurred, but the existing run could not be loaded");
  }

  return { claimed: false, run: existing } as const;
}

export async function getScheduledDigestRun(digestType: DigestType, window: DigestWindow) {
  const { data, error } = await getSupabaseAdmin()
    .from("digest_runs")
    .select(digestRunColumns)
    .eq("digest_type", digestType)
    .eq("run_kind", "scheduled")
    .eq("period_start", window.start.toISOString())
    .eq("period_end", window.end.toISOString())
    .maybeSingle();

  if (error) throw new Error(`Failed to load scheduled digest run: ${error.message}`);
  return data ? mapDigestRun(data as DigestRunRow) : null;
}

export async function finishDigestRun(params: {
  runId: string;
  status: DigestRunStatus;
  stats: DigestRunStats;
  errorMessage?: string | null;
}) {
  const { error } = await getSupabaseAdmin()
    .from("digest_runs")
    .update({
      status: params.status,
      finished_at: new Date().toISOString(),
      users: params.stats.users,
      recipients: params.stats.recipients,
      skipped: params.stats.skipped,
      blocked: params.stats.blocked,
      failed: params.stats.failed,
      error_message: params.errorMessage ?? null,
      metadata: {
        notices: params.stats.notices,
        accepted: params.stats.accepted,
        delivery_skipped: params.stats.deliverySkipped,
        dry_run: false,
        window_strategy: "scheduled_default_with_per_subscription_catchup"
      }
    })
    .eq("id", params.runId)
    .eq("status", "running")
    .select("id")
    .single();

  if (error) throw new Error(`Failed to finalize scheduled digest run: ${error.message}`);
}
