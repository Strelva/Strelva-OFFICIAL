-- Customer-selected payer succession for future workspace jobs. Existing job
-- economics rows remain immutable and continue to own their accepted limits,
-- reservations, usage and unresolved holds.

create table public.workspace_payer_transitions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  successor_user_id uuid not null references public.users(id) on delete restrict,
  successor_email text not null check (successor_email = lower(btrim(successor_email))),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','revoked','stale')),
  proposed_by uuid not null references public.users(id) on delete restrict,
  resolved_by uuid references public.users(id) on delete restrict,
  proposed_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  accepted_at timestamptz,
  check ((status = 'pending') = (resolved_at is null and resolved_by is null)),
  check ((status = 'accepted') = (accepted_at is not null))
);

create unique index workspace_payer_transitions_one_pending_idx
  on public.workspace_payer_transitions(workspace_id) where status = 'pending';
create index workspace_payer_transitions_history_idx
  on public.workspace_payer_transitions(workspace_id, proposed_at desc);
alter table public.workspace_payer_transitions enable row level security;
revoke all on public.workspace_payer_transitions from public,anon,authenticated;
grant select on public.workspace_payer_transitions to service_role;

create function public.workspace_payer_transition_command(
  p_command jsonb,
  p_actor_id uuid,
  p_verified_email text
) returns setof public.workspace_payer_transitions
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a text := p_command->>'action';
  actor_email text := lower(btrim(p_verified_email));
  v_workspace_id uuid;
  transition_id uuid;
  successor public.users%rowtype;
  item public.workspace_payer_transitions%rowtype;
begin
  if p_command is null or jsonb_typeof(p_command) <> 'object'
    or a not in ('propose','accept','reject','revoke') then
    raise exception 'payer_transition_command_invalid';
  end if;
  -- Every payer-boundary path takes the actor row before the workspace lock.
  -- The job command uses the same order, preventing actor/advisory deadlocks.
  perform 1 from public.users where id=p_actor_id and lower(email)=actor_email and verified_at is not null for update;
  if not found then raise exception 'payer_transition_identity_denied'; end if;

  if a='propose' then
    if (select array_agg(key order by key) from jsonb_object_keys(p_command) key)
      <> array['action','successorEmail','workspaceId']::text[] then
      raise exception 'payer_transition_command_invalid';
    end if;
    begin v_workspace_id := (p_command->>'workspaceId')::uuid;
    exception when invalid_text_representation then raise exception 'payer_transition_command_invalid'; end;
    perform 1 from public.workspaces w join public.workspace_memberships m on m.workspace_id=w.id
      where w.id=v_workspace_id and w.kind='customer' and m.user_id=p_actor_id and m.role='owner' for share;
    if not found then raise exception 'payer_transition_owner_required'; end if;
    select * into successor from public.users
      where lower(email)=lower(btrim(p_command->>'successorEmail')) and verified_at is not null for share;
    if successor.id is null then raise exception 'payer_transition_successor_unavailable'; end if;
    perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 7415));
    select * into item from public.workspace_payer_transitions
      where public.workspace_payer_transitions.workspace_id=v_workspace_id and status='pending' for update;
    if found and item.successor_user_id=successor.id then return next item; return; end if;
    if found then
      update public.workspace_payer_transitions set status='stale',resolved_by=p_actor_id,resolved_at=clock_timestamp()
        where id=item.id;
    end if;
    insert into public.workspace_payer_transitions(workspace_id,successor_user_id,successor_email,proposed_by)
      values(v_workspace_id,successor.id,lower(successor.email),p_actor_id) returning * into item;
    return next item; return;
  end if;

  if (select array_agg(key order by key) from jsonb_object_keys(p_command) key)
    <> array['action','transitionId']::text[] then raise exception 'payer_transition_command_invalid'; end if;
  begin transition_id := (p_command->>'transitionId')::uuid;
  exception when invalid_text_representation then raise exception 'payer_transition_command_invalid'; end;
  select workspace_id into v_workspace_id from public.workspace_payer_transitions where id=transition_id;
  if not found then raise exception 'payer_transition_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 7415));
  select * into item from public.workspace_payer_transitions where id=transition_id for update;
  if not found then raise exception 'payer_transition_not_found'; end if;

  if a in ('accept','reject') then
    if item.successor_user_id<>p_actor_id or item.successor_email<>actor_email then
      raise exception 'payer_transition_successor_required';
    end if;
    if a='accept' and item.status='accepted' and item.resolved_by=p_actor_id then return next item; return; end if;
    if item.status<>'pending' then raise exception 'payer_transition_not_pending'; end if;
    if a='accept' then
      perform 1 from public.workspace_memberships
        where workspace_id=item.workspace_id and user_id=item.proposed_by and role='owner' for share;
      if not found then
        update public.workspace_payer_transitions set status='stale',resolved_by=p_actor_id,
          resolved_at=clock_timestamp() where id=item.id returning * into item;
        return next item; return;
      end if;
      update public.workspace_payer_transitions set status='accepted',resolved_by=p_actor_id,
        resolved_at=clock_timestamp(),accepted_at=clock_timestamp() where id=item.id returning * into item;
    else
      update public.workspace_payer_transitions set status='rejected',resolved_by=p_actor_id,
        resolved_at=clock_timestamp() where id=item.id returning * into item;
    end if;
    return next item; return;
  end if;

  perform 1 from public.workspace_memberships
    where workspace_id=item.workspace_id and user_id=p_actor_id and role='owner' for share;
  if not found then raise exception 'payer_transition_owner_required'; end if;
  if item.status='revoked' and item.resolved_by=p_actor_id then return next item; return; end if;
  if item.status<>'pending' then raise exception 'payer_transition_not_pending'; end if;
  update public.workspace_payer_transitions set status='revoked',resolved_by=p_actor_id,
    resolved_at=clock_timestamp() where id=item.id returning * into item;
  return next item;
