-- Systems and Connections: the customer spine of the Systems model. Additive
-- only. It does not alter tenants, Redis, /api/v1, website documents,
-- applications, bookings or inquiries, and it sends nothing.
--
-- Shape
--   systems             one enduring business-owned thing (website, proposal,
--                       booking flow, internal app). Identity is
--                       (business_workspace_id, id) and never changes. `kind`
--                       is a descriptor and may change. Lifecycle is
--                       draft | live | paused; health lives elsewhere.
--   system_revisions    immutable implementation snapshots. `systems`
--                       points at its current one.
--   system_outputs      issued or accepted results. Each pins the revision
--                       that produced it; only issued -> accepted may change.
--   system_connections  typed directional relations (read, act, appear,
--                       share, depend, trigger) from a System to another
--                       System, a business resource, an audience, an external
--                       account binding, a domain or an API.
--
-- Access is the business record's rule (business_record_assert_actor): any
-- member of the customer workspace reads; owner, admin or an accepted agency
-- delivery writes; writes take the workspace lock and stop after exit. All
-- tables are RLS-on with every grant revoked; only the service-role RPCs
-- below reach them, and each rechecks the actor.
--
-- Invariants held here, mirrored by src/platform/systems/invariants.ts:
--   * identity and owner never change; revisions belong to one System;
--   * lifecycle moves draft -> live -> paused -> live only, and live needs a
--     current revision;
--   * an output's pinned revision never changes;
--   * a System target in another business is allowed only for `share`, and
--     only when the actor can write in both businesses;
--   * depend and trigger connections never form a loop;
--   * a revision can be staged without moving the current pointer, and the
--     pointer moves only by compare-and-set (activate or restore);
--   * a pointer move marks incoming manual_review connections stale.
--
-- read_existing_business_systems is a read-only projection of what each
-- business already has. It writes nothing and mints no identity: Systems
-- adopted from it reference saved_product_work.id or tenants.stable_id
-- (origin), and a native website's work row plus its hosted tenant is one
-- System.

create function public.system_origin_kinds() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['saved_work','tenant','inquiry_workspace']::text[]
$$;

-- The id a System adopted from an existing thing always gets, so the read-only
-- projection and the stored System agree. Same layout as uuidFromSeed in
-- src/platform/business-record/tenant-import.ts.
create function public.system_origin_id(p_workspace_id uuid, p_kind text, p_ref text) returns uuid
language plpgsql immutable set search_path = public, pg_temp as $$
declare h text;
begin
  h := encode(sha256(convert_to('system:' || p_workspace_id::text || ':' || p_kind || ':' || p_ref, 'UTF8')), 'hex');
  return (substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3) || '-'
    || to_hex(((('x' || substr(h, 17, 1))::bit(4)::int) & 3) | 8) || substr(h, 18, 3) || '-' || substr(h, 21, 12))::uuid;
end;
$$;

create table public.systems (
  id uuid primary key default gen_random_uuid(),
  business_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160 and name = btrim(name)),
  purpose text check (purpose is null or char_length(purpose) <= 1000),
  kind text not null check (kind ~ '^[a-z][a-z0-9_]{0,39}$'),
  lifecycle text not null default 'draft' check (lifecycle in ('draft','live','paused')),
  current_revision_id uuid,
  current_revision_number integer check (current_revision_number is null or current_revision_number > 0),
  origin_kind text check (origin_kind is null or origin_kind = any(public.system_origin_kinds())),
  origin_ref text check (origin_ref is null or (char_length(origin_ref) between 1 and 200 and origin_ref = btrim(origin_ref))),
  change_number bigint not null default 1 check (change_number > 0),
  command_id uuid not null,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  unique (id, business_workspace_id),
  unique (business_workspace_id, command_id),
  check ((origin_kind is null) = (origin_ref is null)),
  check ((current_revision_id is null) = (current_revision_number is null)),
  check (lifecycle = 'draft' or current_revision_id is not null),
  check (origin_kind is null or id = public.system_origin_id(business_workspace_id, origin_kind, origin_ref))
);
create unique index systems_origin_idx on public.systems(business_workspace_id, origin_kind, origin_ref)
  where origin_kind is not null;
create index systems_business_idx on public.systems(business_workspace_id, created_at, id);

