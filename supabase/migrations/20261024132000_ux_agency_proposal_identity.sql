-- AG4: accept only the exact immutable access proposal the agency reviewed.
-- Existing pending rows gain an identity without inventing historical consent.
begin;
set local lock_timeout = '5s';
lock table public.agency_scope_grants in access exclusive mode;

alter function public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean) rename to respond_to_agency_proposal_before_ux_agency_identity;
alter function public.read_agency_proposals(uuid,text,uuid) rename to read_agency_proposals_before_ux_agency_identity;
revoke all on function public.respond_to_agency_proposal_before_ux_agency_identity(uuid,text,uuid,uuid,boolean),
  public.read_agency_proposals_before_ux_agency_identity(uuid,text,uuid) from public,anon,authenticated,service_role;

create function public.agency_proposal_identity(p_business_id uuid,p_agency_id uuid) returns text
language sql stable security definer set search_path = public,pg_temp as $$
  select encode(pg_catalog.sha256(convert_to(jsonb_agg(jsonb_build_array(
    g.id,g.customer_workspace_id,g.agency_workspace_id,g.scope,g.level,g.consent,g.proposed_by,
    extract(epoch from g.proposed_at)) order by g.id)::text,'UTF8')),'hex')
  from public.agency_scope_grants g
  where g.customer_workspace_id = p_business_id and g.agency_workspace_id = p_agency_id and g.status = 'proposed'
$$;
revoke all on function public.agency_proposal_identity(uuid,uuid) from public,anon,authenticated,service_role;

-- Lifecycle fields may change. The reviewed owner, terms and row identities
-- cannot: changed access always creates replacement rows through bring_in_agency.
create function public.agency_proposal_immutable_guard() returns trigger
language plpgsql security definer set search_path = public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.customer_workspace_id::text,7415));
  if tg_op = 'UPDATE' and row(new.id,new.customer_workspace_id,new.agency_workspace_id,new.scope,new.level,new.consent,new.proposed_by,new.proposed_at)
      is distinct from row(old.id,old.customer_workspace_id,old.agency_workspace_id,old.scope,old.level,old.consent,old.proposed_by,old.proposed_at) then
    raise exception 'agency_proposal_immutable';
  end if;
  return new;
end;
$$;
revoke all on function public.agency_proposal_immutable_guard() from public,anon,authenticated,service_role;
create trigger agency_proposal_immutable_boundary before insert or update on public.agency_scope_grants
  for each row execute function public.agency_proposal_immutable_guard();

-- Keep an explicit fail-closed old entry point; no caller may accept the latest
-- proposal using only the business ID.
create function public.respond_to_agency_proposal(p_user_id uuid,p_verified_email text,p_agency_id uuid,p_business_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path = public,pg_temp as $$
begin
  raise exception 'agency_proposal_identity_required';
end;
$$;

create function public.respond_to_agency_proposal(p_user_id uuid, p_verified_email text, p_agency_id uuid, p_business_id uuid, p_accept boolean, p_proposal_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare proposer uuid; proposer_email text; seat_exists boolean; current_proposal_id text;
begin
  perform public.agency_directory_assert_manager(p_agency_id, p_user_id, p_verified_email);
  perform pg_advisory_xact_lock(hashtextextended(p_business_id::text, 7415));
  -- Fence every row in the reviewed set before comparing its exact identity.
  perform 1 from public.agency_scope_grants
    where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id and status = 'proposed'
    order by id for update;
  current_proposal_id := public.agency_proposal_identity(p_business_id,p_agency_id);
  if current_proposal_id is null then raise exception 'agency_proposal_not_found'; end if;
  if p_proposal_id is null or p_proposal_id !~ '^[a-f0-9]{64}$' then raise exception 'agency_proposal_identity_required'; end if;
  if p_proposal_id is distinct from current_proposal_id then raise exception 'agency_proposal_stale'; end if;
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
  -- Consent belongs to the proposing owner. Hold current verified identity
  -- and owner membership through the acceptance transaction.
  if exists (select 1 from public.agency_scope_grants
      where customer_workspace_id = p_business_id and agency_workspace_id = p_agency_id
        and status = 'proposed' and proposed_by <> proposer) then
    raise exception 'agency_proposal_owner_required';
  end if;
  select email into proposer_email from public.users
    where id = proposer and verified_at is not null for share;
  if proposer_email is null then raise exception 'agency_proposal_owner_required'; end if;
  begin
    perform public.provider_seat_assert_owner(p_business_id,proposer,proposer_email);
  exception when others then
    if sqlerrm = 'provider_seat_owner_required' then raise exception 'agency_proposal_owner_required'; end if;
    raise;
  end;
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

create function public.read_agency_proposals(p_user_id uuid,p_verified_email text,p_agency_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public,pg_temp as $$
begin
  perform public.agency_directory_assert_manager(p_agency_id,p_user_id,p_verified_email);
  return coalesce((select jsonb_agg(proposal order by proposed_at,business_id) from (
    select jsonb_build_object('proposalId',public.agency_proposal_identity(b.id,p_agency_id),
      'businessWorkspaceId',b.id,'businessName',b.name,'consent',min(g.consent),'proposedAt',min(g.proposed_at),
      'scopes',jsonb_agg(jsonb_build_object('scope',g.scope,'level',g.level) order by g.scope)) as proposal,
      min(g.proposed_at) as proposed_at,b.id as business_id
    from public.agency_scope_grants g join public.workspaces b on b.id = g.customer_workspace_id
    where g.agency_workspace_id = p_agency_id and g.status = 'proposed'
    group by b.id,b.name
  ) proposals),'[]'::jsonb);
end;
$$;

revoke all on function public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean),
  public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean,text),public.read_agency_proposals(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean),
  public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean,text),public.read_agency_proposals(uuid,text,uuid) to service_role;

create table public.ux_agency_identity_catalog_guard(signature text primary key,definition_hash text not null);
alter table public.ux_agency_identity_catalog_guard enable row level security;
revoke all on public.ux_agency_identity_catalog_guard from public,anon,authenticated,service_role;
insert into public.ux_agency_identity_catalog_guard select signature,md5(pg_get_functiondef(to_regprocedure(signature)))
  from unnest(array[
    'public.agency_proposal_identity(uuid,uuid)',
    'public.agency_proposal_immutable_guard()',
    'public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean)',
    'public.respond_to_agency_proposal(uuid,text,uuid,uuid,boolean,text)',
    'public.read_agency_proposals(uuid,text,uuid)',
    'public.respond_to_agency_proposal_before_ux_agency_identity(uuid,text,uuid,uuid,boolean)',
    'public.read_agency_proposals_before_ux_agency_identity(uuid,text,uuid)'
  ]) as signature;
notify pgrst, 'reload schema';
commit;
