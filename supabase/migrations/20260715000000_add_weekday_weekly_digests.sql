begin;

alter table public.subscriptions
  drop constraint if exists subscriptions_frequency_check;

update public.subscriptions
set frequency = 'weekday_digest'
where frequency in ('daily_digest', 'high_frequency');

alter table public.subscriptions
  add constraint subscriptions_frequency_check check (
    frequency in ('weekday_digest', 'weekly_digest')
  );

alter table public.email_deliveries
  drop constraint if exists email_deliveries_digest_type_check;

update public.email_deliveries
set digest_type = 'weekday_digest'
where digest_type = 'daily_digest';

alter table public.email_deliveries
  add constraint email_deliveries_digest_type_check check (
    digest_type in ('weekday_digest', 'weekly_digest')
  );

commit;
