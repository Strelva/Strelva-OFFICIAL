-- Recipient corrections are scoped by grant and serialized with the existing
-- application work lock. A record keeps its own optimistic revision and an
-- append-only correction history; retries are receipts, never blind writes.

alter table public.application_records
  add column if not exists record_revision integer not null default 1,
  add column if not exists edit_history jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.application_records'::regclass
      and conname = 'application_records_revision_check'
  ) then
    alter table public.application_records
      add constraint application_records_revision_check check (record_revision > 0);
  end if;
end;
$$;

alter table public.application_use_grants
  add column if not exists record_edit_scope text not null default 'none';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.application_use_grants'::regclass
      and conname = 'application_use_grants_record_edit_scope_check'
  ) then
    alter table public.application_use_grants
      add constraint application_use_grants_record_edit_scope_check
      check (record_edit_scope in ('none', 'own', 'all'));
  end if;
end;
$$;

create table public.application_use_edits (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references public.application_use_grants(id) on delete restrict,
  work_id uuid not null references public.saved_product_work(id) on delete cascade,
  actor_id uuid not null references public.users(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 120),
  input_digest text not null check (input_digest ~ '^[a-f0-9]{32}$'),
  record_id text not null check (char_length(btrim(record_id)) between 1 and 100),
  release_version integer not null check (release_version > 0),
  expected_record_revision integer not null check (expected_record_revision > 0),
  new_record_revision integer not null check (new_record_revision > 0),
  created_at timestamptz not null default now(),
  unique (grant_id, idempotency_key)
);

create index application_use_edits_work_idx
  on public.application_use_edits (work_id, created_at desc);

alter table public.application_use_edits enable row level security;
revoke all on table public.application_use_edits from public, anon, authenticated, service_role;

-- The durable runtime projection now carries the record clock needed by a
-- recipient editor. History stays server-side and is never exposed to a link.
create or replace function public.application_runtime_snapshot(p_work_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  app public.saved_product_work%rowtype;
  state public.application_states%rowtype;
  release public.application_releases%rowtype;
  records jsonb;
begin
  select * into app from public.saved_product_work
  where id = p_work_id and product_id = 'applications' and resource_kind = 'application'
  for share;
  if not found then raise exception 'application_access_denied'; end if;
  select * into state from public.application_states
  where work_id = p_work_id and workspace_id = app.workspace_id
  for share;
  if not found or state.lifecycle_status = 'retired' or state.current_release_version is null then
    raise exception 'application_release_unavailable';
  end if;
  select * into release from public.application_releases
  where work_id = p_work_id and version = state.current_release_version;
  if not found then raise exception 'application_release_unavailable'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', item.record_id,
    'values', item.values,
    'createdBy', item.created_by,
    'revision', item.record_revision
  ) order by item.created_at, item.record_id), '[]'::jsonb)
    into records
    from public.application_records item
    where item.work_id = p_work_id;
  return jsonb_build_object(
    'work_id', app.id,
    'workspace_id', app.workspace_id,
    'title', release.spec->>'title',
    'release_version', release.version,
    'released_spec', release.spec,
    'published_at', release.published_at,
    'published_by', release.published_by,
    'provenance', release.publication_source,
    'records_revision', state.records_revision,
    'records', records
  );
end;
$$;

