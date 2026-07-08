create extension if not exists pgcrypto;

alter table public.subscriptions
  add column if not exists unsubscribe_token text,
  add column if not exists unsubscribed_at timestamptz;

update public.subscriptions
set unsubscribe_token = encode(gen_random_bytes(32), 'hex')
where unsubscribe_token is null;

create unique index if not exists subscriptions_unsubscribe_token_key
  on public.subscriptions(unsubscribe_token)
  where unsubscribe_token is not null;
