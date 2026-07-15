# HITnotice Email Production Guide

This document records the production setup for HITnotice weekday and weekly digest emails.

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

The Vercel web application and Alibaba Cloud ECS scheduled jobs use the following
production environment variables as required by their respective runtime paths:

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

## Alibaba Cloud ECS cron schedule

Production scheduling is handled by cron on Alibaba Cloud ECS. HITnotice does
not use GitHub Actions for scheduled production jobs.

The current root crontab is:

```cron
45 19 * * 1-5 cd /root/HITNotice && npm run crawl:notices
50 19 * * 1-5 cd /root/HITNotice && npm run crawl:notices
00 20 * * 1-5 cd /root/HITNotice && npm run send:digest
10 20 * * 1-5 cd /root/HITNotice && npm run health:report
```

- The crawler fetches notices on weekday evenings before digest delivery.
- The digest command runs at 20:00 Beijing time from Monday through Friday.
- The health report runs at 20:10 Beijing time after digest execution.
- On Monday through Thursday, the digest command processes `weekday_digest`.
- On Friday, the same command processes both `weekday_digest` and `weekly_digest`.

## Digest types and notification logic

HITnotice supports two user-selectable digest frequencies:

- `weekday_digest`: sent Monday through Friday at 20:00 Beijing time, using the
  workday digest window.
- `weekly_digest`: sent every Friday at 20:00 Beijing time, using the weekly
  digest window.

Notices and delivery windows follow these rules:

- A stable hash is used to deduplicate notices.
- `first_seen_at` determines when a notice was newly discovered and whether it
  belongs to a digest window.
- `published_at` is not used to determine digest increments.
- `email_deliveries` stores independent delivery history for each `digest_type`,
  so weekday and weekly delivery windows do not affect each other.

## Dry-run verification

Verify each digest type without sending email:

```sh
npm run send:digest -- --dry-run --type=weekday_digest
npm run send:digest -- --dry-run --type=weekly_digest
```

Dry-run behavior:

- reads real Supabase data
- builds digest payloads
- prints aggregate counts only
- does not call Resend
- does not send email
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
supabase/migrations/20260715000000_add_weekday_weekly_digests.sql
```

`email_deliveries` is required for delivery audit records and idempotency.
The source ID standardization migration is required so `subscription_sources.source_id`
can match `notices.source_id`. The weekday/weekly migration updates the supported
subscription frequencies and delivery types.

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

- Use Node.js 22 or newer for the ECS scheduled-job runtime.
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
