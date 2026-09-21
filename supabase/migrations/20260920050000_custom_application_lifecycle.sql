-- Custom applications keep arbitrary generated HTML behind their own bounded
-- release contract. The saved_product_work row remains the workspace identity;
-- these tables own source, build, review, release and recipient authority.
-- This migration deliberately does not alter native application tables.

create table public.custom_application_states (
  work_id uuid primary key references public.saved_product_work(id) on delete cascade,
  workspace_id uuid not null,
  maintenance_owner uuid not null references public.users(id) on delete restrict,
  candidate_revision integer not null default 0 check (candidate_revision >= 0),
  candidate_version integer not null default 1 check (candidate_version > 0),
  candidate_title text not null check (char_length(btrim(candidate_title)) between 1 and 160),
  candidate_files jsonb not null,
  candidate_source_digest text not null check (candidate_source_digest ~ '^[a-f0-9]{64}$'),
  current_release_version integer,
  budget_job_id uuid references public.job_economics(id) on delete restrict,
  budget_max_authorized_cents integer check (budget_max_authorized_cents between 0 and 1000000),
  budget_estimate_cents integer check (budget_estimate_cents is null or budget_estimate_cents between 0 and 1000000),
  lifecycle_status text not null default 'draft' check (lifecycle_status in ('draft', 'released', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_id, workspace_id),
  foreign key (work_id, workspace_id)
    references public.saved_product_work(id, workspace_id) on delete cascade,
  check ((budget_job_id is null) = (budget_max_authorized_cents is null)),
  check (budget_estimate_cents is null or budget_max_authorized_cents is null or budget_estimate_cents <= budget_max_authorized_cents)
);

create table public.custom_application_artifacts (
  work_id uuid not null,
  workspace_id uuid not null,
  application_version integer not null check (application_version > 0),
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  artifact_digest text not null check (artifact_digest ~ '^[a-f0-9]{64}$'),
  image text not null check (char_length(image) between 1 and 256),
  html text not null check (char_length(html) > 0 and octet_length(html) <= 512000),
  built_at timestamptz not null,
  duration_ms integer not null check (duration_ms >= 0),
  limits jsonb not null,
  created_at timestamptz not null default now(),
  primary key (work_id, application_version),
  unique (work_id, artifact_digest),
  unique (work_id, workspace_id, application_version),
  foreign key (work_id, workspace_id)
    references public.custom_application_states(work_id, workspace_id) on delete cascade
);

create table public.custom_application_reviews (
  work_id uuid not null,
  workspace_id uuid not null,
  application_version integer not null,
  artifact_digest text not null check (artifact_digest ~ '^[a-f0-9]{64}$'),
  checks jsonb not null,
  reviewed_by uuid not null references public.users(id) on delete restrict,
  reviewed_at timestamptz not null default now(),
  primary key (work_id, application_version),
  foreign key (work_id, workspace_id, application_version)
    references public.custom_application_artifacts(work_id, workspace_id, application_version) on delete restrict
);

create table public.custom_application_releases (
  work_id uuid not null,
  workspace_id uuid not null,
  version integer not null check (version > 0),
  application_version integer not null,
  artifact_digest text not null check (artifact_digest ~ '^[a-f0-9]{64}$'),
  published_by uuid not null references public.users(id) on delete restrict,
  published_at timestamptz not null default now(),
  primary key (work_id, version),
  unique (work_id, version, workspace_id),
  foreign key (work_id, workspace_id, application_version)
    references public.custom_application_artifacts(work_id, workspace_id, application_version) on delete restrict
);

create table public.custom_application_grants (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null,
  workspace_id uuid not null,
  release_version integer not null,
  recipient_email text not null check (recipient_email = lower(btrim(recipient_email)) and char_length(recipient_email) between 3 and 254),
  purpose text not null check (char_length(btrim(purpose)) between 1 and 500),
  expires_at timestamptz not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  granted_by uuid not null references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.users(id) on delete restrict,
  foreign key (work_id, workspace_id, release_version)
    references public.custom_application_releases(work_id, workspace_id, version) on delete restrict,
  check ((status = 'revoked') = (revoked_at is not null))
);

create unique index custom_application_active_grant_recipient_idx
  on public.custom_application_grants(work_id, recipient_email)
  where status = 'active';
create index custom_application_grants_work_idx
  on public.custom_application_grants(work_id, status, created_at desc);
create index custom_application_releases_work_idx
  on public.custom_application_releases(work_id, version desc);
create index custom_application_artifacts_work_idx
  on public.custom_application_artifacts(work_id, application_version desc);

alter table public.custom_application_states enable row level security;
alter table public.custom_application_artifacts enable row level security;
alter table public.custom_application_reviews enable row level security;
alter table public.custom_application_releases enable row level security;
alter table public.custom_application_grants enable row level security;
revoke all on table public.custom_application_states, public.custom_application_artifacts,
  public.custom_application_reviews, public.custom_application_releases,
  public.custom_application_grants from public, anon, authenticated, service_role;

create or replace function public.custom_application_sha256(p_value text)
returns text language sql immutable strict set search_path = public, pg_temp as $$
  select encode(sha256(convert_to(p_value, 'UTF8')), 'hex')
$$;

create or replace function public.custom_application_digest(
  p_workspace_id uuid, p_work_id uuid, p_application_version integer, p_html text
) returns text language sql immutable strict set search_path = public, pg_temp as $$
  select public.custom_application_sha256(
    '[' || to_jsonb(p_workspace_id::text)::text || ','
      || to_jsonb(p_work_id::text)::text || ','
      || p_application_version::text || ','
      || to_jsonb(p_html)::text || ']'
  )
$$;

create or replace function public.custom_application_source_digest(p_files jsonb)
returns text language sql immutable strict set search_path = public, pg_temp as $$
  select public.custom_application_sha256(
    '[' || coalesce(string_agg(
      '[' || to_jsonb(key)::text || ',' || to_jsonb(value)::text || ']'
      , ',' order by key
    ), '') || ']'
  )
  from jsonb_each_text(p_files)
$$;

create or replace function public.custom_application_validate_files(
  p_files jsonb, p_source_digest text
) returns void language plpgsql immutable set search_path = public, pg_temp as $$
declare item record; total_bytes integer := 0;
begin
  if p_files is null or jsonb_typeof(p_files) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(p_files)) = 0
    or (select count(*) from jsonb_object_keys(p_files)) > 30
    or not (p_files ? 'build.mjs') then raise exception 'custom_application_schema_invalid'; end if;
  for item in select key, value from jsonb_each_text(p_files) order by key loop
    if item.key !~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$'
      or item.key like '%/%../%' or item.key ~ '(^|/)\.\.(/|$)' or item.key like '%//%' then
      raise exception 'custom_application_schema_invalid';
    end if;
    total_bytes := total_bytes + octet_length(item.value);
  end loop;
  if total_bytes > 512000 or p_source_digest is distinct from public.custom_application_source_digest(p_files) then
    raise exception 'custom_application_schema_invalid';
  end if;
