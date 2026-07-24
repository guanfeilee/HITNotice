import type { Digest, DigestSubscription, DigestType, DigestWindow } from "@/lib/digest/types";
import { formatStoredError, serializeRequestError } from "@/lib/email/error-details";
import { ResendRequestError, type ResendRequestResult } from "@/lib/email/resend-retry";

type ClaimedDelivery = {
  id: string;
  idempotencyKey: string | null;
};

export type DigestSendDependencies = {
  claim: (params: {
    subscriptionId: string;
    digestType: DigestType;
    window: DigestWindow;
    noticeCount: number;
  }) => Promise<
    | { claimed: true; reason: string; delivery: ClaimedDelivery }
    | { claimed: false; reason: string; delivery: ClaimedDelivery }
  >;
  send: (params: {
    subscription: DigestSubscription;
    digest: Digest;
    deliveryId: string;
    idempotencyKey: string;
  }) => Promise<ResendRequestResult>;
  recordAccepted: (params: {
    deliveryId: string;
    resendEmailId: string;
    attempt: number;
    durationMs: number;
    httpStatus: number;
    responseSummary: string;
  }) => Promise<void>;
  recordFailed: (params: {
    deliveryId: string;
    attempt: number;
    durationMs: number;
    httpStatus: number | null;
    errorMessage: string;
    errorDetails: ReturnType<typeof serializeRequestError>;
    responseSummary: string | null;
  }) => Promise<void>;
};

export async function executeDigestDelivery(
  params: {
    subscription: DigestSubscription;
    digest: Digest;
    window: DigestWindow;
  },
  dependencies: DigestSendDependencies
) {
  if (params.digest.total === 0) {
    return { status: "skipped", reason: "no_matching_notices" } as const;
  }

  const claim = await dependencies.claim({
    subscriptionId: params.subscription.id,
    digestType: params.digest.digestType,
    window: params.window,
    noticeCount: params.digest.total
  });
  if (!claim.claimed) return { status: "skipped", reason: claim.reason } as const;

  const deliveryId = claim.delivery.id;
  const idempotencyKey = claim.delivery.idempotencyKey;
  if (!idempotencyKey) throw new Error(`Digest delivery ${deliveryId} has no idempotency key`);

  let result: ResendRequestResult;
  try {
    result = await dependencies.send({
      subscription: params.subscription,
      digest: params.digest,
      deliveryId,
      idempotencyKey
    });
  } catch (error) {
    const resendError = error instanceof ResendRequestError ? error : null;
    const details = serializeRequestError(error, {
      stage: "resend_submit",
      subscriptionId: params.subscription.id,
      deliveryId,
      attempt: resendError?.attempt,
      durationMs: resendError?.durationMs,
      httpStatus: resendError?.httpStatus,
      responseSummary: resendError?.responseSummary
    });
    await dependencies.recordFailed({
      deliveryId,
      attempt: resendError?.attempt ?? 1,
      durationMs: resendError?.durationMs ?? 0,
      httpStatus: resendError?.httpStatus ?? null,
      errorMessage: formatStoredError(details),
      errorDetails: details,
      responseSummary: resendError?.responseSummary ?? null
    });
    return { status: "failed", deliveryId, error: details } as const;
  }

  try {
    await dependencies.recordAccepted({
      deliveryId,
      resendEmailId: result.id,
      attempt: result.attempt,
      durationMs: result.durationMs,
      httpStatus: result.httpStatus,
      responseSummary: result.responseSummary
    });
  } catch (error) {
    const persistenceError = new Error(
      `Resend accepted email_id=${result.id}, but the accepted delivery record could not be persisted`,
      { cause: error }
    );
    persistenceError.name = "DeliveryPersistenceError";
    throw persistenceError;
  }
  return { status: "accepted", deliveryId, resendEmailId: result.id } as const;
}
