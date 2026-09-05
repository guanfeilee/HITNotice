import type { DigestType } from "@/lib/digest/types";
export type DigestRunKind = "scheduled" | "retry";
export type DigestRunStatus =
  | "running"
  | "success"
  | "partial_success"
  | "failed";
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

export function createEmptyDigestRunStats(): DigestRunStats {
  return {
    users: 0,
    recipients: 0,
    skipped: 0,
    blocked: 0,
    failed: 0,
    notices: 0,
    accepted: 0,
    deliverySkipped: 0,
  };
}

export function getCompletedDigestRunStatus(
  stats: DigestRunStats,
): CompletedDigestRunStatus {
  if (stats.failed === 0) return "success";
  if (
    stats.accepted > 0 ||
    stats.skipped > 0 ||
    stats.blocked > 0 ||
    stats.deliverySkipped > 0
  ) {
    return "partial_success";
  }
  return "failed";
}

export {
  claimScheduledDigestRun,
  getScheduledDigestRun,
  finishDigestRun,
} from "@/lib/db/digest-runs";
