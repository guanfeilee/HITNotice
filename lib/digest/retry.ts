import { evaluateRetryEligibility, type DeliveryStatus } from "@/lib/digest/delivery";

export type DigestRetryOptions = {
  subscriptionId: string | null;
  deliveryId: string | null;
  periodEnd: Date | null;
  confirmSend: boolean;
};

function getArgumentValue(args: string[], name: string) {
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1]?.trim() ?? "" : null;
}

export function parseDigestRetryArgs(args: string[]): DigestRetryOptions {
  const subscriptionId = getArgumentValue(args, "--subscription-id");
  const deliveryId = getArgumentValue(args, "--delivery-id");
  const periodEndValue = getArgumentValue(args, "--period-end");
  const confirmSend = args.includes("--confirm-send");

  if ((!subscriptionId && !deliveryId) || (subscriptionId && deliveryId)) {
    throw new Error("Specify exactly one of --subscription-id or --delivery-id; batch retry is not allowed");
  }
  if (subscriptionId && !periodEndValue) {
    throw new Error("--period-end is required with --subscription-id");
  }
  if (confirmSend && args.includes("--dry-run")) {
    throw new Error("Use either the default dry-run mode or --confirm-send, not both");
  }

  const periodEnd = periodEndValue ? new Date(periodEndValue) : null;
  if (periodEndValue && (!periodEnd || Number.isNaN(periodEnd.getTime()))) {
    throw new Error("--period-end must be a valid ISO timestamp");
  }

  return {
    subscriptionId: subscriptionId || null,
    deliveryId: deliveryId || null,
    periodEnd,
    confirmSend
  };
}

export function getRetryDecision(input: {
  deliveryStatus: DeliveryStatus | null;
  resendEmailId: string | null;
  subscriptionStatus: string;
}) {
  return evaluateRetryEligibility(input);
}
