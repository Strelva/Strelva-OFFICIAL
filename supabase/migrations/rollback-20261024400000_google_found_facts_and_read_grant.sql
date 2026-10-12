-- Rollback for 20261024400000_google_found_facts_and_read_grant.sql.
-- Drops the separate read grant and the agency connect-link read. Stored
-- read-grant tokens are dropped with the table: revoke them at Google first
-- (owner Disconnect) if any row is still connected. Google found facts live in
-- business_found_facts (20261024300000) and are untouched here.
begin;
set local lock_timeout = '3s';
drop function public.agency_google_connect_link(uuid,text,uuid);
drop function public.google_read_grant(uuid,text,uuid,text,jsonb);
drop table public.workspace_google_read_grants;
commit;
