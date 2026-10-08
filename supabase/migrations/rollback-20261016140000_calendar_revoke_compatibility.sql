begin;

create or replace function public.revoke_workspace_calendar_connection(
  p_workspace_id uuid,
  p_user_id uuid,
  p_provider text
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_result jsonb;
begin
  v_result := public.disconnect_workspace_calendar_connection(
    p_workspace_id, p_user_id, p_provider, 'not_attempted', 'revocation_not_requested');
  return coalesce((v_result->>'disconnected')::boolean, false);
end;
$$;

commit;
