import { query } from "./pool";
import { transaction } from "./transaction";
import { RepositoryError } from "./errors";
import type { DigestType, DigestWindow } from "@/lib/digest/types";
import type {
  DigestRunKind,
  DigestRunStatus,
  DigestRunRecord,
  DigestRunStats,
  CompletedDigestRunStatus,
} from "@/lib/digest/runs";
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
    metadata: row.metadata ?? {},
  };
}

export async function claimScheduledDigestRun(p: {
  digestType: DigestType;
  window: DigestWindow;
}) {
  return transaction("claim_run", async (client) => {
    const values = [p.digestType, p.window.start, p.window.end];
    const r = await client.query<DigestRunRow>(
      `INSERT INTO digest_runs(digest_type,period_start,period_end,metadata)
      VALUES($1,$2,$3,'{"window_strategy":"scheduled_default_with_per_subscription_catchup"}'::jsonb)
      ON CONFLICT(digest_type,run_kind,period_start,period_end) DO NOTHING RETURNING *`,
      values,
    );
    if (r.rows[0]) return { claimed: true, run: mapDigestRun(r.rows[0]) };
    const current = (
      await client.query<DigestRunRow>(
        "SELECT * FROM digest_runs WHERE digest_type=$1 AND run_kind='scheduled' AND period_start=$2 AND period_end=$3",
        values,
      )
    ).rows[0];
    if (!current) throw new RepositoryError("RUN_NOT_FOUND", "claim_run");
    return { claimed: false, run: mapDigestRun(current) };
  });
}
export async function getScheduledDigestRun(
  type: DigestType,
  window: DigestWindow,
) {
  const row = (
    await query<DigestRunRow>(
      "SELECT * FROM digest_runs WHERE digest_type=$1 AND run_kind='scheduled' AND period_start=$2 AND period_end=$3",
      [type, window.start, window.end],
    )
  ).rows[0];
  return row ? mapDigestRun(row) : null;
}
export async function finishDigestRun(p: {
  runId: string;
  status: CompletedDigestRunStatus;
  stats: DigestRunStats;
  errorMessage?: string | null;
}) {
  if (!["success", "partial_success", "failed"].includes(p.status))
    throw new RepositoryError("INVALID_RUN_STATUS", "finish_run");
  const s = p.stats;
  const r = await query(
    `UPDATE digest_runs SET status=$2,finished_at=now(),users=$3,recipients=$4,skipped=$5,blocked=$6,failed=$7,error_message=$8,
    metadata=metadata || $9::jsonb WHERE id=$1 AND status='running' RETURNING id`,
    [
      p.runId,
      p.status,
      s.users,
      s.recipients,
      s.skipped,
      s.blocked,
      s.failed,
      p.errorMessage ?? null,
      {
        notices: s.notices,
        accepted: s.accepted,
        delivery_skipped: s.deliverySkipped,
        dry_run: false,
        window_strategy: "scheduled_default_with_per_subscription_catchup",
      },
    ],
    "finish_run",
  );
  if (!r.rowCount) throw new RepositoryError("RUN_NOT_RUNNING", "finish_run");
}
