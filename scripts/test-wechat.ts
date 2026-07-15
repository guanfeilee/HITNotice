import { loadEnvConfig } from "@next/env";
import { buildWechatDraftRequest, createDraft } from "@/lib/wechat/draft";
import { getWechatAccessToken } from "@/lib/wechat/token";

const testDraft = {
  title: "HITnotice 微信接口测试",
  content: "这是一篇测试草稿，不代表正式发布。",
  author: "HITnotice",
  digest: "HITnotice 微信草稿接口测试"
};

function sanitizeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/(access_token|secret|appid)=([^&\s]+)/gi, "$1=[redacted]");
}

async function main() {
  loadEnvConfig(process.cwd());

  const dryRun = process.argv.includes("--dry-run");
  const createDraftTest = process.argv.includes("--create-draft");

  if (dryRun && createDraftTest) {
    throw new Error("Use either --dry-run or --create-draft, not both");
  }

  if (dryRun) {
    const payload = buildWechatDraftRequest(testDraft);
    if (payload.articles.length !== 1 || !payload.articles[0]?.title || !payload.articles[0]?.content) {
      throw new Error("Wechat draft payload validation failed");
    }
    console.log("Wechat dry run passed (no network request made)");
    return;
  }

  await getWechatAccessToken();
  console.log("Wechat token obtained");

  if (createDraftTest) {
    await createDraft(testDraft);
    console.log("Draft created successfully");
  }
}

main().catch((error) => {
  console.error(`test:wechat failed: ${sanitizeError(error)}`);
  process.exitCode = 1;
});