end $$;

create function public.workspace_payer_transition_snapshot(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_verified_email text
) returns table (
  id uuid, workspace_id uuid, successor_user_id uuid, successor_email text, status text,
  proposed_by uuid, proposer_email text, resolved_by uuid, proposed_at timestamptz,
  resolved_at timestamptz, accepted_at timestamptz
) language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.users u where u.id=p_actor_id
    and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null;
  if not found then raise exception 'payer_transition_identity_denied'; end if;
  if not exists(select 1 from public.workspace_memberships m where m.workspace_id=p_workspace_id and m.user_id=p_actor_id and m.role='owner')
    and not exists(select 1 from public.workspace_payer_transitions x where x.workspace_id=p_workspace_id
      and x.successor_user_id=p_actor_id and x.successor_email=lower(btrim(p_verified_email))) then
    raise exception 'payer_transition_workspace_denied';
  end if;
  return query select t.id,t.workspace_id,t.successor_user_id,t.successor_email,t.status,
    t.proposed_by,p.email,t.resolved_by,t.proposed_at,t.resolved_at,t.accepted_at
    from public.workspace_payer_transitions t join public.users p on p.id=t.proposed_by
    where t.workspace_id=p_workspace_id and (
      exists(select 1 from public.workspace_memberships m where m.workspace_id=p_workspace_id and m.user_id=p_actor_id and m.role='owner')
      or (t.successor_user_id=p_actor_id and t.successor_email=lower(btrim(p_verified_email)))
    ) order by t.proposed_at desc;
end $$;

create function public.workspace_payer_transition_inbox(p_actor_id uuid,p_verified_email text)
returns table (
  id uuid, workspace_id uuid, workspace_name text, successor_user_id uuid,
  successor_email text, status text, proposed_by uuid, proposer_email text,
  resolved_by uuid, proposed_at timestamptz, resolved_at timestamptz, accepted_at timestamptz
) language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.users u where u.id=p_actor_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null;
  if not found then raise exception 'payer_transition_identity_denied'; end if;
  return query select t.id,t.workspace_id,w.name,t.successor_user_id,t.successor_email,t.status,
    t.proposed_by,p.email,t.resolved_by,t.proposed_at,t.resolved_at,t.accepted_at
    from public.workspace_payer_transitions t
    join public.workspaces w on w.id=t.workspace_id
    join public.users p on p.id=t.proposed_by
    where t.successor_user_id=p_actor_id and t.successor_email=lower(btrim(p_verified_email))
    order by t.proposed_at desc;
end $$;

-- Serialize new workspace-budget creation with payer acceptance. Existing
-- active targets retain their stored payer; only a truly new target resolves
-- the latest accepted successor inside this same transaction.
create function public.job_economics_create_with_payer_transition(
  p_command jsonb,
  p_actor_id uuid,
  p_verified_email text
) returns setof public.job_economics
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_workspace_id uuid;
  v_work_id uuid;
  resolved_payer uuid;
  existing_job public.job_economics%rowtype;
  created_job public.job_economics%rowtype;
