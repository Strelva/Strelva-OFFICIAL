-- System Versions: lineage between a source System and the Systems adapted
-- from it for another location, segment, agency client or franchise.
-- Additive only, on the Systems spine (20261004120000_systems.sql). It does
-- not alter tenants, Redis, /api/v1, website documents or any existing table,
-- and it sends nothing.
--
-- Shape (mirrors src/platform/system-versions/types.ts)
--   system_version_sources           marks a System as a source. `hidden` is a
--                                    same-business source both locations
--                                    descend from; the workspace never lists it
--                                    as a System of its own.
--   system_version_source_shares     businesses a source is shared with.
--   system_version_source_revisions  immutable published shareable
--                                    definitions, numbered 1..n per source.
--                                    Separate from system_revisions, whose
--                                    implementation only allows {kind, ref,
--                                    contentHash}.
--   system_versions                  one Version: its own System, owned by
--                                    its own business, with a baseline
--                                    revision, local data and a row_revision
--                                    for compare-and-set.
--   system_version_overrides         business-owned paths over the baseline.
--   system_version_bindings          the Version's own accounts. One live
--                                    connection binds at most one Version,
--                                    even inside one business.
--   system_version_releases          the Version's own releases. Each one
--                                    also records a system_revisions row on
--                                    the Version's System and moves its
--                                    current pointer, so History and the
--                                    spine agree.
--   system_version_decisions         adopted or declined improvements.
--   system_version_grants            lineage access the owning business
--                                    gives another business.
--
-- Access. Every table is RLS-on with every grant revoked. Only the
-- service-role RPCs below reach them, and each rechecks the actor:
--   * Version reads and writes go through system_actor_scope and
--     system_load on the Version's own System, so an agency reaches only the
--     Versions of its exact delegated (read) or assigned (write) work, and a
--     write passes the business record's write rule (lock, stop after exit).
--     A plain member may change only local data.
--   * Another business (including the source author) reads a Version only
--     with an active grant, never sees its bindings, and sees local data only
--     with lineage_and_data. Being the source author grants nothing.
--   * Source writes need owner or admin of the source's business. Source
--     reads need membership in that business or in a business it is shared
--     with.
--
-- History only grows: releases and decisions are append-only (also by
-- trigger), grants may only be revoked, and a save must keep every earlier
-- entry. Adoption may only move the baseline forward to a published revision,
-- and the stored baseline definition is always that revision's definition.

create table public.system_version_sources (
  system_id uuid primary key,
  business_workspace_id uuid not null,
  hidden boolean not null default false,
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (system_id, business_workspace_id) references public.systems(id, business_workspace_id) on delete cascade,
  unique (system_id, business_workspace_id)
);
create index system_version_sources_business_idx on public.system_version_sources(business_workspace_id);

create table public.system_version_source_shares (
  id uuid primary key default gen_random_uuid(),
  source_system_id uuid not null references public.system_version_sources(system_id) on delete cascade,
  grantee_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  shared_by uuid not null references public.users(id) on delete restrict,
  shared_at timestamptz not null default clock_timestamp(),
  revoked_by uuid references public.users(id) on delete restrict,
  revoked_at timestamptz,
  check ((revoked_at is null) = (revoked_by is null))
);
create unique index system_version_source_shares_active_idx
  on public.system_version_source_shares(source_system_id, grantee_workspace_id) where revoked_at is null;
create index system_version_source_shares_grantee_idx
  on public.system_version_source_shares(grantee_workspace_id) where revoked_at is null;

create table public.system_version_source_revisions (
  id uuid primary key,
  source_system_id uuid not null references public.system_version_sources(system_id) on delete cascade,
  number integer not null check (number > 0),
  label text check (label is null or (char_length(label) between 1 and 40 and label = btrim(label))),
  summary text not null check (char_length(summary) between 1 and 500),
  definition jsonb not null check (jsonb_typeof(definition) = 'object' and octet_length(definition::text) <= 262144),
  requires_binding_kinds text[] not null default '{}'::text[] check (cardinality(requires_binding_kinds) <= 20),
  published_by uuid not null references public.users(id) on delete restrict,
  published_at timestamptz not null,
  unique (source_system_id, number),
  unique (id, source_system_id)
);

create table public.system_versions (
  id uuid primary key,
  version_system_id uuid not null unique,
  business_workspace_id uuid not null,
  source_system_id uuid not null,
  source_workspace_id uuid not null,
  context_kind text not null check (context_kind in ('location','customer_segment','agency_client','franchise')),
  context_label text not null check (char_length(context_label) between 1 and 200 and context_label = btrim(context_label)),
  baseline_revision_id uuid not null,
  baseline_revision integer not null check (baseline_revision > 0),
  baseline_definition jsonb not null check (jsonb_typeof(baseline_definition) = 'object'),
  local_data jsonb not null default '{}'::jsonb check (jsonb_typeof(local_data) = 'object' and octet_length(local_data::text) <= 262144),
  current_release integer check (current_release is null or current_release > 0),
  row_revision bigint not null default 1 check (row_revision > 0),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  foreign key (version_system_id, business_workspace_id) references public.systems(id, business_workspace_id) on delete cascade,
  foreign key (source_system_id, source_workspace_id) references public.system_version_sources(system_id, business_workspace_id) on delete restrict,
  foreign key (baseline_revision_id, source_system_id) references public.system_version_source_revisions(id, source_system_id) on delete restrict,
  check (version_system_id <> source_system_id)
);
create index system_versions_business_idx on public.system_versions(business_workspace_id);
create index system_versions_source_idx on public.system_versions(source_system_id);

create table public.system_version_overrides (
  version_id uuid not null references public.system_versions(id) on delete cascade,
  position integer not null check (position >= 0),
  path text not null check (path ~ '^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$' and char_length(path) <= 300),
  value jsonb not null,
  set_by uuid not null references public.users(id) on delete restrict,
  set_at timestamptz not null,
  primary key (version_id, path),
  unique (version_id, position)
);

create table public.system_version_bindings (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.system_versions(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 80 and kind = btrim(kind)),
  connection_ref text not null check (char_length(connection_ref) between 1 and 300),
  owner_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  bound_by uuid not null references public.users(id) on delete restrict,
  bound_at timestamptz not null,
  released_at timestamptz
);
-- One live account binds one Version, across every business.
create unique index system_version_bindings_connection_idx
  on public.system_version_bindings(connection_ref) where released_at is null;
