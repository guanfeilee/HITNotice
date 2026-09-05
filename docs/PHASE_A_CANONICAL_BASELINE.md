# HITnotice Phase A — Canonical Baseline

Status: source consolidation complete; **not deployed**. Supabase remains the backend. This document describes this commit, not the currently deployed Vercel site.

## Provenance and WIP preservation

Base: `1b5472db43f27077e5df4018f23c6c3cc2ea1d14`, child of `208fa71ae5381442925850c2949c964b167a3160`.
Canonical branch: `codex/canonical-baseline`. Obtain its exact commit with `git rev-parse HEAD`.

Delta WIP is preserved separately in `codex/delta-digest-preservation`, commit `a2c1a2aa79e3b13642e71a7bf092fe228118d750`.
Seven source/package files were compared to hashes read directly from `/root/HITNotice` on 2026-09-05. All matched. The tracked production diff SHA-256 is `aad92e254dda3a44dad88b58f71990e4df882fcdf61e19f8360f03139e1a6ec5`.
That branch includes `preservation/sha256.json`, `preservation/tracked-production.patch`, and `preservation/full-delta.patch` (including untracked source contents). The full patch passed reverse-apply validation against the preserved tree. Production `tsconfig.tsbuildinfo` was left untouched and excluded as generated cache.

Delta is **NOT PRODUCTION READY** and absent from this canonical tree and package scripts. Preserve this branch independently before any future worktree cleanup. Its anchor timing, failure recovery and retry lookup need separate work.

The audited ECS release matched 217 of 218 base-commit files. Its sole difference, `scripts/check-ecs-api-health.ts`, had SHA-256 `17c7fca88a7cc298cd713b0a7200786d8ed765ef6f187e828079cc875b9f7d7a`.
Decision: **modified**. Configurable check base URL, optional admin GET and `ecs-readonly-check` client ID were adopted. The implementation now shares the bounded transport, refuses public plaintext HTTP and redirects, validates responses, and logs only status/count summaries. It does not print upstream errors or notice contents.

## Canonical web paths

- Subscribe: Browser → Vercel `/api/subscribe` → signed ECS `/internal/subscribe` → `lib/subscriptions/service.ts` → Supabase.
- Unsubscribe: Browser → Vercel `/api/unsubscribe` → signed ECS `/internal/unsubscribe` → the same service → Supabase.
- Admin: Vercel checks `ADMIN_CHECK_TOKEN` first, then requests signed ECS `/internal/admin/notices`. Wrong/missing admin tokens make no ECS request. HMAC is service authentication, not user authorization.
- Health check: signed GET `/internal/health`, optionally followed by signed GET `/internal/admin/notices`; no mutations.

Validators are shared by proxy and ECS. Mutation logic exists only in the ECS subscription service. Browser request shapes and `{ok,error}` responses remain compatible. Invalid/missing unsubscribe tokens remain 400/404. Existing token/link format is unchanged.

## Webhook decision

**Production webhook strategy: DISABLED.** GET and POST `/api/webhooks/resend` return 410 regardless of environment. There is no ECS internal webhook route. The legacy `applyResendDeliveryEvent` helper remains in the existing digest module to avoid rewriting the database layer; no canonical route or executable business entrypoint calls it. Historical delivery rows are not changed. Health reporting cannot claim webhook tracking is enabled via an environment flag.

## Security and request semantics

- Existing HMAC-SHA256 protocol, signed method/path/timestamp/nonce/client ID/body hash, timing-safe comparison and five-minute skew checks remain.
- Existing nonce replay protection and rate limits remain in process memory; they are not a distributed replay store and reset on restart.
- Request bodies are limited to 16 KiB on both sides. Proxy body reading has an eight-second bound. Internal server has a ten-second absolute request deadline in addition to socket timeout.
- Outbound client timeout is eight seconds including response reading. Response body limit is 1 MiB. Health checks reuse this client.
- HTTPS is required for public origins; HTTP is allowed only on loopback. Credentials, paths, query or fragments in the base URL are rejected. Only the four internal endpoint/method pairs are allowed. Redirects are never followed with signature headers.
- **One attempt per request, including GET and POST. No automatic mutation retry.** A timeout is an unknown business outcome, not proof of rollback.
- Upstream 401/403/5xx/redirect responses map to generic unavailable responses. Raw errors, credentials and signature headers are not exposed. Admin notices are structurally checked; links must use HTTP(S).
- Logs contain method/path/status/duration or check status/counts, not request bodies, tokens, signature headers or upstream error strings.

Subscribe still uses email upsert followed by `subscription_sources` delete and insert in separate Supabase operations. Partial failure and concurrent updates can leave incomplete associations. A repeated completed request generally converges, but this is **not atomic and not exactly-once**, including confirmation-mail side effects. Phase B must make subscription plus associations transactional and define concurrency/retry semantics.

Unsubscribe repeats the same terminal state but updates timestamps again. A lost response can follow a successful update. The proxy does not auto-retry it.

## Runtime credentials after deployment

Vercel needs `HITNOTICE_ECS_API_BASE_URL`, `HITNOTICE_INTERNAL_API_SECRET`, `ADMIN_CHECK_TOKEN` and any page/site configuration. It does not need Supabase or Resend credentials for these web paths.

