begin;
set local lock_timeout='2s';
-- Disable the Systems release first. Retain '*' restoration drafts/history;
-- do not restore the old check until these are explicitly reconciled.
drop function if exists public.create_version_system_command(uuid,text,jsonb,text,text,uuid);
drop function if exists public.read_version_binding_choices(uuid,uuid,text);
-- Restore batch 7A's system scope (byte-identical, so 7A's rollback guard
-- still matches): agency workspaces no longer read Versions as members.
create or replace function public.system_actor_scope(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_write boolean,
  out access text, out work_ids uuid[]
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_write then
    access := public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  elsif exists (select 1 from public.workspace_memberships wm
      join public.workspaces w on w.id = wm.workspace_id and w.kind = 'customer'
      where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id)
    or public.provider_seat_role(p_workspace_id, p_user_id, false) is not null then
    access := public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  else
    access := 'agency';
  end if;
  if access <> 'agency' then
    work_ids := null;
    return;
  end if;
  work_ids := public.business_record_agency_work_ids(p_workspace_id, p_user_id, p_verified_email, p_write);
  if cardinality(work_ids) = 0 then raise exception 'business_record_access_denied'; end if;
end;
$$;
commit;
