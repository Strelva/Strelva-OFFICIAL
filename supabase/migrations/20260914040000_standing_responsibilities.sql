-- Standing responsibilities are policy records. They admit ordinary finite
-- responsibilities, then track each admitted job and run independently.
-- Additive local release only. No provider, billing, cron, or production
-- activation is implied by this migration.

create table public.standing_responsibilities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_id uuid not null references public.users(id) on delete restrict,
  version integer not null check (version > 0),
  revision integer not null check (revision >= 0),
  status text not null check (status in ('proposed', 'active', 'paused', 'revoked')),
  payload jsonb not null,
  -- This cursor is scheduler state, not a new policy version. It is kept
  -- outside payload so admitting a trigger never rewrites approved scope.
  next_trigger_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id),
  check (jsonb_typeof(payload) = 'object'),
  check (octet_length(payload::text) <= 1048576),
  check (payload->>'version' = version::text),
  check (payload->>'revision' = revision::text),
  check (payload->>'ownerId' = owner_id::text),
  check (payload->>'status' = status),
  check (jsonb_typeof(payload->'scope') is not distinct from 'object'),
  check (jsonb_typeof(payload->'scope'->'steps') is not distinct from 'array'),
  check (coalesce(jsonb_array_length(payload->'scope'->'steps'), 0) between 1 and 20),
  check (jsonb_typeof(payload->'history') is not distinct from 'array'),
  check (coalesce(jsonb_array_length(payload->'history'), 0) between 0 and 1000),
  check (jsonb_typeof(payload->'trigger') is not distinct from 'object'),
  check (coalesce(payload->'trigger'->>'kind', '') in ('manual', 'interval')),
  check ((payload->'trigger'->>'kind' = 'manual' and next_trigger_at is null)
    or (payload->'trigger'->>'kind' = 'interval' and next_trigger_at is not null
      and payload->'trigger'->>'everySeconds' ~ '^[0-9]+$'
      and (payload->'trigger'->>'everySeconds')::integer between 60 and 31536000)),
  check (jsonb_typeof(payload->'limits') is not distinct from 'object'),
  check (case when payload->'limits'->>'maxConcurrentJobs' ~ '^[0-9]+$'
    then (payload->'limits'->>'maxConcurrentJobs')::integer between 1 and 20 else false end),
  check (case when payload->'limits'->>'maxRuns' is null then true
    when payload->'limits'->>'maxRuns' ~ '^[0-9]+$'
    then (payload->'limits'->>'maxRuns')::integer between 1 and 10000 else false end)
);
create index standing_responsibilities_due_idx
  on public.standing_responsibilities (next_trigger_at, updated_at)
  where status = 'active' and next_trigger_at is not null;
create index standing_responsibilities_workspace_idx
  on public.standing_responsibilities (workspace_id, updated_at desc);

create table public.standing_responsibility_jobs (
  id uuid primary key default gen_random_uuid(),
  standing_responsibility_id uuid not null references public.standing_responsibilities(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  finite_work_id uuid not null,
  trigger_key text not null check (char_length(trigger_key) between 1 and 256 and trigger_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:/-]*$'),
  policy_version integer not null check (policy_version > 0),
  status text not null default 'accepted' check (status in ('accepted', 'cancelled')),
  accepted_at timestamptz not null default now(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (standing_responsibility_id, trigger_key),
  unique (finite_work_id),
  unique (id, standing_responsibility_id),
  foreign key (finite_work_id, workspace_id)
    references public.saved_product_work(id, workspace_id) on delete cascade,
  foreign key (standing_responsibility_id, workspace_id)
    references public.standing_responsibilities(id, workspace_id) on delete cascade,
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index standing_responsibility_jobs_standing_idx
  on public.standing_responsibility_jobs (standing_responsibility_id, created_at desc);

create table public.standing_responsibility_runs (
  id uuid primary key default gen_random_uuid(),
  standing_responsibility_id uuid not null references public.standing_responsibilities(id) on delete cascade,
  job_id uuid not null references public.standing_responsibility_jobs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  finite_work_id uuid not null,
  trigger_key text not null,
  policy_version integer not null check (policy_version > 0),
  status text not null default 'admitted'
    check (status in ('admitted', 'running', 'waiting', 'needs_attention', 'completed', 'failed', 'cancelled')),
  attempt integer not null default 0 check (attempt >= 0),
  wake_at timestamptz,
  last_error text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id),
  foreign key (job_id, standing_responsibility_id)
    references public.standing_responsibility_jobs(id, standing_responsibility_id) on delete cascade,
  foreign key (finite_work_id, workspace_id)
    references public.saved_product_work(id, workspace_id) on delete cascade,
  check ((status = 'cancelled') = (cancelled_at is not null))
);
create index standing_responsibility_runs_standing_idx
  on public.standing_responsibility_runs (standing_responsibility_id, created_at desc);

create table public.standing_responsibility_receipts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.standing_responsibility_runs(id) on delete cascade,
  step_id text not null check (step_id ~ '^[a-z][a-z0-9_-]{0,39}$'),
  attempt integer not null check (attempt > 0),
  status text not null check (status in ('running', 'waiting', 'completed', 'accepted', 'failed', 'unknown')),
  effect text not null check (effect in ('none', 'accepted', 'unknown')),
  result jsonb,
  reason text check (reason is null or char_length(reason) <= 2000),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, step_id, attempt)
);
create index standing_responsibility_receipts_run_idx
  on public.standing_responsibility_receipts (run_id, created_at asc);

