import { loadEnvConfig } from "@next/env";
import {
  buildDigest,
  claimDigestDelivery,
  getDigestDeliveryById,
  getDigestDeliveryForPeriod,
  getLatestPermanentDeliveryBlock,
  getSubscriptionForRetry,
  recordDigestDeliveryAccepted,
  recordDigestDeliveryFailure
} from "@/lib/digest/service";
import { executeDigestDelivery } from "@/lib/digest/send";
import { getRetryDecision, parseDigestRetryArgs } from "@/lib/digest/retry";
import { maskEmail } from "@/lib/email/error-details";
import { sendDigestEmail } from "@/lib/email/resend";
import type { DigestWindow } from "@/lib/digest/types";

async function resolveTarget(options: ReturnType<typeof parseDigestRetryArgs>) {
  const delivery = options.deliveryId
    ? await getDigestDeliveryById(options.deliveryId)
    : null;
  const subscriptionId = options.subscriptionId ?? delivery?.subscriptionId ?? null;
  if (!subscriptionId) throw new Error("Delivery was not found");

  const subscription = await getSubscriptionForRetry(subscriptionId);
  if (!subscription) throw new Error("Subscription was not found");

  const resolvedDelivery =
    delivery ??
    (options.periodEnd
      ? await getDigestDeliveryForPeriod(subscription.id, subscription.frequency, options.periodEnd)
      : null);
  if (!resolvedDelivery) throw new Error("Failed delivery was not found for the requested subscription and period");

  return { subscription, delivery: resolvedDelivery };
}

async function main() {
  loadEnvConfig(process.cwd());
  const options = parseDigestRetryArgs(process.argv.slice(2));
  const { subscription, delivery } = await resolveTarget(options);
  const permanentBlock = await getLatestPermanentDeliveryBlock(subscription.id);
  const decision = getRetryDecision({
    deliveryStatus: permanentBlock?.status ?? delivery.status,
    resendEmailId: delivery.resendEmailId,
    subscriptionStatus: subscription.status
  });
  const window: DigestWindow = {
    start: new Date(delivery.periodStart),
    end: new Date(delivery.periodEnd)
  };
  const digest = await buildDigest(subscription.id, subscription.frequency, window);

  console.log(`Mode: ${options.confirmSend ? "confirm-send" : "dry-run"}`);
  console.log(`Email: ${maskEmail(subscription.email)}`);
  console.log(`Subscription ID: ${subscription.id}`);
  console.log(`Delivery ID: ${delivery.id}`);
  console.log(`Period start: ${delivery.periodStart}`);
  console.log(`Period end: ${delivery.periodEnd}`);
  console.log(`Notices: ${digest.total}`);
  console.log(`Current status: ${delivery.status}`);
  console.log(`Permanent delivery block: ${permanentBlock?.status ?? "none"}`);
  console.log(`Resend email ID exists: ${Boolean(delivery.resendEmailId)}`);
  console.log(`Retry allowed: ${decision.allowed}`);
  console.log(`Decision reason: ${decision.reason}`);

  if (!options.confirmSend) return;
  if (!decision.allowed) throw new Error(`Retry refused: ${decision.reason}`);

  const result = await executeDigestDelivery({ subscription, digest, window }, {
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

  if (result.status !== "accepted") throw new Error(`Retry did not send: ${result.reason ?? result.status}`);
  console.log(`Retry accepted: delivery=${result.deliveryId} resend_email_id=${result.resendEmailId}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
