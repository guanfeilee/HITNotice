import { escapeHtml, renderEmailLayout } from "@/lib/email/layout";

export function buildSubscriptionConfirmationEmail(params: {
  siteUrl: string;
  sourceNames: string[];
  unsubscribeToken: string;
}) {
  const unsubscribeUrl = `${params.siteUrl}/unsubscribe?token=${encodeURIComponent(params.unsubscribeToken)}`;
  const subscribedSourceNames = params.sourceNames.join("、");

  const contentHtml = `
    <p style="margin: 0; color: #222222; font-size: 16px;">感谢订阅 HITnotice。</p>
    <p style="margin: 10px 0 0; color: #222222; font-size: 16px;">当前订阅已成功创建。</p>
    <p style="margin: 10px 0 22px; color: #666666; font-size: 14px;">HITnotice 会在工作日 20:00 发送通知摘要。</p>
    <div style="border-left: 4px solid #00008b; padding: 10px 14px; background: #faf8f3; color: #666666; font-size: 14px; word-break: break-word;">
      已订阅的信息渠道：${escapeHtml(subscribedSourceNames || "未选择")}
    </div>
  `;

  return renderEmailLayout({
    documentTitle: "HITnotice 订阅成功确认",
    heading: "HITnotice 订阅成功确认",
    previewText: "HITnotice 订阅已成功创建",
    contentHtml,
    siteUrl: params.siteUrl,
    unsubscribeUrl,
    footerText: "如果你不想继续接收 HITnotice 邮件摘要，可以随时取消订阅。"
  });
}
