import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NewsItem } from "./types";

const LOCAL_NEWS_JSON_PATH = path.join(process.cwd(), "data", "debug", "latest-news-sample.json");

type LocalNewsPayload = {
  generatedAt?: unknown;
  items?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidNewsItem(value: unknown): value is NewsItem {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.url === "string" &&
    typeof value.source === "string" &&
    typeof value.sourceUrl === "string" &&
    (typeof value.date === "string" || typeof value.date === "undefined")
  );
}

export function normalizeNewsItems(items: unknown): NewsItem[] {
  if (!Array.isArray(items)) {
    return [];
  }

  const uniqueByUrl = new Map<string, NewsItem>();

  for (const item of items) {
    if (!isValidNewsItem(item)) {
      continue;
    }

    const normalizedItem: NewsItem = {
      id: item.id.trim(),
      title: item.title.trim(),
      url: item.url.trim(),
      date: item.date?.trim(),
      source: item.source.trim(),
      sourceUrl: item.sourceUrl.trim()
    };

    if (
      !normalizedItem.id ||
      !normalizedItem.title ||
      !normalizedItem.url ||
      !normalizedItem.source ||
      !normalizedItem.sourceUrl ||
      uniqueByUrl.has(normalizedItem.url)
    ) {
      continue;
    }

    uniqueByUrl.set(normalizedItem.url, normalizedItem);
  }

  return Array.from(uniqueByUrl.values());
}

function parseDateScore(date: string | undefined, generatedAt?: string): number {
  if (!date) {
    return Number.NEGATIVE_INFINITY;
  }

  const trimmed = date.trim();
  const timestamp = Date.parse(trimmed);
  if (!Number.isNaN(timestamp)) {
    return timestamp;
  }

  const generatedTimestamp = generatedAt ? Date.parse(generatedAt) : Date.now();
  const baseDate = Number.isNaN(generatedTimestamp) ? new Date() : new Date(generatedTimestamp);

  const relativeMatch = trimmed.match(/^(\d+)\s*(分钟|小时|天)前$/);
  if (relativeMatch) {
    const amount = Number(relativeMatch[1]);
    const unit = relativeMatch[2];
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    const offset = unit === "分钟" ? amount * minute : unit === "小时" ? amount * hour : amount * day;
    return baseDate.getTime() - offset;
  }

  const monthDayMatch = trimmed.match(/^(\d{1,2})-(\d{1,2})$/);
  if (monthDayMatch) {
    const month = Number(monthDayMatch[1]);
    const day = Number(monthDayMatch[2]);
    return new Date(baseDate.getFullYear(), month - 1, day).getTime();
  }

  return Number.NEGATIVE_INFINITY;
}

export function sortNewsItemsByDateDesc(items: NewsItem[], generatedAt?: string): NewsItem[] {
  return [...items].sort((a, b) => {
    const scoreDiff = parseDateScore(b.date, generatedAt) - parseDateScore(a.date, generatedAt);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return a.title.localeCompare(b.title, "zh-CN");
  });
}

export function getLatestNewsFromLocalJson(limit = 10): NewsItem[] {
  try {
    if (!existsSync(LOCAL_NEWS_JSON_PATH)) {
      return [];
    }

    const payload = JSON.parse(readFileSync(LOCAL_NEWS_JSON_PATH, "utf-8")) as LocalNewsPayload;
    const generatedAt = typeof payload.generatedAt === "string" ? payload.generatedAt : undefined;
    const normalizedItems = normalizeNewsItems(payload.items);
    return sortNewsItemsByDateDesc(normalizedItems, generatedAt).slice(0, limit);
  } catch {
    return [];
  }
}
