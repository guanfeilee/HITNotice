create extension if not exists pgcrypto;

create table if not exists public.notices (
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

create unique index if not exists notices_hash_key
  on public.notices(hash);

create index if not exists notices_source_id_idx
  on public.notices(source_id);

create index if not exists notices_published_at_idx
  on public.notices(published_at desc);

create index if not exists notices_category_idx
  on public.notices(category);

create index if not exists notices_first_seen_at_idx
  on public.notices(first_seen_at desc);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  frequency text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_email_not_blank check (length(trim(email)) > 0),
  constraint subscriptions_frequency_check check (
    frequency in ('weekday_digest', 'weekly_digest')
  ),
  constraint subscriptions_status_check check (
    status in ('active', 'unsubscribed')
  ),
  constraint subscriptions_email_unique unique (email)
);

create table if not exists public.subscription_sources (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  source_id text not null,
  created_at timestamptz not null default now(),
  constraint subscription_sources_source_id_not_blank check (length(trim(source_id)) > 0),
  constraint subscription_sources_unique unique (subscription_id, source_id)
);

create index if not exists subscription_sources_subscription_id_idx
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
