# ECS logic and documentation audit — 2026-09-12

This is a dated audit record. Current behavior is documented in README and PAUSE_POLICY.

## Verified baseline

GitHub main was f714f3c. Web f714f3c (1,361 artifact files), API 5f10504 (282 tracked source files), tasks af444c6 (301 tracked source files) all matched their release provenance/hashes. The live API and web had no systemd PartOf/BindsTo/OnFailure coupling to task jobs. The existing dirty checkout was not a runtime source; its eight WIP hashes matched the preserved baseline.

## Finding and change

Health was blocked both by the launcher and the mail guard during PAUSED, and health failure/signal could create a pause. Both gates now have a health-only exception; reporting failure never creates/overwrites global PAUSED. Health reports allowlisted pause metadata. Digest freshness remains nonfatal exit 10. Confirmed pre-claim suppression/subscription-change failures now use nonfatal exit 11 after persisting the run outcome; unknown, DB or send-state failures stay protected. No threshold, schema, delivery history, subscription, or confirmation-email behavior changed.

## Required scenario coverage

| Test | Verification | Result |
|---|---|---|
| 1 primary success, backup one-source failure | Real test-DB crawl history; READY, degraded; launcher exit 0 does not pause | PASS |
| 2 same source fails both crawls | Typed NOT READY and digest exit 10; no delivery claim; launcher no pause | PASS |
| 3 7/26 failures | Threshold classifier fatal; actual systemic crawler nonzero; launcher fatal exit pauses | PASS |
| 4 persistence failure | Actual crawler with test grants revoked; fatal exit; launcher pauses | PASS |
| 5 digest readiness exit 10 | Actual digest CLI plus launcher policy | PASS |
| 6 PAUSED health | Actual launcher metadata; actual health CLI + POST guard with test DB/mock mail; same-day checkpoint blocks repeat | PASS |
| 7 PAUSED crawler | Actual launcher with temporary marker; no child starts | PASS |
| 8 PAUSED digest | Actual launcher with temporary marker; no child starts | PASS |
| 9 web failure | Local built web port-conflict failure; unchanged task state; live unit coupling inspected read-only | PASS |
| 10 API failure | Real local API entry point config failure; unchanged task state; live unit coupling inspected read-only | PASS |

Tests 9/10 are isolated startup failure checks, not production chaos tests or simulated ECS-wide resource exhaustion.

## Validation

- lint: PASS (six pre-existing unused-variable warnings).
- typecheck, npm test, Next.js production build: PASS.
- PostgreSQL: 18 integration groups, disposable local PostgreSQL 17 container.
- Daily workflow: 15 groups, including actual paused-health CLI with simulated pause and mock provider.
- Crawler reliability: 15 cases.
- Launcher reliability: 17 cases, temporary state paths/process doubles.
- Pause report rendering, POST/SQL guard, local service isolation: PASS.

No real provider request or production business task was used in testing. Early test setup issues (external node_modules symlink, mock suppression response and a test environment type) were corrected before the passing runs.

## Deployment scope

Only the task release needs to move to this tested commit, via source archive/manifest and an atomic daily-current switch. Web/API releases, cron, API open mode, API Resend credential and the runtime database write setting remain protected. Post-deployment verification is read-only; no real crawler/digest/health run is part of the release procedure.

## Documentation scope

README now describes ECS/Nginx/Next.js standalone/local API/PostgreSQL 17/systemd/cron/Resend/Let's Encrypt. Schema/testing and crawler guidance were updated. The old email deployment guide is explicitly historical; phase reports and historical Supabase migrations were preserved.

## Remaining limits

Health depends on PostgreSQL and Resend and its daily reservation can prevent a second same-day notification. Fatal pauses still require operator review. Unknown digest errors remain fail-closed; pre-launch configuration or manifest rejection stops the command without creating PAUSED. These are not guarantees of out-of-band alert delivery. Confirmation tracking, synchronous confirmation timeout, resubscribe behavior and historical unsubscribe timestamps remain unchanged.
