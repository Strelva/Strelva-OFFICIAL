begin;
set local lock_timeout = '2s';
-- Turn STRELVA_OPERATOR_QUEUE_RELEASE off first. History remains untouched.
drop function if exists public.agency_client_overview_v2(uuid,uuid,text,uuid,integer);
commit;
