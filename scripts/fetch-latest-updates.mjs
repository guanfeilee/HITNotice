import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCES_PATH = path.join(process.cwd(), "lib", "source-registry.ts");
const OUTPUT_PATH = path.join(process.cwd(), "data", "latest-updates.json");
const DEFAULT_ITEMS_PER_SOURCE = 5;
const TODAY_HIT_ITEMS_PER_SOURCE = 20;
const MAX_TOTAL_UPDATES = 200;
const TODAY_HIT_FETCH_URL = "https://today.hit.edu.cn/category/10";
const SIMULATED_FAILED_SOURCE_IDS = new Set(
  (process.env.HITNOTICE_SIMULATE_FAILED_SOURCE_IDS ?? "")
    .split(",")
    .map((sourceId) => sourceId.trim())
    .filter(Boolean)
);
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
  Pragma: "no-cache"
};

const SKIP_TITLE_PATTERNS = [
  /^更多$/,
  /^more$/i,
  /^首页$/,
  /^学校首页$/,
  /^返回.*首页$/,
  /^上一页$/,
  /^下一页$/,
  /^末页$/,
  /^登录$/,
  /^通知公告$/,
  /^学校要闻$/,
  /^学院新闻$/,
  /^新闻动态$/,
  /^人才培养$/,
  /^科学研究$/,
  /^师资队伍$/,
  /^招生就业$/,
  /^学生工作$/,
  /^联系我们$/,
  /^English$/i
];

function readSourcesFromTs(sourceText) {
  const sourceArrayMatch = sourceText.match(/export const sourceRegistry\s*=\s*\[([\s\S]*?)\]\s*as const/s);
  if (!sourceArrayMatch?.[1]) {
    throw new Error("无法读取 lib/source-registry.ts 中的 sourceRegistry 配置");
  }

  const objectRegex = /\{[\s\S]*?\}/g;
  return Array.from(sourceArrayMatch[1].matchAll(objectRegex))
    .map((match) => {
      const objectText = match[0];
      const getString = (key) => objectText.match(new RegExp(`${key}:\\s*"([^"]*)"`))?.[1] ?? "";
      const enabled = objectText.match(/\benabled:\s*(true|false)/)?.[1] !== "false";
      const id = getString("id");
      const parserType = getString("parserType") || (id === "today" ? "today-hit" : "generic");
      const url = getString("url");

      return {
        id,
        name: getString("name"),
        category: getString("category"),
        url,
        enabled,
        parserType,
        fetchUrl: parserType === "today-hit" ? TODAY_HIT_FETCH_URL : url
      };
    })
    .filter((source) => source.id && source.name && source.enabled && source.fetchUrl);
}

function normalizeCharset(charset) {
  const normalized = charset?.trim().toLowerCase() || "utf-8";
  if (["gb2312", "gbk", "gb18030"].includes(normalized)) {
    return "gb18030";
  }
  return normalized;
}

