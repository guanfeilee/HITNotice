# Production DB Dependency Audit — Phase B

**Active production DB code dependency on Supabase: NO.** This statement applies to `codex/postgresql-repository` source, not the currently deployed production services. No deployment/environment change was made.

Search scope: all TypeScript/TSX under `lib/`, `app/`, `scripts/`, plus package.json and lockfile. Case-insensitive search includes supabase, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE, rest/v1 and createClient. The final remaining matches are all in `scripts/test-canonical-baseline.ts`:

| Remaining match | Classification | Why retained |
|---|---|---|
| Test title mentioning Supabase | test-only | Describes forbidden dependency check |
| App import-graph denylist regex | test-only | Rejects database/Supabase imports, SDKs, retired event writer and DATABASE_URL in the web graph |
| Production lib/app/CLI scan regex | test-only | Fails if any non-test source reintroduces Supabase or PostgREST |
| package dependency assertion | test-only | Ensures @supabase/supabase-js remains absent |

No active lib/app/CLI match remains. The crawler startup requirement now checks DATABASE_URL only. Removed five `lib/supabase/*.ts` files, obsolete `test-supabase-write.ts`, its command and SDK dependency. No REST fallback path remains. The legacy pure payload function names in `lib/db/notices.ts` support an offline first_seen_at test; they do not connect to a legacy backend or bypass canonical hash requirements. The inactive applyResendDeliveryEvent helper was removed; historical webhook lookup lives in a read-only repository and the route still returns 410.

README and `.env.example` identify the Phase B target. Historical `supabase/` migrations and Phase A documentation remain provenance, not executable baseline instructions. The old email-production guide is marked historical at its entry. They are not imported by production modules.

## Access map

| Entry | Repository |
|---|---|
| Vercel web subscribe/unsubscribe/admin | None; signed HTTPS ECS proxy |
| ECS subscription services | db/subscriptions |
| ECS admin notices | db/notices |
| ECS health endpoint | db/pool read-only check |
| crawler | db/notices, db/crawl-runs |
| digest/retry | db/subscriptions, db/notices, db/deliveries, db/digest-runs |
| health report | db/health, db/crawl-runs, db/digest-runs |
| WeChat digest rendering | same digest read repositories; no new active sending behavior |
| webhook route | Retired 410; no database access |

All SQL resides under lib/db except explicitly guarded synthetic test setup/assertions. Query values are parameterized. Interpolated query fragments are fixed, source-controlled column/type definitions; no user identifier or source filter is interpolated. Transactions hold one client, and neither Resend HTTP nor confirmation mail runs in a database transaction.
