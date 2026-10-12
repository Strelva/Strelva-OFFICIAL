-- Claim review and the one Found-fact store (Getting started, 2026-10-12).
-- Local only until Jacob's yes. GLOSSARY: Found fact, Claim, Prepare / Full
-- control. ADR 0015 rule 4 ("the agency accepts before anything changes").
--
-- Before: an agency's add wrote phone, email and address straight into the
-- business record as the agency's unconfirmed facts and dropped everything else
-- the crawl read. The owner's claim was one button: no facts, nothing about
-- what the agency prepared, no choice of what the agency may do. An owner's own
-- website reading or Google listing read had nowhere to keep what it found.
--
-- After:
--   * business_found_facts: the one store for Found facts, whatever found them.
--     Each row says where it came from (source_kind + source_ref, and the words
--     for a website page), who found it (found_by_kind: owner, agency or
--     operator, never defaulted; agency rows name the agency) and where it
--     stands (unconfirmed, later, confirmed, changed, removed). A Found fact
--     joins the business record only when the business owner confirms or
--     changes it, as the owner's own verified write. Nobody else confirms one:
--     the record itself refuses a verified fact from anyone but the owner or an
--     operator, and an agency holds no decide path here, even with Full
--     control. Sources:
--       website_crawl              a page of the business's website (URL + quote)
--       google_listing             the owner's connected Google listing
--       client_import_sheet        the agency's client list (Import clients)
--       client_import_gohighlevel  the agency's HighLevel sub-account
--   * Pre-claim Prepare: while the business waits for its owner, the agency that
--     added it holds Prepare in every area, recorded on the existing two-doors
--     grants (agency_scope_grants, basis `pre_claim`, level `prepare` only).
--     Prepare never decides a Needs you item (claim_owner_decision 'agency'
--     still needs Full control), so nothing prepared before the claim goes live,
--     sends or writes to Google.
--   * accept_agency_client_claim_review: in one transaction the existing claim
--     acceptance (owner membership), the owner's decision for each found fact
--     (confirm / change / remove / later, applied as the owner), and the owner's
--     choice per area for that agency (Prepare / Full control / none). The
--     pre-claim grants end. Prepare takes effect at the claim (basis `claim`).
--     Full control is a proposal the agency accepts with the ordinary two-doors
--     respond_to_agency_proposal; until then the agency holds nothing in that
--     area. A receipt records every area, including the ones left out.
--   * Owner paths: read_business_found_facts (members), stage_owner_found_facts
--     and decide_business_found_facts (owner only), so an owner's website read
--     or Google read keeps what the owner leaves for later.
-- Payer, adding and ending agencies, data and exit stay owner-only: nothing
-- here touches those paths. Nothing here sends a message or calls Google.
--
-- Depends on 20261015100000 (agency add client), 20261023142000 (two doors:
-- bring in an agency), 20261004120000 (systems), 20261002120000 and
-- 20261011120000 (business record), 20261007170000 (Google bindings).
begin;
set local lock_timeout = '5s';

alter table public.agency_scope_grants add column basis text not null default 'owner'
  check (basis in ('owner', 'pre_claim', 'claim'));
alter table public.agency_scope_grants add constraint agency_scope_grants_pre_claim_prepare_only
  check (basis <> 'pre_claim' or level = 'prepare');

