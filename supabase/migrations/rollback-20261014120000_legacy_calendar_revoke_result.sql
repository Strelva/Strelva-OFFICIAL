-- A code rollback must not restore the known always-true legacy result or
-- discard disconnect receipts. Pause this legacy entry point until forward
-- correction is reapplied; the newer disconnect command remains available.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
create or replace function public.revoke_workspace_calendar_connection(
  p_workspace_id uuid, p_user_id uuid, p_provider text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.workspace_require(p_workspace_id,p_user_id,'manage_calendar');
  raise exception 'legacy_calendar_revoke_rollback_requires_forward_migration';
end;
$$;
revoke all on function public.revoke_workspace_calendar_connection(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.revoke_workspace_calendar_connection(uuid,uuid,text) to service_role;
commit;
