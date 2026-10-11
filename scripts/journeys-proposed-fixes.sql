-- Fixes proposed by the w6 journeys stream, for `pnpm check:journeys
-- --with-proposed-fixes` only. Applied to the disposable loopback database to
-- prove what the journeys do once the owning streams land them. Not a
-- migration: nothing here reaches supabase/migrations or any hosted database.
--
-- PostgREST runs STABLE functions in a read-only transaction. Each reader
-- below takes a row lock through its actor check (FOR SHARE / FOR KEY SHARE),
-- so every supabase-js call fails with 25006. They take locks, so they are
-- VOLATILE. Found by scripts/check-readonly-rpcs.mjs.
alter function public.read_operator_queue_context(uuid, text) volatile;
alter function public.read_outside_write_receipts(uuid, text, text, uuid, integer) volatile;
alter function public.read_google_listing_readback_failures volatile;
alter function public.read_business_effort volatile;
alter function public.read_effort_businesses volatile;
alter function public.read_make_real_activation volatile;
alter function public.export_workspace_v3_category(uuid, uuid, text, text, integer, integer) volatile;
alter function public.read_website_current_tenant(uuid, uuid, uuid, text) volatile;
alter function public.read_website_domain_approvals(uuid, uuid, uuid, text) volatile;
alter function public.read_website_linked_publications(uuid, uuid, uuid, text) volatile;
