-- Customer-authorized local stop-work state. This records a reversible
-- operating decision without deleting customer records, changing billing, or
-- claiming that an external provider or subscription was cancelled.

create table public.workspace_exit_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  requested_by uuid not null references public.users(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 128 and idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'),
  command_digest text not null check (command_digest ~ '^[0-9a-f]{64}$'),
  future_work text not null check (future_work in ('pause', 'cancel')),
  provider_participation text not null check (provider_participation in ('keep', 'revoke')),
  maintained_resource_action text not null check (maintained_resource_action in ('stop', 'successor')),
  successor_user_id uuid references public.users(id) on delete restrict,
  notes text check (notes is null or char_length(btrim(notes)) <= 1000),
  state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 500000),
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz not null,
  unique (workspace_id),
  unique (workspace_id, idempotency_key),
  check ((maintained_resource_action = 'successor') = (successor_user_id is not null))
);

alter table public.workspace_exit_requests enable row level security;
revoke all on public.workspace_exit_requests from public, anon, authenticated, service_role;

create or replace function public.workspace_exit_completed(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1 from public.workspace_exit_requests
    where workspace_id = p_workspace_id and state->>'status' = 'completed'
  )
$$;
revoke all on function public.workspace_exit_completed(uuid) from public, anon, authenticated;
grant execute on function public.workspace_exit_completed(uuid) to service_role;

