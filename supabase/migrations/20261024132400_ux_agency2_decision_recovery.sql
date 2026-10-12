begin;
set local lock_timeout = '3s';
lock table public.owner_decisions in access exclusive mode;

-- Website/domain resolvers and Possibility execution do not yet consume the
-- exact agency claim. Hide and refuse them at the shared SQL admission seam.
alter function public.agency_owner_decision_scopes(public.owner_decisions) rename to agency_owner_decision_scopes_before_agency2;
create function public.agency_owner_decision_scopes(p_item public.owner_decisions)
returns text[] language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_item.source_lifecycle in ('website_document','website_domain','make_real') then null::text[]
    else public.agency_owner_decision_scopes_before_agency2(p_item) end
$$;
revoke all on function public.agency_owner_decision_scopes_before_agency2(public.owner_decisions) from public, anon, authenticated, service_role;
revoke all on function public.agency_owner_decision_scopes(public.owner_decisions) from public, anon, authenticated, service_role;

-- A person can also hold a support hat. Explicit agency authority is still
-- the ordinary staffed, verified seat + every Full-control scope; platform
-- identity alone neither grants nor removes that authority.
create table public.ux_agency2_decision_predecessors(signature text primary key, definition text not null);
alter table public.ux_agency2_decision_predecessors enable row level security;
revoke all on public.ux_agency2_decision_predecessors from public, anon, authenticated, service_role;
insert into public.ux_agency2_decision_predecessors select signature, pg_get_functiondef(signature::regprocedure)
  from unnest(array['public.agency_owner_decision_allowed(uuid,uuid,uuid,text,uuid)',
    'public.list_agency_owner_decisions(uuid,uuid,text,uuid)']) signature;
do $$ declare predecessor record; updated text;
begin
  for predecessor in select * from public.ux_agency2_decision_predecessors loop
    updated := replace(predecessor.definition,
      'not exists (select 1 from public.super_admins admin where admin.user_id = p_user_id and admin.revoked_at is null)', 'true');
    if updated = predecessor.definition then raise exception 'ux_agency2_decision_authority_predecessor_drift'; end if;
    execute updated;
  end loop;
end $$;

-- Capture the scopes at claim time. Source changes after execution must not
-- erase the authority required to inspect the exact recorded outcome.
alter table public.owner_decisions add column agency_decision_scopes text[];
create function public.agency_decision_scopes_guard() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.agency_decision_scopes is not null and new.agency_decision_scopes is distinct from old.agency_decision_scopes then
    raise exception 'agency_decision_scopes_immutable';
  end if;
  return new;