begin
  if p_command->>'action'<>'create' or p_command->>'workspaceId' is null then
    return query select * from public.job_economics_command(p_command,p_actor_id,p_verified_email); return;
  end if;
  begin
    v_workspace_id := (p_command->>'workspaceId')::uuid;
    v_work_id := nullif(p_command->>'workId','')::uuid;
  exception when invalid_text_representation then raise exception 'job_economics_command_invalid'; end;
  perform 1 from public.users where id=p_actor_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for update;
  if not found then raise exception 'job_economics_identity_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text, 7415));
  perform 1 from public.workspace_memberships where workspace_id=v_workspace_id and user_id=p_actor_id for share;
  if not found then raise exception 'job_economics_workspace_denied'; end if;
  if v_work_id is null and p_command->>'productId'='work_plans' then
    select * into existing_job from public.job_economics
      where public.job_economics.workspace_id=v_workspace_id and public.job_economics.work_id is null
        and product_id='work_plans' and resource_kind='plan' and status not in ('settled','cancelled')
      order by created_at desc limit 1 for update;
  elsif v_work_id is not null then
    select * into existing_job from public.job_economics
      where public.job_economics.workspace_id=v_workspace_id and public.job_economics.work_id=v_work_id
        and status not in ('settled','cancelled') order by created_at desc limit 1 for update;
  end if;
  if existing_job.id is not null then
    if existing_job.product_id<>p_command->>'productId' or existing_job.resource_kind<>p_command->>'resourceKind'
      or existing_job.estimate_cents is distinct from (p_command->>'estimateCents')::integer
      or existing_job.max_authorized_cents<>(p_command->>'maxAuthorizedCents')::integer then
      raise exception 'job_economics_existing_conflict';
    end if;
    return next existing_job;
    return;
  end if;
  if resolved_payer is null then
    select successor_user_id into resolved_payer from public.workspace_payer_transitions
      where public.workspace_payer_transitions.workspace_id=v_workspace_id and status='accepted'
      order by accepted_at desc,id desc limit 1;
  end if;
  resolved_payer := coalesce(resolved_payer,(p_command->>'payerId')::uuid);
  if exists(select 1 from public.workspace_memberships where workspace_id=v_workspace_id and user_id=resolved_payer) then
    return query select * from public.job_economics_command(
      p_command || jsonb_build_object('payerId',resolved_payer::text),p_actor_id,p_verified_email);
    return;
  end if;
  -- Reuse the native command's complete target and amount validation with the
  -- creator as its temporary payer, then replace only the unaccepted row's
  -- payer inside this transaction. No workspace access is granted to the payer.
  select * into created_job from public.job_economics_command(
    p_command || jsonb_build_object('payerId',p_actor_id::text),p_actor_id,p_verified_email);
  update public.job_economics set payer_id=resolved_payer,updated_at=clock_timestamp()
    where id=created_job.id and status='draft' and payer_id=p_actor_id returning * into created_job;
  if created_job.id is null then raise exception 'job_economics_existing_conflict'; end if;
  return next created_job;
end $$;

create function public.job_economics_command_with_payer_authority(p_command jsonb,p_actor_id uuid,p_verified_email text)
returns setof public.job_economics language plpgsql security definer set search_path=public,pg_temp as $$
declare a text:=p_command->>'action'; j public.job_economics%rowtype; jid uuid;
begin
  if a not in ('accept','cancel') then
    return query select * from public.job_economics_command(p_command,p_actor_id,p_verified_email); return;
  end if;
  if (select array_agg(key order by key) from jsonb_object_keys(p_command) key)<>array['action','jobId']::text[] then
    raise exception 'job_economics_command_invalid';
  end if;
  begin jid:=(p_command->>'jobId')::uuid; exception when invalid_text_representation then raise exception 'job_economics_command_invalid'; end;
  perform 1 from public.users where id=p_actor_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null for update;
  if not found then raise exception 'job_economics_identity_denied'; end if;
  select * into j from public.job_economics where id=jid for update;
  if not found then raise exception 'job_economics_not_found'; end if;
  if j.payer_id<>p_actor_id then
    return query select * from public.job_economics_command(p_command,p_actor_id,p_verified_email); return;
  end if;
  if a='accept' then
    if j.status='draft' then update public.job_economics set status='accepted',accepted_by=p_actor_id,
      accepted_at=clock_timestamp(),updated_at=clock_timestamp() where id=j.id returning * into j;
    elsif j.status not in ('accepted','reserved','settled') then raise exception 'job_economics_invalid_transition'; end if;
  else
    if j.status not in ('settled','cancelled') then
      update public.job_economics_executions set status='finished',effect='none',amount_cents=0,billable_cents=0,finished_at=clock_timestamp()
        where job_id=j.id and status='reserved';
      update public.job_economics set reserved_cents=used_cents+coalesce((select sum(maximum_cents)
        from public.job_economics_executions where job_id=j.id and attribution='normal'
          and (status='running' or (status='finished' and amount_cents is null))),0),status='cancelled',updated_at=clock_timestamp()
        where id=j.id returning * into j;
    end if;
  end if;
  return next j;
