-- A service request is a durable pre-installation handoff record. It keeps a
-- customer's need and addressed provider separate from an installation,
-- assignment, delivery, price or execution authority.

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  business_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'requested', 'withdrawn')),
  request_text text not null check (char_length(btrim(request_text)) between 1 and 3000),
  outcome text not null check (char_length(btrim(outcome)) between 1 and 3000),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object' and octet_length(context::text) <= 16000),
  scope text[] not null check (cardinality(scope) between 1 and 16 and array_position(scope, '') is null),
  provider_kind text not null check (provider_kind in ('strelva', 'agency')),
  provider_agency_workspace_id uuid references public.workspaces(id) on delete restrict,
  provider_acceptance text not null default 'pending' check (provider_acceptance in ('pending', 'accepted', 'declined')),
  accepted_by uuid references public.users(id) on delete restrict,
  accepted_at timestamptz,
  acceptance_note text check (acceptance_note is null or char_length(btrim(acceptance_note)) between 1 and 1000),
  installation_id uuid,
  delivery_id uuid references public.offering_provider_deliveries(id) on delete restrict,
  revision bigint not null default 1 check (revision > 0),
  history jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array' and jsonb_array_length(history) <= 100),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_workspace_id),
  check ((provider_kind = 'strelva') = (provider_agency_workspace_id is null)),
  check ((provider_acceptance = 'accepted') = (accepted_by is not null and accepted_at is not null)),
  check (provider_acceptance <> 'pending' or (accepted_by is null and accepted_at is null and acceptance_note is null)),
  check (status <> 'draft' or provider_acceptance = 'pending'),
  check ((installation_id is null) = (delivery_id is null)),
  foreign key (installation_id, business_workspace_id)
    references public.offering_installations(id, business_workspace_id) on delete restrict
);

create index service_requests_business_updated_idx
  on public.service_requests (business_workspace_id, updated_at desc, id);
create index service_requests_strelva_inbox_idx
  on public.service_requests (provider_kind, provider_acceptance, status, updated_at desc)
  where provider_kind = 'strelva';
create index service_requests_agency_inbox_idx
  on public.service_requests (provider_agency_workspace_id, provider_acceptance, status, updated_at desc)
  where provider_kind = 'agency';

-- One command key is durable across revisions. The request row itself records
-- the current state; this receipt prevents a lost response from applying a
-- save, provider decision or delivery link twice.
create table public.service_request_commands (
  business_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'),
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  request_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (business_workspace_id, idempotency_key),
  foreign key (request_id, business_workspace_id)
    references public.service_requests(id, business_workspace_id) on delete cascade
);

alter table public.service_requests enable row level security;
alter table public.service_request_commands enable row level security;
revoke all on table public.service_requests, public.service_request_commands from public, anon, authenticated, service_role;

create or replace function public.service_request_assert_customer(
  p_business_id uuid, p_user_id uuid, p_verified_email text, p_manage boolean
) returns text
language plpgsql security definer set search_path = public, pg_temp
as $$
declare actor_role text;
begin
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
    for key share;
  if not found then raise exception 'service_request_access_denied'; end if;
  select wm.role into actor_role
    from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.workspace_id = p_business_id and wm.user_id = p_user_id and w.kind = 'customer'
    for share of wm, w;
  if actor_role is null or (p_manage and actor_role not in ('owner', 'admin')) then
    raise exception 'service_request_access_denied';
  end if;
  return actor_role;
end;
$$;

create or replace function public.service_request_assert_provider(
  p_provider_kind text, p_agency_workspace_id uuid, p_user_id uuid, p_verified_email text
) returns void
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
    for key share;
  if not found then raise exception 'service_request_provider_ineligible'; end if;
  if p_provider_kind = 'strelva' then
    if not exists (select 1 from public.super_admins where user_id = p_user_id and revoked_at is null) then
      raise exception 'service_request_provider_ineligible';
    end if;
  elsif p_provider_kind = 'agency' then
    if not exists (select 1 from public.workspaces where id = p_agency_workspace_id and kind = 'agency')
      or not exists (select 1 from public.workspace_memberships where workspace_id = p_agency_workspace_id and user_id = p_user_id) then
      raise exception 'service_request_provider_ineligible';
    end if;
  else
    raise exception 'service_request_provider_ineligible';
  end if;
