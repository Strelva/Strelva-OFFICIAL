-- #601 rollback restores the exact deployed legacy compatibility guard.
-- Restore the deployed legacy row-existed boolean without discarding the
-- newer disconnect command's cleanup result or durable provider receipt.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
create or replace function public.revoke_workspace_calendar_connection(
  p_workspace_id uuid, p_user_id uuid, p_provider text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  v_result := public.disconnect_workspace_calendar_connection(
    p_workspace_id, p_user_id, p_provider, 'not_attempted', 'revocation_not_requested');
  -- Derive the legacy row-existed boolean from the receipt's cleared stores.
  -- Cleanup completion and its durable receipt also cover an absent row.
  return coalesce((v_result->'clearedStores') ? 'workspace_calendar_connections', false);
end;
$$;
revoke all on function public.revoke_workspace_calendar_connection(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.revoke_workspace_calendar_connection(uuid,uuid,text) to service_role;
commit;
