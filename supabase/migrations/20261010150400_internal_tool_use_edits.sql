-- Linked corrections use a separate RPC. The flags-off legacy edit stays intact.
-- Resolve only form-owned links after grant, ownership, replay and revision checks.
-- Contact writes and the record correction commit or roll back together.
set local lock_timeout = '3s';

create or replace function public.edit_internal_tool_use_record(
  p_user_id uuid,
  p_verified_email text,
  p_work_id uuid,
  p_grant_id uuid,
  p_release_version integer,
  p_expected_record_revision integer,
  p_record jsonb,
  p_idempotency_key text
) returns table (
  work_id uuid, workspace_id uuid, title text, release_version integer,
  released_spec jsonb, records jsonb, id uuid, recipient_email text,
  views text[], record_read_scope text, record_edit_scope text,
  record_submit boolean, purpose text, expires_at timestamptz, status text,
  granted_by uuid, created_at timestamptz, revoked_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  app public.saved_product_work%rowtype;
  access public.application_use_grants%rowtype;
  state public.application_states%rowtype;
  target public.application_records%rowtype;
  existing public.application_use_edits%rowtype;
  snapshot jsonb;
  spec jsonb;
  form_fields jsonb;
  input_digest text;
  next_revision integer;
  history jsonb;
  compatibility_records jsonb;
  merged_values jsonb;
  link_field jsonb;
  link_value text;
  linked_id uuid;
  link_email text;
  link_phone text;
  link_phone_key text;
begin
  if p_release_version is null or p_release_version <= 0
    or p_expected_record_revision is null or p_expected_record_revision <= 0
    or p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 120
    or p_record is null or jsonb_typeof(p_record) <> 'object'
    or (p_record - array['id', 'values']) <> '{}'::jsonb
    or jsonb_typeof(p_record->'id') <> 'string'
    or p_record->>'id' !~ '^[^[:space:]][^[:space:]]{0,99}$'
    or jsonb_typeof(p_record->'values') <> 'object'
    or octet_length(p_record::text) > 200000 then
    raise exception 'application_use_invalid';
  end if;
  input_digest := md5(p_record::text || ':' || p_expected_record_revision::text);

  select work.* into app from public.saved_product_work as work
  where work.id = p_work_id and work.product_id = 'applications' and work.resource_kind = 'application'
  for update;
  if not found then raise exception 'application_use_denied'; end if;
  perform 1 from public.users as identity
  where identity.id = p_user_id and lower(identity.email) = lower(btrim(p_verified_email)) and identity.verified_at is not null
  for share;
  if not found then raise exception 'verified_identity_required'; end if;
  select grant_row.* into access from public.application_use_grants as grant_row
  where grant_row.id = p_grant_id and grant_row.work_id = p_work_id
    and grant_row.recipient_email = lower(btrim(p_verified_email))
    and grant_row.status = 'active' and grant_row.expires_at > clock_timestamp()
  for share;
  if not found or access.record_edit_scope = 'none' or not ('form' = any(access.views)) then
    raise exception 'application_use_denied';
  end if;

  select * into state from public.application_states
  where application_states.work_id = p_work_id and application_states.workspace_id = app.workspace_id
  for update;
  if not found then raise exception 'application_use_denied'; end if;

  select edit.* into existing from public.application_use_edits as edit
  where edit.grant_id = access.id and edit.idempotency_key = p_idempotency_key
  for share;
  if found then
    if existing.work_id <> p_work_id or existing.actor_id <> p_user_id
      or existing.input_digest <> input_digest or existing.release_version <> p_release_version
      or existing.expected_record_revision <> p_expected_record_revision then
      raise exception 'idempotency_conflict';
    end if;
    return query select * from public.read_application_use_v2(p_user_id, p_verified_email, p_work_id);
    return;
  end if;

  begin snapshot := public.application_runtime_snapshot(p_work_id);
  exception when others then raise exception 'application_use_denied'; end;
  if snapshot is null or snapshot->>'release_version' !~ '^[1-9][0-9]*$'
    or jsonb_typeof(snapshot->'released_spec') <> 'object' then raise exception 'application_use_denied'; end if;
  if p_release_version <> (snapshot->>'release_version')::integer then raise exception 'release_version_conflict'; end if;
  spec := snapshot->'released_spec';
  form_fields := (
    select component.value->'fields'
    from jsonb_array_elements(coalesce(spec->'components', '[]'::jsonb)) as component(value)
    where component.value->>'kind' = 'form'
    limit 1
  );
  if form_fields is null then raise exception 'application_use_denied'; end if;
  if exists (
    select 1 from jsonb_object_keys(p_record->'values') as submitted(key)
    where not exists (select 1 from jsonb_array_elements_text(form_fields) as allowed(id) where allowed.id = submitted.key)
  ) then raise exception 'application_use_denied'; end if;

  select record_row.* into target from public.application_records as record_row
  where record_row.work_id = p_work_id and record_row.record_id = btrim(p_record->>'id')
  for update;
  if not found then raise exception 'application_use_denied'; end if;
  if access.record_edit_scope = 'own' and target.created_by is distinct from p_user_id then
    raise exception 'application_use_denied';
  end if;
  if target.record_revision <> p_expected_record_revision then raise exception 'application_record_revision_conflict'; end if;
  if jsonb_array_length(coalesce(target.edit_history, '[]'::jsonb)) >= 100 then raise exception 'application_edit_history_limit'; end if;

  -- Form submission replaces only form-owned fields. Other saved values are
  -- not writable by the recipient and must survive the correction.
  merged_values := (target.values - array(select jsonb_array_elements_text(form_fields))) || (p_record->'values');
  if not exists(select 1 from public.workspaces where id=app.workspace_id and kind='customer') then
    raise exception 'application_record_link_denied';
  end if;
  if public.workspace_exit_completed(app.workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  for link_field in select field.value from jsonb_array_elements(spec->'fields') field(value)
    where field.value->>'type' in ('contact','assigned_person')
      and exists(select 1 from jsonb_array_elements_text(form_fields) allowed(id) where allowed.id=field.value->>'id') loop
    link_value := p_record->'values'->>(link_field->>'id');
    if nullif(btrim(link_value),'') is null or link_value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then continue; end if;
    if jsonb_typeof(p_record->'values'->(link_field->>'id')) <> 'string' then raise exception 'application_record_invalid'; end if;
    linked_id := null;
    if link_field->>'type'='assigned_person' then
      select person.id into linked_id from public.business_people person
        where person.workspace_id=app.workspace_id and person.email=lower(btrim(link_value)) and person.active
        order by person.created_at,person.id limit 1;
      if linked_id is null then raise exception 'application_record_person_unknown'; end if;
    else
      link_email := case when position('@' in link_value)>0 then lower(btrim(link_value)) end;
      link_phone := case when link_email is null then btrim(link_value) end;
      link_phone_key := public.business_contact_phone_key(link_phone);
      if (link_email is not null and not public.business_record_email_valid(link_email))
        or (link_phone is not null and link_phone_key is null) then raise exception 'application_record_invalid'; end if;
      perform public.business_record_apply(app.workspace_id,p_user_id,'member','internal_app',null,
        jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('email',link_email,'phone',link_phone,'source','internal_app'))),
        null,gen_random_uuid(),encode(sha256(convert_to(p_work_id::text || ':' || (link_field->>'id') || ':' || coalesce(link_email,'') || ':' || coalesce(link_phone_key,''),'UTF8')),'hex'));
      linked_id := coalesce(
        (select contact.id from public.business_contacts contact where contact.workspace_id=app.workspace_id and contact.email=link_email),
        (select contact.id from public.business_contacts contact where contact.workspace_id=app.workspace_id and contact.phone_key=link_phone_key));
      if linked_id is null then raise exception 'business_record_conflict'; end if;
    end if;
    merged_values := jsonb_set(merged_values,array[link_field->>'id'],to_jsonb(linked_id::text));
  end loop;
  perform public.validate_application_record(spec, target.record_id, merged_values);

  next_revision := target.record_revision + 1;
  history := coalesce(target.edit_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'revision', next_revision,
    'actorId', p_user_id::text,
    'at', clock_timestamp(),
    'previousValues', target.values,
    'values', merged_values
  ));
  update public.application_records as record_row
  set values = merged_values, record_revision = next_revision,
      edit_history = history, updated_at = clock_timestamp()
  where record_row.work_id = p_work_id and record_row.record_id = target.record_id;

  select coalesce(jsonb_agg(
    case when item.value->>'id' = target.record_id
      then jsonb_build_object('id', target.record_id, 'values', merged_values)
      else item.value end order by item.ordinality
  ), '[]'::jsonb) into compatibility_records
  from jsonb_array_elements(coalesce(app.payload->'records', '[]'::jsonb)) with ordinality as item(value, ordinality);
  perform public.application_touch_compatibility(p_work_id, p_user_id, 'edit_record', jsonb_build_object(
    'recordsRevision', state.records_revision,
    'records', compatibility_records
  ));

  insert into public.application_use_edits (
    grant_id, work_id, actor_id, idempotency_key, input_digest, record_id,
    release_version, expected_record_revision, new_record_revision
  ) values (
    access.id, p_work_id, p_user_id, p_idempotency_key, input_digest, target.record_id,
    p_release_version, p_expected_record_revision, next_revision
  );
  return query select * from public.read_application_use_v2(p_user_id, p_verified_email, p_work_id);
end;
$$;

revoke all on function public.edit_internal_tool_use_record(uuid, text, uuid, uuid, integer, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.edit_internal_tool_use_record(uuid, text, uuid, uuid, integer, integer, jsonb, text) to service_role;
