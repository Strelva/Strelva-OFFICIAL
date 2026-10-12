-- Rollback for 20261024200000_agency_client_import.sql
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Refuses once an operator has set any agency's limits (a row or its history
-- exists): those are recorded decisions. Unset them and preserve the history
-- first. Clients added by an import are ordinary additions and stay.
begin;
set local lock_timeout = '3s';
do $rollback_guard$
begin
  if to_regprocedure('public.agency_client_add_limits_for(uuid)') is null then
    raise exception 'rollback_wrong_order: 20261024200000 is not applied';
  end if;
  if exists (select 1 from public.agency_client_add_limit_overrides) or exists (select 1 from public.agency_client_add_limit_changes) then
    raise exception 'agency_client_import_rollback_requires_data_preservation';
  end if;
end;
$rollback_guard$;

-- agency_add_client exactly as 20261015100000 left it.
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

  select * into limits from public.agency_client_add_limits();
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

drop function public.read_agency_client_add_limits(uuid, text, uuid);
drop function public.agency_client_import_preview(uuid, text, uuid, uuid[], text[]);
drop function public.set_agency_client_add_limits(text, uuid, integer, integer, text, bigint);
drop function public.agency_client_add_limits_json(uuid);
drop function public.agency_client_add_limits_for(uuid);
drop table public.agency_client_add_limit_changes;
drop table public.agency_client_add_limit_overrides;
commit;
