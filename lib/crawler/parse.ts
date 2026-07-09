import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { CrawlSource, ParsedNotice } from "@/lib/crawler/types";
import { cleanTitle, normalizeUrl } from "@/lib/crawler/normalize";

const maxItemsPerSource = 20;
const maxTodayItems = 35;

const skipTitlePatterns = [
  /^更多$/,
  /^more$/i,
  /^首页$/,
  /^学校首页$/,
  /^返回.*首页$/,
  /^上一页$/,
  /^下一页$/,
  /^尾页$/,
  /^末页$/,
  /^登录$/,
  /^通知公告$/,
  /^学校要闻$/,
  /^学院新闻$/,
  /^新闻动态$/,
  /^人才培养$/,
  /^科学研究$/,
  /^招生就业$/,
  /^学生工作$/,
  /^联系我们$/,
  /^English$/i
];

function normalizeDateParts(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0")
  ].join("-");
}

export function extractDate(text: string) {
  const normalized = text.replace(/\s+/g, " ");
  const full = normalized.match(/(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?/);
  if (full?.[1] && full[2] && full[3]) {
    return normalizeDateParts(Number(full[1]), Number(full[2]), Number(full[3]));
  }

  const short = normalized.match(/(?<!\d)(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)/);
  if (short?.[1] && short[2]) {
    return normalizeDateParts(new Date().getFullYear(), Number(short[1]), Number(short[2]));
  }

  return null;
}

function isLikelyTitle(title: string) {
  const chineseChars = title.match(/[\u4e00-\u9fa5]/g)?.length ?? 0;

  if (title.length < 10 && chineseChars < 6) return false;
  if (title.length > 160) return false;
  if (skipTitlePatterns.some((pattern) => pattern.test(title))) return false;

  return true;
}

function isUsableHref(href?: string) {
  return Boolean(href) && !href?.startsWith("#") && !/^(javascript:|mailto:|tel:)/i.test(href ?? "");
}

function isLikelyArticleUrl(url: string, source: CrawlSource) {
  const parsed = new URL(url);
  const sourceHost = new URL(source.baseUrl).host;

  if (parsed.host !== sourceHost) return false;
  if (parsed.pathname === "/" || parsed.pathname === new URL(source.url).pathname) return false;
  if (/(list|index)\d*\.(htm|html)$/i.test(parsed.pathname) && !/\/\d{4,}\//.test(parsed.pathname)) {
    return false;
  }

  return (
    /\/article\/20[0-3]\d\//i.test(parsed.pathname) ||
    /\/20[0-3]\d\//.test(parsed.pathname) ||
    /\/info\/\d+\/\d+\.(htm|html)$/i.test(parsed.pathname) ||
    /\/(?:detail|content|article)\/[^/]+/i.test(parsed.pathname) ||
    /\/c\d+a\d+\/page\.htm$/i.test(parsed.pathname) ||
    /\d+\.(htm|html)$/i.test(parsed.pathname)
  );
}

function getContextText($: cheerio.CheerioAPI, element: Element) {
  const anchor = $(element);
  const containers = [
    anchor.closest("li"),
    anchor.closest("tr"),
    anchor.closest(".item"),
    anchor.closest(".list-item"),
    anchor.parent(),
    anchor.parent().parent()
  ];

  for (const container of containers) {
    const text = container.text().replace(/\s+/g, " ").trim();
    if (text) return text;
  }

  return anchor.text().replace(/\s+/g, " ").trim();
}

function getTitle($: cheerio.CheerioAPI, element: Element) {
  const anchor = $(element);
  return cleanTitle(anchor.attr("title") ?? anchor.text());
}

function getMaxItemsForSource(source: CrawlSource) {
  return source.id === "today" ? maxTodayItems : maxItemsPerSource;
}

export function parseNoticesFromHtml(html: string, source: CrawlSource, pageUrl = source.url) {
  const $ = cheerio.load(html);
  const candidates: ParsedNotice[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!isUsableHref(href)) return;

    const title = getTitle($, element);
    if (!isLikelyTitle(title)) return;

    const url = normalizeUrl(href ?? "", pageUrl);
    if (!url || !isLikelyArticleUrl(url, source)) return;

    const context = getContextText($, element);
    candidates.push({
      title,
      url,
      published_at: extractDate(context)
    });
  });

  const seen = new Set<string>();
  const parsed = candidates
    .filter((notice) => {
      const key = notice.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, getMaxItemsForSource(source));

  if (parsed.length > 0 || source.id !== "life") {
    return parsed;
  }

  return parseLifeScienceNotices($, source, pageUrl);
}

function parseLifeScienceNotices($: cheerio.CheerioAPI, source: CrawlSource, pageUrl: string) {
  const seen = new Set<string>();
  const notices: ParsedNotice[] = [];

  $("a[href]").each((_, element) => {
    const href = $(element).attr("href");
    if (!isUsableHref(href)) return;

    const url = normalizeUrl(href ?? "", pageUrl);
    if (!url || !/\/20[0-3]\d\/\d{4}\/c\d+a\d+\/page\.htm$/i.test(new URL(url).pathname)) return;
    if (!url || seen.has(url)) return;

    const context = getContextText($, element);
    const title = cleanLifeScienceTitle(context);
    if (!isLikelyTitle(title)) return;

    notices.push({
      title,
      url,
      published_at: extractLifeScienceDate(context) ?? extractDate(context)
    });
    seen.add(url);
  });

  return notices.slice(0, getMaxItemsForSource(source));
}

function extractLifeScienceDate(text: string) {
  const match = text.replace(/\s+/g, " ").match(/(?<!\d)(\d{1,2})\s*(20\d{2})-(\d{1,2})(?!\d)/);
  if (!match?.[1] || !match[2] || !match[3]) return null;

  return normalizeDateParts(Number(match[2]), Number(match[3]), Number(match[1]));
}

function cleanLifeScienceTitle(text: string) {
  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/^\d{1,2}\s*20\d{2}-\d{1,2}\s*/, "")
    .replace(/\s*详情\s*$/, "")
    .trim();

  const noticeMatch = normalized.match(/^(.{8,90}?(?:通知|公示|公告|名单|活动|院庆))/);
  if (noticeMatch?.[1]) {
    return cleanTitle(noticeMatch[1]);
  }

  return cleanTitle(normalized.slice(0, 90));
}
