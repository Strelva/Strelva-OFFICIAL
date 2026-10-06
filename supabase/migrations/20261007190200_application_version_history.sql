-- Native applications take any number of candidate versions and releases.
-- Before this migration application_states.candidate_versions grew by one per
-- revise, rollback or adopted update and every RPC refused at 100
-- (application_candidate_history_limit_reached); a trigger refused the 101st
-- release row (application_release_history_limit_reached); and the
-- compatibility payload's releases list grew without bound past the 100-entry
-- parse limit.
--
-- Every candidate version is now archived in application_candidate_versions
-- and candidate_versions keeps the latest 50, so the RPCs' existing checks
-- never trip. Releases were already rows; their count cap is removed and the
-- compatibility payload lists only the latest 50. Same pattern as
-- 20261007190000_document_revisions.sql, without redefining the RPCs.
--
-- Additive and workspace-only: 0 production workspaces as of Sept 30.
-- Re-check that count before applying. No tenant, reb: or /api/v1 change.

create table public.application_candidate_versions (
  work_id uuid not null,
  workspace_id uuid not null,
  version integer not null check (version > 0),
  spec jsonb not null check (jsonb_typeof(spec) = 'object'),
  created_at timestamptz not null default clock_timestamp(),
  primary key (work_id, version),
  foreign key (work_id, workspace_id)
    references public.saved_product_work(id, workspace_id) on delete cascade
);
create index application_candidate_versions_workspace_idx
  on public.application_candidate_versions(workspace_id, work_id, version desc);

alter table public.application_candidate_versions enable row level security;
revoke all on public.application_candidate_versions from public, anon, authenticated, service_role;
grant select on public.application_candidate_versions to service_role;

create function public.application_candidate_version_append_only() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin raise exception 'application_candidate_version_immutable'; end $$;
create trigger application_candidate_version_append_only_trg
  before update on public.application_candidate_versions
  for each row execute function public.application_candidate_version_append_only();
revoke all on function public.application_candidate_version_append_only() from public, anon, authenticated;

-- Archive every candidate version on sight and keep the latest 50 on the row.
create function public.application_window_candidate_versions() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  window_size constant integer := 50;
  total integer;
begin
  if new.candidate_versions is null or jsonb_typeof(new.candidate_versions) is distinct from 'array' then
    return new;
  end if;
  insert into public.application_candidate_versions(work_id, workspace_id, version, spec)
  select new.work_id, new.workspace_id, (item->>'version')::integer, item->'spec'
  from jsonb_array_elements(new.candidate_versions) as item
  where jsonb_typeof(item) = 'object'
    and item->>'version' ~ '^[0-9]{1,9}$' and (item->>'version')::integer > 0
    and jsonb_typeof(item->'spec') = 'object'
  on conflict (work_id, version) do nothing;
  total := jsonb_array_length(new.candidate_versions);
  if total > window_size then
    select coalesce(jsonb_agg(item order by position), '[]'::jsonb) into new.candidate_versions
    from jsonb_array_elements(new.candidate_versions) with ordinality as entry(item, position)
    where position > total - window_size;
  end if;
  return new;
end $$;
revoke all on function public.application_window_candidate_versions() from public, anon, authenticated, service_role;
create trigger application_states_candidate_version_window_trg
  before insert or update of candidate_versions on public.application_states
  for each row execute function public.application_window_candidate_versions();

-- Releases are rows; every one stays addressable for rollback.
create or replace function public.application_guard_release_history()
returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return new;
end;
$$;

-- Same publication as 20260914020000, without the 100-release refusal.
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
revoke all on function public.publish_application_candidate(uuid, uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.publish_application_candidate(uuid, uuid, uuid, text, integer, integer) to service_role;

-- The compatibility payload lists the latest 50 releases and candidate
-- versions. The current release is always in payload->'release' and the
-- authority is application_releases.
create function public.application_window_compatibility_payload() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  window_size constant integer := 50;
  key text;
  total integer;
  trimmed jsonb;
begin
  if new.product_id is distinct from 'applications' or jsonb_typeof(new.payload) is distinct from 'object' then
    return new;
  end if;
  foreach key in array array['releases', 'versions'] loop
    if jsonb_typeof(new.payload->key) = 'array' then
      total := jsonb_array_length(new.payload->key);
      if total > window_size then
        select coalesce(jsonb_agg(item order by position), '[]'::jsonb) into trimmed
        from jsonb_array_elements(new.payload->key) with ordinality as entry(item, position)
        where position > total - window_size;
        new.payload := jsonb_set(new.payload, array[key], trimmed);
      end if;
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.application_window_compatibility_payload() from public, anon, authenticated, service_role;
create trigger saved_product_work_application_window_trg
  before update of payload on public.saved_product_work
  for each row when (new.product_id = 'applications')
  execute function public.application_window_compatibility_payload();

-- Keep every candidate version already stored. Rows are trimmed on their
-- next write, so an exited workspace's guarded rows are never touched here.
insert into public.application_candidate_versions(work_id, workspace_id, version, spec)
select state.work_id, state.workspace_id, (item->>'version')::integer, item->'spec'
from public.application_states state
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(state.candidate_versions) = 'array' then state.candidate_versions else '[]'::jsonb end
) as item
where jsonb_typeof(item) = 'object'
  and item->>'version' ~ '^[0-9]{1,9}$' and (item->>'version')::integer > 0
  and jsonb_typeof(item->'spec') = 'object'
on conflict (work_id, version) do nothing;
