# Contributing

Thank you for your interest in HITnotice. This project is maintained as a focused campus notification aggregation and email alert service.

## Reporting Issues

Use GitHub Issues to report bugs or operational problems. Please include:

- A clear description of the problem
- The page, source, command, or workflow affected
- The expected behavior
- The actual behavior
- Relevant logs or screenshots with private information removed

Do not include API keys, service-role keys, personal email addresses, or private production configuration.

## Suggesting Improvements

Suggestions are welcome when they stay within the project scope:

- Public campus announcement aggregation
- Subscription-based notification delivery
- Email digest reliability
- Source health monitoring
- Deployment and operational documentation

Please avoid proposing features that require private university systems, login-protected content, or personal user data beyond email subscription delivery.

## Development Setup

Install dependencies:

```bash
npm install
```

Create a local environment file from `.env.example` and fill in local development values. Never commit real credentials.

Run checks before submitting changes:

```bash
npm run lint
npm run build
```

For crawler work, use dry-run mode first:

```bash
npm run crawl:notices -- --dry-run
```

Keep changes focused and avoid unrelated refactors in the same pull request.
