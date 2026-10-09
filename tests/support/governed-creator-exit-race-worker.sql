\set ON_ERROR_STOP on
set application_name='governed_creator_exit_worker';
begin;
select public.register_governed_creator_listing('d1720000-0000-4000-8000-000000000002','gm-operator@example.test',jsonb_build_object('workspaceId','d1720000-0000-4000-8000-000000000020','sourceRevisionId',source_revision_id,'agreementVersion','fictional-gm-written-agreement','rateReference','fictional-gm-written-rate')) from public.offering_package_sources where definition_id='private_staff_requests' and definition_version='1.0.0';
commit;
-- Expected nonzero raw psql exit, SQL error workspace_exit_future_work_blocked, no listing.
