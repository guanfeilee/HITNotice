import { loadEnvConfig } from "@next/env";
import {
  buildDigest,
  claimDigestDelivery,
  getActiveDigestSubscriptions,
  getDigestWindowForSubscription,
  getLatestPermanentDeliveryBlock,
  recordDigestDeliveryAccepted,
  recordDigestDeliveryFailure
} from "@/lib/digest/service";
import { claimScheduledDigestRun, finishDigestRun, type DigestRunStats } from "@/lib/digest/runs";
import { executeScheduledDigestRun, sanitizeDigestRunError } from "@/lib/digest/scheduled-run";
import { executeDigestCommand } from "@/lib/digest/command";
import { getCurrentDigestPeriodEnd, getDueDigestTypes } from "@/lib/digest/windows";
import { sendDigestEmail } from "@/lib/email/resend";
import { executeDigestDelivery } from "@/lib/digest/send";
import type { DigestType, DigestWindow } from "@/lib/digest/types";

type DigestDryRunStats = {
  users: number;
  recipients: number;
  notices: number;
  groups: number;
  skipped: number;
  failed: number;
};

function isDryRun() {
  return process.argv.includes("--dry-run");
}

function getRequestedDigestTypes(): DigestType[] {
  const typeArgument = process.argv.find((argument) => argument.startsWith("--type="));
  if (!typeArgument) return getDueDigestTypes();

  const digestType = typeArgument.split("=")[1];
  if (digestType !== "weekday_digest" && digestType !== "weekly_digest") {
    throw new Error(`Unsupported digest type: ${digestType}`);
  }

  return [digestType];
}

function maskEmail(email: string) {
  const separator = email.lastIndexOf("@");
  if (separator <= 0) return "[redacted-email]";

  const localPart = email.slice(0, separator);
  const domain = email.slice(separator + 1);
  return `${localPart.slice(0, 1)}***@${domain}`;
}

function formatDigestContext(
  subscription: { id: string; email: string; frequency: DigestType },
  window: DigestWindow | null
) {
  return [
    `email=${maskEmail(subscription.email)}`,
    `subscription=${subscription.id}`,
    `frequency=${subscription.frequency}`,
    `period_start=${window?.start.toISOString() ?? "unresolved"}`,
    `period_end=${window?.end.toISOString() ?? "unresolved"}`
  ].join(", ");
}

function logStats(digestType: DigestType, stats: DigestRunStats) {
  console.log(
    `Digest run summary: type=${digestType}, users=${stats.users}, recipients=${stats.recipients}, notices=${stats.notices}, accepted=${stats.accepted}, skipped=${stats.skipped}, blocked=${stats.blocked}, failed=${stats.failed}`
  );
}

function logDryRunStats(digestType: DigestType, stats: DigestDryRunStats) {
  console.log(
    `Digest dry-run summary: type=${digestType}, users=${stats.users}, recipients=${stats.recipients}, notices=${stats.notices}, groups=${stats.groups}, skipped=${stats.skipped}, failed=${stats.failed}`
  );
}

async function runDryRun(digestType: DigestType) {
  const periodEnd = getCurrentDigestPeriodEnd();
  const subscriptions = await getActiveDigestSubscriptions(digestType);
  const stats: DigestDryRunStats = {
    users: subscriptions.length,
    recipients: 0,
    notices: 0,
    groups: 0,
    skipped: 0,
    failed: 0
  };

  for (const subscription of subscriptions) {
    let digestWindow: DigestWindow | null = null;

    try {
      digestWindow = await getDigestWindowForSubscription(subscription.id, digestType, periodEnd);
      const digest = await buildDigest(subscription.id, digestType, digestWindow);
      stats.notices += digest.total;
      stats.groups += digest.groups.length;

      if (digest.total === 0) {
        stats.skipped += 1;
        console.log(
          `Digest dry-run: ${formatDigestContext(subscription, digestWindow)}, notices=0, groups=${digest.groups.length}, action=skipped, reason=no_matching_notices`
        );
        continue;
      }

      stats.recipients += 1;
      console.log(
        `Digest dry-run: ${formatDigestContext(subscription, digestWindow)}, notices=${digest.total}, groups=${digest.groups.length}, action=prepare`
      );
    } catch (error) {
      stats.failed += 1;
      console.error(
        `Digest dry-run failed: ${formatDigestContext(subscription, digestWindow)} ${sanitizeDigestRunError(error)}`
      );
    }
  }

  logDryRunStats(digestType, stats);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

async function runDigest(digestType: DigestType) {
  const periodEnd = getCurrentDigestPeriodEnd();
  const result = await executeScheduledDigestRun(
    { digestType, periodEnd },
    {
      claimRun: claimScheduledDigestRun,
      loadSubscriptions: getActiveDigestSubscriptions,
      getSubscriptionWindow: getDigestWindowForSubscription,
      buildDigest,
      isPermanentlyBlocked: async (subscriptionId) =>
        Boolean(await getLatestPermanentDeliveryBlock(subscriptionId)),
      deliver: ({ subscription, digest, window }) =>
        executeDigestDelivery(
          { subscription, digest, window },
          {
            claim: claimDigestDelivery,
            send: ({ subscription: current, digest: currentDigest, deliveryId, idempotencyKey }) =>
              sendDigestEmail({
                to: current.email,
                digest: currentDigest,
                unsubscribeToken: current.unsubscribeToken,
                subscriptionId: current.id,
                deliveryId,
                idempotencyKey
              }),
            recordAccepted: recordDigestDeliveryAccepted,
            recordFailed: recordDigestDeliveryFailure
          }
        ),
      finishRun: finishDigestRun
    },
    {
      onNoMatchingNotices: ({ subscription, digest, window }) =>
        console.log(
          `Digest skipped: ${formatDigestContext(subscription, window)}, notices=${digest.total}, reason=no_matching_notices`
        ),
      onPermanentBlock: ({ subscription, window }) =>
        console.log(
          `Digest blocked: ${formatDigestContext(subscription, window)}, reason=permanent_delivery_block`
        ),
      onDeliveryResult: ({ subscription, window, result: deliveryResult }) => {
        if (deliveryResult.status === "skipped") {
          console.log(
            `Digest delivery skipped: ${formatDigestContext(subscription, window)}, reason=${deliveryResult.reason}`
          );
        }
      },
      onUserError: ({ subscription, window, error }) =>
        console.error(
          `Digest processing failed: ${formatDigestContext(subscription, window)} ${sanitizeDigestRunError(error)}`
        )
    }
  );

  if (result.status === "duplicate") {
    console.log(
      `Digest scheduled run skipped: type=${digestType}, period_start=${result.run.periodStart}, period_end=${result.run.periodEnd}, reason=scheduled_run_already_exists, run_status=${result.run.status}`
    );
    return;
  }

  logStats(digestType, result.stats);
  if (result.stats.failed > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  loadEnvConfig(process.cwd());

  const digestTypes = getRequestedDigestTypes();
  if (digestTypes.length === 0) {
    console.log("No digest is scheduled for the current Beijing date.");
    return;
  }

  await executeDigestCommand(
    {
      digestTypes,
      dryRun: isDryRun()
    },
    {
      runDryRun,
      runScheduled: runDigest
    }
  );
}

main().catch((error) => {
  console.error(`Digest run failed: ${sanitizeDigestRunError(error)}`);
  process.exitCode = 1;
});
