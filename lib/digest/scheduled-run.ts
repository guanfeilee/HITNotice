import { getDefaultDigestWindow } from "@/lib/digest/windows";
import {
  createEmptyDigestRunStats,
  getCompletedDigestRunStatus,
  type DigestRunRecord,
  type DigestRunStats
} from "@/lib/digest/runs";
import type { Digest, DigestSubscription, DigestType, DigestWindow } from "@/lib/digest/types";

type DeliveryResult =
  | { status: "accepted" }
  | { status: "failed" }
  | { status: "skipped"; reason: string };

export type ScheduledDigestRunDependencies = {
  claimRun: (params: {
    digestType: DigestType;
    window: DigestWindow;
  }) => Promise<{ claimed: boolean; run: DigestRunRecord }>;
  loadSubscriptions: (digestType: DigestType) => Promise<DigestSubscription[]>;
  getSubscriptionWindow: (
    subscriptionId: string,
    digestType: DigestType,
    periodEnd: Date
  ) => Promise<DigestWindow>;
  buildDigest: (
    subscriptionId: string,
    digestType: DigestType,
    window: DigestWindow
  ) => Promise<Digest>;
  isPermanentlyBlocked: (subscriptionId: string) => Promise<boolean>;
  deliver: (params: {
    subscription: DigestSubscription;
    digest: Digest;
    window: DigestWindow;
  }) => Promise<DeliveryResult>;
  finishRun: (params: {
    runId: string;
    status: "success" | "partial_success" | "failed";
    stats: DigestRunStats;
    errorMessage?: string | null;
  }) => Promise<void>;
};

export type ScheduledDigestRunHooks = {
  onNoMatchingNotices?: (params: {
    subscription: DigestSubscription;
    digest: Digest;
    window: DigestWindow;
  }) => void;
  onPermanentBlock?: (params: {
    subscription: DigestSubscription;
    digest: Digest;
    window: DigestWindow;
  }) => void;
  onDeliveryResult?: (params: {
    subscription: DigestSubscription;
    digest: Digest;
    window: DigestWindow;
    result: DeliveryResult;
  }) => void;
  onUserError?: (params: {
    subscription: DigestSubscription;
    window: DigestWindow | null;
    error: unknown;
  }) => void;
};

export function sanitizeDigestRunError(error: unknown) {
  const type = error instanceof Error && error.name ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);
  const reason = message
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, "$1[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return `${type}: ${reason}`;
}

export async function executeScheduledDigestRun(
  params: {
    digestType: DigestType;
    periodEnd: Date;
  },
  dependencies: ScheduledDigestRunDependencies,
  hooks: ScheduledDigestRunHooks = {}
) {
  const scheduledWindow = getDefaultDigestWindow(params.digestType, params.periodEnd);
  const claim = await dependencies.claimRun({
    digestType: params.digestType,
    window: scheduledWindow
  });

  if (!claim.claimed) {
    return {
      status: "duplicate",
      run: claim.run,
      stats: createEmptyDigestRunStats()
    } as const;
  }

  const stats = createEmptyDigestRunStats();

  try {
    const subscriptions = await dependencies.loadSubscriptions(params.digestType);
    stats.users = subscriptions.length;

    for (const subscription of subscriptions) {
      let subscriptionWindow: DigestWindow | null = null;

      try {
        subscriptionWindow = await dependencies.getSubscriptionWindow(
          subscription.id,
          params.digestType,
          params.periodEnd
        );
        const digest = await dependencies.buildDigest(subscription.id, params.digestType, subscriptionWindow);
        stats.notices += digest.total;

        if (digest.total === 0) {
          stats.skipped += 1;
          hooks.onNoMatchingNotices?.({ subscription, digest, window: subscriptionWindow });
          continue;
        }

        if (await dependencies.isPermanentlyBlocked(subscription.id)) {
          stats.blocked += 1;
          hooks.onPermanentBlock?.({ subscription, digest, window: subscriptionWindow });
          continue;
        }

        stats.recipients += 1;
        const result = await dependencies.deliver({
          subscription,
          digest,
          window: subscriptionWindow
        });

        if (result.status === "accepted") stats.accepted += 1;
        if (result.status === "failed") stats.failed += 1;
        if (result.status === "skipped") stats.deliverySkipped += 1;
        hooks.onDeliveryResult?.({ subscription, digest, window: subscriptionWindow, result });
      } catch (error) {
        stats.failed += 1;
        hooks.onUserError?.({ subscription, window: subscriptionWindow, error });
      }
    }

    const status = getCompletedDigestRunStatus(stats);
    await dependencies.finishRun({
      runId: claim.run.id,
      status,
      stats
    });
    return { status: "completed", run: claim.run, runStatus: status, stats } as const;
  } catch (error) {
    await dependencies.finishRun({
      runId: claim.run.id,
      status: "failed",
      stats,
      errorMessage: sanitizeDigestRunError(error)
    });
    throw error;
  }
}
