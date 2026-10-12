-- Import clients (GLOSSARY: Import clients) and per-agency add limits.
-- Additive. Local only until Jacob's yes.
--
-- Before: every agency shared one fixed abuse limit for adding clients, 25 a
-- UTC day and 100 businesses still waiting for their owner
-- (agency_client_add_limits(), 20261015100000). Nothing could tell an agency,
-- before adding, which of its rows were already its clients.
--
-- After:
--   * agency_client_add_limit_overrides: an operator may set one agency's
--     daily and waiting-for-owner limits. Without a row an agency keeps the
--     shared default exactly. Every change keeps who, when and why in an
--     immutable history, guarded by an expected revision like release flags.
--   * agency_client_add_limits_for(agency): the limits that apply to one
--     agency. agency_add_client now reads it; its body is otherwise the
--     20261015100000 body unchanged.
--   * agency_client_import_preview: for an owner or admin of the agency,
--     which import keys (command ids) were already added, which of its
--     clients share a website host with the rows, and the agency's limits and
--     use. It reads only; nothing is added at preview.
-- An import adds each row through agency_add_client with its own
-- deterministic command id, so re-importing the same source row replays.
-- Depends on 20261015100000 and 20261007130000.
begin;
set local lock_timeout = '3s';

create table public.agency_client_add_limit_overrides (
  agency_workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  daily integer not null check (daily between 1 and 500),
  waiting_for_owner integer not null check (waiting_for_owner between 1 and 2000),
  revision bigint not null default 1 check (revision > 0),
  changed_by uuid not null references public.users(id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp()
);
-- Immutable. `workspace_id` is the agency, so the shared release-history guard applies.
create table public.agency_client_add_limit_changes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  before_limits jsonb,
  after_limits jsonb,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  changed_by uuid not null references public.users(id) on delete restrict,
  changed_at timestamptz not null default clock_timestamp()
);
create index agency_client_add_limit_changes_idx on public.agency_client_add_limit_changes(workspace_id, changed_at desc, id);
alter table public.agency_client_add_limit_overrides enable row level security;
alter table public.agency_client_add_limit_changes enable row level security;
revoke all on public.agency_client_add_limit_overrides, public.agency_client_add_limit_changes
  from public, anon, authenticated, service_role;
create trigger agency_client_add_limit_changes_immutable before update or delete on public.agency_client_add_limit_changes
  for each row execute function public.workspace_release_flag_change_immutable();