**Vercel SUPABASE_SERVICE_ROLE_KEY dependency: REMOVABLE AFTER DEPLOYMENT.**
The whole `app/` import graph is tested for direct Supabase/legacy webhook dependencies, not only the route files. `NEXT_PUBLIC_SUPABASE_*` also has no browser business caller in this baseline and can be removed later after deployment verification. No live environment was edited.

ECS retains the existing Supabase configuration, Resend configuration and API signing secret. Crawler/digest/retry/health/WeChat continue using their existing Supabase access layers. No `pg`, PostgreSQL repository, SQL migration or backend switch is introduced.

## Protected test/debug entrypoints

`test:supabase` without `--write-test` remains a read check. A write request requires **all** of: `ALLOW_DATABASE_WRITE_TEST=1`, non-production `NODE_ENV` and `VERCEL_ENV`, and a loopback Supabase URL. All remote Supabase hosts are refused, even with opt-in. The guard executes before client import or database reads for write mode. Error details are withheld. This safeguard applies to the canonical script, not the unchanged production copy.

`test:wechat --dry-run` remains offline. Any other mode requires `ALLOW_EXTERNAL_SERVICE_TEST=1` and a non-production environment. These external modes are excluded from the automated test suite.

## Verification

Run in an isolated worktree with no production environment files:

```sh
npm ci --cache .npm-cache --no-audit --no-fund
npm run lint
npm test
npm run build
npm run test:web-proxy
```

Verified on Node 24.15.0, npm 11.12.1; Next.js 16.2.10 from the unchanged lockfile.
- `npm test`: internal API security/limits, 15 canonical test groups, first-seen behavior, digest grouping, health reporting and digest reliability.
- `test:canonical`: injected fetch only; fake Supabase configuration; default external fetch blocked. Covers signing, timestamps/nonces, response/error handling, timeout/no POST retry, shared validation, admin-before-ECS authorization, retired webhook, check options and test guards.
- `test:web-proxy`: runs the built Next server and a loopback in-memory ECS fixture with fake signing/admin credentials. It has no database or mail credentials. Exercises actual Next routes and admin rendering, including failures and repeated unsubscribe success.
- Build completed with Supabase, Resend and admin/signing credential variables unset.
- TypeScript no-emit check and `git diff --check` passed.

## Post-deployment writer map (target, not live state)

```text
Supabase
  ↑ ECS /internal/subscribe
  ↑ ECS /internal/unsubscribe
  ↑ root crawler                 PAUSED until separately authorized
  ↑ root scheduled digest        PAUSED until separately authorized
  ↑ root retry                   manual, explicitly controlled
  ↑ protected local test writer  loopback test backend only
Vercel: no direct Supabase business writes
Webhook: disabled
Delta: separate WIP, excluded
Health / WeChat: database readers with separate external side effects
```

Current production was not changed: Vercel still runs the previously audited direct-Supabase version; old root scripts, old API release and credentials remain as before. Do not claim the target writer map is already deployed.

## Deployment plan — NOT EXECUTED

1. Record current Vercel deployment, ECS symlink, configuration and version manifests. Keep cron paused and block manual sends. Retain a code rollback target. Review/retain the existing hardened systemd and TLS nginx configuration; **do not overwrite live configuration with base-commit example templates**.
2. Build a new immutable ECS release from the exact canonical commit and unchanged lockfile, with Supabase still as backend. Point the service at that release only in a separately authorized deployment. Do not touch `/root/HITNotice` or its WIP.
3. Run the read-only health/admin check first on loopback, then public HTTPS. Check the expected release independently; the check reports only status/counts. Require stable Vercel-region → ECS connectivity and ECS → Supabase reads before routing users.
4. Validate subscription mutations in a separate Supabase test project or local Supabase, with email delivery mocked. The protected write-check script only supports loopback. Use synthetic subscriptions and deterministic cleanup in the isolated service integration environment. Do not use actual users for production smoke tests.
5. Deploy Vercel from the same canonical commit with signing/base-URL/admin configuration. Verify deployment SHA, no Supabase imports, public page/invalid-input behavior, admin authorization and signed ECS read routing. A successful build alone is not a production write test. Any controlled production fixture write requires a separate explicit plan and authorization.
6. Confirm all web mutations route through ECS; review old deployment URLs/aliases and rollback behavior so an old direct writer cannot silently remain callable.
7. Only after deployment verification, remove Vercel service-role and other obsolete web credentials, with an agreed treatment of older immutable deployments. Updating project env alone does not prove old deployments lost their embedded credentials. Coordinate credential retirement with rollback.
8. Keep crawler/digest/health cron paused; resuming any job is a separate decision. Do not migrate data or install PostgreSQL during this deployment.

## Phase B readiness

**READY FOR PHASE B — PostgreSQL Repository**, for isolated implementation against this commit. This is not approval for deployment, data migration, production writes or cron resumption.

Remaining risks: Supabase and the ECS cross-border connection remain; subscription associations lack a transaction; public Vercel→ECS routing still needs live regional verification; replay/rate state is process-local; web email ownership behavior is unchanged; old deployment and manual credentials remain until controlled retirement; delta remains WIP. Phase B must preserve identifiers, unsubscribe tokens, delivery idempotency keys/history and digest windows, add atomic transactions, and define a single-writer cutover and rollback strategy.
