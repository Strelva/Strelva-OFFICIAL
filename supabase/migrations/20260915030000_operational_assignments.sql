-- Local-only assignment of one already approved, zero-cost finite responsibility.
-- An assignment does not create workspace membership or confer owner commands.
create table public.operational_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  work_id uuid not null references public.saved_product_work(id) on delete cascade,
  sponsor_id uuid not null references public.users(id),
  sponsor_email text not null,
  assignee_user_id uuid not null references public.users(id),
  assignee_email text not null,
  assignee_kind text not null check (assignee_kind in ('agency','staff','strelva','agent')),
  offer_key text not null check (offer_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'),
  scope jsonb not null default '["operate"]'::jsonb check (scope = '["operate"]'::jsonb),
  work_scope jsonb not null check (jsonb_typeof(work_scope) = 'object'),
  status text not null default 'offered' check (status in ('offered','accepted','revoked','expired')),
  offered_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.users(id),
  active_step_id text,
  active_lease_id text,
  active_attempt integer,
  active_actor_id uuid references public.users(id),
  active_started_at timestamptz,
  check (expires_at > offered_at),
  check ((status = 'accepted') = (accepted_at is not null) or status in ('revoked','expired')),
  check ((status = 'revoked') = (revoked_at is not null)),
  check ((active_step_id is null and active_lease_id is null and active_attempt is null and active_actor_id is null and active_started_at is null)
    or (active_step_id is not null and active_lease_id is not null and active_attempt is not null and active_attempt>0 and active_actor_id is not null and active_started_at is not null))
);
create unique index operational_assignments_offer_retry
  on public.operational_assignments(sponsor_id,work_id,offer_key);
create unique index operational_assignments_one_open_work
  on public.operational_assignments(work_id) where status in ('offered','accepted');
create index operational_assignments_assignee_open
  on public.operational_assignments(assignee_user_id, expires_at) where status in ('offered','accepted');
alter table public.operational_assignments enable row level security;
revoke all on public.operational_assignments from public, anon, authenticated;
grant all on public.operational_assignments to service_role;

create function public.operational_assignment_work_scope(p_payload jsonb) returns jsonb
language sql immutable set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'ownerId',p_payload->'ownerId',
    'approvedBy',p_payload->'approvedBy',
    'approvedAt',p_payload->'approvedAt',
    'budgetId',coalesce(p_payload->'budgetId','null'::jsonb),
    'steps',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',step->'id',
        'operation',step->'operation',
        'workId',step->'workId',
        'input',step->'input',
        'dependsOn',step->'dependsOn',
        'maximumCents',step->'maximumCents',
        'capabilityVersion',coalesce(step->'capabilityVersion','1'::jsonb),
        'expectedUpdatedAt',coalesce(step->'expectedUpdatedAt','null'::jsonb)
      ) order by ordinal)
      from jsonb_array_elements(p_payload->'steps') with ordinality items(step,ordinal)
    ),'[]'::jsonb)
  );
$$;
revoke all on function public.operational_assignment_work_scope(jsonb) from public,anon,authenticated;

create function public.offer_operational_assignment(
  p_user_id uuid,p_verified_email text,p_work_id uuid,p_assignee_email text,
  p_assignee_kind text,p_expires_at timestamptz,p_idempotency_key text
) returns setof public.operational_assignments
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.saved_product_work; assignee_id uuid; prior public.operational_assignments;
  blocking public.operational_assignments; frozen_scope jsonb;
