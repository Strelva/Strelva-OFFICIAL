-- Rollback for 20261024400000_google_found_facts_and_read_grant.sql.
-- Drops found facts and the separate read grant. Stored read-grant tokens are
-- dropped with the table: revoke them at Google first (owner Disconnect) if
-- any row is still connected. business_facts and Google bindings are untouched.
begin;
set local lock_timeout = '3s';
drop function public.agency_google_connect_link(uuid,text,uuid);
drop function public.google_read_grant(uuid,text,uuid,text,jsonb);
drop function public.settle_google_found_fact(uuid,text,uuid,uuid,text);
drop function public.record_google_found_facts(uuid,text,uuid,text,jsonb);
drop function public.read_google_found_facts(uuid,text,uuid);
drop function public.google_found_fact_member(uuid,text,uuid,boolean);
drop table public.workspace_google_read_grants;
drop table public.business_google_found_facts;
commit;
