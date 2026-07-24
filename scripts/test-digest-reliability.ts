import assert from "node:assert/strict";
import { Webhook } from "svix";
import { POST as handleResendWebhook } from "@/app/api/webhooks/resend/route";
import { calculateDeliveryHealthMetrics } from "@/lib/health/report";
import { createDigestIdempotencyKey, evaluateRetryEligibility } from "@/lib/digest/delivery";
import { executeScheduledDigestRun } from "@/lib/digest/scheduled-run";
import { executeDigestCommand } from "@/lib/digest/command";
import { executeDigestDelivery } from "@/lib/digest/send";
import { getCompletedDigestRunStatus, type DigestRunRecord } from "@/lib/digest/runs";
import { parseDigestRetryArgs } from "@/lib/digest/retry";
import { sendResendRequestWithRetry } from "@/lib/email/resend-retry";
import type { Digest, DigestSubscription, DigestWindow } from "@/lib/digest/types";

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function requestOptions(fetchImpl: typeof fetch, maxAttempts = 3) {
  return {
    apiKey: "re_test_secret",
    idempotencyKey: "digest/test-key",
    payload: { to: ["private@example.com"], html: "secret body" },
    stage: "resend_submit",
    subscriptionId: "subscription-1",
    deliveryId: "delivery-1",
    fetchImpl,
    maxAttempts,
    timeoutMs: 50,
    sleep: async () => undefined,
    random: () => 0.5,
    logger: () => undefined
  };
}

async function assertSuccessfulRetrySequence(sequence: Array<Response | Error>, expectedCalls: number) {
  let calls = 0;
  const result = await sendResendRequestWithRetry({
    ...requestOptions(async () => {
      const item = sequence[calls++];
      if (item instanceof Error) throw item;
      return item;
    }),
    maxAttempts: sequence.length
  });
  assert.equal(result.id, "email-1");
  assert.equal(calls, expectedCalls);
}

async function main() {
await assertSuccessfulRetrySequence([jsonResponse(200, { id: "email-1" })], 1);
await assertSuccessfulRetrySequence([new TypeError("fetch failed"), jsonResponse(200, { id: "email-1" })], 2);
await assertSuccessfulRetrySequence(
  [jsonResponse(429, { name: "rate_limit_exceeded", message: "slow down" }), jsonResponse(200, { id: "email-1" })],
  2
);
await assertSuccessfulRetrySequence(
  [jsonResponse(500, { name: "internal_server_error", message: "temporary" }), jsonResponse(200, { id: "email-1" })],
  2
);

let http400Calls = 0;
await assert.rejects(
  sendResendRequestWithRetry({
    ...requestOptions(async () => {
      http400Calls += 1;
      return jsonResponse(400, { name: "validation_error", message: "bad request" });
    })
  })
);
assert.equal(http400Calls, 1);

let timeoutCalls = 0;
await assert.rejects(
  sendResendRequestWithRetry({
    ...requestOptions(
      ((_input, init) => {
        timeoutCalls += 1;
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        });
      }) as typeof fetch,
      2
    ),
    timeoutMs: 5
  })
);
assert.equal(timeoutCalls, 2);

const subscription: DigestSubscription = {
  id: "subscription-1",
  email: "private@example.com",
  frequency: "weekday_digest",
  unsubscribeToken: "private-token"
};
const window: DigestWindow = {
  start: new Date("2026-07-21T12:00:00.000Z"),
  end: new Date("2026-07-22T12:00:00.000Z")
};
const digest: Digest = {
  digestType: "weekday_digest",
  date: "2026/07/22",
  periodStart: window.start.toISOString(),
  periodEnd: window.end.toISOString(),
  total: 26,
  sources: [],
  groups: []
};

