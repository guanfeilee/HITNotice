import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_PATH = path.join(process.cwd(), "data", "debug", "latest-news-sample.json");

const FETCH_SOURCES = [
  {
    id: "today",
    name: "今日哈工大",
    url: "https://today.hit.edu.cn/category/10",
    parser: "today"
  },
  {
    id: "news",
    name: "哈工大新闻网",
    url: "https://news.hit.edu.cn/xxyw/list.htm",
    parser: "wp-news"
  },
  {
    id: "undergraduate",
    name: "本科生院",
    url: "https://hituc.hit.edu.cn/17860/list.htm",
    parser: "wp-card"
  },
  {
    id: "postgraduate",
    name: "研究生院",
    url: "https://hitgs.hit.edu.cn/tzgg/list.htm",
    parser: "wp-grad"
  },
  {
    id: "aerospace",
    name: "航天学院",
    url: "https://sa.hit.edu.cn/tzgg_6582/list.htm",
    parser: "academic"
  },
  {
    id: "electronic",
    name: "电子与信息工程学院",
    url: "https://seie.hit.edu.cn/xygg/list.htm",
    parser: "academic"
  },
  {
    id: "machine",
    name: "机电工程学院",
    url: "https://sme.hit.edu.cn/18013/list2.htm",
    parser: "academic"
  },
  {
    id: "material",
    name: "材料科学与工程学院",
    url: "https://mse.hit.edu.cn/16847/list.htm",
    parser: "academic"
  },
  {
    id: "resource",
    name: "能源科学与工程学院",
    url: "https://power.hit.edu.cn/5714/list.htm",
    parser: "academic"
  },
  {
    id: "electrical",
    name: "电气工程及自动化学院",
    url: "https://hitee.hit.edu.cn/17101/list.htm",
    parser: "academic"
  },
  {
    id: "instrument",
    name: "仪器科学与工程学院",
    url: "https://ise.hit.edu.cn/5304/list.htm",
    parser: "academic"
  },
  {
    id: "math",
    name: "数学学院",
    url: "https://math.hit.edu.cn/10232/list.htm",
    parser: "academic"
  },
  {
    id: "physics",
    name: "物理学院",
    url: "https://physics.hit.edu.cn/12332/list.htm",
    parser: "academic"
  },
  {
    id: "management",
    name: "经济与管理学院",
    url: "https://som.hit.edu.cn/index/tzgg1.htm",
    parser: "academic"
  },
  {
    id: "finance",
    name: "商学院",
    url: "https://hbs.hit.edu.cn/xwzx/tzgg1.htm",
    parser: "academic"
  },
  {
    id: "social",
    name: "人文社科学部",
    url: "https://rwskxb.hit.edu.cn/tzgg/list.htm",
    parser: "academic"
  },
  {
    id: "marx",
    name: "马克思主义学院",
    url: "https://marx.hit.edu.cn/tzgg/list.htm",
    parser: "academic"
  },
  {
    id: "civil",
    name: "土木工程学院",
    url: "https://civil.hit.edu.cn/8439/list.htm",
    parser: "academic"
  },
  {
    id: "environment",
    name: "环境学院",
    url: "https://env.hit.edu.cn/8344/list.htm",
    parser: "academic"
  },
  {
    id: "architecture",
    name: "建筑与设计学院",
    url: "https://arch.hit.edu.cn/11953/list.htm",
    parser: "academic"
  },
  {
    id: "traffic",
    name: "交通科学与工程学院",
    url: "https://jtxy.hit.edu.cn/tzgg/list.htm",
    parser: "academic"
  },
  {
    id: "computer",
    name: "计算学部",
    url: "https://computing.hit.edu.cn/11271/list.htm",
    parser: "academic"
  },
  {
    id: "chem",
    name: "化学与化工学院",
    url: "https://chemeng.hit.edu.cn/tzgg/list.htm",
    parser: "academic"
  },
  {
    id: "med",
    name: "医学与健康学院",
    url: "https://med.hit.edu.cn/12995/list.htm",
    parser: "academic"
  },
  {
    id: "life",
    name: "生命科学与技术学院",
    url: "https://life.hit.edu.cn/ggkx/list.htm",
    parser: "academic"
  },
  {
    id: "future",
    name: "未来技术学院",
    url: "https://future.hit.edu.cn/16314/list.htm",
    parser: "academic"
  }
];

