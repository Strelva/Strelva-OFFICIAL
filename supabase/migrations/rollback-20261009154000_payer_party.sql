-- Rollback for 20261009154000_payer_party.sql
-- Forward SHA-256: 5348513ba96ffda0761fa75be57b998b106c137b4d71c6034052df636741391a
-- Batch 7A: reverse file order (20261009154000 first); undo every later batch first.
-- Prepared SQL only. Production execution requires a separately reviewed approval.
-- Take a verified dump first. Removed data is retained in the private archive schema.
-- Does not undo provider effects or repair Supabase migration history.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '120s';
-- Refuse a later schema or a drifted body; never cascade through unknown objects.
do $rollback_guard$
begin
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_payer_party(uuid)')))) is distinct from 'f9bbf255eaa69ee0750334653e128a82' then raise exception 'rollback_wrong_order_or_function_drift: business_payer_party'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.accounts_payer_party_stamp()')))) is distinct from '02f9efb16087c3a93ae167b576e99e6f' then raise exception 'rollback_wrong_order_or_function_drift: accounts_payer_party_stamp'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_payer_apply(uuid)')))) is distinct from '31861a765aaafa957541ec3d14dfd9e5' then raise exception 'rollback_wrong_order_or_function_drift: business_payer_apply'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.agency_billing_recipient(uuid)')))) is distinct from 'b295139690c19148ee194518b35d5957' then raise exception 'rollback_wrong_order_or_function_drift: agency_billing_recipient'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.business_billing_json(uuid)')))) is distinct from 'bdc1481d1f4041d29f50ed2e4b22c4c9' then raise exception 'rollback_wrong_order_or_function_drift: business_billing_json'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.read_business_billing(uuid,uuid,text)')))) is distinct from 'a8b0f79cba9616c0474e3736271e6366' then raise exception 'rollback_wrong_order_or_function_drift: read_business_billing'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_payer_transition_command(jsonb,uuid,text)')))) is distinct from '0cbdf022baf8aa3b3b7ec5cb885959a5' then raise exception 'rollback_wrong_order_or_function_drift: workspace_payer_transition_command'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_payer_transition_snapshot(uuid,uuid,text)')))) is distinct from 'ff4dbf4db9a4764eca6125fecdf15d8c' then raise exception 'rollback_wrong_order_or_function_drift: workspace_payer_transition_snapshot'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.workspace_payer_transition_inbox(uuid,text)')))) is distinct from '5fe81e965592efc8a0d8131b6e310067' then raise exception 'rollback_wrong_order_or_function_drift: workspace_payer_transition_inbox'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.job_economics_create_with_payer_transition(jsonb,uuid,text)')))) is distinct from '5f959305377ab6e3c705495c11487cd8' then raise exception 'rollback_wrong_order_or_function_drift: job_economics_create_with_payer_transition'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.job_economics_command_with_payer_authority(jsonb,uuid,text)')))) is distinct from '1b3419c0c94b0212279646f27e1cfea6' then raise exception 'rollback_wrong_order_or_function_drift: job_economics_command_with_payer_authority'; end if;
  if (select md5(pg_get_functiondef(to_regprocedure('public.job_economics_payer_inbox(uuid,text)')))) is distinct from '5e235f8c33efc54a5f2c5999f7729ec4' then raise exception 'rollback_wrong_order_or_function_drift: job_economics_payer_inbox'; end if;
