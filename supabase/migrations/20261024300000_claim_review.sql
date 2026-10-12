-- Claim review (Getting started L3, 2026-10-12). Local only until Jacob's yes.
-- GLOSSARY: Found fact, Claim, Prepare / Full control. ADR 0015 rule 4.
--
-- Before: an agency's add wrote phone, email and address straight into the
-- business record as the agency's unconfirmed facts and dropped everything else
-- the crawl read. The owner's claim was one button: no facts, nothing about
-- what the agency prepared, no choice of what the agency may do.
--
-- After:
--   * business_found_facts: what the add read on the client's website (facts,
--     services, people), each with the page and words it came from. A Found
--     fact joins the business record only when the owner confirms or changes it
--     at the claim. Staging never writes the record and never marks anything
--     confirmed.
--   * Pre-claim Prepare: while the business waits for its owner, the agency that
--     added it holds Prepare in every area, recorded on the existing two-doors
--     grants (agency_scope_grants, basis `pre_claim`, level `prepare` only).
--     Prepare never decides a Needs you item (claim_owner_decision 'agency'
--     still needs Full control), so nothing prepared before the claim goes live,
--     sends or writes to Google.
--   * accept_agency_client_claim_review: in one transaction the existing claim
--     acceptance (owner membership), the owner's decision for each found fact
--     (confirm / change / remove, applied as the owner), and the owner's choice
--     per area for that agency (Prepare / Full control / none). The pre-claim
--     grants end; each chosen area becomes an ordinary grant (basis `claim`)
--     carrying the owner's own consent words. A receipt records every area,
--     including the ones the owner left out.
-- Payer, adding and ending agencies, data and exit stay owner-only: nothing
-- here touches those paths. Nothing here sends a message or calls Google.
--
-- Depends on 20261015100000 (agency add client), 20261023142000 (two doors:
-- bring in an agency), 20261004120000 (systems), 20261002120000 and
-- 20261011120000 (business record).
begin;
set local lock_timeout = '5s';

alter table public.agency_scope_grants add column basis text not null default 'owner'
  check (basis in ('owner', 'pre_claim', 'claim'));
alter table public.agency_scope_grants add constraint agency_scope_grants_pre_claim_prepare_only
  check (basis <> 'pre_claim' or level = 'prepare');

-- The shape of one found item. Hours carry no time zone (a website rarely
-- states one); the owner supplies it when confirming.
create function public.business_found_fact_valid(p_entity text, p_key text, p_value jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_entity = 'fact' then coalesce(p_key in ('phone','email','address','hours','description','links') and case
      when p_key = 'hours' then jsonb_typeof(p_value) = 'object' and (p_value - 'weekly') = '{}'::jsonb
        and jsonb_typeof(p_value->'weekly') = 'array' and jsonb_array_length(p_value->'weekly') between 1 and 70
        and public.business_record_fact_valid('hours', p_value || '{"timezone":"UTC"}'::jsonb)
      else public.business_record_fact_valid(p_key, p_value) end, false)
    when p_entity in ('service','person') then p_key is null and jsonb_typeof(p_value) = 'object'
      and (p_value - 'name') = '{}'::jsonb and public.business_record_text_valid(p_value->'name', 1, 160)
    else false
  end
$$;

create table public.business_found_facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agency_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity text not null check (entity in ('fact','service','person')),
  fact_key text,
  value jsonb not null,
  source_url text not null check (char_length(source_url) between 8 and 2048 and source_url ~ '^https?://[^[:space:]]+$'),
  quote text not null check (char_length(quote) between 1 and 300),
  state text not null default 'pending' check (state in ('pending','confirmed','changed','removed')),
  found_by uuid not null references public.users(id) on delete restrict,
  found_at timestamptz not null default clock_timestamp(),
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  check ((entity = 'fact') = (fact_key is not null)),
  check (public.business_found_fact_valid(entity, fact_key, value)),
  check ((state = 'pending') = (decided_at is null))
);
create unique index business_found_facts_one_pending_idx on public.business_found_facts
  (workspace_id, entity, lower(coalesce(fact_key, value->>'name'))) where state = 'pending';
