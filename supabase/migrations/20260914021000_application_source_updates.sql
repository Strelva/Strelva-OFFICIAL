-- Durable source reuse. A target installation can adopt the exact current
-- release from its source while preserving the target's records and local
-- edits. The target work lock is held for the whole operation so candidate
-- edits, submissions, publication, and source updates cannot observe a
-- partially merged definition.

-- Migration 200 ran before this corrective guard existed. Refuse to continue
-- if it ever produced an application state for a differently typed resource;
-- leaving that ambiguous row in place would let a later caller select it by
-- product id alone.
do $$
begin
  if exists (
    select 1
    from public.application_states as state
    join public.saved_product_work as work on work.id = state.work_id
    where work.product_id = 'applications'
      and work.resource_kind is distinct from 'application'
  ) then
    raise exception 'application_resource_kind_invalid';
  end if;
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
    where id = p_work_id
      and workspace_id = p_workspace_id
      and product_id = 'applications'
      and resource_kind = 'application'
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

create or replace function public.application_lock_work(
  p_workspace_id uuid, p_work_id uuid
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.saved_product_work
  where id = p_work_id
    and workspace_id = p_workspace_id
    and product_id = 'applications'
    and resource_kind = 'application'
  for update;
  if not found then raise exception 'application_access_denied'; end if;
end;
$$;

-- The insert trigger is the first durable boundary for a new saved work row.
-- Keep the resource kind check here even though the service checks it too.
create or replace function public.initialize_application_state()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  candidate_revision integer;
  candidate_version integer;
  release_version integer;
begin
  if new.product_id is distinct from 'applications' or new.resource_kind is distinct from 'application' then return new; end if;
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

create or replace function public.application_guard_release_history()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  release_count integer;
begin
  select count(*) into release_count
  from public.application_releases
  where work_id = new.work_id;
  if release_count >= 100 then
    raise exception 'application_release_history_limit_reached';
  end if;
  return new;
end;
$$;

drop trigger if exists application_release_history_guard on public.application_releases;
create trigger application_release_history_guard
  before insert on public.application_releases
  for each row execute function public.application_guard_release_history();

-- This function is reached through the trusted server adapter. It still
-- checks both workspaces and the live identity inside the transaction; the
-- service-role grant does not make the caller a manager by itself.
create or replace function public.adopt_application_source_update(
  p_work_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_expected_revision integer,
  p_source_work_id uuid,
  p_source_version integer
) returns setof public.application_states
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  target_work public.saved_product_work%rowtype;
  source_work public.saved_product_work%rowtype;
  target_state public.application_states%rowtype;
  source_state public.application_states%rowtype;
  source_release public.application_releases%rowtype;
  installation jsonb;
  base_spec jsonb;
  remote_spec jsonb;
  merged_spec jsonb;
  next_candidate_versions jsonb;
  next_design_revision integer;
  next_spec_version integer;
  record_row public.application_records%rowtype;
begin
  if p_source_work_id is null or p_source_version is null or p_source_version <= 0 then
    raise exception 'application_source_conflict';
  end if;

  -- All application mutations acquire the target saved-work lock before
  -- checking identity and then the canonical state lock.
  perform public.application_lock_work(p_workspace_id, p_work_id);
  perform public.application_assert_identity(
    p_workspace_id, p_work_id, p_user_id, p_verified_email, true
  );
  perform public.application_lock(p_work_id);

  select * into target_work
  from public.saved_product_work
  where id = p_work_id
    and workspace_id = p_workspace_id
    and product_id = 'applications'
    and resource_kind = 'application'
  for update;
  if not found then raise exception 'application_access_denied'; end if;

  select * into target_state
  from public.application_states
  where work_id = p_work_id and workspace_id = p_workspace_id
  for update;
  if not found then raise exception 'application_state_unavailable'; end if;
  if target_state.lifecycle_status = 'retired' then
    raise exception 'application_source_conflict';
  end if;
  if p_expected_revision is null
    or jsonb_typeof(target_work.payload->'revision') is distinct from 'number'
    or target_work.payload->>'revision' is distinct from p_expected_revision::text then
    raise exception 'application_revision_conflict';
  end if;

  installation := target_work.payload->'installation';
  if jsonb_typeof(installation) is distinct from 'object'
    or target_work.source_work_id is distinct from p_source_work_id
    or installation->>'sourceWorkId' is distinct from p_source_work_id::text
    or jsonb_typeof(installation->'sourceVersion') is distinct from 'number'
    or installation->>'sourceVersion' !~ '^[1-9][0-9]*$'
    or installation->>'sourceVersion' = p_source_version::text
    or jsonb_typeof(installation->'baseSpec') is distinct from 'object'
    or p_source_work_id = p_work_id then
    raise exception 'application_source_conflict';
  end if;

  -- A source release is read only after its saved-work row is share-locked.
  -- Publication takes that same row for update, so this binds one exact
  -- current source release and cannot race a source publication.
  select * into source_work
  from public.saved_product_work
  where id = p_source_work_id
    and product_id = 'applications'
    and resource_kind = 'application'
  for share;
  if not found then raise exception 'application_source_conflict'; end if;
  perform public.application_assert_identity(
    source_work.workspace_id, p_source_work_id, p_user_id, p_verified_email, false
  );
  select * into source_state
  from public.application_states
  where work_id = p_source_work_id and workspace_id = source_work.workspace_id
  for share;
  if not found
    or source_state.lifecycle_status = 'retired'
    or source_state.current_release_version is distinct from p_source_version then
    raise exception 'application_source_conflict';
  end if;
  select * into source_release
  from public.application_releases
  where work_id = p_source_work_id
    and workspace_id = source_work.workspace_id
    and version = p_source_version
  for share;
  if not found then raise exception 'application_source_conflict'; end if;

  perform public.validate_application_spec(target_state.candidate_spec);
  base_spec := installation->'baseSpec';
  perform public.validate_application_spec(base_spec);
  perform public.validate_application_spec(source_release.spec);
  remote_spec := jsonb_set(
    source_release.spec,
    '{maintenanceOwner}',
    to_jsonb(target_state.candidate_spec->>'maintenanceOwner'),
    true
  );
  perform public.validate_application_spec(remote_spec);

  -- Merge title, fields, and components independently. If both businesses
  -- changed the same part since the last adoption, the target owner resolves
  -- it explicitly instead of losing either edit.
  if target_state.candidate_spec->'title' is distinct from base_spec->'title'
    and remote_spec->'title' is distinct from base_spec->'title'
    and target_state.candidate_spec->'title' is distinct from remote_spec->'title' then
    raise exception 'application_source_conflict';
  end if;
  if target_state.candidate_spec->'fields' is distinct from base_spec->'fields'
    and remote_spec->'fields' is distinct from base_spec->'fields'
    and target_state.candidate_spec->'fields' is distinct from remote_spec->'fields' then
    raise exception 'application_source_conflict';
  end if;
  if target_state.candidate_spec->'components' is distinct from base_spec->'components'
    and remote_spec->'components' is distinct from base_spec->'components'
    and target_state.candidate_spec->'components' is distinct from remote_spec->'components' then
    raise exception 'application_source_conflict';
  end if;

  merged_spec := jsonb_build_object(
    'title', case
      when target_state.candidate_spec->'title' is distinct from base_spec->'title'
        then target_state.candidate_spec->'title'
      else remote_spec->'title'
    end,
    'maintenanceOwner', target_state.candidate_spec->'maintenanceOwner',
    'fields', case
      when target_state.candidate_spec->'fields' is distinct from base_spec->'fields'
        then target_state.candidate_spec->'fields'
      else remote_spec->'fields'
    end,
    'components', case
      when target_state.candidate_spec->'components' is distinct from base_spec->'components'
        then target_state.candidate_spec->'components'
      else remote_spec->'components'
    end
  );
  perform public.validate_application_spec(merged_spec);

  -- A source update changes the candidate definition only. Existing records
  -- must still fit before the candidate is advanced, and remain untouched.
  for record_row in
    select * from public.application_records
    where work_id = p_work_id and workspace_id = p_workspace_id
  loop
    perform public.validate_application_record(
      merged_spec, record_row.record_id, record_row.values
    );
  end loop;

  if jsonb_typeof(coalesce(target_state.candidate_versions, '[]'::jsonb)) is distinct from 'array'
    or jsonb_array_length(coalesce(target_state.candidate_versions, '[]'::jsonb)) >= 100 then
    raise exception 'application_candidate_history_limit_reached';
  end if;
  next_design_revision := target_state.candidate_design_revision + 1;
  next_spec_version := target_state.candidate_spec_version + 1;
  next_candidate_versions := coalesce(target_state.candidate_versions, '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object('version', next_spec_version, 'spec', merged_spec));
  update public.application_states
  set candidate_design_revision = next_design_revision,
      candidate_spec_version = next_spec_version,
      candidate_spec = merged_spec,
      candidate_rehearsal = null,
      lifecycle_status = 'draft',
      candidate_versions = next_candidate_versions,
      updated_at = clock_timestamp()
  where work_id = p_work_id and workspace_id = p_workspace_id;

  -- The compatibility row carries the current candidate and installation
  -- metadata for existing links. It does not receive records or a release
  -- pointer, so runtime readers continue serving the prior release.
  perform public.application_touch_compatibility(
    p_work_id,
    p_user_id,
    'adopt_update',
    jsonb_build_object(
      'title', merged_spec->>'title',
      'spec', merged_spec,
      'specVersion', next_spec_version,
      'status', 'draft',
      'rehearsal', null,
      'versions', next_candidate_versions,
      'designRevision', next_design_revision,
      'candidate', jsonb_build_object(
        'designRevision', next_design_revision,
        'specVersion', next_spec_version,
        'spec', merged_spec,
        'rehearsal', null
      ),
      'installation', jsonb_build_object(
        'sourceWorkId', p_source_work_id,
        'sourceVersion', p_source_version,
        'baseSpec', remote_spec
      )
    )
  );
  return query
    select * from public.application_states
    where work_id = p_work_id and workspace_id = p_workspace_id;
end;
$$;

revoke all on function public.application_guard_release_history() from public, anon, authenticated, service_role;
revoke all on function public.adopt_application_source_update(uuid, uuid, uuid, text, integer, uuid, integer) from public, anon, authenticated, service_role;
grant execute on function public.adopt_application_source_update(uuid, uuid, uuid, text, integer, uuid, integer) to service_role;
