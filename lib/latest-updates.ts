import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { LatestUpdate } from "./types";

const LATEST_UPDATES_PATH = path.join(process.cwd(), "data", "latest-updates.json");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLatestUpdate(value: unknown): value is LatestUpdate {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.sourceId === "string" &&
    typeof value.sourceName === "string" &&
    typeof value.title === "string" &&
    typeof value.url === "string" &&
    typeof value.fetchedAt === "string" &&
    typeof value.publishedAt === "string"
  );
}

function dateScore(update: LatestUpdate) {
  const timestamp = Date.parse(update.publishedAt || update.fetchedAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function getLatestUpdatesFromJson(): LatestUpdate[] {
  try {
    if (!existsSync(LATEST_UPDATES_PATH)) {
      return [];
    }

    const parsed = JSON.parse(readFileSync(LATEST_UPDATES_PATH, "utf-8")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(isLatestUpdate)
      .sort((a, b) => dateScore(b) - dateScore(a));
  } catch {
    return [];
  }
}
