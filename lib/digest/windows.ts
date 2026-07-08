import type { DigestWindow } from "@/lib/digest/types";

const beijingTimeZone = "Asia/Shanghai";
const dailyDigestHour = 20;
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

export function getCurrentDailyDigestPeriodEnd(now = new Date()) {
  const parts = getBeijingParts(now);
  return beijingWallTimeToDate(parts.year, parts.month, parts.day, dailyDigestHour);
}

export function getDefaultDailyDigestWindow(now = new Date()): DigestWindow {
  const end = getCurrentDailyDigestPeriodEnd(now);

  return {
    start: new Date(end.getTime() - dayMs),
    end
  };
}

export function getDigestWindowFromLastSuccess(periodEnd: Date, lastSuccessfulPeriodEnd?: string | null): DigestWindow {
  const parsedStart = lastSuccessfulPeriodEnd ? new Date(lastSuccessfulPeriodEnd) : null;
  const start = parsedStart && !Number.isNaN(parsedStart.getTime())
    ? parsedStart
    : new Date(periodEnd.getTime() - dayMs);

  return {
    start,
    end: periodEnd
  };
}