for (const digestType of ["weekday_digest", "weekly_digest"] as const) {
  let claimCalls = 0;
  let sendCalls = 0;
  let acceptedRecordCalls = 0;
  let failedRecordCalls = 0;
  const emptyDigest: Digest = {
    ...digest,
    digestType,
    total: 0,
    sources: [{ id: "subscribed-source", name: "Subscribed Source" }],
    groups: [
      {
        sourceId: "subscribed-source",
        sourceName: "Subscribed Source",
        notices: [],
        hasUpdates: false
      }
    ]
  };

  const emptyResult = await executeDigestDelivery(
    {
      subscription: { ...subscription, frequency: digestType },
      digest: emptyDigest,
      window
    },
    {
      claim: async () => {
        claimCalls += 1;
        throw new Error("empty digest must not create a delivery claim");
      },
      send: async () => {
        sendCalls += 1;
        throw new Error("empty digest must not call Resend");
      },
      recordAccepted: async () => {
        acceptedRecordCalls += 1;
      },
      recordFailed: async () => {
        failedRecordCalls += 1;
      }
    }
  );

  assert.deepEqual(emptyResult, { status: "skipped", reason: "no_matching_notices" });
  assert.equal(claimCalls, 0);
  assert.equal(sendCalls, 0);
  assert.equal(acceptedRecordCalls, 0);
  assert.equal(failedRecordCalls, 0);
}

let acceptedEmailId: string | null = null;
const acceptedResult = await executeDigestDelivery(
  { subscription, digest, window },
  {
    claim: async () => ({
      claimed: true,
      reason: "new_claim",
      delivery: { id: "delivery-accepted", idempotencyKey: "digest/accepted" }
    }),
    send: async () => ({
      id: "email-accepted",
      attempt: 1,
      durationMs: 12,
      httpStatus: 200,
      responseSummary: "{\"id\":\"email-accepted\"}"
    }),
    recordAccepted: async (value) => {
      acceptedEmailId = value.resendEmailId;
    },
    recordFailed: async () => assert.fail("successful send must not be recorded as failed")
  }
);
assert.equal(acceptedResult.status, "accepted");
assert.equal(acceptedEmailId, "email-accepted");

let recordedFailure: { attempt: number; errorDetails: { cause: Record<string, unknown> | null } } | null = null;
const failedResult = await executeDigestDelivery(
  { subscription, digest, window },
  {
    claim: async () => ({
      claimed: true,
      reason: "new_claim",
      delivery: {
        id: "delivery-1",
        idempotencyKey: createDigestIdempotencyKey("weekday_digest", subscription.id, window)
      }
    }),
    send: async () =>
      sendResendRequestWithRetry({
        ...requestOptions(async () => {
          const error = new TypeError("fetch failed", {
            cause: Object.assign(new Error("socket closed"), {
              code: "ECONNRESET",
              errno: -54,
              syscall: "read",
              hostname: "api.resend.com"
            })
          });
          throw error;
        })
      }),
    recordAccepted: async () => assert.fail("failed send must not be accepted"),
    recordFailed: async (value) => {
      recordedFailure = value;
    }
  }
);
assert.equal(failedResult.status, "failed");
const storedFailure = recordedFailure as {
  attempt: number;
  errorDetails: { cause: Record<string, unknown> | null };
} | null;
assert.ok(storedFailure);
assert.equal(storedFailure.attempt, 3);
assert.equal(storedFailure.errorDetails.cause?.code, "ECONNRESET");

let duplicateSendCalled = false;
const duplicateResult = await executeDigestDelivery(
  { subscription, digest, window },
  {
    claim: async () => ({
      claimed: false,
      reason: "delivery_already_accepted",
      delivery: { id: "delivery-1", idempotencyKey: "digest/test-key" }
    }),
    send: async () => {
      duplicateSendCalled = true;
      throw new Error("must not send");
    },
    recordAccepted: async () => undefined,
    recordFailed: async () => undefined
  }
);
assert.equal(duplicateResult.status, "skipped");
assert.equal(duplicateSendCalled, false);

const defaultRetry = parseDigestRetryArgs([
  "--subscription-id",
  "subscription-1",
  "--period-end",
  "2026-07-22T12:00:00.000Z"
]);
assert.equal(defaultRetry.confirmSend, false);
assert.throws(() => parseDigestRetryArgs([]), /batch retry is not allowed/);

assert.deepEqual(
  evaluateRetryEligibility({ deliveryStatus: "failed", resendEmailId: "email-1", subscriptionStatus: "active" }),
  { allowed: false, reason: "resend_email_id_exists" }
);
assert.deepEqual(
  evaluateRetryEligibility({ deliveryStatus: "suppressed", resendEmailId: null, subscriptionStatus: "active" }),
  { allowed: false, reason: "delivery_suppressed" }
);

