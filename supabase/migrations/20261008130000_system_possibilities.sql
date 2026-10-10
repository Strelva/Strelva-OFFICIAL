-- Possibilities in Postgres, beside the System spine (20261004120000_systems.sql).
-- Additive only. It does not alter tenants, Redis, /api/v1 or any existing
-- function; it adds tables, service-role RPCs and two triggers.
--
-- Shape
--   system_possibilities         one Possibility (src/platform/possibilities):
--                                status and revision as columns, the document
--                                (possibilitySchema, without its history) as
--                                `body`. `source_ref` names what it was built
--                                from, e.g. `website-rebuild:<workId>`, unique
--                                per business so a backfill never doubles.
--   system_possibility_pins      the System revisions a Possibility changes,
--                                one per System. Rewritten from body.changes
--                                on every save.
--   system_possibility_events    append-only history (replaces the
--                                1000-entry `history` array in the body).
--   system_revision_contents     content-addressed candidate content that a
--                                `make_real_content` revision names. Immutable.
--
-- Rules held here
--   * every write is compare-and-set on `revision` (expected + n, with one
--     history event per new revision), through actor-checked RPCs that reuse
--     system_actor_scope: a direct owner or admin writes, a member reads, an
--     agency reaches only Possibilities whose every pin lies in its scope;
--   * made_real and withdrawn are closed;
--   * a save that says `ready` is refused while any pin is behind its System's
--     current revision (system_possibility_stale);
--   * stale is automatic: when a System's current revision moves, by any path
--     (record_system_revision, set_system_current_revision, an observed native
--     edit, a restore), every open Possibility pinning an older revision of it
--     goes back to Exploring in the same transaction, unless that Possibility
--     is itself being made real; its open Needs you item is withdrawn with
--     "This changed since we emailed you.";
--   * Strelva withdraws a Possibility idle for 90 days, with an event as the
--     receipt (withdraw_idle_system_possibilities, from the existing cron);
--   * a converted tenant's website and inquiry Systems are stored at
--     conversion with revision 1 (trigger on tenant_workspace_links);
--   * a tenant content edit records an observed revision
--     (observe_tenant_content), and deprovisioning pauses the stored System
--     (pause_tenant_systems).
--
-- All tables are RLS-on with every grant revoked; only the service-role RPCs
-- below reach them.

create table public.system_possibilities (
  id uuid primary key,
  business_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status text not null check (status in ('exploring','ready','made_real','withdrawn')),
  revision integer not null check (revision >= 0),
  candidate_revision integer not null check (candidate_revision > 0),
  source_ref text check (source_ref is null or (char_length(source_ref) between 1 and 200 and source_ref = btrim(source_ref))),
  body jsonb not null check (jsonb_typeof(body) = 'object' and octet_length(body::text) <= 512000),
  activation_id text check (activation_id is null or char_length(activation_id) between 1 and 120),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  last_activity_at timestamptz not null default clock_timestamp(),
  unique (id, business_workspace_id)
);
create unique index system_possibilities_source_idx on public.system_possibilities(business_workspace_id, source_ref)
  where source_ref is not null;
create index system_possibilities_business_idx on public.system_possibilities(business_workspace_id, created_at, id);
create index system_possibilities_idle_idx on public.system_possibilities(last_activity_at)
  where status in ('exploring','ready') and activation_id is null;

create table public.system_possibility_pins (
  possibility_id uuid not null,
  business_workspace_id uuid not null,
  system_id uuid not null,
  revision_id uuid not null references public.system_revisions(id) on delete cascade,
  primary key (possibility_id, system_id),
  foreign key (possibility_id, business_workspace_id) references public.system_possibilities(id, business_workspace_id) on delete cascade,
  foreign key (system_id, business_workspace_id) references public.systems(id, business_workspace_id) on delete cascade
);
create index system_possibility_pins_system_idx on public.system_possibility_pins(system_id);