create or replace function public.workspace_exit_resources_stopped(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists(
    select 1 from public.workspace_exit_requests
    where workspace_id = p_workspace_id
      and state#>>'{maintainedResources,kind}' = 'stopped'
  )
$$;
revoke all on function public.workspace_exit_resources_stopped(uuid) from public, anon, authenticated;
grant execute on function public.workspace_exit_resources_stopped(uuid) to service_role;

-- Existing execution authorities remain responsible for their own outcome
-- writes. These guards only reject a new admission or a new start after the
-- customer exit decision; an already-running action can still report its
-- accepted or unknown outcome.
create or replace function public.guard_workspace_exit_saved_work()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  old_steps jsonb := coalesce(case when tg_op = 'UPDATE' and jsonb_typeof(old.payload->'steps') = 'array' then old.payload->'steps' else '[]'::jsonb end, '[]'::jsonb);
  new_steps jsonb := coalesce(case when jsonb_typeof(new.payload->'steps') = 'array' then new.payload->'steps' else '[]'::jsonb end, '[]'::jsonb);
begin
  if tg_op = 'INSERT' then
    if public.workspace_exit_completed(new.workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
    return new;
  end if;
  if not public.workspace_exit_completed(new.workspace_id) then return new; end if;
  if new.product_id = 'investigations'
    and old.payload->>'status' is distinct from new.payload->>'status'
    and new.payload->>'status' = 'active' then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  if new.product_id = 'operations' then
    if old.payload->>'status' is distinct from new.payload->>'status'
      and new.payload->>'status' in ('ready', 'waiting', 'running') then
      raise exception 'workspace_exit_future_work_blocked';
    end if;
    if exists(
      select 1
      from jsonb_array_elements(old_steps) with ordinality previous(step, ordinal)
      join jsonb_array_elements(new_steps) with ordinality next(step, ordinal) using (ordinal)
      where previous.step->>'status' in ('pending', 'waiting')
        and next.step->>'status' = 'running'
    ) then
      raise exception 'workspace_exit_future_work_blocked';
    end if;
  end if;
  if new.product_id = 'scheduling' and exists(
    select 1
    from jsonb_array_elements(coalesce(new.payload->'reservations', '[]'::jsonb)) next_reservation
    where next_reservation->>'status' = 'writing'
      or (
        next_reservation->>'status' = 'reserved'
        and not exists(
          select 1
          from jsonb_array_elements(coalesce(old.payload->'reservations', '[]'::jsonb)) prior_reservation
          where prior_reservation->>'requestId' = next_reservation->>'requestId'
            and prior_reservation->>'status' = 'reserved'
        )
      )
  ) then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  return new;
end;
$$;
create trigger saved_product_work_workspace_exit_guard_trg
before insert or update on public.saved_product_work
for each row execute function public.guard_workspace_exit_saved_work();

create or replace function public.guard_workspace_exit_standing_policy()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if public.workspace_exit_completed(new.workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  elsif public.workspace_exit_completed(new.workspace_id)
    and new.status = 'active' and old.status is distinct from new.status then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  return new;
end;
$$;
create trigger standing_responsibilities_workspace_exit_guard_trg
before insert or update on public.standing_responsibilities
for each row execute function public.guard_workspace_exit_standing_policy();

create or replace function public.guard_workspace_exit_new_admission()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare workspace_id uuid;
begin
  if tg_table_name = 'job_economics_executions' then
    select job.workspace_id into workspace_id from public.job_economics job where job.id = new.job_id;
  else
    workspace_id := coalesce(
      (to_jsonb(new)->>'workspace_id')::uuid,
      (to_jsonb(new)->>'business_workspace_id')::uuid
    );
  end if;
  if workspace_id is null or not public.workspace_exit_completed(workspace_id) then return new; end if;
  if tg_table_name in ('operational_assignments', 'standing_responsibility_jobs', 'job_economics', 'job_economics_executions', 'offering_provider_deliveries', 'offering_installations') and tg_op = 'INSERT' then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  if tg_table_name = 'operational_assignments' and new.status = 'accepted' and old.status is distinct from new.status then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  if tg_table_name = 'standing_responsibility_jobs' and new.status = 'accepted' and old.status is distinct from new.status then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  if tg_table_name = 'job_economics' and new.status in ('accepted', 'reserved') and old.status is distinct from new.status then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  if tg_table_name = 'job_economics_executions' and new.status = 'running' and old.status is distinct from new.status then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  if tg_table_name = 'offering_provider_deliveries' and new.status = 'accepted' and old.status is distinct from new.status then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  if tg_table_name = 'offering_installations' and new.status = 'active' and old.status is distinct from new.status then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  return new;
end;
$$;
create trigger operational_assignments_workspace_exit_guard_trg
before insert or update on public.operational_assignments
for each row execute function public.guard_workspace_exit_new_admission();
create trigger standing_jobs_workspace_exit_guard_trg
before insert or update on public.standing_responsibility_jobs
for each row execute function public.guard_workspace_exit_new_admission();
create trigger economics_jobs_workspace_exit_guard_trg
before insert or update on public.job_economics
for each row execute function public.guard_workspace_exit_new_admission();
create trigger economics_executions_workspace_exit_guard_trg
before insert or update on public.job_economics_executions
for each row execute function public.guard_workspace_exit_new_admission();
create trigger provider_deliveries_workspace_exit_guard_trg
before insert or update on public.offering_provider_deliveries
for each row execute function public.guard_workspace_exit_new_admission();
create trigger offering_installations_workspace_exit_guard_trg
before insert or update on public.offering_installations
for each row execute function public.guard_workspace_exit_new_admission();

create or replace function public.guard_workspace_exit_application_resource()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare workspace_id uuid := (to_jsonb(new)->>'workspace_id')::uuid;
begin
  if not public.workspace_exit_resources_stopped(workspace_id) then return new; end if;
  if tg_op = 'INSERT' then raise exception 'workspace_exit_resource_stopped'; end if;
  if tg_table_name in ('application_states', 'custom_application_states') then
    if new.lifecycle_status <> 'retired' or old.lifecycle_status <> 'retired' then
      raise exception 'workspace_exit_resource_stopped';
    end if;
  elsif tg_table_name = 'application_records' then
    raise exception 'workspace_exit_resource_stopped';
  end if;
  return new;
end;
$$;
create trigger application_states_workspace_exit_guard_trg
before insert or update on public.application_states
for each row execute function public.guard_workspace_exit_application_resource();
create trigger custom_application_states_workspace_exit_guard_trg
before insert or update on public.custom_application_states
for each row execute function public.guard_workspace_exit_application_resource();
create trigger application_records_workspace_exit_guard_trg
before insert or update on public.application_records
for each row execute function public.guard_workspace_exit_application_resource();
create trigger custom_application_artifacts_workspace_exit_guard_trg
before insert on public.custom_application_artifacts
for each row execute function public.guard_workspace_exit_application_resource();
create trigger custom_application_reviews_workspace_exit_guard_trg
before insert on public.custom_application_reviews
for each row execute function public.guard_workspace_exit_application_resource();
create trigger application_releases_workspace_exit_guard_trg
before insert on public.application_releases
for each row execute function public.guard_workspace_exit_application_resource();
create trigger custom_application_releases_workspace_exit_guard_trg
before insert on public.custom_application_releases
for each row execute function public.guard_workspace_exit_application_resource();
create trigger custom_application_grants_workspace_exit_guard_trg
before insert on public.custom_application_grants
for each row execute function public.guard_workspace_exit_application_resource();

create or replace function public.guard_workspace_exit_standing_run()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if public.workspace_exit_completed(new.workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
    return new;
  end if;
  if public.workspace_exit_completed(new.workspace_id)
    and (
      new.status = 'admitted'
      or (new.status = 'running' and old.status is distinct from new.status)
      or (new.status = 'waiting' and old.status in ('admitted', 'completed', 'failed', 'cancelled'))
    ) then
    raise exception 'workspace_exit_future_work_blocked';
  end if;
  return new;
end;
$$;
create trigger standing_runs_workspace_exit_guard_trg
before insert or update on public.standing_responsibility_runs
for each row execute function public.guard_workspace_exit_standing_run();

-- Existing service-request records remain readable and may be explicitly
-- withdrawn or declined for cleanup. A new request, provider acceptance, or
-- delivery link would admit future work after exit, so the application-facing
-- functions receive the same conflict the saved-work guard returns.
create or replace function public.guard_workspace_exit_service_request()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not public.workspace_exit_completed(new.business_workspace_id) then return new; end if;
  if tg_op = 'INSERT' then raise exception 'workspace_exit_future_work_blocked'; end if;
  if new.status = 'withdrawn' and old.status is distinct from new.status then return new; end if;
  if new.provider_acceptance = 'declined' and old.provider_acceptance is distinct from new.provider_acceptance then return new; end if;
  raise exception 'workspace_exit_future_work_blocked';
end;
$$;
create trigger service_requests_workspace_exit_guard_trg
before insert or update on public.service_requests
for each row execute function public.guard_workspace_exit_service_request();

create or replace function public.read_workspace_exit_state(
  p_workspace_id uuid,
  p_user_id uuid,
  p_verified_email text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare state jsonb;
begin
  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'workspace_exit_denied'; end if;
  perform 1 from public.workspace_memberships
    where workspace_id = p_workspace_id and user_id = p_user_id and role = 'owner';
  if not found then raise exception 'workspace_exit_denied'; end if;
  select item.state into state
  from public.workspace_exit_requests item
  where item.workspace_id = p_workspace_id;
  return jsonb_build_object(
    'state', state,
    'successors', coalesce((
      select jsonb_agg(jsonb_build_object('userId', member.user_id, 'email', lower(person.email)) order by lower(person.email), member.user_id)
      from public.workspace_memberships member
      join public.users person on person.id = member.user_id and person.verified_at is not null
      where member.workspace_id = p_workspace_id and member.user_id <> p_user_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.complete_workspace_exit(
  p_workspace_id uuid,
  p_user_id uuid,
  p_verified_email text,
  p_future_work text,
  p_provider_participation text,
  p_maintained_resources jsonb,
  p_idempotency_key text,
  p_command_digest text,
  p_notes text default null
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  workspace_row public.workspaces%rowtype;
  prior public.workspace_exit_requests%rowtype;
  successor_id uuid;
  successor_email text;
  maintained_kind text;
  action_status text;
  event_kind text;
  now_at timestamptz := clock_timestamp();
  state jsonb;
  retained jsonb;
  resources jsonb;
  summary jsonb;
  standing_paused integer := 0;
  standing_revoked integer := 0;
  scheduled_paused integer := 0;
  scheduled_cancelled integer := 0;
  assignments_revoked integer := 0;
  provider_deliveries_revoked integer := 0;
  investigations_paused integer := 0;
  retained_accepted integer := 0;
  retained_unknown integer := 0;
  changed integer := 0;
  policy public.standing_responsibilities%rowtype;
  new_revision integer;
  new_payload jsonb;
  exit_id uuid := gen_random_uuid();
begin
  if p_future_work not in ('pause', 'cancel')
    or p_provider_participation not in ('keep', 'revoke')
    or p_maintained_resources is null
    or jsonb_typeof(p_maintained_resources) is distinct from 'object'
    or p_maintained_resources->>'kind' not in ('stop', 'successor')
    or p_idempotency_key is null
    or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]*$'
    or char_length(p_idempotency_key) not between 1 and 128
    or p_command_digest is null
    or p_command_digest !~ '^[0-9a-f]{64}$'
    or (p_maintained_resources->>'kind' = 'stop'
      and p_maintained_resources - array['kind']::text[] <> '{}'::jsonb)
    or (p_maintained_resources->>'kind' = 'successor'
      and (p_maintained_resources - array['kind', 'successorUserId']::text[] <> '{}'::jsonb
        or coalesce(p_maintained_resources->>'successorUserId', '') = '')) then
    raise exception 'workspace_exit_command_invalid';
  end if;

  if p_maintained_resources->>'kind' = 'successor' then
    begin
      successor_id := (p_maintained_resources->>'successorUserId')::uuid;
    exception when invalid_text_representation then
      raise exception 'workspace_exit_successor_invalid';
    end;
  end if;

  perform 1 from public.users
    where id = p_user_id and lower(email) = lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'workspace_exit_denied'; end if;
  select * into workspace_row from public.workspaces where id = p_workspace_id for update;
  if not found then raise exception 'workspace_exit_denied'; end if;
  perform 1 from public.workspace_memberships
    where workspace_id = p_workspace_id and user_id = p_user_id and role = 'owner';
  if not found then raise exception 'workspace_exit_denied'; end if;

  if successor_id is not null then
    select lower(u.email) into successor_email
    from public.users u
    join public.workspace_memberships m on m.user_id = u.id and m.workspace_id = p_workspace_id
    where u.id = successor_id and u.verified_at is not null;
    if successor_email is null or successor_id = p_user_id then
      raise exception 'workspace_exit_successor_invalid';
    end if;
  end if;

  select * into prior from public.workspace_exit_requests where workspace_id = p_workspace_id for update;
  if prior.id is not null then
    if prior.command_digest <> p_command_digest then raise exception 'workspace_exit_conflict'; end if;
    return jsonb_build_object('state', prior.state, 'replayed', true);
  end if;

  maintained_kind := p_maintained_resources->>'kind';
  -- Capture the resources before a stop action retires offerings or changes
  -- other local state. The exit record describes what was maintained at the
  -- boundary, not only what remains queryable afterward.
  resources := (
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind', 'standing', 'id', standing_policy.id,
      'status', case when maintained_kind = 'stop' then 'stopped' else 'successor_named' end
    ) order by standing_policy.id), '[]'::jsonb)
    from public.standing_responsibilities standing_policy
    where standing_policy.workspace_id = p_workspace_id and standing_policy.status in ('active', 'paused')
  ) || (
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind', 'investigation', 'id', investigation_work.id,
      'status', case when maintained_kind = 'stop' then 'stopped' else 'successor_named' end
    ) order by investigation_work.id), '[]'::jsonb)
    from public.saved_product_work investigation_work
    where investigation_work.workspace_id = p_workspace_id and investigation_work.product_id = 'investigations'
      and investigation_work.resource_kind = 'investigation'
      and investigation_work.payload->>'status' in ('active', 'paused')
  ) || (
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind', 'offering', 'id', offering_installation.id,
      'status', case when maintained_kind = 'stop' then 'stopped' else 'successor_named' end
    ) order by offering_installation.id), '[]'::jsonb)
    from public.offering_installations offering_installation
    where offering_installation.business_workspace_id = p_workspace_id
      and offering_installation.status in ('draft', 'active')
  ) || (
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind', 'native_application', 'id', native_state.work_id,
      'status', case when maintained_kind = 'stop' then 'stopped' else 'successor_named' end
    ) order by native_state.work_id), '[]'::jsonb)
    from public.application_states native_state
    where native_state.workspace_id = p_workspace_id and native_state.lifecycle_status in ('draft', 'installed')
  ) || (
    select coalesce(jsonb_agg(jsonb_build_object(
      'kind', 'custom_application', 'id', custom_state.work_id,
      'status', case when maintained_kind = 'stop' then 'stopped' else 'successor_named' end
    ) order by custom_state.work_id), '[]'::jsonb)
    from public.custom_application_states custom_state
    where custom_state.workspace_id = p_workspace_id and custom_state.lifecycle_status in ('draft', 'released')
  );

  -- Stop or pause policies through their existing guarded row contract. A
  -- successor is named for the handoff record; ownership and authority stay
  -- with this workspace until a separate accepted change.
  for policy in
    select * from public.standing_responsibilities
    where workspace_id = p_workspace_id and status in ('active', 'paused')
    order by id for update
  loop
    if p_future_work = 'pause' then
      if policy.status <> 'active' then continue; end if;
      action_status := 'paused';
      event_kind := 'pause';
      standing_paused := standing_paused + 1;
    else
      action_status := 'revoked';
      event_kind := 'revoke';
      standing_revoked := standing_revoked + 1;
    end if;
    new_revision := policy.revision + 1;
    new_payload := jsonb_set(policy.payload, '{status}', to_jsonb(action_status), true);
    new_payload := jsonb_set(new_payload, '{revision}', to_jsonb(new_revision), true);
    new_payload := jsonb_set(new_payload, '{updatedAt}', to_jsonb(now_at), true);
    new_payload := jsonb_set(new_payload, '{history}',
      coalesce(policy.payload->'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'revision', new_revision, 'kind', event_kind, 'actorId', p_user_id::text, 'at', now_at
      )), true);
    update public.standing_responsibilities
    set status = action_status, revision = new_revision, payload = new_payload, updated_at = now_at
    where id = policy.id;
  end loop;

  -- A ready or waiting finite responsibility has not begun its effect. Keep
  -- its row and history, but prevent the scheduler or assignment from
  -- starting it after the exit command commits.
  action_status := case when p_future_work = 'pause' then 'paused' else 'cancelled' end;
  event_kind := p_future_work;
  update public.saved_product_work work
  set payload = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(work.payload, '{status}', to_jsonb(action_status), true),
          '{revision}', to_jsonb((work.payload->>'revision')::integer + 1), true),
        '{updatedAt}', to_jsonb(now_at), true),
      '{history}', coalesce(work.payload->'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'revision', (work.payload->>'revision')::integer + 1,
        'kind', event_kind,
        'actorId', p_user_id::text,
        'at', now_at
      )), true),
    updated_at = now_at
  where work.workspace_id = p_workspace_id
    and work.product_id = 'operations'
    and work.resource_kind = 'responsibility'
    and work.payload->>'status' in ('ready', 'waiting')
    and not exists (
      select 1 from jsonb_array_elements(coalesce(work.payload->'steps', '[]'::jsonb)) step
      where step->>'status' in ('running', 'accepted', 'unknown')
    );
  get diagnostics changed = row_count;
  if p_future_work = 'pause' then scheduled_paused := changed; else scheduled_cancelled := changed; end if;

  update public.standing_responsibility_runs run
  set status = 'cancelled', cancelled_at = now_at, updated_at = now_at
  where run.workspace_id = p_workspace_id
    and run.status in ('admitted', 'waiting')
    and exists (
      select 1 from public.saved_product_work work
      where work.id = run.finite_work_id and work.workspace_id = p_workspace_id
        and work.payload->>'status' in ('paused', 'cancelled')
    );
  update public.standing_responsibility_jobs job
  set status = 'cancelled', cancelled_at = now_at, updated_at = now_at
  where job.workspace_id = p_workspace_id
    and job.status = 'accepted'
    and exists (
      select 1 from public.saved_product_work work
      where work.id = job.finite_work_id and work.workspace_id = p_workspace_id
        and work.payload->>'status' in ('paused', 'cancelled')
    );

  -- Saved investigations are the other local scheduled authority. They have
  -- no cancelled state, so both requested choices pause them and the result
  -- says that explicitly.
  update public.saved_product_work work
  set payload = jsonb_set(
      jsonb_set(
        jsonb_set(work.payload, '{status}', '"paused"'::jsonb, true),
        '{revision}', to_jsonb((work.payload->>'revision')::integer + 1), true),
      '{history}', coalesce(work.payload->'history', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'revision', (work.payload->>'revision')::integer + 1,
        'kind', 'pause', 'actorId', p_user_id::text, 'at', now_at
      )), true),
    updated_at = now_at
  where work.workspace_id = p_workspace_id
    and work.product_id = 'investigations'
    and work.resource_kind = 'investigation'
    and work.payload->>'status' = 'active';
  get diagnostics changed = row_count;
  investigations_paused := changed;

  -- Revoke local assignment access in either future-work mode. The assigned
  -- responsibility remains available for review, including active leases.
  update public.operational_assignments assignment
  set status = 'revoked', revoked_at = now_at, revoked_by = p_user_id
  where assignment.workspace_id = p_workspace_id and assignment.status in ('offered', 'accepted');
  get diagnostics assignments_revoked = row_count;

  if p_provider_participation = 'revoke' then
    update public.offering_provider_deliveries delivery
    set status = 'revoked', revision = delivery.revision + 1,
        revoked_by = p_user_id, revoked_at = now_at,
        revocation_reason = 'Customer workspace exit requested provider participation revocation.',
        history = delivery.history || jsonb_build_array(jsonb_build_object(
          'kind', 'customer_exit_revoked', 'actorId', p_user_id::text, 'at', now_at,
          'note', 'The customer chose to revoke future provider participation.'
        ))
    where delivery.business_workspace_id = p_workspace_id
      and delivery.status in ('requested', 'accepted');
    get diagnostics provider_deliveries_revoked = row_count;
  end if;

  if p_maintained_resources->>'kind' = 'stop' then
    update public.offering_installations installation
    set status = 'retired', revision = installation.revision + 1,
        updated_by = p_user_id, updated_at = now_at,
        retired_by = p_user_id, retired_at = now_at,
        retirement_reason = 'Customer workspace exit stopped this maintained resource.'
    where installation.business_workspace_id = p_workspace_id
      and installation.status in ('draft', 'active');
    update public.application_states state
    set lifecycle_status = 'retired', updated_at = now_at
    where state.workspace_id = p_workspace_id and state.lifecycle_status in ('draft', 'installed');
    update public.custom_application_states state
    set lifecycle_status = 'retired', updated_at = now_at
    where state.workspace_id = p_workspace_id and state.lifecycle_status in ('draft', 'released');
    update public.custom_application_grants grant_row
    set status = 'revoked', revoked_at = now_at, revoked_by = p_user_id
    where grant_row.workspace_id = p_workspace_id and grant_row.status = 'active';
  end if;

  select coalesce(jsonb_agg(item order by item->>'title', item->>'workId'), '[]'::jsonb)
  into retained
  from (
    select jsonb_build_object(
      'workId', grouped.work_id,
      'title', grouped.title,
      'status', case when bool_or(grouped.status = 'unknown') then 'unknown'
        when bool_or(grouped.status = 'accepted') then 'accepted'
        when bool_or(grouped.status = 'running') then 'running'
        else 'needs_attention' end,
      'effect', case when bool_or(grouped.effect = 'unknown') then 'unknown'
        when bool_or(grouped.effect = 'accepted') then 'accepted'
        else 'none' end
    ) item
    from (
      select work.id work_id, coalesce(work.title, 'Ongoing work') title,
        case when step->>'status' = 'unknown' or step->>'effect' = 'unknown' then 'unknown'
          when step->>'status' = 'accepted' or step->>'effect' = 'accepted' then 'accepted'
          when step->>'status' = 'running' then 'running' else 'needs_attention' end status,
        case when step->>'status' = 'unknown' or step->>'effect' = 'unknown' then 'unknown'
          when step->>'status' in ('accepted', 'running') or step->>'effect' = 'accepted' then 'accepted'
          else 'none' end effect
      from public.saved_product_work work
      cross join lateral jsonb_array_elements(coalesce(work.payload->'steps', '[]'::jsonb)) step
      where work.workspace_id = p_workspace_id
        and work.product_id = 'operations'
        and work.resource_kind = 'responsibility'
        and step->>'status' in ('running', 'accepted', 'unknown')
      union all
      select work.id, coalesce(work.title, 'Budgeted work'),
        case when execution.effect = 'unknown' then 'unknown' else 'accepted' end,
        case when execution.effect = 'unknown' then 'unknown' else 'accepted' end
      from public.job_economics_executions execution
      join public.job_economics job on job.id = execution.job_id and job.workspace_id = p_workspace_id
      join public.saved_product_work work on work.id = job.work_id and work.workspace_id = p_workspace_id
      where execution.effect in ('accepted', 'unknown')
    ) grouped
    group by grouped.work_id, grouped.title
  ) grouped_items;
  select count(*) filter (where item->>'status' = 'unknown'),
         count(*) filter (where item->>'status' <> 'unknown')
  into retained_unknown, retained_accepted
  from jsonb_array_elements(retained) item;

  summary := jsonb_build_object(
    'standingPaused', standing_paused,
    'standingRevoked', standing_revoked,
    'scheduledPaused', scheduled_paused,
    'scheduledCancelled', scheduled_cancelled,
    'assignmentsRevoked', assignments_revoked,
    'providerDeliveriesRevoked', provider_deliveries_revoked,
    'investigationsPaused', investigations_paused,
    'retainedAccepted', retained_accepted,
    'retainedUnknown', retained_unknown
  );

  state := jsonb_build_object(
    'id', exit_id,
    'workspaceId', p_workspace_id,
    'status', 'completed',
    'requestedAt', now_at,
    'completedAt', clock_timestamp(),
    'requestedBy', p_user_id,
    'futureWork', case when p_future_work = 'pause' then 'paused' else 'cancelled' end,
    'providerParticipation', case when p_provider_participation = 'revoke' then 'revoked' else 'kept' end,
    'maintainedResources', case when maintained_kind = 'successor'
      then jsonb_build_object('kind', 'successor', 'successorUserId', successor_id, 'successorEmail', successor_email)
      else jsonb_build_object('kind', 'stopped') end,
    'summary', summary,
    'retainedObligations', retained,
    'resources', resources
  );

  insert into public.workspace_exit_requests(
    id, workspace_id, requested_by, idempotency_key, command_digest, future_work,
    provider_participation, maintained_resource_action, successor_user_id,
    notes, state, completed_at
  ) values (
    exit_id, p_workspace_id, p_user_id, p_idempotency_key, p_command_digest, p_future_work,
    p_provider_participation, maintained_kind, successor_id, nullif(btrim(p_notes), ''), state, now_at
  );
  return jsonb_build_object('state', state, 'replayed', false);
end;
$$;

revoke all on function public.read_workspace_exit_state(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_workspace_exit(uuid, uuid, text, text, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.read_workspace_exit_state(uuid, uuid, text) to service_role;
grant execute on function public.complete_workspace_exit(uuid, uuid, text, text, text, jsonb, text, text, text) to service_role;