end;
$$;

create or replace function public.service_request_assert_payload(
  p_status text, p_request_text text, p_outcome text, p_context jsonb, p_scope text[], p_provider jsonb
) returns void
language plpgsql immutable security definer set search_path = public, pg_temp
as $$
declare provider_kind text;
begin
  if p_status not in ('draft', 'requested')
    or p_request_text is null or char_length(btrim(p_request_text)) not between 1 and 3000
    or p_outcome is null or char_length(btrim(p_outcome)) not between 1 and 3000
    or jsonb_typeof(p_context) is distinct from 'object' or octet_length(p_context::text) > 16000
    or p_scope is null or cardinality(p_scope) not between 1 and 16
    or array_position(p_scope, '') is not null
    or cardinality(p_scope) <> cardinality(array(select distinct unnest(p_scope)))
    or jsonb_typeof(p_provider) is distinct from 'object' then
    raise exception 'service_request_payload_invalid';
  end if;
  provider_kind := p_provider->>'kind';
  if provider_kind = 'strelva' then
    if p_provider - array['kind']::text[] <> '{}'::jsonb then raise exception 'service_request_provider_invalid'; end if;
  elsif provider_kind = 'agency' then
    if p_provider - array['kind', 'agencyWorkspaceId']::text[] <> '{}'::jsonb
      or coalesce(p_provider->>'agencyWorkspaceId', '') = '' then
      raise exception 'service_request_provider_invalid';
    end if;
  else
    raise exception 'service_request_provider_invalid';
  end if;
end;
$$;

create or replace function public.read_service_requests_for_business(
  p_user_id uuid, p_verified_email text, p_business_id uuid
) returns setof public.service_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.service_request_assert_customer(p_business_id, p_user_id, p_verified_email, false);
  return query select item.* from public.service_requests item
    where item.business_workspace_id = p_business_id
    order by item.updated_at desc, item.id;
end;
$$;

create or replace function public.read_service_requests_for_strelva(
  p_user_id uuid, p_verified_email text
) returns setof public.service_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.service_request_assert_provider('strelva', null, p_user_id, p_verified_email);
  return query select item.* from public.service_requests item
    where item.provider_kind = 'strelva' and item.status = 'requested' and item.provider_acceptance = 'pending'
    order by item.updated_at desc, item.id;
end;
$$;

create or replace function public.read_service_requests_for_agency(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid
) returns setof public.service_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  perform public.service_request_assert_provider('agency', p_agency_workspace_id, p_user_id, p_verified_email);
  return query select item.* from public.service_requests item
    where item.provider_kind = 'agency'
      and item.provider_agency_workspace_id = p_agency_workspace_id
      and item.status = 'requested' and item.provider_acceptance = 'pending'
    order by item.updated_at desc, item.id;
end;
$$;

create or replace function public.read_service_request(
  p_user_id uuid, p_verified_email text, p_request_id uuid
) returns setof public.service_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
declare item public.service_requests%rowtype;
begin
  select * into item from public.service_requests where id = p_request_id;
  if not found then raise exception 'service_request_not_found'; end if;
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
    for key share;
  if not found then raise exception 'service_request_access_denied'; end if;
  if exists (select 1 from public.workspace_memberships where workspace_id = item.business_workspace_id and user_id = p_user_id) then
    return next item;
    return;
  end if;
  if item.status <> 'requested' then raise exception 'service_request_access_denied'; end if;
  perform public.service_request_assert_provider(item.provider_kind, item.provider_agency_workspace_id, p_user_id, p_verified_email);
  return next item;
end;
$$;

