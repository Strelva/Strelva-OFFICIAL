-- Internal tools that point at the business record
-- (docs/product/specs/systems-catalog.md section 3.1, items 6 to 8).
--
--   * Two new field types. A `contact` field stores a business_contacts id; an
--     `assigned_person` field stores a business_people id. A record never keeps
--     a copy of the name. A trigger on application_records refuses any id from
--     another business, on every insert and edit path.
--   * resolve_internal_tool_links: a member submitting a record turns an email
--     or phone into a contact (found or created through business_record_apply
--     with source `internal_app`, so it has history and undo) and an email into
--     a person on staff. When the email matches one contact and the phone
--     another, the email match wins and the result says so.
--   * internal_tool_notices: one row per submitted record, the receipt for the
--     email to the assigned person. Claiming is idempotent, so a retried
--     submit never sends twice.
--   * `newsletter` joins the contact sources (Publishing reads subscribers as
--     contacts). Nothing here subscribes anyone.
--
-- Additive. No tenant table, `reb:` key or /api/v1 shape changes.
set local lock_timeout = '3s';

-- 1. Sources ---------------------------------------------------------------
create or replace function public.business_contact_sources() returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select array['inquiry','booking','tenant_import','owner','operator','agency','website','agent','internal_app','newsletter']::text[]
$$;

alter table public.business_contacts drop constraint business_contacts_sources_check;
alter table public.business_contacts add constraint business_contacts_sources_check check (
  cardinality(sources) between 1 and 10
  and sources <@ array['inquiry','booking','tenant_import','owner','operator','agency','website','agent','internal_app','newsletter']::text[]
);

-- Revisions written by an internal tool submit say so. Callers still cannot
-- write with this source: business_record_begin_write checks
-- business_record_sources(), which is unchanged.
alter table public.business_record_revisions drop constraint business_record_revisions_source_check;
alter table public.business_record_revisions add constraint business_record_revisions_source_check check (
  source in ('owner','operator','agency','tenant_import','website_rebuild','bookings','inquiries','agent','internal_app')
);

-- 2. Field types -----------------------------------------------------------
create or replace function public.validate_application_spec(p_spec jsonb)
returns void language plpgsql immutable set search_path = public, pg_temp as $$
declare
  field jsonb;
  component jsonb;
  reference jsonb;
  option jsonb;
  field_id text;
  option_value text;
  field_ids text[] := array[]::text[];
  option_values text[];
