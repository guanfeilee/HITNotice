import { readFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { requestWechatApi, WechatApiError } from "@/lib/wechat/client";
import { getWechatAccessToken } from "@/lib/wechat/token";
import type { WechatMaterialResponse } from "@/lib/wechat/types";

const maxImageBytes = 10 * 1024 * 1024;

function getImageMimeType(imagePath: string) {
  const extension = extname(imagePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".bmp": "image/bmp",
    ".gif": "image/gif",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png"
  };
  const mimeType = mimeTypes[extension];

  if (!mimeType) {
    throw new WechatApiError(`Unsupported Wechat image format: ${extension || "no extension"}`);
  }

  return mimeType;
}

export async function uploadPermanentImage(imagePath: string): Promise<string> {
  const imageStat = await stat(imagePath);
  if (!imageStat.isFile()) {
    throw new WechatApiError("Wechat material path is not a file");
  }
  if (imageStat.size > maxImageBytes) {
    throw new WechatApiError("Wechat permanent image exceeds the 10 MB limit");
  }

  const image = await readFile(imagePath);
  const formData = new FormData();
  formData.append(
    "media",
    new Blob([new Uint8Array(image)], { type: getImageMimeType(imagePath) }),
    basename(imagePath)
  );

  const accessToken = await getWechatAccessToken();
  const response = await requestWechatApi<WechatMaterialResponse>("material/add_material", {
    method: "POST",
    query: {
      access_token: accessToken,
      type: "image"
    },
    formData
  });

  if (typeof response.media_id !== "string") {
    throw new WechatApiError("Wechat material response is missing media_id");
  }

  return response.media_id;
}