end;
$$;

create or replace function public.custom_application_artifact_immutable()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'custom_application_artifact_immutable';
end;
$$;

create trigger custom_application_artifact_immutable_trg
  before update or delete on public.custom_application_artifacts
  for each row execute function public.custom_application_artifact_immutable();

create or replace function public.custom_application_assert_identity(
  p_work_id uuid, p_user_id uuid, p_verified_email text, p_manager boolean default true
) returns public.saved_product_work language plpgsql security definer set search_path = public, pg_temp as $$
declare item public.saved_product_work;
begin
  select * into item from public.saved_product_work where id = p_work_id
    and product_id = 'custom-applications' and resource_kind = 'custom-application';
  if not found then raise exception 'custom_application_access_denied'; end if;
  if not exists (
    select 1 from public.users where id = p_user_id
      and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null
  ) then raise exception 'verified_identity_required'; end if;
  if p_manager and not exists (
    select 1 from public.workspace_memberships
      where workspace_id = item.workspace_id and user_id = p_user_id and role in ('owner', 'admin')
  ) then raise exception 'custom_application_access_denied'; end if;
  return item;
end;
$$;

create or replace function public.custom_application_artifact_summary(
  p_work_id uuid, p_application_version integer
) returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'applicationVersion', artifact.application_version,
    'sourceDigest', artifact.source_digest,
    'artifactDigest', artifact.artifact_digest,
    'image', artifact.image,
    'builtAt', artifact.built_at,
    'durationMs', artifact.duration_ms,
    'state', 'built',
    'limits', artifact.limits,
    'review', case when review.application_version is null then null else jsonb_build_object(
      'artifactDigest', review.artifact_digest,
      'checks', review.checks,
      'reviewedBy', review.reviewed_by,
      'reviewedAt', review.reviewed_at
    ) end
  )
  from public.custom_application_artifacts artifact
  left join public.custom_application_reviews review
    on review.work_id = artifact.work_id and review.application_version = artifact.application_version
  where artifact.work_id = p_work_id and artifact.application_version = p_application_version
