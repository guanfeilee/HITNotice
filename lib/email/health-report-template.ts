import { formatBeijingDateTime } from "@/lib/digest/windows";
import { escapeHtml, renderEmailLayout } from "@/lib/email/layout";
import type { HealthReport, HealthSourceStatus } from "@/lib/health/report";

function statusLabel(status: HealthSourceStatus["status"]) {
  if (status === "healthy") return "Healthy";
  if (status === "failed") return "Failed";
  return "No data";
}

function statusColor(status: HealthSourceStatus["status"]) {
  if (status === "healthy") return "#137333";
  if (status === "failed") return "#b3261e";
  return "#8a5a00";
}

function renderSourceRows(report: HealthReport) {
  return report.sources
    .map(
      (source) => `
        <tr>
          <td style="padding: 12px 0; border-top: 1px solid #e7e1d7; color: #222222; font-weight: 700; word-break: break-word;">${escapeHtml(source.sourceName)}</td>
          <td style="padding: 12px 0; border-top: 1px solid #e7e1d7; color: ${statusColor(source.status)}; font-weight: 700;">${escapeHtml(statusLabel(source.status))}</td>
          <td style="padding: 12px 0; border-top: 1px solid #e7e1d7; color: #222222; text-align: right;">${source.newNotices}</td>
        </tr>
        ${
          source.lastError
            ? `<tr><td colspan="3" style="padding: 0 0 12px; color: #666666; font-size: 13px; word-break: break-word;">Reason: ${escapeHtml(source.lastError)}</td></tr>`
            : ""
        }
      `
    )
    .join("");
}

export function renderHealthReportEmail(report: HealthReport, siteUrl: string) {
  const contentHtml = `
    <p style="margin: 0; color: #222222; font-size: 16px;">日期：${escapeHtml(report.date)}</p>
    <p style="margin: 8px 0 0; color: #222222; font-size: 16px;">系统状态：<strong>${escapeHtml(report.overallStatus)}</strong></p>
    <p style="margin: 8px 0 22px; color: #666666; font-size: 14px;">统计窗口：${escapeHtml(formatBeijingDateTime(report.periodStart))} - ${escapeHtml(formatBeijingDateTime(report.periodEnd))}</p>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#faf8f3" style="width: 100%; border-collapse: collapse; background: #faf8f3; border: 1px solid #ded8cc; border-radius: 12px;">
      <tr>
        <td style="padding: 16px; color: #222222;">Total sources<br><strong style="font-size: 22px;">${report.totalSources}</strong></td>
        <td style="padding: 16px; color: #137333;">Successful<br><strong style="font-size: 22px;">${report.successfulSources}</strong></td>
        <td style="padding: 16px; color: #b3261e;">Failed<br><strong style="font-size: 22px;">${report.failedSources}</strong></td>
        <td style="padding: 16px; color: #222222;">New notices<br><strong style="font-size: 22px;">${report.totalNewNotices}</strong></td>
      </tr>
    </table>

    <h2 style="margin: 26px 0 8px; color: #222222; font-size: 18px;">Source Status</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th align="left" style="padding: 8px 0; color: #666666; font-size: 13px;">Source</th>
          <th align="left" style="padding: 8px 0; color: #666666; font-size: 13px;">Status</th>
          <th align="right" style="padding: 8px 0; color: #666666; font-size: 13px;">New notices</th>
        </tr>
      </thead>
      <tbody>${renderSourceRows(report)}</tbody>
    </table>

    <h2 style="margin: 26px 0 8px; color: #222222; font-size: 18px;">Digest Status</h2>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#faf8f3" style="width: 100%; border-collapse: collapse; background: #faf8f3; border: 1px solid #ded8cc; border-radius: 12px;">
      <tr><td style="padding: 16px; color: #222222;">Last digest: <strong>${escapeHtml(report.digest.status)}</strong></td></tr>
      <tr><td style="padding: 0 16px 16px; color: #222222;">Recipients: ${report.digest.recipients} | Successful: ${report.digest.successful} | Failed: ${report.digest.failed}</td></tr>
      ${
        report.digest.lastError
          ? `<tr><td style="padding: 0 16px 16px; color: #666666; font-size: 13px; word-break: break-word;">Reason: ${escapeHtml(report.digest.lastError)}</td></tr>`
          : ""
      }
    </table>
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