create unique index system_version_bindings_kind_idx
  on public.system_version_bindings(version_id, kind) where released_at is null;

create table public.system_version_releases (
  version_id uuid not null references public.system_versions(id) on delete cascade,
  number integer not null check (number > 0),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  baseline_revision integer not null check (baseline_revision > 0),
  override_paths text[] not null default '{}'::text[],
  system_revision_id uuid not null,
  released_by uuid not null references public.users(id) on delete restrict,
  released_at timestamptz not null,
  primary key (version_id, number)
);

create table public.system_version_decisions (
  version_id uuid not null references public.system_versions(id) on delete cascade,
  position integer not null check (position >= 0),
  source_revision integer not null check (source_revision > 0),
  choice text not null check (choice in ('adopted','declined')),
  resolutions jsonb not null default '[]'::jsonb check (jsonb_typeof(resolutions) = 'array'),
  reason text check (reason is null or char_length(reason) between 1 and 500),
  decided_by uuid not null references public.users(id) on delete restrict,
  decided_at timestamptz not null,
  primary key (version_id, position),
  check ((choice = 'declined') = (reason is not null))
);

create table public.system_version_grants (
  version_id uuid not null references public.system_versions(id) on delete cascade,
  position integer not null check (position >= 0),
  grantee_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  scope text not null check (scope in ('lineage','lineage_and_data')),
  granted_by uuid not null references public.users(id) on delete restrict,
  granted_at timestamptz not null,
  revoked_at timestamptz,
  primary key (version_id, position)
);
create unique index system_version_grants_active_idx
  on public.system_version_grants(version_id, grantee_workspace_id) where revoked_at is null;

alter table public.system_version_sources enable row level security;
alter table public.system_version_source_shares enable row level security;
alter table public.system_version_source_revisions enable row level security;
alter table public.system_versions enable row level security;
alter table public.system_version_overrides enable row level security;
alter table public.system_version_bindings enable row level security;
alter table public.system_version_releases enable row level security;
alter table public.system_version_decisions enable row level security;
alter table public.system_version_grants enable row level security;
revoke all on public.system_version_sources, public.system_version_source_shares,
  public.system_version_source_revisions, public.system_versions, public.system_version_overrides,
  public.system_version_bindings, public.system_version_releases, public.system_version_decisions,
  public.system_version_grants
  from public, anon, authenticated, service_role;

-- Published revisions, releases and decisions never change. Deletion only
-- follows the owning row's own deletion (a business deleted as a whole).
create function public.system_version_history_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    if tg_table_name = 'system_version_source_revisions' then
      if not exists (select 1 from public.system_version_sources where system_id = (to_jsonb(old)->>'source_system_id')::uuid) then
        return old;
      end if;
    elsif not exists (select 1 from public.system_versions where id = (to_jsonb(old)->>'version_id')::uuid) then
      return old;
    end if;
  end if;
  raise exception 'system_version_history_immutable';
end;
$$;
create trigger system_version_source_revisions_immutable before update or delete on public.system_version_source_revisions
  for each row execute function public.system_version_history_immutable();
create trigger system_version_releases_immutable before update or delete on public.system_version_releases
  for each row execute function public.system_version_history_immutable();
create trigger system_version_decisions_immutable before update or delete on public.system_version_decisions
  for each row execute function public.system_version_history_immutable();

-- A Version keeps its identity, its owner and its source.
create function public.system_version_identity_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.id <> old.id or new.version_system_id <> old.version_system_id
    or new.business_workspace_id <> old.business_workspace_id
    or new.source_system_id <> old.source_system_id or new.source_workspace_id <> old.source_workspace_id
    or new.context_kind <> old.context_kind or new.context_label <> old.context_label
    or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'system_version_identity_immutable';
  end if;
  if new.baseline_revision < old.baseline_revision then raise exception 'system_version_baseline_backward'; end if;
  if new.row_revision <> old.row_revision + 1 then raise exception 'system_version_stale'; end if;
  return new;
end;
$$;
create trigger system_versions_identity_guard before update on public.system_versions
  for each row execute function public.system_version_identity_guard();

-- ---- helpers ----

create function public.system_version_ts(p_value timestamptz) returns text
language sql immutable set search_path = public, pg_temp as $$
  select to_char(p_value at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- A verified user's role in a customer or agency workspace, or null.
create function public.system_version_member_role(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select wm.role from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id and w.kind in ('customer','agency')
    join public.users u on u.id = wm.user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
    where wm.workspace_id = p_workspace_id and wm.user_id = p_user_id
$$;

-- Workspaces where this verified user is a direct member.
create function public.system_version_actor_workspaces(p_user_id uuid, p_verified_email text)
returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(wm.workspace_id), '{}') from public.workspace_memberships wm
    join public.workspaces w on w.id = wm.workspace_id and w.kind in ('customer','agency')
    join public.users u on u.id = wm.user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
    where wm.user_id = p_user_id
$$;

-- Source authorship: owner or admin of the source's own business. A customer
-- business also passes the business record's write rule (lock, stop after
-- exit). An agency never authors a source inside a client's business.
create function public.system_version_assert_source_manager(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare workspace_kind text; actor_role text;
begin
  select kind into workspace_kind from public.workspaces where id = p_workspace_id;
  if workspace_kind = 'customer' then
    actor_role := public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  elsif workspace_kind = 'agency' then
    perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 7415));
    actor_role := public.system_version_member_role(p_workspace_id, p_user_id, p_verified_email);
  end if;
  if actor_role is null or actor_role not in ('owner','admin') then raise exception 'business_record_access_denied'; end if;
end;
$$;

