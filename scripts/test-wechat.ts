import { loadEnvConfig } from "@next/env";
import { generateWechatArticleHtml } from "@/lib/wechat/article";
import { generateWechatCover } from "@/lib/wechat/cover";
import { buildWechatDraftRequest, createDraft } from "@/lib/wechat/draft";
import { getNoticesForSources } from "@/lib/digest/service";
import { getCurrentDigestPeriodEnd, getDefaultDigestWindow } from "@/lib/digest/windows";
import { uploadPermanentImage } from "@/lib/wechat/material";
import { getWechatAccessToken } from "@/lib/wechat/token";
import { sources } from "@/lib/sources";

const testDraft = {
  title: "丁香知讯 | 微信接口测试",
  content: "这是一篇测试草稿，不代表正式发布。",
  author: "HITnotice",
  digest: "HITnotice 微信草稿接口测试",
  thumbMediaId: ""
};

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(access_token|secret|appid)=([^&\s]+)/gi, "$1=[redacted]");
}

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

async function main() {
  loadEnvConfig(process.cwd());

  const dryRun = process.argv.includes("--dry-run");
  const createDraftTest = process.argv.includes("--create-draft");
  const createArticleDraftTest = process.argv.includes("--create-article-draft");
  const selectedModes = [dryRun, createDraftTest, createArticleDraftTest].filter(Boolean).length;

  if (selectedModes > 1) {
    throw new Error("Use only one Wechat test mode at a time");
  }

  if (dryRun) {
    const cover = await generateWechatCover(getShanghaiDate());
    try {
      const payload = buildWechatDraftRequest({ ...testDraft, thumbMediaId: "dry-run-media-id" });
      if (
        payload.articles.length !== 1 ||
        !payload.articles[0]?.title ||
        !payload.articles[0]?.content ||
        !payload.articles[0]?.thumb_media_id
      ) {
        throw new Error("Wechat draft payload validation failed");
      }
      console.log("Wechat cover generated successfully");
    } finally {
      await cover.cleanup();
    }
    console.log("Wechat dry run passed (no network request made)");
    return;
  }

  await getWechatAccessToken();
  console.log("Wechat token obtained");

  if (createDraftTest || createArticleDraftTest) {
    let content = testDraft.content;
    let digest = testDraft.digest;

    if (createArticleDraftTest) {
      const periodEnd = getCurrentDigestPeriodEnd();
      const window = getDefaultDigestWindow("weekday_digest", periodEnd);
      const sourceIds = sources
        .filter((source) => source.enabled && source.status === "active")
        .map((source) => source.id);
      const notices = await getNoticesForSources(sourceIds, window);
      content = generateWechatArticleHtml({
        date: getShanghaiDate(),
        notices,
        periodStart: window.start,
        periodEnd: window.end
      });
      digest = `今日新增通知 ${notices.length} 条`;
      console.log(`Wechat article HTML generated successfully: notices=${notices.length}`);
    }

    const cover = await generateWechatCover(getShanghaiDate());
    try {
      console.log("Wechat cover generated successfully");
      const thumbMediaId = await uploadPermanentImage(cover.path);
      console.log("Wechat cover uploaded successfully");
      await createDraft({ ...testDraft, content, digest, thumbMediaId });
      console.log("Draft created successfully");
    } finally {
      await cover.cleanup();
    }
  }
}

main().catch((error) => {
  console.error(`test:wechat failed: ${sanitizeError(error)}`);
  process.exitCode = 1;
});
