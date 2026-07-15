import { requestWechatApi, WechatApiError } from "@/lib/wechat/client";
import type { WechatTokenResponse } from "@/lib/wechat/types";

type CachedToken = {
  appId: string;
  accessToken: string;
  expiresAt: number;
};

let cachedToken: CachedToken | null = null;

function getWechatCredentials() {
  const appId = process.env.WECHAT_APP_ID?.trim();
  const appSecret = process.env.WECHAT_APP_SECRET?.trim();
  const missing = [
    !appId ? "WECHAT_APP_ID" : "",
    !appSecret ? "WECHAT_APP_SECRET" : ""
  ].filter(Boolean);

  if (!appId || !appSecret) {
    throw new WechatApiError(`Missing required environment variable(s): ${missing.join(", ")}`);
  }

  return { appId, appSecret };
}

export async function getWechatAccessToken(): Promise<string> {
  const { appId, appSecret } = getWechatCredentials();
  const now = Date.now();

  if (cachedToken && cachedToken.appId === appId && cachedToken.expiresAt > now) {
    return cachedToken.accessToken;
  }

  const response = await requestWechatApi<WechatTokenResponse>("token", {
    query: {
      grant_type: "client_credential",
      appid: appId,
      secret: appSecret
    }
  });

  if (typeof response.access_token !== "string" || typeof response.expires_in !== "number") {
    throw new WechatApiError("Wechat token response is missing access_token or expires_in");
  }

  const refreshBufferSeconds = Math.min(300, Math.max(0, response.expires_in - 60));
  cachedToken = {
    appId,
    accessToken: response.access_token,
    expiresAt: now + (response.expires_in - refreshBufferSeconds) * 1000
  };

  return response.access_token;
}
