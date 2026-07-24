begin;

create table if not exists public.digest_runs (
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

create unique index if not exists digest_runs_scheduled_period_key
  on public.digest_runs(digest_type, run_kind, period_start, period_end);

create index if not exists digest_runs_type_kind_period_end_idx
  on public.digest_runs(digest_type, run_kind, period_end desc);

create index if not exists digest_runs_status_started_at_idx
  on public.digest_runs(status, started_at desc);

alter table public.digest_runs enable row level security;

revoke all on table public.digest_runs from anon, authenticated;
grant select, insert, update on table public.digest_runs to service_role;

drop trigger if exists digest_runs_set_updated_at on public.digest_runs;

create trigger digest_runs_set_updated_at
before update on public.digest_runs
for each row
execute function public.set_updated_at();

commit;
