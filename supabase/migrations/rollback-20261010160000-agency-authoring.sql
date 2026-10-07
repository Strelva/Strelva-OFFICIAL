begin;
set local lock_timeout = '2s';
drop function if exists public.record_version_preparation(uuid,uuid,text,uuid,bigint,uuid);
drop function if exists public.publish_agency_package(uuid,uuid,text,uuid,integer,jsonb);
drop function if exists public.require_agency_authoring_scope(uuid,uuid,uuid,text);
-- Export these append-only receipts before an explicitly approved rollback.
drop table if exists public.system_version_preparations;
drop table if exists public.agency_package_commands;
commit;