create or replace function public.save_service_request(
  p_user_id uuid, p_verified_email text, p_business_id uuid, p_request_id uuid,
  p_expected_revision bigint, p_status text, p_request_text text, p_outcome text,
  p_context jsonb, p_scope text[], p_provider jsonb, p_idempotency_key text, p_command_digest text
) returns setof public.service_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
declare existing public.service_requests%rowtype;
  created public.service_requests%rowtype;
  receipt public.service_request_commands%rowtype;
  v_provider_kind text := p_provider->>'kind';
  provider_agency_id uuid;
  event_kind text;
begin
  perform public.service_request_assert_customer(p_business_id, p_user_id, p_verified_email, true);
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
    or char_length(p_idempotency_key) not between 1 and 128
    or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'service_request_idempotency_invalid';
  end if;
  perform public.service_request_assert_payload(p_status, p_request_text, p_outcome, p_context, p_scope, p_provider);
  if v_provider_kind = 'agency' then
    begin provider_agency_id := (p_provider->>'agencyWorkspaceId')::uuid;
    exception when invalid_text_representation then raise exception 'service_request_provider_invalid'; end;
    if provider_agency_id = p_business_id or not exists (select 1 from public.workspaces where id = provider_agency_id and kind = 'agency') then
      raise exception 'service_request_provider_ineligible';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('service-request:' || p_business_id::text || ':' || p_idempotency_key, 0));
  select * into receipt from public.service_request_commands
    where business_workspace_id = p_business_id and idempotency_key = p_idempotency_key for update;
  if found then
    if receipt.command_digest <> p_command_digest then raise exception 'service_request_idempotency_conflict'; end if;
    return query select * from public.service_requests where id = receipt.request_id and business_workspace_id = p_business_id;
    return;
  end if;

  if p_request_id is null then
    event_kind := case when p_status = 'draft' then 'draft_saved' else 'requested' end;
    insert into public.service_requests(
      business_workspace_id,status,request_text,outcome,context,scope,provider_kind,
      provider_agency_workspace_id,history,created_by,updated_at
    ) values (
      p_business_id,p_status,btrim(p_request_text),btrim(p_outcome),p_context,p_scope,v_provider_kind,
      provider_agency_id,jsonb_build_array(jsonb_build_object('kind',event_kind,'actorId',p_user_id::text,'at',clock_timestamp())),p_user_id,clock_timestamp()
    ) returning * into created;
    insert into public.service_request_commands(business_workspace_id,idempotency_key,command_digest,request_id)
      values (p_business_id,p_idempotency_key,p_command_digest,created.id);
    return next created;
    return;
  end if;

  select * into existing from public.service_requests
    where id = p_request_id and business_workspace_id = p_business_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  if p_expected_revision is null or p_expected_revision <> existing.revision then raise exception 'service_request_revision_conflict'; end if;
  if existing.status = 'withdrawn' or existing.provider_acceptance <> 'pending'
    or (existing.status = 'requested' and p_status = 'draft') then
    raise exception 'service_request_state_invalid';
  end if;
  event_kind := case when p_status = 'draft' then 'draft_saved' else 'requested' end;
  update public.service_requests set
    status = p_status, request_text = btrim(p_request_text), outcome = btrim(p_outcome), context = p_context,
    scope = p_scope, provider_kind = v_provider_kind, provider_agency_workspace_id = provider_agency_id,
    revision = revision + 1, updated_at = clock_timestamp(),
    history = history || jsonb_build_array(jsonb_build_object('kind',event_kind,'actorId',p_user_id::text,'at',clock_timestamp()))
    where id = existing.id
    returning * into created;
  insert into public.service_request_commands(business_workspace_id,idempotency_key,command_digest,request_id)
    values (p_business_id,p_idempotency_key,p_command_digest,created.id);
  return next created;
end;
$$;

create or replace function public.respond_service_request(
  p_user_id uuid, p_verified_email text, p_request_id uuid, p_expected_revision bigint, p_decision text,
  p_note text, p_idempotency_key text, p_command_digest text
) returns setof public.service_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
declare existing public.service_requests%rowtype;
  created public.service_requests%rowtype;
  receipt public.service_request_commands%rowtype;
