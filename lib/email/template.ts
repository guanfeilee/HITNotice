import { formatBeijingDateTime } from "@/lib/digest/windows";
import type { DailyDigest, DigestNotice } from "@/lib/digest/types";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function noticeTime(notice: DigestNotice) {
  return formatBeijingDateTime(notice.publishedAt ?? notice.firstSeenAt);
}

function renderNotice(notice: DigestNotice) {
  return `
    <tr>
      <td style="padding: 12px 0; border-top: 1px solid #e7e1d7;">
        <a href="${escapeHtml(notice.url)}" style="color: #00008b; font-size: 16px; font-weight: 700; text-decoration: none;">${escapeHtml(notice.title)}</a>
        <div style="margin-top: 4px; color: #666666; font-size: 13px;">发布时间：${escapeHtml(noticeTime(notice))}</div>
      </td>
    </tr>
  `;
}

function renderGroups(digest: DailyDigest) {
  if (digest.groups.length === 0) {
    return `
      <div style="border: 1px solid #ded8cc; border-radius: 12px; padding: 18px; background: #faf8f3; color: #666666;">
        当前时间窗口内没有新增通知。
      </div>
    `;
  }

  return digest.groups
    .map(
      (group) => `
        <section style="margin-top: 24px;">
          <h2 style="margin: 0 0 8px; color: #222222; font-size: 18px; line-height: 1.35;">${escapeHtml(group.sourceName)}</h2>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse;">
            <tbody>
              ${group.notices.map(renderNotice).join("")}
            </tbody>
          </table>
        </section>
      `
    )
    .join("");
}

export function renderDailyDigestEmail(digest: DailyDigest, siteUrl: string) {
  const unsubscribeUrl = `${siteUrl}/unsubscribe`;
  const subscribedSourceNames = digest.sources.map((source) => source.name).join("、");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>HITnotice 每日通知摘要</title>
  </head>
  <body style="margin: 0; padding: 0; background: #f6f2ea; color: #222222; font-family: Arial, 'Microsoft YaHei', 'PingFang SC', sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0;">
      ${escapeHtml(digest.date)} 新增 ${digest.total} 条通知
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #f6f2ea; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding: 28px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 680px; border-collapse: collapse; background: #ffffff; border: 1px solid #ded8cc; border-radius: 14px; overflow: hidden;">
            <tr>
              <td style="padding: 28px 28px 22px; background: #00008b;">
                <div style="color: #eceaf8; font-size: 13px; font-weight: 700;">HITnotice</div>
                <h1 style="margin: 8px 0 0; color: #ffffff; font-size: 28px; line-height: 1.25;">HITnotice 每日通知摘要</h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 26px 28px;">
                <p style="margin: 0; color: #222222; font-size: 16px;">日期：${escapeHtml(digest.date)}</p>
                <p style="margin: 8px 0 0; color: #222222; font-size: 16px;">新增通知数量：<strong>${digest.total}</strong></p>
                <p style="margin: 8px 0 22px; color: #666666; font-size: 14px;">统计窗口：${escapeHtml(formatBeijingDateTime(digest.periodStart))} - ${escapeHtml(formatBeijingDateTime(digest.periodEnd))}</p>
                <div style="border-left: 4px solid #00008b; padding: 10px 14px; background: #faf8f3; color: #666666; font-size: 14px;">
                  订阅信息源：${escapeHtml(subscribedSourceNames || "未选择")}
                </div>
                ${renderGroups(digest)}
              </td>
            </tr>
            <tr>
              <td style="padding: 18px 28px 24px; border-top: 1px solid #ded8cc; color: #666666; font-size: 13px; background: #faf8f3;">
                <p style="margin: 0;">你收到这封邮件，是因为你订阅了 HITnotice 校园通知摘要。</p>
                <p style="margin: 8px 0 0;"><a href="${escapeHtml(unsubscribeUrl)}" style="color: #00008b; text-decoration: none;">取消订阅</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
