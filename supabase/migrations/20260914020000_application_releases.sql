-- Native application delivery keeps candidate definitions, released
-- definitions, and customer records on separate lifecycles. The existing
-- saved_product_work row remains the stable resource link and compatibility
-- projection; these tables are the application authority after this migration.

create table public.application_states (
  work_id uuid primary key references public.saved_product_work(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  candidate_design_revision integer not null default 0 check (candidate_design_revision >= 0),
  candidate_spec_version integer not null default 1 check (candidate_spec_version > 0),
  candidate_spec jsonb not null,
  candidate_rehearsal jsonb,
  current_release_version integer,
  records_revision integer not null default 0 check (records_revision >= 0),
  lifecycle_status text not null default 'draft' check (lifecycle_status in ('draft', 'installed', 'retired')),
  candidate_versions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (work_id, workspace_id),
  foreign key (work_id, workspace_id)
    references public.saved_product_work(id, workspace_id) on delete cascade
);

create table public.application_releases (
  work_id uuid not null,
  workspace_id uuid not null,
  version integer not null check (version > 0),
  spec jsonb not null,
  published_by uuid references public.users(id) on delete restrict,
  published_at timestamptz default now(),
  publication_source text not null default 'published'
    check (publication_source in ('published', 'legacy_migrated')),
  primary key (work_id, version),
  foreign key (work_id, workspace_id)
    references public.application_states(work_id, workspace_id) on delete cascade
);

create table public.application_records (
  work_id uuid not null,
  workspace_id uuid not null,
  record_id text not null check (char_length(btrim(record_id)) between 1 and 100),
  values jsonb not null,
  created_by uuid references public.users(id) on delete restrict,
  record_source text not null default 'submitted'
    check (record_source in ('submitted', 'legacy_migrated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (work_id, record_id),
  foreign key (work_id, workspace_id)
    references public.application_states(work_id, workspace_id) on delete cascade
);

create index application_states_workspace_idx
  on public.application_states(workspace_id, updated_at desc);
create index application_releases_workspace_idx
  on public.application_releases(workspace_id, work_id, version desc);
create index application_records_workspace_idx
  on public.application_records(workspace_id, work_id, created_at desc);

alter table public.application_states enable row level security;
alter table public.application_releases enable row level security;
alter table public.application_records enable row level security;
revoke all on public.application_states, public.application_releases, public.application_records from public, anon, authenticated, service_role;
-- The service client may read the canonical projection, but every mutation
-- goes through a security-definer function so callers cannot bypass clocks or
-- role checks with a direct table write.
grant select on public.application_states, public.application_releases, public.application_records to service_role;

create or replace function public.validate_application_spec(p_spec jsonb)
returns void language plpgsql immutable set search_path = public, pg_temp as $$
declare
  field jsonb;
  component jsonb;
  reference jsonb;
  field_id text;
  field_ids text[] := array[]::text[];
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
      or exists (select 1 from jsonb_object_keys(field) as key where key not in ('id', 'label', 'type', 'required'))
      or jsonb_typeof(field->'id') is distinct from 'string'
      or (field->>'id') !~ '^[a-z][a-z0-9_]{0,39}$'
      or field->>'id' in ('constructor', 'prototype')
      or jsonb_typeof(field->'label') is distinct from 'string'
      or char_length(btrim(field->>'label')) not between 1 and 80
      or (field->>'type') not in ('text', 'number', 'boolean')
      or jsonb_typeof(field->'required') is distinct from 'boolean' then
      raise exception 'application_schema_invalid';
    end if;
    field_id := field->>'id';
    if field_id = any(field_ids) then raise exception 'application_schema_invalid'; end if;
    field_ids := array_append(field_ids, field_id);
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
      or (field_required and jsonb_typeof(value) = 'string' and value #>> '{}' = '') then
      raise exception 'application_record_invalid';
    end if;
  end loop;
end;
$$;

create or replace function public.application_assert_identity(
  p_workspace_id uuid, p_work_id uuid, p_user_id uuid, p_verified_email text,
  p_manager boolean default false
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (
    select 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
    for share
  ) then raise exception 'application_access_denied'; end if;
  if not exists (
    select 1 from public.saved_product_work
    where id = p_work_id and workspace_id = p_workspace_id and product_id = 'applications'
  ) then raise exception 'application_access_denied'; end if;
  if p_manager and not exists (
    select 1 from public.workspace_memberships
    where workspace_id = p_workspace_id and user_id = p_user_id and role in ('owner', 'admin')
    for share
  ) then raise exception 'application_design_access_denied'; end if;
  if not p_manager and not exists (
    select 1 from public.workspace_memberships
    where workspace_id = p_workspace_id and user_id = p_user_id
    for share
  ) then raise exception 'application_access_denied'; end if;
end;
$$;

-- Every application mutation takes the work row lock before checking the
-- actor. Membership/grant changes can use the same order, preventing a submit
-- from racing a revocation or role change.
create or replace function public.application_lock_work(
  p_workspace_id uuid, p_work_id uuid
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.saved_product_work
  where id = p_work_id and workspace_id = p_workspace_id and product_id = 'applications'
  for update;
  if not found then raise exception 'application_access_denied'; end if;
end;
$$;

create or replace function public.application_lock(p_work_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('application:' || p_work_id::text, 20260914));
end;
$$;

-- Canonical runtime projection. It never reads saved_product_work.payload, so
-- candidate edits and compatibility writes cannot change what a released app
-- serves. The work share lock coordinates this read with every writer.
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
    'createdBy', item.created_by
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

create or replace function public.application_touch_compatibility(
  p_work_id uuid, p_user_id uuid, p_kind text, p_patch jsonb
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  row public.saved_product_work%rowtype;
  next_payload jsonb;
  next_revision integer;
  history jsonb;
begin
  select * into row from public.saved_product_work where id = p_work_id for update;
  if not found then raise exception 'application_access_denied'; end if;
  next_revision := coalesce((row.payload->>'revision')::integer, 0) + 1;
  history := coalesce(row.payload->'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'revision', next_revision, 'kind', p_kind, 'actorId', p_user_id::text, 'at', clock_timestamp()
  ));
  if jsonb_array_length(history) > 500 then
    select coalesce(jsonb_agg(value order by ordinal), '[]'::jsonb) into history
      from jsonb_array_elements(history) with ordinality as item(value, ordinal)
      where ordinal > jsonb_array_length(history) - 500;
  end if;
  next_payload := coalesce(row.payload, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb);
  next_payload := jsonb_set(next_payload, '{revision}', to_jsonb(next_revision), true);
  next_payload := jsonb_set(next_payload, '{history}', history, true);
  update public.saved_product_work
    set payload = next_payload, title = nullif(next_payload->>'title', ''), updated_at = clock_timestamp()
    where id = p_work_id;
end;
$$;

-- Create the durable state for new rows and for rows created by the earlier
-- handoff/plan-output paths. Invalid arbitrary-code payloads are rejected here.
create or replace function public.initialize_application_state()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  candidate_revision integer;
  candidate_version integer;
  release_version integer;
begin
  if new.product_id <> 'applications' then return new; end if;
  if new.payload->>'status' = 'installed' then
    raise exception 'application_release_publication_required';
  end if;
  perform public.validate_application_spec(new.payload->'spec');
  candidate_revision := coalesce((new.payload->>'designRevision')::integer, (new.payload->>'revision')::integer, 0);
  candidate_version := coalesce((new.payload->>'specVersion')::integer, 1);
  insert into public.application_states (
    work_id, workspace_id, candidate_design_revision, candidate_spec_version,
    candidate_spec, candidate_rehearsal, records_revision, lifecycle_status,
    candidate_versions
  ) values (
    new.id, new.workspace_id, candidate_revision, candidate_version,
    new.payload->'spec', nullif(new.payload->'rehearsal', 'null'::jsonb),
    coalesce((new.payload->>'recordsRevision')::integer, jsonb_array_length(coalesce(new.payload->'records', '[]'::jsonb))),
    coalesce(new.payload->>'status', 'draft'), coalesce(new.payload->'versions', jsonb_build_array(jsonb_build_object('version', candidate_version, 'spec', new.payload->'spec')))
  ) on conflict (work_id) do nothing;

  if coalesce(new.payload->>'status', 'draft') = 'installed' then
    release_version := coalesce((new.payload->'release'->>'version')::integer, candidate_version);
    insert into public.application_releases(work_id, workspace_id, version, spec, published_by, published_at)
      values (new.id, new.workspace_id, release_version, coalesce(new.payload->'release'->'spec', new.payload->'spec'), new.created_by, coalesce((new.payload->'release'->>'publishedAt')::timestamptz, new.created_at))
      on conflict (work_id, version) do nothing;
    update public.application_states set current_release_version = release_version, lifecycle_status = 'installed' where work_id = new.id;
  end if;
  return new;
end;
$$;

create trigger application_state_after_insert
  after insert on public.saved_product_work
  for each row execute function public.initialize_application_state();

insert into public.application_states (
  work_id, workspace_id, candidate_design_revision, candidate_spec_version,
  candidate_spec, candidate_rehearsal, records_revision, lifecycle_status,
  candidate_versions, created_at, updated_at
)
select
  work.id,
  work.workspace_id,
  coalesce((work.payload->>'designRevision')::integer, (work.payload->>'revision')::integer, 0),
  coalesce((work.payload->>'specVersion')::integer, 1),
  work.payload->'spec',
  nullif(work.payload->'rehearsal', 'null'::jsonb),
  coalesce((work.payload->>'recordsRevision')::integer, jsonb_array_length(coalesce(work.payload->'records', '[]'::jsonb))),
  coalesce(work.payload->>'status', 'draft'),
  coalesce(work.payload->'versions', jsonb_build_array(jsonb_build_object('version', coalesce((work.payload->>'specVersion')::integer, 1), 'spec', work.payload->'spec'))),
  work.created_at,
  work.updated_at
from public.saved_product_work as work
where work.product_id = 'applications'
  and jsonb_typeof(work.payload->'spec') = 'object'
on conflict (work_id) do nothing;

-- Preserve every release already present in the compatibility projection, but
-- mark the publication evidence unknown. This migration cannot infer an
-- approval event from created_at or created_by.
insert into public.application_releases(work_id, workspace_id, version, spec, published_by, published_at, publication_source)
select
  work.id,
  work.workspace_id,
  (item.value->>'version')::integer,
  item.value->'spec',
  null,
  null,
  'legacy_migrated'
from public.saved_product_work as work
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(work.payload->'releases') = 'array'
    then work.payload->'releases' else '[]'::jsonb end
) as item(value)
where work.product_id = 'applications'
  and work.payload->>'status' = 'installed'
  and jsonb_typeof(work.payload->'releases') = 'array'
on conflict (work_id, version) do nothing;

insert into public.application_releases(work_id, workspace_id, version, spec, published_by, published_at, publication_source)
select
  work.id,
  work.workspace_id,
  coalesce((work.payload->'release'->>'version')::integer, (work.payload->>'specVersion')::integer, 1),
  coalesce(work.payload->'release'->'spec', work.payload->'spec'),
  null,
  null,
  'legacy_migrated'
from public.saved_product_work as work
where work.product_id = 'applications'
  and work.payload->>'status' = 'installed'
  and jsonb_typeof(work.payload->'spec') = 'object'
  and not exists (select 1 from public.application_releases release where release.work_id = work.id)
on conflict (work_id, version) do nothing;

update public.application_states as state set current_release_version = coalesce(
  (select (work.payload->'release'->>'version')::integer from public.saved_product_work work where work.id = state.work_id),
  (select max(release.version) from public.application_releases release where release.work_id = state.work_id)
)
where state.lifecycle_status = 'installed' and state.current_release_version is null;

-- Import existing records into the canonical table before any runtime reader
-- can switch away from payload. Missing ownership is explicit: legacy rows do
-- not claim that the original payload author submitted every record.
do $$
declare
  work_row record;
  item jsonb;
  release_spec jsonb;
begin
  for work_row in
    select work.id, work.workspace_id, work.created_at, work.payload,
      state.current_release_version
    from public.saved_product_work work
    join public.application_states state on state.work_id = work.id
    where work.product_id = 'applications'
  loop
    if jsonb_typeof(work_row.payload->'records') is distinct from 'array' then
      raise exception 'application_record_import_invalid';
    end if;
    if jsonb_array_length(work_row.payload->'records') > 1000 then
      raise exception 'application_record_limit_reached';
    end if;
    select release.spec into release_spec
    from public.application_releases release
    where release.work_id = work_row.id
      and release.version = work_row.current_release_version;
    if release_spec is null then release_spec := work_row.payload->'spec'; end if;
    for item in select value from jsonb_array_elements(work_row.payload->'records') as row(value) loop
      perform public.validate_application_record(release_spec, item->>'id', item->'values');
      insert into public.application_records(
        work_id, workspace_id, record_id, values, created_by, created_at, updated_at, record_source
      ) values (
        work_row.id, work_row.workspace_id, btrim(item->>'id'), item->'values', null,
        work_row.created_at, work_row.created_at, 'legacy_migrated'
      );
    end loop;
  end loop;
end;
$$;

-- A release candidate mutation changes only the candidate clock and leaves the
-- active release and records untouched.
create or replace function public.update_application_candidate(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_design_revision integer, p_spec jsonb
) returns setof public.application_states
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  state public.application_states%rowtype;
  next_version integer;
  patch jsonb;
begin
  perform public.application_lock_work(p_workspace_id, p_work_id);
  perform public.application_assert_identity(p_workspace_id, p_work_id, p_user_id, p_verified_email, true);
  perform public.application_lock(p_work_id);
  select * into state from public.application_states where work_id = p_work_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'application_state_unavailable'; end if;
  if p_expected_design_revision is null or state.candidate_design_revision <> p_expected_design_revision then raise exception 'application_design_revision_conflict'; end if;
  perform public.validate_application_spec(p_spec);
  if p_spec->>'maintenanceOwner' is distinct from state.candidate_spec->>'maintenanceOwner' then raise exception 'application_design_access_denied'; end if;
  if jsonb_array_length(coalesce(state.candidate_versions, '[]'::jsonb)) >= 100 then
    raise exception 'application_candidate_history_limit_reached';
  end if;
  next_version := state.candidate_spec_version + 1;
  update public.application_states set
    candidate_design_revision = state.candidate_design_revision + 1,
    candidate_spec_version = next_version,
    candidate_spec = p_spec,
    candidate_rehearsal = null,
    lifecycle_status = case when current_release_version is null then 'draft' else 'draft' end,
    candidate_versions = coalesce(state.candidate_versions, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('version', next_version, 'spec', p_spec)),
    updated_at = clock_timestamp()
  where work_id = p_work_id;
  patch := jsonb_build_object(
    'spec', p_spec,
    'specVersion', next_version,
    'status', 'draft',
    'rehearsal', null,
    'designRevision', state.candidate_design_revision + 1,
    'candidate', jsonb_build_object('designRevision', state.candidate_design_revision + 1, 'specVersion', next_version, 'spec', p_spec, 'rehearsal', null)
  );
  perform public.application_touch_compatibility(p_work_id, p_user_id, 'revise_candidate', patch);
  return query select * from public.application_states where work_id = p_work_id;
end;
$$;

create or replace function public.rehearse_application_candidate(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_design_revision integer
) returns setof public.application_states
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  state public.application_states%rowtype;
  record_row public.application_records%rowtype;
  checks jsonb;
  records_fit boolean := true;
begin
  perform public.application_lock_work(p_workspace_id, p_work_id);
  perform public.application_assert_identity(p_workspace_id, p_work_id, p_user_id, p_verified_email, true);
  perform public.application_lock(p_work_id);
  select * into state from public.application_states where work_id = p_work_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'application_state_unavailable'; end if;
  if state.candidate_design_revision <> p_expected_design_revision then raise exception 'application_design_revision_conflict'; end if;
  for record_row in select * from public.application_records where work_id = p_work_id loop
    begin
      perform public.validate_application_record(state.candidate_spec, record_row.record_id, record_row.values);
    exception when others then
      records_fit := false;
    end;
  end loop;
  checks := jsonb_build_array(
    jsonb_build_object('name', 'Declared fields and approved components', 'passed', true),
    jsonb_build_object('name', 'Executable code rejected', 'passed', true),
    jsonb_build_object('name', 'Existing records fit this version', 'passed', records_fit)
  );
  update public.application_states set candidate_rehearsal = jsonb_build_object('specVersion', state.candidate_spec_version, 'checks', checks), updated_at = clock_timestamp() where work_id = p_work_id;
  perform public.application_touch_compatibility(p_work_id, p_user_id, 'rehearse_candidate', jsonb_build_object(
    'rehearsal', jsonb_build_object('specVersion', state.candidate_spec_version, 'checks', checks),
    'candidate', jsonb_build_object('designRevision', state.candidate_design_revision, 'specVersion', state.candidate_spec_version, 'spec', state.candidate_spec, 'rehearsal', jsonb_build_object('specVersion', state.candidate_spec_version, 'checks', checks))
  ));
  return query select * from public.application_states where work_id = p_work_id;
end;
$$;

create or replace function public.publish_application_candidate(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_candidate_revision integer, p_expected_release_version integer
) returns setof public.application_states
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  state public.application_states%rowtype;
  record_row public.application_records%rowtype;
  next_version integer;
  release_row public.application_releases%rowtype;
begin
  perform public.application_lock_work(p_workspace_id, p_work_id);
  perform public.application_assert_identity(p_workspace_id, p_work_id, p_user_id, p_verified_email, true);
  perform public.application_lock(p_work_id);
  select * into state from public.application_states where work_id = p_work_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'application_state_unavailable'; end if;
  if state.candidate_design_revision <> p_expected_candidate_revision then raise exception 'application_design_revision_conflict'; end if;
  if state.current_release_version is distinct from nullif(p_expected_release_version, 0) then raise exception 'application_release_conflict'; end if;
  if state.candidate_rehearsal is null or state.candidate_rehearsal->>'specVersion' is distinct from state.candidate_spec_version::text
    or exists (select 1 from jsonb_array_elements(state.candidate_rehearsal->'checks') as item(value) where coalesce((value->>'passed')::boolean, false) is false) then
    raise exception 'application_rehearsal_required';
  end if;
  if (select count(*) from public.application_releases where work_id = p_work_id) >= 100 then
    raise exception 'application_release_history_limit_reached';
  end if;
  -- This is the publication check, against records committed after rehearsal.
  for record_row in select * from public.application_records where work_id = p_work_id loop
    perform public.validate_application_record(state.candidate_spec, record_row.record_id, record_row.values);
  end loop;
  select coalesce(max(version), 0) + 1 into next_version from public.application_releases where work_id = p_work_id;
  insert into public.application_releases(work_id, workspace_id, version, spec, published_by)
    values (p_work_id, p_workspace_id, next_version, state.candidate_spec, p_user_id)
    returning * into release_row;
  update public.application_states set current_release_version = next_version, lifecycle_status = 'installed', updated_at = clock_timestamp() where work_id = p_work_id;
  perform public.application_touch_compatibility(p_work_id, p_user_id, 'publish_candidate', jsonb_build_object(
    'status', 'installed',
    'release', jsonb_build_object('version', release_row.version, 'spec', release_row.spec, 'publishedAt', release_row.published_at, 'publishedBy', release_row.published_by, 'provenance', release_row.publication_source),
    'releases', coalesce((select payload->'releases' from public.saved_product_work where id = p_work_id), '[]'::jsonb) || jsonb_build_array(jsonb_build_object('version', release_row.version, 'spec', release_row.spec, 'publishedAt', release_row.published_at, 'publishedBy', release_row.published_by, 'provenance', release_row.publication_source))
  ));
  return query select * from public.application_states where work_id = p_work_id;
end;
$$;

create or replace function public.rollback_application_release(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_design_revision integer, p_expected_release_version integer,
  p_target_release_version integer
) returns setof public.application_states
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  state public.application_states%rowtype;
  target public.application_releases%rowtype;
  record_row public.application_records%rowtype;
  next_spec_version integer;
begin
  perform public.application_lock_work(p_workspace_id, p_work_id);
  perform public.application_assert_identity(p_workspace_id, p_work_id, p_user_id, p_verified_email, true);
  perform public.application_lock(p_work_id);
  select * into state from public.application_states where work_id = p_work_id and workspace_id = p_workspace_id for update;
  if not found then raise exception 'application_state_unavailable'; end if;
  if state.candidate_design_revision <> p_expected_design_revision then raise exception 'application_design_revision_conflict'; end if;
  if state.current_release_version is distinct from nullif(p_expected_release_version, 0) then raise exception 'application_release_conflict'; end if;
  select * into target from public.application_releases where work_id = p_work_id and version = p_target_release_version;
  if not found then raise exception 'application_version_unavailable'; end if;
  for record_row in select * from public.application_records where work_id = p_work_id loop
    perform public.validate_application_record(target.spec, record_row.record_id, record_row.values);
  end loop;
  if jsonb_array_length(coalesce(state.candidate_versions, '[]'::jsonb)) >= 100 then
    raise exception 'application_candidate_history_limit_reached';
  end if;
  next_spec_version := state.candidate_spec_version + 1;
  update public.application_states set
    current_release_version = target.version,
    candidate_design_revision = state.candidate_design_revision + 1,
    candidate_spec_version = next_spec_version,
    candidate_spec = target.spec,
    candidate_rehearsal = null,
    lifecycle_status = 'installed',
    candidate_versions = coalesce(state.candidate_versions, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('version', next_spec_version, 'spec', target.spec)),
    updated_at = clock_timestamp()
  where work_id = p_work_id;
  perform public.application_touch_compatibility(p_work_id, p_user_id, 'rollback_release', jsonb_build_object(
    'status', 'installed', 'spec', target.spec, 'specVersion', next_spec_version, 'designRevision', state.candidate_design_revision + 1,
    'rehearsal', null,
    'release', jsonb_build_object('version', target.version, 'spec', target.spec, 'publishedAt', target.published_at, 'publishedBy', target.published_by, 'provenance', target.publication_source),
    'candidate', jsonb_build_object('designRevision', state.candidate_design_revision + 1, 'specVersion', next_spec_version, 'spec', target.spec, 'rehearsal', null)
  ));
  return query select * from public.application_states where work_id = p_work_id;
end;
$$;

create or replace function public.retire_application(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_design_revision integer
) returns setof public.application_states
language plpgsql security definer set search_path = public, pg_temp as $$
declare state public.application_states%rowtype;
begin
  perform public.application_lock_work(p_workspace_id, p_work_id);
  perform public.application_assert_identity(p_workspace_id, p_work_id, p_user_id, p_verified_email, true);
  perform public.application_lock(p_work_id);
  select * into state from public.application_states where work_id = p_work_id and workspace_id = p_workspace_id for update;
  if not found or state.candidate_design_revision <> p_expected_design_revision then raise exception 'application_design_revision_conflict'; end if;
  update public.application_states set lifecycle_status = 'retired', updated_at = clock_timestamp() where work_id = p_work_id;
  perform public.application_touch_compatibility(p_work_id, p_user_id, 'retire', jsonb_build_object('status', 'retired'));
  return query select * from public.application_states where work_id = p_work_id;
end;
$$;

-- Internal append primitive. It intentionally performs no membership or grant
-- lookup; a native or grant wrapper must establish that authority before
-- calling it. The records clock is optional for grant submissions because the
-- work/state lock serializes those calls and the grant API has no stale clock.
create or replace function public.submit_application_record_internal(
  p_work_id uuid, p_expected_release_version integer,
  p_expected_records_revision integer, p_record_id text, p_values jsonb,
  p_actor_id uuid
) returns setof public.application_records
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  app public.saved_product_work%rowtype;
  state public.application_states%rowtype;
  record_row public.application_records%rowtype;
  release_spec jsonb;
begin
  if p_actor_id is null or p_expected_release_version is null then
    raise exception 'application_access_denied';
  end if;
  select * into app from public.saved_product_work
  where id = p_work_id and product_id = 'applications' and resource_kind = 'application'
  for update;
  if not found then raise exception 'application_access_denied'; end if;
  perform public.application_lock(p_work_id);
  select * into state from public.application_states
  where work_id = p_work_id and workspace_id = app.workspace_id for update;
  if not found then raise exception 'application_access_denied'; end if;
  if state.lifecycle_status = 'retired' or state.current_release_version is null then raise exception 'application_release_conflict'; end if;
  if state.current_release_version is distinct from p_expected_release_version then raise exception 'application_release_conflict'; end if;
  if p_expected_records_revision is not null and state.records_revision <> p_expected_records_revision then raise exception 'application_records_revision_conflict'; end if;
  select spec into release_spec from public.application_releases where work_id = p_work_id and version = state.current_release_version;
  if release_spec is null then raise exception 'application_release_conflict'; end if;
  perform public.validate_application_record(release_spec, p_record_id, p_values);
  if exists (select 1 from public.application_records where work_id = p_work_id and record_id = btrim(p_record_id)) then raise exception 'application_record_duplicate'; end if;
  if (select count(*) from public.application_records where work_id = p_work_id) >= 1000 then
    raise exception 'application_record_limit_reached';
  end if;
  insert into public.application_records(work_id, workspace_id, record_id, values, created_by)
    values (p_work_id, app.workspace_id, btrim(p_record_id), p_values, p_actor_id)
    returning * into record_row;
  update public.application_states set records_revision = records_revision + 1, updated_at = clock_timestamp() where work_id = p_work_id;
  perform public.application_touch_compatibility(p_work_id, p_actor_id, 'submit_record', jsonb_build_object(
    'recordsRevision', coalesce(p_expected_records_revision + 1, (select records_revision from public.application_states where work_id = p_work_id)),
    'records', coalesce((select payload->'records' from public.saved_product_work where id = p_work_id), '[]'::jsonb) || jsonb_build_array(jsonb_build_object('id', record_row.record_id, 'values', record_row.values))
  ));
  return next record_row;
end;
$$;

-- Service wrapper: authenticated members can use an application through the
-- native service. Resource-specific grant wrappers may call the internal
-- primitive directly after checking their grant in the same transaction.
create or replace function public.submit_application_record(
  p_work_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_release_version integer, p_expected_records_revision integer,
  p_record_id text, p_values jsonb
) returns setof public.application_records
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.application_lock_work(p_workspace_id, p_work_id);
  perform public.application_assert_identity(p_workspace_id, p_work_id, p_user_id, p_verified_email, false);
  return query select * from public.submit_application_record_internal(
    p_work_id, p_expected_release_version, p_expected_records_revision,
    p_record_id, p_values, p_user_id
  );
end;
$$;

revoke all on function public.validate_application_spec(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.validate_application_record(jsonb, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.application_assert_identity(uuid, uuid, uuid, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.application_lock_work(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.application_lock(uuid) from public, anon, authenticated, service_role;
revoke all on function public.application_runtime_snapshot(uuid) from public, anon, authenticated, service_role;
revoke all on function public.application_touch_compatibility(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.initialize_application_state() from public, anon, authenticated, service_role;
revoke all on function public.update_application_candidate(uuid, uuid, uuid, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.rehearse_application_candidate(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.publish_application_candidate(uuid, uuid, uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.rollback_application_release(uuid, uuid, uuid, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.retire_application(uuid, uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.submit_application_record_internal(uuid, integer, integer, text, jsonb, uuid) from public, anon, authenticated, service_role;
revoke all on function public.submit_application_record(uuid, uuid, uuid, text, integer, integer, text, jsonb) from public, anon, authenticated;

grant execute on function public.update_application_candidate(uuid, uuid, uuid, text, integer, jsonb) to service_role;
grant execute on function public.rehearse_application_candidate(uuid, uuid, uuid, text, integer) to service_role;
grant execute on function public.publish_application_candidate(uuid, uuid, uuid, text, integer, integer) to service_role;
grant execute on function public.rollback_application_release(uuid, uuid, uuid, text, integer, integer, integer) to service_role;
grant execute on function public.retire_application(uuid, uuid, uuid, text, integer) to service_role;
grant execute on function public.submit_application_record(uuid, uuid, uuid, text, integer, integer, text, jsonb) to service_role;
