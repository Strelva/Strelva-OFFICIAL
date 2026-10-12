-- Held request (Getting started, 2026-10-12). Local only until Jacob's yes.
-- GLOSSARY: Held request; ADR 0015 (two doors).
--
-- Before (20261023140000): a request typed at business entry, when the
-- business has no single agency, was not saved anywhere. The owner was told it
-- was held, but nothing held it.
-- After:
--   * business_held_requests keeps it on the business, visible to its members,
--     withdrawable by the owner. Nothing is sent.
--   * When an agency seat becomes active and that agency is the business's one
--     agency (the owner brought it in, or accepted it), each held request is
--     filed to it as an ordinary Request, as the person who typed it, through
--     save_service_request. If that can't happen (the person is no longer an
--     owner, the business left), the request stays held and visible.
--   * The owner may also file a held request to any agency with an active seat.
--   * Fix: read_agency_proposals (20261023142000) nested aggregates and failed
--     on every call; the agency could never see a proposal. Same output shape.
-- Depends on 20261023140000 and 20261023142000. Rollback refuses once any held
-- request exists, then restores both functions exactly.
begin;
set local lock_timeout = '5s';

create table public.business_held_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  request_text text not null check (char_length(request_text) between 1 and 3000 and request_text = btrim(request_text)),
  held_by uuid not null references public.users(id) on delete restrict,
  command_id uuid not null,
  held_at timestamptz not null default clock_timestamp(),
  status text not null default 'held' check (status in ('held','routed','withdrawn')),
  routed_request_id uuid references public.service_requests(id) on delete set null,
  routed_agency_workspace_id uuid references public.workspaces(id) on delete set null,
  routed_at timestamptz,
  withdrawn_by uuid references public.users(id) on delete set null,
  withdrawn_at timestamptz,
  unique (held_by, command_id),
  check ((status = 'routed') = (routed_at is not null)),
  check ((status = 'withdrawn') = (withdrawn_at is not null))
);
create index business_held_requests_workspace_idx on public.business_held_requests(workspace_id, status);
alter table public.business_held_requests enable row level security;
revoke all on public.business_held_requests from public, anon, authenticated, service_role;

create or replace function public.enter_customer_business(
  p_user_id uuid, p_verified_email text, p_name text, p_business_id uuid,
  p_request_text text, p_command_id uuid, p_command_digest text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  receipt public.workspace_creation_receipts%rowtype;
  business_id uuid;
  request_row public.service_requests%rowtype;
  agency_id uuid;
  request_held boolean := false;
  held_id uuid;
begin
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$'
    or (p_business_id is null and coalesce(char_length(btrim(p_name)),0) not between 1 and 120)
    or (p_business_id is not null and p_name is not null)
    or (p_request_text is not null and char_length(btrim(p_request_text)) not between 1 and 3000) then
    raise exception 'business_entry_invalid';
  end if;
  -- Same lock as create_owned_workspace: concurrent entry cannot exceed the cap.
  perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email))
    and verified_at is not null for update;
  if not found then raise exception 'verified_identity_required'; end if;
  select * into receipt from public.workspace_creation_receipts
    where user_id=p_user_id and command_id=p_command_id for update;
  if found then
    if receipt.command_digest <> p_command_digest then raise exception 'business_entry_idempotency_conflict'; end if;
    perform public.service_request_assert_customer(receipt.workspace_id,p_user_id,p_verified_email,true);
    select id into held_id from public.business_held_requests where held_by=p_user_id and command_id=p_command_id;
    return jsonb_build_object('workspaceId',receipt.workspace_id,'requestId',receipt.request_id,'alreadyCreated',true,
      'agencyRequired',p_request_text is not null and receipt.request_id is null,'heldRequestId',held_id);
  end if;
  if p_business_id is null then
    if (select count(*) from public.workspaces w where w.created_by=p_user_id
        and (not exists (select 1 from public.agency_client_additions a where a.customer_workspace_id=w.id)
          or exists (select 1 from public.workspace_memberships m where m.workspace_id=w.id and m.user_id=p_user_id and m.role='owner'))) >= 5 then
      raise exception 'workspace_limit_reached';
    end if;
    insert into public.workspaces(kind,name,created_by) values('customer',btrim(p_name),p_user_id) returning id into business_id;
    insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(business_id,p_user_id,'owner',p_user_id);
  else
    perform public.service_request_assert_customer(p_business_id,p_user_id,p_verified_email,true);
    business_id := p_business_id;
  end if;
  if public.workspace_exit_completed(business_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if p_request_text is not null then
    agency_id := public.business_single_agency(business_id);
    request_held := agency_id is null;
  end if;
  if p_request_text is not null and agency_id is not null then
    select * into request_row from public.save_service_request(
      p_user_id,p_verified_email,business_id,null,null,'requested',btrim(p_request_text),btrim(p_request_text),
      jsonb_build_object('source','business_entry','workspaceName',(select name from public.workspaces where id=business_id)),
      array['help_request']::text[],jsonb_build_object('kind','agency','agencyWorkspaceId',agency_id),
      'business-entry:'||p_command_id::text,p_command_digest
    );
    if request_row.id is null then raise exception 'business_entry_request_missing'; end if;
  end if;
  -- No single agency: the request is kept on the business, visible to the
  -- owner, and goes to the agency the owner brings in.
  if request_held then
    insert into public.business_held_requests(workspace_id,request_text,held_by,command_id)
      values(business_id,btrim(p_request_text),p_user_id,p_command_id) returning id into held_id;
  end if;
  insert into public.workspace_creation_receipts(user_id,command_id,command_digest,workspace_id,request_id)
    values(p_user_id,p_command_id,p_command_digest,business_id,request_row.id);
  return jsonb_build_object('workspaceId',business_id,'requestId',request_row.id,'alreadyCreated',false,'agencyRequired',request_held,'heldRequestId',held_id);
end;
$$;

-- File one held request to an agency with an active seat, as the person who
-- typed it. Returns the request id, or null when it must stay held.
create function public.business_held_request_route(p_held_id uuid, p_agency_id uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare held public.business_held_requests%rowtype; v_email text; request_row public.service_requests%rowtype;
begin
  select * into held from public.business_held_requests where id = p_held_id and status = 'held' for update;
  if not found then return null; end if;
  select email into v_email from public.users where id = held.held_by and verified_at is not null;
  if v_email is null then return null; end if;
  select * into request_row from public.save_service_request(
    held.held_by, v_email, held.workspace_id, null, null, 'requested', held.request_text, held.request_text,
    jsonb_build_object('source','business_entry','held',true,'workspaceName',(select name from public.workspaces where id=held.workspace_id)),
    array['help_request']::text[], jsonb_build_object('kind','agency','agencyWorkspaceId',p_agency_id),
    'held-request:'||held.id::text, encode(sha256(convert_to(held.id::text||':'||held.request_text, 'UTF8')), 'hex'));
  if request_row.id is null then return null; end if;
  update public.business_held_requests set status = 'routed', routed_request_id = request_row.id,
      routed_agency_workspace_id = p_agency_id, routed_at = clock_timestamp()
    where id = held.id;
  return request_row.id;
end;
$$;

-- When the business's one agency arrives, its held requests go to it. A
-- request that can't be filed stays held; the seat change itself never fails.
create function public.business_held_requests_on_seat() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare held_id uuid;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then return null; end if;
  if public.business_single_agency(new.customer_workspace_id) is distinct from new.agency_workspace_id then return null; end if;
  for held_id in select id from public.business_held_requests
      where workspace_id = new.customer_workspace_id and status = 'held' order by held_at, id loop
    begin
      perform public.business_held_request_route(held_id, new.agency_workspace_id);
    exception when others then
      null; -- Stays held and visible to the owner, who can file it by hand.
    end;
  end loop;
  return null;
end;
$$;
create trigger provider_seats_route_held_requests after insert or update of status on public.provider_seats
  for each row execute function public.business_held_requests_on_seat();

create function public.read_business_held_requests(p_user_id uuid, p_verified_email text, p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.service_request_assert_customer(p_workspace_id, p_user_id, p_verified_email, false);
  return coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'text', h.request_text, 'status', h.status, 'heldAt', h.held_at,
      'requestId', h.routed_request_id, 'agencyWorkspaceId', h.routed_agency_workspace_id,
      'agencyName', (select name from public.workspaces where id = h.routed_agency_workspace_id), 'routedAt', h.routed_at)
    order by h.held_at desc, h.id)
    from public.business_held_requests h where h.workspace_id = p_workspace_id and h.status in ('held','routed')), '[]'::jsonb);