begin
  if p_assignee_kind not in ('agency','staff','strelva','agent')
    or p_expires_at<=clock_timestamp() or p_expires_at>clock_timestamp()+interval '90 days'
    or p_idempotency_key is null or p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'
    or not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
  then raise exception 'operational_assignment_denied'; end if;
  select * into existing from public.saved_product_work where id=p_work_id;
  if not found or existing.product_id<>'operations' or existing.resource_kind<>'responsibility'
    or existing.payload->>'ownerId' is distinct from p_user_id::text
    or existing.payload->>'approvedBy' is distinct from p_user_id::text
    or existing.payload->>'approvedAt' is null
    or coalesce(existing.payload->>'status','') not in ('ready','waiting')
    or existing.payload ? 'budgetId'
    or jsonb_typeof(existing.payload->'steps') is distinct from 'array'
    or jsonb_array_length(existing.payload->'steps') not between 1 and 20
    or exists(select 1 from jsonb_array_elements(existing.payload->'steps') step
      where coalesce(step->>'maximumCents','')<>'0'
        or coalesce(step->>'capabilityVersion','1')<>'1'
        or coalesce(step->>'operation','') not in ('document.edit','tracker.command','investigation.run','schedule.command')
        or (step->>'operation'='tracker.command' and step->'input'->>'kind'='coordinate_records'))
    or exists(select 1 from public.standing_responsibility_jobs where finite_work_id=existing.id)
  then raise exception 'operational_assignment_denied'; end if;
  perform 1 from public.workspace_memberships
    where workspace_id=existing.workspace_id and user_id=p_user_id and role='owner' for share;
  if not found then raise exception 'operational_assignment_denied'; end if;
  select id into assignee_id from public.users
    where lower(email)=lower(p_assignee_email) and verified_at is not null;
  if assignee_id is null or assignee_id=p_user_id then raise exception 'operational_assignment_denied'; end if;
  perform 1 from public.workspace_memberships
    where workspace_id=existing.workspace_id and user_id=assignee_id for share;
  if not found then raise exception 'operational_assignment_denied'; end if;
  frozen_scope:=public.operational_assignment_work_scope(existing.payload);
  -- Serialize a sponsor's key even before its first row exists. Different keys
  -- can proceed independently, and the work lock below serializes one job.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_work_id::text||':'||p_idempotency_key,0));
  select * into prior from public.operational_assignments
    where sponsor_id=p_user_id and work_id=p_work_id and offer_key=p_idempotency_key
    for update;
  if prior.id is null then
    select * into blocking from public.operational_assignments
      where work_id=p_work_id and status in ('offered','accepted')
      order by offered_at desc limit 1 for update;
  end if;
  -- Every path that may lock both records takes the assignment first and the
  -- work row second. The work lock also serializes the first offer for a job.
  select * into existing from public.saved_product_work where id=p_work_id for update;
  if not found or existing.product_id<>'operations' or existing.resource_kind<>'responsibility'
    or existing.payload->>'ownerId' is distinct from p_user_id::text
    or existing.payload->>'approvedBy' is distinct from p_user_id::text
    or existing.payload->>'approvedAt' is null
    or coalesce(existing.payload->>'status','') not in ('ready','waiting')
    or existing.payload ? 'budgetId'
    or public.operational_assignment_work_scope(existing.payload) is distinct from frozen_scope
    or not exists(select 1 from public.workspace_memberships
      where workspace_id=existing.workspace_id and user_id=p_user_id and role='owner')
    or not exists(select 1 from public.workspace_memberships
      where workspace_id=existing.workspace_id and user_id=assignee_id)
  then raise exception 'operational_assignment_denied'; end if;
  -- A concurrent first offer may have committed while this transaction waited
  -- for the work row. Re-read both identities before deciding or inserting.
  select * into prior from public.operational_assignments
    where sponsor_id=p_user_id and work_id=p_work_id and offer_key=p_idempotency_key
    for update;
  if prior.id is null then
    select * into blocking from public.operational_assignments
      where work_id=p_work_id and status in ('offered','accepted')
      order by offered_at desc limit 1 for update;
  end if;
  if prior.id is not null then
    if prior.workspace_id<>existing.workspace_id or prior.work_id<>existing.id
      or prior.assignee_user_id<>assignee_id
      or prior.assignee_email<>lower(p_assignee_email) or prior.assignee_kind<>p_assignee_kind
      or prior.expires_at<>p_expires_at or prior.work_scope is distinct from frozen_scope
    then raise exception 'operational_assignment_conflict'; end if;
    return query select * from public.operational_assignments where id=prior.id;
    return;
  end if;
  if blocking.id is not null and blocking.expires_at<=clock_timestamp() then
    update public.operational_assignments set status='expired' where id=blocking.id;
  elsif blocking.id is not null then
    raise exception 'operational_assignment_conflict';
  end if;
  return query insert into public.operational_assignments(
    workspace_id,work_id,sponsor_id,sponsor_email,assignee_user_id,assignee_email,
    assignee_kind,offer_key,work_scope,expires_at
  ) values(
    existing.workspace_id,existing.id,p_user_id,lower(p_verified_email),assignee_id,
    lower(p_assignee_email),p_assignee_kind,p_idempotency_key,frozen_scope,p_expires_at
  ) returning *;
