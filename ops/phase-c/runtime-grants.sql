-- Run as schema owner/migrator, after roles have been provisioned separately.
-- No login/password provisioning in application schema.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO hitnotice_runtime;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM hitnotice_runtime;
GRANT SELECT, INSERT, UPDATE ON public.notices, public.subscriptions,
  public.email_deliveries, public.digest_runs TO hitnotice_runtime;
GRANT SELECT, INSERT, DELETE ON public.subscription_sources TO hitnotice_runtime;
GRANT SELECT, INSERT ON public.crawl_runs TO hitnotice_runtime;
GRANT SELECT ON public.resend_webhook_events TO hitnotice_runtime;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO hitnotice_runtime;
