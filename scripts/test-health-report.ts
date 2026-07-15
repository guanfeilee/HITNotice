import assert from "node:assert/strict";
import { buildHealthReport, renderHealthReportText } from "@/lib/health/report";
import { crawlSources } from "@/lib/crawler/sources";
import type { SourceHealth } from "@/lib/crawler/health";
import { renderHealthReportEmail } from "@/lib/email/health-report-template";

const sourceA = crawlSources[0];
const sourceB = crawlSources[1];
const sourceC = crawlSources[2];
const now = new Date("2026-07-11T12:30:00.000Z");

const crawlerHealth: SourceHealth[] = crawlSources.map((source) => ({
  sourceId: source.id,
  sourceName: source.name,
  status: "OK",
  foundCount: 3,
  newCount: 0,
  httpStatus: 200,
  errorMessage: null,
  startedAt: "2026-07-11T11:45:00.000Z",
  finishedAt: "2026-07-11T11:45:10.000Z",
  lastSuccessAt: "2026-07-11T11:45:10.000Z"
}));

crawlerHealth[2] = {
  ...crawlerHealth[2],
  status: "FAIL",
  foundCount: 0,
  httpStatus: 403,
  errorMessage: "HTTP 403"
};

const report = buildHealthReport({
  now,
  crawlerHealth,
  noticeCounts: new Map([
    [sourceA.id, 2],
    [sourceB.id, 0],
    [sourceC.id, 0]
  ]),
  digests: {
    weekday_digest: {
      digestType: "weekday_digest",
      status: "success",
      lastDigestPeriodEnd: "2026-07-11T12:00:00.000Z",
      users: 4,
      recipients: 4,
      successful: 4,
      failed: 0,
      skipped: 0,
      lastError: null
    },
    weekly_digest: {
      digestType: "weekly_digest",
      status: "failed",
      lastDigestPeriodEnd: "2026-07-10T12:00:00.000Z",
      users: 2,
      recipients: 2,
      successful: 1,
      failed: 1,
      skipped: 0,
      lastError: "Weekly delivery failed"
    }
  }
});

assert.equal(report.sources[0].sourceId, sourceA.id);
assert.equal(report.sources[0].status, "healthy");
assert.equal(report.sources[0].newNotices, 2);

assert.equal(report.sources[1].sourceId, sourceB.id);
assert.equal(report.sources[1].status, "healthy");
assert.equal(report.sources[1].newNotices, 0);

assert.equal(report.sources[2].sourceId, sourceC.id);
assert.equal(report.sources[2].status, "failed");
assert.equal(report.sources[2].lastError, "HTTP 403");

const text = renderHealthReportText(report);

assert.match(text, new RegExp(`${sourceA.name}[\\s\\S]*Status:\\nHealthy[\\s\\S]*New notices:\\n2`));
assert.match(text, new RegExp(`${sourceB.name}[\\s\\S]*Status:\\nHealthy[\\s\\S]*New notices:\\n0`));
assert.match(text, new RegExp(`${sourceC.name}[\\s\\S]*Status:\\nFailed[\\s\\S]*Reason:\\nHTTP 403`));

assert.match(text, /weekday_digest[\s\S]*Users:\n4[\s\S]*Sent:\n4[\s\S]*Failed:\n0/);
assert.match(text, /weekly_digest[\s\S]*Users:\n2[\s\S]*Sent:\n1[\s\S]*Failed:\n1/);

const html = renderHealthReportEmail(report, "https://hitnotice.cn");
assert.match(html, /weekday_digest/);
assert.match(html, /weekly_digest/);
assert.match(html, /Users: 2 \| Sent: 1 \| Failed: 1/);

console.log("health report test passed");
