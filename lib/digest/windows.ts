import type { DigestType, DigestWindow } from "@/lib/digest/types";

const beijingTimeZone = "Asia/Shanghai";
const digestHour = 20;
const dayMs = 24 * 60 * 60 * 1000;

function getBeijingParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: beijingTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function beijingWallTimeToDate(year: number, month: number, day: number, hour: number) {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, 0, 0, 0));
}

export function formatBeijingDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: beijingTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function formatBeijingDateTime(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: beijingTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function getBeijingDayOfWeek(date: Date) {
  const parts = getBeijingParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

export function getDueDigestTypes(now = new Date()): DigestType[] {
  const dayOfWeek = getBeijingDayOfWeek(now);

  if (dayOfWeek === 0 || dayOfWeek === 6) return [];
  if (dayOfWeek === 5) return ["weekday_digest", "weekly_digest"];
  return ["weekday_digest"];
}

export function getCurrentDigestPeriodEnd(now = new Date()) {
  const parts = getBeijingParts(now);
  return beijingWallTimeToDate(parts.year, parts.month, parts.day, digestHour);
}

export function getDefaultDigestWindow(digestType: DigestType, periodEnd: Date): DigestWindow {
  const dayOfWeek = getBeijingDayOfWeek(periodEnd);
  const daysToSubtract = digestType === "weekly_digest" ? 7 : dayOfWeek === 1 ? 3 : 1;

  return {
    start: new Date(periodEnd.getTime() - daysToSubtract * dayMs),
    end: periodEnd
  };
}

export function getDigestWindowFromLastSuccess(
  digestType: DigestType,
  periodEnd: Date,
  lastSuccessfulPeriodEnd?: string | null
): DigestWindow {
  const parsedStart = lastSuccessfulPeriodEnd ? new Date(lastSuccessfulPeriodEnd) : null;
  const defaultWindow = getDefaultDigestWindow(digestType, periodEnd);
  const start = parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : defaultWindow.start;

  return {
    start,
    end: periodEnd
  };
}
