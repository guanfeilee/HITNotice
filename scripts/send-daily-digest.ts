import { loadEnvConfig } from "@next/env";
import {
  buildDailyDigest,
  getDigestWindowForSubscription,
  getActiveDailyDigestSubscriptions,
  hasSentDigest,
  recordDigestDelivery
} from "@/lib/digest/service";
import { getCurrentDailyDigestPeriodEnd } from "@/lib/digest/windows";
import { sendDailyDigestEmail } from "@/lib/email/resend";
import type { DigestWindow } from "@/lib/digest/types";

type DigestRunStats = {
  users: number;
  notices: number;
  sent: number;
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

function logStats(stats: DigestRunStats) {
  console.log(
    `Digest run summary: users=${stats.users}, notices=${stats.notices}, sent=${stats.sent}, failed=${stats.failed}, skipped=${stats.skipped}`
  );
}

function logDryRunStats(stats: DigestDryRunStats) {
  console.log(
    `Digest dry-run summary: users=${stats.users}, recipients=${stats.recipients}, notices=${stats.notices}, groups=${stats.groups}, failed=${stats.failed}`
  );
}

async function runDryRun() {
  const periodEnd = getCurrentDailyDigestPeriodEnd();
  const subscriptions = await getActiveDailyDigestSubscriptions();
  const stats: DigestDryRunStats = {
    users: subscriptions.length,
    recipients: subscriptions.length,
    notices: 0,
    groups: 0,
    failed: 0
  };

  for (const subscription of subscriptions) {
    try {
      const window = await getDigestWindowForSubscription(subscription.id, periodEnd);
      const digest = await buildDailyDigest(subscription.id, window);
      stats.notices += digest.total;
      stats.groups += digest.groups.length;
    } catch {
      stats.failed += 1;
    }
  }

  logDryRunStats(stats);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  loadEnvConfig(process.cwd());

  if (isDryRun()) {
    await runDryRun();
    return;
  }

  const periodEnd = getCurrentDailyDigestPeriodEnd();
  const subscriptions = await getActiveDailyDigestSubscriptions();
  const stats: DigestRunStats = {
    users: subscriptions.length,
    notices: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    failedDeliveryRecords: 0
  };

  for (const subscription of subscriptions) {
    let noticeCount = 0;
    let digestWindow: DigestWindow | null = null;

    try {
      digestWindow = await getDigestWindowForSubscription(subscription.id, periodEnd);

      if (await hasSentDigest(subscription.id, digestWindow)) {
        stats.skipped += 1;
        continue;
      }

      const digest = await buildDailyDigest(subscription.id, digestWindow);
      noticeCount = digest.total;
      stats.notices += digest.total;
      await sendDailyDigestEmail({
        to: subscription.email,
        digest,
        unsubscribeToken: subscription.unsubscribeToken
      });
      await recordDigestDelivery({
        subscriptionId: subscription.id,
        window: digestWindow,
        noticeCount: digest.total,
        status: "sent"
      });
      stats.sent += 1;
    } catch (error) {
      stats.failed += 1;
      if (!digestWindow) {
        stats.failedDeliveryRecords += 1;
        continue;
      }

      try {
        await recordDigestDelivery({
          subscriptionId: subscription.id,
          window: digestWindow,
          noticeCount,
          status: "failed",
          errorMessage: sanitizeError(error)
        });
      } catch {
        stats.failedDeliveryRecords += 1;
      }
    }
  }

  logStats(stats);

  if (stats.failedDeliveryRecords > 0) {
    console.log(`Digest failed delivery record errors=${stats.failedDeliveryRecords}`);
  }

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Digest run failed: ${sanitizeError(error)}`);
  process.exitCode = 1;
});
