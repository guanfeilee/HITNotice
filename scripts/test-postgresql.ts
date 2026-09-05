import { executeDigestDelivery } from "@/lib/digest/send";
import { buildDigest } from "@/lib/digest/service";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { assertDatabaseWriteTestAllowed } from "@/lib/testing/write-guard";
import { query, closePool, getPool } from "@/lib/db/pool";
import { transaction } from "@/lib/db/transaction";
import { safeDatabaseError, RepositoryError } from "@/lib/db/errors";
import {
  saveSubscription,
  unsubscribeByToken,
  activeSubscriptions,
  subscriptionSources,
} from "@/lib/db/subscriptions";
import {
  upsertNoticeBatch,
  selectNoticeRows,
  digestNotices,
  adminNotices,
} from "@/lib/db/notices";
import * as delivery from "@/lib/db/deliveries";
import { claimScheduledDigestRun, finishDigestRun } from "@/lib/db/digest-runs";
import { createEmptyDigestRunStats } from "@/lib/digest/runs";
import { noticeCounts, getDeliveriesForScheduledRun } from "@/lib/db/health";
import {
  insertCrawlRunRow,
  selectRecentCrawlRunRows,
} from "@/lib/db/crawl-runs";
import { getHistoricalWebhookEvent } from "@/lib/db/webhook-events";
import { serializeRequestError } from "@/lib/email/error-details";
import type { CrawledNotice } from "@/lib/crawler/types";
const window = {
  start: new Date("2026-08-01T00:00:00Z"),
  end: new Date("2026-08-02T00:00:00Z"),
};
let checks = 0;
async function test(name: string, fn: () => Promise<void>) {
  await fn();
  checks++;
  console.log(`PASS ${name}`);
}
const tables = [
  "notices",
  "subscriptions",
  "subscription_sources",
  "email_deliveries",
  "digest_runs",
  "crawl_runs",
  "resend_webhook_events",
];
function fixture(
  hash: string,
  time = "2026-08-01T00:00:00.000Z",
): CrawledNotice {
  return {
    hash,
    title: `Synthetic ${hash}`,
    url: `https://example.invalid/${hash}`,
    source_id: "fixture-a",
    source_name: "Fixture",
    category: "test",
    published_at: null,
    first_seen_at: time,
  };
}
async function reset(client: Client) {
  assertDatabaseWriteTestAllowed(process.env);
  await client.query(
    "TRUNCATE notices,subscriptions,subscription_sources,email_deliveries,digest_runs,crawl_runs,resend_webhook_events CASCADE",
  );
}
async function main() {
  assertDatabaseWriteTestAllowed(process.env);
  const adminUrl = process.env.TEST_DATABASE_ADMIN_URL;
  assertDatabaseWriteTestAllowed({ ...process.env, DATABASE_URL: adminUrl });
  const runtimeUrl = new URL(process.env.DATABASE_URL!);
  const privilegedUrl = new URL(adminUrl!);
  assert.equal(runtimeUrl.host, privilegedUrl.host);
  assert.equal(runtimeUrl.pathname, privilegedUrl.pathname);
  assert.equal(runtimeUrl.username, "hitnotice_runtime");
  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    assert.equal(
      (
        await admin.query("SHOW server_version_num")
      ).rows[0].server_version_num.slice(0, 2),
      "17",
    );
    // Explicitly opted-in, isolated fixture cluster only. Fixed identifiers; password is test-only.
    await admin.query(`DO $$ BEGIN
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hitnotice_owner') THEN CREATE ROLE hitnotice_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF;
      IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='hitnotice_runtime') THEN CREATE ROLE hitnotice_runtime LOGIN PASSWORD 'isolated-runtime-only' NOSUPERUSER NOCREATEDB NOCREATEROLE; END IF;
    END $$`);
    await admin.query(
      "DROP SCHEMA public CASCADE; CREATE SCHEMA public AUTHORIZATION hitnotice_owner; REVOKE ALL ON SCHEMA public FROM PUBLIC; SET ROLE hitnotice_owner",
    );
    await admin.query(
      readFileSync("database/schema/0001_current_baseline.sql", "utf8"),
    );
    await admin.query(
      readFileSync("database/roles/runtime-grants.sql", "utf8"),
    );
    await admin.query("RESET ROLE");
    await test("schema counts and canonical definitions", async () => {
      const count = async (sql: string) => (await admin.query(sql)).rows[0].n;
      assert.equal(
        await count(
          "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'",
        ),
        7,
      );
      assert.equal(
        await count(
          "SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public'",
        ),
        82,
      );
      assert.equal(
        await count(
          "SELECT count(*)::int n FROM pg_indexes WHERE schemaname='public'",
        ),
        29,
      );
      for (const [kind, n] of [
        ["p", 7],
        ["f", 2],
        ["u", 2],
        ["c", 36],
      ] as const)
        assert.equal(
          (
            await admin.query(
              "SELECT count(*)::int n FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype=$1",
              [kind],
            )
          ).rows[0].n,
          n,
        );
      assert.equal(
        await count(
          "SELECT count(*)::int n FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN(SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace)",
        ),
        3,
      );
      assert.equal(
        await count(
          "SELECT count(*)::int n FROM pg_proc WHERE pronamespace='public'::regnamespace",
        ),
        1,
      );
      const indexes = (
        await admin.query(
          "SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'",
        )
      ).rows;
      for (const [name, pattern] of [
        ["notices_hash_key", /UNIQUE.*\(hash\)$/],
        ["subscriptions_email_unique", /UNIQUE.*\(email\)$/],
        [
          "subscription_sources_unique",
          /UNIQUE.*\(subscription_id, source_id\)$/,
        ],
        [
          "email_deliveries_subscription_digest_period_key",
          /UNIQUE.*\(subscription_id, digest_type, period_start, period_end\)$/,
        ],
        [
          "email_deliveries_idempotency_key_key",
          /UNIQUE.*\(idempotency_key\)$/,
        ],
        [
          "digest_runs_scheduled_period_key",
          /UNIQUE.*\(digest_type, run_kind, period_start, period_end\)$/,
        ],
        [
          "subscriptions_unsubscribe_token_key",
          /UNIQUE.*WHERE \(unsubscribe_token IS NOT NULL\)/,
        ],
        [
          "email_deliveries_resend_email_id_key",
          /UNIQUE.*WHERE \(resend_email_id IS NOT NULL\)/,
        ],
      ] as const)
        assert.match(
          indexes.find((r) => r.indexname === name).indexdef,
          pattern,
        );
      const hash = (
        await admin.query(
          "SELECT is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='notices' AND column_name='hash'",
        )
      ).rows[0];
      assert.equal(hash.is_nullable, "NO");
      assert.equal(hash.column_default, null);
      const fks = (
        await admin.query(
          "SELECT confdeltype FROM pg_constraint WHERE connamespace='public'::regnamespace AND contype='f'",
        )
      ).rows;
      assert.ok(fks.every((r) => r.confdeltype === "c"));
      const owners = (
        await admin.query(
          "SELECT tableowner FROM pg_tables WHERE schemaname='public'",
        )
      ).rows;
      assert.ok(owners.every((r) => r.tableowner === "hitnotice_owner"));
      assert.equal(
        await count(
          "SELECT count(*)::int n FROM pg_class WHERE relnamespace='public'::regnamespace AND relrowsecurity",
        ),
        0,
      );
      assert.deepEqual(
        (
          await admin.query("SELECT extname FROM pg_extension ORDER BY extname")
        ).rows.map((r) => r.extname),
        ["plpgsql"],
      );
    });
    await test("runtime least privilege and native UUID", async () => {
      for (const sql of [
        "TRUNCATE notices",
        "DELETE FROM notices",
        "DELETE FROM email_deliveries",
        "INSERT INTO resend_webhook_events DEFAULT VALUES",
      ])
        await assert.rejects(
          query(sql),
          (e) => e instanceof RepositoryError && e.code === "42501",
        );
      const role = (
        await query(
          "SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user",
        )
      ).rows[0];
      assert.deepEqual(role, {
        rolsuper: false,
        rolcreatedb: false,
        rolcreaterole: false,
      });
      assert.equal(
        (
          await query(
            "SELECT pg_get_userbyid(datdba)=current_user AS owned FROM pg_database WHERE datname=current_database()",
          )
        ).rows[0].owned,
        false,
      );
      await assert.rejects(
        query("CREATE TABLE forbidden_fixture(id int)"),
        (e) => e instanceof RepositoryError && e.code === "42501",
      );
      assert.match(
        (await query("SELECT gen_random_uuid() AS id")).rows[0].id,
        /^[0-9a-f-]{36}$/,
      );
    });
    await reset(admin);
    const sub = await saveSubscription(
      "synthetic-a@example.invalid",
      "weekday_digest",
      ["fixture-a", "fixture-b"],
    );
    await saveSubscription("synthetic-b@example.invalid", "weekly_digest", [
      "fixture-b",
    ]);
    const inactive = await saveSubscription(
      "synthetic-c@example.invalid",
      "weekday_digest",
      ["fixture-a"],
    );
    await unsubscribeByToken(inactive.unsubscribe_token);
    await test("subscribe rollback after parent write and source delete", async () => {
      const before = (
        await query("SELECT * FROM subscriptions WHERE id=$1", [sub.id])
      ).rows[0];
      await assert.rejects(
        saveSubscription("synthetic-a@example.invalid", "weekly_digest", [" "]),
        (e) => e instanceof RepositoryError && e.code === "23514",
      );
      assert.deepEqual(
        (await query("SELECT * FROM subscriptions WHERE id=$1", [sub.id]))
          .rows[0],
        before,
      );
      assert.deepEqual(
        (await subscriptionSources(sub.id)).map((r) => r.source_id).sort(),
        ["fixture-a", "fixture-b"],
      );
      await assert.rejects(
        saveSubscription("rollback-new@example.invalid", "weekly_digest", [
          " ",
        ]),
      );
      assert.equal(
        (
          await query(
            "SELECT count(*)::int n FROM subscriptions WHERE email=$1",
            ["rollback-new@example.invalid"],
          )
        ).rows[0].n,
        0,
      );
    });
    await test("concurrent same email: one row, whole last committed source set, one first-subscription flag", async () => {
      const results = await Promise.all([
        saveSubscription("concurrent@example.invalid", "weekday_digest", [
          "fixture-a",
        ]),
        saveSubscription("concurrent@example.invalid", "weekly_digest", [
          "fixture-b",
          "fixture-c",
        ]),
      ]);
      assert.equal(results.filter((r) => r.isFirstSubscription).length, 1);
      assert.equal(results[0].id, results[1].id);
      assert.equal(results[0].unsubscribe_token, results[1].unsubscribe_token);
      const row = (
        await query("SELECT frequency FROM subscriptions WHERE id=$1", [
          results[0].id,
        ])
      ).rows[0];
      assert.deepEqual(
        (await subscriptionSources(results[0].id))
          .map((r) => r.source_id)
          .sort(),
        row.frequency === "weekly_digest"
          ? ["fixture-b", "fixture-c"]
          : ["fixture-a"],
      );
      await saveSubscription("concurrent@example.invalid", "weekday_digest", [
        "last-committed",
      ]);
      assert.deepEqual(
        (await subscriptionSources(results[0].id)).map((r) => r.source_id),
        ["last-committed"],
      );
    });
    await test("unsubscribe repeated timestamp/token stable; invalid distinguish", async () => {
      const first = await unsubscribeByToken(inactive.unsubscribe_token);
      const second = await unsubscribeByToken(inactive.unsubscribe_token);
      assert.deepEqual(first, second);
      assert.equal(await unsubscribeByToken("synthetic-not-found"), null);
      assert.equal(
        (
          await query(
            "SELECT unsubscribe_token FROM subscriptions WHERE id=$1",
            [inactive.id],
          )
        ).rows[0].unsubscribe_token,
        inactive.unsubscribe_token,
      );
    });
    await test("crawler batched counts, immutable identifiers, unchanged trigger, concurrent writers", async () => {
      assert.deepEqual(await upsertNoticeBatch([fixture("a"), fixture("b")]), {
        inserted: 2,
        updated: 0,
        unchanged: 0,
      });
      const before = (await selectNoticeRows()).find((n) => n.hash === "a")!;
      assert.deepEqual(await upsertNoticeBatch([fixture("a")]), {
        inserted: 0,
        updated: 0,
        unchanged: 1,
      });
      assert.deepEqual(
        (await selectNoticeRows()).find((n) => n.hash === "a"),
        before,
      );
      assert.deepEqual(
        await upsertNoticeBatch([
          { ...fixture("a", "2027-01-01Z"), title: "Changed" },
        ]),
        { inserted: 0, updated: 1, unchanged: 0 },
      );
      const after = (await selectNoticeRows()).find((n) => n.hash === "a")!;
      for (const key of ["id", "hash", "created_at", "first_seen_at"])
        assert.equal(after[key], before[key]);
      const results = await Promise.all([
        upsertNoticeBatch([fixture("race")]),
        upsertNoticeBatch([fixture("race")]),
      ]);
      assert.equal(
        results.reduce((n, r) => n + r.inserted, 0),
        1,
      );
      assert.equal(
        results.reduce((n, r) => n + r.unchanged, 0),
        1,
      );
    });
    await test("UTC half-open timestamps and microseconds retained", async () => {
      await upsertNoticeBatch([
        fixture("start"),
        fixture("end", "2026-08-02T00:00:00Z"),
        fixture("micro", "2026-08-01T23:59:59.999999Z"),
        { ...fixture("other"), source_id: "fixture-b" },
      ]);
      const rows = await digestNotices(["fixture-a"], window);
      assert.ok(rows.some((r) => r.title === "Synthetic start"));
      assert.ok(!rows.some((r) => r.title === "Synthetic end"));
      assert.equal(
        rows.find((r) => r.title === "Synthetic micro")?.first_seen_at,
        "2026-08-01T23:59:59.999999Z",
      );
      assert.equal(
        new Date(
          rows.find((r) => r.title === "Synthetic micro")!.first_seen_at,
        ).toISOString(),
        "2026-08-01T23:59:59.999Z",
      );
      assert.ok(!rows.some((r) => r.title === "Synthetic other"));
    });
    const claimParams = {
      subscriptionId: sub.id,
      digestType: "weekday_digest" as const,
      window,
      noticeCount: 3,
    };
    let deliveryId = "";
    await test("atomic concurrent new delivery and failed retry claims", async () => {
      const results = await Promise.all([
        delivery.claimDigestDelivery(claimParams),
        delivery.claimDigestDelivery(claimParams),
      ]);
      assert.equal(results.filter((r) => r.claimed).length, 1);
      deliveryId = results[0].delivery.id;
      await delivery.recordDigestDeliveryFailure({
        deliveryId,
        attempt: 1,
        durationMs: 2,
        httpStatus: 500,
        errorMessage: "synthetic",
        errorDetails: serializeRequestError(new Error("synthetic"), {
          stage: "fixture",
        }),
        responseSummary: null,
      });
      const retries = await Promise.all([
        delivery.claimDigestDelivery(claimParams),
        delivery.claimDigestDelivery(claimParams),
      ]);
      assert.equal(retries.filter((r) => r.claimed).length, 1);
      assert.equal(retries.find((r) => r.claimed)?.reason, "retry_claimed");
      assert.equal(
        retries[0].delivery.idempotencyKey,
        results[0].delivery.idempotencyKey,
      );
    });
    const accepted = {
      deliveryId,
      resendEmailId: "synthetic-provider-id",
      attempt: 2,
      durationMs: 3,
      httpStatus: 200,
      responseSummary: "synthetic accepted",
    };
    await test("accepted idempotence, delivered preservation, late failure protection, missing target errors", async () => {
      await delivery.recordDigestDeliveryAccepted(accepted);
      const before = await delivery.getDigestDeliveryById(deliveryId);
      await delivery.recordDigestDeliveryAccepted(accepted);
      assert.deepEqual(
        await delivery.getDigestDeliveryById(deliveryId),
        before,
      );
      await delivery.recordDigestDeliveryFailure({
        deliveryId,
        attempt: 3,
        durationMs: 4,
        httpStatus: 500,
        errorMessage: "late synthetic failure",
        errorDetails: serializeRequestError(new Error("late"), {
          stage: "fixture",
        }),
        responseSummary: null,
      });
      assert.deepEqual(
        await delivery.getDigestDeliveryById(deliveryId),
        before,
      );
      assert.equal(
        (await delivery.claimDigestDelivery(claimParams)).claimed,
        false,
      );
      await query(
        "UPDATE email_deliveries SET status='delivered',delivered_at=now() WHERE id=$1",
        [deliveryId],
      );
      await delivery.recordDigestDeliveryAccepted(accepted);
      assert.equal(
        (await delivery.getDigestDeliveryById(deliveryId))?.status,
        "delivered",
      );
      await assert.rejects(
        delivery.recordDigestDeliveryAccepted({
          ...accepted,
          resendEmailId: "different-synthetic-id",
        }),
      );
      await assert.rejects(
        delivery.recordDigestDeliveryAccepted({
          ...accepted,
          deliveryId: randomUUID(),
        }),
      );
    });
    await test("every accepted/sent/permanent/resend-id state blocks retries; complete migration fixtures", async () => {
      for (const [i, status] of [
        "pending",
        "failed",
        "accepted",
        "sent",
        "delivered",
        "suppressed",
        "bounced",
        "complained",
      ].entries()) {
        const w = {
          start: new Date(Date.UTC(2026, 6, 1 + i)),
          end: new Date(Date.UTC(2026, 6, 2 + i)),
        };
        const c = await delivery.claimDigestDelivery({
          ...claimParams,
          window: w,
        });
        await query(
          "UPDATE email_deliveries SET status=$2,resend_email_id=$3 WHERE id=$1",
          [
            c.delivery.id,
            status,
            status === "failed" ? "synthetic-protected-failed" : null,
          ],
        );
        assert.equal(
          (await delivery.claimDigestDelivery({ ...claimParams, window: w }))
            .claimed,
          false,
        );
      }
      assert.ok(await delivery.getLatestPermanentDeliveryBlock(sub.id));
      assert.ok(
        (
          await delivery.getAcceptedDigestDeliveryWindowsBefore(
            sub.id,
            "weekday_digest",
            window.end,
          )
        ).length >= 5,
      );
      const sameEnd = { start: new Date("2026-07-31T00:00Z"), end: window.end };
      await delivery.claimDigestDelivery({ ...claimParams, window: sameEnd });
      await assert.rejects(
        delivery.getDigestDeliveryForPeriod(
          sub.id,
          "weekday_digest",
          window.end,
        ),
        (e) => e instanceof RepositoryError && e.code === "AMBIGUOUS_DELIVERY",
      );
    });
    await test("concurrent scheduled run; finish once; historical metadata merged", async () => {
      const results = await Promise.all([
        claimScheduledDigestRun(claimParams),
        claimScheduledDigestRun(claimParams),
      ]);
      assert.equal(results.filter((r) => r.claimed).length, 1);
      const runId = results[0].run.id;
      await query("UPDATE digest_runs SET metadata=$2 WHERE id=$1", [
        runId,
        { historical: "keep" },
      ]);
      const finish = {
        runId,
        status: "success" as const,
        stats: createEmptyDigestRunStats(),
      };
      await finishDigestRun(finish);
      await assert.rejects(
        finishDigestRun(finish),
        (e) => e instanceof RepositoryError && e.code === "RUN_NOT_RUNNING",
      );
      assert.equal(
        (await query("SELECT metadata FROM digest_runs WHERE id=$1", [runId]))
          .rows[0].metadata.historical,
        "keep",
      );
      await claimScheduledDigestRun({ digestType: "weekly_digest", window });
    });
    await test("JSONB objects, SQL NULL, empty object, missing JS field and historical webhook", async () => {
      await query(
        "UPDATE email_deliveries SET error_details=$2,resend_response=$3,webhook_details=$4 WHERE id=$1",
        [deliveryId, null, {}, { present: 1, absent: undefined }],
      );
      const row = (
        await query(
          "SELECT error_details,resend_response,webhook_details FROM email_deliveries WHERE id=$1",
          [deliveryId],
        )
      ).rows[0];
      assert.deepEqual(row, {
        error_details: null,
        resend_response: {},
        webhook_details: { present: 1 },
      });
      assert.ok(!("absent" in row.webhook_details));
      await admin.query(
        "INSERT INTO resend_webhook_events(svix_id,event_type,resend_email_id,event_created_at) VALUES($1,$2,$3,$4)",
        [
          "synthetic-svix",
          "email.delivered",
          "synthetic-provider-id",
          window.end,
        ],
      );
      assert.equal(
        (await getHistoricalWebhookEvent("synthetic-svix"))?.processed_at,
        null,
      );
    });
    await test("crawler/admin/health reads and parameterized filters", async () => {
      for (const status of ["success", "failed"] as const)
        await insertCrawlRunRow({
          source_id: "fixture-a",
          source_name: "Fixture",
          started_at: window.start.toISOString(),
          finished_at: window.end.toISOString(),
          status,
          http_status: status === "success" ? 200 : null,
          found_count: 2,
          new_count: 1,
          error_message: status === "failed" ? "synthetic" : null,
        });
      assert.equal((await selectRecentCrawlRunRows()).length, 2);
      assert.ok((await noticeCounts(window)).get("fixture-a")! >= 3);
      assert.ok(
        (await getDeliveriesForScheduledRun("weekday_digest", window)).length >=
          1,
      );
      assert.equal((await adminNotices("' OR true --")).length, 0);
      assert.ok((await adminNotices("")).length > 0);
      assert.ok(
        (await activeSubscriptions("weekday_digest")).every(
          (r) => r.id !== inactive.id,
        ),
      );
    });
    await test("real constraint errors sanitized; serialization/deadlock mappings", async () => {
      for (const [sql, values, code] of [
        [
          "INSERT INTO subscriptions(email,frequency) VALUES($1,$2)",
          ["synthetic-a@example.invalid", "weekday_digest"],
          "23505",
        ],
        [
          "INSERT INTO subscription_sources(subscription_id,source_id) VALUES($1,$2)",
          [randomUUID(), "fixture-a"],
          "23503",
        ],
        [
          "INSERT INTO subscriptions(email,frequency) VALUES($1,$2)",
          ["secret-fixture@example.invalid", "invalid"],
          "23514",
        ],
      ] as const)
        await assert.rejects(
          query(sql, [...values], "fixture_constraint"),
          (e) =>
            e instanceof RepositoryError &&
            e.code === code &&
            !e.message.includes("secret-fixture"),
        );
      for (const code of ["23505", "23503", "23514", "40001", "40P01"]) {
        const error = safeDatabaseError(
          { code, message: "secret SQL credential" },
          "fixture",
        );
        assert.equal(error.code, code);
        assert.ok(!error.message.includes("secret"));
      }
      // A real serialization failure: both serializable transactions read the same row.
      const a = await getPool().connect(),
        b = await getPool().connect();
      try {
        await a.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        await b.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
        await a.query("SELECT frequency FROM subscriptions WHERE id=$1", [
          sub.id,
        ]);
        await b.query("SELECT frequency FROM subscriptions WHERE id=$1", [
          sub.id,
        ]);
        await a.query(
          "UPDATE subscriptions SET frequency='weekly_digest' WHERE id=$1",
          [sub.id],
        );
        await a.query("COMMIT");
        await assert.rejects(
          b.query(
            "UPDATE subscriptions SET frequency='weekday_digest' WHERE id=$1",
            [sub.id],
          ),
          (e) => safeDatabaseError(e, "fixture").code === "40001",
        );
      } finally {
        await a.query("ROLLBACK");
        await b.query("ROLLBACK");
        a.release();
        b.release();
      }
      const x = await getPool().connect(),
        y = await getPool().connect();
      try {
        await x.query("BEGIN");
        await y.query("BEGIN");
        await x.query("SELECT id FROM subscriptions WHERE id=$1 FOR UPDATE", [
          sub.id,
        ]);
        await y.query("SELECT id FROM subscriptions WHERE id=$1 FOR UPDATE", [
          inactive.id,
        ]);
        const outcomes = await Promise.allSettled([
          x
            .query("SELECT id FROM subscriptions WHERE id=$1 FOR UPDATE", [
              inactive.id,
            ])
            .finally(() => x.query("ROLLBACK")),
          y
            .query("SELECT id FROM subscriptions WHERE id=$1 FOR UPDATE", [
              sub.id,
            ])
            .finally(() => y.query("ROLLBACK")),
        ]);
        assert.equal(
          outcomes.filter(
            (r) =>
              r.status === "rejected" &&
              safeDatabaseError(r.reason, "fixture").code === "40P01",
          ).length,
          1,
        );
      } finally {
        await x.query("ROLLBACK");
        await y.query("ROLLBACK");
        x.release();
        y.release();
      }
    });
    await test("transaction rollback and Pool release after exception", async () => {
      await assert.rejects(
        transaction("fixture", async (c) => {
          await c.query(
            "INSERT INTO subscriptions(email,frequency) VALUES('rollback@example.invalid','weekday_digest')",
          );
          throw new Error("private");
        }),
      );
      assert.equal(
        (
          await query(
            "SELECT count(*)::int n FROM subscriptions WHERE email='rollback@example.invalid'",
          )
        ).rows[0].n,
        0,
      );
      assert.equal(getPool().waitingCount, 0);
    });
    await test("real repository plus mocked Resend sends once across workers", async () => {
      const w = { start: window.start, end: new Date("2026-08-03T00:00:00Z") };
      const digest = await buildDigest(sub.id, "weekday_digest", w);
      const params = {
        subscription: {
          id: sub.id,
          email: "synthetic-a@example.invalid",
          frequency: "weekday_digest" as const,
          unsubscribeToken: sub.unsubscribe_token,
        },
        digest,
        window: w,
      };
      let sends = 0;
      const dependencies = {
        claim: delivery.claimDigestDelivery,
        recordAccepted: delivery.recordDigestDeliveryAccepted,
        recordFailed: delivery.recordDigestDeliveryFailure,
        send: async () => {
          sends++;
          return {
            id: "synthetic-mocked-send",
            attempt: 1,
            durationMs: 1,
            httpStatus: 200,
            responseSummary: "fixture",
          };
        },
      };
      const results = await Promise.all([
        executeDigestDelivery(params, dependencies),
        executeDigestDelivery(params, dependencies),
      ]);
      assert.equal(sends, 1);
      assert.equal(results.filter((r) => r.status === "accepted").length, 1);
      assert.equal(
        (await executeDigestDelivery(params, dependencies)).status,
        "skipped",
      );
      assert.equal(sends, 1);
    });
    await test("explicit imported UUID and timestamps are never regenerated", async () => {
      const id = randomUUID();
      const timestamp = "2025-01-02T03:04:05.123456Z";
      await admin.query(
        "INSERT INTO notices(id,title,url,source_id,source_name,category,hash,created_at,updated_at,first_seen_at) VALUES($1,'Imported synthetic','https://example.invalid/import','fixture-a','Fixture','test','import-preserve',$2,$2,$2)",
        [id, timestamp],
      );
      await upsertNoticeBatch([
        { ...fixture("import-preserve"), title: "Imported changed" },
      ]);
      const row = (
        await query(
          "SELECT id,created_at,first_seen_at FROM notices WHERE id=$1",
          [id],
        )
      ).rows[0];
      assert.deepEqual(row, {
        id,
        created_at: timestamp,
        first_seen_at: timestamp,
      });
    });
    await reset(admin);
    await test("performance synthetic current-scale fixtures", async () => {
      await query(
        "INSERT INTO subscriptions(id,email,frequency) SELECT gen_random_uuid(),'synthetic-'||g||'@example.invalid','weekday_digest' FROM generate_series(1,80) g",
      );
      await query(
        "INSERT INTO subscription_sources(subscription_id,source_id) SELECT id,'source-'||g FROM subscriptions CROSS JOIN generate_series(1,5) g",
      );
      await query(
        "INSERT INTO notices(title,url,source_id,source_name,category,hash,first_seen_at) SELECT 'Synthetic '||g,'https://example.invalid/'||g,'source-'||(1+g%5),'Fixture','test','perf-'||g,$1::timestamptz + (g||' seconds')::interval FROM generate_series(1,1200) g",
        [window.start],
      );
      await query(
        "INSERT INTO email_deliveries(subscription_id,digest_type,period_start,period_end,status,idempotency_key) SELECT (SELECT id FROM subscriptions LIMIT 1),'weekday_digest',$1::timestamptz-(g||' days')::interval,$1::timestamptz-((g-1)||' days')::interval,'accepted','perf-key-'||g FROM generate_series(1,1800) g",
        [window.start],
      );
      await query(
        "INSERT INTO crawl_runs(source_id,source_name,started_at,finished_at,status) SELECT 'source-'||(1+g%5),'Fixture',$1,$1,'success' FROM generate_series(1,2000) g",
        [window.start],
      );
      const counts: Record<string, number> = {};
      for (const table of tables)
        counts[table] = (
          await admin.query(`SELECT count(*)::int n FROM ${table}`)
        ).rows[0].n;
      assert.deepEqual(
        [
          counts.notices,
          counts.subscriptions,
          counts.subscription_sources,
          counts.email_deliveries,
          counts.crawl_runs,
        ],
        [1200, 80, 400, 1800, 2000],
      );
      await admin.query("ANALYZE");
      const timings: Record<string, number> = {};
      const time = async (name: string, fn: () => Promise<unknown>) => {
        const start = performance.now();
        await fn();
        timings[name] = Math.round((performance.now() - start) * 100) / 100;
      };
      await time("active_subscriptions", () =>
        activeSubscriptions("weekday_digest"),
      );
      await time("digest_notices", () =>
        digestNotices(["source-1", "source-2"], window),
      );
      await time("crawler_upsert_100", () =>
        upsertNoticeBatch(
          Array.from({ length: 100 }, (_, i) => fixture("perf-" + (i + 1))),
        ),
      );
      const id = (await activeSubscriptions("weekday_digest"))[0].id;
      await time("delivery_claim", () =>
        delivery.claimDigestDelivery({ ...claimParams, subscriptionId: id }),
      );
      await time("health_aggregates", () => noticeCounts(window));
      writeFileSync(
        "docs/POSTGRESQL_TEST_RESULTS.json",
        JSON.stringify(
          {
            postgresVersion: (await admin.query("SHOW server_version")).rows[0]
              .server_version,
            fixtureCounts: counts,
            timingsMs: timings,
            suiteGroups: checks + 1,
          },
          null,
          2,
        ) + "\n",
      );
      console.log(
        JSON.stringify({ fixtureCounts: counts, timingsMs: timings }),
      );
    });
    console.log(
      `PostgreSQL integration: ${checks} groups passed (synthetic only)`,
    );
  } finally {
    await closePool();
    await reset(admin);
    await admin.end();
  }
}
main().catch((error) => {
  console.error(
    error instanceof RepositoryError
      ? error.message
      : error instanceof Error
        ? `${error.name}: ${error.message}`
        : "Test failure",
  );
  process.exitCode = 1;
});
