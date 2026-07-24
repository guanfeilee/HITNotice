import assert from "node:assert/strict";
import { crawlSources } from "@/lib/crawler/sources";
import type { SourceHealth } from "@/lib/crawler/health";
import { getDefaultDigestWindow } from "@/lib/digest/windows";
import type { DigestRunRecord } from "@/lib/digest/runs";
import {
  buildDigestHealthStatus,
  buildHealthReport,
  calculateDeliveryHealthMetrics,
  getDigestSchedule,
  renderHealthReportText,
  type EmailDeliveryHealthRow,
  type HealthDigestStatus
} from "@/lib/health/report";
import { renderHealthReportEmail } from "@/lib/email/health-report-template";
import { executeHealthReportCommand } from "@/lib/health/command";

async function main() {
const fridayNow = new Date("2026-07-24T12:10:00.000Z");
const fridayPeriodEnd = new Date("2026-07-24T12:00:00.000Z");
const weekdayWindow = getDefaultDigestWindow("weekday_digest", fridayPeriodEnd);
const weeklyWindow = getDefaultDigestWindow("weekly_digest", fridayPeriodEnd);

function runRecord(
  digestType: "weekday_digest" | "weekly_digest",
  overrides: Partial<DigestRunRecord> = {}
): DigestRunRecord {
  const window = digestType === "weekday_digest" ? weekdayWindow : weeklyWindow;
  return {
    id: `run-${digestType}`,
    digestType,
    runKind: "scheduled",
    periodStart: window.start.toISOString(),
    periodEnd: window.end.toISOString(),
    startedAt: "2026-07-24T12:00:00.000Z",
    finishedAt: "2026-07-24T12:05:00.000Z",
    status: "success",
    users: digestType === "weekday_digest" ? 57 : 5,
    recipients: 0,
    skipped: digestType === "weekday_digest" ? 57 : 5,
    blocked: 0,
    failed: 0,
    errorMessage: null,
    metadata: {},
    ...overrides
  };
}

function deliveryRow(
  status: EmailDeliveryHealthRow["status"],
  overrides: Partial<EmailDeliveryHealthRow> = {}
): EmailDeliveryHealthRow {
  return {
    status,
    accepted_at: ["accepted", "sent", "delivered", "suppressed", "bounced", "complained"].includes(status)
      ? "2026-07-24T12:02:00.000Z"
      : null,
    sent_at: status === "sent" ? "2026-07-24T12:02:00.000Z" : null,
    error_message: status === "failed" ? "delivery failed" : null,
    processing_started_at: "2026-07-24T12:01:00.000Z",
    created_at: "2026-07-24T12:01:00.000Z",
    ...overrides
  };
}

function digestHealth(params: {
  digestType: "weekday_digest" | "weekly_digest";
  now?: Date;
  run?: DigestRunRecord | null;
  deliveries?: EmailDeliveryHealthRow[];
  webhookTracking?: boolean;
}) {
  const now = params.now ?? fridayNow;
  return buildDigestHealthStatus({
    digestType: params.digestType,
    now,
    schedule: getDigestSchedule(params.digestType, now),
    run: params.run === undefined ? runRecord(params.digestType) : params.run,
    deliveries: params.deliveries ?? [],
    webhookTracking: params.webhookTracking ?? true
  });
}

function crawlerHealth(now: Date, overrides: Partial<SourceHealth> = {}) {
  return crawlSources.map((source) => ({
    sourceId: source.id,
    sourceName: source.name,
    status: "OK" as const,
    foundCount: 3,
    newCount: 0,
    httpStatus: 200,
    errorMessage: null,
    startedAt: new Date(now.getTime() - 20 * 60 * 1000).toISOString(),
    finishedAt: new Date(now.getTime() - 19 * 60 * 1000).toISOString(),
    lastSuccessAt: new Date(now.getTime() - 19 * 60 * 1000).toISOString(),
    ...overrides
  }));
}

function reportFor(
  now: Date,
  weekday: HealthDigestStatus,
  weekly: HealthDigestStatus,
  crawler = crawlerHealth(now)
) {
  return buildHealthReport({
    now,
    crawlerHealth: crawler,
    noticeCounts: new Map([[crawlSources[0].id, 2]]),
    digests: {
      weekday_digest: weekday,
      weekly_digest: weekly
    }
  });
}

// Scenario A: all weekday subscriptions have no matching notices.
const allSkipped = digestHealth({
  digestType: "weekday_digest",
  run: runRecord("weekday_digest", {
    users: 57,
    recipients: 0,
    skipped: 57,
    failed: 0
  })
});
assert.equal(allSkipped.status, "success");
assert.equal(allSkipped.users, 57);
assert.equal(allSkipped.recipients, 0);
assert.equal(allSkipped.skipped, 57);
assert.equal(allSkipped.reason, "No matching notices for all active subscriptions");
assert.equal(allSkipped.periodEnd, fridayPeriodEnd.toISOString());

// Scenario B: some recipients and some no-match skips are still a successful run.
const mixed = digestHealth({
  digestType: "weekday_digest",
  run: runRecord("weekday_digest", {
    users: 57,
    recipients: 10,
    skipped: 47
  }),
  deliveries: Array.from({ length: 10 }, () => deliveryRow("accepted"))
});
assert.equal(mixed.status, "success");
assert.equal(mixed.recipients, 10);
assert.equal(mixed.skipped, 47);
assert.equal(mixed.accepted, 10);

// Scenario C: Friday weekday and weekly use their own current scheduled windows.
const weeklySent = digestHealth({
  digestType: "weekly_digest",
  run: runRecord("weekly_digest", {
    users: 5,
    recipients: 5,
    skipped: 0
  }),
  deliveries: Array.from({ length: 5 }, () => deliveryRow("accepted"))
});
const fridayReport = reportFor(fridayNow, allSkipped, weeklySent);
assert.equal(fridayReport.overallStatus, "healthy");
assert.equal(fridayReport.digests.weekday_digest.periodStart, weekdayWindow.start.toISOString());
assert.equal(fridayReport.digests.weekly_digest.periodStart, weeklyWindow.start.toISOString());

// Scenario D: after the grace period a required run is missing and overall fails.
const missingWeekday = digestHealth({
  digestType: "weekday_digest",
  run: null
});
assert.equal(missingWeekday.status, "missing");
assert.equal(missingWeekday.reason, "Scheduled digest run not recorded");
assert.equal(reportFor(fridayNow, missingWeekday, weeklySent).overallStatus, "failed");

// Before 20:10 a missing run is scheduled, not failed.
const beforeDeadline = new Date("2026-07-24T12:05:00.000Z");
assert.equal(
  digestHealth({ digestType: "weekday_digest", now: beforeDeadline, run: null }).status,
  "scheduled"
);

// Scenario E: Monday weekly is not scheduled and remains neutral.
const mondayNow = new Date("2026-07-27T12:10:00.000Z");
const mondayWeekdayWindow = getDefaultDigestWindow(
  "weekday_digest",
  new Date("2026-07-27T12:00:00.000Z")
);
const mondayWeekday = buildDigestHealthStatus({
  digestType: "weekday_digest",
  now: mondayNow,
  schedule: getDigestSchedule("weekday_digest", mondayNow),
  run: {
    ...runRecord("weekday_digest"),
    periodStart: mondayWeekdayWindow.start.toISOString(),
    periodEnd: mondayWeekdayWindow.end.toISOString(),
    startedAt: "2026-07-27T12:00:00.000Z",
    finishedAt: "2026-07-27T12:04:00.000Z"
  },
  deliveries: [],
  webhookTracking: true
});
const mondayWeekly = digestHealth({ digestType: "weekly_digest", now: mondayNow, run: null });
assert.equal(mondayWeekly.status, "not_scheduled");
assert.equal(reportFor(mondayNow, mondayWeekday, mondayWeekly).overallStatus, "healthy");

// Historical delivery rows cannot replace a missing current run.
const historicalIgnored = buildDigestHealthStatus({
  digestType: "weekday_digest",
  now: fridayNow,
  schedule: getDigestSchedule("weekday_digest", fridayNow),
  run: null,
  deliveries: [deliveryRow("delivered")],
  webhookTracking: true
});
assert.equal(historicalIgnored.status, "missing");
assert.equal(historicalIgnored.accepted, 0);

// Running is allowed within grace, then becomes stuck/failed.
const runningRecord = runRecord("weekday_digest", {
  status: "running",
  finishedAt: null
});
assert.equal(
  digestHealth({ digestType: "weekday_digest", now: beforeDeadline, run: runningRecord }).status,
  "running"
);
const stuck = digestHealth({ digestType: "weekday_digest", run: runningRecord });
assert.equal(stuck.status, "failed");
assert.match(stuck.reason ?? "", /grace period/);

// Delivery states and pending timeouts are all calculated explicitly.
const deliveryMetrics = calculateDeliveryHealthMetrics(
  [
    deliveryRow("accepted"),
    deliveryRow("sent"),
    deliveryRow("delivered"),
    deliveryRow("suppressed"),
    deliveryRow("bounced"),
    deliveryRow("complained"),
    deliveryRow("failed"),
    deliveryRow("pending", {
      processing_started_at: "2026-07-24T12:09:00.000Z"
    }),
    deliveryRow("pending", {
      processing_started_at: "2026-07-24T11:00:00.000Z"
    })
  ],
  fridayNow
);
assert.equal(deliveryMetrics.accepted, 6);
assert.equal(deliveryMetrics.sent, 1);
assert.equal(deliveryMetrics.delivered, 1);
assert.equal(deliveryMetrics.suppressed, 1);
assert.equal(deliveryMetrics.bounced, 1);
assert.equal(deliveryMetrics.complained, 1);
assert.equal(deliveryMetrics.deliveryFailed, 1);
assert.equal(deliveryMetrics.pending, 2);
assert.equal(deliveryMetrics.stalePending, 1);

const deliveryWarnings = digestHealth({
  digestType: "weekday_digest",
  run: runRecord("weekday_digest", { recipients: 5, skipped: 52 }),
  deliveries: [deliveryRow("accepted"), deliveryRow("bounced")]
});
assert.equal(deliveryWarnings.status, "partial_success");

const noWebhook = digestHealth({
  digestType: "weekday_digest",
  run: runRecord("weekday_digest", { recipients: 1, skipped: 56 }),
  deliveries: [deliveryRow("accepted")],
  webhookTracking: false
});
assert.equal(noWebhook.status, "success");
assert.match(noWebhook.reason ?? "", /tracking unavailable/);

// Crawler freshness and failure both affect overall.
const staleCrawler = crawlerHealth(fridayNow);
staleCrawler[0] = {
  ...staleCrawler[0],
  startedAt: "2026-07-24T09:00:00.000Z",
  finishedAt: "2026-07-24T09:01:00.000Z"
};
const staleReport = reportFor(fridayNow, allSkipped, weeklySent, staleCrawler);
assert.equal(staleReport.sources[0].status, "stale");
assert.equal(staleReport.overallStatus, "failed");

const failedCrawler = crawlerHealth(fridayNow);
failedCrawler[0] = {
  ...failedCrawler[0],
  status: "FAIL",
  errorMessage: "HTTP 500"
};
assert.equal(reportFor(fridayNow, allSkipped, weeklySent, failedCrawler).overallStatus, "failed");

const partialRun = digestHealth({
  digestType: "weekday_digest",
  run: runRecord("weekday_digest", {
    status: "partial_success",
    recipients: 10,
    skipped: 45,
    failed: 2
  })
});
assert.equal(partialRun.status, "partial_success");
assert.equal(reportFor(fridayNow, partialRun, weeklySent).overallStatus, "degraded");

// Text and HTML expose the same operational digest fields.
const text = renderHealthReportText(fridayReport);
const html = renderHealthReportEmail(fridayReport, "https://hitnotice.cn");
for (const field of [
  "Schedule status",
  "Run status",
  "Period start",
  "Period end",
  "Started at",
  "Finished at",
  "Users",
  "Recipients",
  "Skipped: no matching notices",
  "Accepted",
  "Sent",
  "Delivered",
  "Suppressed",
  "Bounced",
  "Complained",
  "Pending",
  "Delivery failed",
  "Webhook tracking",
  "Reason"
]) {
  assert.match(text, new RegExp(field));
  assert.match(html, new RegExp(field));
}
assert.match(text, /New notices in the last 24 hours/);
assert.match(html, /New notices in the last 24 hours/);

const escapingCrawler = crawlerHealth(fridayNow);
escapingCrawler[0] = {
  ...escapingCrawler[0],
  sourceName: "<script>alert(1)</script>",
  status: "FAIL",
  errorMessage: "<img src=x onerror=alert(1)>"
};
const escapedHtml = renderHealthReportEmail(
  reportFor(fridayNow, allSkipped, weeklySent, escapingCrawler),
  "https://hitnotice.cn"
);
assert.doesNotMatch(escapedHtml, /<script>alert/);
assert.doesNotMatch(escapedHtml, /<img src=x/);
assert.match(escapedHtml, /&lt;script&gt;/);
assert.match(escapedHtml, /&lt;img src=x/);

let dryRunSendCalls = 0;
let dryRunOutput = "";
const dryRunCommand = await executeHealthReportCommand(
  { dryRun: true },
  {
    generate: async () => fridayReport,
    renderText: renderHealthReportText,
    send: async () => {
      dryRunSendCalls += 1;
    },
    log: (message) => {
      dryRunOutput = message;
    }
  }
);
assert.equal(dryRunCommand.sent, false);
assert.equal(dryRunSendCalls, 0);
assert.match(dryRunOutput, /Recipients:/);

console.log("health report tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
