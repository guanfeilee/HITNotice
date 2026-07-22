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
import { getCurrentDigestPeriodEnd, getDueDigestTypes } from "@/lib/digest/windows";
import { sendDigestEmail } from "@/lib/email/resend";
import { executeDigestDelivery } from "@/lib/digest/send";
import type { DigestType, DigestWindow } from "@/lib/digest/types";

type DigestRunStats = {
  users: number;
  notices: number;
  accepted: number;
  failed: number;
  skipped: number;
  failedDeliveryRecords: number;
};

type DigestDryRunStats = {
  users: number;
  recipients: number;
  notices: number;
  groups: number;
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

function sanitizeError(error: unknown) {
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

function logStats(digestType: DigestType, stats: DigestRunStats) {
  console.log(
    `Digest run summary: type=${digestType}, users=${stats.users}, notices=${stats.notices}, accepted=${stats.accepted}, failed=${stats.failed}, skipped=${stats.skipped}`
  );
}

function logDryRunStats(digestType: DigestType, stats: DigestDryRunStats) {
  console.log(
    `Digest dry-run summary: type=${digestType}, users=${stats.users}, recipients=${stats.recipients}, notices=${stats.notices}, groups=${stats.groups}, failed=${stats.failed}`
  );
}

async function runDryRun(digestType: DigestType) {
  const periodEnd = getCurrentDigestPeriodEnd();
  const subscriptions = await getActiveDigestSubscriptions(digestType);
  const stats: DigestDryRunStats = {
    users: subscriptions.length,
    recipients: subscriptions.length,
    notices: 0,
    groups: 0,
    failed: 0
  };

  for (const subscription of subscriptions) {
    try {
      const window = await getDigestWindowForSubscription(subscription.id, digestType, periodEnd);
      const digest = await buildDigest(subscription.id, digestType, window);
      stats.notices += digest.total;
      stats.groups += digest.groups.length;
    } catch {
      stats.failed += 1;
    }
  }

  logDryRunStats(digestType, stats);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

async function runDigest(digestType: DigestType) {
  const periodEnd = getCurrentDigestPeriodEnd();
  const subscriptions = await getActiveDigestSubscriptions(digestType);
  const stats: DigestRunStats = {
    users: subscriptions.length,
    notices: 0,
    accepted: 0,
    failed: 0,
    skipped: 0,
    failedDeliveryRecords: 0
  };

  for (const subscription of subscriptions) {
    let digestWindow: DigestWindow | null = null;

    try {
      digestWindow = await getDigestWindowForSubscription(subscription.id, digestType, periodEnd);

      const permanentBlock = await getLatestPermanentDeliveryBlock(subscription.id);
      if (permanentBlock) {
        stats.skipped += 1;
        continue;
      }

      const digest = await buildDigest(subscription.id, digestType, digestWindow);
      stats.notices += digest.total;
      const result = await executeDigestDelivery({ subscription, digest, window: digestWindow }, {
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
      });
      if (result.status === "accepted") stats.accepted += 1;
      if (result.status === "skipped") stats.skipped += 1;
      if (result.status === "failed") stats.failed += 1;
    } catch (error) {
      stats.failed += 1;
      stats.failedDeliveryRecords += 1;
      console.error(`Digest processing failed: subscription=${subscription.id} ${sanitizeError(error)}`);
    }
  }

  logStats(digestType, stats);

  if (stats.failedDeliveryRecords > 0) {
    console.log(`Digest failed delivery record errors=${stats.failedDeliveryRecords}`);
  }

  if (stats.failed > 0) {
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

  for (const digestType of digestTypes) {
    if (isDryRun()) {
      await runDryRun(digestType);
    } else {
      await runDigest(digestType);
    }
  }
}

main().catch((error) => {
  console.error(`Digest run failed: ${sanitizeError(error)}`);
  process.exitCode = 1;
});
