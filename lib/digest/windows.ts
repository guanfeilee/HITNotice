import type { DigestWindow } from "@/lib/digest/types";

const beijingTimeZone = "Asia/Shanghai";
const deliveryHours = [12, 20] as const;

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

export function getDefaultDailyDigestWindow(now = new Date()): DigestWindow {
  const parts = getBeijingParts(now);
  const currentNoon = beijingWallTimeToDate(parts.year, parts.month, parts.day, deliveryHours[0]);
  const currentEvening = beijingWallTimeToDate(parts.year, parts.month, parts.day, deliveryHours[1]);
  const previousEvening = new Date(currentEvening.getTime() - 24 * 60 * 60 * 1000);

  if (now.getTime() <= currentNoon.getTime()) {
    return {
      start: previousEvening,
      end: currentNoon
    };
  }

  if (now.getTime() <= currentEvening.getTime()) {
    return {
      start: currentNoon,
      end: currentEvening
    };
  }

  return {
    start: currentEvening,
    end: new Date(currentNoon.getTime() + 24 * 60 * 60 * 1000)
  };
}
