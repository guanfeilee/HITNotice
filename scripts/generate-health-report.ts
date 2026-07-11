import { loadEnvConfig } from "@next/env";
import { generateHealthReport, renderHealthReportText } from "@/lib/health/report";
import { sendHealthReportEmail } from "@/lib/email/resend";

const defaultHealthReportEmail = "leegfei@163.com";

function isDryRun() {
  return process.argv.includes("--dry-run");
}

function getHealthReportEmail() {
  return process.env.HEALTH_REPORT_EMAIL?.trim() || defaultHealthReportEmail;
}

function sanitizeError(error: unknown) {
  const type = error instanceof Error && error.name ? error.name : "Error";
  const message = error instanceof Error ? error.message : String(error);

  return `${type}: ${message
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, "$1[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/https?:\/\/\S+/gi, "[redacted-url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240)}`;
}

async function main() {
  loadEnvConfig(process.cwd());

  const report = await generateHealthReport();

  if (isDryRun()) {
    console.log(renderHealthReportText(report));
    return;
  }

  const to = getHealthReportEmail();
  await sendHealthReportEmail({
    to,
    report
  });

  console.log(
    `Health report sent: to=${to.replace(/(^.).*(@.*$)/, "$1***$2")}, status=${report.overallStatus}, sources=${report.totalSources}, failed=${report.failedSources}, digest=${report.digest.status}`
  );
}

main().catch((error) => {
  console.error(`health:report failed: ${sanitizeError(error)}`);
  process.exitCode = 1;
});
