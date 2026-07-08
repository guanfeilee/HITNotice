import { getEmailEnv } from "@/lib/email/config";
import { renderDailyDigestEmail } from "@/lib/email/template";
import type { DailyDigest } from "@/lib/digest/types";

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

export async function sendDailyDigestEmail(params: {
  to: string;
  digest: DailyDigest;
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
      subject: `HITnotice 每日通知摘要｜${params.digest.date}｜${params.digest.total} 条新增`,
      html: renderDailyDigestEmail(params.digest, env.siteUrl, params.unsubscribeToken)
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