create or replace function public.guard_standing_responsibility_policy() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if new.payload is null or jsonb_typeof(new.payload) is distinct from 'object'
    or new.payload->>'version' is distinct from new.version::text
    or new.payload->>'revision' is distinct from new.revision::text
    or new.payload->>'ownerId' is distinct from new.owner_id::text
    or new.payload->>'status' is distinct from new.status
    or jsonb_typeof(new.payload->'scope') is distinct from 'object'
    or jsonb_typeof(new.payload->'scope'->'steps') is distinct from 'array'
    or coalesce(new.payload->'trigger'->>'kind', '') not in ('manual', 'interval') then
    raise exception 'standing_payload_invalid';
  end if;
  if exists(select 1 from jsonb_array_elements(new.payload->'scope'->'steps') scope_step
    where scope_step->>'operation' is distinct from 'investigation.run'
      or jsonb_typeof(scope_step->'input') is distinct from 'object'
      or scope_step->'input' <> '{}'::jsonb) then
    raise exception 'standing_scope_invalid';
  end if;
  if exists(select 1 from jsonb_array_elements(new.payload->'scope'->'steps') scope_step
    where scope_step->>'workId' is null
      or scope_step->>'workId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or not exists(select 1 from public.saved_product_work source
        where source.id::text=lower(scope_step->>'workId') and source.workspace_id=new.workspace_id
          and source.product_id='investigations' and source.resource_kind='investigation')) then
    raise exception 'standing_scope_workspace_invalid';
  end if;
  if new.payload->'trigger'->>'kind' = 'interval' then
    if new.next_trigger_at is null or new.payload->'trigger'->>'nextAt' is null
      or new.payload->'trigger'->>'everySeconds' !~ '^[0-9]+$'
      or (new.payload->'trigger'->>'everySeconds')::integer not between 60 and 31536000 then raise exception 'standing_trigger_invalid'; end if;
    begin perform (new.payload->'trigger'->>'nextAt')::timestamptz; exception when others then raise exception 'standing_trigger_invalid'; end;
  elsif new.next_trigger_at is not null then
    raise exception 'standing_trigger_invalid';
  end if;
  if new.status = 'active' and (new.payload->>'approvedBy' is null or new.payload->>'approvedAt' is null) then raise exception 'standing_approval_required'; end if;
  if new.status = 'proposed' and (new.payload->>'approvedBy' is not null or new.payload->>'approvedAt' is not null) then raise exception 'standing_payload_invalid'; end if;
  if tg_op = 'INSERT' then
    -- The service-role client may insert only an unapproved proposal. All
    -- later status/version changes go through the guarded update RPC.
    if new.version <> 1 or new.revision <> 0 or new.status <> 'proposed'
      or jsonb_typeof(new.payload->'history') is distinct from 'array'
      or jsonb_array_length(new.payload->'history') <> 0
      or new.payload->>'approvedBy' is not null
      or new.payload->>'approvedAt' is not null then
      raise exception 'standing_payload_invalid';
    end if;
    if not exists(
      select 1 from public.users owner
      join public.workspace_memberships membership on membership.user_id=owner.id
        and membership.workspace_id=new.workspace_id and membership.role in ('owner','admin')
      where owner.id=new.owner_id and owner.verified_at is not null
    ) then
      raise exception 'standing_workspace_denied';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if old.workspace_id is distinct from new.workspace_id or old.owner_id is distinct from new.owner_id then raise exception 'standing_payload_immutable'; end if;
    if old.version = new.version then
      -- The scheduler cursor may move without changing the approved scope.
      if ((old.payload #- array['trigger', 'nextAt']::text[]) - array['revision', 'updatedAt', 'history', 'status', 'approvedBy', 'approvedAt']::text[])
        is distinct from ((new.payload #- array['trigger', 'nextAt']::text[]) - array['revision', 'updatedAt', 'history', 'status', 'approvedBy', 'approvedAt']::text[]) then
        raise exception 'standing_scope_immutable';
      end if;
      if (old.status = 'proposed' and new.status not in ('proposed', 'active'))
        or (old.status = 'active' and new.status not in ('active', 'paused', 'revoked'))
        or (old.status = 'paused' and new.status not in ('paused', 'active', 'revoked')) then
        raise exception 'standing_version_conflict';
      end if;
    elsif new.version <> old.version + 1 or old.status not in ('proposed', 'paused') or new.status <> 'proposed'
      or new.payload->>'approvedBy' is not null or new.payload->>'approvedAt' is not null then
      raise exception 'standing_version_conflict';
    end if;
    if old.status = 'revoked' and new.status <> 'revoked' then raise exception 'standing_revoked'; end if;
    if old.status = 'completed' then raise exception 'standing_payload_immutable'; end if;
  end if;
  return new;
end;
$$;
create trigger standing_responsibilities_guard_trg
  before insert or update on public.standing_responsibilities
  for each row execute function public.guard_standing_responsibility_policy();

create or replace function public.guard_standing_responsibility_job() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not exists(select 1 from public.standing_responsibilities policy
      where policy.id = new.standing_responsibility_id and policy.workspace_id = new.workspace_id
        and policy.version = new.policy_version and policy.status = 'active'
        and policy.payload->>'approvedAt' is not null) then
      raise exception 'standing_job_invalid';
    end if;
    if new.status <> 'accepted' then raise exception 'standing_job_invalid'; end if;
  elsif not exists(select 1 from public.standing_responsibilities policy
    where policy.id = new.standing_responsibility_id and policy.workspace_id = new.workspace_id) then
    raise exception 'standing_job_invalid';
  end if;
  if tg_op = 'UPDATE' then
    if old.standing_responsibility_id is distinct from new.standing_responsibility_id
      or old.workspace_id is distinct from new.workspace_id
      or old.finite_work_id is distinct from new.finite_work_id
      or old.trigger_key is distinct from new.trigger_key
      or old.policy_version is distinct from new.policy_version
      or old.accepted_at is distinct from new.accepted_at then
      raise exception 'standing_job_immutable';
    end if;
    if old.status = 'cancelled' and new.status <> 'cancelled' then raise exception 'standing_job_invalid_transition'; end if;
    if old.status = 'accepted' and new.status not in ('accepted', 'cancelled') then raise exception 'standing_job_invalid_transition'; end if;
  end if;
  return new;
end;
$$;
create trigger standing_responsibility_jobs_guard_trg
  before insert or update on public.standing_responsibility_jobs
  for each row execute function public.guard_standing_responsibility_job();

create or replace function public.guard_standing_responsibility_run() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists(select 1 from public.standing_responsibility_jobs job
    where job.id = new.job_id and job.standing_responsibility_id = new.standing_responsibility_id
      and job.workspace_id = new.workspace_id and job.finite_work_id = new.finite_work_id
      and job.trigger_key = new.trigger_key and job.policy_version = new.policy_version
      and (tg_op = 'UPDATE' or job.status = 'accepted')) then
    raise exception 'standing_run_invalid_transition';
  end if;
  if tg_op = 'UPDATE' then
    if old.standing_responsibility_id is distinct from new.standing_responsibility_id
      or old.job_id is distinct from new.job_id
      or old.workspace_id is distinct from new.workspace_id
      or old.finite_work_id is distinct from new.finite_work_id
      or old.trigger_key is distinct from new.trigger_key
      or old.policy_version is distinct from new.policy_version
      or (old.status in ('completed', 'cancelled') and new.status <> old.status) then
      raise exception 'standing_run_invalid_transition';
    end if;
  end if;
  return new;
end;
$$;
create trigger standing_responsibility_runs_guard_trg
  before insert or update on public.standing_responsibility_runs
  for each row execute function public.guard_standing_responsibility_run();

create or replace function public.guard_standing_responsibility_receipt() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (
    old.run_id is distinct from new.run_id or old.step_id is distinct from new.step_id
    or old.attempt is distinct from new.attempt or old.effect is distinct from new.effect
    or old.status is distinct from new.status or old.result is distinct from new.result
    or old.reason is distinct from new.reason or old.finished_at is distinct from new.finished_at
    or old.created_at is distinct from new.created_at
  ) then raise exception 'standing_receipt_immutable'; end if;
  return new;
end;
$$;
create trigger standing_responsibility_receipts_guard_trg
  before update on public.standing_responsibility_receipts
  for each row execute function public.guard_standing_responsibility_receipt();

create or replace function public.update_standing_responsibility(
  p_standing_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_revision integer, p_payload jsonb
) returns setof public.standing_responsibilities
language plpgsql security definer set search_path = public, pg_temp as $$
declare existing public.standing_responsibilities%rowtype; next_event jsonb;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'standing_identity_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id
    and role in ('owner', 'admin') for share;
  if not found then raise exception 'standing_workspace_denied'; end if;
  select * into existing from public.standing_responsibilities where id=p_standing_id and workspace_id=p_workspace_id for update;
  if not found or existing.owner_id is distinct from p_user_id then raise exception 'standing_workspace_denied'; end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 2147483647 then raise exception 'standing_payload_invalid'; end if;
  if existing.revision is distinct from p_expected_revision then raise exception 'standing_revision_conflict'; end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload->>'revision' is distinct from (p_expected_revision + 1)::text
    or p_payload->>'ownerId' is distinct from existing.owner_id::text
    or octet_length(p_payload::text) > 1048576 then raise exception 'standing_payload_invalid'; end if;
  if jsonb_typeof(p_payload->'history') is distinct from 'array' then raise exception 'standing_payload_invalid'; end if;
  if jsonb_array_length(p_payload->'history') is distinct from jsonb_array_length(existing.payload->'history') + 1 then raise exception 'standing_payload_invalid'; end if;
  if ((p_payload->'history') - (jsonb_array_length(p_payload->'history') - 1)) is distinct from existing.payload->'history' then raise exception 'standing_payload_invalid'; end if;
  next_event := p_payload->'history'->(jsonb_array_length(p_payload->'history') - 1);
  if next_event is null or jsonb_typeof(next_event) is distinct from 'object'
    or next_event->>'actorId' is distinct from p_user_id::text
    or next_event->>'revision' is distinct from (p_expected_revision + 1)::text
    or coalesce(next_event->>'kind', '') not in ('approve', 'pause', 'resume', 'revoke', 'update')
    or next_event->>'at' is null then raise exception 'standing_payload_invalid'; end if;
  begin
    perform (p_payload->>'updatedAt')::timestamptz;
    perform (next_event->>'at')::timestamptz;
    if p_payload->>'approvedAt' is not null then perform (p_payload->>'approvedAt')::timestamptz; end if;
    if p_payload->'trigger'->>'nextAt' is not null then perform (p_payload->'trigger'->>'nextAt')::timestamptz; end if;
  exception when others then raise exception 'standing_payload_invalid'; end;
  return query update public.standing_responsibilities set
    version=(p_payload->>'version')::integer,
    revision=(p_payload->>'revision')::integer,
    status=p_payload->>'status',
    payload=p_payload,
    next_trigger_at=case when p_payload->'trigger'->>'kind'='interval' then (p_payload->'trigger'->>'nextAt')::timestamptz else null end,
    updated_at=clock_timestamp()
    where id=p_standing_id returning *;
end;
$$;

create or replace function public.admit_standing_responsibility(
  p_standing_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text,
  p_expected_version integer, p_trigger_key text, p_payload jsonb, p_next_trigger_at timestamptz
) returns table(job public.standing_responsibility_jobs, run public.standing_responsibility_runs, replayed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare policy public.standing_responsibilities%rowtype; existing_job public.standing_responsibility_jobs%rowtype; existing_run public.standing_responsibility_runs%rowtype;
  finite public.saved_product_work%rowtype; max_concurrent integer; max_runs integer; every_seconds integer;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'standing_identity_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id
    and role in ('owner', 'admin') for share;
  if not found then raise exception 'standing_workspace_denied'; end if;
  if p_trigger_key is null or p_trigger_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:/-]*$' or char_length(p_trigger_key)>256 then raise exception 'standing_trigger_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended('standing-responsibility:' || p_standing_id::text, 13));
  select * into policy from public.standing_responsibilities where id=p_standing_id and workspace_id=p_workspace_id for update;
  if not found or policy.owner_id is distinct from p_user_id then raise exception 'standing_workspace_denied'; end if;
  select * into existing_job from public.standing_responsibility_jobs where standing_responsibility_id=p_standing_id and trigger_key=p_trigger_key for update;
  if found then
    select * into existing_run from public.standing_responsibility_runs where job_id=existing_job.id for update;
    select * into finite from public.saved_product_work where id=existing_job.finite_work_id and workspace_id=p_workspace_id;
    -- A replay returns the already accepted finite job even after the policy
    -- was paused, revoked, or superseded. It never creates a new execution.
    job := existing_job; run := existing_run; replayed := true; return next; return;
  end if;
  if policy.status <> 'active' or policy.payload->>'approvedAt' is null then raise exception 'standing_admission_blocked'; end if;
  if policy.version is distinct from p_expected_version then raise exception 'standing_version_conflict'; end if;
  if policy.payload->'trigger'->>'kind'='interval' then
    if policy.next_trigger_at is null or policy.next_trigger_at > clock_timestamp() then raise exception 'standing_trigger_conflict'; end if;
    every_seconds := (policy.payload->'trigger'->>'everySeconds')::integer;
    if p_next_trigger_at is null or p_next_trigger_at <> policy.next_trigger_at + every_seconds * interval '1 second' then raise exception 'standing_trigger_conflict'; end if;
  elsif p_next_trigger_at is not null then raise exception 'standing_trigger_invalid'; end if;
  max_concurrent := (policy.payload->'limits'->>'maxConcurrentJobs')::integer;
  if (select count(*) from public.standing_responsibility_runs where standing_responsibility_id=p_standing_id and status in ('admitted','running','waiting','needs_attention')) >= max_concurrent then raise exception 'standing_limit_reached'; end if;
  if policy.payload->'limits'->>'maxRuns' is not null then
    max_runs := (policy.payload->'limits'->>'maxRuns')::integer;
    if (select count(*) from public.standing_responsibility_jobs where standing_responsibility_id=p_standing_id) >= max_runs then raise exception 'standing_limit_reached'; end if;
  end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or p_payload->>'version' is distinct from '1'
    or p_payload->>'revision' is distinct from '1'
    or p_payload->>'ownerId' is distinct from policy.owner_id::text
    or p_payload->>'status' is distinct from 'ready'
    or p_payload->>'title' is distinct from policy.payload->>'title'
    or p_payload->>'intent' is distinct from policy.payload->>'intent' then
    raise exception 'standing_payload_invalid';
  end if;
  if p_payload->>'approvedBy' is distinct from policy.owner_id::text
    or jsonb_typeof(p_payload->'approvedAt') is distinct from 'string'
    or jsonb_typeof(p_payload->'steps') is distinct from 'array'
    or jsonb_typeof(p_payload->'history') is distinct from 'array' then
    raise exception 'standing_payload_invalid';
  end if;
  if jsonb_array_length(p_payload->'steps') is distinct from jsonb_array_length(policy.payload->'scope'->'steps')
    or jsonb_array_length(p_payload->'history') is distinct from 1 then raise exception 'standing_payload_invalid'; end if;
  if (p_payload->'history'->0)->>'revision' is distinct from '1'
    or (p_payload->'history'->0)->>'kind' is distinct from 'approve'
    or (p_payload->'history'->0)->>'actorId' is distinct from policy.owner_id::text
    or (p_payload->'history'->0)->>'at' is null then raise exception 'standing_payload_invalid'; end if;
  if exists(select 1 from jsonb_array_elements(policy.payload->'scope'->'steps') scope_step
    where case when scope_step->>'maximumCents' ~ '^[0-9]+$' then (scope_step->>'maximumCents')::integer > 0 else true end) then
    raise exception 'standing_admission_budget_required';
  end if;
  if exists(select 1 from jsonb_array_elements(policy.payload->'scope'->'steps') scope_step
    where scope_step->>'operation' is distinct from 'investigation.run') then
    raise exception 'standing_scope_invalid';
  end if;
  if exists(select 1 from jsonb_array_elements(policy.payload->'scope'->'steps') scope_step
    where scope_step->>'workId' is null
      or scope_step->>'workId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or not exists(select 1 from public.saved_product_work source
        where source.id::text=lower(scope_step->>'workId') and source.workspace_id=policy.workspace_id
          and source.product_id='investigations' and source.resource_kind='investigation')) then
    raise exception 'standing_scope_workspace_invalid';
  end if;
  if (select jsonb_agg(jsonb_build_object('id',value->'id','operation',value->'operation','workId',value->'workId',
        'input',case when value->>'operation'='investigation.run' then coalesce(value->'input','{}'::jsonb) - array['expectedRevision','requestId']::text[] else value->'input' end,
        'dependsOn',value->'dependsOn','maximumCents',value->'maximumCents','capabilityVersion',value->'capabilityVersion','expectedUpdatedAt',value->'expectedUpdatedAt') order by ordinality) from jsonb_array_elements(p_payload->'steps') with ordinality as supplied(value,ordinality))
     is distinct from
     (select jsonb_agg(jsonb_build_object('id',value->'id','operation',value->'operation','workId',value->'workId',
        'input',case when value->>'operation'='investigation.run' then coalesce(value->'input','{}'::jsonb) - array['expectedRevision','requestId']::text[] else value->'input' end,
        'dependsOn',value->'dependsOn','maximumCents',value->'maximumCents','capabilityVersion',value->'capabilityVersion','expectedUpdatedAt',value->'expectedUpdatedAt') order by ordinality)
      from jsonb_array_elements(policy.payload->'scope'->'steps') with ordinality as scoped(value,ordinality)) then raise exception 'standing_scope_conflict'; end if;
  begin perform (p_payload->>'approvedAt')::timestamptz; exception when others then raise exception 'standing_payload_invalid'; end;
  insert into public.saved_product_work(workspace_id, product_id, resource_kind, title, payload, created_by)
    values (p_workspace_id, 'operations', 'responsibility', p_payload->>'title', p_payload, policy.owner_id)
    returning * into finite;
  insert into public.standing_responsibility_jobs(standing_responsibility_id, workspace_id, finite_work_id, trigger_key, policy_version, status)
    values (p_standing_id, p_workspace_id, finite.id, p_trigger_key, policy.version, 'accepted') returning * into existing_job;
  insert into public.standing_responsibility_runs(standing_responsibility_id, job_id, workspace_id, finite_work_id, trigger_key, policy_version, status)
    values (p_standing_id, existing_job.id, p_workspace_id, finite.id, p_trigger_key, policy.version, 'admitted') returning * into existing_run;
  if p_next_trigger_at is not null then
    update public.standing_responsibilities set next_trigger_at=p_next_trigger_at where id=p_standing_id;
  end if;
  job := existing_job; run := existing_run; replayed := false; return next;
end;
$$;

create or replace function public.record_standing_responsibility_run(
  p_run_id uuid, p_user_id uuid, p_verified_email text, p_status text, p_attempt integer,
  p_wake_at timestamptz, p_last_error text, p_cancelled_at timestamptz, p_receipts jsonb
) returns setof public.standing_responsibility_runs
language plpgsql security definer set search_path = public, pg_temp as $$
declare current_run public.standing_responsibility_runs%rowtype; standing_policy_id uuid; receipt jsonb; receipt_attempt integer; finite_status text;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null) then raise exception 'standing_identity_denied'; end if;
  -- Run projection writes share the policy key with admission and the finite
  -- claim guard. The link is immutable, so this first read only discovers the
  -- key; the joined row lock below rechecks identity and ownership under it.
  select standing_responsibility_id into standing_policy_id
    from public.standing_responsibility_runs where id=p_run_id;
  if not found then raise exception 'standing_workspace_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'standing-responsibility:' || standing_policy_id::text, 13));
  select run.* into current_run from public.standing_responsibility_runs run
    join public.workspace_memberships membership on membership.workspace_id=run.workspace_id and membership.user_id=p_user_id
      and membership.role in ('owner', 'admin')
    join public.standing_responsibilities policy on policy.id=run.standing_responsibility_id and policy.owner_id=p_user_id
    where run.id=p_run_id for update;
  if not found then raise exception 'standing_workspace_denied'; end if;
  select payload->>'status' into finite_status from public.saved_product_work
    where id=current_run.finite_work_id and workspace_id=current_run.workspace_id
      and product_id='operations' and resource_kind='responsibility';
  if finite_status is null then raise exception 'standing_run_invalid'; end if;
  if coalesce(p_status, '') not in ('admitted','running','waiting','needs_attention','completed','failed','cancelled')
    or p_attempt is null or p_attempt < current_run.attempt or p_attempt > current_run.attempt + 1
    or p_last_error is not null and char_length(p_last_error)>2000
    or (p_status = 'waiting' and (p_wake_at is null or p_wake_at <= clock_timestamp())) then raise exception 'standing_run_invalid'; end if;
  if p_receipts is null or jsonb_typeof(p_receipts) is distinct from 'array' then raise exception 'standing_run_invalid'; end if;
  if jsonb_array_length(p_receipts)>60 then raise exception 'standing_run_invalid'; end if;
  if (p_status = 'admitted' and finite_status not in ('ready', 'proposed'))
    or (p_status = 'running' and finite_status <> 'running')
    or (p_status = 'waiting' and finite_status <> 'waiting')
    or (p_status = 'needs_attention' and finite_status <> 'needs_attention')
    or (p_status = 'completed' and finite_status <> 'completed')
    or (p_status = 'cancelled' and finite_status <> 'cancelled')
    or (p_status = 'failed' and finite_status not in ('ready', 'needs_attention', 'paused')) then
    raise exception 'standing_run_invalid';
  end if;
  for receipt in select value from jsonb_array_elements(p_receipts) loop
    if jsonb_typeof(receipt) is distinct from 'object' then raise exception 'standing_receipt_invalid'; end if;
    if receipt->>'stepId' is null or receipt->>'stepId' !~ '^[a-z][a-z0-9_-]{0,39}$'
      or receipt->>'attempt' is null or receipt->>'attempt' !~ '^[0-9]+$'
      or coalesce(receipt->>'status', '') not in ('running','waiting','completed','accepted','failed','unknown')
      or coalesce(receipt->>'effect', '') not in ('none','accepted','unknown')
      or receipt->>'reason' is not null and char_length(receipt->>'reason') > 2000 then raise exception 'standing_receipt_invalid'; end if;
    begin receipt_attempt := (receipt->>'attempt')::integer; exception when others then raise exception 'standing_receipt_invalid'; end;
    if receipt_attempt <= 0 then raise exception 'standing_receipt_invalid'; end if;
    if not exists(
      select 1
      from public.saved_product_work work
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(work.payload->'steps') = 'array' then work.payload->'steps' else '[]'::jsonb end
      ) step
      where work.id = current_run.finite_work_id and step->>'id' = receipt->>'stepId'
    ) then raise exception 'standing_receipt_invalid'; end if;
    if receipt->>'finishedAt' is not null then
      begin perform (receipt->>'finishedAt')::timestamptz; exception when others then raise exception 'standing_receipt_invalid'; end;
    end if;
    insert into public.standing_responsibility_receipts(run_id, step_id, attempt, status, effect, result, reason, finished_at)
      values(current_run.id, receipt->>'stepId', receipt_attempt, receipt->>'status', receipt->>'effect', receipt->'result', receipt->>'reason', case when receipt->>'finishedAt' is null then null else (receipt->>'finishedAt')::timestamptz end)
      on conflict (run_id, step_id, attempt) do nothing;
  end loop;
  update public.standing_responsibility_runs set status=p_status, attempt=p_attempt, wake_at=p_wake_at,
    last_error=p_last_error, cancelled_at=case when p_status='cancelled' then coalesce(p_cancelled_at, cancelled_at, clock_timestamp()) else cancelled_at end,
    updated_at=clock_timestamp() where id=current_run.id returning * into current_run;
  return next current_run;