begin
  select * into existing from public.service_requests where id = p_request_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  perform public.service_request_assert_provider(existing.provider_kind, existing.provider_agency_workspace_id, p_user_id, p_verified_email);
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
    or char_length(p_idempotency_key) not between 1 and 128
    or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'service_request_idempotency_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('service-request:' || existing.business_workspace_id::text || ':' || p_idempotency_key, 0));
  select * into receipt from public.service_request_commands
    where business_workspace_id = existing.business_workspace_id and idempotency_key = p_idempotency_key for update;
  if found then
    if receipt.command_digest <> p_command_digest then raise exception 'service_request_idempotency_conflict'; end if;
    return query select * from public.service_requests where id = receipt.request_id;
    return;
  end if;
  if p_expected_revision is null or p_expected_revision <> existing.revision then
    raise exception 'service_request_revision_conflict';
  end if;
  if existing.status <> 'requested' or existing.provider_acceptance <> 'pending'
    or p_decision not in ('accepted', 'declined')
    or (p_note is not null and char_length(btrim(p_note)) > 1000) then
    raise exception 'service_request_state_invalid';
  end if;
  update public.service_requests set
    provider_acceptance = p_decision,
    accepted_by = case when p_decision = 'accepted' then p_user_id else null end,
    accepted_at = case when p_decision = 'accepted' then clock_timestamp() else null end,
    acceptance_note = case when p_note is null or btrim(p_note) = '' then null else btrim(p_note) end,
    revision = revision + 1, updated_at = clock_timestamp(),
    history = history || jsonb_build_array(jsonb_build_object('kind',p_decision,'actorId',p_user_id::text,'at',clock_timestamp(),'note',p_note))
    where id = existing.id
    returning * into created;
  insert into public.service_request_commands(business_workspace_id,idempotency_key,command_digest,request_id)
    values (existing.business_workspace_id,p_idempotency_key,p_command_digest,created.id);
  return next created;
end;
$$;

create or replace function public.link_service_request_delivery(
  p_user_id uuid, p_verified_email text, p_business_id uuid, p_request_id uuid,
  p_installation_id uuid, p_delivery_id uuid, p_expected_revision bigint,
  p_idempotency_key text, p_command_digest text
) returns setof public.service_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
declare existing public.service_requests%rowtype;
  created public.service_requests%rowtype;
  receipt public.service_request_commands%rowtype;
begin
  perform public.service_request_assert_customer(p_business_id, p_user_id, p_verified_email, true);
  select * into existing from public.service_requests where id = p_request_id and business_workspace_id = p_business_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
    or char_length(p_idempotency_key) not between 1 and 128
    or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'service_request_idempotency_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('service-request:' || p_business_id::text || ':' || p_idempotency_key, 0));
  select * into receipt from public.service_request_commands
    where business_workspace_id = p_business_id and idempotency_key = p_idempotency_key for update;
  if found then
    if receipt.command_digest <> p_command_digest then raise exception 'service_request_idempotency_conflict'; end if;
    return query select * from public.service_requests where id = receipt.request_id and business_workspace_id = p_business_id;
    return;
  end if;
  if p_expected_revision is null or p_expected_revision <> existing.revision then raise exception 'service_request_revision_conflict'; end if;
  if existing.status <> 'requested' or existing.provider_acceptance <> 'accepted' or existing.provider_kind <> 'strelva'
    or existing.installation_id is not null or existing.delivery_id is not null then
    raise exception 'service_request_delivery_not_ready';
  end if;
  if not exists (select 1 from public.offering_installations where id = p_installation_id and business_workspace_id = p_business_id and status = 'active') then
    raise exception 'service_request_installation_invalid';
  end if;
  if not exists (select 1 from public.offering_provider_deliveries where id = p_delivery_id and business_workspace_id = p_business_id and installation_id = p_installation_id and status = 'accepted') then
    raise exception 'service_request_delivery_missing';
  end if;
  update public.service_requests set
    installation_id = p_installation_id, delivery_id = p_delivery_id,
    revision = revision + 1, updated_at = clock_timestamp(),
    history = history || jsonb_build_array(jsonb_build_object('kind','delivery_linked','actorId',p_user_id::text,'at',clock_timestamp()))
    where id = existing.id
    returning * into created;
  insert into public.service_request_commands(business_workspace_id,idempotency_key,command_digest,request_id)
    values (p_business_id,p_idempotency_key,p_command_digest,created.id);
  return next created;
