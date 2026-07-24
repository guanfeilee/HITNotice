import { loadEnvConfig } from "@next/env";
import { generateHealthReport, renderHealthReportText } from "@/lib/health/report";
import { executeHealthReportCommand } from "@/lib/health/command";
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

  const result = await executeHealthReportCommand(
    { dryRun: isDryRun() },
    {
      generate: () => generateHealthReport(),
      renderText: renderHealthReportText,
      send: async (report) => {
        const to = getHealthReportEmail();
        await sendHealthReportEmail({
          to,
          report
        });
      },
      log: console.log
    }
  );

  if (!result.sent) return;
  const to = getHealthReportEmail();
  console.log(
    `Health report sent: to=${to.replace(/(^.).*(@.*$)/, "$1***$2")}, status=${result.report.overallStatus}, sources=${result.report.totalSources}, failed=${result.report.failedSources}, weekday=${result.report.digests.weekday_digest.status}, weekly=${result.report.digests.weekly_digest.status}`
  );
}

main().catch((error) => {
  console.error(`health:report failed: ${sanitizeError(error)}`);
  process.exitCode = 1;
});
