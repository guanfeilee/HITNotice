BEGIN;
-- PostgreSQL 17 native gen_random_uuid(); no platform extensions.

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  url text not null,
  source_id text not null,
  source_name text not null,
  category text not null,
  published_at timestamptz,
  first_seen_at timestamptz not null default now(),
  hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notices_title_not_blank check (length(trim(title)) > 0),
  constraint notices_url_not_blank check (length(trim(url)) > 0),
  constraint notices_source_id_not_blank check (length(trim(source_id)) > 0),
  constraint notices_source_name_not_blank check (length(trim(source_name)) > 0),
  constraint notices_category_not_blank check (length(trim(category)) > 0),
  constraint notices_hash_not_blank check (length(trim(hash)) > 0)
);

create unique index notices_hash_key
  on public.notices(hash);

create index notices_source_id_idx
  on public.notices(source_id);

create index notices_published_at_idx
  on public.notices(published_at desc);

create index notices_category_idx
  on public.notices(category);

create index notices_first_seen_at_idx
  on public.notices(first_seen_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  frequency text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unsubscribe_token text,
  unsubscribed_at timestamptz,
  constraint subscriptions_email_not_blank check (length(trim(email)) > 0),
  constraint subscriptions_frequency_check check (
    frequency in ('weekday_digest', 'weekly_digest')
  ),
  constraint subscriptions_status_check check (
    status in ('active', 'unsubscribed')
  ),
  constraint subscriptions_email_unique unique (email)
);

create table public.subscription_sources (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  source_id text not null,
  created_at timestamptz not null default now(),
  constraint subscription_sources_source_id_not_blank check (length(trim(source_id)) > 0),
  constraint subscription_sources_unique unique (subscription_id, source_id)
);

create index subscription_sources_subscription_id_idx
  on public.subscription_sources(subscription_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row
execute function public.set_updated_at();

drop trigger if exists notices_set_updated_at on public.notices;

create trigger notices_set_updated_at
before update on public.notices
for each row
execute function public.set_updated_at();
create table public.email_deliveries (
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
  resend_email_id text,
  idempotency_key text not null,
  accepted_at timestamptz,
  delivered_at timestamptz,
  last_event_at timestamptz,
  processing_started_at timestamptz,
  attempt_count integer not null default 0,
  last_attempt_duration_ms integer,
  http_status integer,
  error_details jsonb,
  resend_response jsonb,
  webhook_details jsonb,
  updated_at timestamptz not null default now(),
  constraint email_deliveries_attempt_count_check check (attempt_count >= 0),
  constraint email_deliveries_duration_check check (last_attempt_duration_ms is null or last_attempt_duration_ms >= 0),
  constraint email_deliveries_http_status_check check (http_status is null or (http_status >= 100 and http_status <= 599)),
  constraint email_deliveries_digest_type_check check (
    digest_type in ('weekday_digest', 'weekly_digest')
  ),
  constraint email_deliveries_status_check check (
    status in ('pending', 'accepted', 'sent', 'delivered', 'suppressed', 'bounced', 'complained', 'failed', 'skipped')
  ),
  constraint email_deliveries_notice_count_check check (notice_count >= 0),
  constraint email_deliveries_period_check check (period_start < period_end)
);

create index email_deliveries_subscription_id_idx
  on public.email_deliveries(subscription_id);

create index email_deliveries_period_idx
  on public.email_deliveries(period_start, period_end);

create index email_deliveries_status_idx
  on public.email_deliveries(status);

create unique index email_deliveries_subscription_digest_period_key
  on public.email_deliveries(subscription_id, digest_type, period_start, period_end);
create unique index email_deliveries_idempotency_key_key
  on public.email_deliveries(idempotency_key);

create unique index email_deliveries_resend_email_id_key
  on public.email_deliveries(resend_email_id)
  where resend_email_id is not null;

create table public.resend_webhook_events (
  id uuid primary key default gen_random_uuid(),
  svix_id text not null,
  event_type text not null,
  resend_email_id text not null,
  event_created_at timestamptz not null,
  processed_at timestamptz,
  processing_result text,
  created_at timestamptz not null default now(),
  constraint resend_webhook_events_svix_id_not_blank check (length(trim(svix_id)) > 0),
  constraint resend_webhook_events_type_not_blank check (length(trim(event_type)) > 0),
  constraint resend_webhook_events_email_id_not_blank check (length(trim(resend_email_id)) > 0)
);

create unique index resend_webhook_events_svix_id_key
  on public.resend_webhook_events(svix_id);

create index resend_webhook_events_email_id_idx
  on public.resend_webhook_events(resend_email_id);




create table public.digest_runs (
  id uuid primary key default gen_random_uuid(),
  digest_type text not null,
  run_kind text not null default 'scheduled',
  period_start timestamptz not null,
  period_end timestamptz not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  users integer not null default 0,
  recipients integer not null default 0,
  skipped integer not null default 0,
  blocked integer not null default 0,
  failed integer not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint digest_runs_digest_type_check check (
    digest_type in ('weekday_digest', 'weekly_digest')
  ),
  constraint digest_runs_run_kind_check check (
    run_kind in ('scheduled', 'retry')
  ),
  constraint digest_runs_status_check check (
    status in ('running', 'success', 'partial_success', 'failed')
  ),
  constraint digest_runs_period_check check (period_start < period_end),
  constraint digest_runs_finished_at_check check (
    finished_at is null or finished_at >= started_at
  ),
  constraint digest_runs_users_check check (users >= 0),
  constraint digest_runs_recipients_check check (recipients >= 0 and recipients <= users),
  constraint digest_runs_skipped_check check (skipped >= 0 and skipped <= users),
  constraint digest_runs_blocked_check check (blocked >= 0 and blocked <= users),
  constraint digest_runs_failed_check check (failed >= 0 and failed <= users),
  constraint digest_runs_classified_users_check check (
    recipients + skipped + blocked <= users
  )
);

create unique index digest_runs_scheduled_period_key
  on public.digest_runs(digest_type, run_kind, period_start, period_end);

create index digest_runs_type_kind_period_end_idx
  on public.digest_runs(digest_type, run_kind, period_end desc);

create index digest_runs_status_started_at_idx
  on public.digest_runs(status, started_at desc);

drop trigger if exists digest_runs_set_updated_at on public.digest_runs;

create trigger digest_runs_set_updated_at
before update on public.digest_runs
for each row
execute function public.set_updated_at();


create table public.crawl_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null,
  source_name text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  status text not null,
  http_status integer,
  found_count integer not null default 0,
  new_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  constraint crawl_runs_status_check check (
    status in ('success', 'failed')
  ),
  constraint crawl_runs_period_check check (started_at <= finished_at),
  constraint crawl_runs_http_status_check check (
    http_status is null or (http_status >= 100 and http_status <= 599)
  ),
  constraint crawl_runs_found_count_check check (found_count >= 0),
  constraint crawl_runs_new_count_check check (new_count >= 0)
);

create index crawl_runs_source_started_at_idx
  on public.crawl_runs(source_id, started_at desc);

create index crawl_runs_status_idx
  on public.crawl_runs(status);

create unique index subscriptions_unsubscribe_token_key on public.subscriptions(unsubscribe_token) where unsubscribe_token is not null;
COMMIT;