create table public.system_possibility_events (
  id bigserial primary key,
  possibility_id uuid not null,
  business_workspace_id uuid not null,
  revision integer not null check (revision > 0),
  kind text not null check (char_length(kind) between 1 and 40),
  actor_id text not null check (char_length(actor_id) between 1 and 200),
  at timestamptz not null,
  detail text check (detail is null or char_length(detail) <= 1000),
  created_at timestamptz not null default clock_timestamp(),
  unique (possibility_id, revision),
  foreign key (possibility_id, business_workspace_id) references public.system_possibilities(id, business_workspace_id) on delete cascade
);

create table public.system_revision_contents (
  business_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  content jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 512000),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  primary key (business_workspace_id, content_hash)
);

alter table public.system_possibilities enable row level security;
alter table public.system_possibility_pins enable row level security;
alter table public.system_possibility_events enable row level security;
alter table public.system_revision_contents enable row level security;
revoke all on public.system_possibilities, public.system_possibility_pins, public.system_possibility_events,
  public.system_revision_contents from public, anon, authenticated, service_role;
revoke all on sequence public.system_possibility_events_id_seq from public, anon, authenticated, service_role;

-- Events and stored content never change. Deletion only follows the owner row.
create function public.system_possibility_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.system_possibilities where id = old.possibility_id) then
    return old;
  end if;
  raise exception 'system_possibility_immutable';
end;
$$;
create trigger system_possibility_events_append_only before update or delete on public.system_possibility_events
  for each row execute function public.system_possibility_append_only();

create function public.system_revision_content_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.workspaces where id = old.business_workspace_id) then
    return old;
  end if;
  raise exception 'system_possibility_immutable';
end;
$$;
create trigger system_revision_contents_immutable before update or delete on public.system_revision_contents
  for each row execute function public.system_revision_content_immutable();

-- ---- helpers ----

create function public.system_possibility_time(p_at timestamptz) returns text
language sql immutable set search_path = public, pg_temp as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

-- An agency sees a Possibility only when every System it changes lies in
-- its scope, and it changes at least one. A direct member sees them all.
create function public.system_possibility_in_scope(p_id uuid, p_workspace_id uuid, p_work_ids uuid[]) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_work_ids is null or (
    exists (select 1 from public.system_possibility_pins pin where pin.possibility_id = p_id)
    and not exists (select 1 from public.system_possibility_pins pin join public.systems s on s.id = pin.system_id
      where pin.possibility_id = p_id
        and not public.system_in_scope(p_workspace_id, s.origin_kind, s.origin_ref, p_work_ids)))
$$;

-- The stored body plus its newest history events, oldest first.
create function public.system_possibility_json(p public.system_possibilities, p_history integer) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select p.body || jsonb_build_object('history', coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'revision', e.revision, 'kind', e.kind, 'actorId', e.actor_id,
      'at', public.system_possibility_time(e.at), 'detail', e.detail)) order by e.revision)
    from (select * from public.system_possibility_events where possibility_id = p.id
      order by revision desc limit greatest(p_history, 0)) e), '[]'::jsonb))
$$;

-- The pins a body declares, checked against this business.
create function public.system_possibility_write_pins(p_id uuid, p_workspace_id uuid, p_body jsonb, p_work_ids uuid[]) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c jsonb; s public.systems;
begin
  delete from public.system_possibility_pins where possibility_id = p_id;
  for c in select value from jsonb_array_elements(coalesce(p_body->'changes', '[]'::jsonb)) loop
    if c->'baseline'->>'businessId' is distinct from p_workspace_id::text then raise exception 'system_possibility_invalid'; end if;
    select * into s from public.systems
      where id = (c->'baseline'->>'systemId')::uuid and business_workspace_id = p_workspace_id;
    if not found or not public.system_in_scope(p_workspace_id, s.origin_kind, s.origin_ref, p_work_ids) then
      raise exception 'system_not_found';
    end if;
    if not exists (select 1 from public.system_revisions r
        where r.id = (c->'baseline'->>'revisionId')::uuid and r.system_id = s.id) then
      raise exception 'system_possibility_invalid';
    end if;
    insert into public.system_possibility_pins(possibility_id, business_workspace_id, system_id, revision_id)
      values (p_id, p_workspace_id, s.id, (c->'baseline'->>'revisionId')::uuid);
  end loop;
