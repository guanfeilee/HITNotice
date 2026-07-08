# HITnotice Email Production Guide

This document records the production setup for HITnotice daily digest emails.

## Resend setup

1. Create or open the Resend project used by HITnotice.
2. Add the sending domain:
   - `hitnotice.cn`
3. Configure the DNS records shown by Resend:
   - DKIM records
   - SPF record
   - MX record if required by the domain setup
4. Wait until Resend marks the domain as verified.
5. Create a production API key.
6. Set the production sender address, for example:
   - `notice@hitnotice.cn`

Do not commit the Resend API key or the real sender credentials to the repository.

## Required environment variables

Vercel Production environment variables:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
EMAIL_FROM
NEXT_PUBLIC_SITE_URL
```

Recommended production value:

```txt
NEXT_PUBLIC_SITE_URL=https://hitnotice.cn
```

GitHub Actions Repository Secrets:

```txt
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
RESEND_API_KEY
EMAIL_FROM
```

GitHub Actions Repository Variables:

```txt
NEXT_PUBLIC_SITE_URL
```

## GitHub Actions workflow

The daily digest workflow is:

```txt
.github/workflows/daily-digest.yml
```

It runs at:

```txt
UTC 04:00 -> Asia/Shanghai 12:00
UTC 12:00 -> Asia/Shanghai 20:00
```

It can also be triggered manually from GitHub Actions with `workflow_dispatch`.

The workflow must run on Node.js 22 or newer because `@supabase/supabase-js`
requires a native WebSocket implementation in Node.js environments.

## Local verification

Run a local dry run before sending real email:

```sh
npm run send:digest -- --dry-run
```

Dry run behavior:

- reads real Supabase data
- builds digest payloads
- prints aggregate counts only
- does not call Resend
- does not write `email_deliveries`
- does not print recipient email addresses

Production send command:

```sh
npm run send:digest
```

Production logs must only contain aggregate counts such as:

```txt
Digest run summary: users=3, notices=1, sent=3, failed=0, skipped=0
```

## Database migrations

Required migrations:

```txt
supabase/migrations/20260708000000_email_deliveries.sql
supabase/migrations/20260708010000_standardize_source_ids.sql
```

`email_deliveries` is required for delivery audit records and idempotency.
The source ID standardization migration is required so `subscription_sources.source_id`
can match `notices.source_id`.

Do not run migrations from the application runtime. Apply them through the
Supabase Dashboard SQL Editor or the approved deployment process.

## Common errors

### Node.js WebSocket error

Error:

```txt
Node.js detected but native WebSocket not found.
Suggested solution: Ensure you are running Node.js 22+
```

Fix:

- Set GitHub Actions `actions/setup-node` to `node-version: 22`.
- Use a Vercel Node.js runtime that supports the current dependency stack.

### Resend testing mode

Symptoms:

- Resend rejects recipients outside the verified testing address.
- API response mentions testing mode or restricted recipients.

Fix:

- Verify the sending domain in Resend.
- Use a sender address under the verified domain.
- Use a production Resend API key.

### Sender domain or DNS not verified

Symptoms:

- Resend returns a domain verification or sender validation error.
- Emails are not accepted for delivery.

Fix:

- Confirm Resend shows the domain as verified.
- Check DKIM/SPF/MX DNS records.
- Confirm `EMAIL_FROM` uses the verified domain.

### Supabase migration missing

Symptoms:

- Send script fails when reading or writing `email_deliveries`.
- Digest contains no matching notices even though subscriptions exist.

Fix:

- Confirm `public.email_deliveries` exists.
- Confirm source IDs in `subscription_sources` and `notices` use the standard registry values.
- Apply the required migrations if they have not been applied.
