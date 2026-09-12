# PostgreSQL Current Production Schema Baseline

The current production database is self-hosted PostgreSQL 17. The authoritative baseline DDL is `database/schema/0001_current_baseline.sql`. It consolidates the previously audited production catalog, rather than replaying historical migrations or their data transformations. Historical `supabase/` SQL remains reference material and must not be run against this target.

## Objects

Target major: PostgreSQL 17. The isolated tested patch version is recorded in `POSTGRESQL_TEST_RESULTS.json`.

| Table | Columns | Indexes | Checks | Important invariants |
|---|---:|---:|---:|---|
| notices | 11 | 6 | 6 | Non-null hash, unconditional unique hash; six nonblank text checks |
| subscriptions | 8 | 3 | 3 | Unique email; partial unique non-null unsubscribe token; weekday/weekly and active/unsubscribed checks |
| subscription_sources | 4 | 3 | 1 | Unique subscription/source; nonblank source; cascading subscription FK |
| email_deliveries | 23 | 7 | 7 | Unique full window and idempotency key; partial unique provider ID; nine delivery states |
| digest_runs | 17 | 4 | 11 | Unique type/kind/start/end (not partial); valid counters and finish time |
| crawl_runs | 11 | 3 | 5 | Success/failed, nonnegative counts, ordered times, HTTP range |
| resend_webhook_events | 8 | 3 | 3 | Unique svix ID; historical compatibility only |
| **Total** | **82** | **29** | **36** | **7 PK, 2 cascading FK, 2 UNIQUE constraints; remaining uniqueness via indexes** |

All IDs: UUID primary key, default `gen_random_uuid()`. All timestamps: `timestamptz`. `created_at` defaults to `now()` on every table. No identity columns, sequences, views, custom enums or domains are required. The baseline has no row-level security and no Supabase roles/grants.

Field inventories in physical order:

- notices: id, title, url, source_id, source_name, category, published_at, first_seen_at, hash, created_at, updated_at.
- subscriptions: id, email, frequency, status, created_at, updated_at, unsubscribe_token, unsubscribed_at.
- subscription_sources: id, subscription_id, source_id, created_at.
- email_deliveries: id, subscription_id, digest_type, period_start, period_end, notice_count, status, sent_at, error_message, created_at, resend_email_id, idempotency_key, accepted_at, delivered_at, last_event_at, processing_started_at, attempt_count, last_attempt_duration_ms, http_status, error_details, resend_response, webhook_details, updated_at.
- digest_runs: id, digest_type, run_kind, period_start, period_end, started_at, finished_at, status, users, recipients, skipped, blocked, failed, error_message, metadata, created_at, updated_at.
- crawl_runs: id, source_id, source_name, started_at, finished_at, status, http_status, found_count, new_count, error_message, created_at.
- resend_webhook_events: id, svix_id, event_type, resend_email_id, event_created_at, processed_at, processing_result, created_at.

`public.set_updated_at()` is one PL/pgSQL, invoker-security trigger function. Three BEFORE UPDATE ROW triggers attach to notices, subscriptions and digest_runs. There is deliberately **no email_deliveries trigger**; repository updates set its updated_at explicitly.

`notices.first_seen_at` defaults to now and is never rewritten by crawler conflict updates. `published_at`, unsubscribe_token and unsubscribed_at are nullable. Delivery idempotency_key is non-null, with no generated default. Delivery error_details, resend_response and webhook_details are nullable JSONB; run metadata is non-null JSONB with `{}` default. Counts default to zero; subscription/delivery/run statuses default to active/pending/running respectively; digest run kind defaults to scheduled. Consult the DDL for each named check, nullability and exact index order.

## Index definitions

The DDL preserves all seven PK indexes plus:

