-- Agency signup inherits the server's global Systems release policy. Creation,
-- owner membership and initial release history succeed or roll back together.
-- This is a service-only signup path, not an agency flag-management grant.
-- Existing workspaces, converted clients and operator decisions are untouched.
set local lock_timeout = '3s';

create function public.create_agency_workspace(
  p_user_id uuid, p_verified_email text, p_name text, p_systems_enabled boolean
) returns setof public.workspaces
language plpgsql security definer set search_path = public, pg_temp as $$
declare created_workspace public.workspaces%rowtype;
begin
  if p_systems_enabled is null then raise exception 'agency_signup_release_policy_required'; end if;

  -- Keep the canonical identity checks, cap, locking and owner creation.
  select * into strict created_workspace from public.create_owned_workspace(
    p_user_id, p_verified_email, 'agency', p_name
  );
  if p_systems_enabled then
    insert into public.workspace_release_flags(workspace_id, flag, state, revision, changed_by)
      values (created_workspace.id, 'systems', 'on', 1, p_user_id);
    insert into public.workspace_release_flag_changes(workspace_id, subject, from_state, to_state, reason, changed_by)
      values (created_workspace.id, 'systems', 'unset', 'on',
        'New agency signup: inherited server Systems release policy', p_user_id);
  end if;
  return next created_workspace;
end;
$$;

revoke all on function public.create_agency_workspace(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.create_agency_workspace(uuid, text, text, boolean) to service_role;