end;
$$;

-- The owner withdraws a held request, or files it to one of its agencies.
create function public.decide_business_held_request(p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_held_id uuid,
  p_action text, p_agency_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare routed uuid;
begin
  perform public.provider_seat_assert_owner(p_workspace_id, p_user_id, p_verified_email);
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  perform 1 from public.business_held_requests where id = p_held_id and workspace_id = p_workspace_id and status = 'held' for update;
  if not found then raise exception 'held_request_not_found'; end if;
  if p_action = 'withdraw' then
    update public.business_held_requests set status = 'withdrawn', withdrawn_by = p_user_id, withdrawn_at = clock_timestamp() where id = p_held_id;
  elsif p_action = 'route' then
    perform 1 from public.provider_seats where customer_workspace_id = p_workspace_id and agency_workspace_id = p_agency_id and status = 'active';
    if not found then raise exception 'held_request_agency_required'; end if;
    routed := public.business_held_request_route(p_held_id, p_agency_id);
    if routed is null then raise exception 'held_request_agency_required'; end if;
  else
    raise exception 'held_request_invalid';
  end if;
  return public.read_business_held_requests(p_user_id, p_verified_email, p_workspace_id);
end;
$$;

create or replace function public.read_agency_proposals(p_user_id uuid, p_verified_email text, p_agency_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.agency_directory_assert_manager(p_agency_id, p_user_id, p_verified_email);
  return coalesce((select jsonb_agg(jsonb_build_object('businessWorkspaceId', x.id, 'businessName', x.name,
      'consent', x.consent, 'proposedAt', x.proposed_at, 'scopes', x.scopes) order by x.proposed_at, x.id)
    from (select b.id, b.name, min(g.consent) as consent, min(g.proposed_at) as proposed_at,
        jsonb_agg(jsonb_build_object('scope', g.scope, 'level', g.level) order by g.scope) as scopes
      from public.agency_scope_grants g join public.workspaces b on b.id = g.customer_workspace_id
      where g.agency_workspace_id = p_agency_id and g.status = 'proposed'
      group by b.id, b.name) x), '[]'::jsonb);
end;
$$;

revoke all on function public.business_held_request_route(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.business_held_requests_on_seat() from public, anon, authenticated, service_role;
revoke all on function public.read_business_held_requests(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.decide_business_held_request(uuid, text, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.read_business_held_requests(uuid, text, uuid) to service_role;
grant execute on function public.decide_business_held_request(uuid, text, uuid, uuid, text, uuid) to service_role;
commit;
