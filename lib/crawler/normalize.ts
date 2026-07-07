import { createHash } from "node:crypto";
import type { CrawlSource, CrawledNotice, ParsedNotice } from "@/lib/crawler/types";

const removableTrackingParams = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "spm",
  "from"
];

export function cleanTitle(value: string) {
  return value
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(通知公告|学校要闻|学院新闻|新闻动态|当前位置[:：])\s*/g, "")
    .trim();
}

export function normalizeUrl(href: string, baseUrl: string) {
  try {
    const url = new URL(href, baseUrl);
    url.hash = "";

    for (const param of removableTrackingParams) {
      url.searchParams.delete(param);
    }

    return url.toString();
  } catch {
    return "";
  }
}

export function makeNoticeHash(source: CrawlSource, normalizedUrl: string, title: string) {
  const stableKey = normalizedUrl || title;
  return createHash("sha256").update(`${source.id}|${stableKey}`).digest("hex").slice(0, 32);
}

export function normalizeCrawledNotice(source: CrawlSource, parsed: ParsedNotice, firstSeenAt: string): CrawledNotice {
  const title = cleanTitle(parsed.title);
  const url = normalizeUrl(parsed.url, source.url);

  return {
    title,
    url,
    source_name: source.name,
    source_id: source.id,
    category: source.category,
    published_at: parsed.published_at,
    first_seen_at: firstSeenAt,
    hash: makeNoticeHash(source, url, title)
  };
}

export function dedupeNotices(notices: CrawledNotice[]) {
  const seen = new Set<string>();

  return notices.filter((notice) => {
    if (seen.has(notice.hash)) return false;
    seen.add(notice.hash);
    return true;
  });
}
