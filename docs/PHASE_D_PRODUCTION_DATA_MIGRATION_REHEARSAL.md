# HITnotice Phase D Production Data Migration Rehearsal Report

> Superseded by the [completed Phase D report](PHASE_D_PRODUCTION_DATA_MIGRATION_REHEARSAL_REPORT.md). Retained below only as historical audit evidence.

> Historical report from before the user's password reset. Current status and results: [Phase D post-reset report](PHASE_D_POST_RESET_STATUS.md). The credential blocker below has been resolved; the post-reset ECS health gate now blocks migration.

Status: **NOT READY FOR PHASE E**. Phase D is blocked before PostgreSQL source authentication, snapshot export, and restore. This is an incomplete rehearsal report, not a successful migration report.

## Resumed authorization and pre-reset audit — 2026-09-05

The user subsequently authorized resetting only the Supabase database password after proving no production native PostgreSQL dependency. Reset has **NOT** been performed. The earlier missing-password report below is historical context; the immediate execution boundary is now the computer-use tool's mandatory human handoff for credential changes.

At 18:32–18:40 Asia/Shanghai, a fresh audit scanned 1,266 files across `/root/HITNotice`, `/opt/hitnotice-api`, `/etc/hitnotice`, systemd units, cron directories and all user crontab spool files, shell profiles, PostgreSQL password/service locations and scoped configuration. There were no native PostgreSQL connection markers or unreadable files in that scan. Both production Node processes (1353837, 1353849) and nginx processes had no native connection markers in their environment/command configuration. Phase C local PostgreSQL infrastructure is separately known and is not a Supabase production password dependency. No established outbound 5432/6543 connection was observed at the final check.

Live `vercel env ls production` returned nine production variables: API base/internal signing configuration, admin/site/email settings and Supabase URL/anon/service-role configuration. No DATABASE_URL, POSTGRES_URL, PGHOST, PGPASSWORD or other native DB variable was listed. No variable values were printed. Current Vercel production deployment `dpl_BNtvx37AxMPg5HYRsmVqY86xUFkm` was Ready. The local production repository search found no native connection marker. ECS current release `/opt/hitnotice-api/releases/1b5472d` uses the Supabase SDK in its database health implementation and performs a read-only notices HEAD query.

**Production native DB dependency before reset: NOT FOUND in the requested inspected scope.** This is evidence from deployed configuration, process state and code, not a claim about inaccessible external systems. Vercel homepage HTTP 200 alone does not prove a fresh database read.

Baseline at 2026-09-05T10:37:13Z:

| Check | Result | Observation |
|---|---|---|
| ECS to Supabase Data API HEAD | FAIL | URLError, 22,645 ms; response details withheld |
| Signed ECS internal health GET | FAIL | RemoteDisconnected, 10,009 ms |
| Production homepage GET | PASS | HTTP 200, 846 ms |
| ECS API / nginx services | PASS | Active; original PIDs unchanged |
| Formal hitnotice | PASS | All seven tables empty; protected files/cron unchanged |

These failures predate any password reset. No after-reset comparison exists yet. Native SELECT 1, TLS/latency validation and all snapshot-dependent gates remain unexecuted.

The authenticated Dashboard's Session pooler parameters were reconfirmed; the Reset database password form is open with no credential entered or submitted. The computer-use tool requires a human to enter, confirm and submit changed credentials. It therefore prevents autonomous Dashboard completion despite the user's authorization. No alternative management API credential was available; browser authentication material was not extracted.

A no-secret helper is ready on ECS at `/root/hitnotice-phase-d-20260905/save-source-credential.py` (0700). After personally resetting the password, the user can run it through an interactive SSH TTY. It accepts hidden input twice, refuses an existing file, and saves only `/root/.config/hitnotice/supabase-production-db.json` (0600), with directory 0700. It never prints the password. This helper has passed syntax validation; no password input or credential write has yet occurred. Source password must not be pasted into chat. Once saved, continue SELECT 1, TLS validation and after-reset production health gates before any dump. If any required after-reset gate fails, stop without another reset.

## Production Safety

Date: 2026-09-05, Asia/Shanghai. Production remains configured for Supabase. Initial checks found PostgreSQL 17.11 listening only on 127.0.0.1:5432; API and nginx were running, and business cron remained paused. Ending verification confirmed all 213 protected file/cron entries unchanged and all seven formal `hitnotice` tables empty. No application deployment, production environment/backend change, service restart, cron restoration, crawler, digest, retry, delta, email, health notification, WeChat draft or webhook replay was performed. No source business write was performed. Delta preservation was untouched.

## Credential discovery and blocking condition

Read-only discovery covered the local HITnotice environment files (including the existing Vercel production environment file), ECS `/root/HITNotice` environment files, `/etc/hitnotice`, scoped HITnotice/Supabase configuration locations, PostgreSQL password/service-file locations, and CLI availability. Output was limited to file paths, field names and presence flags. Neither local nor ECS Supabase CLI was installed. No callable Supabase connector was available in this session.

The existing authenticated Chrome Dashboard was used to inspect HITnotice's Connect panel. It confirmed:

| Parameter | Observed value |
|---|---|
| Project reference | wzticbvfzehpukwtqcoi |
| Session pooler host | aws-1-ap-northeast-2.pooler.supabase.com |
| Port | 5432 |
| Database | postgres |
| User | postgres.wzticbvfzehpukwtqcoi |
| IPv4 support | Dashboard labels session pooler as IPv4 proxied |
| Password | Unavailable: Dashboard displays a placeholder |

