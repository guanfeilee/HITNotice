# Crawler redundancy reliability

The primary and backup remain full crawls at 19:45 and 19:50 Beijing time. No source selection or notice deduplication algorithm is changed. Only enabled, active sources participate.

## Failure contract

- A completed crawl with a small number of fetch/parse failures exits 0 and emits `crawler_outcome.status=degraded`. Each failure is persisted in `crawl_runs`, including its error. Zero exit means completed, not all sources healthy.
- At least 25% of selected sources failing (7 of the current 26) is systemic and fatal. This conservative fixed threshold is explicit and tested; it is not a claim that every correlated outage starts at exactly 25%.
- Any notice write failure/uncertainty, crawl-record persistence failure, uncaught exception, database/lock failure or process crash remains fatal. The launcher preserves its global pause behavior for fatal child exits. Pre-launch configuration/date/manifest rejection remains fail-closed as before.
- Digest checks for a successful crawl for every enabled source with `finished_at >= today's 19:45` and `finished_at <= actual now`. A later failed attempt does not erase earlier success.
- `FreshCrawlNotReady` occurs before digest run/recipient/delivery claims. Its dedicated digest-only exit code 10 refuses sending without creating a global pause. Digest-only exit 11 also refuses confirmed pre-claim suppression/subscription-change failures without a global pause. Other digest nonzero exits continue to pause, including uncertain submission/writeback. Codes 10/11 from crawler are still fatal.

## Health

The latest attempt and last successful completion are queried independently, without a global 500-row limit. Reports retain the latest error/time and show last success, latest-attempt failure count, fresh-success count and digest data readiness. A latest failure backed by fresh success is degraded, while digest readiness remains READY. Health readiness is about source data, not suppression, delivery eligibility or a global pause override.

## Unchanged protections

The workflow advisory lock, source subscriptions, accepted-window microsecond precision, deduplication, delivery claim/idempotency keys, provider request limits and conservative failed-send policy remain unchanged. No schema or historical data migration is needed. There is no manual recovery send.

## Deferred work

Health now bypasses the global PAUSED launcher/POST gate, retains its strict envelope and daily checkpoint, and reports pause metadata. Its own failure never creates or overwrites global PAUSED. See [pause policy](PAUSE_POLICY.md) for tests and availability limits. The four-cron schedule metadata heuristic remains unchanged.

Targeted retry is a later optimization: retain full backup now to avoid adding persistent primary/backup identity or time-dependent source filtering. A future targeted retry should select sources lacking a success inside the same digest freshness window and preserve failed attempts as independent health signals.

## Verification

- `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`.
- `npm run test:launcher-reliability`: isolated filesystem and child process doubles, including zero/degraded, database failure, SIGKILL status, digest readiness and send failure pause policy.
- `npm run test:crawler-reliability`: isolated PostgreSQL on 127.0.0.1:55439/hitnotice_test_workflow, synthetic records and a preload that replaces all network requests. Includes actual crawler child-process persistence failures and actual digest readiness exit.
- Existing `scripts/test-postgresql.ts` and `scripts/test-daily-workflow.ts` integration suites, synthetic data/mock sends only.

## Release procedure

Build an immutable Git-commit archive, generate `ops/source-manifest.json` with SHA-256 for every tracked file and version equal to the fix commit, and stage a new `/opt/hitnotice-tasks/releases/<commit>` directory. Reuse the existing pinned Linux dependencies. Verify all hashes and the existing launcher configuration, and atomically switch `daily-current` when no task is running and well before the evening schedule. Keep all four crontab entries unchanged. Do not run production crawler/digest/health as a deployment test.

Rollback is a separate controlled action: inspect any current task/PAUSED/delivery evidence first; atomically point back to the preserved previous release without changing cron. Never clear PAUSED/history or overwrite the old working directory to roll back.
