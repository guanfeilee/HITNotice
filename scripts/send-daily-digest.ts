import { loadEnvConfig } from "@next/env";
import {
  buildDailyDigest,
  getActiveDailyDigestSubscriptions,
  hasSentDigest,
  recordDigestDelivery
} from "@/lib/digest/service";
import { getDefaultDailyDigestWindow } from "@/lib/digest/windows";
import { sendDailyDigestEmail } from "@/lib/email/resend";

type DigestRunStats = {
  users: number;
  notices: number;
  sent: number;
  failed: number;
  skipped: number;
};

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return message.replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, "$1[redacted]").slice(0, 1000);
}

function logStats(stats: DigestRunStats) {
  console.log(
    `Digest run summary: users=${stats.users}, notices=${stats.notices}, sent=${stats.sent}, failed=${stats.failed}, skipped=${stats.skipped}`
  );
}

async function main() {
  loadEnvConfig(process.cwd());

  const window = getDefaultDailyDigestWindow();
  const subscriptions = await getActiveDailyDigestSubscriptions();
  const stats: DigestRunStats = {
    users: subscriptions.length,
    notices: 0,
    sent: 0,
    failed: 0,
    skipped: 0
  };

  for (const subscription of subscriptions) {
    try {
      if (await hasSentDigest(subscription.id, window)) {
        stats.skipped += 1;
        continue;
      }

      const digest = await buildDailyDigest(subscription.id, window);
      stats.notices += digest.total;
      await sendDailyDigestEmail({
        to: subscription.email,
        digest
      });
      await recordDigestDelivery({
        subscriptionId: subscription.id,
        window,
        noticeCount: digest.total,
        status: "sent"
      });
      stats.sent += 1;
    } catch (error) {
      stats.failed += 1;
      try {
        await recordDigestDelivery({
          subscriptionId: subscription.id,
          window,
          noticeCount: 0,
          status: "failed",
          errorMessage: sanitizeError(error)
        });
      } catch {
        // Keep the public log limited to aggregate counts only.
      }
    }
  }

  logStats(stats);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Digest run failed: ${sanitizeError(error)}`);
  process.exitCode = 1;
});
