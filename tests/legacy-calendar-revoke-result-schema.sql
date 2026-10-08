\set ON_ERROR_STOP on
-- Disposable local fixture: true/false compatibility, modern success and
-- retained receipts across the fail-closed rollback and forward reapply.
create function pg_temp.lc_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'legacy calendar assertion failed: %',message; end if; end $$;
create function pg_temp.lc_expect(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'Expected % for %',expected,statement;
end $$;
begin;
insert into public.users(id,email,verified_at) values('fc000000-0000-4000-8000-000000000001','calendar-contract@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values('fc000000-0000-4000-8000-000000000010','customer','Calendar contract','fc000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('fc000000-0000-4000-8000-000000000010','fc000000-0000-4000-8000-000000000001','owner','fc000000-0000-4000-8000-000000000001');
insert into public.workspace_calendar_connections(workspace_id,provider,calendar_id,calendar_name,time_zone,status,created_by,access_token_ciphertext,refresh_token_ciphertext)
  values('fc000000-0000-4000-8000-000000000010','google','fixture','Calendar fixture','UTC','connected','fc000000-0000-4000-8000-000000000001','fictional-access','fictional-refresh');
set local role service_role;
select pg_temp.lc_assert(public.revoke_workspace_calendar_connection('fc000000-0000-4000-8000-000000000010','fc000000-0000-4000-8000-000000000001','google'),'legacy existing row returns true');
select pg_temp.lc_assert(not public.revoke_workspace_calendar_connection('fc000000-0000-4000-8000-000000000010','fc000000-0000-4000-8000-000000000001','outlook'),'legacy absent row returns false');
select pg_temp.lc_assert((public.disconnect_workspace_calendar_connection('fc000000-0000-4000-8000-000000000010','fc000000-0000-4000-8000-000000000001','outlook','no_token',null)->>'disconnected')::boolean,'modern absent row still completes cleanup');
reset role;
select pg_temp.lc_assert((select count(*)=3 from public.provider_disconnect_receipts where workspace_id='fc000000-0000-4000-8000-000000000010'),'every result retains its receipt');
select pg_temp.lc_assert((select status='revoked' and access_token_ciphertext is null and refresh_token_ciphertext is null and token_expires_at is null from public.workspace_calendar_connections where workspace_id='fc000000-0000-4000-8000-000000000010' and provider='google'),'legacy cleanup clears credentials');
commit;
\ir ../supabase/migrations/rollback-20261014120000_legacy_calendar_revoke_result.sql
select pg_temp.lc_expect($$select public.revoke_workspace_calendar_connection('fc000000-0000-4000-8000-000000000010','fc000000-0000-4000-8000-000000000001','google')$$,'legacy_calendar_revoke_rollback_requires_forward_migration');
select pg_temp.lc_assert((select count(*)=3 from public.provider_disconnect_receipts where workspace_id='fc000000-0000-4000-8000-000000000010'),'rollback preserves all receipts');
\ir ../supabase/migrations/20261014120000_legacy_calendar_revoke_result.sql
select pg_temp.lc_assert(public.revoke_workspace_calendar_connection('fc000000-0000-4000-8000-000000000010','fc000000-0000-4000-8000-000000000001','google'),'reapply restores existence boolean for retained revoked row');
select pg_temp.lc_assert((select count(*)=4 from public.provider_disconnect_receipts where workspace_id='fc000000-0000-4000-8000-000000000010'),'reapply keeps prior evidence and appends next receipt');
-- Only this fictional test evidence is removed; other local receipts stay.
delete from public.provider_disconnect_receipts where workspace_id='fc000000-0000-4000-8000-000000000010';
\echo 'Legacy calendar revoke result and receipt rollback checks passed.'