create table public.system_revisions (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null,
  business_workspace_id uuid not null,
  number integer not null check (number > 0),
  implementation jsonb not null check (
    jsonb_typeof(implementation) = 'object'
    and (implementation - array['kind','ref','contentHash']::text[]) = '{}'::jsonb
    and jsonb_typeof(implementation->'kind') = 'string' and char_length(implementation->>'kind') between 1 and 80
    and jsonb_typeof(implementation->'ref') = 'string' and char_length(implementation->>'ref') between 1 and 400
    and (implementation->'contentHash' is null or jsonb_typeof(implementation->'contentHash') = 'null'
      or (implementation->>'contentHash') ~ '^[0-9a-f]{64}$')
  ),
  summary text check (summary is null or char_length(summary) <= 500),
  command_id uuid not null,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (system_id, business_workspace_id) references public.systems(id, business_workspace_id) on delete cascade,
  unique (system_id, number),
  unique (id, system_id, number),
  unique (business_workspace_id, command_id)
);
alter table public.systems add constraint systems_current_revision_fk
  foreign key (current_revision_id, id, current_revision_number)
  references public.system_revisions(id, system_id, number) deferrable initially deferred;

create table public.system_outputs (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null,
  business_workspace_id uuid not null,
  revision_id uuid not null,
  revision_number integer not null,
  kind text not null check (char_length(kind) between 1 and 80 and kind = btrim(kind)),
  title text not null check (char_length(title) between 1 and 200 and title = btrim(title)),
  status text not null default 'issued' check (status in ('issued','accepted')),
  snapshot_hash text not null check (snapshot_hash ~ '^[0-9a-f]{64}$'),
  command_id uuid not null,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  issued_by uuid not null references public.users(id) on delete restrict,
  issued_at timestamptz not null default clock_timestamp(),
  accepted_by uuid references public.users(id) on delete restrict,
  accepted_at timestamptz,
  foreign key (system_id, business_workspace_id) references public.systems(id, business_workspace_id) on delete cascade,
  foreign key (revision_id, system_id, revision_number) references public.system_revisions(id, system_id, number),
  unique (business_workspace_id, command_id),
  check ((status = 'accepted') = (accepted_at is not null and accepted_by is not null))
);
create index system_outputs_system_idx on public.system_outputs(system_id, issued_at, id);

create table public.system_connections (
  id uuid primary key default gen_random_uuid(),
  business_workspace_id uuid not null,
  source_system_id uuid not null,
  kind text not null check (kind in ('read','act','appear','share','depend','trigger')),
  target_type text not null check (target_type in ('system','business_resource','audience','account_binding','domain','api')),
  target_system_id uuid,
  target_business_workspace_id uuid,
  target_ref text check (target_ref is null or (char_length(target_ref) between 1 and 253 and target_ref = btrim(target_ref))),
  target_key text not null,
  state text not null default 'connected' check (state in ('connected','disconnected','stale')),
  propagation text not null check (propagation in ('follow_current','pin_on_issue','manual_review')),
  contract_version integer not null default 1 check (contract_version > 0),
  purpose text check (purpose is null or char_length(purpose) <= 500),
  command_id uuid not null,
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_by uuid not null references public.users(id) on delete restrict,
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (source_system_id, business_workspace_id) references public.systems(id, business_workspace_id) on delete cascade,
  foreign key (target_system_id, target_business_workspace_id) references public.systems(id, business_workspace_id) on delete cascade,
  check ((target_type = 'system') = (target_system_id is not null and target_business_workspace_id is not null and target_ref is null)),
  check ((target_type <> 'system') = (target_ref is not null and target_system_id is null and target_business_workspace_id is null)),
  check (target_type <> 'domain' or target_ref ~ '^[a-z0-9.-]{3,253}$'),
  check (target_system_id is distinct from source_system_id),
  check (target_type <> 'system' or target_business_workspace_id = business_workspace_id or kind = 'share'),
  check (target_key = case when target_type = 'system'
    then 'system:' || target_business_workspace_id::text || ':' || target_system_id::text
    else target_type || ':' || target_ref end),
  unique (source_system_id, kind, target_key),
  unique (business_workspace_id, command_id)
);
create index system_connections_business_idx on public.system_connections(business_workspace_id, created_at, id);
create index system_connections_target_idx on public.system_connections(target_system_id) where target_system_id is not null;

alter table public.systems enable row level security;
alter table public.system_revisions enable row level security;
alter table public.system_outputs enable row level security;
alter table public.system_connections enable row level security;
revoke all on public.systems, public.system_revisions, public.system_outputs, public.system_connections
  from public, anon, authenticated, service_role;

-- Identity never moves, and lifecycle follows the legal set.
create function public.system_identity_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.id <> old.id or new.business_workspace_id <> old.business_workspace_id
    or new.created_by <> old.created_by or new.created_at <> old.created_at
    or new.command_id <> old.command_id or new.command_digest <> old.command_digest
    or new.origin_kind is distinct from old.origin_kind or new.origin_ref is distinct from old.origin_ref then
    raise exception 'system_identity_immutable';
  end if;
  if new.lifecycle <> old.lifecycle and not (
    (old.lifecycle = 'draft' and new.lifecycle = 'live')
    or (old.lifecycle = 'live' and new.lifecycle = 'paused')
    or (old.lifecycle = 'paused' and new.lifecycle = 'live')) then
    raise exception 'system_lifecycle_invalid';
  end if;
  if new.lifecycle = 'live' and new.current_revision_id is null then
    raise exception 'system_revision_required';
  end if;
  -- The pointer may move to any revision of this System (activate or
  -- restore; the foreign key keeps it inside the System) but never back to none.
  if old.current_revision_id is not null and new.current_revision_id is null then
    raise exception 'system_identity_immutable';
  end if;
  return new;