begin
  if p_spec is null or jsonb_typeof(p_spec) is distinct from 'object' then raise exception 'application_schema_invalid'; end if;
  if exists (
    select 1 from jsonb_object_keys(p_spec) as key
    where key not in ('title', 'maintenanceOwner', 'fields', 'components')
  ) then raise exception 'application_schema_invalid'; end if;
  if jsonb_typeof(p_spec->'title') is distinct from 'string'
    or char_length(btrim(p_spec->>'title')) not between 1 and 160 then raise exception 'application_schema_invalid'; end if;
  if jsonb_typeof(p_spec->'maintenanceOwner') is distinct from 'string'
    or char_length(p_spec->>'maintenanceOwner') not between 1 and 100 then raise exception 'application_schema_invalid'; end if;
  if jsonb_typeof(p_spec->'fields') is distinct from 'array'
    or jsonb_array_length(p_spec->'fields') not between 1 and 30 then raise exception 'application_schema_invalid'; end if;
  if jsonb_typeof(p_spec->'components') is distinct from 'array'
    or jsonb_array_length(p_spec->'components') not between 1 and 12 then raise exception 'application_schema_invalid'; end if;

  for field in select item.field_value from jsonb_array_elements(p_spec->'fields') as item(field_value) loop
    if jsonb_typeof(field) is distinct from 'object'
      or exists (select 1 from jsonb_object_keys(field) as key where key not in ('id', 'label', 'type', 'required', 'options'))
      or jsonb_typeof(field->'id') is distinct from 'string'
      or (field->>'id') !~ '^[a-z][a-z0-9_]{0,39}$'
      or field->>'id' in ('constructor', 'prototype')
      or jsonb_typeof(field->'label') is distinct from 'string'
      or char_length(btrim(field->>'label')) not between 1 and 80
      or (field->>'type') not in ('text', 'number', 'boolean', 'date', 'select', 'contact', 'assigned_person')
      or jsonb_typeof(field->'required') is distinct from 'boolean' then
      raise exception 'application_schema_invalid';
    end if;
    field_id := field->>'id';
    if field_id = any(field_ids) then raise exception 'application_schema_invalid'; end if;
    field_ids := array_append(field_ids, field_id);

    if field->>'type' = 'select' then
      if jsonb_typeof(field->'options') is distinct from 'array'
        or jsonb_array_length(field->'options') not between 1 and 20 then
        raise exception 'application_schema_invalid';
      end if;
      option_values := array[]::text[];
      for option in select item.value from jsonb_array_elements(field->'options') as item(value) loop
        option_value := option #>> '{}';
        if jsonb_typeof(option) is distinct from 'string'
          or char_length(option_value) not between 1 and 80
          or option_value <> btrim(option_value)
          or option_value = any(option_values) then
          raise exception 'application_schema_invalid';
        end if;
        option_values := array_append(option_values, option_value);
      end loop;
    elsif field ? 'options' then
      raise exception 'application_schema_invalid';
    end if;
  end loop;

  -- One assigned person per tool keeps "one email per submit" exact.
  if (select count(*) from jsonb_array_elements(p_spec->'fields') as item(field_value)
      where item.field_value->>'type' = 'assigned_person') > 1 then
    raise exception 'application_schema_invalid';
  end if;

  for component in select value from jsonb_array_elements(p_spec->'components') as item(value) loop
    if jsonb_typeof(component) is distinct from 'object'
      or exists (select 1 from jsonb_object_keys(component) as key where key not in ('kind', 'fields'))
      or (component->>'kind') not in ('form', 'list', 'detail', 'document')
      or jsonb_typeof(component->'fields') is distinct from 'array'
      or jsonb_array_length(component->'fields') not between 1 and 30 then
      raise exception 'application_schema_invalid';
    end if;
    for reference in select value from jsonb_array_elements(component->'fields') as item(value) loop
      if jsonb_typeof(reference) is distinct from 'string'
        or not ((reference #>> '{}') = any(field_ids)) then
        raise exception 'application_schema_invalid';
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.validate_application_record(
  p_spec jsonb, p_record_id text, p_values jsonb
) returns void language plpgsql immutable set search_path = public, pg_temp as $$
declare
  field jsonb;
  key text;
  value jsonb;
  field_type text;
  field_required boolean;
begin
  perform public.validate_application_spec(p_spec);
  if p_record_id is null or char_length(btrim(p_record_id)) not between 1 and 100
    or p_values is null or jsonb_typeof(p_values) is distinct from 'object' then
    raise exception 'application_record_invalid';
  end if;
  for key in select jsonb_object_keys(p_values) loop
    if not exists (
      select 1 from jsonb_array_elements(p_spec->'fields') as item(field_value)
      where item.field_value->>'id' = key
    ) then
      raise exception 'application_record_invalid';
    end if;
    value := p_values->key;
    if jsonb_typeof(value) not in ('string', 'number', 'boolean')
      or (jsonb_typeof(value) = 'string' and char_length(value #>> '{}') > 10000) then
      raise exception 'application_record_invalid';
    end if;
  end loop;
  for field in select item.field_value from jsonb_array_elements(p_spec->'fields') as item(field_value) loop
    key := field->>'id';
    field_type := field->>'type';
    field_required := (field->>'required')::boolean;
    value := p_values->key;
    if value is null or jsonb_typeof(value) = 'null' then
      if field_required then raise exception 'application_record_invalid'; end if;
    elsif (field_type = 'text' and jsonb_typeof(value) <> 'string')
      or (field_type = 'number' and jsonb_typeof(value) <> 'number')
      or (field_type = 'boolean' and jsonb_typeof(value) <> 'boolean')
      or (field_type = 'date' and (jsonb_typeof(value) <> 'string' or not public.application_is_valid_date_only(value #>> '{}')))
      or (field_type = 'select' and jsonb_typeof(value) <> 'string')
      or (field_type = 'select' and jsonb_typeof(value) = 'string' and value #>> '{}' <> '' and not exists (
        select 1 from jsonb_array_elements(field->'options') as item(option_value)
        where item.option_value #>> '{}' = value #>> '{}'
      ))
      -- A link field holds the id of a record in this business, never a name.
      or (field_type in ('contact', 'assigned_person') and (jsonb_typeof(value) <> 'string'
        or (value #>> '{}' <> '' and value #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')))
      or (field_required and jsonb_typeof(value) = 'string' and value #>> '{}' = '') then
      raise exception 'application_record_invalid';
    end if;
  end loop;
end;
$$;

revoke all on function public.validate_application_spec(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.validate_application_record(jsonb, text, jsonb) from public, anon, authenticated, service_role;

-- 3. Link guard on every record write -------------------------------------
create or replace function public.application_record_links_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  release_spec jsonb;
  field jsonb;
  link text;
begin
  select r.spec into release_spec
    from public.application_states s
    join public.application_releases r on r.work_id = s.work_id and r.version = s.current_release_version
    where s.work_id = new.work_id;
  if release_spec is null then return new; end if;
  for field in select item.field_value from jsonb_array_elements(release_spec->'fields') as item(field_value)
    where item.field_value->>'type' in ('contact', 'assigned_person') loop
    link := new.values->>(field->>'id');
    if link is null or link = '' then continue; end if;
    if link !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'application_record_link_denied';
    end if;
    if field->>'type' = 'contact' and not exists (
      select 1 from public.business_contacts c where c.id = link::uuid and c.workspace_id = new.workspace_id
    ) then
      raise exception 'application_record_link_denied';
    end if;
    if field->>'type' = 'assigned_person' and not exists (
      select 1 from public.business_people p where p.id = link::uuid and p.workspace_id = new.workspace_id and p.active
    ) then
      raise exception 'application_record_link_denied';
    end if;
  end loop;
  return new;
end;
$$;

create trigger application_records_links_guard_trg
  before insert or update of values on public.application_records
  for each row execute function public.application_record_links_guard();

revoke all on function public.application_record_links_guard() from public, anon, authenticated, service_role;

-- 4. Resolve emails and phones into business record ids --------------------
-- p_links: [{"fieldId":"client","kind":"contact","name":?,"email":?,"phone":?},
--           {"fieldId":"owner","kind":"assigned_person","email":"sam@..."}]
-- Returns {"<fieldId>": {"id": uuid, "created": bool, "conflict": bool}}.
create or replace function public.resolve_internal_tool_links(
  p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text, p_links jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  release_spec jsonb;
  link jsonb;
  field jsonb;
  field_id text;
  link_email text;
  link_phone text;
  link_key text;
  email_match uuid;
  phone_match uuid;
  found_id uuid;
  apply_result jsonb;
  result jsonb := '{}'::jsonb;
begin
  if p_user_id is null or p_verified_email is null or not exists (
    select 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
  ) then raise exception 'workspace_membership_required'; end if;
  perform 1 from public.workspace_memberships where workspace_id = p_workspace_id and user_id = p_user_id for share;
  if not found then raise exception 'workspace_membership_required'; end if;
  perform 1 from public.workspaces where id = p_workspace_id and kind = 'customer';
  if not found then raise exception 'application_record_link_denied'; end if;
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  select r.spec into release_spec
    from public.saved_product_work w
    join public.application_states s on s.work_id = w.id and s.workspace_id = w.workspace_id
    join public.application_releases r on r.work_id = s.work_id and r.version = s.current_release_version
    where w.id = p_work_id and w.workspace_id = p_workspace_id and w.product_id = 'applications'
      and s.lifecycle_status = 'installed';
  if release_spec is null then raise exception 'application_access_denied'; end if;
  if p_links is null or jsonb_typeof(p_links) <> 'array' or jsonb_array_length(p_links) not between 1 and 30 then
    raise exception 'application_record_invalid';
  end if;

  for link in select value from jsonb_array_elements(p_links) loop
    field_id := link->>'fieldId';
    select item.field_value into field from jsonb_array_elements(release_spec->'fields') as item(field_value)
      where item.field_value->>'id' = field_id;
    if field is null or field->>'type' is distinct from link->>'kind' or result ? field_id then
      raise exception 'application_record_invalid';
    end if;
    link_email := nullif(lower(btrim(coalesce(link->>'email', ''))), '');
    link_phone := nullif(btrim(coalesce(link->>'phone', '')), '');

    if link->>'kind' = 'assigned_person' then
      if link_email is null then raise exception 'application_record_invalid'; end if;
      select p.id into found_id from public.business_people p
        where p.workspace_id = p_workspace_id and p.email = link_email and p.active
        order by p.created_at, p.id limit 1;
      if found_id is null then raise exception 'application_record_person_unknown'; end if;
      result := result || jsonb_build_object(field_id, jsonb_build_object('id', found_id, 'created', false, 'conflict', false));
    else
      link_key := public.business_contact_phone_key(link_phone);
      if (link_email is null and link_phone is null)
        or (link_email is not null and not public.business_record_email_valid(link_email))
        or (link_phone is not null and link_key is null) then
        raise exception 'application_record_invalid';
      end if;
      select c.id into email_match from public.business_contacts c where c.workspace_id = p_workspace_id and c.email = link_email;
      select c.id into phone_match from public.business_contacts c where c.workspace_id = p_workspace_id and c.phone_key = link_key;
      apply_result := public.business_record_apply(
        p_workspace_id, p_user_id, 'member', 'internal_app', null,
        jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'name', nullif(btrim(coalesce(link->>'name', '')), ''),
          'email', link_email, 'phone', link_phone, 'source', 'internal_app'))),
        null, gen_random_uuid(),
        encode(sha256(convert_to(p_work_id::text || ':' || field_id || ':' || coalesce(link_email, '') || ':' || coalesce(link_key, ''), 'UTF8')), 'hex'));
      found_id := coalesce(
        (select c.id from public.business_contacts c where c.workspace_id = p_workspace_id and c.email = link_email),
        (select c.id from public.business_contacts c where c.workspace_id = p_workspace_id and c.phone_key = link_key));
      if found_id is null then raise exception 'business_record_conflict'; end if;
      result := result || jsonb_build_object(field_id, jsonb_build_object(
        'id', found_id,
        'created', email_match is null and phone_match is null,
        'conflict', email_match is not null and phone_match is not null and email_match <> phone_match));
    end if;
    field := null; found_id := null; email_match := null; phone_match := null;
  end loop;
  return result;
end;
$$;

revoke all on function public.resolve_internal_tool_links(uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.resolve_internal_tool_links(uuid, uuid, uuid, text, jsonb) to service_role;

-- 5. Assigned-person notice receipts ----------------------------------------
create table public.internal_tool_notices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null,
  record_id text not null,
  field_id text not null check (field_id ~ '^[a-z][a-z0-9_]{0,39}$'),
  person_id uuid references public.business_people(id) on delete set null,
  recipient_email text check (recipient_email is null or recipient_email = lower(btrim(recipient_email))),
  status text not null default 'pending' check (status in ('pending','sent','suppressed','failed','skipped')),
  detail text check (detail is null or char_length(detail) <= 300),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  attempts integer not null default 0 check (attempts between 0 and 20),
  created_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (work_id, record_id),
  foreign key (work_id, record_id) references public.application_records(work_id, record_id) on delete cascade
);
create index internal_tool_notices_workspace_idx on public.internal_tool_notices(workspace_id, created_at desc);
alter table public.internal_tool_notices enable row level security;
revoke all on table public.internal_tool_notices from public, anon, authenticated, service_role;

-- Claims the one notice for a submitted record. A second claim for the same
-- record returns claimed=false and the existing receipt, so a retried submit
-- or a double click never sends a second email.
create or replace function public.claim_internal_tool_notice(
  p_workspace_id uuid, p_work_id uuid, p_record_id text, p_field_id text, p_user_id uuid, p_verified_email text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  record_row public.application_records%rowtype;
  person public.business_people%rowtype;
  person_link text;
  notice public.internal_tool_notices%rowtype;
begin
  if p_user_id is null or p_verified_email is null or not exists (
    select 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
  ) then raise exception 'workspace_membership_required'; end if;
  perform 1 from public.workspace_memberships where workspace_id = p_workspace_id and user_id = p_user_id for share;
  if not found then raise exception 'workspace_membership_required'; end if;
  select * into record_row from public.application_records
    where work_id = p_work_id and record_id = btrim(p_record_id) and workspace_id = p_workspace_id;
  if not found then raise exception 'internal_tool_notice_denied'; end if;
  person_link := record_row.values->>p_field_id;
  if person_link is null or person_link !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'internal_tool_notice_denied';
  end if;
  select * into person from public.business_people where id = person_link::uuid and workspace_id = p_workspace_id;
  if not found then raise exception 'internal_tool_notice_denied'; end if;

  insert into public.internal_tool_notices(workspace_id, work_id, record_id, field_id, person_id, recipient_email, status, detail, created_by)
    values (p_workspace_id, p_work_id, record_row.record_id, p_field_id, person.id, person.email,
      case when person.email is null then 'skipped' else 'pending' end,
      case when person.email is null then 'no_email' end, p_user_id)
    on conflict (work_id, record_id) do nothing
    returning * into notice;
  if notice.id is null then
    select * into notice from public.internal_tool_notices where work_id = p_work_id and record_id = record_row.record_id;
    return jsonb_build_object('claimed', false, 'noticeId', notice.id, 'status', notice.status);
  end if;
  return jsonb_build_object('claimed', notice.status = 'pending', 'noticeId', notice.id, 'status', notice.status,
    'recipientEmail', notice.recipient_email, 'personName', person.name);
end;
$$;

create or replace function public.finish_internal_tool_notice(
  p_notice_id uuid, p_workspace_id uuid, p_status text, p_detail text, p_provider_message_id text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare notice public.internal_tool_notices%rowtype;
begin
  if p_status not in ('sent','suppressed','failed') then raise exception 'internal_tool_notice_invalid'; end if;
  update public.internal_tool_notices
    set status = p_status, detail = left(p_detail, 300), provider_message_id = p_provider_message_id,
        attempts = attempts + 1, updated_at = clock_timestamp()
    where id = p_notice_id and workspace_id = p_workspace_id and status in ('pending','failed')
    returning * into notice;
  if notice.id is null then raise exception 'internal_tool_notice_denied'; end if;
  return jsonb_build_object('noticeId', notice.id, 'status', notice.status, 'attempts', notice.attempts);
end;
$$;

-- Receipts for one tool, for its members. Names the recipient by email only.
create or replace function public.read_internal_tool_notices(
  p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_user_id is null or p_verified_email is null or not exists (
    select 1 from public.users where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
  ) then raise exception 'workspace_membership_required'; end if;
  perform 1 from public.workspace_memberships where workspace_id = p_workspace_id and user_id = p_user_id;
  if not found then raise exception 'workspace_membership_required'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'recordId', n.record_id, 'recipientEmail', n.recipient_email,
      'status', n.status, 'detail', n.detail, 'attempts', n.attempts, 'createdAt', n.created_at, 'updatedAt', n.updated_at)
      order by n.created_at desc)
    from public.internal_tool_notices n where n.workspace_id = p_workspace_id and n.work_id = p_work_id), '[]'::jsonb);
end;
$$;

revoke all on function public.claim_internal_tool_notice(uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.finish_internal_tool_notice(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.read_internal_tool_notices(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_internal_tool_notice(uuid, uuid, text, text, uuid, text) to service_role;
grant execute on function public.finish_internal_tool_notice(uuid, uuid, text, text, text) to service_role;
grant execute on function public.read_internal_tool_notices(uuid, uuid, uuid, text) to service_role;
