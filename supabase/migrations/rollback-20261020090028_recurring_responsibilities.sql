-- Manual prepared rollback. Snapshot destruction requires explicit authorization.
begin;
drop trigger if exists responsibility_bundle_job_guard on public.standing_responsibility_jobs;
drop trigger if exists responsibility_bundle_execution_guard on public.saved_product_work;
drop function if exists public.snapshot_due_responsibility_meters(integer);
drop function if exists public.read_responsibility_proof_for_tenant(text,timestamptz,timestamptz);
drop function if exists public.read_responsibility_domain_evidence(uuid,uuid,text,timestamptz,timestamptz);
drop function if exists public.read_responsibility_proof_rows(uuid,uuid,text,timestamptz,timestamptz);
drop function if exists public.read_responsibility_bundle_state(uuid,uuid,text);
drop function if exists public.set_provider_responsibility_cadence(uuid,uuid,text,text);
drop function if exists public.snapshot_responsibility_meter(uuid,uuid,text,date);
drop function if exists public.create_keep_me_found_bundle(uuid,uuid,uuid,uuid,text,text,jsonb,integer,timestamptz);
drop function if exists public.guard_responsibility_bundle_job();
drop function if exists public.guard_responsibility_bundle_execution();
drop function if exists public.responsibility_assert_actor(uuid,uuid,text,boolean);
drop table if exists public.responsibility_meter_capture_attempts;
drop table if exists public.business_responsibility_report_state;
drop table if exists public.responsibility_meter_periods;
drop table if exists public.responsibility_bundle_members;
drop table if exists public.responsibility_bundles;
drop function if exists public.responsibility_immutable();
-- Existing standing policies, finite jobs and native receipts are retained.
commit;
