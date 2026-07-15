import { requestWechatApi, WechatApiError } from "@/lib/wechat/client";
import { getWechatAccessToken } from "@/lib/wechat/token";
import type {
  WechatDraftInput,
  WechatDraftRequest,
  WechatDraftResponse
} from "@/lib/wechat/types";

export function buildWechatDraftRequest(input: WechatDraftInput): WechatDraftRequest {
  return {
    articles: [
      {
        title: input.title,
        content: input.content,
        author: input.author,
        digest: input.digest,
        thumb_media_id: input.thumbMediaId
      }
    ]
  };
}

export async function createDraft(input: WechatDraftInput): Promise<string> {
  const accessToken = await getWechatAccessToken();
  const response = await requestWechatApi<WechatDraftResponse>("draft/add", {
    method: "POST",
    query: { access_token: accessToken },
    body: buildWechatDraftRequest(input)
  });

  if (typeof response.media_id !== "string") {
    throw new WechatApiError("Wechat draft response is missing media_id");
  }

  return response.media_id;
}