$$;

create or replace function public.custom_application_state_json(p_work_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare state public.custom_application_states; work public.saved_product_work; candidate_artifact jsonb; releases jsonb;
begin
  select * into work from public.saved_product_work where id = p_work_id;
  select * into state from public.custom_application_states where work_id = p_work_id;
  if not found or work.id is null then raise exception 'custom_application_unavailable'; end if;
  candidate_artifact := public.custom_application_artifact_summary(p_work_id, state.candidate_version);
  select coalesce(jsonb_agg(jsonb_build_object(
    'version', release.version,
    'artifactDigest', release.artifact_digest,
    'publishedAt', release.published_at,
    'publishedBy', release.published_by,
    'review', (public.custom_application_artifact_summary(release.work_id, release.application_version)->'review')
  ) order by release.version), '[]'::jsonb)
    into releases
    from public.custom_application_releases release where release.work_id = p_work_id;
  return jsonb_build_object(
    'version', 1,
    'workId', state.work_id,
    'workspaceId', state.workspace_id,
    'title', state.candidate_title,
    'maintenanceOwner', state.maintenance_owner,
    'status', state.lifecycle_status,
    'candidate', jsonb_build_object(
      'revision', state.candidate_revision,
      'version', state.candidate_version,
      'title', state.candidate_title,
      'files', state.candidate_files,
      'sourceDigest', state.candidate_source_digest,
      'artifact', candidate_artifact
    ),
    'currentReleaseVersion', state.current_release_version,
    'releases', releases,
    'budget', case when state.budget_job_id is null then null else jsonb_build_object(
      'jobId', state.budget_job_id,
      'maxAuthorizedCents', state.budget_max_authorized_cents,
      'estimateCents', state.budget_estimate_cents,
      'status', 'accepted'
    ) end,
    'updatedAt', state.updated_at
  );
end;
$$;

create or replace function public.custom_application_touch_work(
  p_work_id uuid, p_kind text, p_actor_id uuid
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work; state public.custom_application_states; next_payload jsonb; history jsonb; next_revision integer;
begin
  select * into work from public.saved_product_work where id = p_work_id for update;
  select * into state from public.custom_application_states where work_id = p_work_id for share;
  if not found then raise exception 'custom_application_unavailable'; end if;
  next_revision := coalesce((work.payload->>'revision')::integer, 0) + 1;
  history := coalesce(work.payload->'history', '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object('revision', next_revision, 'kind', p_kind, 'actorId', p_actor_id, 'at', clock_timestamp()));
  if jsonb_array_length(history) > 500 then
    select coalesce(jsonb_agg(value order by ordinal), '[]'::jsonb) into history
      from jsonb_array_elements(history) with ordinality item(value, ordinal)
      where ordinal > jsonb_array_length(history) - 500;
  end if;
  next_payload := public.custom_application_state_json(p_work_id);
  next_payload := jsonb_set(next_payload, '{revision}', to_jsonb(next_revision), true);
  next_payload := jsonb_set(next_payload, '{createdBy}', to_jsonb(work.created_by), true);
  next_payload := jsonb_set(next_payload, '{createdAt}', to_jsonb(work.created_at), true);
  next_payload := jsonb_set(next_payload, '{history}', history, true);
  update public.saved_product_work set payload = next_payload, title = state.candidate_title, updated_at = clock_timestamp() where id = p_work_id;
end;
$$;

create or replace function public.initialize_custom_application_state()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare candidate jsonb; owner_id uuid; source_digest text;
begin
  if new.product_id <> 'custom-applications' or new.resource_kind <> 'custom-application' then return new; end if;
  candidate := new.payload->'candidate';
  owner_id := (new.payload->>'maintenanceOwner')::uuid;
  source_digest := candidate->>'sourceDigest';
  perform public.custom_application_validate_files(candidate->'files', source_digest);
  insert into public.custom_application_states(
    work_id, workspace_id, maintenance_owner, candidate_title, candidate_files, candidate_source_digest
  ) values (
    new.id, new.workspace_id, owner_id, candidate->>'title', candidate->'files', source_digest
  ) on conflict (work_id) do nothing;
  return new;
end;
$$;
create trigger saved_product_work_custom_application_state_trg
  after insert on public.saved_product_work
  for each row execute function public.initialize_custom_application_state();

create or replace function public.custom_application_set_budget(
  p_work_id uuid, p_workspace_id uuid, p_job_id uuid, p_max_authorized_cents integer,
  p_estimate_cents integer, p_user_id uuid, p_verified_email text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work; state public.custom_application_states; job public.job_economics;
begin
  work := public.custom_application_assert_identity(p_work_id, p_user_id, p_verified_email, true);
  if work.workspace_id <> p_workspace_id then raise exception 'custom_application_access_denied'; end if;
  select * into state from public.custom_application_states where work_id = p_work_id for update;
  if not found then raise exception 'custom_application_unavailable'; end if;
  select * into job from public.job_economics where id = p_job_id for share;
  if not found or job.workspace_id <> p_workspace_id or job.work_id <> p_work_id
    or job.product_id <> 'custom-applications' or job.resource_kind <> 'custom-application'
    or job.status not in ('accepted', 'reserved') then raise exception 'custom_application_budget_required'; end if;
  if p_max_authorized_cents <> job.max_authorized_cents or p_estimate_cents is distinct from job.estimate_cents then raise exception 'custom_application_budget_required'; end if;
  update public.custom_application_states set budget_job_id = p_job_id,
    budget_max_authorized_cents = p_max_authorized_cents, budget_estimate_cents = p_estimate_cents,
    updated_at = clock_timestamp() where work_id = p_work_id;
  perform public.custom_application_touch_work(p_work_id, 'admit_custom_build', p_user_id);
  return public.custom_application_state_json(p_work_id);
end;
$$;

create or replace function public.custom_application_read(
  p_work_id uuid, p_user_id uuid, p_verified_email text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.custom_application_assert_identity(p_work_id, p_user_id, p_verified_email, true);
  return public.custom_application_state_json(p_work_id);
end;
$$;

create or replace function public.custom_application_update_candidate(
  p_work_id uuid, p_expected_candidate_revision integer, p_title text, p_files jsonb,
  p_user_id uuid, p_verified_email text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work; state public.custom_application_states; next_version integer; source_digest text;
begin
  work := public.custom_application_assert_identity(p_work_id, p_user_id, p_verified_email, true);
  select * into state from public.custom_application_states where work_id = p_work_id for update;
  if not found then raise exception 'custom_application_unavailable'; end if;
  if state.candidate_revision <> p_expected_candidate_revision then raise exception 'custom_application_revision_conflict'; end if;
  source_digest := public.custom_application_source_digest(p_files);
  perform public.custom_application_validate_files(p_files, source_digest);
  select greatest(state.candidate_version, coalesce(max(version), 0)) + 1 into next_version from public.custom_application_releases where work_id = p_work_id;
  update public.custom_application_states set candidate_revision = candidate_revision + 1,
    candidate_version = next_version, candidate_title = p_title, candidate_files = p_files,
    candidate_source_digest = source_digest, updated_at = clock_timestamp() where work_id = p_work_id;
  perform public.custom_application_touch_work(p_work_id, 'revise_custom_candidate', p_user_id);
  return public.custom_application_state_json(p_work_id);
end;
$$;

create or replace function public.custom_application_store_artifact(
  p_work_id uuid, p_application_version integer, p_source_digest text, p_artifact_digest text,
  p_image text, p_html text, p_built_at timestamptz, p_duration_ms integer, p_limits jsonb,
  p_expected_candidate_revision integer, p_user_id uuid, p_verified_email text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work; state public.custom_application_states; existing public.custom_application_artifacts;
begin
  work := public.custom_application_assert_identity(p_work_id, p_user_id, p_verified_email, true);
  select * into state from public.custom_application_states where work_id = p_work_id for update;
  if not found or state.candidate_revision <> p_expected_candidate_revision or state.candidate_version <> p_application_version then raise exception 'custom_application_revision_conflict'; end if;
  if state.budget_job_id is null or p_source_digest is distinct from state.candidate_source_digest
    or p_artifact_digest is distinct from public.custom_application_digest(work.workspace_id, p_work_id, p_application_version, p_html)
    or p_limits->>'network' <> 'none' then raise exception 'custom_application_artifact_conflict'; end if;
  select * into existing from public.custom_application_artifacts where work_id = p_work_id and application_version = p_application_version;
  if found and (existing.artifact_digest <> p_artifact_digest or existing.html <> p_html) then raise exception 'custom_application_artifact_conflict'; end if;
  if not found then
    insert into public.custom_application_artifacts(work_id, workspace_id, application_version, source_digest, artifact_digest, image, html, built_at, duration_ms, limits)
      values(p_work_id, work.workspace_id, p_application_version, p_source_digest, p_artifact_digest, p_image, p_html, p_built_at, p_duration_ms, p_limits);
  end if;
  perform public.custom_application_touch_work(p_work_id, 'build_custom_candidate', p_user_id);
  return public.custom_application_state_json(p_work_id);
end;
$$;

create or replace function public.custom_application_review(
  p_work_id uuid, p_expected_candidate_revision integer, p_artifact_digest text, p_checks jsonb,
  p_user_id uuid, p_verified_email text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work; state public.custom_application_states; artifact public.custom_application_artifacts; existing public.custom_application_reviews; check_count integer;
begin
  work := public.custom_application_assert_identity(p_work_id, p_user_id, p_verified_email, true);
  select * into state from public.custom_application_states where work_id = p_work_id for update;
  if not found or state.candidate_revision <> p_expected_candidate_revision then raise exception 'custom_application_revision_conflict'; end if;
  select * into artifact from public.custom_application_artifacts where work_id = p_work_id and application_version = state.candidate_version;
  if not found or artifact.artifact_digest <> p_artifact_digest then raise exception 'custom_application_artifact_conflict'; end if;
  if jsonb_typeof(p_checks) is distinct from 'array' or jsonb_array_length(p_checks) <> 4 then raise exception 'custom_application_review_required'; end if;
  select count(*) into check_count from jsonb_array_elements(p_checks) item where item->>'id' in ('build','desktop','mobile','keyboard') and item->>'passed' = 'true' and jsonb_typeof(item->'evidence') = 'string' and char_length(item->>'evidence') > 0;
  if check_count <> 4 then raise exception 'custom_application_review_required'; end if;
  select * into existing from public.custom_application_reviews where work_id = p_work_id and application_version = state.candidate_version;
  if found and (existing.artifact_digest <> p_artifact_digest or existing.checks <> p_checks) then raise exception 'custom_application_artifact_conflict'; end if;
  if not found then
    insert into public.custom_application_reviews(work_id, workspace_id, application_version, artifact_digest, checks, reviewed_by, reviewed_at)
      values(p_work_id, work.workspace_id, state.candidate_version, p_artifact_digest, p_checks, p_user_id, clock_timestamp());
  end if;
  perform public.custom_application_touch_work(p_work_id, 'review_custom_artifact', p_user_id);
  return public.custom_application_state_json(p_work_id);
end;
$$;

create or replace function public.custom_application_release(
  p_work_id uuid, p_expected_candidate_revision integer, p_expected_release_version integer,
  p_user_id uuid, p_verified_email text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work; state public.custom_application_states; artifact public.custom_application_artifacts; review public.custom_application_reviews; next_version integer; artifact_exists boolean; review_exists boolean;
begin
  work := public.custom_application_assert_identity(p_work_id, p_user_id, p_verified_email, true);
  select * into state from public.custom_application_states where work_id = p_work_id for update;
  if not found or state.candidate_revision <> p_expected_candidate_revision or state.current_release_version is distinct from p_expected_release_version then raise exception 'custom_application_release_conflict'; end if;
  select * into artifact from public.custom_application_artifacts where work_id = p_work_id and application_version = state.candidate_version;
  artifact_exists := found;
  select * into review from public.custom_application_reviews where work_id = p_work_id and application_version = state.candidate_version;
  review_exists := found;
  if not artifact_exists or not review_exists or artifact.artifact_digest is distinct from review.artifact_digest then raise exception 'custom_application_review_required'; end if;
  select coalesce(max(version), 0) + 1 into next_version from public.custom_application_releases where work_id = p_work_id;
  insert into public.custom_application_releases(work_id, workspace_id, version, application_version, artifact_digest, published_by)
    values(p_work_id, work.workspace_id, next_version, state.candidate_version, artifact.artifact_digest, p_user_id);
  update public.custom_application_states set current_release_version = next_version, lifecycle_status = 'released', updated_at = clock_timestamp() where work_id = p_work_id;
  perform public.custom_application_touch_work(p_work_id, 'release_custom_artifact', p_user_id);
  return public.custom_application_state_json(p_work_id);
end;
$$;

create or replace function public.custom_application_rollback(
  p_work_id uuid, p_expected_release_version integer, p_target_release_version integer,
  p_user_id uuid, p_verified_email text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work; state public.custom_application_states; target public.custom_application_releases;
begin
  work := public.custom_application_assert_identity(p_work_id, p_user_id, p_verified_email, true);
  select * into state from public.custom_application_states where work_id = p_work_id for update;
  select * into target from public.custom_application_releases where work_id = p_work_id and version = p_target_release_version;
  if not found or state.current_release_version is distinct from p_expected_release_version then raise exception 'custom_application_release_conflict'; end if;
  update public.custom_application_states set current_release_version = target.version, lifecycle_status = 'released', updated_at = clock_timestamp() where work_id = p_work_id;
  perform public.custom_application_touch_work(p_work_id, 'rollback_custom_release', p_user_id);
  return public.custom_application_state_json(p_work_id);
end;
$$;

create or replace function public.custom_application_retire(
  p_work_id uuid, p_user_id uuid, p_verified_email text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work;
begin
  work := public.custom_application_assert_identity(p_work_id, p_user_id, p_verified_email, true);
  update public.custom_application_states set lifecycle_status = 'retired', updated_at = clock_timestamp() where work_id = p_work_id;
  update public.custom_application_grants set status = 'revoked', revoked_at = clock_timestamp(), revoked_by = p_user_id where work_id = p_work_id and status = 'active';
  perform public.custom_application_touch_work(p_work_id, 'retire_custom_application', p_user_id);
  return public.custom_application_state_json(p_work_id);
end;
$$;

create or replace function public.custom_application_grant(
  p_work_id uuid, p_recipient_email text, p_release_version integer, p_purpose text,
  p_expires_at timestamptz, p_user_id uuid, p_verified_email text
) returns public.custom_application_grants language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work; state public.custom_application_states; target public.custom_application_releases; result public.custom_application_grants;
begin
  work := public.custom_application_assert_identity(p_work_id, p_user_id, p_verified_email, true);
  select * into state from public.custom_application_states where work_id = p_work_id for update;
  if state.lifecycle_status <> 'released' or state.current_release_version is null then raise exception 'custom_application_release_conflict'; end if;
  if p_release_version is null then p_release_version := state.current_release_version; end if;
  select * into target from public.custom_application_releases where work_id = p_work_id and version = p_release_version;
  if not found or p_expires_at <= now() then raise exception 'custom_application_grant_conflict'; end if;
  if exists(select 1 from public.custom_application_grants where work_id = p_work_id and recipient_email = lower(btrim(p_recipient_email)) and status = 'active') then raise exception 'custom_application_grant_conflict'; end if;
  insert into public.custom_application_grants(work_id, workspace_id, release_version, recipient_email, purpose, expires_at, granted_by)
    values(p_work_id, work.workspace_id, p_release_version, lower(btrim(p_recipient_email)), p_purpose, p_expires_at, p_user_id) returning * into result;
  return result;
end;
$$;

create or replace function public.custom_application_list_grants(
  p_work_id uuid, p_user_id uuid, p_verified_email text
) returns setof public.custom_application_grants language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work;
begin
  work := public.custom_application_assert_identity(p_work_id, p_user_id, p_verified_email, true);
  return query select * from public.custom_application_grants where work_id = p_work_id order by created_at desc;
end;
$$;

create or replace function public.custom_application_revoke_grant(
  p_work_id uuid, p_grant_id uuid, p_user_id uuid, p_verified_email text
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work;
begin
  work := public.custom_application_assert_identity(p_work_id, p_user_id, p_verified_email, true);
  update public.custom_application_grants set status = 'revoked', revoked_at = clock_timestamp(), revoked_by = p_user_id where id = p_grant_id and work_id = p_work_id and status = 'active';
  if not found then raise exception 'custom_application_access_denied'; end if;
end;
$$;

create or replace function public.custom_application_use(
  p_work_id uuid, p_user_id uuid, p_verified_email text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work; grant_row public.custom_application_grants; release public.custom_application_releases; artifact public.custom_application_artifacts;
begin
  work := public.custom_application_assert_identity(p_work_id, p_user_id, p_verified_email, false);
  select * into grant_row from public.custom_application_grants where work_id = p_work_id and recipient_email = lower(btrim(p_verified_email)) and status = 'active' and expires_at > now() order by created_at desc limit 1;
  if not found then raise exception 'custom_application_recipient_denied'; end if;
  select * into release from public.custom_application_releases where work_id = p_work_id and version = grant_row.release_version;
  select * into artifact from public.custom_application_artifacts where work_id = p_work_id and application_version = release.application_version;
  if not found or artifact.artifact_digest <> release.artifact_digest then raise exception 'custom_application_unavailable'; end if;
  if exists(select 1 from public.custom_application_states where work_id = p_work_id and lifecycle_status = 'retired') then raise exception 'custom_application_retired'; end if;
  return jsonb_build_object(
    'workId', work.id, 'title', work.title, 'releaseVersion', release.version,
    'artifactDigest', artifact.artifact_digest, 'html', artifact.html,
    'grant', jsonb_build_object('id', grant_row.id, 'workId', grant_row.work_id, 'workspaceId', grant_row.workspace_id,
      'releaseVersion', grant_row.release_version, 'recipientEmail', grant_row.recipient_email, 'purpose', grant_row.purpose,
      'expiresAt', grant_row.expires_at, 'status', grant_row.status, 'grantedBy', grant_row.granted_by,
      'createdAt', grant_row.created_at, 'revokedAt', grant_row.revoked_at)
  );
end;
$$;

create or replace function public.custom_application_preview(
  p_work_id uuid, p_user_id uuid, p_verified_email text
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare work public.saved_product_work; state public.custom_application_states; artifact public.custom_application_artifacts;
begin
  work := public.custom_application_assert_identity(p_work_id, p_user_id, p_verified_email, true);
  select * into state from public.custom_application_states where work_id = p_work_id;
  select * into artifact from public.custom_application_artifacts
    where work_id = p_work_id and application_version = state.candidate_version;
  if not found then raise exception 'custom_application_build_failed'; end if;
  return jsonb_build_object(
    'applicationVersion', artifact.application_version,
    'artifactDigest', artifact.artifact_digest,
    'html', artifact.html
  );
end;
$$;

revoke all on function public.custom_application_set_budget(uuid, uuid, uuid, integer, integer, uuid, text),
  public.custom_application_read(uuid, uuid, text), public.custom_application_update_candidate(uuid, integer, text, jsonb, uuid, text),
  public.custom_application_store_artifact(uuid, integer, text, text, text, text, timestamptz, integer, jsonb, integer, uuid, text),
  public.custom_application_review(uuid, integer, text, jsonb, uuid, text), public.custom_application_release(uuid, integer, integer, uuid, text),
  public.custom_application_rollback(uuid, integer, integer, uuid, text), public.custom_application_retire(uuid, uuid, text),
  public.custom_application_grant(uuid, text, integer, text, timestamptz, uuid, text), public.custom_application_list_grants(uuid, uuid, text),
  public.custom_application_revoke_grant(uuid, uuid, uuid, text), public.custom_application_use(uuid, uuid, text),
  public.custom_application_preview(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.custom_application_set_budget(uuid, uuid, uuid, integer, integer, uuid, text),
  public.custom_application_read(uuid, uuid, text), public.custom_application_update_candidate(uuid, integer, text, jsonb, uuid, text),
  public.custom_application_store_artifact(uuid, integer, text, text, text, text, timestamptz, integer, jsonb, integer, uuid, text),
  public.custom_application_review(uuid, integer, text, jsonb, uuid, text), public.custom_application_release(uuid, integer, integer, uuid, text),
  public.custom_application_rollback(uuid, integer, integer, uuid, text), public.custom_application_retire(uuid, uuid, text),
  public.custom_application_grant(uuid, text, integer, text, timestamptz, uuid, text), public.custom_application_list_grants(uuid, uuid, text),
  public.custom_application_revoke_grant(uuid, uuid, uuid, text), public.custom_application_use(uuid, uuid, text),
  public.custom_application_preview(uuid, uuid, text)
  to service_role;
