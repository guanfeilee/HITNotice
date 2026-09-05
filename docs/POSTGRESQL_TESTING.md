# Isolated PostgreSQL 17 verification

These commands are for a disposable localhost container only. Do not use any production environment file, URL, account, exported data or mail credentials. The hardcoded values below are test-only, not production secrets.

```sh
docker run --name hitnotice-phase-b-test \
  -e POSTGRES_PASSWORD=isolated-test-only -e POSTGRES_DB=hitnotice_test \
  -p 127.0.0.1:55432:5432 -d postgres:17
npm ci --cache .npm-cache --no-audit --no-fund
npm run lint
npm run typecheck
npm test
npm run build
npm run test:web-proxy
NODE_ENV=test ALLOW_TEST_DATABASE_RESET=1 \
  DATABASE_URL=postgresql://hitnotice_runtime:isolated-runtime-only@127.0.0.1:55432/hitnotice_test \
  TEST_DATABASE_ADMIN_URL=postgresql://postgres:isolated-test-only@127.0.0.1:55432/hitnotice_test \
  npm run test:db
```

The test suite requires exact NODE_ENV=test, ALLOW_TEST_DATABASE_RESET=1, non-production VERCEL_ENV, PostgreSQL URL scheme, loopback host, database name hitnotice_test (or a lowercase underscore suffix), no query-string connection overrides, same admin/runtime host and database, runtime username hitnotice_runtime, and server major 17. No `.env` is loaded. It refuses before connecting when opt-in/address checks fail.

The opted-in suite **drops/recreates the test public schema**, provisions test roles, applies the canonical baseline as owner, and applies the separate runtime grants. It truncates all seven business tables before fixture phases and in finally, then closes both pools/connections. The role/bootstrap and reset code is confined to this guarded test script. Synthetic rows never come from an export. Historical table inserts use the fixture administrator; runtime has read-only access to that table. Normal business tests run as hitnotice_runtime.

`npm test` is offline unit/security/business regression, including mock mail delivery and retry dry-run protection. `test:web-proxy` starts built Next.js and a mock signed API on loopback, with no database/email credentials. `test:db` uses the actual PostgreSQL repositories, mocked Resend, real concurrent connections, constraints, rollback, serialization failure and deadlock. It never imports a production sender CLI. Final performance output is `POSTGRESQL_TEST_RESULTS.json`; these single-machine sanity timings are not a latency SLO or production capacity guarantee.

After testing, stop the disposable container with `docker stop hitnotice-phase-b-test`. It contains only the empty schema/test roles after successful cleanup. To rerun it later, use `docker start hitnotice-phase-b-test`; the suite recreates its schema. No production setup command is authorized by this testing guide.
