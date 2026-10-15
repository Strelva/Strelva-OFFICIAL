-- Listings in sync (20261028100300): queued checks, proposed fixes and numbered
-- Releases of a business's listings state. Service-only RPCs; no policies.
-- Reads only owner-confirmed facts. Nothing here writes to a provider.
begin;
set local lock_timeout='3s';

create table public.listing_sync_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  record_revision bigint not null,
  trigger text not null check (trigger in ('fact.confirmed','sweep','check_now','after_fix')),
  status text not null default 'queued' check (status in ('queued','running','done','failed')),
  requested_by uuid null references public.users(id) on delete set null,
  claim_token uuid null,
  readings jsonb not null default '[]' check (jsonb_typeof(readings)='array' and jsonb_array_length(readings) <= 20 and octet_length(readings::text) <= 64000),
  differs int not null default 0 check (differs >= 0),
  compared int not null default 0 check (compared >= 0),
  error text null check (error is null or char_length(error) <= 300),
  created_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  finished_at timestamptz
);
create unique index listing_sync_one_queued on public.listing_sync_checks(workspace_id) where status = 'queued';
create index listing_sync_checks_ws on public.listing_sync_checks(workspace_id, created_at desc);

create table public.listing_sync_fixes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  check_id uuid not null references public.listing_sync_checks(id) on delete cascade,
  record_revision bigint not null,
  surface_key text not null check (surface_key ~ '^[a-z]+:[A-Za-z0-9_:./-]{1,200}$'),
  fact_key text not null check (fact_key in ('phone','address','hours','special_hours','services','booking_link','page')),
  kind text not null check (kind in ('booking_hours','google_hours','google_info','site_request','owner_todo')),
  proposed jsonb not null check (jsonb_typeof(proposed)='object' and octet_length(proposed::text) <= 8000),
  status text not null default 'proposed' check (status in ('proposed','declined','applying','applied','verified','failed','superseded')),
  outcome_ref text null check (outcome_ref is null or char_length(outcome_ref) <= 200),
  reason text null check (reason is null or char_length(reason) <= 300),
  decided_by uuid null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (workspace_id, surface_key, fact_key, record_revision)
);
create index listing_sync_fixes_ws on public.listing_sync_fixes(workspace_id, record_revision);

create table public.listing_sync_releases (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  number int not null check (number >= 1),
  check_id uuid not null references public.listing_sync_checks(id) on delete cascade,
  record_revision bigint not null,
  readings jsonb not null,
  readings_hash text not null check (readings_hash ~ '^[0-9a-f]{64}$'),
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (workspace_id, number)
);

alter table public.listing_sync_checks enable row level security;
alter table public.listing_sync_fixes enable row level security;
alter table public.listing_sync_releases enable row level security;
revoke all on public.listing_sync_checks, public.listing_sync_fixes, public.listing_sync_releases from public, anon, authenticated, service_role;

-- Releases never change; they go only with their business.
create function public.listing_sync_release_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.workspaces where id = old.workspace_id) then
    return old;
  end if;
  raise exception 'listing_sync_release_immutable';
end;
$$;
create trigger listing_sync_releases_immutable before update or delete on public.listing_sync_releases
  for each row execute function public.listing_sync_release_immutable();