create index business_found_facts_workspace_idx on public.business_found_facts(workspace_id, state);
alter table public.business_found_facts enable row level security;
revoke all on public.business_found_facts from public, anon, authenticated, service_role;

-- What the owner decided at the claim, area by area, in the owner's words.
create table public.agency_client_claim_reviews (
  claim_id uuid primary key references public.agency_client_owner_claims(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  agency_workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid references public.users(id) on delete set null,
  areas jsonb not null check (jsonb_typeof(areas) = 'object'
    and areas ?& array['website','inquiries','bookings','google','internal_tools']
    and (areas - array['website','inquiries','bookings','google','internal_tools']) = '{}'::jsonb),
  consents jsonb not null check (jsonb_typeof(consents) = 'object' and octet_length(consents::text) <= 12000),
  facts jsonb not null check (jsonb_typeof(facts) = 'object'),
  reviewed_at timestamptz not null default clock_timestamp()
);
alter table public.agency_client_claim_reviews enable row level security;
revoke all on public.agency_client_claim_reviews from public, anon, authenticated, service_role;

create function public.agency_client_claim_review_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and old.owner_id is not null and new.owner_id is null
    and not exists (select 1 from public.users where id = old.owner_id)
    and (to_jsonb(new) - 'owner_id') = (to_jsonb(old) - 'owner_id') then
    return new;
  end if;
  if tg_op = 'DELETE' and (not exists (select 1 from public.workspaces where id = old.workspace_id)
    or not exists (select 1 from public.agency_client_owner_claims where id = old.claim_id)) then
    return old;
  end if;
  raise exception 'agency_client_claim_review_immutable';
end;
$$;
create trigger agency_client_claim_reviews_guard before update or delete on public.agency_client_claim_reviews
  for each row execute function public.agency_client_claim_review_guard();

create function public.claim_review_areas() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['website','inquiries','bookings','google','internal_tools']
$$;

-- The adding agency, still serving a business that waits for its owner, with
-- the business locked. Raises the add-client refusals the app already maps.
create function public.agency_client_assert_pre_claim(p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_customer_workspace_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.agency_client_assert_actor(p_user_id, p_verified_email, p_agency_workspace_id);
  if p_customer_workspace_id is null then raise exception 'agency_client_access_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_customer_workspace_id::text, 7415));
  perform 1 from public.agency_client_additions
    where customer_workspace_id = p_customer_workspace_id and agency_workspace_id = p_agency_workspace_id;
  if not found then raise exception 'agency_client_access_denied'; end if;
  perform 1 from public.workspace_providers
    where customer_workspace_id = p_customer_workspace_id and provider_workspace_id = p_agency_workspace_id and status = 'active' for share;
  if not found then raise exception 'agency_client_access_denied'; end if;
  perform 1 from public.provider_seats
    where customer_workspace_id = p_customer_workspace_id and agency_workspace_id = p_agency_workspace_id and status = 'active' for share;
  if not found then raise exception 'agency_client_access_denied'; end if;
  if public.workspace_exit_completed(p_customer_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if not public.agency_client_waiting_for_owner(p_customer_workspace_id) then raise exception 'agency_client_owner_exists'; end if;
end;
$$;

-- After an add: open the adding agency's pre-claim Prepare in every area and
-- stage what the crawl found. Repeating it changes nothing.
create function public.stage_agency_client_found_facts(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_customer_workspace_id uuid, p_found jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item jsonb; v_entity text; v_key text; v_url text; v_quote text;
  area text; staged integer := 0; inserted integer;
begin
  if p_found is null or jsonb_typeof(p_found) <> 'array' or jsonb_array_length(p_found) > 120 then
    raise exception 'agency_client_invalid';
  end if;
  perform public.agency_client_assert_pre_claim(p_user_id, p_verified_email, p_agency_workspace_id, p_customer_workspace_id);
  foreach area in array public.claim_review_areas() loop
    if not exists (select 1 from public.agency_scope_grants where customer_workspace_id = p_customer_workspace_id
        and agency_workspace_id = p_agency_workspace_id and scope = area and status in ('proposed','active')) then
      insert into public.agency_scope_grants(customer_workspace_id, agency_workspace_id, scope, level, status, consent,
          proposed_by, responded_by, responded_at, basis)
        values (p_customer_workspace_id, p_agency_workspace_id, area, 'prepare', 'active',
          'Added this business before its owner claimed it. Prepare only: nothing goes live, sends or writes to Google until the owner claims it and decides this area.',
          p_user_id, p_user_id, clock_timestamp(), 'pre_claim');
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_found) loop
    if jsonb_typeof(item) <> 'object' or (item - array['entity','key','value','sourceUrl','quote']::text[]) <> '{}'::jsonb
      or jsonb_typeof(item->'sourceUrl') is distinct from 'string' or jsonb_typeof(item->'quote') is distinct from 'string' then
      raise exception 'agency_client_invalid';
    end if;
    v_entity := item->>'entity';
    v_key := case when v_entity = 'fact' then item->>'key' end;
    v_url := btrim(item->>'sourceUrl');
    v_quote := btrim(item->>'quote');
    if v_entity is null or (v_entity <> 'fact' and item ? 'key') or item->'value' is null
      or not public.business_found_fact_valid(v_entity, v_key, item->'value')
      or char_length(v_url) not between 8 and 2048 or v_url !~ '^https?://[^[:space:]]+$'
      or char_length(v_quote) not between 1 and 300 then
      raise exception 'agency_client_invalid';
    end if;
    -- A fact the owner already decided is never offered again.
    if v_entity = 'fact' and exists (select 1 from public.business_record_facts
        where workspace_id = p_customer_workspace_id and fact_key = v_key and verified) then
      continue;
    end if;
    insert into public.business_found_facts(workspace_id, agency_workspace_id, entity, fact_key, value, source_url, quote, found_by)
      values (p_customer_workspace_id, p_agency_workspace_id, v_entity, v_key, item->'value', v_url, v_quote, p_user_id)
      on conflict do nothing;
    get diagnostics inserted = row_count;
    staged := staged + inserted;
  end loop;
  return jsonb_build_object('staged', staged,
    'waiting', (select count(*) from public.business_found_facts where workspace_id = p_customer_workspace_id and state = 'pending'),
    'preparing', (select coalesce(jsonb_agg(g.scope order by g.scope), '[]'::jsonb) from public.agency_scope_grants g
      where g.customer_workspace_id = p_customer_workspace_id and g.agency_workspace_id = p_agency_workspace_id
        and g.status = 'active' and g.basis = 'pre_claim'));
end;
$$;

-- The claim review, for the signed-in recipient only. The link alone shows
-- nothing here: found facts and drafts are the business's private data.
create function public.read_agency_client_claim_review(p_token_hash text, p_user_id uuid, p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  claim public.agency_client_owner_claims%rowtype;
  v_email text := lower(btrim(coalesce(p_verified_email, '')));
  v_status text;
begin
  perform 1 from public.users where id = p_user_id and lower(email) = v_email and verified_at is not null;
  if not found then raise exception 'agency_client_claim_identity_required'; end if;
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'agency_client_claim_not_found'; end if;
  select * into claim from public.agency_client_owner_claims where token_hash = p_token_hash;
  if not found then raise exception 'agency_client_claim_not_found'; end if;
  if claim.recipient_email <> v_email then raise exception 'agency_client_claim_recipient_mismatch'; end if;
  if claim.status = 'accepted' and claim.accepted_by is distinct from p_user_id then raise exception 'agency_client_claim_recipient_mismatch'; end if;
  v_status := case when claim.status = 'pending' and claim.expires_at <= clock_timestamp() then 'expired' else claim.status end;
  return jsonb_build_object(
    'status', v_status,
    'workspaceId', claim.customer_workspace_id,
    'workspaceName', (select name from public.workspaces where id = claim.customer_workspace_id),
    'agencyWorkspaceId', claim.agency_workspace_id,
    'agencyName', (select name from public.workspaces where id = claim.agency_workspace_id),
    'found', case when v_status <> 'pending' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
        'id', f.id, 'entity', f.entity, 'key', f.fact_key, 'value', f.value, 'sourceUrl', f.source_url, 'quote', f.quote)
        order by array_position(array['fact','service','person'], f.entity),
          array_position(array['phone','email','address','hours','description','links'], f.fact_key), f.found_at, f.id)
      from public.business_found_facts f where f.workspace_id = claim.customer_workspace_id and f.state = 'pending'), '[]'::jsonb) end,
    'prepared', case when v_status <> 'pending' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind)
        order by s.created_at, s.id)
      from (select * from public.systems where business_workspace_id = claim.customer_workspace_id and lifecycle = 'draft'
        order by created_at, id limit 50) s), '[]'::jsonb) end,
    'fullControlTaken', coalesce((select jsonb_agg(distinct g.scope) from public.agency_scope_grants g
      where g.customer_workspace_id = claim.customer_workspace_id and g.agency_workspace_id <> claim.agency_workspace_id
        and g.level = 'full_control' and g.status in ('proposed','active')), '[]'::jsonb));