-- The limits for one agency: its operator-set row, else the shared default.
create function public.agency_client_add_limits_for(p_agency_workspace_id uuid, out daily integer, out waiting_for_owner integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(o.daily, d.daily), coalesce(o.waiting_for_owner, d.waiting_for_owner)
  from public.agency_client_add_limits() d
  left join public.agency_client_add_limit_overrides o on o.agency_workspace_id = p_agency_workspace_id
$$;

create function public.agency_client_add_limits_json(p_agency_workspace_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'agencyWorkspaceId', p_agency_workspace_id,
    'daily', l.daily,
    'waitingForOwner', l.waiting_for_owner,
    'raised', o.agency_workspace_id is not null,
    'revision', coalesce(o.revision, 0),
    'usedToday', coalesce((select q.additions from public.agency_client_add_quota q
      where q.agency_workspace_id = p_agency_workspace_id and q.day = (now() at time zone 'UTC')::date), 0),
    'waiting', (select count(*) from public.agency_client_additions a
      join public.provider_seats s on s.customer_workspace_id = a.customer_workspace_id
        and s.agency_workspace_id = a.agency_workspace_id and s.status = 'active'
      where a.agency_workspace_id = p_agency_workspace_id
        and public.agency_client_waiting_for_owner(a.customer_workspace_id)))
  from public.agency_client_add_limits_for(p_agency_workspace_id) l
  left join public.agency_client_add_limit_overrides o on o.agency_workspace_id = p_agency_workspace_id
$$;

-- Operator sets (or, with both limits null, removes) one agency's limits.
create function public.set_agency_client_add_limits(
  p_operator_email text, p_agency_workspace_id uuid, p_daily integer, p_waiting_for_owner integer,
  p_reason text, p_expected_revision bigint
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare operator_id uuid; current_row public.agency_client_add_limit_overrides%rowtype; before_limits jsonb; after_limits jsonb;
begin
  operator_id := public.workspace_release_assert_operator(p_operator_email);
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 then raise exception 'agency_client_limits_reason_required'; end if;
  if (p_daily is null) <> (p_waiting_for_owner is null)
    or (p_daily is not null and (p_daily not between 1 and 500 or p_waiting_for_owner not between 1 and 2000)) then
    raise exception 'agency_client_limits_invalid';
  end if;
  perform 1 from public.workspaces where id = p_agency_workspace_id and kind = 'agency' for update;
  if not found then raise exception 'agency_client_limits_agency_invalid'; end if;
  select * into current_row from public.agency_client_add_limit_overrides where agency_workspace_id = p_agency_workspace_id for update;
  if p_expected_revision is null or p_expected_revision <> coalesce(current_row.revision, 0) then
    raise exception 'agency_client_limits_revision_conflict';
  end if;
  before_limits := case when current_row.agency_workspace_id is null then null
    else jsonb_build_object('daily', current_row.daily, 'waitingForOwner', current_row.waiting_for_owner) end;
  after_limits := case when p_daily is null then null
    else jsonb_build_object('daily', p_daily, 'waitingForOwner', p_waiting_for_owner) end;
  if before_limits is not distinct from after_limits then
    return public.agency_client_add_limits_json(p_agency_workspace_id);
  end if;
  if p_daily is null then
    delete from public.agency_client_add_limit_overrides where agency_workspace_id = p_agency_workspace_id;
  else
    insert into public.agency_client_add_limit_overrides(agency_workspace_id, daily, waiting_for_owner, revision, changed_by)
      values (p_agency_workspace_id, p_daily, p_waiting_for_owner, coalesce(current_row.revision, 0) + 1, operator_id)
      on conflict (agency_workspace_id) do update set daily = excluded.daily, waiting_for_owner = excluded.waiting_for_owner,
        revision = excluded.revision, changed_by = excluded.changed_by, changed_at = clock_timestamp();
  end if;
  insert into public.agency_client_add_limit_changes(workspace_id, before_limits, after_limits, reason, changed_by)
    values (p_agency_workspace_id, before_limits, after_limits, btrim(p_reason), operator_id);
  return public.agency_client_add_limits_json(p_agency_workspace_id);
end;
$$;

-- What an import needs to know before anything is added, for an owner or
-- admin of the agency. p_command_ids: the rows' deterministic import keys.
-- p_hosts: the rows' website hosts, lowercased without `www.`. Bounded.
create function public.agency_client_import_preview(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_command_ids uuid[], p_hosts text[]
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(cardinality(p_command_ids), 0) > 500 or coalesce(cardinality(p_hosts), 0) > 500 then
    raise exception 'agency_client_invalid';
  end if;
  perform public.agency_client_assert_actor(p_user_id, p_verified_email, p_agency_workspace_id);
  return jsonb_build_object(
    'addedCommandIds', coalesce((select jsonb_agg(a.command_id order by a.command_id) from public.agency_client_additions a
      where a.agency_workspace_id = p_agency_workspace_id and a.command_id = any(coalesce(p_command_ids, '{}'::uuid[]))), '[]'::jsonb),
    'sameHost', coalesce((select jsonb_agg(jsonb_build_object('sourceUrl', a.source_url, 'customerWorkspaceId', a.customer_workspace_id,
        'name', w.name) order by a.added_at, a.id)
      from public.agency_client_additions a join public.workspaces w on w.id = a.customer_workspace_id
      where a.agency_workspace_id = p_agency_workspace_id and a.source_url is not null
        and regexp_replace(lower(substring(a.source_url from '^https?://([^/?#:]+)')), '^www\.', '') = any(coalesce(p_hosts, '{}'::text[]))), '[]'::jsonb),
    'limits', public.agency_client_add_limits_json(p_agency_workspace_id));
end;
$$;

-- The agency's limits and use, for any verified member of the agency.
create function public.read_agency_client_add_limits(p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id = u.id
    join public.workspaces w on w.id = m.workspace_id and w.kind = 'agency'
    where u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
      and m.workspace_id = p_agency_workspace_id;
  if not found then raise exception 'agency_client_access_denied'; end if;
  return public.agency_client_add_limits_json(p_agency_workspace_id);
end;
$$;

-- agency_add_client, unchanged except that the limits are this agency's.
create or replace function public.agency_add_client(
  p_user_id uuid, p_verified_email text, p_agency_workspace_id uuid, p_input jsonb,
  p_command_id uuid, p_command_digest text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  addition public.agency_client_additions%rowtype;
  limits record;
  business_name text;
  source_url text;
  prospect_row public.prospects%rowtype;
  business_id uuid;
  facts jsonb;
  fact record;
  applied jsonb;
  used integer;
begin
  if p_command_id is null or p_command_digest is null or p_command_digest !~ '^[0-9a-f]{64}$'
    or p_input is null or jsonb_typeof(p_input) <> 'object'
    or (p_input - array['name','sourceUrl','prospectId','facts']::text[]) <> '{}'::jsonb
    or jsonb_typeof(p_input->'name') is distinct from 'string'
    or (p_input ? 'sourceUrl' and jsonb_typeof(p_input->'sourceUrl') not in ('string','null'))
    or (p_input ? 'prospectId' and jsonb_typeof(p_input->'prospectId') not in ('string','null'))
    or (p_input ? 'facts' and jsonb_typeof(p_input->'facts') <> 'object') then
    raise exception 'agency_client_invalid';
  end if;
  business_name := btrim(p_input->>'name');
  if char_length(business_name) not between 1 and 120 then raise exception 'agency_client_invalid'; end if;
  source_url := nullif(btrim(coalesce(p_input->>'sourceUrl', '')), '');
  if source_url is not null and (char_length(source_url) not between 8 and 2048 or source_url !~ '^https?://[^[:space:]]+$') then
    raise exception 'agency_client_invalid';
  end if;
  facts := coalesce(p_input->'facts', '{}'::jsonb);
  for fact in select key, value from jsonb_each(facts) loop
    -- Only the owner confirms; owner_recipient is the owner's to set (#524).
    if jsonb_typeof(fact.value) <> 'object' or (fact.value - 'value') <> '{}'::jsonb or fact.value->'value' is null
      or fact.key = 'owner_recipient' then
      raise exception 'agency_client_invalid';
    end if;
  end loop;

  perform public.agency_client_assert_actor(p_user_id, p_verified_email, p_agency_workspace_id);
  -- One add at a time per agency: quota, replay and prospect checks serialize.
  perform pg_advisory_xact_lock(hashtextextended('agency-client-add:' || p_agency_workspace_id::text, 0));

  select * into addition from public.agency_client_additions
    where agency_workspace_id = p_agency_workspace_id and command_id = p_command_id;
  if found then
    if addition.command_digest <> p_command_digest then raise exception 'agency_client_idempotency_conflict'; end if;
    return public.agency_client_addition_json(addition, true);
  end if;

  if p_input->>'prospectId' is not null then
    begin
      select * into prospect_row from public.prospects
        where id = (p_input->>'prospectId')::uuid and agency_workspace_id = p_agency_workspace_id;
    exception when invalid_text_representation then raise exception 'agency_client_invalid';
    end;
    if prospect_row.id is null then raise exception 'agency_client_prospect_not_found'; end if;
    if exists (select 1 from public.agency_client_additions where prospect_id = prospect_row.id) then
      raise exception 'agency_client_prospect_added';
    end if;
  end if;

  select * into limits from public.agency_client_add_limits_for(p_agency_workspace_id);
  if (select count(*) from public.agency_client_additions a
      join public.provider_seats s on s.customer_workspace_id = a.customer_workspace_id
        and s.agency_workspace_id = a.agency_workspace_id and s.status = 'active'
      where a.agency_workspace_id = p_agency_workspace_id
        and public.agency_client_waiting_for_owner(a.customer_workspace_id)) >= limits.waiting_for_owner then
    raise exception 'agency_client_waiting_limit';
  end if;
  insert into public.agency_client_add_quota(agency_workspace_id, day, additions)
    values (p_agency_workspace_id, (now() at time zone 'UTC')::date, 1)
    on conflict (agency_workspace_id, day) do update set additions = agency_client_add_quota.additions + 1
      where agency_client_add_quota.additions < limits.daily
    returning additions into used;
  if used is null then raise exception 'agency_client_daily_limit'; end if;

  insert into public.workspaces(kind, name, created_by) values ('customer', business_name, p_user_id)
    returning id into business_id;
  perform pg_advisory_xact_lock(hashtextextended(business_id::text, 7415));
  insert into public.workspace_providers(customer_workspace_id, provider_workspace_id, source, started_by)
    values (business_id, p_agency_workspace_id, 'agency_added', p_user_id);
  insert into public.provider_seats(customer_workspace_id, agency_workspace_id, granted_by_kind, granted_by)
    values (business_id, p_agency_workspace_id, 'agency_added', p_user_id);
  insert into public.agency_client_staff(agency_workspace_id, customer_workspace_id, user_id, assigned_by)
    values (p_agency_workspace_id, business_id, p_user_id, p_user_id);

  -- The display name is always seeded; it is the agency's input, unconfirmed like the rest.
  facts := jsonb_build_object('display_name', jsonb_build_object('value', to_jsonb(business_name))) || (facts - 'display_name');
  if source_url is not null and not facts ? 'links' then
    facts := facts || jsonb_build_object('links', jsonb_build_object('value',
      jsonb_build_array(jsonb_build_object('kind', 'website', 'url', source_url))));
  end if;
  applied := public.business_record_apply(business_id, p_user_id, 'agency', 'agency',
    jsonb_build_object('facts', facts), null, null, p_command_id, p_command_digest);

  insert into public.agency_client_additions(agency_workspace_id, customer_workspace_id, added_by, source_kind,
      source_url, prospect_id, facts_seeded, command_id, command_digest)
    values (p_agency_workspace_id, business_id, p_user_id, case when prospect_row.id is null then 'url' else 'prospect' end,
      source_url, prospect_row.id, (select count(*) from public.business_record_facts where workspace_id = business_id),
      p_command_id, p_command_digest)
    returning * into addition;
  return public.agency_client_addition_json(addition, false);
end;
$$;

revoke all on function public.agency_client_add_limits_for(uuid) from public, anon, authenticated, service_role;
revoke all on function public.agency_client_add_limits_json(uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_agency_client_add_limits(text, uuid, integer, integer, text, bigint) from public, anon, authenticated;
revoke all on function public.agency_client_import_preview(uuid, text, uuid, uuid[], text[]) from public, anon, authenticated;
revoke all on function public.read_agency_client_add_limits(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.set_agency_client_add_limits(text, uuid, integer, integer, text, bigint) to service_role;
grant execute on function public.agency_client_import_preview(uuid, text, uuid, uuid[], text[]) to service_role;
grant execute on function public.read_agency_client_add_limits(uuid, text, uuid) to service_role;
commit;
