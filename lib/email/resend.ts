import { getEmailEnv } from "@/lib/email/config";
import { renderHealthReportEmail } from "@/lib/email/health-report-template";
import { renderDigestEmail } from "@/lib/email/template";
import { buildSubscriptionConfirmationEmail } from "@/lib/email/subscription-template";
import type { Digest } from "@/lib/digest/types";
import type { Frequency } from "@/lib/types";
import type { HealthReport } from "@/lib/health/report";

type ResendErrorBody = {
  message?: string;
  name?: string;
  statusCode?: number;
};

function sanitizeResendReason(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function formatResendError(response: Response, body: ResendErrorBody | null) {
  const type = body?.name ?? "Resend API error";
  const reason = sanitizeResendReason(body?.message ?? response.statusText ?? "Request failed");

  return `${type}: ${reason} (HTTP ${response.status})`;
}

function getDigestLabel(digest: Digest) {
  return digest.digestType === "weekly_digest" ? "每周通知摘要" : "工作日通知摘要";
}

export async function sendDigestEmail(params: {
  to: string;
  digest: Digest;
  unsubscribeToken: string;
}) {
  const env = getEmailEnv();
  if (!env.ok) {
    throw new Error(env.error);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [params.to],
      subject: `HITnotice ${getDigestLabel(params.digest)}｜${params.digest.date}｜${params.digest.total} 条新增`,
      html: renderDigestEmail(params.digest, env.siteUrl, params.unsubscribeToken)
    })
  });

  if (!response.ok) {
    let errorBody: ResendErrorBody | null = null;

    try {
      errorBody = (await response.json()) as ResendErrorBody;
    } catch {
      errorBody = null;
    }

    throw new Error(formatResendError(response, errorBody));
  }
}

export async function sendHealthReportEmail(params: {
  to: string;
  report: HealthReport;
}) {
  const env = getEmailEnv();
  if (!env.ok) {
    throw new Error(env.error);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [params.to],
      subject: `HITnotice Daily Health Report｜${params.report.date}｜${params.report.overallStatus}`,
      html: renderHealthReportEmail(params.report, env.siteUrl)
    })
  });

  if (!response.ok) {
    let errorBody: ResendErrorBody | null = null;

    try {
      errorBody = (await response.json()) as ResendErrorBody;
    } catch {
      errorBody = null;
    }

    throw new Error(formatResendError(response, errorBody));
  }
}

export async function sendSubscriptionConfirmationEmail(params: {
  to: string;
  sourceNames: string[];
  unsubscribeToken: string;
  frequency: Frequency;
}) {
  const env = getEmailEnv();
  if (!env.ok) {
    throw new Error(env.error);
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [params.to],
      subject: "HITnotice 订阅成功确认",
      html: buildSubscriptionConfirmationEmail({
        siteUrl: env.siteUrl,
        sourceNames: params.sourceNames,
        unsubscribeToken: params.unsubscribeToken,
        frequency: params.frequency
      })
    })
  });

  if (!response.ok) {
    let errorBody: ResendErrorBody | null = null;

    try {
      errorBody = (await response.json()) as ResendErrorBody;
    } catch {
      errorBody = null;
    }

    throw new Error(formatResendError(response, errorBody));
  }
}
