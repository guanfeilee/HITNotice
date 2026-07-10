import assert from "node:assert/strict";
import { groupNotices } from "@/lib/digest/service";
import type { DigestNotice, DigestSource } from "@/lib/digest/types";

const sources: DigestSource[] = [
  { id: "source-a", name: "A source" },
  { id: "source-b", name: "B source" },
  { id: "source-c", name: "C source" }
];

function notice(id: "D" | "E", sourceId: "source-a" | "source-c", sourceName: string): DigestNotice {
  return {
    id,
    title: `Notice ${id}`,
    url: `https://example.com/${id.toLowerCase()}`,
    sourceId,
    sourceName,
    publishedAt: "2026-07-10T11:45:00.000Z",
    firstSeenAt: "2026-07-10T11:45:00.000Z"
  };
}

const groups = groupNotices(
  [notice("D", "source-a", "A source"), notice("E", "source-c", "C source")],
  sources
);

assert.equal(groups.length, 3);

assert.equal(groups[0].sourceId, "source-a");
assert.equal(groups[0].hasUpdates, true);
assert.deepEqual(
  groups[0].notices.map((item) => item.id),
  ["D"]
);

assert.equal(groups[1].sourceId, "source-b");
assert.equal(groups[1].hasUpdates, false);
assert.deepEqual(groups[1].notices, []);

assert.equal(groups[2].sourceId, "source-c");
assert.equal(groups[2].hasUpdates, true);
assert.deepEqual(
  groups[2].notices.map((item) => item.id),
  ["E"]
);

console.log("digest group status test passed");
