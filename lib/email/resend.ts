import { createHash } from "node:crypto";
import { getEmailEnv } from "@/lib/email/config";
import { renderHealthReportEmail } from "@/lib/email/health-report-template";
import { sendResendRequestWithRetry, type ResendRequestOptions } from "@/lib/email/resend-retry";
import { renderDigestEmail } from "@/lib/email/template";
import { buildSubscriptionConfirmationEmail } from "@/lib/email/subscription-template";
import type { Digest } from "@/lib/digest/types";
import type { Frequency } from "@/lib/types";
import type { HealthReport } from "@/lib/health/report";

type RequestOverrides = Pick<
  ResendRequestOptions,
  "fetchImpl" | "sleep" | "random" | "logger" | "timeoutMs" | "maxAttempts"
>;

function stableKey(prefix: string, values: string[]) {
  return `${prefix}/${createHash("sha256").update(values.join(":"), "utf8").digest("hex")}`;
}

function getDigestLabel(digest: Digest) {
  return digest.digestType === "weekly_digest" ? "每周通知摘要" : "工作日通知摘要";
}

function requireEmailEnv() {
  const env = getEmailEnv();
  if (!env.ok) throw new Error(env.error);
  return env;
}

export async function sendDigestEmail(params: {
  to: string;
  digest: Digest;
  unsubscribeToken: string;
  subscriptionId: string;
  deliveryId: string;
  idempotencyKey: string;
  requestOverrides?: RequestOverrides;
}) {
  const env = requireEmailEnv();
  return sendResendRequestWithRetry({
    apiKey: env.resendApiKey,
    idempotencyKey: params.idempotencyKey,
    stage: "resend_submit",
    subscriptionId: params.subscriptionId,
    deliveryId: params.deliveryId,
    payload: {
      from: env.emailFrom,
      to: [params.to],
      subject: `HITnotice ${getDigestLabel(params.digest)}｜${params.digest.date}｜${params.digest.total} 条新增`,
      html: renderDigestEmail(params.digest, env.siteUrl, params.unsubscribeToken),
      tags: [
        { name: "delivery_id", value: params.deliveryId },
        { name: "digest_type", value: params.digest.digestType }
      ]
    },
    ...params.requestOverrides
  });
}

export async function sendHealthReportEmail(params: {
  to: string;
  report: HealthReport;
  requestOverrides?: RequestOverrides;
}) {
  const env = requireEmailEnv();
  return sendResendRequestWithRetry({
    apiKey: env.resendApiKey,
    idempotencyKey: stableKey("health-report", [params.report.periodEnd, params.report.overallStatus, params.to]),
    stage: "resend_health_report",
    payload: {
      from: env.emailFrom,
      to: [params.to],
      subject: `HITnotice Daily Health Report｜${params.report.date}｜${params.report.overallStatus}`,
      html: renderHealthReportEmail(params.report, env.siteUrl)
    },
    ...params.requestOverrides
  });
}

export async function sendSubscriptionConfirmationEmail(params: {
  to: string;
  sourceNames: string[];
  unsubscribeToken: string;
  frequency: Frequency;
  requestOverrides?: RequestOverrides;
}) {
  const env = requireEmailEnv();
  return sendResendRequestWithRetry({
    apiKey: env.resendApiKey,
    idempotencyKey: stableKey("subscription-confirmation", [params.to, params.frequency, ...params.sourceNames]),
    stage: "resend_subscription_confirmation",
    payload: {
      from: env.emailFrom,
      to: [params.to],
      subject: "HITnotice 订阅成功确认",
      html: buildSubscriptionConfirmationEmail({
        siteUrl: env.siteUrl,
        sourceNames: params.sourceNames,
        unsubscribeToken: params.unsubscribeToken,
        frequency: params.frequency
      })
    },
    ...params.requestOverrides
  });
}