-- Keep the original read RPC compatible for existing clients. The v2
-- projection adds the edit scope beside the same filtered records.
create or replace function public.read_application_use_v2(
  p_user_id uuid,
  p_verified_email text,
  p_work_id uuid
) returns table (
  work_id uuid,
  workspace_id uuid,
  title text,
  release_version integer,
  released_spec jsonb,
  records jsonb,
  id uuid,
  recipient_email text,
  views text[],
  record_read_scope text,
  record_edit_scope text,
  record_submit boolean,
  purpose text,
  expires_at timestamptz,
  status text,
  granted_by uuid,
  created_at timestamptz,
  revoked_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  select base.work_id,
    base.workspace_id,
    base.title,
    base.release_version,
    base.released_spec,
    coalesce((
      select jsonb_agg(
        item.value || case
          when source.value ? 'revision' then jsonb_build_object('revision', source.value->'revision')
          else '{}'::jsonb
        end order by item.ordinality
      )
      from jsonb_array_elements(coalesce(base.records, '[]'::jsonb)) with ordinality as item(value, ordinality)
      left join lateral (
        select value
        from jsonb_array_elements(coalesce(runtime.snapshot->'records', '[]'::jsonb)) as source(value)
        where source.value->>'id' = item.value->>'id'
        limit 1
      ) as source on true
    ), '[]'::jsonb),
    base.id,
    base.recipient_email,
    base.views,
    base.record_read_scope,
    access.record_edit_scope,
    base.record_submit,
    base.purpose,
    base.expires_at,
    base.status,
    base.granted_by,
    base.created_at,
    base.revoked_at
  from public.read_application_use(p_user_id, p_verified_email, p_work_id) as base
  cross join lateral (select public.application_runtime_snapshot(base.work_id) as snapshot) as runtime
  join public.application_use_grants as access on access.id = base.id;
end;
$$;

-- Share the old grant behavior through an explicit edit-aware function. The
-- nine-argument RPC remains the compatibility path and always means no edits.
create or replace function public.application_issue_use_grant(
  p_user_id uuid,
  p_verified_email text,
  p_work_id uuid,
  p_recipient_email text,
  p_views text[],
  p_record_read_scope text,
  p_record_edit_scope text,
  p_record_submit boolean,
  p_purpose text,
  p_expires_at timestamptz
) returns setof public.application_use_grants
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  app public.saved_product_work%rowtype;
  state public.application_states%rowtype;
  snapshot jsonb;
  role text;
  recipient text := lower(btrim(p_recipient_email));
  created public.application_use_grants%rowtype;
begin
  if recipient is null
    or recipient !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(recipient) > 254
    or p_views is null or cardinality(p_views) not between 1 and 4
    or not (p_views <@ array['form', 'list', 'detail', 'document']::text[])
    or not public.application_use_distinct_views(p_views)
    or p_record_read_scope is null or p_record_read_scope not in ('none', 'own', 'all')
    or p_record_edit_scope is null or p_record_edit_scope not in ('none', 'own', 'all')
    or (p_record_edit_scope <> 'none' and p_record_read_scope = 'none')
    or (p_record_edit_scope <> 'none' and not ('form' = any(p_views)))
    or p_record_submit is null
    or (p_record_submit and not ('form' = any(p_views)))
    or p_purpose is null or char_length(btrim(p_purpose)) not between 1 and 500
    or p_expires_at is null or p_expires_at <= clock_timestamp()
    or p_expires_at > clock_timestamp() + interval '90 days' then
    raise exception 'application_use_invalid';
  end if;

  select work.* into app
  from public.saved_product_work as work
  where work.id = p_work_id and work.product_id = 'applications' and work.resource_kind = 'application'
  for update;
  if not found then raise exception 'application_use_denied'; end if;

  perform 1 from public.users as identity
  where identity.id = p_user_id
    and lower(identity.email) = lower(btrim(p_verified_email))
    and identity.verified_at is not null
  for share;
  if not found then raise exception 'verified_identity_required'; end if;

  select wm.role into role
  from public.workspace_memberships wm
  where wm.workspace_id = app.workspace_id and wm.user_id = p_user_id
  for share;
  if role is null or role not in ('owner', 'admin') then raise exception 'workspace_access_denied'; end if;

  if not exists (
    select 1 from public.users as recipient_user
    where lower(recipient_user.email) = recipient and recipient_user.verified_at is not null
  ) then raise exception 'application_use_recipient_unverified'; end if;

  select * into state from public.application_states
  where application_states.work_id = p_work_id and application_states.workspace_id = app.workspace_id
  for update;
  if not found then raise exception 'application_use_denied'; end if;
  begin snapshot := public.application_runtime_snapshot(p_work_id);
  exception when others then raise exception 'application_use_denied'; end;
  if snapshot is null or snapshot->>'work_id' is distinct from p_work_id::text
    or jsonb_typeof(snapshot->'released_spec') <> 'object'
    or snapshot->>'release_version' !~ '^[1-9][0-9]*$' then
    raise exception 'application_use_denied';
  end if;
  if (select count(*) from jsonb_array_elements(coalesce(snapshot->'released_spec'->'components', '[]'::jsonb)) as component(value) where component.value->>'kind' = 'form') > 1 then
    raise exception 'application_use_invalid';
  end if;
  if p_record_submit and (select count(*) from jsonb_array_elements(coalesce(snapshot->'released_spec'->'components', '[]'::jsonb)) as component(value) where component.value->>'kind' = 'form') <> 1 then
    raise exception 'application_use_invalid';
  end if;
  if p_record_edit_scope <> 'none' and (select count(*) from jsonb_array_elements(coalesce(snapshot->'released_spec'->'components', '[]'::jsonb)) as component(value) where component.value->>'kind' = 'form') <> 1 then
    raise exception 'application_use_invalid';
  end if;
  if (p_record_submit or p_record_edit_scope <> 'none') and exists (
    select 1 from jsonb_array_elements(coalesce(snapshot->'released_spec'->'fields', '[]'::jsonb)) as declared(value)
    where coalesce((declared.value->>'required')::boolean, false)
      and not exists (
        select 1 from jsonb_array_elements(coalesce(snapshot->'released_spec'->'components', '[]'::jsonb)) as component(value)
        cross join lateral jsonb_array_elements_text(coalesce(component.value->'fields', '[]'::jsonb)) as form_field(id)
        where component.value->>'kind' = 'form' and form_field.id = declared.value->>'id'
      )
  ) then raise exception 'application_use_invalid'; end if;

  update public.application_use_grants as expired_grant
  set status = 'revoked', revoked_by = p_user_id, revoked_at = clock_timestamp()
  where expired_grant.work_id = p_work_id and expired_grant.recipient_email = recipient
    and expired_grant.status = 'active' and expired_grant.expires_at <= clock_timestamp();
  if exists (
    select 1 from public.application_use_grants as active_grant
    where active_grant.work_id = p_work_id and active_grant.recipient_email = recipient and active_grant.status = 'active'
  ) then raise exception 'application_use_conflict'; end if;

  insert into public.application_use_grants (
    work_id, workspace_id, recipient_email, views, record_read_scope, record_edit_scope,
    record_submit, purpose, expires_at, granted_by
  ) values (
    p_work_id, app.workspace_id, recipient, p_views, p_record_read_scope, p_record_edit_scope,
    p_record_submit, btrim(p_purpose), p_expires_at, p_user_id
  ) returning * into created;
  return next created;
end;
$$;

create or replace function public.grant_application_use(
  p_user_id uuid, p_verified_email text, p_work_id uuid, p_recipient_email text,
  p_views text[], p_record_read_scope text, p_record_submit boolean,
  p_purpose text, p_expires_at timestamptz
) returns setof public.application_use_grants
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query select * from public.application_issue_use_grant(
    p_user_id, p_verified_email, p_work_id, p_recipient_email, p_views,
    p_record_read_scope, 'none', p_record_submit, p_purpose, p_expires_at
  );
end;
$$;

create or replace function public.grant_application_use_with_edit(
  p_user_id uuid, p_verified_email text, p_work_id uuid, p_recipient_email text,
  p_views text[], p_record_read_scope text, p_record_edit_scope text,
  p_record_submit boolean, p_purpose text, p_expires_at timestamptz
) returns setof public.application_use_grants
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query select * from public.application_issue_use_grant(
    p_user_id, p_verified_email, p_work_id, p_recipient_email, p_views,
    p_record_read_scope, p_record_edit_scope, p_record_submit, p_purpose, p_expires_at
  );
end;
$$;

-- Add the edit scope to the recipient projection without changing the old
-- read/submit RPC return types consumed by existing clients.
create or replace function public.submit_application_use_record_v2(
  p_user_id uuid, p_verified_email text, p_work_id uuid, p_grant_id uuid,
  p_release_version integer, p_record jsonb, p_idempotency_key text
) returns table (
  work_id uuid, workspace_id uuid, title text, release_version integer,
  released_spec jsonb, records jsonb, id uuid, recipient_email text,
  views text[], record_read_scope text, record_edit_scope text,
  record_submit boolean, purpose text, expires_at timestamptz, status text,
  granted_by uuid, created_at timestamptz, revoked_at timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.submit_application_use_record(
    p_user_id, p_verified_email, p_work_id, p_grant_id,
    p_release_version, p_record, p_idempotency_key
  );
  return query select * from public.read_application_use_v2(p_user_id, p_verified_email, p_work_id);
end;
$$;

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
  perform public.validate_application_record(spec, p_record->>'id', p_record->'values');

  select record_row.* into target from public.application_records as record_row
  where record_row.work_id = p_work_id and record_row.record_id = btrim(p_record->>'id')
  for update;
  if not found then raise exception 'application_use_denied'; end if;
  if access.record_edit_scope = 'own' and target.created_by is distinct from p_user_id then
    raise exception 'application_use_denied';
  end if;
  if target.record_revision <> p_expected_record_revision then raise exception 'application_record_revision_conflict'; end if;
  if jsonb_array_length(coalesce(target.edit_history, '[]'::jsonb)) >= 100 then raise exception 'application_edit_history_limit'; end if;

  next_revision := target.record_revision + 1;
  history := coalesce(target.edit_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'revision', next_revision,
    'actorId', p_user_id::text,
    'at', clock_timestamp(),
    'previousValues', target.values,
    'values', p_record->'values'
  ));
  update public.application_records as record_row
  set values = p_record->'values', record_revision = next_revision,
      edit_history = history, updated_at = clock_timestamp()
  where record_row.work_id = p_work_id and record_row.record_id = target.record_id;

  select coalesce(jsonb_agg(
    case when item.value->>'id' = target.record_id
      then jsonb_build_object('id', target.record_id, 'values', p_record->'values')
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

revoke all on function public.application_is_valid_date_only(text) from public, anon, authenticated, service_role;
revoke all on function public.application_runtime_snapshot(uuid) from public, anon, authenticated, service_role;
revoke all on function public.application_issue_use_grant(uuid, text, uuid, text, text[], text, text, boolean, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.read_application_use_v2(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.grant_application_use_with_edit(uuid, text, uuid, text, text[], text, text, boolean, text, timestamptz) from public, anon, authenticated;
revoke all on function public.submit_application_use_record_v2(uuid, text, uuid, uuid, integer, jsonb, text) from public, anon, authenticated;
revoke all on function public.edit_application_use_record(uuid, text, uuid, uuid, integer, integer, jsonb, text) from public, anon, authenticated;

grant execute on function public.read_application_use_v2(uuid, text, uuid) to service_role;
grant execute on function public.grant_application_use_with_edit(uuid, text, uuid, text, text[], text, text, boolean, text, timestamptz) to service_role;
grant execute on function public.submit_application_use_record_v2(uuid, text, uuid, uuid, integer, jsonb, text) to service_role;
grant execute on function public.edit_application_use_record(uuid, text, uuid, uuid, integer, integer, jsonb, text) to service_role;