end;
$$;
create trigger systems_identity_guard before update on public.systems
  for each row execute function public.system_identity_guard();

-- Revisions never change. Deletion only follows the System's own deletion.
create function public.system_revision_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.systems where id = old.system_id) then
    return old;
  end if;
  raise exception 'system_revision_immutable';
end;
$$;
create trigger system_revisions_immutable before update or delete on public.system_revisions
  for each row execute function public.system_revision_immutable();

-- An output keeps the revision it was issued against. Only issued -> accepted.
create function public.system_output_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.systems where id = old.system_id) then return old; end if;
    raise exception 'system_output_immutable';
  end if;
  if (to_jsonb(new) - array['status','accepted_by','accepted_at']::text[])
      <> (to_jsonb(old) - array['status','accepted_by','accepted_at']::text[])
    or not (old.status = 'issued' and new.status = 'accepted') then
    raise exception 'system_output_immutable';
  end if;
  return new;
end;
$$;
create trigger system_outputs_guard before update or delete on public.system_outputs
  for each row execute function public.system_output_guard();

-- Depend and trigger edges stay acyclic among non-disconnected connections.
create function public.system_connection_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare closes boolean;
begin
  if tg_op = 'UPDATE' and (
    new.id <> old.id or new.business_workspace_id <> old.business_workspace_id
    or new.source_system_id <> old.source_system_id or new.kind <> old.kind or new.target_key <> old.target_key
    or new.command_id <> old.command_id or new.created_at <> old.created_at) then
    raise exception 'system_identity_immutable';
  end if;
  if new.state <> 'disconnected' and new.kind in ('depend','trigger') and new.target_system_id is not null then
    with recursive reach(system_id) as (
      select new.target_system_id
      union
      select c.target_system_id from public.system_connections c join reach r on c.source_system_id = r.system_id
        where c.kind = new.kind and c.state <> 'disconnected' and c.target_system_id is not null and c.id <> new.id
    )
    select exists (select 1 from reach where system_id = new.source_system_id) into closes;
    if closes then raise exception 'system_connection_cycle'; end if;
  end if;
  return new;
end;
$$;
create trigger system_connections_guard before insert or update on public.system_connections
  for each row execute function public.system_connection_guard();

-- ---- JSON shapes (camelCase, matching src/platform/systems/contracts.ts) ----

create function public.system_json(s public.systems) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', s.id, 'businessId', s.business_workspace_id, 'name', s.name, 'purpose', s.purpose, 'kind', s.kind,
    'lifecycle', s.lifecycle,
    'currentRevision', case when s.current_revision_id is null then null else jsonb_build_object(
      'businessId', s.business_workspace_id, 'systemId', s.id, 'revisionId', s.current_revision_id,
      'number', s.current_revision_number) end,
    'origin', case when s.origin_kind is null then null else jsonb_build_object('kind', s.origin_kind, 'ref', s.origin_ref) end,
    'changeNumber', s.change_number,
    'createdAt', to_char(s.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updatedAt', to_char(s.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
$$;

create function public.system_revision_json(r public.system_revisions) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', r.id, 'businessId', r.business_workspace_id, 'systemId', r.system_id, 'number', r.number,
    'implementation', r.implementation, 'summary', r.summary,
    'createdAt', to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), 'createdBy', r.created_by)
$$;

