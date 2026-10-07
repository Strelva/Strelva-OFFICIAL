-- Rollback for 20261007192100_internal_tool_links.sql
-- Forward SHA-256: 5a070e27938a2b69f581eba4e4aef1b8cf57ccbe368ae618c507260f2e2166c1
-- Batch 4: reverse file order; undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_contact_sources()')))) is distinct from 'abd1c46263fd98ab3ed8198e777ca636' then raise exception 'rollback_wrong_order_or_function_drift: business_contact_sources'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.application_record_links_guard()')))) is distinct from '84fca0df14cb00fe6fd31382c50d823f' then raise exception 'rollback_wrong_order_or_function_drift: application_record_links_guard'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.validate_application_spec(jsonb)')))) is distinct from '3180829477b3471926daa77aba9b8b0b' then raise exception 'rollback_wrong_order_or_function_drift: validate_application_spec'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.validate_application_record(jsonb,text,jsonb)')))) is distinct from '3db81fdafe77484460a267f658ff9e42' then raise exception 'rollback_wrong_order_or_function_drift: validate_application_record'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_internal_tool_notices(uuid,uuid,uuid,text)')))) is distinct from '8cd45ba43fd8cc3835c05825aad640c7' then raise exception 'rollback_wrong_order_or_function_drift: read_internal_tool_notices'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.finish_internal_tool_notice(uuid,uuid,text,text,text)')))) is distinct from '7d947122d6a5e9108b225a1e896ba569' then raise exception 'rollback_wrong_order_or_function_drift: finish_internal_tool_notice'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.resolve_internal_tool_links(uuid,uuid,uuid,text,jsonb)')))) is distinct from 'a035bdfb833e46ac15bafcf1cf730825' then raise exception 'rollback_wrong_order_or_function_drift: resolve_internal_tool_links'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.claim_internal_tool_notice(uuid,uuid,text,text,uuid,text)')))) is distinct from '2888a2b6a60965fb26df89e523be7488' then raise exception 'rollback_wrong_order_or_function_drift: claim_internal_tool_notice'; end if;
  if (select count(*) from pg_attribute where attrelid=to_regclass('public.internal_tool_notices') and attnum>0 and not attisdropped) <> 14 then raise exception 'rollback_wrong_order_or_table_drift: internal_tool_notices'; end if;
end;
$rollback_guard$;
lock table public."internal_tool_notices" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261007192100_internal_tool_notices" as table public."internal_tool_notices";
revoke all on release_rollback_archive."m20261007192100_internal_tool_notices" from public, anon, authenticated, service_role;
drop trigger "application_records_links_guard_trg" on public."application_records";
alter table public."business_contacts" drop constraint "business_contacts_sources_check";
alter table public."business_record_revisions" drop constraint "business_record_revisions_source_check";
alter table public."internal_tool_notices" drop constraint "internal_tool_notices_detail_check";
alter table public."internal_tool_notices" drop constraint "internal_tool_notices_status_check";
alter table public."internal_tool_notices" drop constraint "internal_tool_notices_attempts_check";
alter table public."internal_tool_notices" drop constraint "internal_tool_notices_field_id_check";
alter table public."internal_tool_notices" drop constraint "internal_tool_notices_recipient_email_check";
alter table public."internal_tool_notices" drop constraint "internal_tool_notices_provider_message_id_check";
drop function public.application_record_links_guard();
drop function public.read_internal_tool_notices(uuid,uuid,uuid,text);
drop function public.finish_internal_tool_notice(uuid,uuid,text,text,text);
drop function public.resolve_internal_tool_links(uuid,uuid,uuid,text,jsonb);
drop function public.claim_internal_tool_notice(uuid,uuid,text,text,uuid,text);
drop table public."internal_tool_notices";
CREATE OR REPLACE FUNCTION public.business_contact_sources()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select array['inquiry','booking','tenant_import','owner','operator','agency','website','agent']::text[]
$function$
;
revoke all on function public.business_contact_sources() from public, anon, authenticated, service_role;
grant execute on function public.business_contact_sources() to "service_role";
CREATE OR REPLACE FUNCTION public.validate_application_spec(p_spec jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      or (field->>'type') not in ('text', 'number', 'boolean', 'date', 'select')
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
$function$
;
revoke all on function public.validate_application_spec(jsonb) from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.validate_application_record(p_spec jsonb, p_record_id text, p_values jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      or (field_required and jsonb_typeof(value) = 'string' and value #>> '{}' = '') then
      raise exception 'application_record_invalid';
    end if;
  end loop;
end;
$function$
;
revoke all on function public.validate_application_record(jsonb,text,jsonb) from public, anon, authenticated, service_role;
alter table public."business_contacts" add constraint "business_contacts_sources_check" CHECK ((cardinality(sources) between 1 and 8) AND (sources <@ ARRAY['inquiry'::text, 'booking'::text, 'tenant_import'::text, 'owner'::text, 'operator'::text, 'agency'::text, 'website'::text, 'agent'::text]));
alter table public."business_record_revisions" add constraint "business_record_revisions_source_check" CHECK ((source = ANY (ARRAY['owner'::text, 'operator'::text, 'agency'::text, 'tenant_import'::text, 'website_rebuild'::text, 'bookings'::text, 'inquiries'::text, 'agent'::text])));
commit;
