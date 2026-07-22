import { createHash } from "node:crypto";
import type { DigestType, DigestWindow } from "@/lib/digest/types";

export type DeliveryStatus =
  | "pending"
  | "accepted"
  | "sent"
  | "delivered"
  | "suppressed"
  | "bounced"
  | "complained"
  | "failed"
  | "skipped";

export type RetryEligibilityInput = {
  deliveryStatus: DeliveryStatus | null;
  resendEmailId: string | null;
  subscriptionStatus: string;
};

const acceptedStatuses = new Set<DeliveryStatus>([
  "accepted",
  "sent",
  "delivered",
  "suppressed",
  "bounced",
  "complained"
]);

const permanentlyBlockedStatuses = new Set<DeliveryStatus>(["suppressed", "bounced", "complained"]);

export function createDigestIdempotencyKey(
  digestType: DigestType,
  subscriptionId: string,
  window: DigestWindow
) {
  const identity = [digestType, subscriptionId, window.start.toISOString(), window.end.toISOString()].join(":");
  return `digest/${createHash("sha256").update(identity).digest("hex")}`;
}

export function isAcceptedDeliveryStatus(status: DeliveryStatus) {
  return acceptedStatuses.has(status);
}

export function isPermanentDeliveryBlock(status: DeliveryStatus) {
  return permanentlyBlockedStatuses.has(status);
}

export function evaluateRetryEligibility(input: RetryEligibilityInput) {
  if (input.subscriptionStatus !== "active") {
    return { allowed: false, reason: "subscription_not_active" } as const;
  }
  if (input.resendEmailId) {
    return { allowed: false, reason: "resend_email_id_exists" } as const;
  }
  if (!input.deliveryStatus) {
    return { allowed: false, reason: "delivery_not_found" } as const;
  }
  if (isPermanentDeliveryBlock(input.deliveryStatus)) {
    return { allowed: false, reason: `delivery_${input.deliveryStatus}` } as const;
  }
  if (isAcceptedDeliveryStatus(input.deliveryStatus)) {
    return { allowed: false, reason: "delivery_already_accepted" } as const;
  }
  if (input.deliveryStatus === "pending") {
    return { allowed: false, reason: "delivery_pending" } as const;
  }
  if (input.deliveryStatus !== "failed") {
    return { allowed: false, reason: `delivery_${input.deliveryStatus}` } as const;
  }
  return { allowed: true, reason: "failed_without_resend_id" } as const;
}
