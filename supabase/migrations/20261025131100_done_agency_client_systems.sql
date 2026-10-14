-- Enroll a newly agency-added client under the trusted server Systems policy.
-- Keep canonical client addition, quota, staff/seat authority and replay.
-- A replay never modifies an existing client's release choice or history.
set local lock_timeout = '3s';

create function public.agency_add_client_enrolled(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_input jsonb,
  p_command_id uuid, p_command_digest text, p_systems_enabled boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare addition jsonb; business_id uuid;
begin
  if p_systems_enabled is null then raise exception 'agency_client_release_policy_required'; end if;
  addition := public.agency_add_client(p_user_id, p_verified_email, p_agency_workspace_id,
    p_input, p_command_id, p_command_digest);
  if p_systems_enabled and addition->'replayed' = 'false'::jsonb then
    business_id := (addition->>'customerWorkspaceId')::uuid;
    insert into public.workspace_release_flags(workspace_id, flag, state, revision, changed_by)
      values (business_id, 'systems', 'on', 1, p_user_id);
    insert into public.workspace_release_flag_changes(workspace_id, subject, from_state, to_state, reason, changed_by)
      values (business_id, 'systems', 'unset', 'on',
        'New agency client: inherited server Systems release policy', p_user_id);
  end if;
  return addition;
end;
$$;

revoke all on function public.agency_add_client_enrolled(uuid, text, uuid, jsonb, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.agency_add_client_enrolled(uuid, text, uuid, jsonb, uuid, text, boolean) to service_role;
