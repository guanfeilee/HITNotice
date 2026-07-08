create table if not exists public.crawl_runs (
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

create index if not exists crawl_runs_source_started_at_idx
  on public.crawl_runs(source_id, started_at desc);

create index if not exists crawl_runs_status_idx
  on public.crawl_runs(status);