const deliveryCreatedAt = window.start.toISOString();
const partialMetrics = calculateDeliveryHealthMetrics([
  {
    status: "delivered",
    accepted_at: window.end.toISOString(),
    sent_at: null,
    error_message: null,
    processing_started_at: deliveryCreatedAt,
    created_at: deliveryCreatedAt
  },
  {
    status: "suppressed",
    accepted_at: window.end.toISOString(),
    sent_at: null,
    error_message: null,
    processing_started_at: deliveryCreatedAt,
    created_at: deliveryCreatedAt
  },
  {
    status: "failed",
    accepted_at: null,
    sent_at: null,
    error_message: "failed",
    processing_started_at: deliveryCreatedAt,
    created_at: deliveryCreatedAt
  }
]);
assert.equal(partialMetrics.accepted, 2);
assert.equal(partialMetrics.delivered, 1);
assert.equal(partialMetrics.suppressed, 1);
assert.equal(partialMetrics.deliveryFailed, 1);

const scheduledRun: DigestRunRecord = {
  id: "run-1",
  digestType: "weekday_digest",
  runKind: "scheduled",
  periodStart: window.start.toISOString(),
  periodEnd: window.end.toISOString(),
  startedAt: window.start.toISOString(),
  finishedAt: null,
  status: "running",
  users: 0,
  recipients: 0,
  skipped: 0,
  blocked: 0,
  failed: 0,
  errorMessage: null,
  metadata: {}
};

function scheduledSubscriptions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...subscription,
    id: `subscription-${index + 1}`
  }));
}

function digestFor(currentSubscription: DigestSubscription, total: number): Digest {
  return {
    ...digest,
    digestType: currentSubscription.frequency,
    total,
    groups: []
  };
}

let allSkippedFinishStatus: string | null = null;
let allSkippedDeliveryCalls = 0;
const allSkippedResult = await executeScheduledDigestRun(
  { digestType: "weekday_digest", periodEnd: window.end },
  {
    claimRun: async ({ digestType, window: claimedWindow }) => {
      assert.equal(digestType, "weekday_digest");
      assert.equal(claimedWindow.start.toISOString(), window.start.toISOString());
      return { claimed: true, run: scheduledRun };
    },
    loadSubscriptions: async () => scheduledSubscriptions(57),
    getSubscriptionWindow: async () => window,
    buildDigest: async () => digestFor(subscription, 0),
    isPermanentlyBlocked: async () => false,
    deliver: async () => {
      allSkippedDeliveryCalls += 1;
      return { status: "accepted" };
    },
    finishRun: async (value) => {
      allSkippedFinishStatus = value.status;
    }
  }
);
assert.equal(allSkippedResult.status, "completed");
assert.equal(allSkippedResult.runStatus, "success");
assert.equal(allSkippedResult.stats.users, 57);
assert.equal(allSkippedResult.stats.recipients, 0);
assert.equal(allSkippedResult.stats.skipped, 57);
assert.equal(allSkippedResult.stats.failed, 0);
assert.equal(allSkippedDeliveryCalls, 0);
assert.equal(allSkippedFinishStatus, "success");

const mixedResult = await executeScheduledDigestRun(
  { digestType: "weekday_digest", periodEnd: window.end },
  {
    claimRun: async () => ({ claimed: true, run: scheduledRun }),
    loadSubscriptions: async () => scheduledSubscriptions(57),
    getSubscriptionWindow: async () => window,
    buildDigest: async (subscriptionId) =>
      digestFor(subscription, Number(subscriptionId.split("-").at(-1)) <= 10 ? 1 : 0),
    isPermanentlyBlocked: async () => false,
    deliver: async () => ({ status: "accepted" }),
    finishRun: async () => undefined
  }
);
assert.equal(mixedResult.status, "completed");
assert.equal(mixedResult.runStatus, "success");
assert.equal(mixedResult.stats.users, 57);
assert.equal(mixedResult.stats.recipients, 10);
assert.equal(mixedResult.stats.skipped, 47);
assert.equal(mixedResult.stats.failed, 0);

const partialRunResult = await executeScheduledDigestRun(
  { digestType: "weekday_digest", periodEnd: window.end },
  {
    claimRun: async () => ({ claimed: true, run: scheduledRun }),
    loadSubscriptions: async () => scheduledSubscriptions(10),
    getSubscriptionWindow: async () => window,
    buildDigest: async (subscriptionId) => {
      if (["subscription-9", "subscription-10"].includes(subscriptionId)) {
        throw new Error("notice query failed");
      }
      return digestFor(subscription, 1);
    },
    isPermanentlyBlocked: async () => false,
    deliver: async () => ({ status: "accepted" }),
    finishRun: async () => undefined
  }
);
assert.equal(partialRunResult.status, "completed");
assert.equal(partialRunResult.runStatus, "partial_success");
assert.equal(partialRunResult.stats.recipients, 8);
assert.equal(partialRunResult.stats.failed, 2);

