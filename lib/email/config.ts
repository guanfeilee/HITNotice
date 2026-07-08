type EmailEnv =
  | {
      ok: true;
      resendApiKey: string;
      emailFrom: string;
      siteUrl: string;
    }
  | {
      ok: false;
      error: string;
    };

export function getEmailEnv(): EmailEnv {
  const resendApiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://hitnotice.cn";
  const missing = [
    !resendApiKey ? "RESEND_API_KEY" : "",
    !emailFrom ? "EMAIL_FROM" : ""
  ].filter(Boolean);

  if (missing.length > 0 || !resendApiKey || !emailFrom) {
    return {
      ok: false,
      error: `Email environment variables are missing: ${missing.join(", ")}`
    };
  }

  return {
    ok: true,
    resendApiKey,
    emailFrom,
    siteUrl: siteUrl.replace(/\/$/, "")
  };
}
