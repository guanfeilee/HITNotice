# HITNotice

HITNotice is an unofficial email notification service for public notice channels at Harbin Institute of Technology.

It helps users follow selected public information sources and receive weekday evening email digests instead of manually checking multiple notice pages.

## Features

- Tracks selected public notice channels from HIT
- Supports source-based email subscriptions
- Sends weekday evening digest emails
- Sends a confirmation email after the first successful subscription
- Provides one-click unsubscribe links
- Records crawler health status for each source
- Runs scheduled crawler and digest jobs through GitHub Actions

## Current Coverage

HITNotice currently covers selected public information channels related to the Harbin campus of Harbin Institute of Technology.

The supported sources may change over time. See the [Sources page](https://hitnotice.cn/sources) for the current list of channels.

## How It Works

```text
Public notice pages
        |
        v
Scheduled crawler
        |
        v
Supabase database
        |
        v
Digest generation
        |
        v
Email delivery via Resend
```

The scheduled crawler checks publicly accessible notice pages and stores new or updated notices in Supabase. HITNotice then generates digests for active subscriptions and sends them through Resend.

## Tech Stack

- Next.js
- TypeScript
- Supabase
- GitHub Actions
- Resend
- Vercel

## Deployment

The production service uses:

- Vercel for the web application
- Supabase for data storage
- GitHub Actions for scheduled crawling and digest jobs
- Resend for email delivery

## Environment Variables

The following environment variables are required:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
EMAIL_FROM=
NEXT_PUBLIC_SITE_URL=
```

Do not commit real environment variable values to the repository.

## Local Development

Install dependencies:

```bash
npm install
```

Run project checks:

```bash
npm run lint
npm run build
```

Run the crawler without writing to the database:

```bash
npm run crawl:notices -- --dry-run
```

Generate digests without sending emails or writing delivery records:

```bash
npm run send:digest -- --dry-run
```

## Privacy

HITNotice only stores the email address and subscription preferences required to send email digests. It does not collect real names, student IDs, phone numbers, campus card numbers, or unified identity authentication information.

HITNotice only aggregates publicly accessible notice pages and does not access private or login-protected content.

## Author

Guanfei Li<br>
Harbin Institute of Technology<br>
HITnotice is an independent student-built project developed by Guanfei Li.<br>
It is not affiliated with, endorsed by, or operated by Harbin Institute of Technology.

## Disclaimer

HITNotice is an independent student-built project and is not affiliated with, endorsed by, or operated by Harbin Institute of Technology.

All notices are sourced from publicly accessible web pages. Users should always refer to the original official pages for authoritative information.

## License

License information has not yet been specified.