let fatalFinishStatus: string | null = null;
await assert.rejects(
  executeScheduledDigestRun(
    { digestType: "weekday_digest", periodEnd: window.end },
    {
      claimRun: async () => ({ claimed: true, run: scheduledRun }),
      loadSubscriptions: async () => {
        throw new Error("subscription query failed");
      },
      getSubscriptionWindow: async () => window,
      buildDigest: async () => digest,
      isPermanentlyBlocked: async () => false,
      deliver: async () => ({ status: "accepted" }),
      finishRun: async (value) => {
        fatalFinishStatus = value.status;
      }
    }
  ),
  /subscription query failed/
);
assert.equal(fatalFinishStatus, "failed");

let duplicateLoadedSubscriptions = false;
const duplicateRunResult = await executeScheduledDigestRun(
  { digestType: "weekday_digest", periodEnd: window.end },
  {
    claimRun: async () => ({ claimed: false, run: scheduledRun }),
    loadSubscriptions: async () => {
      duplicateLoadedSubscriptions = true;
      return [];
    },
    getSubscriptionWindow: async () => window,
    buildDigest: async () => digest,
    isPermanentlyBlocked: async () => false,
    deliver: async () => ({ status: "accepted" }),
    finishRun: async () => undefined
  }
);
assert.equal(duplicateRunResult.status, "duplicate");
assert.equal(duplicateLoadedSubscriptions, false);
assert.equal(
  getCompletedDigestRunStatus({
    users: 57,
    recipients: 0,
    skipped: 57,
    blocked: 0,
    failed: 0,
    notices: 0,
    accepted: 0,
    deliverySkipped: 0
  }),
  "success"
);
assert.equal(
  getCompletedDigestRunStatus({
    users: 10,
    recipients: 10,
    skipped: 0,
    blocked: 0,
    failed: 10,
    notices: 10,
    accepted: 0,
    deliverySkipped: 0
  }),
  "failed"
);

let commandDryRunCalls = 0;
let commandScheduledCalls = 0;
await executeDigestCommand(
  {
    digestTypes: ["weekday_digest", "weekly_digest"],
    dryRun: true
  },
  {
    runDryRun: async () => {
      commandDryRunCalls += 1;
    },
    runScheduled: async () => {
      commandScheduledCalls += 1;
    }
  }
);
assert.equal(commandDryRunCalls, 2);
assert.equal(commandScheduledCalls, 0);

const webhookSecret = `whsec_${Buffer.from("digest-reliability-webhook-secret").toString("base64")}`;
const webhookPayload = JSON.stringify({
  type: "contact.created",
  created_at: "2026-07-22T12:00:00.000Z",
  data: { id: "contact-1" }
});
const webhookId = "msg_digest_reliability_test";
const webhookTimestamp = new Date();
const webhookSignature = new Webhook(webhookSecret).sign(webhookId, webhookTimestamp, webhookPayload);
process.env.RESEND_WEBHOOK_SECRET = webhookSecret;
const verifiedWebhookResponse = await handleResendWebhook(
  new Request("https://hitnotice.cn/api/webhooks/resend", {
    method: "POST",
    body: webhookPayload,
    headers: {
      "svix-id": webhookId,
      "svix-timestamp": String(Math.floor(webhookTimestamp.getTime() / 1000)),
      "svix-signature": webhookSignature
    }
  })
);
assert.equal(verifiedWebhookResponse.status, 200);
assert.deepEqual(await verifiedWebhookResponse.json(), { ok: true, ignored: true });

const invalidWebhookResponse = await handleResendWebhook(
  new Request("https://hitnotice.cn/api/webhooks/resend", {
    method: "POST",
    body: webhookPayload,
    headers: {
      "svix-id": webhookId,
      "svix-timestamp": String(Math.floor(webhookTimestamp.getTime() / 1000)),
      "svix-signature": "v1,invalid"
    }
  })
);
assert.equal(invalidWebhookResponse.status, 400);

console.log("digest reliability tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