end $$;

create function public.job_economics_payer_inbox(p_actor_id uuid,p_verified_email text)
returns table(id uuid,workspace_id uuid,workspace_name text,product_id text,resource_kind text,
  estimate_cents integer,max_authorized_cents integer,reserved_cents integer,used_cents integer,
  actual_cents integer,actual_known boolean,status text,created_at timestamptz)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.users u where u.id=p_actor_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null;
  if not found then raise exception 'job_economics_identity_denied'; end if;
  return query select j.id,j.workspace_id,w.name,j.product_id,j.resource_kind,j.estimate_cents,
    j.max_authorized_cents,j.reserved_cents,j.used_cents,j.actual_cents,j.actual_known,j.status,j.created_at
    from public.job_economics j join public.workspaces w on w.id=j.workspace_id
    where j.payer_id=p_actor_id order by j.created_at desc;
end $$;

create or replace function public.get_job_economics(p_job_id uuid,p_actor_id uuid,p_verified_email text)
returns setof public.job_economics language plpgsql security definer set search_path=public,pg_temp as $$
declare j public.job_economics%rowtype;
begin
  perform 1 from public.users where id=p_actor_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'job_economics_identity_denied'; end if;
  select * into j from public.job_economics where id=p_job_id;
  if not found then return; end if;
  if j.payer_id<>p_actor_id and j.workspace_id is not null
    and not exists(select 1 from public.workspace_memberships where workspace_id=j.workspace_id and user_id=p_actor_id)
    and not exists(select 1 from public.workspace_delegations d join public.workspace_memberships m on m.workspace_id=d.agency_workspace_id
      where d.customer_workspace_id=j.workspace_id and d.customer_work_id=j.work_id and d.scope=array['work:read']::text[]
        and d.status='active' and m.user_id=p_actor_id) then raise exception 'job_economics_workspace_denied'; end if;
  return next j;
end $$;