-- Whether the actor may read a source: a member of its business, or of a
-- business it is actively shared with.
create function public.system_version_source_visible(p_source_system_id uuid, p_user_id uuid, p_verified_email text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare src public.system_version_sources; mine uuid[];
begin
  select * into src from public.system_version_sources where system_id = p_source_system_id;
  if not found then return false; end if;
  mine := public.system_version_actor_workspaces(p_user_id, p_verified_email);
  return src.business_workspace_id = any(mine) or exists (select 1 from public.system_version_source_shares s
    where s.source_system_id = src.system_id and s.revoked_at is null and s.grantee_workspace_id = any(mine));
end;
$$;

-- The business that owns a live connection, by reference. Only references
-- Strelva can prove: a workspace calendar connection that is not revoked, or
-- a tenant linked to a business. Anything else has no owner and is refused.
create function public.system_version_connection_owner(p_connection_ref text) returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare kind text; ref text; owner uuid;
begin
  if p_connection_ref is null or p_connection_ref !~ '^[a-z_]+:.+$' then return null; end if;
  kind := split_part(p_connection_ref, ':', 1);
  ref := substr(p_connection_ref, char_length(kind) + 2);
  if ref !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  if kind = 'calendar' then
    select workspace_id into owner from public.workspace_calendar_connections where id = ref::uuid and status <> 'revoked';
  elsif kind = 'tenant' then
    select workspace_id into owner from public.tenant_workspace_links where tenant_stable_id = ref::uuid;
  end if;
  return owner;
end;
$$;

-- Lineage access to one Version: 'full' for anyone in its business scope
-- (direct member, or an agency whose work covers its System), else the scope
-- of an active grant to a business the actor belongs to, else null. A write
-- needs the business scope; grants never write.
create function public.system_version_access(v public.system_versions, p_user_id uuid, p_verified_email text, p_write boolean,
  out access text, out actor_role text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare scope record; mine uuid[];
begin
  begin
    scope := public.system_actor_scope(v.business_workspace_id, p_user_id, p_verified_email, p_write);
    perform public.system_load(v.business_workspace_id, v.version_system_id, p_write, scope.work_ids);
    access := 'full';
    actor_role := scope.access;
    return;
  exception when others then
    if sqlerrm not in ('business_record_access_denied', 'system_not_found') then raise; end if;
  end;
  if p_write then
    -- A member may still change local data: it passes the read scope.
    begin
      scope := public.system_actor_scope(v.business_workspace_id, p_user_id, p_verified_email, false);
      perform public.system_load(v.business_workspace_id, v.version_system_id, false, scope.work_ids);
      if scope.access = 'member' then
        if public.workspace_exit_completed(v.business_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
        access := 'full';
        actor_role := 'member';
        return;
      end if;
    exception when others then
      if sqlerrm not in ('business_record_access_denied', 'system_not_found') then raise; end if;
    end;
    raise exception 'business_record_access_denied';
  end if;
  mine := public.system_version_actor_workspaces(p_user_id, p_verified_email);
  select g.scope into access from public.system_version_grants g
    where g.version_id = v.id and g.revoked_at is null and g.grantee_workspace_id = any(mine)
    order by case g.scope when 'lineage_and_data' then 0 else 1 end limit 1;
  actor_role := null;
end;
$$;

create function public.system_version_source_json(src public.system_version_sources, p_user_id uuid, p_verified_email text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare mine uuid[]; full_view boolean;
begin
  mine := public.system_version_actor_workspaces(p_user_id, p_verified_email);
  full_view := src.business_workspace_id = any(mine);
  return jsonb_build_object(
    'source', jsonb_build_object('businessId', src.business_workspace_id, 'systemId', src.system_id),
    'hidden', src.hidden,
    'sharedWith', coalesce((select jsonb_agg(s.grantee_workspace_id order by s.shared_at, s.id)
      from public.system_version_source_shares s
      where s.source_system_id = src.system_id and s.revoked_at is null
        and (full_view or s.grantee_workspace_id = any(mine))), '[]'::jsonb),
    'createdAt', public.system_version_ts(src.created_at));
end;
$$;

create function public.system_version_revision_json(r public.system_version_source_revisions, p_workspace_id uuid)
returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'source', jsonb_build_object('businessId', p_workspace_id, 'systemId', r.source_system_id, 'revisionId', r.id, 'number', r.number),
    'summary', r.summary, 'definition', r.definition,
    'requires', jsonb_build_object('bindingKinds', to_jsonb(r.requires_binding_kinds)),
    'publishedBy', r.published_by, 'publishedAt', public.system_version_ts(r.published_at))
    || case when r.label is null then '{}'::jsonb else jsonb_build_object('label', r.label) end
$$;

-- The Version as src/platform/system-versions/types.ts VersionLineage.
-- Outside its business scope, bindings are never included, local data only
-- with lineage_and_data, and grants only the actor's own.
create function public.system_version_json(v public.system_versions, p_access text, p_user_id uuid, p_verified_email text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare full_view boolean := p_access = 'full'; mine uuid[];
begin
  if not full_view then mine := public.system_version_actor_workspaces(p_user_id, p_verified_email); end if;
  return jsonb_build_object(
    'id', v.id,
    'version', jsonb_build_object('businessId', v.business_workspace_id, 'systemId', v.version_system_id),
    'source', jsonb_build_object('businessId', v.source_workspace_id, 'systemId', v.source_system_id),
    'context', jsonb_build_object('kind', v.context_kind, 'label', v.context_label),
    'baseline', jsonb_build_object('revision', v.baseline_revision, 'definition', v.baseline_definition),
    'overrides', coalesce((select jsonb_agg(jsonb_build_object('path', o.path, 'value', o.value, 'setBy', o.set_by,
      'setAt', public.system_version_ts(o.set_at)) order by o.position) from public.system_version_overrides o where o.version_id = v.id), '[]'::jsonb),
    'bindings', case when full_view then coalesce((select jsonb_agg(jsonb_build_object('kind', b.kind, 'connectionId', b.connection_ref,
      'ownerBusinessId', b.owner_workspace_id, 'boundBy', b.bound_by, 'boundAt', public.system_version_ts(b.bound_at)) order by b.bound_at, b.id)
      from public.system_version_bindings b where b.version_id = v.id and b.released_at is null), '[]'::jsonb) else '[]'::jsonb end,
    'localData', case when full_view or p_access = 'lineage_and_data' then v.local_data else '{}'::jsonb end,
    'releases', coalesce((select jsonb_agg(jsonb_build_object('number', r.number, 'definition', r.definition,
      'baselineRevision', r.baseline_revision, 'overridePaths', to_jsonb(r.override_paths), 'releasedBy', r.released_by,
      'releasedAt', public.system_version_ts(r.released_at)) order by r.number) from public.system_version_releases r where r.version_id = v.id), '[]'::jsonb),
    'currentRelease', v.current_release,
    'decisions', coalesce((select jsonb_agg(case when d.choice = 'adopted'
      then jsonb_build_object('sourceRevision', d.source_revision, 'choice', d.choice, 'resolutions', d.resolutions,
        'by', d.decided_by, 'at', public.system_version_ts(d.decided_at))
      else jsonb_build_object('sourceRevision', d.source_revision, 'choice', d.choice, 'reason', d.reason,
        'by', d.decided_by, 'at', public.system_version_ts(d.decided_at)) end order by d.position)
      from public.system_version_decisions d where d.version_id = v.id), '[]'::jsonb),
    'grants', coalesce((select jsonb_agg(jsonb_build_object('granteeBusinessId', g.grantee_workspace_id, 'scope', g.scope,
      'grantedBy', g.granted_by, 'grantedAt', public.system_version_ts(g.granted_at))
      || case when g.revoked_at is null then '{}'::jsonb else jsonb_build_object('revokedAt', public.system_version_ts(g.revoked_at)) end
      order by g.position) from public.system_version_grants g
      where g.version_id = v.id and (full_view or (g.revoked_at is null and g.grantee_workspace_id = any(mine)))), '[]'::jsonb),
    'rowRevision', v.row_revision,
    'createdBy', v.created_by,
    'createdAt', public.system_version_ts(v.created_at),
    'updatedAt', public.system_version_ts(v.updated_at));
end;
$$;

create function public.system_version_uuid(p_text text) returns uuid
language sql immutable set search_path = public, pg_temp as $$
  select public.system_origin_id('00000000-0000-4000-8000-000000000000'::uuid, 'system_version', p_text)
$$;

-- ---- reads ----

-- The actor's direct memberships, as VersionActor.memberships.
create function public.read_version_actor(p_user_id uuid, p_verified_email text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('userId', p_user_id, 'memberships', coalesce(jsonb_agg(jsonb_build_object(
    'businessId', wm.workspace_id, 'role', wm.role) order by wm.workspace_id), '[]'::jsonb))
  from public.workspace_memberships wm
  join public.workspaces w on w.id = wm.workspace_id and w.kind in ('customer','agency')
  join public.users u on u.id = wm.user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
  where wm.user_id = p_user_id
$$;

create function public.read_system_version_source(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare src public.system_version_sources;
begin
  select * into src from public.system_version_sources where system_id = p_system_id and business_workspace_id = p_workspace_id;
  if not found or not public.system_version_source_visible(src.system_id, p_user_id, p_verified_email) then return null; end if;
  return public.system_version_source_json(src, p_user_id, p_verified_email);
end;
$$;

create function public.read_system_version_source_revisions(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid, p_number integer
) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.system_version_sources where system_id = p_system_id and business_workspace_id = p_workspace_id)
    or not public.system_version_source_visible(p_system_id, p_user_id, p_verified_email) then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(public.system_version_revision_json(r, p_workspace_id) order by r.number)
    from public.system_version_source_revisions r
    where r.source_system_id = p_system_id and (p_number is null or r.number = p_number)), '[]'::jsonb);
end;
$$;

create function public.read_system_version(p_user_id uuid, p_verified_email text, p_version_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.system_versions; a record;
begin
  select * into v from public.system_versions where id = p_version_id;
  if not found then return null; end if;
  a := public.system_version_access(v, p_user_id, p_verified_email, false);
  if a.access is null then return null; end if;
  return public.system_version_json(v, a.access, p_user_id, p_verified_email);
end;
$$;

create function public.read_system_version_for_system(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.system_versions; a record;
begin
  select * into v from public.system_versions where version_system_id = p_system_id and business_workspace_id = p_workspace_id;
  if not found then return null; end if;
  a := public.system_version_access(v, p_user_id, p_verified_email, false);
  if a.access is null then return null; end if;
  return public.system_version_json(v, a.access, p_user_id, p_verified_email);
end;
$$;

-- Which Version holds a live connection: its id when the actor may read it,
-- 'elsewhere' when another business's Version holds it, null when none.
create function public.system_version_connection_holder(p_user_id uuid, p_verified_email text, p_connection_ref text)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.system_versions; a record;
begin
  select sv.* into v from public.system_version_bindings b join public.system_versions sv on sv.id = b.version_id
    where b.connection_ref = p_connection_ref and b.released_at is null;
  if not found then return null; end if;
  a := public.system_version_access(v, p_user_id, p_verified_email, false);
  return case when a.access = 'full' then v.id::text else 'elsewhere' end;
end;
$$;

-- The business that owns a connection, told only to a member of that
-- business. Anyone else learns nothing (null), so bindAccount refuses it.
create function public.read_system_version_connection_owner(p_user_id uuid, p_verified_email text, p_connection_ref text)
returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare owner uuid;
begin
  owner := public.system_version_connection_owner(p_connection_ref);
  if owner is null or not (owner = any(public.system_version_actor_workspaces(p_user_id, p_verified_email))) then return null; end if;
  return owner;
end;
$$;

-- ---- writes ----

-- A new System that is a source from the start. `hidden` makes it the
-- same-business source both locations descend from (Twin Trees); it is never
-- listed as a System of its own. Works in a customer business or an agency
-- workspace (Strelva's own sources). Replays by command id.
create function public.create_system_version_source(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_input jsonb, p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.systems; src public.system_version_sources;
begin
  perform public.system_command_valid(p_command_id, p_command_digest);
  perform public.system_version_assert_source_manager(p_workspace_id, p_user_id, p_verified_email);
  select * into s from public.systems where business_workspace_id = p_workspace_id and command_id = p_command_id;
  if found then
    if s.command_digest <> p_command_digest or s.created_by <> p_user_id then raise exception 'system_command_conflict'; end if;
    select * into src from public.system_version_sources where system_id = s.id;
    if not found then raise exception 'system_command_conflict'; end if;
    return jsonb_build_object('system', public.system_json(s), 'source', public.system_version_source_json(src, p_user_id, p_verified_email), 'replayed', true);
  end if;
  if p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['name','kind','purpose','hidden']::text[]) <> '{}'::jsonb
    or jsonb_typeof(p_input->'name') is distinct from 'string' or jsonb_typeof(p_input->'kind') is distinct from 'string'
    or (p_input ? 'hidden' and jsonb_typeof(p_input->'hidden') <> 'boolean') then
    raise exception 'system_input_invalid';
  end if;
  insert into public.systems(business_workspace_id, name, purpose, kind, command_id, command_digest, created_by, updated_by)
    values (p_workspace_id, p_input->>'name', p_input->>'purpose', p_input->>'kind', p_command_id, p_command_digest, p_user_id, p_user_id)
    returning * into s;
  insert into public.system_version_sources(system_id, business_workspace_id, hidden, created_by)
    values (s.id, p_workspace_id, coalesce((p_input->>'hidden')::boolean, false), p_user_id)
    returning * into src;
  return jsonb_build_object('system', public.system_json(s), 'source', public.system_version_source_json(src, p_user_id, p_verified_email));
end;
$$;

-- Marks an existing System as a source (Package) and sets who it is shared
-- with. Only the source business's owner or admin.
create function public.put_system_version_source(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid, p_shared_with uuid[]
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare src public.system_version_sources;
begin
  perform public.system_version_assert_source_manager(p_workspace_id, p_user_id, p_verified_email);
  if p_shared_with is null or cardinality(p_shared_with) > 1000 or p_workspace_id = any(p_shared_with) then raise exception 'system_input_invalid'; end if;
  select * into src from public.system_version_sources where system_id = p_system_id and business_workspace_id = p_workspace_id for update;
  if not found then
    if not exists (select 1 from public.systems where id = p_system_id and business_workspace_id = p_workspace_id) then
      raise exception 'system_not_found';
    end if;
    if exists (select 1 from public.system_versions where version_system_id = p_system_id) then
      raise exception 'system_version_input_invalid';
    end if;
    insert into public.system_version_sources(system_id, business_workspace_id, created_by)
      values (p_system_id, p_workspace_id, p_user_id) returning * into src;
  end if;
  if exists (select 1 from unnest(p_shared_with) g where not exists (select 1 from public.workspaces w where w.id = g and w.kind = 'customer')) then
    raise exception 'system_input_invalid';
  end if;
  update public.system_version_source_shares set revoked_at = clock_timestamp(), revoked_by = p_user_id
    where source_system_id = src.system_id and revoked_at is null and not (grantee_workspace_id = any(p_shared_with));
  insert into public.system_version_source_shares(source_system_id, grantee_workspace_id, shared_by)
    select src.system_id, g, p_user_id from (select distinct unnest(p_shared_with) g) x
    where not exists (select 1 from public.system_version_source_shares s
      where s.source_system_id = src.system_id and s.grantee_workspace_id = x.g and s.revoked_at is null);
  return public.system_version_source_json(src, p_user_id, p_verified_email);
end;
$$;

-- Appends revision n+1. A second publish of the same number is refused.
create function public.publish_system_version_source_revision(p_user_id uuid, p_verified_email text, p_revision jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare src public.system_version_sources; r public.system_version_source_revisions; n integer;
begin
  if p_revision is null or jsonb_typeof(p_revision) <> 'object' or jsonb_typeof(p_revision->'source') <> 'object'
    or jsonb_typeof(p_revision->'definition') <> 'object' or jsonb_typeof(p_revision->'summary') <> 'string'
    or jsonb_typeof(p_revision->'requires'->'bindingKinds') <> 'array'
    or (p_revision->'source'->>'number') !~ '^[1-9][0-9]{0,8}$' then
    raise exception 'system_version_input_invalid';
  end if;
  perform public.system_version_assert_source_manager((p_revision->'source'->>'businessId')::uuid, p_user_id, p_verified_email);
  select * into src from public.system_version_sources
    where system_id = (p_revision->'source'->>'systemId')::uuid and business_workspace_id = (p_revision->'source'->>'businessId')::uuid
    for update;
  if not found then raise exception 'system_not_found'; end if;
  if (p_revision->>'publishedBy') is distinct from p_user_id::text then raise exception 'system_version_input_invalid'; end if;
  select coalesce(max(number), 0) into n from public.system_version_source_revisions where source_system_id = src.system_id;
  if (p_revision->'source'->>'number')::integer <> n + 1 then raise exception 'system_version_revision_exists'; end if;
  insert into public.system_version_source_revisions(id, source_system_id, number, label, summary, definition,
      requires_binding_kinds, published_by, published_at)
    values ((p_revision->'source'->>'revisionId')::uuid, src.system_id, n + 1, p_revision->>'label', p_revision->>'summary',
      p_revision->'definition', array(select jsonb_array_elements_text(p_revision->'requires'->'bindingKinds')),
      p_user_id, (p_revision->>'publishedAt')::timestamptz)
    returning * into r;
  return public.system_version_revision_json(r, src.business_workspace_id);
end;
$$;

-- Creates a Version in its own business. Only the shareable definition is
-- copied: overrides, bindings, data, releases, decisions and grants start
-- empty. The source must be the business's own or shared with it.
create function public.create_system_version(p_user_id uuid, p_verified_email text, p_lineage jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.system_versions; r public.system_version_source_revisions; src public.system_version_sources;
  business uuid; v_system uuid; scope record;
begin
  if p_lineage is null or jsonb_typeof(p_lineage) <> 'object'
    or jsonb_typeof(p_lineage->'version') <> 'object' or jsonb_typeof(p_lineage->'source') <> 'object'
    or jsonb_typeof(p_lineage->'baseline') <> 'object' or jsonb_typeof(p_lineage->'context') <> 'object'
    or p_lineage->'overrides' <> '[]'::jsonb or p_lineage->'bindings' <> '[]'::jsonb or p_lineage->'releases' <> '[]'::jsonb
    or p_lineage->'decisions' <> '[]'::jsonb or p_lineage->'grants' <> '[]'::jsonb or p_lineage->'localData' <> '{}'::jsonb
    or p_lineage->'currentRelease' <> 'null'::jsonb or p_lineage->'rowRevision' <> '1'::jsonb
    or (p_lineage->>'createdBy') is distinct from p_user_id::text then
    raise exception 'system_version_input_invalid';
  end if;
  business := (p_lineage->'version'->>'businessId')::uuid;
  v_system := (p_lineage->'version'->>'systemId')::uuid;
  scope := public.system_actor_scope(business, p_user_id, p_verified_email, true);
  if scope.access not in ('owner','admin','agency') then raise exception 'business_record_access_denied'; end if;
  perform public.system_load(business, v_system, true, scope.work_ids);
  if exists (select 1 from public.system_versions where id = (p_lineage->>'id')::uuid) then raise exception 'system_version_exists'; end if;
  if exists (select 1 from public.system_versions sv where sv.version_system_id = v_system)
    or exists (select 1 from public.system_version_sources vs where vs.system_id = v_system) then
    raise exception 'system_version_input_invalid';
  end if;
  select * into src from public.system_version_sources
    where system_version_sources.system_id = (p_lineage->'source'->>'systemId')::uuid
      and system_version_sources.business_workspace_id = (p_lineage->'source'->>'businessId')::uuid;
  if not found or not (src.business_workspace_id = business or exists (select 1 from public.system_version_source_shares s
      where s.source_system_id = src.system_id and s.grantee_workspace_id = business and s.revoked_at is null)) then
    raise exception 'business_record_access_denied';
  end if;
  select * into r from public.system_version_source_revisions
    where source_system_id = src.system_id and number = (p_lineage->'baseline'->>'revision')::integer;
  if not found or r.definition <> p_lineage->'baseline'->'definition' then raise exception 'system_version_input_invalid'; end if;
  insert into public.system_versions(id, version_system_id, business_workspace_id, source_system_id, source_workspace_id,
      context_kind, context_label, baseline_revision_id, baseline_revision, baseline_definition, created_by, created_at, updated_at)
    values ((p_lineage->>'id')::uuid, v_system, business, src.system_id, src.business_workspace_id,
      p_lineage->'context'->>'kind', p_lineage->'context'->>'label', r.id, r.number, r.definition, p_user_id,
      (p_lineage->>'createdAt')::timestamptz, (p_lineage->>'updatedAt')::timestamptz)
    returning * into v;
  return public.system_version_json(v, 'full', p_user_id, p_verified_email);
end;
$$;

-- Compare-and-set save of one Version. Rechecks the actor on the Version's
-- own System. A member changes only local data. History only grows; a new
-- release also records and activates a system_revisions row on the Version's
-- System through the spine's own record_system_revision.
create function public.save_system_version(
  p_user_id uuid, p_verified_email text, p_version_id uuid, p_expected_row_revision bigint, p_lineage jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.system_versions; a record; r public.system_version_source_revisions; s public.systems;
  item jsonb; idx integer; existing integer; impl jsonb; spine jsonb; released_count integer;
  manager boolean;
begin
  if p_lineage is null or jsonb_typeof(p_lineage) <> 'object' or (p_lineage->>'id') is distinct from p_version_id::text
    or jsonb_typeof(p_lineage->'overrides') <> 'array' or jsonb_typeof(p_lineage->'bindings') <> 'array'
    or jsonb_typeof(p_lineage->'releases') <> 'array' or jsonb_typeof(p_lineage->'decisions') <> 'array'
    or jsonb_typeof(p_lineage->'grants') <> 'array' or jsonb_typeof(p_lineage->'localData') <> 'object'
    or jsonb_typeof(p_lineage->'baseline') <> 'object' or p_expected_row_revision is null then
    raise exception 'system_version_input_invalid';
  end if;
  select * into v from public.system_versions where id = p_version_id for update;
  if not found then raise exception 'system_not_found'; end if;
  a := public.system_version_access(v, p_user_id, p_verified_email, true);
  if a.access is distinct from 'full' then raise exception 'business_record_access_denied'; end if;
  if v.row_revision <> p_expected_row_revision then raise exception 'system_version_stale'; end if;
  manager := a.actor_role in ('owner','admin','agency');
  if p_lineage->'version' <> jsonb_build_object('businessId', v.business_workspace_id, 'systemId', v.version_system_id)
    or p_lineage->'source' <> jsonb_build_object('businessId', v.source_workspace_id, 'systemId', v.source_system_id)
    or p_lineage->'context' <> jsonb_build_object('kind', v.context_kind, 'label', v.context_label) then
    raise exception 'system_version_identity_immutable';
  end if;

  if not manager then
    -- A plain member changes local data only; everything else must be as stored.
    if (public.system_version_json(v, 'full', p_user_id, p_verified_email) - array['localData','rowRevision','updatedAt']::text[])
        <> (p_lineage - array['localData','rowRevision','updatedAt']::text[]) then
      raise exception 'business_record_access_denied';
    end if;
  end if;

  -- Baseline: forward only, and exactly a published revision's definition.
  if (p_lineage->'baseline'->>'revision')::integer <> v.baseline_revision then
    select * into r from public.system_version_source_revisions
      where source_system_id = v.source_system_id and number = (p_lineage->'baseline'->>'revision')::integer;
    if not found or r.number < v.baseline_revision then raise exception 'system_version_baseline_backward'; end if;
  else
    select * into r from public.system_version_source_revisions where id = v.baseline_revision_id;
  end if;
  if r.definition <> p_lineage->'baseline'->'definition' then raise exception 'system_version_input_invalid'; end if;

  -- Overrides: replaced as a set, in order.
  delete from public.system_version_overrides where version_id = v.id;
  idx := 0;
  for item in select value from jsonb_array_elements(p_lineage->'overrides') loop
    insert into public.system_version_overrides(version_id, position, path, value, set_by, set_at)
      values (v.id, idx, item->>'path', item->'value', (item->>'setBy')::uuid, (item->>'setAt')::timestamptz);
    idx := idx + 1;
  end loop;

  -- Bindings: only this business's own accounts; a dropped one is released.
  for item in select value from jsonb_array_elements(p_lineage->'bindings') loop
    if (item->>'ownerBusinessId') is distinct from v.business_workspace_id::text
      or public.system_version_connection_owner(item->>'connectionId') is distinct from v.business_workspace_id then
      raise exception 'system_version_binding_foreign';
    end if;
  end loop;
  update public.system_version_bindings b set released_at = clock_timestamp()
    where b.version_id = v.id and b.released_at is null and not exists (select 1 from jsonb_array_elements(p_lineage->'bindings') x
      where x.value->>'kind' = b.kind and x.value->>'connectionId' = b.connection_ref);
  begin
    insert into public.system_version_bindings(version_id, kind, connection_ref, owner_workspace_id, bound_by, bound_at)
      select v.id, x.value->>'kind', x.value->>'connectionId', v.business_workspace_id, (x.value->>'boundBy')::uuid, (x.value->>'boundAt')::timestamptz
      from jsonb_array_elements(p_lineage->'bindings') x
      where not exists (select 1 from public.system_version_bindings b where b.version_id = v.id and b.released_at is null
        and b.kind = x.value->>'kind' and b.connection_ref = x.value->>'connectionId');
  exception when unique_violation then
    raise exception 'system_version_binding_taken';
  end;

  -- Releases: earlier ones unchanged; new ones numbered next, by this actor.
  select count(*) into existing from public.system_version_releases where version_id = v.id;
  if jsonb_array_length(p_lineage->'releases') < existing then raise exception 'system_version_history_immutable'; end if;
  if exists (select 1 from public.system_version_releases r2
      where r2.version_id = v.id and ((p_lineage->'releases'->(r2.number - 1)->>'number')::integer is distinct from r2.number
        or (p_lineage->'releases'->(r2.number - 1)->'definition') is distinct from r2.definition)) then
    raise exception 'system_version_history_immutable';
  end if;
  released_count := existing;
  for idx in existing .. jsonb_array_length(p_lineage->'releases') - 1 loop
    item := p_lineage->'releases'->idx;
    if (item->>'number')::integer <> idx + 1 or (item->>'releasedBy') is distinct from p_user_id::text
      or jsonb_typeof(item->'definition') <> 'object' then
      raise exception 'system_version_input_invalid';
    end if;
    select * into s from public.systems where id = v.version_system_id;
    impl := jsonb_build_object('kind', 'system_version_release',
      'ref', 'system_version_release:' || v.id::text || ':' || (idx + 1)::text,
      'contentHash', encode(sha256(convert_to((item->'definition')::text, 'UTF8')), 'hex'));
    spine := public.record_system_revision(v.business_workspace_id, p_user_id, p_verified_email, v.version_system_id,
      s.change_number, jsonb_build_object('implementation', impl, 'summary', 'Version release ' || (idx + 1)::text),
      public.system_version_uuid('release:' || v.id::text || ':' || (idx + 1)::text),
      encode(sha256(convert_to(impl::text, 'UTF8')), 'hex'), true);
    insert into public.system_version_releases(version_id, number, definition, baseline_revision, override_paths,
        system_revision_id, released_by, released_at)
      values (v.id, idx + 1, item->'definition', (item->>'baselineRevision')::integer,
        array(select jsonb_array_elements_text(coalesce(item->'overridePaths', '[]'::jsonb))),
        (spine->'revision'->>'id')::uuid, p_user_id, (item->>'releasedAt')::timestamptz);
    released_count := idx + 1;
  end loop;
  if (p_lineage->'currentRelease') is distinct from 'null'::jsonb
    and ((p_lineage->>'currentRelease')::integer < 1 or (p_lineage->>'currentRelease')::integer > released_count) then
    raise exception 'system_version_input_invalid';
  end if;

  -- Decisions: append-only, by this actor.
  select count(*) into existing from public.system_version_decisions where version_id = v.id;
  if jsonb_array_length(p_lineage->'decisions') < existing or exists (select 1 from public.system_version_decisions d
      where d.version_id = v.id and ((p_lineage->'decisions'->d.position->>'sourceRevision')::integer is distinct from d.source_revision
        or p_lineage->'decisions'->d.position->>'choice' is distinct from d.choice)) then
    raise exception 'system_version_history_immutable';
  end if;
  for idx in existing .. jsonb_array_length(p_lineage->'decisions') - 1 loop
    item := p_lineage->'decisions'->idx;
    if (item->>'by') is distinct from p_user_id::text then raise exception 'system_version_input_invalid'; end if;
    insert into public.system_version_decisions(version_id, position, source_revision, choice, resolutions, reason, decided_by, decided_at)
      values (v.id, idx, (item->>'sourceRevision')::integer, item->>'choice', coalesce(item->'resolutions', '[]'::jsonb),
        item->>'reason', p_user_id, (item->>'at')::timestamptz);
  end loop;

  -- Grants: earlier ones may only be revoked; new ones by this actor.
  select count(*) into existing from public.system_version_grants where version_id = v.id;
  if jsonb_array_length(p_lineage->'grants') < existing or exists (select 1 from public.system_version_grants g
      where g.version_id = v.id and ((p_lineage->'grants'->g.position->>'granteeBusinessId') is distinct from g.grantee_workspace_id::text
        or p_lineage->'grants'->g.position->>'scope' is distinct from g.scope
        or (g.revoked_at is not null and not (p_lineage->'grants'->g.position ? 'revokedAt')))) then
    raise exception 'system_version_history_immutable';
  end if;
  update public.system_version_grants g set revoked_at = (p_lineage->'grants'->g.position->>'revokedAt')::timestamptz
    where g.version_id = v.id and g.revoked_at is null and p_lineage->'grants'->g.position ? 'revokedAt';
  for idx in existing .. jsonb_array_length(p_lineage->'grants') - 1 loop
    item := p_lineage->'grants'->idx;
    if (item->>'grantedBy') is distinct from p_user_id::text then raise exception 'system_version_input_invalid'; end if;
    insert into public.system_version_grants(version_id, position, grantee_workspace_id, scope, granted_by, granted_at, revoked_at)
      values (v.id, idx, (item->>'granteeBusinessId')::uuid, item->>'scope', p_user_id, (item->>'grantedAt')::timestamptz,
        (item->>'revokedAt')::timestamptz);
  end loop;

  update public.system_versions set
    baseline_revision_id = r.id, baseline_revision = r.number, baseline_definition = r.definition,
    local_data = p_lineage->'localData',
    current_release = case when p_lineage->'currentRelease' = 'null'::jsonb then null else (p_lineage->>'currentRelease')::integer end,
    row_revision = row_revision + 1,
    updated_at = coalesce((p_lineage->>'updatedAt')::timestamptz, clock_timestamp())
  where id = v.id returning * into v;
  return public.system_version_json(v, 'full', p_user_id, p_verified_email);
end;
$$;

-- What the workspace's Systems view needs about Versions, in the actor's
-- scope: the hidden sources it must not list, and each Version System's
-- source, context and siblings (other Versions of the same source in this
-- business). Read-only.
create function public.read_business_versions(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare scope record;
begin
  scope := public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, false);
  return jsonb_build_object(
    'businessId', p_workspace_id,
    'hiddenSources', coalesce((select jsonb_agg(src.system_id order by src.system_id) from public.system_version_sources src
      where src.business_workspace_id = p_workspace_id and src.hidden), '[]'::jsonb),
    'versions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', v.id, 'systemId', v.version_system_id,
        'source', jsonb_build_object('businessId', v.source_workspace_id, 'systemId', v.source_system_id,
          'name', case when v.source_workspace_id = p_workspace_id then ss.name else null end,
          'hidden', src.hidden),
        'context', jsonb_build_object('kind', v.context_kind, 'label', v.context_label),
        'baselineRevision', v.baseline_revision,
        'latestRevision', (select max(r.number) from public.system_version_source_revisions r where r.source_system_id = v.source_system_id),
        'currentRelease', v.current_release,
        'declined', coalesce((select jsonb_agg(d.source_revision order by d.position) from public.system_version_decisions d
          where d.version_id = v.id and d.choice = 'declined'), '[]'::jsonb),
        'siblings', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'systemId', o.version_system_id,
            'context', jsonb_build_object('kind', o.context_kind, 'label', o.context_label)) order by o.context_label)
          from public.system_versions o join public.systems os on os.id = o.version_system_id
          where o.source_system_id = v.source_system_id and o.business_workspace_id = p_workspace_id and o.id <> v.id
            and public.system_in_scope(p_workspace_id, os.origin_kind, os.origin_ref, scope.work_ids)), '[]'::jsonb))
        order by v.context_label, v.id)
      from public.system_versions v
      join public.systems vs on vs.id = v.version_system_id
      join public.system_version_sources src on src.system_id = v.source_system_id
      join public.systems ss on ss.id = v.source_system_id
      where v.business_workspace_id = p_workspace_id
        and public.system_in_scope(p_workspace_id, vs.origin_kind, vs.origin_ref, scope.work_ids)), '[]'::jsonb));
end;
$$;

-- The sources a workspace keeps (an agency's Library, or a business's own
-- same-business sources), with revisions and the Versions of each the actor
-- may read: those in its business scope, or granted to a business it is in.
create function public.read_workspace_version_sources(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare result jsonb := '[]'::jsonb; src public.system_version_sources; v public.system_versions; a record;
  versions jsonb;
begin
  if public.system_version_member_role(p_workspace_id, p_user_id, p_verified_email) is null then
    raise exception 'business_record_access_denied';
  end if;
  for src in select * from public.system_version_sources where business_workspace_id = p_workspace_id order by created_at, system_id loop
    versions := '[]'::jsonb;
    for v in select * from public.system_versions where source_system_id = src.system_id order by business_workspace_id, context_label, id loop
      a := public.system_version_access(v, p_user_id, p_verified_email, false);
      if a.access is null then continue; end if;
      versions := versions || jsonb_build_array(jsonb_build_object(
        'versionId', v.id, 'workspaceId', v.business_workspace_id,
        'clientName', (select name from public.workspaces where id = v.business_workspace_id),
        'systemId', v.version_system_id, 'systemName', (select name from public.systems where id = v.version_system_id),
        'access', a.access));
    end loop;
    result := result || jsonb_build_array(jsonb_build_object(
      'systemId', src.system_id, 'workspaceId', src.business_workspace_id, 'hidden', src.hidden,
      'name', (select name from public.systems where id = src.system_id),
      'revisions', coalesce((select jsonb_agg(jsonb_build_object('number', r.number, 'label', r.label, 'summary', r.summary,
        'publishedAt', public.system_version_ts(r.published_at)) order by r.number)
        from public.system_version_source_revisions r where r.source_system_id = src.system_id), '[]'::jsonb),
      'versions', versions));
  end loop;
  return jsonb_build_object('workspaceId', p_workspace_id, 'sources', result);
end;
$$;

revoke all on function public.system_version_history_immutable() from public, anon, authenticated, service_role;
revoke all on function public.system_version_identity_guard() from public, anon, authenticated, service_role;
revoke all on function public.system_version_ts(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.system_version_member_role(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.system_version_actor_workspaces(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.system_version_assert_source_manager(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.system_version_source_visible(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.system_version_connection_owner(text) from public, anon, authenticated, service_role;
revoke all on function public.system_version_access(public.system_versions, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.system_version_source_json(public.system_version_sources, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.system_version_revision_json(public.system_version_source_revisions, uuid) from public, anon, authenticated, service_role;
revoke all on function public.system_version_json(public.system_versions, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.system_version_uuid(text) from public, anon, authenticated, service_role;

revoke all on function public.read_version_actor(uuid, text) from public, anon, authenticated;
revoke all on function public.read_system_version_connection_owner(uuid, text, text) from public, anon, authenticated;
revoke all on function public.read_system_version_source(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.read_system_version_source_revisions(uuid, uuid, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.read_system_version(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.read_system_version_for_system(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.system_version_connection_holder(uuid, text, text) from public, anon, authenticated;
revoke all on function public.create_system_version_source(uuid, uuid, text, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.put_system_version_source(uuid, uuid, text, uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.publish_system_version_source_revision(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_system_version(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.save_system_version(uuid, text, uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.read_business_versions(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.read_workspace_version_sources(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.read_version_actor(uuid, text) to service_role;
grant execute on function public.read_system_version_connection_owner(uuid, text, text) to service_role;
grant execute on function public.read_system_version_source(uuid, uuid, text, uuid) to service_role;
grant execute on function public.read_system_version_source_revisions(uuid, uuid, text, uuid, integer) to service_role;
grant execute on function public.read_system_version(uuid, text, uuid) to service_role;
grant execute on function public.read_system_version_for_system(uuid, uuid, text, uuid) to service_role;
grant execute on function public.system_version_connection_holder(uuid, text, text) to service_role;
grant execute on function public.create_system_version_source(uuid, uuid, text, jsonb, uuid, text) to service_role;
grant execute on function public.put_system_version_source(uuid, uuid, text, uuid, uuid[]) to service_role;
grant execute on function public.publish_system_version_source_revision(uuid, text, jsonb) to service_role;
grant execute on function public.create_system_version(uuid, text, jsonb) to service_role;
grant execute on function public.save_system_version(uuid, text, uuid, bigint, jsonb) to service_role;
grant execute on function public.read_business_versions(uuid, uuid, text) to service_role;
grant execute on function public.read_workspace_version_sources(uuid, uuid, text) to service_role;
