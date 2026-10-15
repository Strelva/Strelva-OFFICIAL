-- Lane 13 keep-your-site: connected-site health, changes and Releases.
-- Held and unapplied; every path is behind the keep_your_site flag
-- (20261027160000). Nothing here emails anyone or edits a client's site.
--
-- Depends on: 20261008151000 (connected sites), 20261010113000 (website System
-- Releases), 20261014100000 (acting_provider), 20261021181000 (actor
-- snapshots), 20261024123500 (system_revision_capture_actor), and the held
-- Connections core 20261026100000 + 20261026120100, which connectSite needs.
begin;
set local lock_timeout='3s';

-- Rollback capture for every function this file replaces.
create schema keep_your_site_rollback;
revoke all on schema keep_your_site_rollback from public,anon,authenticated,service_role;
create table keep_your_site_rollback.functions(signature text primary key,before_definition text not null);
alter table keep_your_site_rollback.functions enable row level security;
revoke all on keep_your_site_rollback.functions from public,anon,authenticated,service_role;
insert into keep_your_site_rollback.functions(signature,before_definition)
 select 'public.connected_site_json(public.connected_sites,boolean)',
   pg_get_functiondef(to_regprocedure('public.connected_site_json(public.connected_sites,boolean)'));

-- ---------------------------------------------------------------------------
-- Install health: the last live re-check and what the page said it is built with.
alter table public.connected_sites
 add column last_checked_at timestamptz,
 add column last_check_result text check (last_check_result is null or last_check_result in ('present','missing','unreachable')),
 add column detected_platform text check (detected_platform is null or detected_platform in ('unknown','custom','wix','squarespace','wordpress','webflow','shopify','framer','godaddy','google-sites','square','duda','carrd','lovable','v0','bolt','chatgpt','claude','strelva')),
 add column detected_evidence text[] check (detected_evidence is null or cardinality(detected_evidence)<=5),
 add column detected_at timestamptz;

create or replace function public.connected_site_json(s public.connected_sites, p_manage boolean) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'id', s.id, 'workspaceId', s.business_workspace_id, 'publicKey', s.public_key, 'label', s.label,
    'siteUrl', s.site_url, 'siteHost', s.site_host, 'allowedOrigins', to_jsonb(s.allowed_origins), 'platform', s.platform,
    'captureForms', s.capture_forms, 'injectSchema', s.inject_schema, 'status', s.status,
    'verificationToken', case when p_manage and s.verified_at is null then s.verification_token end,
    'verifiedAt', s.verified_at, 'createdAt', s.created_at, 'updatedAt', s.updated_at, 'revokedAt', s.revoked_at,
    'firstEventAt', s.first_event_at, 'lastEventAt', s.last_event_at,
    'lastCheckedAt', s.last_checked_at, 'lastCheckResult', s.last_check_result,
    'detectedPlatform', s.detected_platform, 'detectedEvidence', to_jsonb(coalesce(s.detected_evidence,'{}'::text[])),
    'detectedAt', s.detected_at)
$$;
revoke all on function public.connected_site_json(public.connected_sites, boolean) from public, anon, authenticated, service_role;

create function public.record_connected_site_check(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_site_id uuid,
  p_result text, p_platform text, p_evidence text[]) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_role text; v_row public.connected_sites; v_evidence text[]:=coalesce(p_evidence,'{}'::text[]); v_item text;
begin
  v_role := public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  if p_result is null or p_result not in ('present','missing','unreachable')
    or (p_platform is not null and p_platform not in ('unknown','custom','wix','squarespace','wordpress','webflow','shopify','framer','godaddy','google-sites','square','duda','carrd','lovable','v0','bolt','chatgpt','claude','strelva'))
    or cardinality(v_evidence) > 5 then raise exception 'connected_site_invalid'; end if;
  foreach v_item in array v_evidence loop
    if v_item is null or char_length(v_item) > 120 then raise exception 'connected_site_invalid'; end if;
  end loop;
  update public.connected_sites set
    last_checked_at = clock_timestamp(), last_check_result = p_result,
    detected_platform = coalesce(nullif(p_platform,'unknown'), detected_platform),
    detected_evidence = case when nullif(p_platform,'unknown') is not null then v_evidence else detected_evidence end,
    detected_at = case when nullif(p_platform,'unknown') is not null then clock_timestamp() else detected_at end,
    updated_at = clock_timestamp()
  where id = p_site_id and business_workspace_id = p_workspace_id and status = 'active'
  returning * into v_row;
  if v_row.id is null then raise exception 'connected_site_not_found'; end if;
  return public.connected_site_json(v_row, v_role in ('owner','admin'));