const SKIP_TITLE_PATTERNS = [
  /^更多$/,
  /^more$/i,
  /^首页$/,
  /^上一页$/,
  /^下一页$/,
  /^末页$/,
  /^通知公告$/,
  /^学校要闻$/,
  /^学院新闻$/,
  /^新闻动态$/,
  /^人才培养$/,
  /^科学研究$/,
  /^师资队伍$/,
  /^招生就业$/,
  /^学生工作$/,
  /^校友工作$/,
  /^联系我们$/,
  /^旧版入口$/,
  /^English$/i
];

/**
 * @typedef {Object} NewsItem
 * @property {string} id
 * @property {string} title
 * @property {string} url
 * @property {string | undefined} [date]
 * @property {string} source
 * @property {string} sourceUrl
 */

function detectCharset(contentType, bytes) {
  const headerMatch = contentType?.match(/charset=([^;\s]+)/i);
  if (headerMatch?.[1]) {
    return normalizeCharset(headerMatch[1]);
  }

  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.slice(0, 4096));
  const metaMatch = head.match(/<meta[^>]+charset=["']?\s*([^"'\s/>]+)/i);
  return normalizeCharset(metaMatch?.[1] ?? "utf-8");
}

function normalizeCharset(charset) {
  const normalized = charset.trim().toLowerCase();
  if (["gb2312", "gbk", "gb18030"].includes(normalized)) {
    return "gb18030";
  }
  return normalized || "utf-8";
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

function getHref(attributes) {
  const hrefMatch = attributes.match(/\bhref\s*=\s*(["'])(.*?)\1/i) ?? attributes.match(/\bhref\s*=\s*([^\s>]+)/i);
  return hrefMatch?.[2] ?? hrefMatch?.[1] ?? "";
}

function isLikelyNewsTitle(title) {
  if (title.length < 5 || title.length > 120) {
    return false;
  }
  if (SKIP_TITLE_PATTERNS.some((pattern) => pattern.test(title))) {
    return false;
  }
  return /[\u4e00-\u9fa5]/.test(title);
}

function isUsableHref(href) {
  if (!href || href.startsWith("#")) {
    return false;
  }
  if (/^(javascript:|mailto:|tel:)/i.test(href)) {
    return false;
  }
  return true;
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

function makeAbsoluteUrl(href, sourceUrl) {
  try {
    return new URL(href, sourceUrl).toString();
  } catch {
    return "";
  }
}

function makeId(sourceId, url, title) {
  const hash = createHash("sha1").update(`${sourceId}:${url}:${title}`).digest("hex").slice(0, 12);
  return `${sourceId}-${hash}`;
}

function cleanTitle(html) {
  return cleanText(html)
    .replace(/^20\d{2}[-/.年]\s*\d{1,2}[-/.月]\s*\d{1,2}日?\s*/, "")
    .replace(/\s*20\d{2}[-/.年]\s*\d{1,2}[-/.月]\s*\d{1,2}日?\s*$/, "")
    .replace(/\s*\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?:\s+\d{1,2}:\d{2})?\s*$/, "")
    .trim();
}

function createNewsItem(source, href, titleHtml, dateHtml) {
  const title = cleanTitle(titleHtml);
  const url = makeAbsoluteUrl(href, source.url);

  if (!url || !isUsableHref(href) || !isLikelyNewsTitle(title)) {
    return null;
  }

  const date = dateHtml ? cleanText(dateHtml) : undefined;
  return {
    id: makeId(source.id, url, title),
    title,
    url,
    date: date || undefined,
    source: source.name,
    sourceUrl: source.url
  };
}

function uniqueFirstFive(items) {
  const unique = new Map();
  for (const item of items) {
    if (item && !unique.has(item.url)) {
      unique.set(item.url, item);
    }
  }
  return Array.from(unique.values()).slice(0, 5);
}

function parseTodayItems(html, source) {
  const items = [];
  const liRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = liRegex.exec(html)) !== null) {
    const liHtml = match[1];
    const linkMatch = liHtml.match(/<a\b[^>]*href=(["'])(\/article\/[^"']+)\1[^>]*>([\s\S]*?)<\/a>/i);
    if (!linkMatch) {
      continue;
    }

    const dateMatch = liHtml.match(/<span\b[^>]*class=(["'])date\1[^>]*>([\s\S]*?)<\/span>/i);
    items.push(createNewsItem(source, linkMatch[2], linkMatch[3], dateMatch?.[2]));
  }

  return uniqueFirstFive(items);
}

function parseWpNewsItems(html, source) {
  const items = [];
  const liRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = liRegex.exec(html)) !== null) {
    const liHtml = match[1];
    const timeMatch = liHtml.match(/<span\b[^>]*class=(["'])time\1[^>]*>([\s\S]*?)<\/span>/i);
    const linkMatch = liHtml.match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    const href = linkMatch ? getHref(linkMatch[1]) : "";
    const title = linkMatch?.[1].match(/\btitle\s*=\s*(["'])(.*?)\1/i)?.[2] ?? linkMatch?.[2] ?? "";

    if (!/\/20\d{2}\//.test(href)) {
      continue;
    }

    items.push(createNewsItem(source, href, title, timeMatch?.[2]));
  }

  return uniqueFirstFive(items);
}

function parseWpCardItems(html, source) {
  const items = [];
  const liRegex = /<li\b[^>]*class=(["'])[^"']*\bnews\b[^"']*\1[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = liRegex.exec(html)) !== null) {
    const liHtml = match[2];
    const linkMatch = liHtml.match(/<a\b([^>]*)>/i);
    const href = linkMatch ? getHref(linkMatch[1]) : "";
    const dateMatch = liHtml.match(/<div\b[^>]*class=(["'])news_meta\1[^>]*>([\s\S]*?)<\/div>/i);
    const titleMatch = liHtml.match(/<div\b[^>]*class=(["'])news_title\1[^>]*>([\s\S]*?)<\/div>/i);

    items.push(createNewsItem(source, href, titleMatch?.[2] ?? "", dateMatch?.[2]));
  }

  return uniqueFirstFive(items);
}

function parseWpGraduateItems(html, source) {
  const items = [];
  const liRegex = /<li\b[^>]*class=(["'])[^"']*\bnews\b[^"']*\1[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = liRegex.exec(html)) !== null) {
    const liHtml = match[2];
    const dayMatch = liHtml.match(/<span\b[^>]*class=(["'])news_year\1[^>]*>([\s\S]*?)<\/span>/i);
    const monthMatch = liHtml.match(/<span\b[^>]*class=(["'])news_days\1[^>]*>([\s\S]*?)<\/span>/i);
    const titleBlockMatch = liHtml.match(/<div\b[^>]*class=(["'])news_title\1[^>]*>([\s\S]*?)<\/div>/i);
    const linkMatch = titleBlockMatch?.[2].match(/<a\b([^>]*)>([\s\S]*?)<\/a>/i);
    const href = linkMatch ? getHref(linkMatch[1]) : "";
    const title = linkMatch?.[1].match(/\btitle\s*=\s*(["'])(.*?)\1/i)?.[2] ?? linkMatch?.[2] ?? "";
    const month = monthMatch ? cleanText(monthMatch[2]) : "";
    const day = dayMatch ? cleanText(dayMatch[2]).padStart(2, "0") : "";
    const date = month && day ? `${month}-${day}` : undefined;

    items.push(createNewsItem(source, href, title, date));
  }

  return uniqueFirstFive(items);
}

function isLikelyAcademicHref(href) {
  return (
    /\/20\d{2}\//.test(href) ||
    /\/c\d+a\d+\//i.test(href) ||
    /\/info\/\d+\/\d+\.htm/i.test(href)
  );
}

function extractAcademicTitle(liHtml, linkAttributes, linkInnerHtml) {
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

function extractAcademicDate(liHtml) {
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

function parseAcademicItems(html, source) {
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
    if (!isLikelyAcademicHref(href)) {
      continue;
    }

    const title = extractAcademicTitle(liHtml, linkMatch[1], linkMatch[2]);
    const date = extractAcademicDate(liHtml);

    const item = createNewsItem(source, href, title, date);
    if (item) {
      candidates.push({ ...item, index: liMatch.index, score: date ? 2 : 0 });
    }
  }

  if (candidates.length < 5) {
    const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
    let anchorMatch;

    while ((anchorMatch = anchorRegex.exec(html)) !== null) {
      const [, attributes, innerHtml] = anchorMatch;
      const href = getHref(attributes);
      if (!isLikelyAcademicHref(href)) {
        continue;
      }

      const title = attributes.match(/\btitle\s*=\s*(["'])(.*?)\1/i)?.[2] ?? innerHtml;
      const context = html.slice(Math.max(0, anchorMatch.index - 300), Math.min(html.length, anchorRegex.lastIndex + 420));
      const item = createNewsItem(source, href, title, extractDate(context));
      if (item) {
        candidates.push({ ...item, index: anchorMatch.index, score: item.date ? 1 : 0 });
      }
    }
  }

  const uniqueByUrl = new Map();
  for (const candidate of candidates.sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (!uniqueByUrl.has(candidate.url)) {
      uniqueByUrl.set(candidate.url, candidate);
    }
  }

  return Array.from(uniqueByUrl.values())
    .sort((a, b) => a.index - b.index)
    .slice(0, 5)
    .map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      url: candidate.url,
      date: candidate.date,
      source: candidate.source,
      sourceUrl: candidate.sourceUrl
    }));
}

function scoreCandidate(candidate, sourceUrl) {
  let score = 0;
  if (candidate.date) score += 3;
  if (/20\d{2}|article|list|content|\/\d{4}\//i.test(candidate.url)) score += 2;
  if (new URL(candidate.url).origin === new URL(sourceUrl).origin) score += 2;
  if (candidate.title.length >= 10) score += 1;
  return score;
}

function parseNewsItems(html, source) {
  if (source.parser === "today") {
    return parseTodayItems(html, source);
  }
  if (source.parser === "wp-news") {
    return parseWpNewsItems(html, source);
  }
  if (source.parser === "wp-card") {
    return parseWpCardItems(html, source);
  }
  if (source.parser === "wp-grad") {
    return parseWpGraduateItems(html, source);
  }
  if (source.parser === "academic") {
    return parseAcademicItems(html, source);
  }

  const candidates = [];
  const anchorRegex = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = anchorRegex.exec(html)) !== null) {
    const [, attributes, innerHtml] = match;
    const href = getHref(attributes);
    const titleFromAttr = attributes.match(/\btitle\s*=\s*(["'])(.*?)\1/i)?.[2] ?? "";
    const title = cleanText(titleFromAttr || innerHtml);

    if (!isUsableHref(href) || !isLikelyNewsTitle(title)) {
      continue;
    }

    const url = makeAbsoluteUrl(href, source.url);
    if (!url || url === source.url) {
      continue;
    }

    const context = html.slice(Math.max(0, match.index - 240), Math.min(html.length, anchorRegex.lastIndex + 360));
    const date = extractDate(context);

    candidates.push({
      id: makeId(source.id, url, title),
      title,
      url,
      date,
      source: source.name,
      sourceUrl: source.url,
      score: scoreCandidate({ title, url, date }, source.url),
      index: match.index
    });
  }

  const uniqueByUrl = new Map();
  for (const candidate of candidates.sort((a, b) => b.score - a.score || a.index - b.index)) {
    if (!uniqueByUrl.has(candidate.url)) {
      uniqueByUrl.set(candidate.url, candidate);
    }
  }

  return Array.from(uniqueByUrl.values())
    .sort((a, b) => a.index - b.index)
    .slice(0, 5)
    .map((candidate) => ({
      id: candidate.id,
      title: candidate.title,
      url: candidate.url,
      date: candidate.date,
      source: candidate.source,
      sourceUrl: candidate.sourceUrl
    }));
}

async function fetchSource(source) {
  const response = await fetch(source.url, {
    headers: {
      "user-agent": "HITNotice/0.1 fetch feasibility probe",
      accept: "text/html,application/xhtml+xml"
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const html = decodeHtml(bytes, response.headers.get("content-type"));
  const items = parseNewsItems(html, source);

  if (items.length === 0) {
    throw new Error("未从列表页解析到符合条件的新闻链接，可能需要为该站点补充专用解析规则");
  }

  return items;
}

async function main() {
  const sourceResults = [];

  for (const source of FETCH_SOURCES) {
    try {
      const items = await fetchSource(source);
      sourceResults.push({
        source: source.name,
        sourceUrl: source.url,
        ok: true,
        items
      });
    } catch (error) {
      sourceResults.push({
        source: source.name,
        sourceUrl: source.url,
        ok: false,
        items: [],
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    itemShape: {
      id: "string",
      title: "string",
      url: "string",
      date: "string | undefined",
      source: "string",
      sourceUrl: "string"
    },
    sources: sourceResults,
    items: sourceResults.flatMap((result) => result.items)
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");

  for (const result of sourceResults) {
    console.log(`\n[${result.ok ? "OK" : "FAIL"}] ${result.source}`);
    console.log(`URL: ${result.sourceUrl}`);
    if (!result.ok) {
      console.log(`Error: ${result.error}`);
      continue;
    }
    for (const [index, item] of result.items.entries()) {
      console.log(`${index + 1}. ${item.title}`);
      console.log(`   date: ${item.date ?? "未解析到"}`);
      console.log(`   url: ${item.url}`);
    }
  }

  console.log(`\nSaved JSON sample to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
