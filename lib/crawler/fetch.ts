import iconv from "iconv-lite";
import type { CrawlSource } from "@/lib/crawler/types";

const requestHeaders = {
  "User-Agent": "HITnoticeBot/0.1 (+https://hitnotice.cn)",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
};

function normalizeCharset(value?: string | null) {
  const charset = value?.trim().toLowerCase();
  if (!charset) return "utf-8";
  if (["gbk", "gb2312", "gb18030"].includes(charset)) return "gb18030";
  return charset;
}

function detectCharset(contentType: string | null, bytes: Buffer) {
  const headerMatch = contentType?.match(/charset=([^;\s]+)/i);
  if (headerMatch?.[1]) return normalizeCharset(headerMatch[1]);

  const preview = iconv.decode(bytes.subarray(0, 4096), "utf-8");
  const metaMatch =
    preview.match(/<meta[^>]+charset=["']?\s*([^"'\s/>]+)/i) ??
    preview.match(/<meta[^>]+content=["'][^"']*charset=([^"'\s;]+)/i);

  return normalizeCharset(metaMatch?.[1]);
}

export async function fetchSourceHtml(source: CrawlSource, timeoutMs = 15000) {
  const response = await fetch(source.url, {
    headers: requestHeaders,
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const charset = detectCharset(response.headers.get("content-type"), bytes);

  if (!iconv.encodingExists(charset)) {
    throw new Error(`Unsupported charset: ${charset}`);
  }

  return {
    html: iconv.decode(bytes, charset),
    finalUrl: response.url || source.url,
    charset
  };
}