- notices: unique hash, source_id, published_at DESC, category, first_seen_at DESC.
- subscriptions: email unique constraint index, unsubscribe_token unique WHERE IS NOT NULL.
- subscription_sources: subscription_id/source_id unique constraint index; subscription_id index.
- email_deliveries: subscription_id, period_start/period_end, status; unique subscription_id/digest_type/period_start/period_end; unique idempotency_key; unique resend_email_id WHERE IS NOT NULL.
- digest_runs: unique digest_type/run_kind/period_start/period_end; digest_type/run_kind/period_end DESC; status/started_at DESC.
- crawl_runs: source_id/started_at DESC; status.
- resend_webhook_events: unique svix_id; resend_email_id.

## Extensions and privileges

PostgreSQL 17 native `gen_random_uuid()` is tested with no extra extension. Application idempotency hashing and token generation use Node crypto. The old migration's `digest()` backfill is not replayed. Therefore pgcrypto is unnecessary for this application baseline; uuid-ossp, pg_stat_statements and supabase_vault are not copied. Only PostgreSQL's default plpgsql exists in the test cluster.

`hitnotice_owner`: NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE; owns schema and all business objects. A separately managed migrator may assume this role. The test bootstrap superuser provisions roles; the baseline itself runs under owner.

`hitnotice_runtime`: LOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE; not database or object owner, no schema CREATE, no TRUNCATE. `database/roles/runtime-grants.sql` grants:

| Tables | Runtime privileges |
|---|---|
| notices, subscriptions, email_deliveries, digest_runs | SELECT, INSERT, UPDATE |
| subscription_sources | SELECT, INSERT, DELETE |
| crawl_runs | SELECT, INSERT |
| resend_webhook_events | SELECT only |

No anon/authenticated/service_role or PUBLIC table grants. Future migrations must explicitly grant new objects, rather than broad default privileges. Production credential provisioning, pg_hba.conf and host/service hardening belong to Phase C.

## Runtime model

`DATABASE_URL` is server-only, not prefixed NEXT_PUBLIC, and belongs on ECS API/CLI processes, not the Next.js web process. Example shape (not a real credential): `postgresql://hitnotice_runtime:REDACTED@127.0.0.1:5432/hitnotice`.

Lazy pool: max 5, idle timeout 30 seconds, connection timeout 5 seconds, statement timeout 15 seconds, lock timeout 5 seconds, timezone UTC. Each transaction uses one PoolClient and rolls back/releases on failure; there is no automatic infinite retry. Error mapping exposes only operation and safe code. Idle connection error logs omit details. Four concurrent processes consume at most 20 application connections; reserve ~10 out of max_connections ~30 for maintenance and PostgreSQL administration. Do not overlap duplicate cron processes or run extra sender/retry workers without budgeting their pools.

One-shot scripts close pools in finally; allowExitOnIdle is additional protection. ECS API drains HTTP connections before pool.end on SIGINT/SIGTERM. Imports do not require DATABASE_URL or open a connection; browser app import graph rejects DB imports.

The timestamptz parser returns UTC ISO strings preserving PostgreSQL microseconds. SQL filtering performs `[start,end)` before JS conversion. Existing DigestWindow Date interfaces have millisecond precision: future restore must audit historical window endpoints for sub-millisecond precision before using them as retry identities. PostgreSQL storage and ordinary reads preserve all digits; this is not permission to round restored timestamps.

## Migration compatibility (future only)

Preserve UUIDs, every timestamp, JSONB objects/NULLs, idempotency_key, resend_email_id, unsubscribe_token, delivery states and all digest metadata. No import helper generates replacements or rehashes existing rows. Export/import must use explicit column lists and data-only mappings to these seven business tables. Do not import Supabase ownership, ACLs, RLS or extension objects. Existing explicit updated_at values must survive data load; do not replay history as UPDATEs that invoke timestamps. The original Phase B baseline work did not perform a production dump or restore; later migration evidence is retained in the Phase D/E records. Constraint validation, row counts, checksum comparisons, token/key parity, orphan checks and non-millisecond window inventory remain mandatory restore rehearsal gates.