end;
$$;

create function public.system_possibility_body_valid(p jsonb, p_workspace_id uuid) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select jsonb_typeof(p) = 'object' and p->>'version' = '1'
    and p->>'businessId' = p_workspace_id::text
    and (p->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and p->>'status' in ('exploring','ready','made_real','withdrawn')
    and jsonb_typeof(p->'revision') = 'number' and jsonb_typeof(p->'candidateRevision') = 'number'
    and (p->>'candidateRevision')::numeric >= 1
    and jsonb_typeof(p->'changes') = 'array' and jsonb_typeof(p->'history') = 'array'
    and (p->'activationId' is null or jsonb_typeof(p->'activationId') = 'string')
$$;

-- ---- reads ----

create function public.read_system_possibility(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_possibility_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; p public.system_possibilities;
begin
  v := public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, false);
  select * into p from public.system_possibilities where id = p_possibility_id and business_workspace_id = p_workspace_id;
  if not found or not public.system_possibility_in_scope(p.id, p_workspace_id, v.work_ids) then return null; end if;
  return public.system_possibility_json(p, 200);
end;
$$;

create function public.list_system_possibilities(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record;
begin
  v := public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, false);
  return coalesce((select jsonb_agg(jsonb_build_object('sourceRef', p.source_ref,
      'lastActivityAt', public.system_possibility_time(p.last_activity_at),
      'possibility', public.system_possibility_json(p, 20)) order by p.created_at, p.id)
    from (select * from public.system_possibilities where business_workspace_id = p_workspace_id
      order by created_at desc, id limit 200) p
    where public.system_possibility_in_scope(p.id, p_workspace_id, v.work_ids)), '[]'::jsonb);
end;
$$;

-- The signed preview link (Try it) is verified in the application, bound to
-- {workspace, possibility, candidate revision}. No actor: the link is the
-- authority, and it shows only an open candidate whose revision still matches.
create function public.read_system_possibility_preview(p_workspace_id uuid, p_possibility_id uuid, p_candidate_revision integer)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select p.body - 'history' - 'consumedApprovalIds' - 'keyEpochs' - 'createdBy'
    from public.system_possibilities p
    where p.id = p_possibility_id and p.business_workspace_id = p_workspace_id
      and p.status in ('exploring','ready') and p.candidate_revision = p_candidate_revision
$$;

-- ---- writes ----

create function public.create_system_possibility(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_body jsonb, p_source_ref text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; p public.system_possibilities; v_id uuid;
begin
  v := public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, true);
  if not public.system_possibility_body_valid(p_body, p_workspace_id) or (p_body->>'revision')::int <> 0
    or jsonb_array_length(p_body->'history') <> 0 or p_body->>'status' <> 'exploring' or p_body ? 'activationId'
    or (p_source_ref is not null and (char_length(p_source_ref) not between 1 and 200 or p_source_ref <> btrim(p_source_ref))) then
    raise exception 'system_possibility_invalid';
  end if;
  v_id := (p_body->>'id')::uuid;
  if p_source_ref is not null then
    select * into p from public.system_possibilities where business_workspace_id = p_workspace_id and source_ref = p_source_ref;
    if found then
      if not public.system_possibility_in_scope(p.id, p_workspace_id, v.work_ids) then raise exception 'system_not_found'; end if;
      return public.system_possibility_json(p, 200) || jsonb_build_object('replayed', true);
    end if;
  end if;
  if exists (select 1 from public.system_possibilities where id = v_id) then raise exception 'system_possibility_exists'; end if;
  insert into public.system_possibilities(id, business_workspace_id, status, revision, candidate_revision, source_ref, body, created_by)
    values (v_id, p_workspace_id, 'exploring', 0, (p_body->>'candidateRevision')::int, p_source_ref, p_body - 'history', p_user_id)
    returning * into p;
  perform public.system_possibility_write_pins(p.id, p_workspace_id, p_body, v.work_ids);
  -- An agency creates only what it can see.
  if not public.system_possibility_in_scope(p.id, p_workspace_id, v.work_ids) then raise exception 'business_record_access_denied'; end if;
  return public.system_possibility_json(p, 200);
end;
$$;

create function public.save_system_possibility(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_possibility_id uuid, p_expected_revision integer, p_body jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record; p public.system_possibilities; v_next integer; e jsonb; n integer;
begin
  v := public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, true);
  select * into p from public.system_possibilities
    where id = p_possibility_id and business_workspace_id = p_workspace_id for update;
  if not found or not public.system_possibility_in_scope(p.id, p_workspace_id, v.work_ids) then
    raise exception 'system_possibility_not_found';
  end if;
  if p.revision <> p_expected_revision then raise exception 'system_possibility_revision_conflict'; end if;
  if p.status in ('made_real','withdrawn') then raise exception 'system_possibility_closed'; end if;
  if not public.system_possibility_body_valid(p_body, p_workspace_id) or (p_body->>'id')::uuid <> p.id then
    raise exception 'system_possibility_invalid';
  end if;
  v_next := (p_body->>'revision')::int;
  if v_next <= p.revision or v_next > p.revision + 20 or (p_body->>'createdAt') is distinct from (p.body->>'createdAt')
    or (p_body->>'createdBy') is distinct from (p.body->>'createdBy') then
    raise exception 'system_possibility_invalid';
  end if;
  -- Exactly one new history event per new revision, written now.
  n := 0;
  for e in select value from jsonb_array_elements(p_body->'history') where (value->>'revision')::int > p.revision loop
    n := n + 1;
    if jsonb_typeof(e->'kind') <> 'string' or jsonb_typeof(e->'actorId') <> 'string' then raise exception 'system_possibility_invalid'; end if;
    insert into public.system_possibility_events(possibility_id, business_workspace_id, revision, kind, actor_id, at, detail)
      values (p.id, p_workspace_id, (e->>'revision')::int, left(e->>'kind', 40), left(e->>'actorId', 200),
        (e->>'at')::timestamptz, left(e->>'detail', 1000));
  end loop;
  if n <> v_next - p.revision
    or (select count(*) from public.system_possibility_events where possibility_id = p.id and revision > p.revision) <> n then
    raise exception 'system_possibility_invalid';
  end if;
  perform public.system_possibility_write_pins(p.id, p_workspace_id, p_body, v.work_ids);
  if not public.system_possibility_in_scope(p.id, p_workspace_id, v.work_ids) then raise exception 'business_record_access_denied'; end if;
  -- Ready only against current revisions: closes the race with a live edit
  -- that lands between the application's check and this save.
  if p_body->>'status' = 'ready' and p_body->'activationId' is null and exists (
      select 1 from public.system_possibility_pins pin join public.systems s on s.id = pin.system_id
      where pin.possibility_id = p.id and s.current_revision_id is distinct from pin.revision_id) then
    raise exception 'system_possibility_stale';
  end if;
  update public.system_possibilities set status = p_body->>'status', revision = v_next,
      candidate_revision = (p_body->>'candidateRevision')::int, body = p_body - 'history',
      activation_id = p_body->>'activationId', updated_at = clock_timestamp(), last_activity_at = clock_timestamp()
    where id = p.id returning * into p;
  return public.system_possibility_json(p, 200);
end;
$$;

-- ---- the stale rule ----

-- Same transaction as the pointer move, whatever moved it.
create function public.system_possibilities_follow_revision() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.system_possibilities; v_at timestamptz := clock_timestamp(); v_detail text; d record;
begin
  v_detail := left(new.name || ' changed since this was built.', 1000);
  for p in select sp.* from public.system_possibilities sp
      where sp.business_workspace_id = new.business_workspace_id
        and sp.status in ('exploring','ready') and sp.activation_id is null
        and exists (select 1 from public.system_possibility_pins pin where pin.possibility_id = sp.id
          and pin.system_id = new.id and pin.revision_id is distinct from new.current_revision_id)
      order by sp.id for update of sp loop
    -- Already exploring with no rehearsal: nothing it claimed is now wrong.
    if p.status = 'exploring' and not (p.body ? 'rehearsal') then continue; end if;
    update public.system_possibilities set status = 'exploring', revision = p.revision + 1,
        body = (p.body - 'rehearsal') || jsonb_build_object('status', 'exploring', 'revision', p.revision + 1,
          'updatedAt', public.system_possibility_time(v_at)),
        updated_at = v_at
      where id = p.id;
    insert into public.system_possibility_events(possibility_id, business_workspace_id, revision, kind, actor_id, at, detail)
      values (p.id, p.business_workspace_id, p.revision + 1, 'stale', new.updated_by::text, v_at, v_detail);
    -- An emailed ask for the old candidate no longer stands.
    for d in select id from public.owner_decisions
        where workspace_id = p.business_workspace_id and source_lifecycle = 'make_real'
          and source_id = p.id::text and state = 'open' loop
      perform public.withdraw_owner_decision(p.business_workspace_id, d.id, 'This changed since we emailed you.');
    end loop;
  end loop;
  return null;
end;
$$;
create trigger systems_possibilities_follow_revision after update of current_revision_id on public.systems
  for each row when (old.current_revision_id is distinct from new.current_revision_id)
  execute function public.system_possibilities_follow_revision();

-- ---- idle withdraw (spec decision 6) ----

create function public.withdraw_idle_system_possibilities(p_idle_days integer, p_limit integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.system_possibilities; v_at timestamptz := clock_timestamp(); v_out jsonb := '[]'::jsonb;
begin
  if p_idle_days is null or p_idle_days < 30 or p_limit is null or p_limit not between 1 and 500 then
    raise exception 'system_possibility_invalid';
  end if;
  for p in select * from public.system_possibilities
      where status in ('exploring','ready') and activation_id is null
        and last_activity_at < v_at - make_interval(days => p_idle_days)
      order by last_activity_at, id limit p_limit for update skip locked loop
    update public.system_possibilities set status = 'withdrawn', revision = p.revision + 1,
        body = p.body || jsonb_build_object('status', 'withdrawn', 'revision', p.revision + 1,
          'updatedAt', public.system_possibility_time(v_at)),
        updated_at = v_at
      where id = p.id;
    insert into public.system_possibility_events(possibility_id, business_workspace_id, revision, kind, actor_id, at, detail)
      values (p.id, p.business_workspace_id, p.revision + 1, 'withdraw_idle', 'strelva', v_at,
        format('Strelva withdrew this after %s days without activity.', p_idle_days));
    v_out := v_out || jsonb_build_array(jsonb_build_object('workspaceId', p.business_workspace_id, 'possibilityId', p.id,
      'title', p.body->>'title'));
  end loop;
  return v_out;
end;
$$;

-- ---- revision content ----

create function public.put_system_revision_content(
  p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_content_hash text, p_content jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, true);
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' or p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'system_possibility_invalid';
  end if;
  insert into public.system_revision_contents(business_workspace_id, content_hash, content, created_by)
    values (p_workspace_id, p_content_hash, p_content, p_user_id)
    on conflict (business_workspace_id, content_hash) do nothing;
  return jsonb_build_object('contentHash', p_content_hash);
end;
$$;

create function public.read_system_revision_content(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_content_hash text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.system_actor_scope(p_workspace_id, p_user_id, p_verified_email, false);
  return (select content from public.system_revision_contents
    where business_workspace_id = p_workspace_id and content_hash = p_content_hash);
end;
$$;

-- ---- native pointers: observed revisions, adoption, pause ----

-- Records a revision naming the native pointer when it differs from the
-- System's current one, and moves the pointer (the stale rule then fires).
-- Server-side only: native edits (tenant content, a restore) have no
-- workspace actor. Authored as the System's last writer.
create function public.observe_system_revision(p_workspace_id uuid, p_system_id uuid, p_implementation jsonb, p_summary text)
returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.systems; cur jsonb; r public.system_revisions;
begin
  if p_implementation is null or jsonb_typeof(p_implementation) <> 'object'
    or (p_implementation - array['kind','ref']::text[]) <> '{}'::jsonb
    or jsonb_typeof(p_implementation->'kind') is distinct from 'string' or jsonb_typeof(p_implementation->'ref') is distinct from 'string'
    or char_length(p_implementation->>'ref') not between 1 and 400 then
    raise exception 'system_possibility_invalid';
  end if;
  select * into s from public.systems where id = p_system_id and business_workspace_id = p_workspace_id for update;
  if not found then raise exception 'system_not_found'; end if;
  if s.current_revision_id is null then return 'not_adopted'; end if;
  select implementation into cur from public.system_revisions where id = s.current_revision_id;
  if cur->>'kind' = p_implementation->>'kind' and cur->>'ref' = p_implementation->>'ref' then return 'unchanged'; end if;
  insert into public.system_revisions(system_id, business_workspace_id, number, implementation, summary, command_id, command_digest, created_by)
    values (s.id, p_workspace_id, coalesce((select max(number) from public.system_revisions where system_id = s.id), 0) + 1,
      p_implementation, left(coalesce(p_summary, 'Observed a change made outside Strelva Systems.'), 500), gen_random_uuid(),
      encode(sha256(convert_to('observed:' || s.id::text || ':' || (p_implementation->>'kind') || ':' || (p_implementation->>'ref'), 'UTF8')), 'hex'),
      s.updated_by)
    returning * into r;
  update public.systems set current_revision_id = r.id, current_revision_number = r.number,
      change_number = change_number + 1, updated_at = clock_timestamp()
    where id = s.id;
  return 'observed';
end;
$$;

-- A tenant content edit: every stored website System adopted from this tenant.
create function public.observe_tenant_content(p_tenant_id text, p_version_ref text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_stable uuid; s record; n integer := 0;
begin
  if p_tenant_id is null or p_version_ref is null or char_length(p_version_ref) not between 1 and 200 then
    raise exception 'system_possibility_invalid';
  end if;
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then return 0; end if;
  for s in select id, business_workspace_id from public.systems
      where origin_kind = 'tenant' and origin_ref = v_stable::text and kind = 'website' and current_revision_id is not null loop
    if public.observe_system_revision(s.business_workspace_id, s.id,
        jsonb_build_object('kind', 'tenant_content', 'ref', v_stable::text || '@' || p_version_ref),
        'Website content changed.') = 'observed' then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Adoption at conversion: the website System (origin tenant) and each
-- inquiry System (origin inquiry_workspace) are stored with revision 1 naming
-- the native pointer, then made Live (Paused for an inactive tenant).
-- Idempotent: an origin already stored is left as it is.
create function public.adopt_converted_tenant_systems(p_link_id uuid) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare l public.tenant_workspace_links; t record; v_version text; v_site text; n integer := 0; i record;
begin
  select * into l from public.tenant_workspace_links where id = p_link_id;
  if not found or l.tenant_stable_id is null then return 0; end if;
  select id, stable_id, site_name, coalesce(active, false) as active into t from public.tenants where stable_id = l.tenant_stable_id;
  if not found then return 0; end if;
  v_version := 'initial';
  if to_regclass('public.content_versions') is not null then
    execute 'select id::text from public.content_versions where tenant_id = $1 order by created_at desc, id desc limit 1'
      into v_version using t.id;
    v_version := coalesce(v_version, 'initial');
  end if;
  v_site := coalesce(nullif(btrim(t.site_name), ''), t.id);
  n := n + public.adopt_system_with_revision(l.workspace_id, 'tenant', t.stable_id::text, left(v_site, 160), 'website',
    jsonb_build_object('kind', 'tenant_content', 'ref', t.stable_id::text || '@' || v_version), t.active, l.linked_by);
  for i in select id, revision from public.inquiry_workspaces where tenant_stable_id = t.stable_id order by created_at, id loop
    n := n + public.adopt_system_with_revision(l.workspace_id, 'inquiry_workspace', i.id::text, left(v_site || ' inquiries', 160), 'inquiry',
      jsonb_build_object('kind', 'inquiry_config', 'ref', i.id::text || '@' || i.revision::text), t.active, l.linked_by);
  end loop;
  return n;
end;
$$;

create function public.adopt_system_with_revision(
  p_workspace_id uuid, p_origin_kind text, p_origin_ref text, p_name text, p_kind text,
  p_implementation jsonb, p_live boolean, p_actor uuid
) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; r public.system_revisions; v_digest text;
begin
  if exists (select 1 from public.systems where business_workspace_id = p_workspace_id
      and origin_kind = p_origin_kind and origin_ref = p_origin_ref) then
    return 0;
  end if;
  v_id := public.system_origin_id(p_workspace_id, p_origin_kind, p_origin_ref);
  v_digest := encode(sha256(convert_to('adopt:' || v_id::text, 'UTF8')), 'hex');
  insert into public.systems(id, business_workspace_id, name, kind, lifecycle, origin_kind, origin_ref,
      command_id, command_digest, created_by, updated_by)
    values (v_id, p_workspace_id, p_name, p_kind, 'draft', p_origin_kind, p_origin_ref,
      public.system_origin_id(p_workspace_id, 'adopt', v_id::text), v_digest, p_actor, p_actor);
  insert into public.system_revisions(system_id, business_workspace_id, number, implementation, summary, command_id, command_digest, created_by)
    values (v_id, p_workspace_id, 1, p_implementation, 'Adopted at conversion.',
      public.system_origin_id(p_workspace_id, 'adopt-revision', v_id::text), v_digest, p_actor)
    returning * into r;
  update public.systems set current_revision_id = r.id, current_revision_number = 1, lifecycle = 'live',
      change_number = change_number + 1 where id = v_id;
  if not p_live then
    update public.systems set lifecycle = 'paused', change_number = change_number + 1 where id = v_id;
  end if;
  return 1;
end;
$$;

create function public.adopt_systems_on_conversion() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.adopt_converted_tenant_systems(new.id);
  return null;
end;
$$;
create trigger tenant_workspace_links_adopt_systems after insert on public.tenant_workspace_links
  for each row execute function public.adopt_systems_on_conversion();

-- Undoing a conversion (unlink_tenant_from_business) still removes a business
-- the conversion created and nobody used. Systems stored by adoption alone
-- (revision 1, nothing after) are conversion machinery, like the operator's
-- membership, and go with it; any other System, revision or Possibility keeps
-- the business. The plan function is wrapped, not rewritten: the original
-- keeps every rule and its name moves to tenant_unlink_plan_before_systems.
alter function public.tenant_unlink_plan(uuid) rename to tenant_unlink_plan_before_systems;

create function public.tenant_unlink_plan(p_link_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare plan jsonb; v_workspace uuid; reasons jsonb;
begin
  plan := public.tenant_unlink_plan_before_systems(p_link_id);
  v_workspace := (plan->>'workspaceId')::uuid;
  if v_workspace is null or not (plan->'workspaceKeptBecause' ? 'workspace_in_use:systems') then return plan; end if;
  if exists (select 1 from public.systems s where s.business_workspace_id = v_workspace
      and (s.command_digest <> encode(sha256(convert_to('adopt:' || s.id::text, 'UTF8')), 'hex')
        or exists (select 1 from public.system_revisions r where r.system_id = s.id and r.number > 1))) then
    return plan;
  end if;
  reasons := coalesce((select jsonb_agg(r) from jsonb_array_elements(plan->'workspaceKeptBecause') r
    where r <> to_jsonb('workspace_in_use:systems'::text)), '[]'::jsonb);
  return plan || jsonb_build_object('workspaceKeptBecause', reasons, 'deleteWorkspace', jsonb_array_length(reasons) = 0);
end;
$$;

-- Deprovisioning or deactivating a tenant pauses every stored System adopted
-- from it, so a card never says Live for a dead site. Records are kept.
create function public.pause_tenant_systems(p_tenant_id text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_stable uuid; n integer;
begin
  select stable_id into v_stable from public.tenants where id = p_tenant_id;
  if v_stable is null then return 0; end if;
  update public.systems set lifecycle = 'paused', change_number = change_number + 1, updated_at = clock_timestamp()
    where lifecycle = 'live' and (
      (origin_kind = 'tenant' and origin_ref = v_stable::text)
      or (origin_kind = 'inquiry_workspace' and origin_ref in (
        select id::text from public.inquiry_workspaces where tenant_stable_id = v_stable)));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.system_possibility_append_only() from public, anon, authenticated, service_role;
revoke all on function public.system_revision_content_immutable() from public, anon, authenticated, service_role;
revoke all on function public.system_possibility_time(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.system_possibility_in_scope(uuid, uuid, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.system_possibility_json(public.system_possibilities, integer) from public, anon, authenticated, service_role;
revoke all on function public.system_possibility_write_pins(uuid, uuid, jsonb, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.system_possibility_body_valid(jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.system_possibilities_follow_revision() from public, anon, authenticated, service_role;
revoke all on function public.adopt_system_with_revision(uuid, text, text, text, text, jsonb, boolean, uuid) from public, anon, authenticated, service_role;
revoke all on function public.adopt_systems_on_conversion() from public, anon, authenticated, service_role;
revoke all on function public.observe_system_revision(uuid, uuid, jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.tenant_unlink_plan(uuid) from public, anon, authenticated, service_role;

revoke all on function public.read_system_possibility(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.list_system_possibilities(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.read_system_possibility_preview(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.create_system_possibility(uuid, uuid, text, jsonb, text) from public, anon, authenticated;
revoke all on function public.save_system_possibility(uuid, uuid, text, uuid, integer, jsonb) from public, anon, authenticated;
revoke all on function public.withdraw_idle_system_possibilities(integer, integer) from public, anon, authenticated;
revoke all on function public.put_system_revision_content(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.read_system_revision_content(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.observe_tenant_content(text, text) from public, anon, authenticated;
revoke all on function public.adopt_converted_tenant_systems(uuid) from public, anon, authenticated;
revoke all on function public.pause_tenant_systems(text) from public, anon, authenticated;

grant execute on function public.read_system_possibility(uuid, uuid, text, uuid) to service_role;
grant execute on function public.list_system_possibilities(uuid, uuid, text) to service_role;
grant execute on function public.read_system_possibility_preview(uuid, uuid, integer) to service_role;
grant execute on function public.create_system_possibility(uuid, uuid, text, jsonb, text) to service_role;
grant execute on function public.save_system_possibility(uuid, uuid, text, uuid, integer, jsonb) to service_role;
grant execute on function public.withdraw_idle_system_possibilities(integer, integer) to service_role;
grant execute on function public.put_system_revision_content(uuid, uuid, text, text, jsonb) to service_role;
grant execute on function public.read_system_revision_content(uuid, uuid, text, text) to service_role;
grant execute on function public.observe_tenant_content(text, text) to service_role;
grant execute on function public.adopt_converted_tenant_systems(uuid) to service_role;
grant execute on function public.pause_tenant_systems(text) to service_role;