end;
$$;

-- Existing gated workspace-work dispatch also sees due standing policies. It
-- still has the same cron declaration and background release flag.
create or replace function public.due_workspace_work(p_limit integer default 30)
returns table(id uuid, product_id text, user_id uuid, email text)
language sql security definer set search_path=public,pg_temp as $$
  select due.id, due.product_id, due.user_id, due.email from (
    select w.id,w.product_id,u.id as user_id,u.email,w.updated_at from public.saved_product_work w
      join public.users u on u.id=w.created_by and u.verified_at is not null
      join public.workspace_memberships m on m.workspace_id=w.workspace_id and m.user_id=u.id
      where (w.product_id='operations' and w.resource_kind='responsibility' and
        (w.payload->>'status'='ready' or (w.payload->>'status'='waiting' and exists(
          select 1 from jsonb_array_elements(w.payload->'steps') s where s->>'status'='waiting' and (s->>'wakeAt')::timestamptz<=now()))))
        and not exists(
          select 1
          from public.standing_responsibility_jobs linked_job
          join public.standing_responsibilities linked_policy
            on linked_policy.id=linked_job.standing_responsibility_id
          where linked_job.finite_work_id=w.id
            and (linked_job.status <> 'accepted'
              or linked_policy.status <> 'active'
              or linked_policy.version <> linked_job.policy_version)
        )
        or (w.product_id='investigations' and w.resource_kind='investigation' and w.payload->>'status'='active' and (w.payload->>'nextRunAt')::timestamptz<=now())
        or (w.product_id='product-learning' and w.resource_kind='learning' and w.payload->>'status'='active' and (w.payload->>'nextRunAt')::timestamptz<=now())

    union all
    -- A finite terminal write may have committed while its standing
    -- projection checkpoint failed. Re-dispatch the finite id so the generic
    -- runner can repair the same run without admitting another job.
    select work.id, 'operations', users.id, users.email, work.updated_at
    from public.saved_product_work work
    join public.users users on users.id=work.created_by and users.verified_at is not null
    join public.workspace_memberships membership on membership.workspace_id=work.workspace_id and membership.user_id=users.id
    where work.product_id='operations' and work.resource_kind='responsibility'
      and work.payload->>'status' in ('completed','cancelled')
      and exists(
        select 1 from public.standing_responsibility_runs run
        where run.finite_work_id=work.id
          and run.status not in ('completed','cancelled'))

    union all
    select standing.id, 'operations-standing', standing.owner_id, users.email, standing.updated_at
    from public.standing_responsibilities standing
    join public.users users on users.id=standing.owner_id and users.verified_at is not null
    join public.workspace_memberships membership on membership.workspace_id=standing.workspace_id and membership.user_id=standing.owner_id
    where standing.status='active' and standing.next_trigger_at is not null and standing.next_trigger_at<=now()
  ) due
  order by due.updated_at asc limit greatest(1,least(coalesce(p_limit,30),30));