function detectCharset(contentType, bytes) {
  const headerMatch = contentType?.match(/charset=([^;\s]+)/i);
  if (headerMatch?.[1]) {
    return normalizeCharset(headerMatch[1]);
  }

  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 4096));
  const metaMatch = head.match(/<meta[^>]+charset=["']?\s*([^"'\s/>]+)/i);
  return normalizeCharset(metaMatch?.[1]);
}

function decodeHtml(bytes, contentType) {
  const charset = detectCharset(contentType, bytes);
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function cleanText(html) {
  return decodeEntities(
    html
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function cleanTitle(html) {
  return cleanText(html)
    .replace(/^20\d{2}[-/.年]\s*\d{1,2}[-/.月]\s*\d{1,2}日?\s*/, "")
    .replace(/\s*20\d{2}[-/.年]\s*\d{1,2}[-/.月]\s*\d{1,2}日?\s*$/, "")
    .replace(/\s*\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:\s+\d{1,2}:\d{2})?\s*$/, "")
    .trim();
}

function getHref(attributes) {
  const hrefMatch = attributes.match(/\bhref\s*=\s*(["'])(.*?)\1/i) ?? attributes.match(/\bhref\s*=\s*([^\s>]+)/i);
  return hrefMatch?.[2] ?? hrefMatch?.[1] ?? "";
}

function makeAbsoluteUrl(href, sourceUrl) {
  try {
    return new URL(href, sourceUrl).toString();
  } catch {
    return "";
  }
}

function isUsableHref(href) {
  return Boolean(href) && !href.startsWith("#") && !/^(javascript:|mailto:|tel:)/i.test(href);
}

function isLikelyTitle(title) {
  if (title.length < 10 && (title.match(/[\u4e00-\u9fa5]/g)?.length ?? 0) < 6) {
    return false;
  }
  if (title.length > 140) {
    return false;
  }
  return !SKIP_TITLE_PATTERNS.some((pattern) => pattern.test(title));
}

function isLikelyArticleHref(href) {
  return /\/20[0-3]\d\//.test(href) || /\/c\d+a\d+\//i.test(href) || /\/info\/\d+\/\d+\.htm/i.test(href) || /article\/20[0-3]\d/i.test(href);
}

function isTodayHit(source) {
  return source.parserType === "today-hit";
}

function getItemsLimitForSource(source) {
  return isTodayHit(source) ? TODAY_HIT_ITEMS_PER_SOURCE : DEFAULT_ITEMS_PER_SOURCE;
}

function dedupeByUrlOrTitle(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.url || `${item.sourceId}:${item.title}`;
    const titleKey = `${item.sourceId}:${item.title}`;
    if (seen.has(key) || seen.has(titleKey)) {
      return false;
    }
    seen.add(key);
    seen.add(titleKey);
    return true;
  });
}

function getItemsLimitForSourceId(sourceId, sources) {
  const source = sources.find((item) => item.id === sourceId);
  return source ? getItemsLimitForSource(source) : DEFAULT_ITEMS_PER_SOURCE;
}

function getSortTime(update) {
  const timestamp = dateScore(update);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function normalizeCachedUpdate(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const update = {
    id: typeof value.id === "string" ? value.id : "",
    sourceId: typeof value.sourceId === "string" ? value.sourceId : "",
    sourceName: typeof value.sourceName === "string" ? value.sourceName : "",
    title: typeof value.title === "string" ? value.title : "",
    url: typeof value.url === "string" ? value.url : "",
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : "",
    fetchedAt: typeof value.fetchedAt === "string" ? value.fetchedAt : ""
  };

  if (!update.id || !update.sourceId || !update.sourceName || !update.title || !update.url || !update.fetchedAt) {
    return null;
  }

  return update;
}

async function readExistingUpdates() {
  try {
    const raw = await readFile(OUTPUT_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeCachedUpdate).filter(Boolean);
  } catch {
    return [];
  }
}

function groupUpdatesBySourceId(updates) {
  const grouped = new Map();
  for (const update of updates) {
    if (!update.sourceId) {
      continue;
    }
    if (!grouped.has(update.sourceId)) {
      grouped.set(update.sourceId, []);
    }
    grouped.get(update.sourceId).push(update);
  }
  return grouped;
}

function mergeWithExistingUpdates({ existingUpdates, fetchedUpdates, successfulSourceIds, enabledSources }) {
  const fetchedBySource = groupUpdatesBySourceId(fetchedUpdates);
  const existingBySource = groupUpdatesBySourceId(existingUpdates);
  const merged = [];
  const preservedCounts = new Map();

  for (const source of enabledSources) {
    const sourceId = source.id;
    const limit = getItemsLimitForSourceId(sourceId, enabledSources);
    const sourceItems = successfulSourceIds.has(sourceId)
      ? fetchedBySource.get(sourceId) ?? []
      : existingBySource.get(sourceId) ?? [];

    const cleaned = dedupeByUrlOrTitle(sourceItems)
      .sort((a, b) => getSortTime(b) - getSortTime(a))
      .slice(0, limit);

    if (!successfulSourceIds.has(sourceId) && cleaned.length > 0) {
      preservedCounts.set(sourceId, {
        sourceName: cleaned[0].sourceName || source.name,
        count: cleaned.length
      });
    }

    merged.push(...cleaned);
  }

  return {
    updates: dedupeByUrlOrTitle(merged)
      .sort((a, b) => getSortTime(b) - getSortTime(a))
      .slice(0, MAX_TOTAL_UPDATES),
    preservedCounts
  };
}

function extractDate(text) {
  const normalized = cleanText(text);
  const fullDate = normalized.match(/20\d{2}[-/.年]\s*\d{1,2}[-/.月]\s*\d{1,2}日?/);
  if (fullDate?.[0]) {
    return fullDate[0].replace(/\s+/g, "").replace(/[年月/.]/g, "-").replace(/日$/, "");
  }

  const shortDate = normalized.match(/\b\d{1,2}[-/]\d{1,2}\b/);
  return shortDate?.[0];
}

function normalizeDateParts(year, monthDay) {
  const cleanedYear = cleanText(year ?? "");
  const cleanedMonthDay = cleanText(monthDay ?? "");
  if (/^20\d{2}$/.test(cleanedYear) && /^\d{1,2}[-/.]\d{1,2}$/.test(cleanedMonthDay)) {
    return `${cleanedYear}-${cleanedMonthDay.replace(/[/.]/g, "-")}`;
  }
  if (/^20\d{2}[-/.]\d{1,2}$/.test(cleanedYear) && /^\d{1,2}$/.test(cleanedMonthDay)) {
    return `${cleanedYear.replace(/[/.]/g, "-")}-${cleanedMonthDay.padStart(2, "0")}`;
  }
  return extractDate(`${cleanedYear} ${cleanedMonthDay}`);
}

function extractTitleFromListItem(liHtml, linkAttributes, linkInnerHtml) {
  const titleFromAttr = linkAttributes.match(/\btitle\s*=\s*(["'])(.*?)\1/i)?.[2];
  if (titleFromAttr) {
    return titleFromAttr;
  }

  return (
    liHtml.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1] ??
    liHtml.match(/<div\b[^>]*class=(["'])[^"']*(?:news_title|xw-ul-tt|title)[^"']*\1[^>]*>([\s\S]*?)<\/div>/i)?.[2] ??
    liHtml.match(/<span\b[^>]*class=(["'])[^"']*(?:news_title|title)[^"']*\1[^>]*>([\s\S]*?)<\/span>/i)?.[2] ??
    linkInnerHtml
  );
}

function extractDateFromListItem(liHtml) {
  const directDate = extractDate(liHtml);
  if (directDate) {
    return directDate;
  }

  const businessDateBlock = liHtml.match(/<div\b[^>]*class=(["'])[^"']*xw-ul-date[^"']*\1[^>]*>([\s\S]*?)<\/div>/i)?.[2];
  if (businessDateBlock) {
    const day = businessDateBlock.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1];
    const yearMonth = cleanText(businessDateBlock.replace(/<span\b[^>]*>[\s\S]*?<\/span>/i, " "));
    const businessDate = normalizeDateParts(yearMonth, day);
    if (businessDate) {
      return businessDate;
    }
  }

  const divDay = liHtml.match(/<div\b[^>]*class=(["'])[^"']*(?:boxtop|news_days)[^"']*\1[^>]*>([\s\S]*?)<\/div>/i)?.[2];
  const divYearMonth = liHtml.match(/<div\b[^>]*class=(["'])[^"']*(?:boxd|news_year)[^"']*\1[^>]*>([\s\S]*?)<\/div>/i)?.[2];
  const divDate = normalizeDateParts(divYearMonth, divDay);
  if (divDate) {
    return divDate;
  }

  const spanDay = liHtml.match(/<span\b[^>]*class=(["'])[^"']*(?:day|news_days)[^"']*\1[^>]*>([\s\S]*?)<\/span>/i)?.[2];
  const spanYearMonth = liHtml.match(/<span\b[^>]*class=(["'])[^"']*(?:year|news_year)[^"']*\1[^>]*>([\s\S]*?)<\/span>/i)?.[2];
  return normalizeDateParts(spanYearMonth, spanDay);
}

function makeId(sourceId, title, url) {
  return `${sourceId}-${createHash("sha1").update(`${sourceId}:${title}:${url}`).digest("hex").slice(0, 12)}`;
}

function formatFetchedAt() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  return `${formatter.format(now).replace(" ", "T")}+08:00`;
}

function createUpdate(source, href, titleHtml, dateHtml, fetchedAt, baseUrl = source.fetchUrl) {
  const title = cleanTitle(titleHtml);
  if (!isUsableHref(href) || !isLikelyTitle(title)) {
    return null;
  }

  const url = makeAbsoluteUrl(href, baseUrl);
  if (!url || url === baseUrl) {
    return null;
  }

  return {
    id: makeId(source.id, title, url),
    sourceId: source.id,
    sourceName: source.name,
    title,
    url,
    publishedAt: dateHtml ? cleanText(dateHtml) : "",
    fetchedAt
  };
}

function parseUpdates(html, source, fetchedAt) {
  const limit = getItemsLimitForSource(source);
  const candidates = [];
  const liRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;

  while ((liMatch = liRegex.exec(html)) !== null) {
    const liHtml = liMatch[1];
    const linkMatch = liHtml.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    if (!linkMatch) {
      continue;
    }

    const href = getHref(linkMatch[1]);
    if (!isLikelyArticleHref(href)) {
      continue;
    }

    const title = extractTitleFromListItem(liHtml, linkMatch[1], linkMatch[2]);
    const publishedAt = extractDateFromListItem(liHtml);
    const item = createUpdate(source, href, title, publishedAt, fetchedAt);
    if (item) {
      candidates.push({ ...item, index: liMatch.index, score: publishedAt ? 2 : 1 });
    }
  }

  if (candidates.length < limit) {
    const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let anchorMatch;

    while ((anchorMatch = anchorRegex.exec(html)) !== null) {
      const [, attributes, innerHtml] = anchorMatch;
      const href = getHref(attributes);
      if (!isLikelyArticleHref(href)) {
        continue;
      }

      const title = attributes.match(/\btitle\s*=\s*(["'])(.*?)\1/i)?.[2] ?? innerHtml;
      const context = html.slice(Math.max(0, anchorMatch.index - 300), Math.min(html.length, anchorRegex.lastIndex + 420));
      const publishedAt = extractDate(context);
      const item = createUpdate(source, href, title, publishedAt, fetchedAt);
      if (item) {
        candidates.push({ ...item, index: anchorMatch.index, score: publishedAt ? 1 : 0 });
      }
    }
  }

  const deduped = dedupeByUrlOrTitle(candidates.sort((a, b) => b.score - a.score || a.index - b.index)).sort(
    (a, b) => a.index - b.index
  );

  return {
    parsedCount: deduped.length,
    updates: deduped.slice(0, limit).map((candidate) => ({
      id: candidate.id,
      sourceId: candidate.sourceId,
      sourceName: candidate.sourceName,
      title: candidate.title,
      url: candidate.url,
      publishedAt: candidate.publishedAt,
      fetchedAt: candidate.fetchedAt
    }))
  };
}

function debugTodayHitResponse(response, html) {
  void response;
  void html;
}

function parseTodayHitUpdates(html, source, fetchedAt, baseUrl) {
  const limit = getItemsLimitForSource(source);
  const items = [];
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(html)) !== null) {
    const [, attributes, innerHtml] = match;
    const href = getHref(attributes);
    if (!/\/article\/20[0-3]\d\//.test(href)) {
      continue;
    }

    const context = html.slice(Math.max(0, match.index - 320), Math.min(html.length, anchorRegex.lastIndex + 320));
    const date = context.match(/<span\b[^>]*class=(["'])date\1[^>]*>([\s\S]*?)<\/span>/i)?.[2] ?? extractDate(context);
    const item = createUpdate(source, href, innerHtml, date, fetchedAt, baseUrl);
    if (item) {
      items.push(item);
    }
  }

  const deduped = dedupeByUrlOrTitle(items);

  return {
    parsedCount: deduped.length,
    updates: deduped.slice(0, limit)
  };
}

async function fetchHtml(source) {
  const response = await fetch(source.fetchUrl, {
    headers: DEFAULT_HEADERS,
    redirect: "follow",
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const html = decodeHtml(bytes, response.headers.get("content-type"));
  return { response, html };
}

async function fetchTodayHitUpdates(source, fetchedAt) {
  const { response, html } = await fetchHtml(source);
  debugTodayHitResponse(response, html);
  const result = parseTodayHitUpdates(html, source, fetchedAt, response.url || source.fetchUrl);

  if (result.updates.length === 0) {
    if (!html.includes("/article/")) {
      throw new Error("HTML 中没有标题链接，疑似 JS 渲染或页面结构变化");
    }
    throw new Error("HTML 中包含 article 链接，但今日哈工大专用解析规则未匹配");
  }

  return result;
}

async function fetchSource(source, fetchedAt) {
  if (SIMULATED_FAILED_SOURCE_IDS.has(source.id)) {
    throw new Error("simulated fetch failure");
  }

  if (isTodayHit(source)) {
    return fetchTodayHitUpdates(source, fetchedAt);
  }

  const { html } = await fetchHtml(source);
  const result = parseUpdates(html, source, fetchedAt);

  if (result.updates.length === 0) {
    throw new Error("未解析到公开标题链接");
  }

  return result;
}

function dateScore(update) {
  const value = update.publishedAt || update.fetchedAt;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Date.parse(update.fetchedAt) : timestamp;
}

async function main() {
  const fetchedAt = formatFetchedAt();
  const sourceText = await readFile(SOURCES_PATH, "utf-8");
  const sources = readSourcesFromTs(sourceText);
  const existingUpdates = await readExistingUpdates();
  const results = [];
  const failures = [];
  const successfulSourceIds = new Set();
  const failedSourceIds = new Set();

  for (const source of sources) {
    try {
      const { parsedCount, updates } = await fetchSource(source, fetchedAt);
      results.push(...updates);
      successfulSourceIds.add(source.id);
      console.log(`[OK] ${source.name}: 解析到 ${parsedCount} 条，写入 ${updates.length} 条`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ sourceId: source.id, sourceName: source.name, url: source.url, error: message });
      failedSourceIds.add(source.id);
      console.warn(`[WARN] ${source.name}: ${message}`);
    }
  }

  const { updates, preservedCounts } = mergeWithExistingUpdates({
    existingUpdates,
    fetchedUpdates: results,
    successfulSourceIds,
    enabledSources: sources
  });

  if (existingUpdates.length >= 100 && updates.length < existingUpdates.length * 0.7) {
    throw new Error(
      `Refusing to write suspiciously small update cache: existing=${existingUpdates.length}, merged=${updates.length}`
    );
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(updates, null, 2)}\n`, "utf-8");

  console.log(`Saved ${updates.length} updates to ${OUTPUT_PATH}`);
  console.log(`Fetched sources: ${successfulSourceIds.size}/${sources.length}`);
  console.log(`Failed or empty sources: ${failedSourceIds.size}/${sources.length}`);
  console.log(`Existing cache preserved for failed sources: ${preservedCounts.size}`);
  console.log(`Final merged updates: ${updates.length}`);
  console.log(`Succeeded sources: ${successfulSourceIds.size}/${sources.length}`);
  if (failures.length > 0) {
    console.log("Failed sources:");
    for (const failure of failures) {
      console.log(`- ${failure.sourceName}: ${failure.error}`);
    }
  }
  if (preservedCounts.size > 0) {
    console.log("Preserved cached updates:");
    for (const preserved of preservedCounts.values()) {
      console.log(`- ${preserved.sourceName}: ${preserved.count}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
