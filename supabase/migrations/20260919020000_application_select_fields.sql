-- Select fields keep a finite, data-only option list in the released spec.
-- Existing records are checked against every candidate release before the
-- active pointer changes, so removing or renaming a used option fails closed.

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
      or (field->>'type') not in ('text', 'number', 'boolean', 'select')
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
$$;

revoke all on function public.validate_application_spec(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.validate_application_record(jsonb, text, jsonb) from public, anon, authenticated, service_role;
