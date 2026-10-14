-- A direct business joins the server's current release selection in the
-- ownership transaction. This is initial enrollment, not an operator override:
-- no existing business, converted tenant, selection or retry is changed.
-- Runtime global kill switches, consent, effect and email gates remain intact.
begin;
set local lock_timeout = '5s';
alter table public.workspace_creation_receipts add column initial_release_flags text[];

create function public.enter_customer_business_with_releases(
  p_user_id uuid, p_verified_email text, p_name text, p_business_id uuid,
  p_request_text text, p_command_id uuid, p_command_digest text,
  p_initial_release_flags text[]
) returns jsonb language plpgsql security definer set search_path = public,pg_temp as $$
declare result jsonb; business_id uuid; release_flag text;
begin
  if p_initial_release_flags is null or array_position(p_initial_release_flags,null) is not null
    or not (p_initial_release_flags <@ public.workspace_release_flag_names()) then
    raise exception 'business_entry_release_flags_invalid';
  end if;
  result := public.enter_customer_business(p_user_id,p_verified_email,p_name,p_business_id,
    p_request_text,p_command_id,p_command_digest);
  if p_business_id is null and (result->>'alreadyCreated')::boolean is false then
    business_id := (result->>'workspaceId')::uuid;
    -- Enrollment is tied to this newly recorded direct creation, not merely
    -- any workspace the caller happens to own. The original RPC holds the
    -- verified user and writes the exact owner and command receipt.
    if not exists(select 1 from public.workspace_creation_receipts r
      join public.workspaces w on w.id=r.workspace_id and w.kind='customer' and w.created_by=p_user_id
      join public.workspace_memberships m on m.workspace_id=w.id and m.user_id=p_user_id and m.role='owner'
      where r.user_id=p_user_id and r.command_id=p_command_id and r.workspace_id=business_id
        and r.command_digest=p_command_digest and r.initial_release_flags is null)
      or exists(select 1 from public.tenant_workspace_links where workspace_id=business_id)
      or exists(select 1 from public.agency_client_additions where customer_workspace_id=business_id) then
      raise exception 'business_entry_release_enrollment_invalid';
    end if;
    for release_flag in select distinct f from unnest(p_initial_release_flags) f order by f loop
      insert into public.workspace_release_flags(workspace_id,flag,state,changed_by)
        values(business_id,release_flag,'on',p_user_id);
      insert into public.workspace_release_flag_changes(workspace_id,subject,from_state,to_state,reason,changed_by)
        values(business_id,release_flag,'unset','on','Direct business signup: inherit globally released capability',p_user_id);
    end loop;
    update public.workspace_creation_receipts set initial_release_flags=p_initial_release_flags
      where user_id=p_user_id and command_id=p_command_id;
  end if;
  return result;
end; $$;
revoke all on function public.enter_customer_business_with_releases(uuid,text,text,uuid,text,uuid,text,text[])
  from public,anon,authenticated;
grant execute on function public.enter_customer_business_with_releases(uuid,text,text,uuid,text,uuid,text,text[])
  to service_role;
commit;
