create table if not exists public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  digest_type text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  notice_count integer not null default 0,
  status text not null default 'pending',
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  constraint email_deliveries_digest_type_check check (
    digest_type in ('daily_digest')
  ),
  constraint email_deliveries_status_check check (
    status in ('pending', 'sent', 'failed', 'skipped')
  ),
  constraint email_deliveries_notice_count_check check (notice_count >= 0),
  constraint email_deliveries_period_check check (period_start < period_end)
);

create index if not exists email_deliveries_subscription_id_idx
  on public.email_deliveries(subscription_id);

create index if not exists email_deliveries_period_idx
  on public.email_deliveries(period_start, period_end);

create index if not exists email_deliveries_status_idx
  on public.email_deliveries(status);

create unique index if not exists email_deliveries_subscription_digest_period_key
  on public.email_deliveries(subscription_id, digest_type, period_start, period_end);
