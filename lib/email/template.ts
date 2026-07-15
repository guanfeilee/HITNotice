import { formatBeijingDateTime } from "@/lib/digest/windows";
import type { Digest, DigestNotice } from "@/lib/digest/types";
import { escapeHtml, renderEmailLayout } from "@/lib/email/layout";

function renderNotice(notice: DigestNotice) {
  return `
    <tr>
      <td style="padding: 12px 0; border-top: 1px solid #e7e1d7;">
        <a href="${escapeHtml(notice.url)}" style="color: #00008b; font-size: 16px; font-weight: 700; line-height: 1.5; text-decoration: none; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(notice.title)}</a>
      </td>
    </tr>
  `;
}

function getDigestLabel(digest: Digest) {
  return digest.digestType === "weekly_digest" ? "每周通知摘要" : "工作日通知摘要";
}

function renderGroups(digest: Digest) {
  if (digest.groups.length === 0) {
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#faf8f3" style="width: 100%; border-collapse: collapse; background: #faf8f3; border: 1px solid #ded8cc; border-radius: 12px;">
        <tr>
          <td style="padding: 18px; color: #666666;">本次统计周期内暂无新的通知更新。</td>
        </tr>
      </table>
    `;
  }

  return digest.groups
    .map(
      (group) => `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding-top: 24px;">
              <h2 style="margin: 0 0 8px; color: #222222; font-size: 18px; line-height: 1.35; word-break: break-word;">${escapeHtml(group.sourceName)}</h2>
              ${
                group.hasUpdates
                  ? `
                    <p style="margin: 0 0 4px; color: #666666; font-size: 14px;">新增通知：</p>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width: 100%; border-collapse: collapse;">
                      <tbody>
                        ${group.notices.map(renderNotice).join("")}
                      </tbody>
                    </table>
                  `
                  : `
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#faf8f3" style="width: 100%; border-collapse: collapse; background: #faf8f3; border: 1px solid #ded8cc; border-radius: 12px;">
                      <tr>
                        <td style="padding: 14px 16px; color: #666666; font-size: 14px;">本次统计周期内无新增通知</td>
                      </tr>
                    </table>
                  `
              }
            </td>
          </tr>
        </table>
      `
    )
    .join("");
}

export function renderDigestEmail(digest: Digest, siteUrl: string, unsubscribeToken: string) {
  const unsubscribeUrl = `${siteUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
  const subscribedSourceNames = digest.sources.map((source) => source.name).join("、");
  const digestLabel = getDigestLabel(digest);

  const contentHtml = `
    <p style="margin: 0; color: #222222; font-size: 16px;">日期：${escapeHtml(digest.date)}</p>
    <p style="margin: 8px 0 0; color: #222222; font-size: 16px;">新增通知数量：<strong>${digest.total}</strong></p>
    <p style="margin: 8px 0 22px; color: #666666; font-size: 14px;">统计窗口：${escapeHtml(formatBeijingDateTime(digest.periodStart))} - ${escapeHtml(formatBeijingDateTime(digest.periodEnd))}</p>
    <div style="border-left: 4px solid #00008b; padding: 10px 14px; background: #faf8f3; color: #666666; font-size: 14px; word-break: break-word;">
      订阅信息源：${escapeHtml(subscribedSourceNames || "未选择")}
    </div>
    ${renderGroups(digest)}
  `;

  return renderEmailLayout({
    documentTitle: `HITnotice ${digestLabel}`,
    heading: `HITnotice ${digestLabel}`,
    previewText: `${digest.date} 新增 ${digest.total} 条通知`,
    contentHtml,
    siteUrl,
    unsubscribeUrl,
    footerText: "你收到这封邮件，是因为你订阅了 HITnotice 校园通知摘要。"
  });
}
