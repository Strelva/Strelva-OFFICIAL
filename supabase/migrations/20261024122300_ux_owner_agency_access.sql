-- A7: Change an existing agency's areas and level by proposal and acceptance.
-- Preserve active authority during review, and reserve Full control against
-- other agencies across both active grants and pending proposals.
begin;
set local lock_timeout = '5s';
lock table public.agency_scope_grants in access exclusive mode;

alter function public.bring_in_agency(uuid,text,uuid,uuid,jsonb,text) rename to bring_in_agency_before_ux_owner_access;
alter function public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean) rename to respond_to_agency_proposal_before_ux_owner_access;
revoke all on function public.bring_in_agency_before_ux_owner_access(uuid,text,uuid,uuid,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.respond_to_agency_proposal_before_ux_owner_access(uuid,text,uuid,uuid,boolean) from public,anon,authenticated,service_role;

drop index public.agency_scope_grants_one_open_idx;
drop index public.agency_scope_grants_one_full_control_idx;
create unique index agency_scope_grants_one_open_idx on public.agency_scope_grants(customer_workspace_id,agency_workspace_id,scope,status)
  where status in ('proposed','active');
create unique index agency_scope_grants_one_full_control_idx on public.agency_scope_grants(customer_workspace_id,scope,status)
  where level = 'full_control' and status in ('proposed','active');

create function public.agency_scope_grants_assert_full_control() returns trigger
language plpgsql security definer set search_path = public,pg_temp as $$
begin
  if new.level = 'full_control' and new.status in ('proposed','active') then
    perform pg_advisory_xact_lock(hashtextextended(new.customer_workspace_id::text,7415));
    if exists (select 1 from public.agency_scope_grants g where g.customer_workspace_id = new.customer_workspace_id
      and g.scope = new.scope and g.level = 'full_control' and g.status in ('proposed','active')
      and g.agency_workspace_id <> new.agency_workspace_id and g.id <> new.id) then
      raise exception 'agency_scope_taken';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.agency_scope_grants_assert_full_control() from public,anon,authenticated,service_role;
create trigger agency_scope_grants_full_control_boundary before insert or update on public.agency_scope_grants
  for each row execute function public.agency_scope_grants_assert_full_control();

create function public.bring_in_agency(p_user_id uuid, p_verified_email text, p_business_id uuid, p_agency_id uuid, p_scopes jsonb, p_consent text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare item jsonb; v_scope text; v_level text; seen text[] := '{}';
begin
  perform public.provider_seat_assert_owner(p_business_id, p_user_id, p_verified_email);
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 7415));
  if public.workspace_exit_completed(p_business_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if not exists (select 1 from public.agency_directory_listings l join public.workspaces w on w.id = l.agency_workspace_id and w.kind = 'agency'
      where l.agency_workspace_id = p_agency_id)
    and not exists (select 1 from public.provider_seats where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status = 'active') then
    raise exception 'agency_not_listed';
  end if;
  if jsonb_typeof(p_scopes) is distinct from 'array' or jsonb_array_length(p_scopes) not between 1 and 5 then raise exception 'agency_scopes_invalid'; end if;
  if p_consent is null or char_length(btrim(p_consent)) not between 1 and 2000 then raise exception 'agency_consent_required'; end if;
  update public.agency_scope_grants set status = 'ended', ended_by = p_user_id, ended_at = clock_timestamp()
    where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status = 'proposed';
  for item in select * from jsonb_array_elements(p_scopes) loop
    v_scope := item->>'scope'; v_level := item->>'level';
    if v_scope is null or v_level is null or v_scope not in ('website','inquiries','bookings','google','internal_tools')
      or v_level not in ('prepare','full_control') or v_scope = any(seen) then raise exception 'agency_scopes_invalid'; end if;
    seen := seen || v_scope;
    -- Active grants remain unchanged until the complete replacement is accepted.
    insert into public.agency_scope_grants(customer_workspace_id, agency_workspace_id, scope, level, consent, proposed_by)
      values (p_business_id, p_agency_id, v_scope, v_level, btrim(p_consent), p_user_id);
  end loop;
  return public.read_business_agencies(p_user_id, p_verified_email, p_business_id);
exception when unique_violation then
  raise exception 'agency_scope_taken';
end;
$$;

create function public.respond_to_agency_proposal(p_user_id uuid, p_verified_email text, p_agency_id uuid, p_business_id uuid, p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare proposer uuid; seat_exists boolean;
begin
  perform public.agency_directory_assert_manager(p_agency_id, p_user_id, p_verified_email);
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 7415));
  select proposed_by into proposer from public.agency_scope_grants
    where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status = 'proposed'
    order by proposed_at limit 1 for update;
  if proposer is null then raise exception 'agency_proposal_not_found'; end if;
  if public.workspace_exit_completed(p_business_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if not p_accept then
    update public.agency_scope_grants set status = 'declined', responded_by = p_user_id, responded_at = clock_timestamp()
      where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status = 'proposed';
    return jsonb_build_object('status', 'declined');
  end if;
  -- This is a complete replacement: omitted areas end only on acceptance.
  update public.agency_scope_grants old set status = 'ended', ended_by = p_user_id, ended_at = clock_timestamp()
    where old.customer_workspace_id = p_business_id and old.agency_workspace_id = p_agency_id and old.status = 'active';
  update public.agency_scope_grants set status = 'active', responded_by = p_user_id, responded_at = clock_timestamp()
    where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status = 'proposed';
  select exists (select 1 from public.provider_seats where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status = 'active') into seat_exists;
  if not seat_exists then
    insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by)
      values (p_business_id, p_agency_id, 'owner', proposer);
  end if;
  if not exists (select 1 from public.workspace_providers where customer_workspace_id = p_business_id and status = 'active') then
    insert into public.workspace_providers(customer_workspace_id, provider_workspace_id, source, started_by)
      values (p_business_id, p_agency_id, 'business_choice', proposer);
  end if;
  return jsonb_build_object('status', 'accepted');
end;
$$;

revoke all on function public.bring_in_agency(uuid,text,uuid,uuid,jsonb,text) from public,anon,authenticated;
revoke all on function public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.bring_in_agency(uuid,text,uuid,uuid,jsonb,text) to service_role;
grant execute on function public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean) to service_role;
commit;