end;
$$;
create trigger agency_decision_scopes_guard before update on public.owner_decisions for each row execute function public.agency_decision_scopes_guard();
revoke all on function public.agency_decision_scopes_guard() from public, anon, authenticated, service_role;
alter function public.claim_scoped_agency_owner_decision(uuid,uuid,text,text,uuid,text,uuid) rename to claim_scoped_agency_owner_decision_before_agency2;
create function public.claim_scoped_agency_owner_decision(p_workspace_id uuid, p_decision_id uuid, p_revision_hash text,
  p_decision text, p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb;
begin
  result := public.claim_scoped_agency_owner_decision_before_agency2(p_workspace_id,p_decision_id,p_revision_hash,p_decision,p_user_id,p_verified_email,p_agency_workspace_id);
  if result->>'status' = 'claimed' then
    update public.owner_decisions d set agency_decision_scopes = public.agency_owner_decision_scopes(d)
      where d.workspace_id = p_workspace_id and d.id = p_decision_id and d.agency_decision_scopes is null;
  end if;
  return result;
end;
$$;
revoke all on function public.claim_scoped_agency_owner_decision_before_agency2(uuid,uuid,text,text,uuid,text,uuid) from public, anon, authenticated, service_role;
revoke all on function public.claim_scoped_agency_owner_decision(uuid,uuid,text,text,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.claim_scoped_agency_owner_decision(uuid,uuid,text,text,uuid,text,uuid) to service_role;

create function public.read_agency_decision_receipt(p_workspace_id uuid, p_agency_workspace_id uuid,
  p_decision_id uuid, p_revision_hash text, p_user_id uuid, p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare item public.owner_decisions%rowtype; required_scopes text[];
begin
  select * into item from public.owner_decisions
    where workspace_id = p_workspace_id and id = p_decision_id and revision_hash = p_revision_hash and route = 'owner_decides';
  if not found then raise exception 'owner_decision_access_denied'; end if;
  if item.state = 'open' then
    if not public.agency_owner_decision_allowed(p_workspace_id,p_decision_id,p_user_id,p_verified_email,p_agency_workspace_id) then
      raise exception 'owner_decision_access_denied';
    end if;
  else
    -- Only the exact deciding agency's receipts; no owner-only or other
    -- agency outcomes. Current verified staff, seat and all scopes still apply.
    required_scopes := item.agency_decision_scopes;
    if item.decided_by_kind is distinct from 'agency_session'
      or item.deciding_actor->>'agencyId' is distinct from p_agency_workspace_id::text
      or cardinality(required_scopes) is null or cardinality(required_scopes) = 0
      or public.workspace_exit_completed(p_workspace_id)
      or not exists (select 1 from public.provider_seats seat
        join public.agency_client_staff staff on staff.customer_workspace_id = seat.customer_workspace_id
          and staff.agency_workspace_id = seat.agency_workspace_id and staff.user_id = p_user_id and staff.status = 'active'
        join public.workspace_memberships member on member.workspace_id = staff.agency_workspace_id and member.user_id = staff.user_id
        join public.users actor on actor.id = member.user_id and actor.verified_at is not null and lower(actor.email) = lower(btrim(p_verified_email))
        join public.workspaces agency on agency.id = seat.agency_workspace_id and agency.kind = 'agency'
        join public.workspaces business on business.id = seat.customer_workspace_id and business.kind = 'customer'
        where seat.customer_workspace_id = p_workspace_id and seat.agency_workspace_id = p_agency_workspace_id and seat.status = 'active')
      or exists (select 1 from unnest(required_scopes) required_scope where not exists (
        select 1 from public.agency_scope_grants g where g.customer_workspace_id = p_workspace_id
          and g.agency_workspace_id = p_agency_workspace_id and g.scope = required_scope and g.level = 'full_control' and g.status = 'active')) then
      raise exception 'owner_decision_access_denied';
    end if;
  end if;
  return public.owner_decision_json(item);
end;
$$;
revoke all on function public.read_agency_decision_receipt(uuid,uuid,uuid,text,uuid,text) from public, anon, authenticated;
grant execute on function public.read_agency_decision_receipt(uuid,uuid,uuid,text,uuid,text) to service_role;

create table public.ux_agency2_decision_catalog_guard(signature text primary key, definition_hash text not null);
alter table public.ux_agency2_decision_catalog_guard enable row level security;
revoke all on public.ux_agency2_decision_catalog_guard from public, anon, authenticated, service_role;
insert into public.ux_agency2_decision_catalog_guard
  select signature, md5(pg_get_functiondef(signature::regprocedure)) from unnest(array[
    'public.agency_owner_decision_scopes(public.owner_decisions)',
    'public.agency_owner_decision_scopes_before_agency2(public.owner_decisions)',
    'public.claim_scoped_agency_owner_decision(uuid,uuid,text,text,uuid,text,uuid)',
    'public.claim_scoped_agency_owner_decision_before_agency2(uuid,uuid,text,text,uuid,text,uuid)',
    'public.read_agency_decision_receipt(uuid,uuid,uuid,text,uuid,text)',
    'public.agency_decision_scopes_guard()',
    'public.agency_owner_decision_allowed(uuid,uuid,uuid,text,uuid)',
    'public.list_agency_owner_decisions(uuid,uuid,text,uuid)']) signature;
notify pgrst, 'reload schema';
commit;