-- One queued check per business; a second request returns the first.
create function public.listing_sync_queue_check(p_workspace_id uuid, p_trigger text, p_requested_by uuid default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare rev bigint; new_id uuid;
begin
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'listing_sync_workspace_exited'; end if;
  select revision into rev from public.business_records where workspace_id = p_workspace_id;
  if rev is null then raise exception 'listing_sync_no_record'; end if;
  insert into public.listing_sync_checks(workspace_id, record_revision, trigger, requested_by)
    values (p_workspace_id, rev, p_trigger, p_requested_by)
    on conflict (workspace_id) where status = 'queued' do nothing
    returning id into new_id;
  if new_id is null then
    select id into new_id from public.listing_sync_checks where workspace_id = p_workspace_id and status = 'queued';
  end if;
  return new_id;
end;
$$;

create function public.listing_sync_claim_checks(p_limit int, p_check_id uuid default null) returns setof public.listing_sync_checks
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.listing_sync_checks set status = 'failed', error = 'stale', finished_at = clock_timestamp()
    where status = 'running' and started_at < clock_timestamp() - interval '10 minutes';
  return query
    update public.listing_sync_checks c set status = 'running', started_at = clock_timestamp(), claim_token = gen_random_uuid()
      where c.id in (
        select q.id from public.listing_sync_checks q
          where q.status = 'queued' and (p_check_id is null or q.id = p_check_id)
          order by q.created_at, q.id
          limit greatest(0, least(coalesce(p_limit, 1), 20))
          for update skip locked)
      returning c.*;
end;
$$;

-- The worker's read of confirmed facts: the body of read_confirmed_business_facts
-- (20261011133700) without the actor check. Service only.
create function public.listing_sync_confirmed_facts(p_workspace_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  return jsonb_build_object(
    'revision', coalesce((select revision from public.business_records where workspace_id = p_workspace_id), 0),
    'facts', coalesce((select jsonb_object_agg(c.entity_id, c.state->'value') from public.business_record_confirmed c
      where c.workspace_id = p_workspace_id and c.entity = 'fact' and c.entity_id <> 'owner_recipient'), '{}'::jsonb),
    'services', coalesce((select jsonb_agg(jsonb_build_object('name', s.state->'name', 'description', s.state->'description',
        'priceText', s.state->'priceText') order by (s.state->>'position')::integer, s.entity_id)
      from (select * from public.business_record_confirmed c where c.workspace_id = p_workspace_id and c.entity = 'service'
        and (c.state->>'active')::boolean order by (c.state->>'position')::integer, c.entity_id limit 40) s), '[]'::jsonb));
end;
$$;

create function public.listing_sync_targets(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'tenants', coalesce((select jsonb_agg(jsonb_build_object('tenantId', t.id, 'tenantStableId', t.stable_id, 'deliveryModel', t.delivery_model) order by t.id)
      from public.tenant_workspace_links l join public.tenants t on t.stable_id = l.tenant_stable_id
      where l.workspace_id = p_workspace_id and t.active and t.id <> 'demo'), '[]'::jsonb),
    'connectedSites', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'siteUrl', s.site_url, 'siteHost', s.site_host,
        'platform', s.platform, 'injectSchema', s.inject_schema) order by s.created_at, s.id)
      from public.connected_sites s
      where s.business_workspace_id = p_workspace_id and s.status = 'active' and s.verified_at is not null), '[]'::jsonb),
    'agencies', coalesce((select jsonb_agg(x.agency_workspace_id order by x.agency_workspace_id)
      from (select distinct ps.agency_workspace_id from public.provider_seats ps
        where ps.customer_workspace_id = p_workspace_id and ps.status = 'active') x), '[]'::jsonb));
$$;

create function public.listing_sync_save_fixes(p_check_id uuid, p_claim_token uuid, p_fixes jsonb) returns setof public.listing_sync_fixes
language plpgsql security definer set search_path = public, pg_temp as $$
declare chk public.listing_sync_checks; item jsonb;
begin
  select * into chk from public.listing_sync_checks where id = p_check_id and status = 'running' and claim_token = p_claim_token for update;
  if not found then raise exception 'listing_sync_claim_lost'; end if;
  if p_fixes is null or jsonb_typeof(p_fixes) <> 'array' or jsonb_array_length(p_fixes) > 60 then raise exception 'listing_sync_invalid'; end if;
  for item in select * from jsonb_array_elements(p_fixes) loop
    insert into public.listing_sync_fixes(workspace_id, check_id, record_revision, surface_key, fact_key, kind, proposed)
      values (chk.workspace_id, chk.id, chk.record_revision, item->>'surfaceKey', item->>'factKey', item->>'kind', item->'proposed')
      on conflict (workspace_id, surface_key, fact_key, record_revision) do nothing;
  end loop;
  update public.listing_sync_fixes set status = 'superseded', updated_at = clock_timestamp()
    where workspace_id = chk.workspace_id and status = 'proposed' and record_revision < chk.record_revision;
  return query select f.* from public.listing_sync_fixes f
    where f.workspace_id = chk.workspace_id and f.record_revision = chk.record_revision and f.status <> 'superseded'
    order by f.created_at, f.id;
end;
$$;

