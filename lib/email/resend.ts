import { getEmailEnv } from "@/lib/email/config";
import { renderDailyDigestEmail } from "@/lib/email/template";
import type { DailyDigest } from "@/lib/digest/types";

type ResendErrorBody = {
  message?: string;
  name?: string;
  statusCode?: number;
};

export async function sendDailyDigestEmail(params: {
  to: string;
  digest: DailyDigest;
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
      html: renderDailyDigestEmail(params.digest, env.siteUrl)
    })
  });

  if (!response.ok) {
    let errorBody: ResendErrorBody | null = null;

    try {
      errorBody = (await response.json()) as ResendErrorBody;
    } catch {
      errorBody = null;
    }

    throw new Error(errorBody?.message ?? `Resend API failed with HTTP ${response.status}`);
  }
}
