-- C5: one durable subscription checkout per business. Provider uncertainty
-- retains the attempt and its immutable request; it never licenses a new key.
begin;
set local lock_timeout = '3s';

create table public.workspace_subscription_checkouts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  payer_user_id uuid not null references public.users(id) on delete restrict,
  checkout jsonb not null check (jsonb_typeof(checkout)='object' and octet_length(checkout::text)<8000),
  state text not null default 'pending' check (state in ('pending','open','complete','closed')),
  stripe_session_id text unique check (stripe_session_id is null or stripe_session_id ~ '^cs_[A-Za-z0-9_]+$'),
  stripe_customer_id text check (stripe_customer_id is null or stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  stripe_subscription_id text check (stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  created_at timestamptz not null default clock_timestamp(),
  observed_at timestamptz,
  check (state='pending' or stripe_session_id is not null)
);
create unique index workspace_subscription_checkout_pending_once on public.workspace_subscription_checkouts(workspace_id) where state<>'closed';
alter table public.workspace_subscription_checkouts enable row level security;
revoke all on public.workspace_subscription_checkouts from public,anon,authenticated,service_role;

-- The app uses service credentials, so ordinary owner authority must be checked
-- here too. Payer identity and durable billing are independent of launch flags.
create function public.assert_workspace_subscription_checkout(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a public.accounts%rowtype; customers jsonb; subscriptions jsonb;
begin
  perform 1 from public.users u join public.workspace_memberships m on m.user_id=u.id join public.workspaces w on w.id=m.workspace_id
    where u.id=p_user_id and u.verified_at is not null and lower(u.email)=lower(btrim(p_verified_email))
      and m.workspace_id=p_workspace_id and m.role='owner' and w.kind='customer' for share of u,m,w;
  if not found then raise exception 'workspace_checkout_denied'; end if;
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_checkout_denied'; end if;
  select * into a from public.accounts where workspace_id=p_workspace_id for share;
  if not found then raise exception 'workspace_checkout_unavailable'; end if;
  if a.payer_kind is distinct from 'business' or a.payer_workspace_id is not null
    or exists(select 1 from public.workspace_payer_transitions where workspace_id=p_workspace_id and status='accepted' and successor_kind='agency'
      and id=(select id from public.workspace_payer_transitions where workspace_id=p_workspace_id and status='accepted' order by accepted_at desc,id desc limit 1))
    or exists(select 1 from public.work_allowance_subscription_entitlements where workspace_id=p_workspace_id and (payer_kind<>'business' or payer_workspace_id is not null))
    then raise exception 'workspace_checkout_denied'; end if;
  if a.billing_type in ('custom','comped','grandfathered') or (a.billing_type='subscription' and a.payment_status is distinct from 'cancelled')
    or coalesce(a.payment_status,'none') not in ('none','cancelled')
    or exists(select 1 from public.subscriptions where account_id=a.id and coalesce(status,'unknown') not in ('canceled','cancelled','incomplete_expired'))
    or exists(select 1 from public.work_allowance_subscription_entitlements where workspace_id=p_workspace_id and status<>'cancelled')
    then raise exception 'workspace_checkout_conflict_subscription'; end if;
  select coalesce(jsonb_agg(distinct customer_id),'[]'::jsonb) into customers from (
    select a.stripe_customer_id as customer_id
    union all select stripe_customer_id from public.subscriptions where account_id=a.id
    union all select stripe_customer_id from public.work_allowance_subscription_entitlements where workspace_id=p_workspace_id
    union all select stripe_customer_id from public.workspace_subscription_checkouts where workspace_id=p_workspace_id
  ) ids where customer_id is not null;
  select coalesce(jsonb_agg(distinct subscription_id),'[]'::jsonb) into subscriptions from (
    select stripe_subscription_id as subscription_id from public.subscriptions where account_id=a.id
    union all select stripe_subscription_id from public.work_allowance_subscription_entitlements where workspace_id=p_workspace_id
    union all select stripe_subscription_id from public.workspace_subscription_checkouts where workspace_id=p_workspace_id
  ) ids where subscription_id is not null;
  if exists(select 1 from public.accounts where workspace_id is distinct from p_workspace_id and stripe_customer_id in(select jsonb_array_elements_text(customers)))
    or exists(select 1 from public.work_allowance_subscription_entitlements where workspace_id<>p_workspace_id and stripe_customer_id in(select jsonb_array_elements_text(customers)))
    or exists(select 1 from public.subscriptions where account_id<>a.id and stripe_customer_id in(select jsonb_array_elements_text(customers)))
    or exists(select 1 from public.workspace_subscription_checkouts where workspace_id<>p_workspace_id and stripe_customer_id in(select jsonb_array_elements_text(customers)))
    then raise exception 'workspace_checkout_denied'; end if;
  return jsonb_build_object('customerIds',customers,'subscriptionIds',subscriptions);
end $$;

create function public.prepare_workspace_subscription_checkout(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_checkout jsonb,p_attempt_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.workspace_subscription_checkouts%rowtype; target jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('workspace-subscription-checkout:'||p_workspace_id::text,0));
  target:=public.assert_workspace_subscription_checkout(p_workspace_id,p_user_id,p_verified_email);
  select * into r from public.workspace_subscription_checkouts where workspace_id=p_workspace_id and state<>'closed' for update;
  if found then
    if r.payer_user_id<>p_user_id then raise exception 'workspace_checkout_conflict_payer'; end if;
    if p_attempt_id is not null and r.id<>p_attempt_id then raise exception 'workspace_checkout_conflict_attempt'; end if;
  else
    if p_attempt_id is not null then raise exception 'workspace_checkout_conflict_attempt'; end if;
    if jsonb_array_length(target->'customerIds')>1 then raise exception 'workspace_checkout_unavailable'; end if;
    if p_checkout is null or jsonb_typeof(p_checkout)<>'object' or p_checkout->>'priceId' is null or p_checkout->>'priceId' !~ '^price_[A-Za-z0-9]+$'
      or p_checkout->>'allowanceConfigKey' is null or p_checkout->>'allowanceConfigKey' !~ '^[a-z0-9][a-z0-9_.-]{0,79}$'
      or p_checkout->>'returnUrl' is null or p_checkout->>'returnUrl' !~ '^https?://[^[:space:]]+$'
      or lower(p_checkout->>'payerEmail') is distinct from lower(btrim(p_verified_email)) then raise exception 'workspace_checkout_invalid'; end if;
    insert into public.workspace_subscription_checkouts(workspace_id,payer_user_id,checkout)
      values(p_workspace_id,p_user_id,p_checkout||jsonb_build_object('customerId',target#>>'{customerIds,0}')) returning * into r;
  end if;
  return target||jsonb_build_object('attempt',jsonb_build_object('id',r.id,'workspaceId',r.workspace_id,'payerUserId',r.payer_user_id,
    'createdAt',r.created_at,'state',r.state,'sessionId',r.stripe_session_id,'checkout',r.checkout));
end $$;

-- Provider acceptance is saved even if the initiating owner subsequently loses
-- authority. This records evidence only; returning a URL rechecks authority.
create function public.observe_workspace_subscription_checkout(p_attempt_id uuid,p_session_id text,p_status text,p_customer_id text,p_subscription_id text,p_close boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.workspace_subscription_checkouts%rowtype; business uuid;
begin
  select workspace_id into business from public.workspace_subscription_checkouts where id=p_attempt_id;
  if business is null then raise exception 'workspace_checkout_conflict_attempt'; end if;
  perform pg_advisory_xact_lock(hashtextextended('workspace-subscription-checkout:'||business::text,0));
  select * into r from public.workspace_subscription_checkouts where id=p_attempt_id for update;
  if p_session_id is null or p_session_id !~ '^cs_[A-Za-z0-9_]+$' or p_status is null or p_status not in ('open','complete','expired')
    or p_close is null or (p_close and p_status<>'expired')
    or (p_status='expired' and (not p_close or p_subscription_id is not null))
    or (p_customer_id is not null and p_customer_id !~ '^cus_[A-Za-z0-9]+$')
    or (p_subscription_id is not null and p_subscription_id !~ '^sub_[A-Za-z0-9]+$') then raise exception 'workspace_checkout_invalid'; end if;
  if (r.stripe_session_id is not null and r.stripe_session_id<>p_session_id)
    or (r.stripe_customer_id is not null and r.stripe_customer_id is distinct from p_customer_id)
    or (r.stripe_subscription_id is not null and r.stripe_subscription_id is distinct from p_subscription_id)
    or (r.state='complete' and p_status<>'complete') or (r.state='closed' and p_status<>'expired')
    then raise exception 'workspace_checkout_conflict_session'; end if;
  update public.workspace_subscription_checkouts set stripe_session_id=p_session_id,stripe_customer_id=p_customer_id,stripe_subscription_id=p_subscription_id,
    state=case when p_close then 'closed' else p_status end, observed_at=clock_timestamp() where id=r.id;
  return jsonb_build_object('attemptId',r.id,'recorded',true);
end $$;

revoke all on function public.assert_workspace_subscription_checkout(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.prepare_workspace_subscription_checkout(uuid,uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.observe_workspace_subscription_checkout(uuid,text,text,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.prepare_workspace_subscription_checkout(uuid,uuid,text,jsonb,uuid) to service_role;
grant execute on function public.observe_workspace_subscription_checkout(uuid,text,text,text,text,boolean) to service_role;

create schema ux_owner2_checkout_rollback;
revoke all on schema ux_owner2_checkout_rollback from public,anon,authenticated,service_role;
create table ux_owner2_checkout_rollback.functions(signature text primary key,after_hash text not null);
insert into ux_owner2_checkout_rollback.functions select signature,md5(pg_get_functiondef(signature::regprocedure)) from unnest(array[
  'public.assert_workspace_subscription_checkout(uuid,uuid,text)',
  'public.prepare_workspace_subscription_checkout(uuid,uuid,text,jsonb,uuid)',
  'public.observe_workspace_subscription_checkout(uuid,text,text,text,text,boolean)'
]) signature;
commit;