create function public.system_output_json(o public.system_outputs) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', o.id, 'businessId', o.business_workspace_id, 'systemId', o.system_id,
    'revision', jsonb_build_object('businessId', o.business_workspace_id, 'systemId', o.system_id,
      'revisionId', o.revision_id, 'number', o.revision_number),
    'kind', o.kind, 'title', o.title, 'status', o.status, 'snapshotHash', o.snapshot_hash,
    'issuedAt', to_char(o.issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'acceptedAt', case when o.accepted_at is null then null
      else to_char(o.accepted_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end)
$$;

create function public.system_connection_json(c public.system_connections) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', c.id, 'businessId', c.business_workspace_id,
    'source', jsonb_build_object('businessId', c.business_workspace_id, 'systemId', c.source_system_id),
    'kind', c.kind,
    'target', case c.target_type
      when 'system' then jsonb_build_object('type', 'system', 'system',
        jsonb_build_object('businessId', c.target_business_workspace_id, 'systemId', c.target_system_id))
      when 'business_resource' then jsonb_build_object('type', c.target_type, 'resource', c.target_ref)
      when 'audience' then jsonb_build_object('type', c.target_type, 'audience', c.target_ref)
      when 'account_binding' then jsonb_build_object('type', c.target_type, 'bindingId', c.target_ref)
      when 'domain' then jsonb_build_object('type', c.target_type, 'domain', c.target_ref)
      else jsonb_build_object('type', c.target_type, 'api', c.target_ref) end,
    'state', c.state, 'propagation', c.propagation, 'contractVersion', c.contract_version, 'purpose', c.purpose,
    'createdAt', to_char(c.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'updatedAt', to_char(c.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))
$$;

-- ---- helpers ----

create function public.system_command_valid(p_command_id uuid, p_command_digest text) returns void
language plpgsql immutable set search_path = public, pg_temp as $$
begin
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'system_input_invalid';
  end if;
end;
$$;

-- Loads a System inside the given business, locking it for a write. A System
-- in another business reads as missing.
create function public.system_load(p_workspace_id uuid, p_system_id uuid, p_lock boolean)
returns public.systems
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.systems;
begin
  if p_lock then
    select * into s from public.systems where id = p_system_id and business_workspace_id = p_workspace_id for update;
  else
    select * into s from public.systems where id = p_system_id and business_workspace_id = p_workspace_id;
  end if;
  if not found then raise exception 'system_not_found'; end if;
  return s;
end;
$$;

-- ---- reads ----

create function public.read_business_systems(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  return jsonb_build_object(
    'businessId', p_workspace_id,
    'systems', coalesce((select jsonb_agg(public.system_json(s) order by s.created_at, s.id)
      from public.systems s where s.business_workspace_id = p_workspace_id), '[]'::jsonb),
    'connections', coalesce((select jsonb_agg(public.system_connection_json(c) order by c.created_at, c.id)
      from public.system_connections c
      where c.business_workspace_id = p_workspace_id or c.target_business_workspace_id = p_workspace_id), '[]'::jsonb));
end;
$$;

create function public.read_business_system(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.systems;
begin
  perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  s := public.system_load(p_workspace_id, p_system_id, false);
  return jsonb_build_object(
    'system', public.system_json(s),
    'revisions', coalesce((select jsonb_agg(public.system_revision_json(r) order by r.number)
      from public.system_revisions r where r.system_id = s.id), '[]'::jsonb),
    'outputs', coalesce((select jsonb_agg(public.system_output_json(o) order by o.issued_at, o.id)
      from public.system_outputs o where o.system_id = s.id), '[]'::jsonb));
end;
$$;

-- ---- writes ----

create function public.create_business_system(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_input jsonb, p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.systems;
begin
  perform public.system_command_valid(p_command_id, p_command_digest);
  perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  select * into s from public.systems where business_workspace_id = p_workspace_id and command_id = p_command_id;
  if found then
    if s.command_digest <> p_command_digest or s.created_by <> p_user_id then raise exception 'system_command_conflict'; end if;
    return public.system_json(s) || jsonb_build_object('replayed', true);
  end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['name','purpose','kind','origin']::text[]) <> '{}'::jsonb
    or jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'kind') is distinct from 'string'
    or (p_input ? 'origin' and jsonb_typeof(p_input->'origin') not in ('object','null')) then
    raise exception 'system_input_invalid';
  end if;
  if jsonb_typeof(p_input->'origin') = 'object' and exists (select 1 from public.systems
      where business_workspace_id = p_workspace_id and origin_kind = p_input->'origin'->>'kind'
        and origin_ref = p_input->'origin'->>'ref') then
    raise exception 'system_origin_conflict';
  end if;
  insert into public.systems(id, business_workspace_id, name, purpose, kind, origin_kind, origin_ref,
    command_id, command_digest, created_by, updated_by)
  values (case when jsonb_typeof(p_input->'origin') = 'object'
      then public.system_origin_id(p_workspace_id, p_input->'origin'->>'kind', p_input->'origin'->>'ref')
      else gen_random_uuid() end,
    p_workspace_id, p_input->>'name', p_input->>'purpose', p_input->>'kind',
    p_input->'origin'->>'kind', p_input->'origin'->>'ref', p_command_id, p_command_digest, p_user_id, p_user_id)
  returning * into s;
  return public.system_json(s);
end;
$$;

create function public.update_business_system(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid, p_expected_change bigint, p_patch jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.systems;
begin
  perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  s := public.system_load(p_workspace_id, p_system_id, true);
  if s.change_number <> p_expected_change then raise exception 'system_change_conflict'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb
    or (p_patch - array['name','purpose','kind']::text[]) <> '{}'::jsonb
    or (p_patch ? 'name' and jsonb_typeof(p_patch->'name') <> 'string')
    or (p_patch ? 'kind' and jsonb_typeof(p_patch->'kind') <> 'string') then
    raise exception 'system_input_invalid';
  end if;
  update public.systems set
    name = case when p_patch ? 'name' then p_patch->>'name' else name end,
    purpose = case when p_patch ? 'purpose' then p_patch->>'purpose' else purpose end,
    kind = case when p_patch ? 'kind' then p_patch->>'kind' else kind end,
    change_number = change_number + 1, updated_by = p_user_id, updated_at = clock_timestamp()
  where id = s.id returning * into s;
  return public.system_json(s);
end;
$$;

-- p_activate = true records and makes it current (guarded by change number).
-- p_activate = false stages it: the revision exists, the pointer does not
-- move, and p_expected_change may be null. Numbers are max + 1 per System.
create function public.record_system_revision(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid, p_expected_change bigint,
  p_input jsonb, p_command_id uuid, p_command_digest text, p_activate boolean
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.systems; r public.system_revisions;
begin
  perform public.system_command_valid(p_command_id, p_command_digest);
  perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  select * into r from public.system_revisions where business_workspace_id = p_workspace_id and command_id = p_command_id;
  if found then
    if r.command_digest <> p_command_digest or r.created_by <> p_user_id or r.system_id <> p_system_id then
      raise exception 'system_command_conflict';
    end if;
    s := public.system_load(p_workspace_id, p_system_id, false);
    return jsonb_build_object('system', public.system_json(s), 'revision', public.system_revision_json(r), 'replayed', true);
  end if;
  s := public.system_load(p_workspace_id, p_system_id, true);
  if p_activate is null or (p_activate and s.change_number is distinct from p_expected_change)
    or (not p_activate and p_expected_change is not null and s.change_number <> p_expected_change) then
    raise exception 'system_change_conflict';
  end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['implementation','summary']::text[]) <> '{}'::jsonb
    or jsonb_typeof(p_input->'implementation') is distinct from 'object' then
    raise exception 'system_input_invalid';
  end if;
  insert into public.system_revisions(system_id, business_workspace_id, number, implementation, summary,
    command_id, command_digest, created_by)
  values (s.id, p_workspace_id, coalesce((select max(number) from public.system_revisions where system_id = s.id), 0) + 1,
    p_input->'implementation', p_input->>'summary', p_command_id, p_command_digest, p_user_id)
  returning * into r;
  if not p_activate then
    return jsonb_build_object('system', public.system_json(s), 'revision', public.system_revision_json(r));
  end if;
  update public.systems set current_revision_id = r.id, current_revision_number = r.number,
    change_number = change_number + 1, updated_by = p_user_id, updated_at = clock_timestamp()
  where id = s.id returning * into s;
  -- Connections that asked to review target changes go stale until reviewed.
  update public.system_connections set state = 'stale', updated_by = p_user_id, updated_at = clock_timestamp()
    where target_system_id = s.id and propagation = 'manual_review' and state = 'connected';
  return jsonb_build_object('system', public.system_json(s), 'revision', public.system_revision_json(r));
end;
$$;

-- Compare-and-set on the current revision pointer: activate a staged
-- revision or restore an earlier one. Refuses with system_baseline_moved if
-- the pointer is not where the caller expects. Issued outputs keep their pins.
create function public.set_system_current_revision(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid,
  p_revision_id uuid, p_expected_current uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.systems; r public.system_revisions;
begin
  perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  s := public.system_load(p_workspace_id, p_system_id, true);
  select * into r from public.system_revisions where id = p_revision_id and system_id = s.id;
  if not found then raise exception 'system_not_found'; end if;
  if s.current_revision_id = r.id then return public.system_json(s); end if;
  if s.current_revision_id is distinct from p_expected_current then raise exception 'system_baseline_moved'; end if;
  update public.systems set current_revision_id = r.id, current_revision_number = r.number,
    change_number = change_number + 1, updated_by = p_user_id, updated_at = clock_timestamp()
  where id = s.id returning * into s;
  update public.system_connections set state = 'stale', updated_by = p_user_id, updated_at = clock_timestamp()
    where target_system_id = s.id and propagation = 'manual_review' and state = 'connected';
  return public.system_json(s);
end;
$$;

create function public.transition_system_lifecycle(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid, p_expected_change bigint, p_to text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.systems;
begin
  perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  s := public.system_load(p_workspace_id, p_system_id, true);
  if s.change_number <> p_expected_change then raise exception 'system_change_conflict'; end if;
  if p_to is null or p_to not in ('draft','live','paused') then raise exception 'system_input_invalid'; end if;
  if not ((s.lifecycle = 'draft' and p_to = 'live') or (s.lifecycle = 'live' and p_to = 'paused')
    or (s.lifecycle = 'paused' and p_to = 'live')) then
    raise exception 'system_lifecycle_invalid';
  end if;
  if p_to = 'live' and s.current_revision_id is null then raise exception 'system_revision_required'; end if;
  update public.systems set lifecycle = p_to, change_number = change_number + 1,
    updated_by = p_user_id, updated_at = clock_timestamp()
  where id = s.id returning * into s;
  return public.system_json(s);
end;
$$;

create function public.issue_system_output(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid,
  p_input jsonb, p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.systems; o public.system_outputs;
begin
  perform public.system_command_valid(p_command_id, p_command_digest);
  perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  select * into o from public.system_outputs where business_workspace_id = p_workspace_id and command_id = p_command_id;
  if found then
    if o.command_digest <> p_command_digest or o.issued_by <> p_user_id or o.system_id <> p_system_id then
      raise exception 'system_command_conflict';
    end if;
    return public.system_output_json(o) || jsonb_build_object('replayed', true);
  end if;
  s := public.system_load(p_workspace_id, p_system_id, true);
  if s.current_revision_id is null then raise exception 'system_output_requires_revision'; end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['kind','title','snapshotHash']::text[]) <> '{}'::jsonb then
    raise exception 'system_input_invalid';
  end if;
  insert into public.system_outputs(system_id, business_workspace_id, revision_id, revision_number, kind, title,
    snapshot_hash, command_id, command_digest, issued_by)
  values (s.id, p_workspace_id, s.current_revision_id, s.current_revision_number, p_input->>'kind', p_input->>'title',
    p_input->>'snapshotHash', p_command_id, p_command_digest, p_user_id)
  returning * into o;
  return public.system_output_json(o);
end;
$$;

create function public.accept_system_output(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid, p_output_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare o public.system_outputs;
begin
  perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  perform public.system_load(p_workspace_id, p_system_id, false);
  select * into o from public.system_outputs
    where id = p_output_id and system_id = p_system_id and business_workspace_id = p_workspace_id for update;
  if not found then raise exception 'system_not_found'; end if;
  if o.status <> 'issued' then raise exception 'system_output_transition_invalid'; end if;
  update public.system_outputs set status = 'accepted', accepted_by = p_user_id, accepted_at = clock_timestamp()
    where id = o.id returning * into o;
  return public.system_output_json(o);
end;
$$;

create function public.connect_system(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_input jsonb, p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.system_connections;
  v_source uuid; v_kind text; v_target jsonb; v_type text; v_ref text;
  v_target_system uuid; v_target_business uuid; v_key text; v_policy text;
begin
  perform public.system_command_valid(p_command_id, p_command_digest);
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['source','kind','target','propagation','purpose']::text[]) <> '{}'::jsonb
    or jsonb_typeof(p_input->'source') is distinct from 'object' or jsonb_typeof(p_input->'target') is distinct from 'object'
    or (p_input->'source'->>'businessId') is distinct from p_workspace_id::text then
    raise exception 'system_input_invalid';
  end if;
  v_source := (p_input->'source'->>'systemId')::uuid;
  v_kind := p_input->>'kind';
  v_target := p_input->'target';
  v_type := v_target->>'type';
  if v_kind is null or v_kind not in ('read','act','appear','share','depend','trigger') then raise exception 'system_input_invalid'; end if;
  if v_type = 'system' then
    v_target_system := (v_target->'system'->>'systemId')::uuid;
    v_target_business := (v_target->'system'->>'businessId')::uuid;
    if v_target_system is null or v_target_business is null then raise exception 'system_input_invalid'; end if;
    v_key := 'system:' || v_target_business::text || ':' || v_target_system::text;
  else
    v_ref := case v_type
      when 'business_resource' then v_target->>'resource' when 'audience' then v_target->>'audience'
      when 'account_binding' then v_target->>'bindingId' when 'domain' then v_target->>'domain'
      when 'api' then v_target->>'api' else null end;
    if v_ref is null then raise exception 'system_input_invalid'; end if;
    v_key := v_type || ':' || v_ref;
  end if;

  -- Authority on the source business; a cross-business share also needs it
  -- on the target business. Locks are taken in id order so two shares in
  -- opposite directions cannot deadlock.
  if v_target_business is not null and v_target_business <> p_workspace_id then
    if v_kind <> 'share' then raise exception 'system_connection_cross_business'; end if;
    if p_workspace_id::text < v_target_business::text then
      perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
      perform public.business_record_assert_actor(v_target_business, p_user_id, p_verified_email, true);
    else
      perform public.business_record_assert_actor(v_target_business, p_user_id, p_verified_email, true);
      perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
    end if;
  else
    perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  end if;

  select * into c from public.system_connections where business_workspace_id = p_workspace_id and command_id = p_command_id;
  if found then
    if c.command_digest <> p_command_digest or c.created_by <> p_user_id then raise exception 'system_command_conflict'; end if;
    return public.system_connection_json(c) || jsonb_build_object('replayed', true);
  end if;

  perform public.system_load(p_workspace_id, v_source, true);
  if v_target_system is not null then
    if v_target_system = v_source then raise exception 'system_connection_self'; end if;
    if not exists (select 1 from public.systems where id = v_target_system and business_workspace_id = v_target_business) then
      raise exception 'system_connection_target_missing';
    end if;
  end if;
  v_policy := coalesce(p_input->>'propagation', case v_kind
    when 'depend' then 'pin_on_issue' when 'read' then 'pin_on_issue'
    when 'share' then 'follow_current' when 'appear' then 'follow_current'
    else 'manual_review' end);

  select * into c from public.system_connections where source_system_id = v_source and system_connections.kind = v_kind
    and target_key = v_key for update;
  if found then
    update public.system_connections set state = 'connected', propagation = v_policy,
      purpose = case when p_input ? 'purpose' then p_input->>'purpose' else purpose end,
      updated_by = p_user_id, updated_at = clock_timestamp()
    where id = c.id returning * into c;
  else
    insert into public.system_connections(business_workspace_id, source_system_id, kind, target_type, target_system_id,
      target_business_workspace_id, target_ref, target_key, propagation, purpose, command_id, command_digest, created_by, updated_by)
    values (p_workspace_id, v_source, v_kind, v_type, v_target_system, v_target_business, v_ref, v_key, v_policy,
      p_input->>'purpose', p_command_id, p_command_digest, p_user_id, p_user_id)
    returning * into c;
  end if;
  return public.system_connection_json(c);
end;
$$;

create function public.set_system_connection_state(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_connection_id uuid, p_state text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.system_connections;
begin
  perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  if p_state is null or p_state not in ('connected','disconnected','stale') then raise exception 'system_input_invalid'; end if;
  select * into c from public.system_connections where id = p_connection_id and business_workspace_id = p_workspace_id for update;
  if not found then raise exception 'system_not_found'; end if;
  update public.system_connections set state = p_state, updated_by = p_user_id, updated_at = clock_timestamp()
    where id = c.id returning * into c;
  return public.system_connection_json(c);
end;
$$;

-- ---- read-only projection of what a business already has ----
-- Feeds src/platform/systems/from-existing.ts. Writes nothing; every source
-- is scoped to this business workspace or to tenants linked to it.

create function public.read_existing_business_systems(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare linked_tenants uuid[];
begin
  perform public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  select coalesce(array_agg(distinct stable_id), '{}') into linked_tenants from (
    select tenant_stable_id as stable_id from public.offering_website_bindings
      where business_workspace_id = p_workspace_id and status = 'active' and tenant_stable_id is not null
    union
    select tenant_stable_id from public.tenant_workspace_links
      where workspace_id = p_workspace_id and tenant_stable_id is not null
  ) t;
  return jsonb_build_object(
    'businessId', p_workspace_id,
    'savedWork', coalesce((select jsonb_agg(jsonb_build_object(
        'id', w.id, 'productId', w.product_id, 'resourceKind', w.resource_kind, 'title', w.title,
        'createdAt', w.created_at, 'updatedAt', w.updated_at,
        'applicationStatus', a.lifecycle_status, 'applicationRelease', a.current_release_version,
        'customApplicationStatus', ca.lifecycle_status, 'customApplicationRelease', ca.current_release_version,
        'websiteHeadRevision', h.revision, 'websiteApprovedRevision', h.approved_revision,
        'websitePublishedRevision', p.revision, 'websitePublishedHash', p.content_hash,
        'hostedTenantStableId', coalesce(hr.tenant_stable_id, pt.stable_id), 'hostedTenantId', coalesce(hr.tenant_id, p.tenant_id))
        order by w.created_at, w.id)
      from public.saved_product_work w
      left join public.application_states a on a.work_id = w.id and a.workspace_id = w.workspace_id
      left join public.custom_application_states ca on ca.work_id = w.id and ca.workspace_id = w.workspace_id
      left join public.website_document_heads h on h.website_work_id = w.id and h.workspace_id = w.workspace_id
      left join public.website_document_publications p on p.website_work_id = w.id and p.workspace_id = w.workspace_id
      left join public.tenants pt on pt.id = p.tenant_id
      left join public.website_hosted_tenant_reservations hr on hr.website_work_id = w.id and hr.workspace_id = w.workspace_id
      where w.workspace_id = p_workspace_id
        and (w.product_id, w.resource_kind) in (('websites','website'),('applications','application'),
          ('custom-applications','custom-application'),('scheduling','schedule'),('inquiry','inquiry_capability'),
          ('onboarding','case'),('documents','document'),('tracker','tracker'))), '[]'::jsonb),
    -- One row per linked tenant. tenant_workspace_links is the canonical
    -- workspace<->tenant link; an active offering_website_bindings row is read
    -- only for a tenant that has no link yet.
    'managedWebsites', coalesce((select jsonb_agg(m order by m->>'linkedAt', m->>'tenantStableId') from (
        select jsonb_build_object('link', 'tenant_link', 'tenantStableId', l.tenant_stable_id,
          'tenantId', coalesce(t.id, l.tenant_slug_at_link), 'siteName', coalesce(t.site_name, l.tenant_slug_at_link),
          'tenantActive', coalesce(t.active, false), 'linkedAt', l.linked_at) as m
        from public.tenant_workspace_links l left join public.tenants t on t.stable_id = l.tenant_stable_id
        where l.workspace_id = p_workspace_id and l.tenant_stable_id is not null
        union all
        select jsonb_build_object('link', 'website_binding', 'tenantStableId', b.tenant_stable_id,
          'tenantId', coalesce(t.id, b.tenant_id_at_binding), 'siteName', coalesce(t.site_name, b.site_name_at_binding),
          'tenantActive', coalesce(t.active, false), 'linkedAt', b.created_at)
        from public.offering_website_bindings b left join public.tenants t on t.stable_id = b.tenant_stable_id
        where b.business_workspace_id = p_workspace_id and b.status = 'active' and b.tenant_stable_id is not null
          and not exists (select 1 from public.tenant_workspace_links l2 where l2.tenant_stable_id = b.tenant_stable_id)
      ) x), '[]'::jsonb),
    'inquiryWorkspaces', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'tenantStableId', i.tenant_stable_id,
        'businessId', i.business_id, 'createdAt', i.created_at, 'updatedAt', i.updated_at) order by i.created_at, i.id)
      from public.inquiry_workspaces i where i.tenant_stable_id = any(linked_tenants)), '[]'::jsonb),
    'bookingGrants', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'tenantStableId', g.tenant_stable_id,
        'workId', g.work_id, 'displayName', g.display_name, 'provider', g.provider, 'status', g.status)
        order by g.published_at, g.id)
      from public.public_website_booking_grants g where g.business_workspace_id = p_workspace_id), '[]'::jsonb),
    'calendarConnections', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'provider', c.provider,
        'calendarName', c.calendar_name, 'status', c.status) order by c.created_at, c.id)
      from public.workspace_calendar_connections c where c.workspace_id = p_workspace_id), '[]'::jsonb));
