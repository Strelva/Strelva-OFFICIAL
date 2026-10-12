-- Agency 1.0 batch 7A, issue #252. Follow-up to checksum-pinned batches 0–7.
-- These readers do not insert/update business data, but their authorization
-- paths take FOR SHARE / FOR KEY SHARE row locks. Export reaches those locks
-- through read_business_record/read_business_systems. PostgREST POST RPCs run
-- STABLE functions READ ONLY, so those locks fail with SQLSTATE 25006.
-- VOLATILE preserves the existing checks/locks and selects READ WRITE for POST.
-- Signatures, bodies, search paths, SECURITY DEFINER and grants stay unchanged.
-- See docs/operations/reader-rpc-volatility.md for the inspected call paths.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter function public.read_operator_queue_context(uuid, text) volatile;
alter function public.read_outside_write_receipts(uuid, text, text, uuid, integer) volatile;
alter function public.read_google_listing_readback_failures(uuid, text, integer) volatile;
alter function public.read_business_effort(uuid, text, date, uuid) volatile;
alter function public.read_effort_businesses(uuid, text) volatile;
alter function public.read_make_real_activation(uuid, uuid, text, text) volatile;
alter function public.export_workspace_v3_category(uuid, uuid, text, text, integer, integer) volatile;
alter function public.read_website_current_tenant(uuid, uuid, uuid, text) volatile;
alter function public.read_website_linked_publications(uuid, uuid, uuid, text) volatile;
alter function public.read_website_domain_approvals(uuid, uuid, uuid, text) volatile;

-- Volatility is cached by PostgREST; refresh it when this transaction commits.
notify pgrst, 'reload schema';

commit;