The existing ECS credential `/etc/hitnotice/postgresql-runtime.json` belongs to the local PostgreSQL target, not Supabase. API keys and the SSH password were not used as source PostgreSQL passwords. Dashboard offers a password reset control; it was not activated. No source credential file was created with a missing or invented password. Source PostgreSQL `SELECT 1` was not possible. Endpoint network/TLS/authentication success remains unverified.

The user explicitly requires stopping before any database-password reset or production configuration change. Further progress requires an existing valid source database password or a separately authorized access change. No claim is made that every possible external password vault has been searched.

## Source live preflight — not a snapshot

An ECS-only REST preflight ran from 2026-09-05T06:56:25Z to 07:00:48Z. It used read-only HEAD/GET requests and withheld response bodies. `digest_runs` count returned 29; all other table counts and all requested distributions were unavailable. These incomplete observations are not a consistent snapshot, and no detailed cause is asserted from the sanitized failures. Private aggregate evidence: `/root/hitnotice-phase-d-20260905/live-preflight.json`.

| Table | Source snapshot | Rehearsal | Full-table hash |
|---|---|---|---|
| notices | Not captured | Not restored | Not executed |
| subscriptions | Not captured | Not restored | Not executed |
| subscription_sources | Not captured | Not restored | Not executed |
| email_deliveries | Not captured | Not restored | Not executed |
| digest_runs | Not captured | Not restored | Not executed |
| crawl_runs | Not captured | Not restored | Not executed |
| resend_webhook_events | Not captured | Not restored | Not executed |

Pending deliveries, running digest runs and source status/frequency distributions remain unknown. Paused cron does not establish a frozen source: website and manual writers may remain active.

## Snapshot and rehearsal database

No production snapshot, dump, transfer, restore or final rehearsal backup occurred. Source PostgreSQL version, snapshot timestamp, size, checksum, export duration and restore duration are unavailable. No `hitnotice_migration_rehearsal` database was created by this attempt. No real dump entered the development machine, Git, temporary directories or public storage.

The prepared strategy is Phase B canonical schema plus an explicit seven-table custom-format data-only dump, sharing an exported read-only repeatable-read snapshot with source hashes. See `ops/phase-d/README.md`. This is a design, not a tested exporter. PostgreSQL documents snapshot consistency and the `--snapshot` option in [pg_dump documentation](https://www.postgresql.org/docs/17/app-pgdump.html). Endpoint selection follows the observed Dashboard and [Supabase connection documentation](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Integrity and compatibility gates not executed

The following require the real snapshot and remain **NOT EXECUTED**, not PASS: status/frequency parity; full-table hashes; zero FK orphans; all uniqueness invariants; full-field subscriptions/email_deliveries/digest_runs preservation; timestamps including historical updated_at and microseconds; JSONB type/value parity; trigger safety; rehearsal schema/index/FK verification; runtime role read-only transactions; all requested Phase B repository reads; weekday/weekly pure digest calculations; health/admin comparisons; synthetic crawler/subscription/claim concurrency checks with final unchanged hashes; seven-class real-volume median/max benchmarks; rehearsal backup/list/checksum verification. Email history, resend IDs and idempotency keys cannot yet be labelled preserved.

## Formal target database

Ending live verification:

- `hitnotice`: 7 business tables, each 0 rows.
- 82 columns, 29 indexes, 36 CHECK constraints, 7 primary keys, 2 foreign keys, 2 unique constraints, 3 triggers, 1 function.
- Owner/runtime roles remain non-superuser, no createdb/createrole, noinherit; owner NOLOGIN and runtime LOGIN.
- Runtime password storage remains SCRAM.
- Protected production files and crontab unchanged.

These checks concern the empty formal target and do not substitute for rehearsal validation.

## Phase E inputs and remaining risks

Canonical application commit: `13d46e7cea1d2c1ff128696666cd299f2f2524bd`. Infrastructure documentation base: `9c2ff041d4c3260109460f9936fed198c0df2592`. Target PostgreSQL: 17.11, formal database `hitnotice`.

Before Phase E: complete all missing Phase D gates; verify/freeze Vercel subscribe/unsubscribe, ECS internal subscribe/unsubscribe, crawler, scheduled digest, retry, test writers, and any legacy webhook writer; confirm no in-flight ECS POST and record pending/running states without blindly resetting them. Reconfirm actual deployed routes and releases at cutover time. Capture a new consistent final source snapshot only after writer freeze. A rehearsal dump must never be treated as the final production snapshot.

Before new PostgreSQL business writes, rollback can return application routing/configuration to the retained Supabase source. After PostgreSQL accepts writes, freeze both sides, export/reconcile the target delta and email acceptance history, and validate the chosen single source before reopening writers. This reverse migration has only been designed; no production reverse import was executed.

Production still uses Supabase. Canonical Vercel and Phase B application code are not deployed. Final writer freeze, final production dump and cutover are not performed. Post-write rollback remains complex. OSS offsite backup remains pending; delta remains WIP. Local PostgreSQL would remove the cross-region Supabase HTTPS dependency from core repository operations, but this attempt has not measured real-data performance or established future reliability.

**Recommendation: NOT READY FOR PHASE E.** Immediate blocker: no existing Supabase PostgreSQL password found through the available authorized paths. Additional blockers: real snapshot, restore and all dependent integrity/compatibility gates remain unexecuted. Do not reset credentials or change production configuration without explicit authorization.
