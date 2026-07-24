import { getDigestDisplayFields } from "@/lib/health/report";
import { formatBeijingDateTime } from "@/lib/digest/windows";
import { escapeHtml, renderEmailLayout } from "@/lib/email/layout";
import type { HealthDigestStatus, HealthReport, HealthSourceStatus } from "@/lib/health/report";

function sourceStatusColor(status: HealthSourceStatus["status"]) {
  if (status === "healthy") return "#137333";
  if (status === "failed") return "#b3261e";
  return "#8a5a00";
}

function digestStatusColor(status: HealthDigestStatus["status"]) {
  if (status === "success" || status === "not_scheduled" || status === "scheduled") return "#137333";
  if (status === "failed" || status === "missing") return "#b3261e";
  return "#8a5a00";
}

function displayTime(value: string | null) {
  return value ? formatBeijingDateTime(value) : "Not available";
}

function renderSourceRows(report: HealthReport) {
  return report.sources
    .map(
      (source) => `
        <tr>
          <td style="padding: 12px 0; border-top: 1px solid #e7e1d7; color: #222222; font-weight: 700; word-break: break-word;">${escapeHtml(source.sourceName)}</td>
          <td style="padding: 12px 0; border-top: 1px solid #e7e1d7; color: ${sourceStatusColor(source.status)}; font-weight: 700;">${escapeHtml(source.freshness)}</td>
          <td style="padding: 12px 0; border-top: 1px solid #e7e1d7; color: ${sourceStatusColor(source.status)}; font-weight: 700;">${escapeHtml(source.status)}</td>
          <td style="padding: 12px 0; border-top: 1px solid #e7e1d7; color: #222222; text-align: right;">${source.newNotices}</td>
        </tr>
        <tr>
          <td colspan="4" style="padding: 0 0 12px; color: #666666; font-size: 13px; word-break: break-word;">
            Last crawl: ${escapeHtml(displayTime(source.lastRunAt))}<br>
            Error: ${escapeHtml(source.lastError ?? "None")}
          </td>
        </tr>
      `
    )
    .join("");
}

function renderDigestStatus(digest: HealthDigestStatus) {
  const rows = getDigestDisplayFields(digest)
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding: 6px 16px; color: #666666; width: 48%; vertical-align: top;">${escapeHtml(label)}</td>
          <td style="padding: 6px 16px; color: #222222; word-break: break-word; vertical-align: top;">${escapeHtml(value)}</td>
        </tr>
      `
    )
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#faf8f3" style="width: 100%; margin-top: 12px; border-collapse: collapse; background: #faf8f3; border: 1px solid #ded8cc; border-radius: 12px;">
      <tr>
        <td colspan="2" style="padding: 16px; color: #222222; font-weight: 700;">
          ${escapeHtml(digest.digestType)}
          <span style="color: ${digestStatusColor(digest.status)};"> · ${escapeHtml(digest.status)}</span>
        </td>
      </tr>
      ${rows}
      <tr><td colspan="2" style="height: 10px;"></td></tr>
    </table>
  `;
}

export function renderHealthReportEmail(report: HealthReport, siteUrl: string) {
  const weekday = report.digests.weekday_digest;
  const weekly = report.digests.weekly_digest;
  const contentHtml = `
    <p style="margin: 0; color: #222222; font-size: 16px;">日期：${escapeHtml(report.date)}</p>
    <p style="margin: 8px 0 0; color: #222222; font-size: 16px;">系统状态：<strong>${escapeHtml(report.overallStatus)}</strong></p>
    <p style="margin: 8px 0 22px; color: #666666; font-size: 14px;">统计窗口：${escapeHtml(formatBeijingDateTime(report.periodStart))} - ${escapeHtml(formatBeijingDateTime(report.periodEnd))}</p>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#faf8f3" style="width: 100%; border-collapse: collapse; background: #faf8f3; border: 1px solid #ded8cc; border-radius: 12px;">
      <tr><td style="padding: 16px; color: #222222;"><strong>Overall: ${escapeHtml(report.overallStatus)}</strong></td></tr>
      <tr><td style="padding: 0 16px 8px; color: #222222;">Crawler: ${report.successfulSources} healthy, ${report.failedSources} failed, ${report.staleSources} stale, ${report.noDataSources} no data</td></tr>
      <tr><td style="padding: 0 16px 8px; color: #222222;">Weekday: ${escapeHtml(weekday.status)}, ${weekday.users} users, ${weekday.recipients} recipients, ${weekday.skipped} skipped</td></tr>
      <tr><td style="padding: 0 16px 16px; color: #222222;">Weekly: ${escapeHtml(weekly.status)}, ${weekly.users} users, ${weekly.recipients} recipients, ${weekly.skipped} skipped</td></tr>
    </table>

    <h2 style="margin: 26px 0 8px; color: #222222; font-size: 18px;">Crawler Status</h2>
    <p style="margin: 0 0 8px; color: #666666; font-size: 13px;">New notices in the last 24 hours: ${report.totalNewNotices}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th align="left" style="padding: 8px 0; color: #666666; font-size: 13px;">Source</th>
          <th align="left" style="padding: 8px 0; color: #666666; font-size: 13px;">Freshness</th>
          <th align="left" style="padding: 8px 0; color: #666666; font-size: 13px;">Status</th>
          <th align="right" style="padding: 8px 0; color: #666666; font-size: 13px;">24h notices</th>
        </tr>
      </thead>
      <tbody>${renderSourceRows(report)}</tbody>
    </table>

    <h2 style="margin: 26px 0 8px; color: #222222; font-size: 18px;">Digest Status</h2>
    ${renderDigestStatus(weekday)}
    ${renderDigestStatus(weekly)}
  `;

  return renderEmailLayout({
    documentTitle: "HITnotice Daily Health Report",
    heading: "HITnotice Daily Health Report",
    previewText: `${report.date} system status: ${report.overallStatus}`,
    contentHtml,
    siteUrl,
    unsubscribeUrl: siteUrl,
    footerText: "这是一封 HITnotice 管理员系统健康监测报告。",
    showUnsubscribe: false
  });
}