-- Runtime actors remain workspace members, while an exact payer-only account
-- authorizes the durable job receipt without receiving saved-work access.
create or replace function public.job_economics_execution_command(p_command jsonb,p_actor_id uuid,p_verified_email text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  j public.job_economics%rowtype;
  e public.job_economics_executions%rowtype;
  a text := p_command->>'action';
  k text := p_command->>'executionKey';
  amount integer;
  maximum integer;
  billable integer;
  retained integer;
  charge integer;
  retry_cost integer;
  previous_billable integer;
  previous_retry integer;
  v_effect text := p_command->>'effect';
begin
  if p_command is null or jsonb_typeof(p_command)<>'object' or a is null or a not in ('claim','start','finish','reconcile')
    or k is null or k !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$' then raise exception 'job_economics_command_invalid'; end if;
  if exists(select 1 from jsonb_object_keys(p_command) x where x not in
    ('action','jobId','executionKey','maximumCents','kind','attribution','amountCents','effect','evidenceReference')) then
    raise exception 'job_economics_command_invalid'; end if;
  perform 1 from public.users where id=p_actor_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null;
  if not found then raise exception 'job_economics_identity_denied'; end if;
  -- All admission, settlement, cancellation, and legacy ledger commands lock this row first.
  select * into j from public.job_economics where id=(p_command->>'jobId')::uuid for update;
  if not found then raise exception 'job_economics_not_found'; end if;
  select * into e from public.job_economics_executions where job_id=j.id and execution_key=k for update;
  -- A launched action can record its result after access revocation or cancellation.
  -- It can never launch more work on that authority.
  if a='finish' then
    if e.job_id is null or e.created_by<>p_actor_id then raise exception 'job_economics_workspace_denied'; end if;
  elsif a='reconcile' then
    if e.job_id is null then raise exception 'job_economics_not_found'; end if;
    perform 1 from public.workspace_memberships where workspace_id=j.workspace_id and user_id=p_actor_id for share;
    if not found then raise exception 'job_economics_workspace_denied'; end if;
    -- Only the actor who admitted the exact execution can apply evidence to it.
    -- Product services may additionally require owner/operator authority before
    -- reaching this RPC. A different member cannot clear another actor's hold.
    if e.created_by<>p_actor_id then raise exception 'job_economics_workspace_denied'; end if;
  else
    if j.workspace_id is null then raise exception 'job_economics_target_not_found'; end if;
    perform 1 from public.workspace_memberships where workspace_id=j.workspace_id and user_id=p_actor_id for share;
    if not found then raise exception 'job_economics_workspace_denied'; end if;
    -- Payer authority is the exact accepted job receipt, not customer-data access.
    if j.accepted_by is distinct from j.payer_id or j.accepted_at is null then raise exception 'job_economics_payer_required'; end if;
  end if;
  if a='claim' then
    if p_command->>'maximumCents' is null or p_command->>'maximumCents' !~ '^[0-9]{1,7}$'
      or p_command->>'kind' is null or p_command->>'kind' not in ('provider','model','tool','human')
      or p_command->>'attribution' is null or p_command->>'attribution' not in ('normal','strelva_retry') then
      raise exception 'job_economics_command_invalid'; end if;
    maximum := (p_command->>'maximumCents')::integer;
    if maximum>1000000 then raise exception 'job_economics_command_invalid'; end if;
    if e.job_id is not null then
      if e.maximum_cents<>maximum or e.kind<>p_command->>'kind' or e.attribution<>p_command->>'attribution'
        or e.created_by<>p_actor_id then raise exception 'job_economics_idempotency_conflict'; end if;
      return jsonb_build_object('claimed',false,'execution',to_jsonb(e));
    end if;
    if j.status not in ('accepted','reserved') then raise exception 'job_economics_invalid_transition'; end if;
    if exists(select 1 from public.job_economics_reservations where job_id=j.id and idempotency_key not like 'runtime:%')
      or exists(select 1 from public.job_economics_usage where job_id=j.id and source='operator_reported') then
      raise exception 'job_economics_runtime_managed'; end if;
    if exists(select 1 from public.job_economics_executions where job_id=j.id and status in ('reserved','running')) then
      raise exception 'job_economics_concurrency_exceeded'; end if;
    charge := case when p_command->>'attribution'='normal' then maximum else 0 end;
    if charge>j.max_authorized_cents-j.reserved_cents then raise exception 'job_economics_reservation_exceeded'; end if;
    insert into public.job_economics_executions(job_id,execution_key,maximum_cents,kind,attribution,created_by)
      values(j.id,k,maximum,p_command->>'kind',p_command->>'attribution',p_actor_id) returning * into e;
    insert into public.job_economics_reservations(job_id,idempotency_key,amount_cents,command_digest,created_by)
      values(j.id,'runtime:'||k,charge,md5(concat_ws('|','runtime',k,charge)),p_actor_id);
    update public.job_economics set reserved_cents=reserved_cents+charge,status='reserved',updated_at=clock_timestamp() where id=j.id;
    return jsonb_build_object('claimed',true,'execution',to_jsonb(e));
  elsif a='start' then
    if e.job_id is null or e.created_by<>p_actor_id or e.status<>'reserved' or j.status not in ('accepted','reserved') then
      raise exception 'job_economics_invalid_transition'; end if;
    update public.job_economics_executions set status='running',started_at=clock_timestamp()
      where job_id=j.id and execution_key=k returning * into e;
  else
    if v_effect is null or v_effect not in ('accepted','none','unknown') or not (p_command ? 'amountCents') then raise exception 'job_economics_command_invalid'; end if;
    if jsonb_typeof(p_command->'amountCents')='null' then amount:=null;
    elsif jsonb_typeof(p_command->'amountCents')='number' and p_command->>'amountCents' ~ '^[0-9]{1,7}$' then amount:=(p_command->>'amountCents')::integer;
    else raise exception 'job_economics_command_invalid'; end if;
    if amount>1000000 then raise exception 'job_economics_command_invalid'; end if;
    if a='reconcile' and (v_effect='unknown' or amount is null
      or p_command->>'evidenceReference' is null
      or char_length(p_command->>'evidenceReference') not between 1 and 256) then
      raise exception 'job_economics_command_invalid'; end if;
    if a='reconcile' and (p_command->>'maximumCents' is null
      or p_command->>'maximumCents' !~ '^[0-9]{1,7}$'
      or (p_command->>'maximumCents')::integer<>e.maximum_cents
      or p_command->>'kind' is distinct from e.kind
      or p_command->>'attribution' is distinct from e.attribution) then
      raise exception 'job_economics_idempotency_conflict'; end if;
    if e.status='finished' and (a<>'reconcile' or (e.amount_cents is not null and e.effect<>'unknown')) then
      if e.effect<>v_effect or e.amount_cents is distinct from amount
        or (a='reconcile' and e.reconciliation_reference is distinct from p_command->>'evidenceReference') then raise exception 'job_economics_idempotency_conflict'; end if;
      return jsonb_build_object('claimed',false,'execution',to_jsonb(e));
    end if;
    if a='reconcile' and e.amount_cents is not null and e.amount_cents<>amount then raise exception 'job_economics_idempotency_conflict'; end if;
    if e.status='reserved' and (v_effect<>'none' or amount is distinct from 0) then raise exception 'job_economics_invalid_transition'; end if;
    billable := case when amount is null then null when e.attribution='strelva_retry' then 0 else least(amount,e.maximum_cents) end;
    retained := case when e.attribution='strelva_retry' then 0 else coalesce(billable,e.maximum_cents) end;
    charge := case when e.attribution='strelva_retry' then 0 when e.status='finished' then coalesce(e.billable_cents,e.maximum_cents) else e.maximum_cents end;
    previous_billable := coalesce(e.billable_cents,0);
    previous_retry := case when e.attribution='strelva_retry' then coalesce(e.amount_cents,0) else 0 end;
    retry_cost := case when e.attribution='strelva_retry' then coalesce(amount,0) else 0 end;
    update public.job_economics_executions set status='finished',effect=v_effect,
      amount_cents=amount,billable_cents=billable,finished_at=clock_timestamp(),
      reconciliation_reference=case when a='reconcile' then p_command->>'evidenceReference' else reconciliation_reference end
      where job_id=j.id and execution_key=k returning * into e;
    insert into public.job_economics_usage(job_id,idempotency_key,kind,attribution,amount_cents,source,command_digest,recorded_by)
      values(j.id,'runtime:'||k,e.kind,e.attribution,case when e.attribution='strelva_retry' then amount else billable end,
        'runtime_reported',md5(concat_ws('|',k,v_effect,coalesce(amount::text,'unknown'))),p_actor_id)
      on conflict (job_id,idempotency_key) do update set amount_cents=excluded.amount_cents,
        command_digest=excluded.command_digest,recorded_by=excluded.recorded_by
        where a='reconcile' and public.job_economics_usage.amount_cents is null;
    update public.job_economics set reserved_cents=reserved_cents-charge+retained,
      used_cents=used_cents+coalesce(billable,0)-previous_billable,strelva_retry_cents=strelva_retry_cents+retry_cost-previous_retry,updated_at=clock_timestamp()
      where id=j.id;
  end if;
  return jsonb_build_object('claimed',false,'execution',to_jsonb(e));
end;
$$;

revoke all on function public.workspace_payer_transition_command(jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.workspace_payer_transition_snapshot(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.workspace_payer_transition_inbox(uuid,text) from public,anon,authenticated;
revoke all on function public.job_economics_create_with_payer_transition(jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.job_economics_command_with_payer_authority(jsonb,uuid,text) from public,anon,authenticated;
revoke all on function public.job_economics_payer_inbox(uuid,text) from public,anon,authenticated;
grant execute on function public.workspace_payer_transition_command(jsonb,uuid,text) to service_role;
grant execute on function public.workspace_payer_transition_snapshot(uuid,uuid,text) to service_role;
grant execute on function public.workspace_payer_transition_inbox(uuid,text) to service_role;
grant execute on function public.job_economics_create_with_payer_transition(jsonb,uuid,text) to service_role;
grant execute on function public.job_economics_command_with_payer_authority(jsonb,uuid,text) to service_role;
grant execute on function public.job_economics_payer_inbox(uuid,text) to service_role;
