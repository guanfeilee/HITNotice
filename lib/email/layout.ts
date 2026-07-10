type EmailLayoutParams = {
  documentTitle: string;
  heading: string;
  previewText: string;
  contentHtml: string;
  siteUrl: string;
  unsubscribeUrl: string;
  footerText: string;
};

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderEmailLayout(params: EmailLayoutParams) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(params.documentTitle)}</title>
    <style>
      @media only screen and (max-width: 600px) {
        .email-outer {
          padding: 20px !important;
        }

        .email-header,
        .email-body,
        .email-footer {
          padding-left: 20px !important;
          padding-right: 20px !important;
        }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background: #f6f2ea; color: #222222; font-family: Arial, 'Microsoft YaHei', 'PingFang SC', sans-serif; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    <div style="display: none !important; max-height: 0; max-width: 0; overflow: hidden; opacity: 0; color: transparent; font-size: 1px; line-height: 1px; mso-hide: all;">
      ${escapeHtml(params.previewText)}
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#f6f2ea" style="width: 100%; background: #f6f2ea; border-collapse: collapse;">
      <tr>
        <td class="email-outer" align="center" style="padding: 28px 16px;">
          <!--[if mso]>
          <table role="presentation" cellpadding="0" cellspacing="0" width="680" align="center">
            <tr>
              <td>
          <![endif]-->
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" bgcolor="#ffffff" style="width: 100%; max-width: 680px; border-collapse: collapse; background: #ffffff; border: 1px solid #ded8cc; border-radius: 14px; overflow: hidden;">
            <tr>
              <td class="email-header" bgcolor="#00008b" style="padding: 28px 28px 22px; background: #00008b;">
                <a href="${escapeHtml(params.siteUrl)}" style="color: #ffffff; font-size: 16px; font-weight: 700; line-height: 1.3; text-decoration: none;">HITnotice</a>
                <div style="margin-top: 4px; color: #eceaf8; font-size: 13px; line-height: 1.4;">哈工大公开通知提醒服务</div>
                <h1 style="margin: 10px 0 0; color: #ffffff; font-size: 28px; line-height: 1.25; word-break: break-word; overflow-wrap: anywhere;">${escapeHtml(params.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td class="email-body" style="padding: 26px 28px;">
                ${params.contentHtml}
              </td>
            </tr>
            <tr>
              <td class="email-footer" bgcolor="#faf8f3" style="padding: 18px 28px 24px; border-top: 1px solid #ded8cc; color: #666666; font-size: 13px; background: #faf8f3;">
                <p style="margin: 0;">${escapeHtml(params.footerText)}</p>
                <p style="margin: 8px 0 0;"><a href="${escapeHtml(params.unsubscribeUrl)}" style="color: #00008b; text-decoration: none;">取消订阅</a></p>
              </td>
            </tr>
          </table>
          <!--[if mso]>
              </td>
            </tr>
          </table>
          <![endif]-->
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
