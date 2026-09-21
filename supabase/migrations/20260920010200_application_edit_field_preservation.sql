-- Preserve non-form values when a recipient corrects a released record.
-- This replaces the function additively; the applied edit migration stays immutable.

create or replace function public.edit_application_use_record(
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

revoke all on function public.edit_application_use_record(uuid, text, uuid, uuid, integer, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.edit_application_use_record(uuid, text, uuid, uuid, integer, integer, jsonb, text) to service_role;