end $$;
revoke all on function public.offer_operational_assignment(uuid,text,uuid,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.offer_operational_assignment(uuid,text,uuid,text,text,timestamptz,text) to service_role;

create function public.accept_operational_assignment(
  p_user_id uuid,p_verified_email text,p_assignment_id uuid
) returns setof public.operational_assignments
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.operational_assignments; existing public.saved_product_work;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
  then raise exception 'operational_assignment_denied'; end if;
  select * into item from public.operational_assignments where id=p_assignment_id for update;
  if not found or item.assignee_user_id<>p_user_id or item.assignee_email<>lower(p_verified_email)
    or item.status not in ('offered','accepted') or item.expires_at<=clock_timestamp()
  then raise exception 'operational_assignment_denied'; end if;
  select * into existing from public.saved_product_work where id=item.work_id and workspace_id=item.workspace_id for share;
  if not found or existing.payload->>'ownerId' is distinct from item.sponsor_id::text
    or existing.payload->>'approvedBy' is distinct from item.sponsor_id::text
    or public.operational_assignment_work_scope(existing.payload) is distinct from item.work_scope
    or coalesce(existing.payload->>'status','') not in ('ready','waiting')
  then raise exception 'operational_assignment_conflict'; end if;
  perform 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=item.sponsor_id and role='owner' for share;
  if not found then raise exception 'operational_assignment_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=p_user_id for share;
  if not found then raise exception 'operational_assignment_denied'; end if;
  if item.status='accepted' then return query select * from public.operational_assignments where id=p_assignment_id; return; end if;
  return query update public.operational_assignments set status='accepted',accepted_at=clock_timestamp()
    where id=p_assignment_id returning *;
end $$;
revoke all on function public.accept_operational_assignment(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.accept_operational_assignment(uuid,text,uuid) to service_role;

create function public.revoke_operational_assignment(
  p_user_id uuid,p_verified_email text,p_assignment_id uuid
) returns setof public.operational_assignments
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.operational_assignments;
begin
  if not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
  then raise exception 'operational_assignment_denied'; end if;
  select * into item from public.operational_assignments where id=p_assignment_id for update;
  if not found then raise exception 'operational_assignment_denied'; end if;
  perform 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=p_user_id and role='owner' for share;
  if not found then raise exception 'operational_assignment_denied'; end if;
  if item.status in ('revoked','expired') then return query select * from public.operational_assignments where id=p_assignment_id; return; end if;
  return query update public.operational_assignments
    set status='revoked',revoked_at=clock_timestamp(),revoked_by=p_user_id
    where id=p_assignment_id returning *;
end $$;
revoke all on function public.revoke_operational_assignment(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.revoke_operational_assignment(uuid,text,uuid) to service_role;

create function public.read_operational_assignment_for_work(
  p_user_id uuid,p_verified_email text,p_work_id uuid
) returns setof public.operational_assignments
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.saved_product_work;
begin
  if not exists(select 1 from public.users
    where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
  then raise exception 'operational_assignment_denied'; end if;
  select * into existing from public.saved_product_work
    where id=p_work_id and product_id='operations' and resource_kind='responsibility';
  if not found or existing.payload->>'ownerId' is distinct from p_user_id::text
    or not exists(select 1 from public.workspace_memberships
      where workspace_id=existing.workspace_id and user_id=p_user_id and role='owner')
  then raise exception 'operational_assignment_denied'; end if;
  update public.operational_assignments set status='expired'
    where work_id=p_work_id and status in ('offered','accepted') and expires_at<=clock_timestamp();
  return query select item.* from public.operational_assignments item
    where item.work_id=p_work_id and item.sponsor_id=p_user_id
    order by item.offered_at desc limit 1;
end $$;
revoke all on function public.read_operational_assignment_for_work(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_operational_assignment_for_work(uuid,text,uuid) to service_role;

create function public.read_operational_assignment(
  p_user_id uuid,p_verified_email text,p_assignment_id uuid,p_access text default 'normal'
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.operational_assignments; existing public.saved_product_work; current_owner boolean;
begin
  if p_access not in ('normal','checkpoint','inspect')
    or not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
  then raise exception 'operational_assignment_denied'; end if;
  select * into item from public.operational_assignments where id=p_assignment_id;
  if not found then raise exception 'operational_assignment_denied'; end if;
  select * into existing from public.saved_product_work where id=item.work_id and workspace_id=item.workspace_id;
  if not found or existing.product_id<>'operations' or existing.resource_kind<>'responsibility'
    or public.operational_assignment_work_scope(existing.payload) is distinct from item.work_scope
  then raise exception 'operational_assignment_conflict'; end if;
  select exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=p_user_id and role='owner') into current_owner;
  if not current_owner then
    if item.assignee_user_id<>p_user_id or item.assignee_email<>lower(p_verified_email) then raise exception 'operational_assignment_denied'; end if;
    if p_access='normal' then
      if item.status<>'accepted' or item.expires_at<=clock_timestamp()
        or existing.payload->>'ownerId' is distinct from item.sponsor_id::text
        or existing.payload->>'approvedBy' is distinct from item.sponsor_id::text
        or not exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=item.sponsor_id and role='owner')
        or not exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=p_user_id)
      then raise exception 'operational_assignment_denied'; end if;
    elsif p_access='checkpoint' then
      if existing.payload->>'status' not in ('running','paused','cancelled')
        or item.active_actor_id<>p_user_id or item.active_step_id is null or item.active_lease_id is null or item.active_attempt is null
        or not exists(select 1 from jsonb_array_elements(existing.payload->'steps') step
          where step->>'id'=item.active_step_id and step->>'status'='running'
            and step->>'leaseId'=item.active_lease_id and (step->>'attempt')::integer=item.active_attempt)
      then raise exception 'operational_assignment_denied'; end if;
    elsif not exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=p_user_id)
      or not exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=item.sponsor_id and role='owner')
    then raise exception 'operational_assignment_denied';
    end if;
  end if;
  return jsonb_build_object(
    'assignment',to_jsonb(item),
    'responsibility',jsonb_build_object('id',existing.id,'workspaceId',existing.workspace_id,'payload',existing.payload)
  );
end $$;
revoke all on function public.read_operational_assignment(uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.read_operational_assignment(uuid,text,uuid,text) to service_role;

create function public.checkpoint_operational_assignment(
  p_user_id uuid,p_verified_email text,p_assignment_id uuid,p_expected_revision integer,
  p_payload jsonb,p_phase text
) returns setof public.saved_product_work
language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.operational_assignments; existing public.saved_product_work; next_event jsonb;
  prior_step jsonb; next_step jsonb; step_index integer; changed_steps integer:=0; running_index integer:=-1;
begin
  if p_phase not in ('start','outcome')
    or not exists(select 1 from public.users where id=p_user_id and lower(email)=lower(p_verified_email) and verified_at is not null)
  then raise exception 'operational_assignment_denied'; end if;
  -- Serialize claims and outcomes on the assignment before locking its work row.
  -- A shared lock here can deadlock when two checkpoints both try to promote it.
  select * into item from public.operational_assignments where id=p_assignment_id for update;
  if not found or item.assignee_user_id<>p_user_id or item.assignee_email<>lower(p_verified_email)
  then raise exception 'operational_assignment_denied'; end if;
  select * into existing from public.saved_product_work where id=item.work_id and workspace_id=item.workspace_id for update;
  if not found or existing.product_id<>'operations' or existing.resource_kind<>'responsibility'
    or public.operational_assignment_work_scope(existing.payload) is distinct from item.work_scope
  then raise exception 'operational_assignment_conflict'; end if;
  if p_phase='start' and (
    item.status<>'accepted' or item.expires_at<=clock_timestamp()
    or existing.payload->>'ownerId' is distinct from item.sponsor_id::text
    or existing.payload->>'approvedBy' is distinct from item.sponsor_id::text
    or not exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=item.sponsor_id and role='owner')
    or not exists(select 1 from public.workspace_memberships where workspace_id=item.workspace_id and user_id=p_user_id)
  ) then raise exception 'operational_assignment_denied'; end if;
  if p_expected_revision is null or p_expected_revision<0 or existing.payload->>'revision' is distinct from p_expected_revision::text
  then raise exception 'responsibility_revision_conflict'; end if;
  if p_payload is null or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text)>1048576
    or p_payload->>'version' is distinct from '1'
    or p_payload->>'revision' is distinct from (p_expected_revision+1)::text
    or public.operational_assignment_work_scope(p_payload) is distinct from item.work_scope
    or p_payload->'title' is distinct from existing.payload->'title'
    or p_payload->'intent' is distinct from existing.payload->'intent'
    or p_payload->'createdAt' is distinct from existing.payload->'createdAt'
    or coalesce(p_payload->>'status','') not in ('running','waiting','ready','needs_attention','completed','cancelled')
    or jsonb_typeof(p_payload->'history') is distinct from 'array'
    or jsonb_array_length(p_payload->'history')<>jsonb_array_length(existing.payload->'history')+1
    or jsonb_array_length(p_payload->'history')>1000
    or ((p_payload->'history')-(jsonb_array_length(p_payload->'history')-1)) is distinct from existing.payload->'history'
    or jsonb_array_length(p_payload->'steps')<>jsonb_array_length(existing.payload->'steps')
  then raise exception 'operational_assignment_conflict'; end if;
  next_event:=p_payload->'history'->(jsonb_array_length(p_payload->'history')-1);
  if next_event->>'actorId' is distinct from p_user_id::text
    or next_event->>'revision' is distinct from (p_expected_revision+1)::text
    or (p_phase='start' and next_event->>'kind'<>'started')
    or (p_phase='outcome' and next_event->>'kind'<>'outcome')
  then raise exception 'operational_assignment_denied'; end if;
  for step_index in 0..jsonb_array_length(p_payload->'steps')-1 loop
    prior_step:=existing.payload->'steps'->step_index;
    next_step:=p_payload->'steps'->step_index;
    if prior_step is distinct from next_step then
      changed_steps:=changed_steps+1;
      running_index:=step_index;
    end if;
  end loop;
  if changed_steps<>1 then raise exception 'operational_assignment_conflict'; end if;
  prior_step:=existing.payload->'steps'->running_index;
  next_step:=p_payload->'steps'->running_index;
  if p_phase='start' then
    if existing.payload->>'status' not in ('ready','waiting') or p_payload->>'status'<>'running'
      or prior_step->>'status' not in ('pending','waiting') or next_step->>'status'<>'running'
      or (next_step->>'attempt')::integer<>(prior_step->>'attempt')::integer+1
      or coalesce(next_step->>'leaseId','')='' or coalesce(next_step->>'startedAt','')=''
    then raise exception 'operational_assignment_conflict'; end if;
    update public.operational_assignments set
      active_step_id=next_step->>'id',active_lease_id=next_step->>'leaseId',
      active_attempt=(next_step->>'attempt')::integer,active_actor_id=p_user_id,
      active_started_at=(next_step->>'startedAt')::timestamptz
      where id=item.id;
  else
    if existing.payload->>'status' not in ('running','paused','cancelled') or prior_step->>'status'<>'running'
      or next_step->>'status' not in ('waiting','completed','accepted','failed','unknown')
      or next_step->>'leaseId' is distinct from prior_step->>'leaseId'
      or next_step->>'attempt' is distinct from prior_step->>'attempt'
      or item.active_step_id is distinct from prior_step->>'id'
      or item.active_lease_id is distinct from prior_step->>'leaseId'
      or item.active_attempt is distinct from (prior_step->>'attempt')::integer
      or item.active_actor_id is distinct from p_user_id
      or coalesce(next_step->>'finishedAt','')=''
    then raise exception 'operational_assignment_conflict'; end if;
    update public.operational_assignments set
      active_step_id=null,active_lease_id=null,active_attempt=null,active_actor_id=null,active_started_at=null
      where id=item.id;
  end if;
  return query update public.saved_product_work
    set payload=p_payload,title=p_payload->>'title',updated_at=clock_timestamp()
    where id=existing.id returning *;
end $$;
revoke all on function public.checkpoint_operational_assignment(uuid,text,uuid,integer,jsonb,text) from public,anon,authenticated;
grant execute on function public.checkpoint_operational_assignment(uuid,text,uuid,integer,jsonb,text) to service_role;
