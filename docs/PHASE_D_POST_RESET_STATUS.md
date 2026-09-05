# HITnotice Phase D Production Data Migration Rehearsal Report

> Historical stop-gate report. The user subsequently revised this gate and the rehearsal passed. Current result: [completed Phase D report](PHASE_D_PRODUCTION_DATA_MIGRATION_REHEARSAL_REPORT.md).

2026-09-05, Asia/Shanghai. **NOT READY FOR PHASE E**. Credentials and native PostgreSQL access now work. Phase D is stopped before pg_dump because the required post-reset ECS health check fails. This report supersedes the earlier missing-password/human-handoff status.

## Password Reset Authorization Result

Production native DB dependency before reset: **NOT FOUND in the inspected scope**. The previous live audit covered 1,266 ECS files, systemd, user cron files, shell/PG configurations, running Node processes and current Vercel production variable names. No native source connection configuration was found. Known Phase C localhost PostgreSQL infrastructure was distinguished from a production Supabase password dependency. See the prior report for the scoped audit evidence.

The user reported completing the Dashboard reset and supplied the new credential. Exact reset submission time was not independently captured. Successful authentication below confirms the supplied credential works. The agent did not perform another reset or rotate API keys.

Credential file: `/root/.config/hitnotice/supabase-production-db.json`; root-owned **0600**, directory **0700**. It was saved through hidden SSH TTY input, with no password echo or password-bearing command argument. The earlier helper imposed a 20-character minimum and conflated that rejection with input mismatch. It now reports empty/mismatched/line-break inputs separately and accepts the existing password without imposing a new policy.

## Native DB Connection

Dashboard-confirmed Session pooler: `aws-1-ap-northeast-2.pooler.supabase.com:5432`. Database and pooler username were read from Dashboard, not guessed.

Initial TLS validation failed with `SELF_SIGNED_CERT_IN_CHAIN` before SQL execution. The official CA linked by Dashboard resolved it. Certificate and hostname verification remained enabled. Certificate file: `/root/.config/hitnotice/supabase-ca.crt`, 0600; SHA-256 fingerprint `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`.

Final check at **2026-09-05T11:04:07Z**:

| Check | Result |
|---|---|
| Session pooler SELECT 1 | PASS |
| TLS encrypted / certificate authorized | PASS |
| Connect plus SELECT 1 | 1,066.91 ms |
| SELECT 1 | 121.24 ms |
| Source PostgreSQL | 17.6 |
| Database / current role | postgres / postgres |
| Explicit transaction_read_only | on |
| Table/metadata reads | PASS |

The pooler did not preserve the startup read-only GUC in the initial check. All executed SQL was SELECT/SHOW, so no business writes occurred. The checker was corrected and rerun with `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`, verification of `transaction_read_only=on`, then ROLLBACK. Future export tooling must enforce read-only transactions explicitly. Root-only aggregate evidence: `/root/hitnotice-phase-d-20260905/native-read-check.json`.

## Data API Before / After

| Check | Before reset, 18:37 | After reset, 19:02 | Follow-up, 19:04 |
|---|---|---|---|
| ECS Data API HEAD | FAIL, URLError, 22,645 ms | FAIL, timeout, 45,301 ms | FAIL, URLError, 27,667 ms |
| Signed ECS internal health GET | FAIL, disconnected, 10,009 ms | FAIL, disconnected, 10,014 ms | FAIL, disconnected, 10,008 ms |
| Production homepage GET | PASS, 200, 846 ms | PASS, 200, 360 ms | PASS, 200, 273 ms |

One IPv4 curl HEAD at 19:03 succeeded with HTTP 200 in 4,991.934 ms: DNS 188.237 ms, TCP connected at 1,395.656 ms, TLS completed at 4,118.945 ms. Both API and nginx remained active with their original PIDs. Aggregate evidence: `/root/hitnotice-phase-d-20260905/post-reset-network.json`.

The HTTPS path is intermittently successful. Failures were observed before reset; this evidence does not establish that reset caused them. Homepage 200 does not prove a fresh database read, and a successful standalone curl does not establish that the ECS health endpoint works.

**Stop gate:** section 11 of the user's reset authorization requires stopping Phase D and not continuing pg_dump when post-reset Data API/ECS API/site checks fail. ECS health still fails, so no dump was attempted. No production restart, environment/networking change or additional reset was made to bypass this gate.

## Source Counts and Critical Transient States

These are fresh counts from the final read-only repeatable-read transaction. The transaction was rolled back; its snapshot was not exported or used for a migration archive.