end;
$$;

-- The owner takes the business and decides, in one transaction.
-- p_facts: [{id, decision: confirm|change|remove, value?}] (undecided found
-- facts stay waiting). p_areas: {area: prepare|full_control|none} for all five
-- areas. p_consents: {area: the owner's words} for every area not `none`.
create function public.accept_agency_client_claim_review(
  p_token_hash text, p_actor_id uuid, p_verified_email text, p_facts jsonb, p_areas jsonb, p_consents jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  result jsonb;
  claim public.agency_client_owner_claims%rowtype;
  item jsonb; found_row public.business_found_facts%rowtype; v_decision text; v_value jsonb; v_id uuid;
  area text; choice text;
  patch_facts jsonb := '{}'::jsonb; patch_services jsonb := '[]'::jsonb; patch_people jsonb := '[]'::jsonb;
  confirmed integer := 0; changed integer := 0; removed integer := 0;
  kept_consents jsonb := '{}'::jsonb; facts_summary jsonb;
begin
  -- Every input is checked before anything is claimed.
  if p_areas is null or jsonb_typeof(p_areas) <> 'object' or (select count(*) from jsonb_object_keys(p_areas)) <> 5
    or p_consents is null or jsonb_typeof(p_consents) <> 'object'
    or p_facts is null or jsonb_typeof(p_facts) <> 'array' or jsonb_array_length(p_facts) > 200 then
    raise exception 'agency_client_claim_review_invalid';
  end if;
  foreach area in array public.claim_review_areas() loop
    choice := p_areas->>area;
    if choice is null or choice not in ('prepare','full_control','none') then raise exception 'agency_client_claim_review_invalid'; end if;
    if choice <> 'none' then
      if jsonb_typeof(p_consents->area) is distinct from 'string' or char_length(btrim(p_consents->>area)) not between 1 and 2000 then
        raise exception 'agency_client_claim_review_invalid';
      end if;
      kept_consents := kept_consents || jsonb_build_object(area, btrim(p_consents->>area));
    end if;
  end loop;
  for item in select value from jsonb_array_elements(p_facts) loop
    if jsonb_typeof(item) <> 'object' or (item - array['id','decision','value']::text[]) <> '{}'::jsonb
      or item->>'decision' not in ('confirm','change','remove') or jsonb_typeof(item->'id') is distinct from 'string'
      or (item->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'agency_client_claim_review_invalid';
    end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_facts)) <> jsonb_array_length(p_facts) then
    raise exception 'agency_client_claim_review_invalid';
  end if;

  result := public.accept_agency_client_owner_claim(p_token_hash, p_actor_id, p_verified_email);
  -- A replayed or no-longer-pending claim changes nothing more.
  if result->>'status' <> 'accepted' or coalesce((result->>'alreadyAccepted')::boolean, false) then return result; end if;
  select * into claim from public.agency_client_owner_claims where token_hash = p_token_hash;

  -- Areas: the agency's pre-claim Prepare ends; the owner's choices replace it.
  update public.agency_scope_grants set status = 'ended', ended_by = p_actor_id, ended_at = clock_timestamp()
    where customer_workspace_id = claim.customer_workspace_id and agency_workspace_id = claim.agency_workspace_id
      and status in ('proposed','active');
  foreach area in array public.claim_review_areas() loop
    choice := p_areas->>area;
    continue when choice = 'none';
    begin
      -- The agency offered these areas when it added the business and issued this link.
      insert into public.agency_scope_grants(customer_workspace_id, agency_workspace_id, scope, level, status, consent,
          proposed_by, responded_by, responded_at, basis)
        values (claim.customer_workspace_id, claim.agency_workspace_id, area, choice, 'active', kept_consents->>area,
          p_actor_id, claim.created_by, clock_timestamp(), 'claim');
    exception when unique_violation then
      raise exception 'agency_scope_taken';
    end;
  end loop;

  -- Facts: applied as the owner, confirmed. Removed ones never reach the record.
  for item in select value from jsonb_array_elements(p_facts) loop
    select * into found_row from public.business_found_facts
      where id = (item->>'id')::uuid and workspace_id = claim.customer_workspace_id for update;
    if not found or found_row.state <> 'pending' then raise exception 'agency_client_claim_review_changed'; end if;
    v_decision := item->>'decision';
    if v_decision = 'remove' then
      update public.business_found_facts set state = 'removed', decided_by = p_actor_id, decided_at = clock_timestamp() where id = found_row.id;
      removed := removed + 1;
      continue;
    end if;
    v_value := case when v_decision = 'change' or (found_row.entity = 'fact' and found_row.fact_key = 'hours') then item->'value' else found_row.value end;
    if v_value is null then raise exception 'agency_client_claim_review_invalid'; end if;
    if found_row.entity = 'fact' then
      if not public.business_record_fact_valid(found_row.fact_key, v_value) then raise exception 'agency_client_claim_review_invalid'; end if;
      patch_facts := patch_facts || jsonb_build_object(found_row.fact_key, jsonb_build_object('value', v_value, 'verified', true));
    else
      if not public.business_found_fact_valid(found_row.entity, null, v_value) then raise exception 'agency_client_claim_review_invalid'; end if;
      if found_row.entity = 'service' then
        select id into v_id from public.business_services where workspace_id = claim.customer_workspace_id
          and lower(name) = lower(coalesce(found_row.value->>'name', '')) order by id limit 1;
        patch_services := patch_services || jsonb_build_array(jsonb_build_object('op', 'upsert', 'name', v_value->>'name', 'verified', true)
          || case when v_id is null then '{}'::jsonb else jsonb_build_object('id', v_id) end);
      else
        select id into v_id from public.business_people where workspace_id = claim.customer_workspace_id
          and lower(name) = lower(coalesce(found_row.value->>'name', '')) order by id limit 1;
        patch_people := patch_people || jsonb_build_array(jsonb_build_object('op', 'upsert', 'name', v_value->>'name', 'verified', true)
          || case when v_id is null then '{}'::jsonb else jsonb_build_object('id', v_id) end);
      end if;
    end if;
    if v_decision = 'change' and v_value is distinct from found_row.value then
      update public.business_found_facts set state = 'changed', decided_by = p_actor_id, decided_at = clock_timestamp() where id = found_row.id;
      changed := changed + 1;
    else
      update public.business_found_facts set state = 'confirmed', decided_by = p_actor_id, decided_at = clock_timestamp() where id = found_row.id;
      confirmed := confirmed + 1;
    end if;
  end loop;
  if patch_facts <> '{}'::jsonb or jsonb_array_length(patch_services) > 0 or jsonb_array_length(patch_people) > 0 then
    perform public.business_record_apply(claim.customer_workspace_id, p_actor_id, 'member', 'owner',
      jsonb_build_object('facts', patch_facts, 'services', patch_services, 'people', patch_people), null, null,
      md5(claim.id::text || ':claim-review')::uuid,
      encode(sha256(convert_to(jsonb_build_object('claim', claim.id, 'facts', p_facts)::text, 'UTF8')), 'hex'));
  end if;

  facts_summary := jsonb_build_object('confirmed', confirmed, 'changed', changed, 'removed', removed,
    'waiting', (select count(*) from public.business_found_facts where workspace_id = claim.customer_workspace_id and state = 'pending'));
  insert into public.agency_client_claim_reviews(claim_id, workspace_id, agency_workspace_id, owner_id, areas, consents, facts)
    values (claim.id, claim.customer_workspace_id, claim.agency_workspace_id, p_actor_id,
      (select jsonb_object_agg(a, p_areas->>a) from unnest(public.claim_review_areas()) a), kept_consents, facts_summary);
  return result || jsonb_build_object('areas', (select jsonb_object_agg(a, p_areas->>a) from unnest(public.claim_review_areas()) a), 'facts', facts_summary);
end;
$$;

-- Pre-claim Prepare is enforced where effects happen, not only where grants
-- are read: while an agency-added business waits for its owner, no System goes
-- live, no Needs you item is approved, the public business page stays
-- unpublished, and a connected site neither captures forms nor injects data
-- (the agency may still create, install and verify it). The agency that issued
-- a claim can't accept it itself. These hold for every caller, flag or not.
create function public.agency_client_pre_claim(p_workspace_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.agency_client_additions where customer_workspace_id = p_workspace_id)
    and public.agency_client_waiting_for_owner(p_workspace_id)
$$;

create function public.agency_client_pre_claim_guard() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'systems' then
    if new.lifecycle = 'live' and old.lifecycle is distinct from 'live' and public.agency_client_pre_claim(new.business_workspace_id) then
      raise exception 'agency_client_pre_claim_prepare_only';
    end if;
  elsif tg_table_name = 'owner_decisions' then
    if new.state = 'approved' and old.state is distinct from 'approved' and public.agency_client_pre_claim(new.workspace_id) then
      raise exception 'agency_client_pre_claim_prepare_only';
    end if;
  elsif tg_table_name = 'business_pages' then
    if new.published and (tg_op = 'INSERT' or not old.published) and public.agency_client_pre_claim(new.workspace_id) then
      raise exception 'agency_client_pre_claim_prepare_only';
    end if;
  elsif tg_table_name = 'connected_sites' then
    if public.agency_client_pre_claim(new.business_workspace_id) then
      if tg_op = 'INSERT' then
        new.capture_forms := false;
        new.inject_schema := false;
      elsif (new.capture_forms and not old.capture_forms) or (new.inject_schema and not old.inject_schema) then
        raise exception 'agency_client_pre_claim_prepare_only';
      end if;
    end if;
  elsif tg_table_name = 'agency_client_owner_claims' then
    if new.status = 'accepted' and old.status <> 'accepted' and exists (select 1 from public.workspace_memberships
        where workspace_id = new.agency_workspace_id and user_id = new.accepted_by) then
      raise exception 'agency_client_claim_agency_member';
    end if;
  end if;
  return new;
end;
$$;
create trigger systems_claim_guard before update of lifecycle on public.systems
  for each row execute function public.agency_client_pre_claim_guard();
create trigger owner_decisions_pre_claim_guard before update of state on public.owner_decisions
  for each row execute function public.agency_client_pre_claim_guard();
create trigger business_pages_pre_claim_guard before insert or update of published on public.business_pages
  for each row execute function public.agency_client_pre_claim_guard();
create trigger connected_sites_pre_claim_guard before insert or update of capture_forms, inject_schema on public.connected_sites
  for each row execute function public.agency_client_pre_claim_guard();
create trigger agency_client_owner_claims_agency_member_guard before update of status on public.agency_client_owner_claims
  for each row execute function public.agency_client_pre_claim_guard();

revoke all on function public.business_found_fact_valid(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.agency_client_claim_review_guard() from public, anon, authenticated, service_role;
revoke all on function public.agency_client_pre_claim_guard() from public, anon, authenticated, service_role;
revoke all on function public.agency_client_pre_claim(uuid) from public, anon, authenticated, service_role;
revoke all on function public.claim_review_areas() from public, anon, authenticated;
revoke all on function public.agency_client_assert_pre_claim(uuid, text, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.stage_agency_client_found_facts(uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.read_agency_client_claim_review(text, uuid, text) from public, anon, authenticated;
revoke all on function public.accept_agency_client_claim_review(text, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.stage_agency_client_found_facts(uuid, text, uuid, uuid, jsonb) to service_role;
grant execute on function public.read_agency_client_claim_review(text, uuid, text) to service_role;
grant execute on function public.accept_agency_client_claim_review(text, uuid, text, jsonb, jsonb, jsonb) to service_role;
commit;