end;
$$;

create or replace function public.withdraw_service_request(
  p_user_id uuid, p_verified_email text, p_business_id uuid, p_request_id uuid,
  p_expected_revision bigint, p_idempotency_key text, p_command_digest text
) returns setof public.service_requests
language plpgsql security definer set search_path = public, pg_temp
as $$
declare existing public.service_requests%rowtype;
  created public.service_requests%rowtype;
  receipt public.service_request_commands%rowtype;
begin
  perform public.service_request_assert_customer(p_business_id, p_user_id, p_verified_email, true);
  select * into existing from public.service_requests where id = p_request_id and business_workspace_id = p_business_id for update;
  if not found then raise exception 'service_request_not_found'; end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
    or char_length(p_idempotency_key) not between 1 and 128
    or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'service_request_idempotency_invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('service-request:' || p_business_id::text || ':' || p_idempotency_key, 0));
  select * into receipt from public.service_request_commands
    where business_workspace_id = p_business_id and idempotency_key = p_idempotency_key for update;
  if found then
    if receipt.command_digest <> p_command_digest then raise exception 'service_request_idempotency_conflict'; end if;
    return query select * from public.service_requests where id = receipt.request_id and business_workspace_id = p_business_id;
    return;
  end if;
  if p_expected_revision is null or p_expected_revision <> existing.revision or existing.status = 'withdrawn' or existing.delivery_id is not null then
    raise exception 'service_request_revision_conflict';
  end if;
  update public.service_requests set
    status = 'withdrawn', revision = revision + 1, updated_at = clock_timestamp(),
    history = history || jsonb_build_array(jsonb_build_object('kind','withdrawn','actorId',p_user_id::text,'at',clock_timestamp()))
    where id = existing.id
    returning * into created;
  insert into public.service_request_commands(business_workspace_id,idempotency_key,command_digest,request_id)
    values (p_business_id,p_idempotency_key,p_command_digest,created.id);
  return next created;
end;
$$;

revoke all on function public.service_request_assert_customer(uuid,uuid,text,boolean) from public, anon, authenticated;
revoke all on function public.service_request_assert_provider(text,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.service_request_assert_payload(text,text,text,jsonb,text[],jsonb) from public, anon, authenticated;
revoke all on function public.read_service_requests_for_business(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.read_service_requests_for_strelva(uuid,text) from public, anon, authenticated;
revoke all on function public.read_service_requests_for_agency(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.read_service_request(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.save_service_request(uuid,text,uuid,uuid,bigint,text,text,text,jsonb,text[],jsonb,text,text) from public, anon, authenticated;
revoke all on function public.respond_service_request(uuid,text,uuid,bigint,text,text,text,text) from public, anon, authenticated;
revoke all on function public.link_service_request_delivery(uuid,text,uuid,uuid,uuid,uuid,bigint,text,text) from public, anon, authenticated;
revoke all on function public.withdraw_service_request(uuid,text,uuid,uuid,bigint,text,text) from public, anon, authenticated;
grant execute on function public.read_service_requests_for_business(uuid,text,uuid) to service_role;
grant execute on function public.read_service_requests_for_strelva(uuid,text) to service_role;
grant execute on function public.read_service_requests_for_agency(uuid,text,uuid) to service_role;
grant execute on function public.read_service_request(uuid,text,uuid) to service_role;
grant execute on function public.save_service_request(uuid,text,uuid,uuid,bigint,text,text,text,jsonb,text[],jsonb,text,text) to service_role;
grant execute on function public.respond_service_request(uuid,text,uuid,bigint,text,text,text,text) to service_role;
grant execute on function public.link_service_request_delivery(uuid,text,uuid,uuid,uuid,uuid,bigint,text,text) to service_role;
grant execute on function public.withdraw_service_request(uuid,text,uuid,uuid,bigint,text,text) to service_role;
