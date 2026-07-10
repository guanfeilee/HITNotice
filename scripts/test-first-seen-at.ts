import assert from "node:assert/strict";
import type { CrawledNotice } from "@/lib/crawler/types";
import { toNoticeInsertPayload, toNoticeUpdatePayload } from "@/lib/supabase/rest";
import type { DigestWindow } from "@/lib/digest/types";

type StoredNotice = ReturnType<typeof toNoticeInsertPayload>;

const firstCrawlAt = "2026-07-09T11:45:00.000Z";
const secondCrawlAt = "2026-07-10T11:45:00.000Z";
const digestWindow: DigestWindow = {
  start: new Date("2026-07-10T11:00:00.000Z"),
  end: new Date("2026-07-10T12:00:00.000Z")
};

function notice(id: "A" | "B" | "C" | "D", firstSeenAt: string): CrawledNotice {
  return {
    title: `Notice ${id}`,
    url: `https://life.hit.edu.cn/notice-${id.toLowerCase()}.htm`,
    source_name: "School of Life Science and Technology",
    source_id: "life",
    category: "college",
    published_at: firstSeenAt,
    first_seen_at: firstSeenAt,
    hash: `hash-${id.toLowerCase()}`
  };
}

function syncRows(store: Map<string, StoredNotice>, crawledNotices: CrawledNotice[]) {
  for (const crawledNotice of crawledNotices) {
    const existing = store.get(crawledNotice.hash);

    if (!existing) {
      store.set(crawledNotice.hash, toNoticeInsertPayload(crawledNotice, true));
      continue;
    }

    store.set(crawledNotice.hash, {
      ...existing,
      ...toNoticeUpdatePayload(crawledNotice)
    });
  }
}

function getDigestRows(store: Map<string, StoredNotice>, window: DigestWindow) {
  return Array.from(store.values()).filter((row) => {
    const firstSeenAt = typeof row.first_seen_at === "string" ? new Date(row.first_seen_at) : null;
    return Boolean(firstSeenAt && firstSeenAt >= window.start && firstSeenAt < window.end);
  });
}

const store = new Map<string, StoredNotice>();

syncRows(store, [notice("A", firstCrawlAt), notice("B", firstCrawlAt), notice("C", firstCrawlAt)]);
const firstSeenSnapshot = new Map(Array.from(store.values()).map((row) => [row.hash, row.first_seen_at]));

syncRows(store, [
  notice("A", secondCrawlAt),
  notice("B", secondCrawlAt),
  notice("C", secondCrawlAt),
  notice("D", secondCrawlAt)
]);

assert.equal(store.get("hash-a")?.first_seen_at, firstSeenSnapshot.get("hash-a"));
assert.equal(store.get("hash-b")?.first_seen_at, firstSeenSnapshot.get("hash-b"));
assert.equal(store.get("hash-c")?.first_seen_at, firstSeenSnapshot.get("hash-c"));
assert.equal(store.get("hash-d")?.first_seen_at, secondCrawlAt);

const updatePayload = toNoticeUpdatePayload(notice("A", secondCrawlAt));
assert.equal(Object.hasOwn(updatePayload, "first_seen_at"), false);

const digestRows = getDigestRows(store, digestWindow);
assert.deepEqual(
  digestRows.map((row) => row.hash),
  ["hash-d"]
);

console.log("first_seen_at incremental notice test passed");