end;
$$;

revoke all on function public.system_origin_kinds() from public, anon, authenticated;
revoke all on function public.system_origin_id(uuid, text, text) from public, anon, authenticated;
revoke all on function public.system_identity_guard() from public, anon, authenticated;
revoke all on function public.system_revision_immutable() from public, anon, authenticated;
revoke all on function public.system_output_guard() from public, anon, authenticated;
revoke all on function public.system_connection_guard() from public, anon, authenticated;
revoke all on function public.system_json(public.systems) from public, anon, authenticated, service_role;
revoke all on function public.system_revision_json(public.system_revisions) from public, anon, authenticated, service_role;
revoke all on function public.system_output_json(public.system_outputs) from public, anon, authenticated, service_role;
revoke all on function public.system_connection_json(public.system_connections) from public, anon, authenticated, service_role;
revoke all on function public.system_command_valid(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.system_load(uuid, uuid, boolean) from public, anon, authenticated, service_role;

revoke all on function public.read_business_systems(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.read_business_system(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.create_business_system(uuid, uuid, text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.update_business_system(uuid, uuid, text, uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.record_system_revision(uuid, uuid, text, uuid, bigint, jsonb, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.set_system_current_revision(uuid, uuid, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.transition_system_lifecycle(uuid, uuid, text, uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.issue_system_output(uuid, uuid, text, uuid, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.accept_system_output(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.connect_system(uuid, uuid, text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.set_system_connection_state(uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.read_existing_business_systems(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.read_business_systems(uuid, uuid, text) to service_role;
grant execute on function public.read_business_system(uuid, uuid, text, uuid) to service_role;
grant execute on function public.create_business_system(uuid, uuid, text, jsonb, uuid, text) to service_role;
grant execute on function public.update_business_system(uuid, uuid, text, uuid, bigint, jsonb) to service_role;
grant execute on function public.record_system_revision(uuid, uuid, text, uuid, bigint, jsonb, uuid, text, boolean) to service_role;
grant execute on function public.set_system_current_revision(uuid, uuid, text, uuid, uuid, uuid) to service_role;
grant execute on function public.transition_system_lifecycle(uuid, uuid, text, uuid, bigint, text) to service_role;
grant execute on function public.issue_system_output(uuid, uuid, text, uuid, jsonb, uuid, text) to service_role;
grant execute on function public.accept_system_output(uuid, uuid, text, uuid, uuid) to service_role;
grant execute on function public.connect_system(uuid, uuid, text, jsonb, uuid, text) to service_role;
grant execute on function public.set_system_connection_state(uuid, uuid, text, uuid, text) to service_role;
grant execute on function public.read_existing_business_systems(uuid, uuid, text) to service_role;
