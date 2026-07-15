import { loadEnvConfig } from "@next/env";
import { getNoticesForSources } from "@/lib/digest/service";
import { getCurrentDigestPeriodEnd, getDefaultDigestWindow } from "@/lib/digest/windows";
import { sources } from "@/lib/sources";
import { generateWechatArticleHtml, getWechatArticleTitle } from "@/lib/wechat/article";
import { generateWechatCover } from "@/lib/wechat/cover";
import { createDraft } from "@/lib/wechat/draft";
import { uploadPermanentImage } from "@/lib/wechat/material";
import { getWechatAccessToken } from "@/lib/wechat/token";

function getShanghaiDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return `${values.year}-${values.month}-${values.day}`;
}

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(access_token|secret|appid)=([^&\s]+)/gi, "$1=[redacted]");
}

async function main() {
  loadEnvConfig(process.cwd());

  const date = getShanghaiDate();
  const periodEnd = getCurrentDigestPeriodEnd();
  const window = getDefaultDigestWindow("weekday_digest", periodEnd);
  const sourceIds = sources
    .filter((source) => source.enabled && source.status === "active")
    .map((source) => source.id);

  console.log(`Wechat draft date: ${date}`);

  await getWechatAccessToken();
  console.log("Wechat access token: obtained");

  const notices = await getNoticesForSources(sourceIds, window);
  console.log(`Wechat notices: ${notices.length}`);

  const content = generateWechatArticleHtml({
    date,
    notices,
    periodStart: window.start,
    periodEnd: window.end
  });
  const cover = await generateWechatCover(date);

  try {
    console.log("Wechat cover: generated");
    const thumbMediaId = await uploadPermanentImage(cover.path);
    console.log("Wechat cover: uploaded");

    await createDraft({
      title: getWechatArticleTitle(date),
      content,
      author: "HITnotice",
      digest: `今日新增通知 ${notices.length} 条`,
      thumbMediaId
    });
    console.log("Wechat draft: created");
  } finally {
    await cover.cleanup();
  }
}

main().catch((error) => {
  console.error(`wechat:draft failed: ${sanitizeError(error)}`);
  process.exitCode = 1;
});