$$;

alter table public.standing_responsibilities enable row level security;
alter table public.standing_responsibility_jobs enable row level security;
alter table public.standing_responsibility_runs enable row level security;
alter table public.standing_responsibility_receipts enable row level security;
revoke all on table public.standing_responsibilities, public.standing_responsibility_jobs,
  public.standing_responsibility_runs, public.standing_responsibility_receipts
  from public, anon, authenticated, service_role;
-- The application reads these projections with the service-role client. A
-- policy proposal is the only direct write; admissions, run checkpoints,
-- receipts, cancellation, and scheduler cursor changes stay behind their
-- security-definer RPC invariants.
grant select, insert on table public.standing_responsibilities to service_role;
grant select on table public.standing_responsibility_jobs,
  public.standing_responsibility_runs, public.standing_responsibility_receipts to service_role;
revoke all on function public.guard_standing_responsibility_policy() from public, anon, authenticated;
revoke all on function public.guard_standing_responsibility_job() from public, anon, authenticated;
revoke all on function public.guard_standing_responsibility_run() from public, anon, authenticated;
revoke all on function public.guard_standing_responsibility_receipt() from public, anon, authenticated;
revoke all on function public.update_standing_responsibility(uuid,uuid,uuid,text,integer,jsonb) from public, anon, authenticated;
revoke all on function public.admit_standing_responsibility(uuid,uuid,uuid,text,integer,text,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.record_standing_responsibility_run(uuid,uuid,text,text,integer,timestamptz,text,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.update_standing_responsibility(uuid,uuid,uuid,text,integer,jsonb) to service_role;
grant execute on function public.admit_standing_responsibility(uuid,uuid,uuid,text,integer,text,jsonb,timestamptz) to service_role;
grant execute on function public.record_standing_responsibility_run(uuid,uuid,text,text,integer,timestamptz,text,timestamptz,jsonb) to service_role;