end $$;
revoke all on function public.record_connected_site_check(uuid, uuid, text, uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function public.record_connected_site_check(uuid, uuid, text, uuid, text, text, text[]) to service_role;

-- ---------------------------------------------------------------------------
-- Changes on a connected site. One append-only step log per change; the stage
-- is computed from the steps (connected_site_change_stage, mirrored exactly by
-- connectedSiteChangeStage in src/products/connected-sites/change-model.ts).
-- Strelva never edits a client's site: the agency edits in the builder, Strelva
-- reads the live page and records a Release through append_website_system_release.

create table public.connected_site_changes (
  id uuid primary key default gen_random_uuid(),
  business_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  connected_site_id uuid not null,
  system_id uuid not null,
  request_id uuid unique,
  origin text not null check (origin in ('request','agency')),
  agency_workspace_id uuid not null references public.workspaces(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (id, business_workspace_id),
  foreign key (connected_site_id, business_workspace_id) references public.connected_sites(id, business_workspace_id) on delete cascade,
  foreign key (request_id, business_workspace_id) references public.service_requests(id, business_workspace_id) on delete cascade,
  check ((origin = 'request') = (request_id is not null))
);
create index connected_site_changes_site_idx on public.connected_site_changes(business_workspace_id, connected_site_id, created_at desc);

create table public.connected_site_change_steps (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  change_id uuid not null,
  business_workspace_id uuid not null,
  kind text not null check (kind in ('planned','approved','declined','marked_done','checked','released','withdrawn')),
  page_url text check (page_url is null or (char_length(page_url) <= 500 and page_url ~ '^https?://[^[:space:]]+$')),
  edit_steps jsonb check (edit_steps is null or (jsonb_typeof(edit_steps) = 'array' and jsonb_array_length(edit_steps) between 1 and 12)),
  expect_text text check (expect_text is null or char_length(btrim(expect_text)) between 1 and 300),
  remove_text text check (remove_text is null or char_length(btrim(remove_text)) between 1 and 300),
  owner_facing boolean,
  check_result text check (check_result is null or check_result in ('visible','not_visible','unreachable')),
  page_hash text check (page_hash is null or page_hash ~ '^[0-9a-f]{64}$'),
  matched text check (matched is null or char_length(matched) <= 300),
  read_back text check (read_back is null or read_back in ('confirmed','not_confirmed')),
  system_revision_id uuid references public.system_revisions(id) on delete set null,
  release_number integer check (release_number is null or release_number > 0),
  note text check (note is null or char_length(btrim(note)) between 1 and 1000),
  recorded_by uuid not null references public.users(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (change_id, business_workspace_id) references public.connected_site_changes(id, business_workspace_id) on delete cascade,
  check ((kind = 'planned') = (page_url is not null and edit_steps is not null and expect_text is not null and owner_facing is not null)),
  check (kind = 'planned' or (page_url is null and edit_steps is null and expect_text is null and remove_text is null and owner_facing is null)),
  check ((kind = 'checked') = (check_result is not null)),
  check ((kind = 'released') = (read_back is not null and release_number is not null)),
  check (kind in ('checked','released') or page_hash is null)
);
create index connected_site_change_steps_change_idx on public.connected_site_change_steps(change_id, recorded_at, seq);

-- What the page was built with, per client, as the agency's bulk view reads it.
create table public.connected_site_detections (
  business_workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  site_url text not null check (char_length(site_url) <= 500 and site_url ~ '^https?://[^[:space:]/]+(/[^[:space:]]*)?$'),
  site_host text not null check (site_host ~ '^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$'),
  platform text not null check (platform in ('unknown','custom','wix','squarespace','wordpress','webflow','shopify','framer','godaddy','google-sites','square','duda','carrd','lovable','v0','bolt','chatgpt','claude','strelva')),
  evidence text[] not null default '{}' check (cardinality(evidence) <= 5),
  reachable boolean not null,
  detected_by uuid not null references public.users(id) on delete restrict,
  detected_at timestamptz not null default clock_timestamp()
);

alter table public.connected_site_changes enable row level security;
alter table public.connected_site_change_steps enable row level security;
alter table public.connected_site_detections enable row level security;
revoke all on public.connected_site_changes, public.connected_site_change_steps, public.connected_site_detections from public, anon, authenticated, service_role;

-- Nothing rewrites a change or a step. Deleting cascades with the business or site.
-- The one tolerated update is the foreign key nulling a step's Release pointer
-- when the System's revisions are deleted along with the System.
create function public.connected_site_change_step_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.system_revision_id is null and old.system_revision_id is not null
    and (to_jsonb(new) - 'system_revision_id') = (to_jsonb(old) - 'system_revision_id') then
    return new;
  end if;
  raise exception 'connected_site_change_immutable';
end $$;
create function public.connected_site_change_immutable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'connected_site_change_immutable';
end $$;
revoke all on function public.connected_site_change_step_immutable() from public, anon, authenticated, service_role;
revoke all on function public.connected_site_change_immutable() from public, anon, authenticated, service_role;
create trigger connected_site_change_steps_immutable before update on public.connected_site_change_steps
  for each row execute function public.connected_site_change_step_immutable();
create trigger connected_site_changes_immutable before update on public.connected_site_changes
  for each row execute function public.connected_site_change_immutable();

-- ---------------------------------------------------------------------------
-- Helpers (internal: revoked from every role, called by the RPCs below).

create function public.connected_site_platform_label(p text) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case p when 'wix' then 'Wix' when 'squarespace' then 'Squarespace' when 'wordpress' then 'WordPress'
    when 'webflow' then 'Webflow' when 'shopify' then 'Shopify' when 'godaddy' then 'GoDaddy' when 'duda' then 'Duda'
    when 'framer' then 'Framer' when 'square' then 'Square' when 'carrd' then 'Carrd' when 'google-sites' then 'Google Sites'
    else 'the site builder' end
$$;

-- The stage, walked from the steps in order. No locks: readers call it freely.
create function public.connected_site_change_stage(p_change_id uuid) returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare s record; v_stage text := 'unplanned';
begin
  for s in select kind, owner_facing, check_result, read_back from public.connected_site_change_steps
      where change_id = p_change_id order by recorded_at, seq loop
    v_stage := case s.kind
      when 'planned' then case when s.owner_facing then 'planned_waiting' else 'ready_to_make' end
      when 'approved' then 'ready_to_make'
      when 'declined' then 'declined'
      when 'marked_done' then 'checking'
      when 'checked' then case when s.check_result = 'visible' then 'checking' else 'not_seen' end
      when 'released' then case when s.read_back = 'confirmed' then 'done' else 'done_unconfirmed' end
      when 'withdrawn' then 'withdrawn'
      else v_stage end;
  end loop;
  return v_stage;
end $$;

-- Where a Request sits in the agency Queue, or null when no change exists for it.
create function public.connected_site_change_request_stage(p_request_id uuid) returns text
language sql stable set search_path = public, pg_temp as $$
  select case public.connected_site_change_stage(c.id)
    when 'done' then 'done' when 'done_unconfirmed' then 'done'
    when 'withdrawn' then 'closed' when 'declined' then 'closed'
    when 'planned_waiting' then 'needs_you'
    else 'in_progress' end
  from public.connected_site_changes c where c.request_id = p_request_id
$$;

-- Who did it, as the person or agency they were then (never today's brand).
create function public.connected_site_change_actor(p_workspace_id uuid, p_user_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_actor jsonb;
begin
  v_actor := public.application_action_actor_snapshot(p_workspace_id, p_user_id);
  if v_actor->>'kind' = 'agency' and v_actor->>'displayName' = 'Strelva' then
    v_actor := jsonb_set(v_actor, '{displayName}', '"Strelva Agency"'::jsonb);
  end if;
  return v_actor;
end $$;

create function public.connected_site_change_json(c public.connected_site_changes) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  return jsonb_build_object(
    'id', c.id, 'requestId', c.request_id, 'origin', c.origin, 'title', c.title, 'createdAt', c.created_at,
    'stage', public.connected_site_change_stage(c.id),
    'steps', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'pageUrl', s.page_url, 'editSteps', s.edit_steps, 'expectText', s.expect_text,
        'removeText', s.remove_text, 'ownerFacing', s.owner_facing, 'checkResult', s.check_result, 'matched', s.matched,
        'readBack', s.read_back, 'releaseNumber', s.release_number, 'note', s.note, 'recordedAt', s.recorded_at,
        'actor', public.connected_site_change_actor(c.business_workspace_id, s.recorded_by)) order by s.recorded_at, s.seq)
      from public.connected_site_change_steps s where s.change_id = c.id), '[]'::jsonb));
end $$;

create function public.connected_site_change_lock(p_workspace_id uuid, p_change_id uuid) returns public.connected_site_changes
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare c public.connected_site_changes;
begin
  select * into c from public.connected_site_changes where id = p_change_id and business_workspace_id = p_workspace_id for update;
  if c.id is null then raise exception 'connected_site_change_not_found'; end if;
  return c;
end $$;

-- The Release: a numbered revision of the connected site's website System,
-- through the same append path reconcile uses. Idempotent per change and step.
create function public.connected_site_change_release(p_change public.connected_site_changes, p_key_step uuid, p_read_back text, p_page_hash text, p_actor uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_site record; v_label text; v_key text; v_impl jsonb; v_summary text; v_rev record;
begin
  perform 1 from public.systems where id = p_change.system_id and business_workspace_id = p_change.business_workspace_id and kind = 'website';
  if not found then raise exception 'system_not_found'; end if;
  select platform, site_host, detected_platform into v_site from public.connected_sites where id = p_change.connected_site_id;
  v_label := public.connected_site_platform_label(coalesce(nullif(v_site.platform, 'unknown'), v_site.detected_platform, 'unknown'));
  v_key := 'connected-change:' || p_change.id::text || ':' || p_key_step::text;
  v_impl := jsonb_build_object('kind', 'connected_site', 'ref', p_change.connected_site_id::text || '@change:' || p_change.id::text)
    || case when p_page_hash is not null then jsonb_build_object('contentHash', p_page_hash) else '{}'::jsonb end;
  v_summary := left(case when p_read_back = 'confirmed'
    then format('Changed on %s: %s. Strelva saw it on the live page.', v_label, p_change.title)
    else format('Changed on %s: %s. Not confirmed on the live page.', v_label, p_change.title) end, 500);
  perform public.append_website_system_release(p_change.business_workspace_id, p_change.system_id, v_key, v_impl, v_summary, p_actor, clock_timestamp());
  select id, number into v_rev from public.system_revisions
    where business_workspace_id = p_change.business_workspace_id
      and command_id = public.system_origin_id(p_change.business_workspace_id, 'website-release', p_change.system_id::text || ':' || v_key);
  if v_rev.id is null then raise exception 'system_not_found'; end if;
  insert into public.connected_site_change_steps(change_id, business_workspace_id, kind, read_back, release_number, system_revision_id, page_hash, recorded_by)
    values (p_change.id, p_change.business_workspace_id, 'released', p_read_back, v_rev.number, v_rev.id, p_page_hash, p_actor);
  return jsonb_build_object('number', v_rev.number);
end $$;

-- Who may move a change along: the agency serving this business on it, and
-- (for withdraw and check only) a direct owner or admin of the business.
create function public.connected_site_change_is_agency(p_change public.connected_site_changes, p_user_id uuid) returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  select coalesce(public.acting_provider(p_change.business_workspace_id, p_user_id, null, null, null) = p_change.agency_workspace_id, false)
$$;
create function public.connected_site_change_is_direct_manager(p_workspace_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(select 1 from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.role in ('owner','admin'))
$$;
create function public.connected_site_change_verified_user(p_user_id uuid, p_verified_email text) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists(select 1 from public.users where id = p_user_id and lower(email) = lower(btrim(coalesce(p_verified_email, ''))) and verified_at is not null) then
    raise exception 'workspace_access_denied';
  end if;
end $$;

revoke all on function public.connected_site_platform_label(text) from public, anon, authenticated, service_role;
revoke all on function public.connected_site_change_stage(uuid) from public, anon, authenticated, service_role;
revoke all on function public.connected_site_change_request_stage(uuid) from public, anon, authenticated, service_role;
revoke all on function public.connected_site_change_actor(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.connected_site_change_json(public.connected_site_changes) from public, anon, authenticated, service_role;
revoke all on function public.connected_site_change_lock(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.connected_site_change_release(public.connected_site_changes, uuid, text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.connected_site_change_is_agency(public.connected_site_changes, uuid) from public, anon, authenticated, service_role;
revoke all on function public.connected_site_change_is_direct_manager(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.connected_site_change_verified_user(uuid, text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- RPCs (service_role only).

create function public.list_connected_site_changes(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_system_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_role text; v_agency uuid; v_site public.connected_sites; v_brand text;
begin
  v_role := public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  v_agency := public.acting_provider(p_workspace_id, p_user_id, null, null, null);
  select * into v_site from public.connected_sites s
    where s.business_workspace_id = p_workspace_id and public.system_origin_id(p_workspace_id, 'connected_site', s.id::text) = p_system_id
    order by (s.status = 'active') desc, s.created_at desc limit 1;
  if v_site.id is null then raise exception 'connected_site_not_found'; end if;
  select case when coalesce(nullif(btrim(a.agency_brand->>'displayName'), ''), a.name) = 'Strelva' then 'Strelva Agency'
      else coalesce(nullif(btrim(a.agency_brand->>'displayName'), ''), a.name) end into v_brand
    from public.workspace_providers p join public.workspaces a on a.id = p.provider_workspace_id and a.kind = 'agency'
    where p.customer_workspace_id = p_workspace_id and p.status = 'active' limit 1;
  return jsonb_build_object(
    'viewer', jsonb_build_object('role', v_role,
      'isOwner', exists(select 1 from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.user_id = p_user_id and m.role = 'owner'),
      'actingAgencyId', v_agency, 'agencyName', v_brand),
    'site', jsonb_build_object('id', v_site.id, 'siteHost', v_site.site_host, 'siteUrl', v_site.site_url,
      'platform', coalesce(nullif(v_site.platform, 'unknown'), v_site.detected_platform, 'unknown')),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', q.id, 'request', q.request_text, 'outcome', q.outcome, 'page', q.context->>'page',
        'accepted', q.provider_acceptance, 'revision', q.revision, 'createdAt', q.created_at) order by q.created_at desc, q.id)
      from (select r.* from public.service_requests r
        where r.business_workspace_id = p_workspace_id and r.context->>'source' = 'connected_site_change'
          and r.context->>'connectedSiteId' = v_site.id::text and r.status = 'requested'
          and not exists(select 1 from public.connected_site_changes x where x.request_id = r.id)
          and (exists(select 1 from public.workspace_memberships m where m.workspace_id = p_workspace_id and m.user_id = p_user_id)
            or r.provider_agency_workspace_id is not distinct from v_agency)
        order by r.created_at desc, r.id limit 50) q), '[]'::jsonb),
    'changes', coalesce((select jsonb_agg(public.connected_site_change_json(q) order by q.created_at desc, q.id)
      from (select c.* from public.connected_site_changes c
        where c.business_workspace_id = p_workspace_id and c.connected_site_id = v_site.id
        order by c.created_at desc, c.id limit 50) q), '[]'::jsonb));
end $$;

create function public.plan_connected_site_change(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_site_id uuid,
  p_change_id uuid, p_request_id uuid, p_title text, p_plan jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_agency uuid; v_site public.connected_sites; v_change public.connected_site_changes; v_request public.service_requests;
  v_page text; v_item jsonb; v_title text;
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, true);
  v_agency := public.acting_provider(p_workspace_id, p_user_id, null, null, null);
  if v_agency is null then raise exception 'connected_site_change_agency_required'; end if;
  select * into v_site from public.connected_sites where id = p_site_id and business_workspace_id = p_workspace_id and status = 'active' for share;
  if v_site.id is null then raise exception 'connected_site_not_found'; end if;
  if v_site.verified_at is null then raise exception 'connected_site_not_verified'; end if;
  if p_plan is null or jsonb_typeof(p_plan) <> 'object'
    or (p_plan - array['pageUrl','editSteps','expectText','removeText','ownerFacing','note']::text[]) <> '{}'::jsonb
    or jsonb_typeof(p_plan->'pageUrl') is distinct from 'string' or jsonb_typeof(p_plan->'editSteps') is distinct from 'array'
    or jsonb_typeof(p_plan->'expectText') is distinct from 'string' or jsonb_typeof(p_plan->'ownerFacing') is distinct from 'boolean'
    or (p_plan ? 'removeText' and jsonb_typeof(p_plan->'removeText') is distinct from 'string')
    or (p_plan ? 'note' and jsonb_typeof(p_plan->'note') is distinct from 'string') then
    raise exception 'connected_site_change_invalid';
  end if;
  v_page := p_plan->>'pageUrl';
  if lower(substring(v_page from '^(https?://[^/?#]+)')) is null or not (lower(substring(v_page from '^(https?://[^/?#]+)')) = any(v_site.allowed_origins)) then
    raise exception 'connected_site_change_invalid';
  end if;
  if jsonb_array_length(p_plan->'editSteps') not between 1 and 12 then raise exception 'connected_site_change_invalid'; end if;
  for v_item in select * from jsonb_array_elements(p_plan->'editSteps') loop
    if jsonb_typeof(v_item) <> 'string' or char_length(v_item #>> '{}') not between 1 and 500 then raise exception 'connected_site_change_invalid'; end if;
  end loop;
  if p_change_id is null then
    if p_request_id is not null then
      select * into v_request from public.service_requests where id = p_request_id and business_workspace_id = p_workspace_id for update;
      if v_request.id is null then raise exception 'connected_site_change_not_found'; end if;
      if v_request.context->>'source' is distinct from 'connected_site_change' or v_request.context->>'connectedSiteId' is distinct from v_site.id::text
        or v_request.status <> 'requested' or v_request.provider_kind <> 'agency'
        or v_request.provider_agency_workspace_id is distinct from v_agency or v_request.provider_acceptance <> 'accepted' then
        raise exception 'connected_site_change_not_accepted';
      end if;
      if exists(select 1 from public.connected_site_changes where request_id = v_request.id) then raise exception 'connected_site_change_out_of_order'; end if;
      v_title := left(btrim(v_request.outcome), 300);
      insert into public.connected_site_changes(business_workspace_id, connected_site_id, system_id, request_id, origin, agency_workspace_id, title, created_by)
        values (p_workspace_id, v_site.id, public.system_origin_id(p_workspace_id, 'connected_site', v_site.id::text), v_request.id, 'request', v_agency, v_title, p_user_id)
        returning * into v_change;
    else
      v_title := btrim(coalesce(p_title, ''));
      if char_length(v_title) not between 1 and 300 then raise exception 'connected_site_change_invalid'; end if;
      insert into public.connected_site_changes(business_workspace_id, connected_site_id, system_id, origin, agency_workspace_id, title, created_by)
        values (p_workspace_id, v_site.id, public.system_origin_id(p_workspace_id, 'connected_site', v_site.id::text), 'agency', v_agency, v_title, p_user_id)
        returning * into v_change;
    end if;
  else
    v_change := public.connected_site_change_lock(p_workspace_id, p_change_id);
    if v_change.connected_site_id <> v_site.id or v_change.agency_workspace_id <> v_agency then raise exception 'connected_site_change_agency_required'; end if;
    if public.connected_site_change_stage(v_change.id) not in ('unplanned','planned_waiting','declined','not_seen') then raise exception 'connected_site_change_out_of_order'; end if;
  end if;
  begin
    insert into public.connected_site_change_steps(change_id, business_workspace_id, kind, page_url, edit_steps, expect_text, remove_text, owner_facing, note, recorded_by)
      values (v_change.id, p_workspace_id, 'planned', v_page, p_plan->'editSteps', p_plan->>'expectText', p_plan->>'removeText',
        (p_plan->>'ownerFacing')::boolean, p_plan->>'note', p_user_id);
  exception when check_violation then raise exception 'connected_site_change_invalid';
  end;
  return public.connected_site_change_json(v_change);
end $$;

-- The owner's yes or not yet. Only a direct owner of the business: an agency
-- seat never counts, so an agency cannot approve its own plan.
create function public.decide_connected_site_change(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_change_id uuid, p_decision text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_change public.connected_site_changes;
begin
  perform public.connected_site_change_verified_user(p_user_id, p_verified_email);
  if not exists(select 1 from public.workspace_memberships where workspace_id = p_workspace_id and user_id = p_user_id and role = 'owner') then
    raise exception 'connected_site_change_owner_required';
  end if;
  if p_decision is null or p_decision not in ('approved','declined') then raise exception 'connected_site_change_invalid'; end if;
  v_change := public.connected_site_change_lock(p_workspace_id, p_change_id);
  if public.connected_site_change_stage(v_change.id) <> 'planned_waiting' then raise exception 'connected_site_change_out_of_order'; end if;
  insert into public.connected_site_change_steps(change_id, business_workspace_id, kind, recorded_by)
    values (v_change.id, p_workspace_id, p_decision, p_user_id);
  return public.connected_site_change_json(v_change);
end $$;

create function public.mark_connected_site_change_done(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_change_id uuid, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_change public.connected_site_changes;
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  v_change := public.connected_site_change_lock(p_workspace_id, p_change_id);
  if not public.connected_site_change_is_agency(v_change, p_user_id) then raise exception 'connected_site_change_agency_required'; end if;
  if public.connected_site_change_stage(v_change.id) not in ('ready_to_make','not_seen') then raise exception 'connected_site_change_out_of_order'; end if;
  begin
    insert into public.connected_site_change_steps(change_id, business_workspace_id, kind, note, recorded_by)
      values (v_change.id, p_workspace_id, 'marked_done', nullif(btrim(coalesce(p_note, '')), ''), p_user_id);
  exception when check_violation then raise exception 'connected_site_change_invalid';
  end;
  return public.connected_site_change_json(v_change);
end $$;

-- Strelva's reading of the live page. The result decides the Release; nobody
-- claims a check by hand.
create function public.record_connected_site_change_check(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_change_id uuid,
  p_result text, p_page_hash text, p_matched text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_change public.connected_site_changes; v_step uuid; v_done uuid; v_release jsonb;
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  if p_result is null or p_result not in ('visible','not_visible','unreachable')
    or (p_page_hash is not null and p_page_hash !~ '^[0-9a-f]{64}$') or (p_matched is not null and char_length(p_matched) > 300) then
    raise exception 'connected_site_change_invalid';
  end if;
  v_change := public.connected_site_change_lock(p_workspace_id, p_change_id);
  if not (public.connected_site_change_is_agency(v_change, p_user_id) or public.connected_site_change_is_direct_manager(p_workspace_id, p_user_id)) then
    raise exception 'connected_site_change_agency_required';
  end if;
  if public.connected_site_change_stage(v_change.id) not in ('checking','not_seen') then raise exception 'connected_site_change_out_of_order'; end if;
  insert into public.connected_site_change_steps(change_id, business_workspace_id, kind, check_result, page_hash, matched, recorded_by)
    values (v_change.id, p_workspace_id, 'checked', p_result, p_page_hash, p_matched, p_user_id) returning id into v_step;
  if p_result = 'visible' then
    select recorded_by into v_done from public.connected_site_change_steps where change_id = v_change.id and kind = 'marked_done' order by recorded_at desc, seq desc limit 1;
    v_release := public.connected_site_change_release(v_change, v_step, 'confirmed', p_page_hash, coalesce(v_done, p_user_id));
  end if;
  return jsonb_build_object('change', public.connected_site_change_json(v_change), 'release', v_release);
end $$;

create function public.release_connected_site_change_unconfirmed(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_change_id uuid, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_change public.connected_site_changes; v_checked record; v_done uuid; v_release jsonb;
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  v_change := public.connected_site_change_lock(p_workspace_id, p_change_id);
  if not public.connected_site_change_is_agency(v_change, p_user_id) then raise exception 'connected_site_change_agency_required'; end if;
  if public.connected_site_change_stage(v_change.id) <> 'not_seen' then raise exception 'connected_site_change_out_of_order'; end if;
  select id, page_hash into v_checked from public.connected_site_change_steps where change_id = v_change.id and kind = 'checked' order by recorded_at desc, seq desc limit 1;
  select recorded_by into v_done from public.connected_site_change_steps where change_id = v_change.id and kind = 'marked_done' order by recorded_at desc, seq desc limit 1;
  v_release := public.connected_site_change_release(v_change, v_checked.id, 'not_confirmed', v_checked.page_hash, coalesce(v_done, p_user_id));
  return jsonb_build_object('change', public.connected_site_change_json(v_change), 'release', v_release);
end $$;

create function public.withdraw_connected_site_change(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_change_id uuid, p_note text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_change public.connected_site_changes;
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  v_change := public.connected_site_change_lock(p_workspace_id, p_change_id);
  if not (public.connected_site_change_is_agency(v_change, p_user_id) or public.connected_site_change_is_direct_manager(p_workspace_id, p_user_id)) then
    raise exception 'connected_site_change_agency_required';
  end if;
  if public.connected_site_change_stage(v_change.id) in ('done','done_unconfirmed','withdrawn') then raise exception 'connected_site_change_out_of_order'; end if;
  begin
    insert into public.connected_site_change_steps(change_id, business_workspace_id, kind, note, recorded_by)
      values (v_change.id, p_workspace_id, 'withdrawn', nullif(btrim(coalesce(p_note, '')), ''), p_user_id);
  exception when check_violation then raise exception 'connected_site_change_invalid';
  end;
  return public.connected_site_change_json(v_change);
end $$;

-- Needs you: the planned changes an owner has yet to say yes or not yet to.
create function public.list_connected_site_change_reviews(p_workspace_id uuid, p_user_id uuid, p_verified_email text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public.connected_site_change_verified_user(p_user_id, p_verified_email);
  if not exists(select 1 from public.workspace_memberships where workspace_id = p_workspace_id and user_id = p_user_id and role = 'owner') then
    return '[]'::jsonb;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'changeId', q.id, 'systemId', q.system_id, 'siteHost', q.site_host,
      'platform', coalesce(nullif(q.platform, 'unknown'), q.detected_platform, 'unknown'),
      'title', q.title, 'planStepId', q.plan_id, 'pageUrl', q.page_url, 'expectText', q.expect_text, 'removeText', q.remove_text,
      'editSteps', q.edit_steps,
      'agencyName', case when coalesce(nullif(btrim(q.agency_brand->>'displayName'), ''), q.agency_name) = 'Strelva' then 'Strelva Agency'
        else coalesce(nullif(btrim(q.agency_brand->>'displayName'), ''), q.agency_name) end,
      'recordedAt', q.recorded_at) order by q.recorded_at, q.id)
    from (select c.id, c.system_id, c.title, cs.site_host, cs.platform, cs.detected_platform, a.name as agency_name, a.agency_brand,
        p.id as plan_id, p.page_url, p.expect_text, p.remove_text, p.edit_steps, p.recorded_at
      from public.connected_site_changes c
      join public.connected_sites cs on cs.id = c.connected_site_id
      join public.workspaces a on a.id = c.agency_workspace_id
      join lateral (select s.* from public.connected_site_change_steps s where s.change_id = c.id and s.kind = 'planned'
        order by s.recorded_at desc, s.seq desc limit 1) p on true
      where c.business_workspace_id = p_workspace_id and public.connected_site_change_stage(c.id) = 'planned_waiting'
      order by p.recorded_at, c.id limit 50) q), '[]'::jsonb);
end $$;

-- The task page behind a Request link (the agency Queue): which business and System.
create function public.read_connected_site_change_for_request(p_user_id uuid, p_verified_email text, p_request_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare r public.service_requests;
begin
  select * into r from public.service_requests where id = p_request_id;
  if r.id is null or r.context->>'source' is distinct from 'connected_site_change' then return null; end if;
  perform public.connected_site_assert_actor(r.business_workspace_id, p_user_id, p_verified_email, false);
  if r.context->>'systemId' is null or r.context->>'systemId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return jsonb_build_object('workspaceId', r.business_workspace_id, 'systemId', (r.context->>'systemId')::uuid);
end $$;

-- What changed: Releases recorded from connected-site changes.
create function public.read_connected_site_change_releases(p_workspace_id uuid, p_user_id uuid, p_verified_email text, p_since timestamptz) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', q.id, 'at', q.recorded_at, 'systemId', q.system_id, 'title', q.title, 'siteHost', q.site_host,
      'platform', coalesce(nullif(q.platform, 'unknown'), q.detected_platform, 'unknown'),
      'readBack', q.read_back, 'releaseNumber', q.release_number,
      'actor', public.connected_site_change_actor(p_workspace_id, q.made_by)) order by q.recorded_at desc, q.id)
    from (select s.id, s.recorded_at, c.system_id, c.title, cs.site_host, cs.platform, cs.detected_platform, s.read_back, s.release_number,
        coalesce((select d.recorded_by from public.connected_site_change_steps d where d.change_id = c.id and d.kind = 'marked_done'
          order by d.recorded_at desc, d.seq desc limit 1), s.recorded_by) as made_by
      from public.connected_site_change_steps s
      join public.connected_site_changes c on c.id = s.change_id
      join public.connected_sites cs on cs.id = c.connected_site_id
      where s.business_workspace_id = p_workspace_id and s.kind = 'released' and s.recorded_at >= p_since
      order by s.recorded_at desc, s.id limit 50) q), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------------------
-- Agency bulk view: what each client's website is built with.

create function public.record_connected_site_detection(p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_site_url text, p_site_host text, p_platform text, p_evidence text[], p_reachable boolean) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_evidence text[] := coalesce(p_evidence, '{}'::text[]); v_item text; v_row public.connected_site_detections;
begin
  perform public.connected_site_assert_actor(p_workspace_id, p_user_id, p_verified_email, false);
  if p_platform is null or p_platform not in ('unknown','custom','wix','squarespace','wordpress','webflow','shopify','framer','godaddy','google-sites','square','duda','carrd','lovable','v0','bolt','chatgpt','claude','strelva')
    or cardinality(v_evidence) > 5 or p_reachable is null
    or p_site_url is null or char_length(p_site_url) > 500 or p_site_url !~ '^https?://[^[:space:]/]+(/[^[:space:]]*)?$'
    or p_site_host is null or p_site_host !~ '^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$' then
    raise exception 'connected_site_invalid';
  end if;
  foreach v_item in array v_evidence loop
    if v_item is null or char_length(v_item) > 120 then raise exception 'connected_site_invalid'; end if;
  end loop;
  insert into public.connected_site_detections as d(business_workspace_id, site_url, site_host, platform, evidence, reachable, detected_by)
    values (p_workspace_id, p_site_url, p_site_host, p_platform, v_evidence, p_reachable, p_user_id)
    on conflict (business_workspace_id) do update set site_url = excluded.site_url, site_host = excluded.site_host, platform = excluded.platform,
      evidence = excluded.evidence, reachable = excluded.reachable, detected_by = excluded.detected_by, detected_at = clock_timestamp()
    returning * into v_row;
  if p_reachable and p_platform <> 'unknown' then
    update public.connected_sites set detected_platform = p_platform, detected_evidence = v_evidence, detected_at = clock_timestamp(), updated_at = clock_timestamp()
      where business_workspace_id = p_workspace_id and site_host = p_site_host and status = 'active';
  end if;
  return jsonb_build_object('workspaceId', v_row.business_workspace_id, 'siteUrl', v_row.site_url, 'siteHost', v_row.site_host,
    'platform', v_row.platform, 'evidence', to_jsonb(v_row.evidence), 'reachable', v_row.reachable, 'detectedAt', v_row.detected_at);
end $$;

-- A page of the clients this person is staffed on, with each one's website
-- and install state. Plain reads, no locks.
create function public.read_agency_client_sites(p_agency_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_after_name text default null, p_after_id uuid default null, p_limit integer default 100) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not exists(select 1 from public.users u join public.workspace_memberships m on m.user_id = u.id and m.workspace_id = p_agency_workspace_id
      join public.workspaces a on a.id = m.workspace_id and a.kind = 'agency'
      where u.id = p_user_id and lower(u.email) = lower(btrim(coalesce(p_verified_email, ''))) and u.verified_at is not null) then
    raise exception 'workspace_access_denied';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'system_input_invalid'; end if;
  return (
    with base as (
      select c.id, c.name, row_number() over (order by c.name, c.id) as rn
      from public.workspaces c
      where c.kind = 'customer'
        and exists(select 1 from public.provider_seats s where s.agency_workspace_id = p_agency_workspace_id and s.customer_workspace_id = c.id and s.status = 'active')
        and exists(select 1 from public.agency_client_staff st where st.agency_workspace_id = p_agency_workspace_id and st.customer_workspace_id = c.id
          and st.user_id = p_user_id and st.status = 'active')
        and (p_after_name is null or (c.name, c.id) > (p_after_name, coalesce(p_after_id, '00000000-0000-0000-0000-000000000000'::uuid)))
      order by c.name, c.id limit p_limit + 1),
    shown as (select * from base where rn <= p_limit)
    select jsonb_build_object(
      'clients', coalesce((select jsonb_agg(jsonb_build_object(
          'workspaceId', sh.id, 'name', sh.name,
          'website', (select l->>'url' from public.business_record_facts f,
              jsonb_array_elements(case when jsonb_typeof(f.value) = 'array' then f.value else '[]'::jsonb end) l
            where f.workspace_id = sh.id and f.fact_key = 'links' and l->>'kind' = 'website' limit 1),
          'sourceUrl', (select a.source_url from public.agency_client_additions a where a.customer_workspace_id = sh.id limit 1),
          'detection', (select jsonb_build_object('siteUrl', d.site_url, 'siteHost', d.site_host, 'platform', d.platform, 'evidence', to_jsonb(d.evidence),
              'reachable', d.reachable, 'detectedAt', d.detected_at)
            from public.connected_site_detections d where d.business_workspace_id = sh.id),
          'site', (select jsonb_build_object('id', cs.id, 'siteHost', cs.site_host, 'siteUrl', cs.site_url, 'platform', cs.platform,
              'detectedPlatform', cs.detected_platform, 'verifiedAt', cs.verified_at, 'firstEventAt', cs.first_event_at,
              'lastEventAt', cs.last_event_at, 'lastCheckedAt', cs.last_checked_at, 'lastCheckResult', cs.last_check_result)
            from public.connected_sites cs where cs.business_workspace_id = sh.id and cs.status = 'active' order by cs.created_at desc, cs.id limit 1)
        ) order by sh.name, sh.id) from shown sh), '[]'::jsonb),
      'nextCursor', case when exists(select 1 from base where rn > p_limit)
        then (select jsonb_build_object('name', sh.name, 'id', sh.id) from shown sh order by sh.rn desc limit 1) end));
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'list_connected_site_changes(uuid, uuid, text, uuid)',
    'plan_connected_site_change(uuid, uuid, text, uuid, uuid, uuid, text, jsonb)',
    'decide_connected_site_change(uuid, uuid, text, uuid, text)',
    'mark_connected_site_change_done(uuid, uuid, text, uuid, text)',
    'record_connected_site_change_check(uuid, uuid, text, uuid, text, text, text)',
    'release_connected_site_change_unconfirmed(uuid, uuid, text, uuid, text)',
    'withdraw_connected_site_change(uuid, uuid, text, uuid, text)',
    'list_connected_site_change_reviews(uuid, uuid, text)',
    'read_connected_site_change_for_request(uuid, text, uuid)',
    'read_connected_site_change_releases(uuid, uuid, text, timestamptz)',
    'record_connected_site_detection(uuid, uuid, text, text, text, text, text[], boolean)',
    'read_agency_client_sites(uuid, uuid, text, text, uuid, integer)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

commit;