create function public.listing_sync_finish_check(p_check_id uuid, p_claim_token uuid, p_status text, p_readings jsonb,
  p_differs int, p_compared int, p_error text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare chk public.listing_sync_checks; latest public.listing_sync_releases; hash text; rel_number int; rel_at timestamptz;
begin
  if p_status is null or p_status not in ('done','failed') then raise exception 'listing_sync_invalid'; end if;
  select * into chk from public.listing_sync_checks where id = p_check_id and status = 'running' and claim_token = p_claim_token for update;
  if not found then raise exception 'listing_sync_claim_lost'; end if;
  update public.listing_sync_checks set status = p_status, readings = coalesce(p_readings, '[]'::jsonb),
      differs = greatest(coalesce(p_differs, 0), 0), compared = greatest(coalesce(p_compared, 0), 0),
      error = left(p_error, 300), finished_at = clock_timestamp()
    where id = chk.id;
  if p_status = 'done' then
    -- An applied fix is verified when its place now reads as matching.
    update public.listing_sync_fixes fx set status = 'verified', updated_at = clock_timestamp()
      where fx.workspace_id = chk.workspace_id and fx.status = 'applied'
        and exists (
          select 1 from jsonb_array_elements(p_readings) r
          where r->>'surfaceKey' = fx.surface_key
            and ((fx.fact_key = 'page' and not exists (select 1 from jsonb_array_elements(r->'facts') f where f->>'state' = 'differs'))
              or (fx.fact_key <> 'page' and exists (select 1 from jsonb_array_elements(r->'facts') f
                    where f->>'fact' = fx.fact_key and f->>'state' in ('matches','follows')))));
  end if;
  if p_status = 'done' and coalesce(p_differs, 0) = 0 and coalesce(p_compared, 0) > 0 then
    perform pg_advisory_xact_lock(hashtextextended('listing-sync-release:' || chk.workspace_id::text, 0));
    hash := encode(sha256(convert_to(p_readings::text, 'UTF8')), 'hex');
    select * into latest from public.listing_sync_releases where workspace_id = chk.workspace_id order by number desc limit 1;
    if latest.number is null or latest.record_revision <> chk.record_revision or latest.readings_hash <> hash then
      rel_number := coalesce(latest.number, 0) + 1;
      insert into public.listing_sync_releases(workspace_id, number, check_id, record_revision, readings, readings_hash)
        values (chk.workspace_id, rel_number, chk.id, chk.record_revision, p_readings, hash)
        returning recorded_at into rel_at;
    end if;
  end if;
  return jsonb_build_object('checkId', chk.id,
    'release', case when rel_number is null then null else jsonb_build_object('number', rel_number, 'recordedAt', rel_at) end);
end;
$$;

create function public.listing_sync_set_fix(p_fix_id uuid, p_workspace_id uuid, p_from text[], p_to text, p_outcome_ref text,
  p_reason text, p_decided_by uuid) returns public.listing_sync_fixes
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.listing_sync_fixes;
begin
  update public.listing_sync_fixes set status = p_to, outcome_ref = left(p_outcome_ref, 200), reason = left(p_reason, 300),
      decided_by = coalesce(p_decided_by, decided_by), updated_at = clock_timestamp()
    where id = p_fix_id and workspace_id = p_workspace_id and status = any(p_from)
    returning * into r;
  if not found then raise exception 'listing_sync_fix_moved'; end if;
  return r;
end;
$$;

create function public.listing_sync_decline_plan(p_workspace_id uuid, p_record_revision bigint, p_decided_by uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  update public.listing_sync_fixes set status = 'declined', decided_by = p_decided_by, updated_at = clock_timestamp()
    where workspace_id = p_workspace_id and record_revision = p_record_revision and status in ('proposed','failed') and kind <> 'owner_todo';
  get diagnostics n = row_count;
  return n;
end;
$$;

create function public.listing_sync_due_workspaces(p_limit int) returns setof uuid
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
    select br.workspace_id from public.business_records br
      where not public.workspace_exit_completed(br.workspace_id)
        and not exists (select 1 from public.listing_sync_checks c where c.workspace_id = br.workspace_id and c.status in ('queued','running'))
        and (
          not exists (select 1 from public.listing_sync_checks d where d.workspace_id = br.workspace_id and d.status = 'done')
          or exists (select 1 from (select d.record_revision, d.finished_at from public.listing_sync_checks d
              where d.workspace_id = br.workspace_id and d.status = 'done' order by d.finished_at desc, d.id limit 1) last
            where last.record_revision < br.revision or last.finished_at < clock_timestamp() - interval '24 hours'))
      order by br.workspace_id
      limit greatest(0, least(coalesce(p_limit, 1), 200));
end;
$$;

-- The owner's pending plan: the Strelva-made and Request fixes of the last
-- finished check that are not yet applied (a failed one is offered again).
-- Owner to-dos are not decisions, so they are left out.
create function public.listing_sync_open_plan(p_workspace_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare last public.listing_sync_checks;
begin
  select * into last from public.listing_sync_checks where workspace_id = p_workspace_id and status = 'done'
    order by finished_at desc, id limit 1;
  if not found then return null; end if;
  return jsonb_build_object('recordRevision', last.record_revision, 'readings', last.readings,
    'fixes', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'surfaceKey', f.surface_key, 'factKey', f.fact_key,
        'kind', f.kind, 'proposed', f.proposed, 'status', f.status, 'outcomeRef', f.outcome_ref, 'reason', f.reason,
        'recordRevision', f.record_revision) order by f.surface_key, f.fact_key)
      from public.listing_sync_fixes f
      where f.workspace_id = p_workspace_id and f.record_revision = last.record_revision
        and f.status in ('proposed','failed') and f.kind <> 'owner_todo'), '[]'::jsonb));
