alter table public.notices
add column if not exists hash text;

create unique index if not exists notices_hash_key
on public.notices(hash)
where hash is not null;

alter table public.notices
add column if not exists first_seen_at timestamptz default now();

alter table public.notices
add column if not exists source_name text;

alter table public.notices
add column if not exists source_id text;

alter table public.notices
add column if not exists category text;
