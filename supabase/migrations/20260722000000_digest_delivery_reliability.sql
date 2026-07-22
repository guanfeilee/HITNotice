begin;

alter table public.email_deliveries
  add column if not exists resend_email_id text,
  add column if not exists idempotency_key text,
  add column if not exists accepted_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists last_event_at timestamptz,
  add column if not exists processing_started_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_duration_ms integer,
  add column if not exists http_status integer,
  add column if not exists error_details jsonb,
  add column if not exists resend_response jsonb,
  add column if not exists webhook_details jsonb,
  add column if not exists updated_at timestamptz not null default now();

update public.email_deliveries
set idempotency_key = 'digest/' || encode(
  digest(
    concat_ws(
      ':',
      digest_type,
      subscription_id::text,
      to_char(period_start at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      to_char(period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    ),
    'sha256'
  ),
  'hex'
)
where idempotency_key is null;

update public.email_deliveries
set accepted_at = sent_at
where accepted_at is null and sent_at is not null;

alter table public.email_deliveries
  alter column idempotency_key set not null;

alter table public.email_deliveries
  drop constraint if exists email_deliveries_status_check;

alter table public.email_deliveries
  add constraint email_deliveries_status_check check (
    status in (
      'pending',
      'accepted',
      'sent',
      'delivered',
      'suppressed',
      'bounced',
      'complained',
      'failed',
      'skipped'
    )
  ),
  add constraint email_deliveries_attempt_count_check check (attempt_count >= 0),
  add constraint email_deliveries_duration_check check (
    last_attempt_duration_ms is null or last_attempt_duration_ms >= 0
  ),
  add constraint email_deliveries_http_status_check check (
    http_status is null or (http_status >= 100 and http_status <= 599)
  );

create unique index if not exists email_deliveries_idempotency_key_key
  on public.email_deliveries(idempotency_key);

create unique index if not exists email_deliveries_resend_email_id_key
  on public.email_deliveries(resend_email_id)
  where resend_email_id is not null;

create table if not exists public.resend_webhook_events (
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

create unique index if not exists resend_webhook_events_svix_id_key
  on public.resend_webhook_events(svix_id);

create index if not exists resend_webhook_events_email_id_idx
  on public.resend_webhook_events(resend_email_id);

commit;
