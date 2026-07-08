function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildSubscriptionConfirmationEmail(params: {
  siteUrl: string;
  sourceNames: string[];
  unsubscribeToken: string;
}) {
  const unsubscribeUrl = `${params.siteUrl}/unsubscribe?token=${encodeURIComponent(params.unsubscribeToken)}`;
  const subscribedSourceNames = params.sourceNames.join("、");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>HITnotice 订阅成功确认</title>
  </head>
  <body style="margin: 0; padding: 0; background: #f6f2ea; color: #222222; font-family: Arial, 'Microsoft YaHei', 'PingFang SC', sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #f6f2ea; border-collapse: collapse;">
      <tr>
        <td align="center" style="padding: 28px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 680px; border-collapse: collapse; background: #ffffff; border: 1px solid #ded8cc; border-radius: 14px; overflow: hidden;">
            <tr>
              <td style="padding: 28px 28px 22px; background: #00008b;">
                <div style="color: #eceaf8; font-size: 13px; font-weight: 700;">HITnotice</div>
                <h1 style="margin: 8px 0 0; color: #ffffff; font-size: 28px; line-height: 1.25;">HITnotice 订阅成功确认</h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 26px 28px;">
                <p style="margin: 0; color: #222222; font-size: 16px;">感谢订阅 HITnotice。</p>
                <p style="margin: 10px 0 0; color: #222222; font-size: 16px;">当前订阅已成功创建。</p>
                <p style="margin: 10px 0 22px; color: #666666; font-size: 14px;">HITnotice 会在工作日 20:00 发送通知摘要。</p>
                <div style="border-left: 4px solid #00008b; padding: 10px 14px; background: #faf8f3; color: #666666; font-size: 14px;">
                  已订阅的信息渠道：${escapeHtml(subscribedSourceNames || "未选择")}
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding: 18px 28px 24px; border-top: 1px solid #ded8cc; color: #666666; font-size: 13px; background: #faf8f3;">
                <p style="margin: 0;">如果你不想继续接收 HITnotice 邮件摘要，可以随时取消订阅。</p>
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