| Table | Source read check | Migration snapshot | Rehearsal | Full hash |
|---|---:|---|---|---|
| notices | 1,155 | Not captured | Not restored | Not executed |
| subscriptions | 76 | Not captured | Not restored | Not executed |
| subscription_sources | 391 | Not captured | Not restored | Not executed |
| email_deliveries | 1,746 | Not captured | Not restored | Not executed |
| digest_runs | 29 | Not captured | Not restored | Not executed |
| crawl_runs | 2,137 | Not captured | Not restored | Not executed |
| resend_webhook_events | 0 | Not captured | Not restored | Not executed |

Pending deliveries: **0**. Running digest runs: **0**. Full status/frequency comparisons remain unexecuted. Paused cron and zero transient counts do not prove a frozen source; web/manual writers may remain active.

## Production Safety and Formal Target

Production still uses Supabase. The current preflight verified formal `hitnotice`: seven tables, every table **0 rows**; 82 columns, 29 indexes, 36 CHECKs, 7 PKs, 2 FKs, 2 unique constraints, 3 triggers and 1 function. The Phase C protected production file/cron manifest remained unchanged. API PID 1353837 and nginx PID 1355144 stayed active. Final re-verification is recorded alongside this report.

No changes to `/root/HITNotice`, Vercel production, ECS API release/environment, production DATABASE_URL, nginx, business cron or delta preservation were performed. No Phase A/B deployment or backend switch occurred. No crawler, digest, retry/delta send, email, health notification, webhook replay or WeChat draft was executed. Source SQL was read-only. Apart from the user-performed password reset, this work made no Supabase production configuration changes.

## Snapshot, Restore, Backup and Migration Timing

No migration snapshot, dump, transfer, restore, archive checksum/list or rehearsal backup occurred. No rehearsal database was created by this attempt. Dump timestamp/size/checksum and migration durations are unavailable; connection timings are not migration timings. No real dump entered local development storage, Git, chat or public storage.

The planned strategy remains canonical Phase B schema plus an explicit seven-table custom data-only dump and hashes sharing one exported read-only snapshot. Real archives must stay under ECS `/var/backups/hitnotice/migration-rehearsal/` (0700 directory, 0600 files). Only `hitnotice_migration_rehearsal` is an allowed restore target. The exporter and restore workflow have not been executed.

## Remaining Validation Gates

All following migration-dependent checks are **NOT EXECUTED**, not PASS: seven-table hashes/count/status parity; referential integrity and zero orphans; uniqueness invariants; subscriptions/email_deliveries/digest_runs full-field preservation; timestamps and historical updated_at; JSONB type/value/NULL parity; rehearsal schema/index/FK/trigger validation; runtime role and all Phase B read functions; weekday/weekly pure dry runs; health/admin comparisons; synthetic crawler/subscription/rollback/concurrent claims with final unchanged hashes; seven-class real-data median/max benchmarks; rehearsal backup/checksum/list. Unsubscribe tokens, idempotency history and provider IDs cannot yet be labelled preserved.

## Phase E Inputs and Remaining Risks

Canonical code: `13d46e7cea1d2c1ff128696666cd299f2f2524bd`. Infrastructure base: `9c2ff041d4c3260109460f9936fed198c0df2592`. Formal target: PostgreSQL 17.11, `hitnotice`.

Freeze checklist for later live revalidation: Vercel subscribe/unsubscribe and ECS internal subscribe/unsubscribe are production entry points; crawler/digest/health cron are PAUSED; retry/test writers are MANUAL potential writers; legacy webhook status needs route/release revalidation. This is not a completed writer freeze. Confirm no in-flight ECS POST and reconcile pending/running states before a final snapshot.

Phase E must freeze all writers and take a NEW final snapshot. Any future rehearsal dump must not become the final cutover data source. Before new target writes, rollback can return routing to retained Supabase. After PostgreSQL accepts writes, freeze both sides, export/reconcile target changes and email acceptance history, then reopen one validated writer. No real Supabase reverse import was performed.

Production remains Supabase; Phase B and canonical Vercel are not deployed. Final writer freeze, cutover dump and cutover are not performed. Post-write rollback remains complex. OSS offsite backup remains pending; delta WIP is excluded. Localhost would remove the cross-region HTTPS dependency from core repository operations, but this attempt has not yet validated restored real-data performance or future reliability.

**NOT READY FOR PHASE E.** Credentials are no longer the blocker. The immediate blocker is the failed production health gate; snapshot/restore and all dependent integrity/compatibility work remain outstanding. Resume migration only after that gate passes or the user explicitly revises it.