end;
$rollback_guard$;
lock table public."accounts", public."job_economics", public."work_allowances", public."work_allowance_subscription_entitlements", public."workspace_payer_transitions" in access exclusive mode;
create schema if not exists release_rollback_archive;
revoke all on schema release_rollback_archive from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009154000_accounts" as select id, payer_kind, payer_workspace_id from public."accounts" where payer_kind <> 'business';
revoke all on release_rollback_archive."m20261009154000_accounts" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009154000_job_economics" as select id, payer_kind, payer_workspace_id from public."job_economics" where payer_kind <> 'business';
revoke all on release_rollback_archive."m20261009154000_job_economics" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009154000_work_allowances" as select id, payer_kind, payer_workspace_id from public."work_allowances" where payer_kind <> 'business';
revoke all on release_rollback_archive."m20261009154000_work_allowances" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009154000_work_allowance_subscription_entitlements" as select id, payer_kind, payer_workspace_id from public."work_allowance_subscription_entitlements" where payer_kind <> 'business';
revoke all on release_rollback_archive."m20261009154000_work_allowance_subscription_entitlements" from public, anon, authenticated, service_role;
create table release_rollback_archive."m20261009154000_workspace_payer_transitions" as select * from public."workspace_payer_transitions" where successor_kind <> 'user';
revoke all on release_rollback_archive."m20261009154000_workspace_payer_transitions" from public, anon, authenticated, service_role;
drop trigger "accounts_payer_party_stamp" on public."accounts";
CREATE OR REPLACE FUNCTION public.business_billing_json(p_workspace_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'workspaceId', a.workspace_id,
    'accountId', a.id,
    'state', a.billing_type,
    'openItem', a.billing_type = 'none',
    'paymentStatus', coalesce(a.payment_status, 'none'),
    'monthlyCents', coalesce(a.monthly_cents, 0),
    'planKey', a.plan_key,
    'grandfatheredTerms', a.grandfathered_terms,
    'paidThrough', (select to_char(s.current_period_end at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      from public.subscriptions s where s.account_id = a.id order by s.created_at limit 1),
    'payer', public.resolve_business_owner_recipient(a.workspace_id),
    'sites', coalesce((select jsonb_agg(jsonb_build_object('tenantId', i.tenant_id, 'siteName', t.site_name,
        'amountCents', coalesce(i.amount_cents, 0)) order by i.created_at, i.tenant_id)
      from public.subscriptions s join public.subscription_items i on i.subscription_id = s.id
      join public.tenants t on t.id = i.tenant_id where s.account_id = a.id), '[]'::jsonb),
    'sources', a.billing_sources,
    'paymentUpdatedAt', a.payment_updated_at)
  from public.accounts a where a.workspace_id = p_workspace_id
$function$
;
revoke all on function public.business_billing_json(uuid) from public, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.read_business_billing(p_workspace_id uuid, p_user_id uuid, p_verified_email text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id = u.id
    where u.id = p_user_id and lower(u.email) = lower(btrim(p_verified_email)) and u.verified_at is not null
      and m.workspace_id = p_workspace_id and m.role in ('owner','admin');
  if not found then raise exception 'business_billing_denied'; end if;
  return public.business_billing_json(p_workspace_id);
end;
$function$
;
revoke all on function public.read_business_billing(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.read_business_billing(uuid,uuid,text) to "service_role";
CREATE OR REPLACE FUNCTION public.workspace_payer_transition_command(p_command jsonb, p_actor_id uuid, p_verified_email text)
 RETURNS SETOF workspace_payer_transitions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;
revoke all on function public.workspace_payer_transition_command(jsonb,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.workspace_payer_transition_command(jsonb,uuid,text) to "service_role";
CREATE OR REPLACE FUNCTION public.job_economics_create_with_payer_transition(p_command jsonb, p_actor_id uuid, p_verified_email text)
 RETURNS SETOF job_economics
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;
revoke all on function public.job_economics_create_with_payer_transition(jsonb,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.job_economics_create_with_payer_transition(jsonb,uuid,text) to "service_role";
CREATE OR REPLACE FUNCTION public.job_economics_command_with_payer_authority(p_command jsonb, p_actor_id uuid, p_verified_email text)
 RETURNS SETOF job_economics
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;
revoke all on function public.job_economics_command_with_payer_authority(jsonb,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.job_economics_command_with_payer_authority(jsonb,uuid,text) to "service_role";
CREATE OR REPLACE FUNCTION public.job_economics_payer_inbox(p_actor_id uuid, p_verified_email text)
 RETURNS TABLE(id uuid, workspace_id uuid, workspace_name text, product_id text, resource_kind text, estimate_cents integer, max_authorized_cents integer, reserved_cents integer, used_cents integer, actual_cents integer, actual_known boolean, status text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  perform 1 from public.users u where u.id=p_actor_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null;
  if not found then raise exception 'job_economics_identity_denied'; end if;
  return query select j.id,j.workspace_id,w.name,j.product_id,j.resource_kind,j.estimate_cents,
    j.max_authorized_cents,j.reserved_cents,j.used_cents,j.actual_cents,j.actual_known,j.status,j.created_at
    from public.job_economics j join public.workspaces w on w.id=j.workspace_id
    where j.payer_id=p_actor_id order by j.created_at desc;
end $function$
;
revoke all on function public.job_economics_payer_inbox(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.job_economics_payer_inbox(uuid,text) to "service_role";
drop function public.workspace_payer_transition_snapshot(uuid,uuid,text);
CREATE OR REPLACE FUNCTION public.workspace_payer_transition_snapshot(p_workspace_id uuid, p_actor_id uuid, p_verified_email text)
 RETURNS TABLE(id uuid, workspace_id uuid, successor_user_id uuid, successor_email text, status text, proposed_by uuid, proposer_email text, resolved_by uuid, proposed_at timestamp with time zone, resolved_at timestamp with time zone, accepted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;
revoke all on function public.workspace_payer_transition_snapshot(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.workspace_payer_transition_snapshot(uuid,uuid,text) to "service_role";
drop function public.workspace_payer_transition_inbox(uuid,text);
CREATE OR REPLACE FUNCTION public.workspace_payer_transition_inbox(p_actor_id uuid, p_verified_email text)
 RETURNS TABLE(id uuid, workspace_id uuid, workspace_name text, successor_user_id uuid, successor_email text, status text, proposed_by uuid, proposer_email text, resolved_by uuid, proposed_at timestamp with time zone, resolved_at timestamp with time zone, accepted_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;
revoke all on function public.workspace_payer_transition_inbox(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.workspace_payer_transition_inbox(uuid,text) to "service_role";
drop function public.business_payer_apply(uuid);
drop function public.accounts_payer_party_stamp();
drop function public.agency_billing_recipient(uuid);
drop function public.business_payer_party(uuid);
-- Agency and business successors did not exist before 7A; they are archived above.
delete from public."workspace_payer_transitions" where successor_kind <> 'user';
alter table public."workspace_payer_transitions" drop constraint "workspace_payer_transitions_successor_party";
alter table public."workspace_payer_transitions" drop column "successor_workspace_id";
alter table public."workspace_payer_transitions" drop column "successor_kind";
alter table public."workspace_payer_transitions" alter column "successor_user_id" set not null;
alter table public."workspace_payer_transitions" alter column "successor_email" set not null;
alter table public."accounts" drop constraint "accounts_payer_party";
alter table public."accounts" drop column "payer_workspace_id";
alter table public."accounts" drop column "payer_kind";
alter table public."job_economics" drop constraint "job_economics_payer_party";
alter table public."job_economics" drop column "payer_workspace_id";
alter table public."job_economics" drop column "payer_kind";
alter table public."work_allowances" drop constraint "work_allowances_payer_party";
alter table public."work_allowances" drop column "payer_workspace_id";
alter table public."work_allowances" drop column "payer_kind";
alter table public."work_allowance_subscription_entitlements" drop constraint "work_allowance_subscription_entitlements_payer_party";
alter table public."work_allowance_subscription_entitlements" drop column "payer_workspace_id";
alter table public."work_allowance_subscription_entitlements" drop column "payer_kind";
commit;