-- The shape of one found item. Hours carry no time zone (a website or listing
-- rarely states one); the owner supplies it when confirming. Categories have no
-- record fact: they are kept for reference and can be removed, never confirmed.
create function public.business_found_fact_valid(p_entity text, p_key text, p_value jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_entity = 'fact' then coalesce(p_key in ('phone','email','address','hours','description','links','categories') and case
      when p_key = 'hours' then jsonb_typeof(p_value) = 'object' and (p_value - 'weekly') = '{}'::jsonb
        and jsonb_typeof(p_value->'weekly') = 'array' and jsonb_array_length(p_value->'weekly') between 1 and 70
        and public.business_record_fact_valid('hours', p_value || '{"timezone":"UTC"}'::jsonb)
      when p_key = 'categories' then jsonb_typeof(p_value) = 'array' and jsonb_array_length(p_value) between 1 and 10
        and not exists (select 1 from jsonb_array_elements(p_value) c where jsonb_typeof(c) <> 'string'
          or char_length(btrim(c #>> '{}')) not between 1 and 120)
      else public.business_record_fact_valid(p_key, p_value) end, false)
    when p_entity in ('service','person') then p_key is null and jsonb_typeof(p_value) = 'object'
      and (p_value - 'name') = '{}'::jsonb and public.business_record_text_valid(p_value->'name', 1, 160)
    else false
  end
$$;

create table public.business_found_facts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  source_kind text not null check (source_kind in ('website_crawl','google_listing','client_import_sheet','client_import_gohighlevel')),
  -- The page URL for a website, `accounts/X/locations/Y` (or its Maps URL) for
  -- a Google listing, the import's own row reference for an import.
  source_ref text not null check (char_length(source_ref) between 1 and 2048 and source_ref !~ '[[:space:]]'),
  -- The words on the page. Structured sources (a listing field, an import
  -- column) have none.
  quote text check (quote is null or char_length(quote) between 1 and 300),
  found_by_kind text not null check (found_by_kind in ('owner','agency','operator')),
  agency_workspace_id uuid references public.workspaces(id) on delete cascade,
  found_by uuid not null references public.users(id) on delete restrict,
  entity text not null check (entity in ('fact','service','person')),
  fact_key text,
  value jsonb not null check (octet_length(value::text) <= 16384),
  status text not null default 'unconfirmed' check (status in ('unconfirmed','later','confirmed','changed','removed')),
  found_at timestamptz not null default clock_timestamp(),
  decided_by uuid references public.users(id) on delete set null,
  decided_at timestamptz,
  check ((found_by_kind = 'agency') = (agency_workspace_id is not null)),
  check (source_kind <> 'website_crawl' or (source_ref ~ '^https?://[^[:space:]]+$' and quote is not null)),
  check (source_kind not in ('client_import_sheet','client_import_gohighlevel') or found_by_kind = 'agency'),
  check (source_kind <> 'google_listing' or (entity = 'fact' and found_by_kind = 'owner')),
  check (fact_key is distinct from 'categories' or source_kind = 'google_listing'),
  check ((entity = 'fact') = (fact_key is not null)),
  check (public.business_found_fact_valid(entity, fact_key, value)),
  check ((status = 'unconfirmed') = (decided_at is null))
);
-- One open (unconfirmed or later) item per thing per source. Two sources may
-- each offer a phone; the owner keeps one.
create unique index business_found_facts_one_open_idx on public.business_found_facts
  (workspace_id, source_kind, entity, lower(coalesce(fact_key, value->>'name'))) where status in ('unconfirmed','later');
create index business_found_facts_workspace_idx on public.business_found_facts(workspace_id, status);
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

-- The open Found facts of one business, in the one shape every reader uses.
create function public.business_found_facts_open(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'entity', f.entity, 'key', f.fact_key, 'value', f.value, 'status', f.status,
      'sourceKind', f.source_kind, 'sourceRef', f.source_ref,
      'sourceUrl', case when f.source_ref ~ '^https?://' then f.source_ref end, 'quote', f.quote,
      'foundBy', f.found_by_kind, 'foundAt', f.found_at)
    order by array_position(array['fact','service','person'], f.entity),
      array_position(array['phone','email','address','hours','description','links','categories'], f.fact_key),
      array_position(array['client_import_sheet','client_import_gohighlevel','website_crawl','google_listing'], f.source_kind),
      f.found_at, f.id), '[]'::jsonb)
  from public.business_found_facts f where f.workspace_id = p_workspace_id and f.status in ('unconfirmed','later')
$$;

-- Stage one found item. Shared by the agency's add and the owner's own reads.
-- Website items carry sourceUrl + quote; structured items carry sourceKind +
-- sourceRef (or take the caller's). Returns 1 when something new is waiting.
-- p_replace: an owner's re-read replaces the open value for the same thing;
-- the agency's add never overwrites what is already waiting.
create function public.business_found_fact_stage(
  p_workspace_id uuid, p_found_by_kind text, p_agency_workspace_id uuid, p_user_id uuid,
  p_item jsonb, p_source_kind text, p_source_ref text, p_replace boolean
) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_entity text; v_key text; v_kind text; v_ref text; v_quote text; v_name text;
  open_row public.business_found_facts%rowtype;
begin
  if jsonb_typeof(p_item) is distinct from 'object'
    or (p_item - array['entity','key','value','sourceUrl','quote','sourceKind','sourceRef']::text[]) <> '{}'::jsonb
    or (p_item ? 'sourceUrl' and jsonb_typeof(p_item->'sourceUrl') is distinct from 'string')
    or (p_item ? 'quote' and jsonb_typeof(p_item->'quote') not in ('string','null'))
    or (p_item ? 'sourceKind' and jsonb_typeof(p_item->'sourceKind') is distinct from 'string')
    or (p_item ? 'sourceRef' and jsonb_typeof(p_item->'sourceRef') is distinct from 'string') then
    raise exception 'found_fact_invalid';
  end if;
  v_entity := coalesce(p_item->>'entity', 'fact');
  v_key := case when v_entity = 'fact' then p_item->>'key' end;
  if p_item ? 'sourceUrl' then
    v_kind := coalesce(p_item->>'sourceKind', 'website_crawl');
    v_ref := btrim(p_item->>'sourceUrl');
  else
    v_kind := coalesce(p_item->>'sourceKind', p_source_kind);
    v_ref := btrim(coalesce(p_item->>'sourceRef', p_source_ref));
  end if;
  v_quote := nullif(btrim(coalesce(p_item->>'quote', '')), '');
  if v_kind is null or v_ref is null or (v_entity <> 'fact' and p_item ? 'key') or p_item->'value' is null
    or not public.business_found_fact_valid(v_entity, v_key, p_item->'value')
    or char_length(v_ref) not between 1 and 2048 or v_ref ~ '[[:space:]]'
    or (v_quote is not null and char_length(v_quote) > 300)
    or (v_kind = 'website_crawl' and (v_ref !~ '^https?://[^[:space:]]+$' or char_length(v_ref) < 8 or v_quote is null))
    or (p_found_by_kind = 'agency' and v_kind not in ('website_crawl','client_import_sheet','client_import_gohighlevel'))
    or (p_found_by_kind = 'owner' and v_kind not in ('website_crawl','google_listing'))
    or (v_kind = 'google_listing' and v_entity <> 'fact')
    or (v_key = 'categories' and v_kind <> 'google_listing') then
    raise exception 'found_fact_invalid';
  end if;
  v_name := lower(coalesce(v_key, p_item->'value'->>'name'));
  -- An agency never re-offers a fact the owner already decided in the record.
  if p_found_by_kind = 'agency' and v_entity = 'fact' and exists (select 1 from public.business_record_facts
      where workspace_id = p_workspace_id and fact_key = v_key and verified) then
    return 0;
  end if;
  -- What the owner removed is not offered again with the same value.
  if exists (select 1 from public.business_found_facts where workspace_id = p_workspace_id and source_kind = v_kind
      and entity = v_entity and lower(coalesce(fact_key, value->>'name')) = v_name and status = 'removed' and value = p_item->'value') then
    return 0;
  end if;
  select * into open_row from public.business_found_facts where workspace_id = p_workspace_id and source_kind = v_kind
    and entity = v_entity and lower(coalesce(fact_key, value->>'name')) = v_name and status in ('unconfirmed','later') for update;
  if found then
    if not p_replace or open_row.value = p_item->'value' then return 0; end if;
    update public.business_found_facts set value = p_item->'value', source_ref = v_ref, quote = v_quote,
        found_by_kind = p_found_by_kind, agency_workspace_id = p_agency_workspace_id, found_by = p_user_id,
        found_at = clock_timestamp(), status = 'unconfirmed', decided_by = null, decided_at = null
      where id = open_row.id;
    return 1;
  end if;
  insert into public.business_found_facts(workspace_id, source_kind, source_ref, quote, found_by_kind, agency_workspace_id,
      found_by, entity, fact_key, value)
    values (p_workspace_id, v_kind, v_ref, v_quote, p_found_by_kind, p_agency_workspace_id, p_user_id, v_entity, v_key, p_item->'value');
  return 1;
end;
$$;

-- Decisions are well formed: [{id, decision: confirm|change|remove|later, value?}], each id once.
create function public.business_found_fact_decisions_valid(p_decisions jsonb) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_decisions is not null and jsonb_typeof(p_decisions) = 'array' and jsonb_array_length(p_decisions) <= 200
    and not exists (select 1 from jsonb_array_elements(p_decisions) d where jsonb_typeof(d) <> 'object'
      or (d - array['id','decision','value']::text[]) <> '{}'::jsonb
      or coalesce(d->>'decision', '') not in ('confirm','change','remove','later')
      or jsonb_typeof(d->'id') is distinct from 'string'
      or (d->>'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or (d->>'decision' = 'change' and not d ? 'value'))
    and (select count(distinct d->>'id') from jsonb_array_elements(p_decisions) d) = jsonb_array_length(p_decisions)
$$;

-- The owner's decisions, applied as the owner. Callers have already proved the
-- actor is the business owner (the claim acceptance, or the owner check).
-- Confirm keeps the found value; hours need the owner's time zone (the same
-- weekly hours with a timezone), and links may be merged into the record's
-- links as long as every found link is kept. Change writes the owner's value.
-- Remove keeps it out of the record. Later leaves it waiting, marked as seen.
create function public.business_found_facts_decide(
  p_workspace_id uuid, p_actor_id uuid, p_decisions jsonb, p_expected_revision bigint,
  p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item jsonb; row_ public.business_found_facts%rowtype; v_decision text; v_value jsonb; v_id uuid; v_revision bigint;
  patch_facts jsonb := '{}'::jsonb; patch_services jsonb := '[]'::jsonb; patch_people jsonb := '[]'::jsonb;
  confirmed integer := 0; changed integer := 0; removed integer := 0; later integer := 0; applied jsonb;
begin
  if not public.business_found_fact_decisions_valid(p_decisions) then raise exception 'found_fact_invalid'; end if;
  for item in select value from jsonb_array_elements(p_decisions) loop
    select * into row_ from public.business_found_facts
      where id = (item->>'id')::uuid and workspace_id = p_workspace_id for update;
    if not found or row_.status not in ('unconfirmed','later') then raise exception 'found_fact_not_open'; end if;
    v_decision := item->>'decision';
    if v_decision in ('remove','later') then
      update public.business_found_facts set status = case when v_decision = 'remove' then 'removed' else 'later' end,
          decided_by = p_actor_id, decided_at = clock_timestamp() where id = row_.id;
      if v_decision = 'remove' then removed := removed + 1; else later := later + 1; end if;
      continue;
    end if;
    if row_.fact_key = 'categories' then raise exception 'found_fact_no_record_fact'; end if;
    if v_decision = 'change' then
      v_value := item->'value';
    elsif row_.fact_key = 'hours' then
      v_value := item->'value';
      if v_value is null or jsonb_typeof(v_value) <> 'object' or v_value->'weekly' is distinct from row_.value->'weekly' then
        raise exception 'found_fact_invalid';
      end if;
    elsif row_.fact_key = 'links' and item ? 'value' then
      v_value := item->'value';
      if jsonb_typeof(v_value) <> 'array' or not v_value @> row_.value then raise exception 'found_fact_invalid'; end if;
    else
      if item ? 'value' and item->'value' is distinct from row_.value then raise exception 'found_fact_invalid'; end if;
      v_value := row_.value;
    end if;
    if row_.entity = 'fact' then
      if not public.business_record_fact_valid(row_.fact_key, v_value) or patch_facts ? row_.fact_key then
        raise exception 'found_fact_invalid';
      end if;
      patch_facts := patch_facts || jsonb_build_object(row_.fact_key, jsonb_build_object('value', v_value, 'verified', true));
    else
      if not public.business_found_fact_valid(row_.entity, null, v_value) then raise exception 'found_fact_invalid'; end if;
      if row_.entity = 'service' then
        select id into v_id from public.business_services where workspace_id = p_workspace_id
          and lower(name) = lower(coalesce(row_.value->>'name', '')) order by id limit 1;
        patch_services := patch_services || jsonb_build_array(jsonb_build_object('op', 'upsert', 'name', v_value->>'name', 'verified', true)
          || case when v_id is null then '{}'::jsonb else jsonb_build_object('id', v_id) end);
      else
        select id into v_id from public.business_people where workspace_id = p_workspace_id
          and lower(name) = lower(coalesce(row_.value->>'name', '')) order by id limit 1;
        patch_people := patch_people || jsonb_build_array(jsonb_build_object('op', 'upsert', 'name', v_value->>'name', 'verified', true)
          || case when v_id is null then '{}'::jsonb else jsonb_build_object('id', v_id) end);
      end if;
    end if;
    if v_decision = 'change' and v_value is distinct from row_.value then
      update public.business_found_facts set status = 'changed', decided_by = p_actor_id, decided_at = clock_timestamp() where id = row_.id;
      changed := changed + 1;
    else
      update public.business_found_facts set status = 'confirmed', decided_by = p_actor_id, decided_at = clock_timestamp() where id = row_.id;
      confirmed := confirmed + 1;
    end if;
  end loop;
  if patch_facts <> '{}'::jsonb or jsonb_array_length(patch_services) > 0 or jsonb_array_length(patch_people) > 0 then
    if p_expected_revision is not null then
      select revision into v_revision from public.business_records where workspace_id = p_workspace_id for update;
      if coalesce(v_revision, 0) <> p_expected_revision then raise exception 'business_record_revision_conflict'; end if;
    end if;
    applied := public.business_record_apply(p_workspace_id, p_actor_id, 'member', 'owner',
      jsonb_build_object('facts', patch_facts, 'services', patch_services, 'people', patch_people), null, null,
      p_command_id, p_command_digest);
  end if;
  return jsonb_build_object('confirmed', confirmed, 'changed', changed, 'removed', removed, 'later', later,
    'waiting', (select count(*) from public.business_found_facts where workspace_id = p_workspace_id and status in ('unconfirmed','later')),
    'revision', coalesce((applied->>'revision')::bigint, (select revision from public.business_records where workspace_id = p_workspace_id), 0));
end;
$$;

-- A verified member of the business (any role), or its owner.
create function public.business_found_fact_member(p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_owner boolean) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id = u.id
    join public.workspaces w on w.id = m.workspace_id and w.kind = 'customer'
    where u.id = p_user_id and lower(u.email) = lower(btrim(coalesce(p_verified_email, ''))) and u.verified_at is not null
      and m.workspace_id = p_workspace_id and (not p_owner or m.role = 'owner');
  if not found then raise exception 'found_fact_denied'; end if;
end;
$$;

-- What waits for the owner: every member of the business may see it.
create function public.read_business_found_facts(p_user_id uuid, p_verified_email text, p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.business_found_fact_member(p_user_id, p_verified_email, p_workspace_id, false);
  return public.business_found_facts_open(p_workspace_id);
end;
$$;

-- The owner's own read (their website, or their connected Google listing)
-- keeps what it found beside the record. A Google listing must be one this
-- business's connected native grant holds.
create function public.stage_owner_found_facts(
  p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_source_kind text, p_source_ref text, p_found jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare item jsonb; staged integer := 0;
begin
  perform public.business_found_fact_member(p_user_id, p_verified_email, p_workspace_id, true);
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if p_source_kind is null or p_source_kind not in ('website_crawl','google_listing')
    or p_found is null or jsonb_typeof(p_found) <> 'array' or jsonb_array_length(p_found) > 120 then
    raise exception 'found_fact_invalid';
  end if;
  if p_source_kind = 'google_listing' then
    perform 1 from public.workspace_account_bindings b join public.workspace_google_locations l on l.binding_id = b.id
      where b.workspace_id = p_workspace_id and b.provider = 'google' and b.origin_tenant_stable_id is null and b.status = 'connected'
        and l.account_id || '/locations/' || l.location_id = p_source_ref;
    if not found then raise exception 'found_fact_listing_not_connected'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('found-facts:' || p_workspace_id::text, 0));
  for item in select value from jsonb_array_elements(p_found) loop
    if p_source_kind = 'google_listing' and (item ? 'sourceUrl' or item ? 'sourceKind' or item ? 'sourceRef') then
      raise exception 'found_fact_invalid';
    end if;
    if p_source_kind = 'website_crawl' and not item ? 'sourceUrl' then raise exception 'found_fact_invalid'; end if;
    staged := staged + public.business_found_fact_stage(p_workspace_id, 'owner', null, p_user_id, item, p_source_kind, p_source_ref, true);
  end loop;
  return jsonb_build_object('staged', staged, 'found', public.business_found_facts_open(p_workspace_id));
end;
$$;

-- The owner decides any open Found fact, from any source. Only the owner: the
-- record accepts a verified fact from no one else.
create function public.decide_business_found_facts(
  p_user_id uuid, p_verified_email text, p_workspace_id uuid, p_expected_revision bigint, p_decisions jsonb,
  p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare decided jsonb;
begin
  perform public.business_found_fact_member(p_user_id, p_verified_email, p_workspace_id, true);
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$' then raise exception 'found_fact_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('found-facts:' || p_workspace_id::text, 0));
  decided := public.business_found_facts_decide(p_workspace_id, p_user_id, p_decisions, p_expected_revision, p_command_id, p_command_digest);
  return decided || jsonb_build_object('found', public.business_found_facts_open(p_workspace_id));
end;
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
-- stage what the add found (its website crawl, and the agency's own import
-- columns). Repeating it changes nothing.
create function public.stage_agency_client_found_facts(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_customer_workspace_id uuid, p_found jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item jsonb; area text; staged integer := 0;
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
    -- The add names its source per item; an item without one is a website page.
    if jsonb_typeof(item) <> 'object' or not (item ? 'sourceUrl' or item ? 'sourceKind') then raise exception 'agency_client_invalid'; end if;
    begin
      staged := staged + public.business_found_fact_stage(p_customer_workspace_id, 'agency', p_agency_workspace_id, p_user_id, item, null, null, false);
    exception when raise_exception then
      if sqlerrm = 'found_fact_invalid' then raise exception 'agency_client_invalid'; end if;
      raise;
    end;
  end loop;
  return jsonb_build_object('staged', staged,
    'waiting', (select count(*) from public.business_found_facts where workspace_id = p_customer_workspace_id and status in ('unconfirmed','later')),
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
    'found', case when v_status <> 'pending' then '[]'::jsonb else public.business_found_facts_open(claim.customer_workspace_id) end,
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
-- p_facts: [{id, decision: confirm|change|remove|later, value?}] (undecided
-- found facts stay unconfirmed). p_areas: {area: prepare|full_control|none} for
-- all five areas. p_consents: {area: the owner's words} for every area not
-- `none`. Prepare is active at once. Full control waits for the agency to
-- accept it (respond_to_agency_proposal); until then nothing changes there.
create function public.accept_agency_client_claim_review(
  p_token_hash text, p_actor_id uuid, p_verified_email text, p_facts jsonb, p_areas jsonb, p_consents jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  result jsonb;
  claim public.agency_client_owner_claims%rowtype;
  area text; choice text;
  kept_consents jsonb := '{}'::jsonb; facts_summary jsonb; decided jsonb; waiting_for_agency jsonb := '[]'::jsonb;
begin
  -- Every input is checked before anything is claimed.
  if p_areas is null or jsonb_typeof(p_areas) <> 'object' or (select count(*) from jsonb_object_keys(p_areas)) <> 5
    or p_consents is null or jsonb_typeof(p_consents) <> 'object'
    or not public.business_found_fact_decisions_valid(p_facts) then
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
      if choice = 'prepare' then
        -- The agency offered Prepare when it added the business and issued this link.
        insert into public.agency_scope_grants(customer_workspace_id, agency_workspace_id, scope, level, status, consent,
            proposed_by, responded_by, responded_at, basis)
          values (claim.customer_workspace_id, claim.agency_workspace_id, area, 'prepare', 'active', kept_consents->>area,
            p_actor_id, claim.created_by, clock_timestamp(), 'claim');
      else
        -- Full control is the owner's proposal; the agency accepts before anything changes.
        insert into public.agency_scope_grants(customer_workspace_id, agency_workspace_id, scope, level, status, consent,
            proposed_by, basis)
          values (claim.customer_workspace_id, claim.agency_workspace_id, area, 'full_control', 'proposed', kept_consents->>area,
            p_actor_id, 'claim');
        waiting_for_agency := waiting_for_agency || to_jsonb(area);
      end if;
    exception when unique_violation then
      raise exception 'agency_scope_taken';
    end;
  end loop;

  -- Facts: applied as the owner, confirmed. Removed ones never reach the record.
  begin
    decided := public.business_found_facts_decide(claim.customer_workspace_id, p_actor_id, p_facts, null,
      md5(claim.id::text || ':claim-review')::uuid,
      encode(sha256(convert_to(jsonb_build_object('claim', claim.id, 'facts', p_facts)::text, 'UTF8')), 'hex'));
  exception when raise_exception then
    if sqlerrm = 'found_fact_not_open' then raise exception 'agency_client_claim_review_changed'; end if;
    if sqlerrm in ('found_fact_invalid', 'found_fact_no_record_fact') then raise exception 'agency_client_claim_review_invalid'; end if;
    raise;
  end;

  facts_summary := jsonb_build_object('confirmed', (decided->>'confirmed')::int, 'changed', (decided->>'changed')::int,
    'removed', (decided->>'removed')::int, 'later', (decided->>'later')::int, 'waiting', (decided->>'waiting')::int);
  insert into public.agency_client_claim_reviews(claim_id, workspace_id, agency_workspace_id, owner_id, areas, consents, facts)
    values (claim.id, claim.customer_workspace_id, claim.agency_workspace_id, p_actor_id,
      (select jsonb_object_agg(a, p_areas->>a) from unnest(public.claim_review_areas()) a), kept_consents, facts_summary);
  return result || jsonb_build_object('areas', (select jsonb_object_agg(a, p_areas->>a) from unnest(public.claim_review_areas()) a),
    'facts', facts_summary, 'waitingForAgency', waiting_for_agency);
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
revoke all on function public.business_found_facts_open(uuid) from public, anon, authenticated, service_role;
revoke all on function public.business_found_fact_stage(uuid, text, uuid, uuid, jsonb, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.business_found_fact_decisions_valid(jsonb) from public, anon, authenticated;
revoke all on function public.business_found_facts_decide(uuid, uuid, jsonb, bigint, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.business_found_fact_member(uuid, text, uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.read_business_found_facts(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.stage_owner_found_facts(uuid, text, uuid, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.decide_business_found_facts(uuid, text, uuid, bigint, jsonb, uuid, text) from public, anon, authenticated;
revoke all on function public.agency_client_assert_pre_claim(uuid, text, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.stage_agency_client_found_facts(uuid, text, uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.read_agency_client_claim_review(text, uuid, text) from public, anon, authenticated;
revoke all on function public.accept_agency_client_claim_review(text, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.read_business_found_facts(uuid, text, uuid) to service_role;
grant execute on function public.stage_owner_found_facts(uuid, text, uuid, text, text, jsonb) to service_role;
grant execute on function public.decide_business_found_facts(uuid, text, uuid, bigint, jsonb, uuid, text) to service_role;
grant execute on function public.stage_agency_client_found_facts(uuid, text, uuid, uuid, jsonb) to service_role;
grant execute on function public.read_agency_client_claim_review(text, uuid, text) to service_role;
grant execute on function public.accept_agency_client_claim_review(text, uuid, text, jsonb, jsonb, jsonb) to service_role;
commit;
