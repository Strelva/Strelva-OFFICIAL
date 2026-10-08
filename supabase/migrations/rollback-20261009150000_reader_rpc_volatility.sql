-- Manual rollback of 20261009150000_reader_rpc_volatility.sql; the non-timestamp
-- name keeps this out of the migration ledger. No rows/bodies/grants change.
-- WARNING: restores the original STABLE declarations and the known PostgREST
-- 25006 failures. This is a reversal artifact, not a working fallback.
-- Hosted execution and migration-ledger repair need separate authorization.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter function public.read_operator_queue_context(uuid, text) stable;
alter function public.read_outside_write_receipts(uuid, text, text, uuid, integer) stable;
alter function public.read_google_listing_readback_failures(uuid, text, integer) stable;
alter function public.read_business_effort(uuid, text, date, uuid) stable;
alter function public.read_effort_businesses(uuid, text) stable;
alter function public.read_make_real_activation(uuid, uuid, text, text) stable;
alter function public.export_workspace_v3_category(uuid, uuid, text, text, integer, integer) stable;
alter function public.read_website_current_tenant(uuid, uuid, uuid, text) stable;
alter function public.read_website_linked_publications(uuid, uuid, uuid, text) stable;
alter function public.read_website_domain_approvals(uuid, uuid, uuid, text) stable;

notify pgrst, 'reload schema';

commit;