end;
$$;

create function public.read_listing_sync(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_access text; latest public.listing_sync_checks; last_done public.listing_sync_checks; rel public.listing_sync_releases;
begin
  v_access := public.business_record_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  select * into latest from public.listing_sync_checks where workspace_id = p_workspace_id order by created_at desc, id desc limit 1;
  select * into last_done from public.listing_sync_checks where workspace_id = p_workspace_id and status = 'done'
    order by finished_at desc, id limit 1;
  select * into rel from public.listing_sync_releases where workspace_id = p_workspace_id order by number desc limit 1;
  return jsonb_build_object(
    'access', v_access,
    'latest', case when latest.id is null then null else jsonb_build_object('id', latest.id, 'status', latest.status,
      'recordRevision', latest.record_revision, 'trigger', latest.trigger, 'error', latest.error,
      'createdAt', latest.created_at, 'finishedAt', latest.finished_at) end,
    'lastDone', case when last_done.id is null then null else jsonb_build_object('id', last_done.id,
      'recordRevision', last_done.record_revision, 'readings', last_done.readings, 'differs', last_done.differs,
      'compared', last_done.compared, 'finishedAt', last_done.finished_at) end,
    'fixes', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'surfaceKey', f.surface_key, 'factKey', f.fact_key,
        'kind', f.kind, 'proposed', f.proposed, 'status', f.status, 'outcomeRef', f.outcome_ref, 'reason', f.reason,
        'recordRevision', f.record_revision) order by f.surface_key, f.fact_key)
      from public.listing_sync_fixes f
      where last_done.id is not null and f.workspace_id = p_workspace_id and f.record_revision = last_done.record_revision
        and f.status in ('proposed','applying','applied','failed')), '[]'::jsonb),
    'release', case when rel.number is null then null else jsonb_build_object('number', rel.number,
      'recordedAt', rel.recorded_at, 'recordRevision', rel.record_revision) end,
    'releaseCount', (select count(*) from public.listing_sync_releases where workspace_id = p_workspace_id));
end;
$$;

revoke all on function public.listing_sync_release_immutable(),
  public.listing_sync_queue_check(uuid, text, uuid), public.listing_sync_claim_checks(int, uuid),
  public.listing_sync_confirmed_facts(uuid), public.listing_sync_targets(uuid),
  public.listing_sync_save_fixes(uuid, uuid, jsonb), public.listing_sync_finish_check(uuid, uuid, text, jsonb, int, int, text),
  public.listing_sync_set_fix(uuid, uuid, text[], text, text, text, uuid), public.listing_sync_decline_plan(uuid, bigint, uuid),
  public.listing_sync_due_workspaces(int), public.listing_sync_open_plan(uuid), public.read_listing_sync(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.listing_sync_queue_check(uuid, text, uuid), public.listing_sync_claim_checks(int, uuid),
  public.listing_sync_confirmed_facts(uuid), public.listing_sync_targets(uuid),
  public.listing_sync_save_fixes(uuid, uuid, jsonb), public.listing_sync_finish_check(uuid, uuid, text, jsonb, int, int, text),
  public.listing_sync_set_fix(uuid, uuid, text[], text, text, text, uuid), public.listing_sync_decline_plan(uuid, bigint, uuid),
  public.listing_sync_due_workspaces(int), public.listing_sync_open_plan(uuid), public.read_listing_sync(uuid, uuid, text)
  to service_role;

commit;
