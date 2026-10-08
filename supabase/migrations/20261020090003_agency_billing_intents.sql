-- Agency retail terms are accepted by the business separately from wholesale.
create table public.agency_billing_intents (
 id uuid primary key default gen_random_uuid(),
 agency_workspace_id uuid not null references public.workspaces(id) on delete restrict,
 business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
 kind text not null check(kind in ('rebill','pay_link')),
 amount_cents integer not null check(amount_cents between 1 and 100000000),
 currency text not null check(currency ~ '^[a-z]{3}$'),
 description text not null check(char_length(description) between 1 and 300),
 idempotency_key text not null check(idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'),
 terms_digest text not null,
 payer_kind text not null check(payer_kind in ('business','agency')),
 payer_workspace_id uuid not null references public.workspaces(id) on delete restrict,
 provider_attempt_started_at timestamptz,
 status text not null default 'proposed' check(status in ('proposed','accepted','declined','revoked','awaiting_payment','active','paid','cancelled')),
 proposed_by uuid not null references public.users(id) on delete restrict,
 accepted_by uuid references public.users(id) on delete restrict,
 accepted_at timestamptz,
 provider_account_id text,
 provider_object_id text,
 checkout_url text,
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(agency_workspace_id,idempotency_key)
);
alter table public.agency_billing_intents enable row level security;
revoke all on public.agency_billing_intents from public,anon,authenticated;
grant select,insert,update on public.agency_billing_intents to service_role;
create unique index agency_rebill_accepted_once on public.agency_billing_intents(agency_workspace_id,business_workspace_id) where kind='rebill' and status in ('accepted','awaiting_payment','active');

create function public.agency_billing_intent_command(p_command jsonb,p_actor_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare a text:=p_command->>'action';i public.agency_billing_intents%rowtype;b public.accounts%rowtype;agency uuid;business uuid;actor_email text;digest text;
begin
 perform public.work_allowance_assert_identity(p_actor_id,p_verified_email);
 if a='propose' then
  if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('action','agencyWorkspaceId','businessWorkspaceId','kind','amountCents','currency','description','idempotencyKey')) then raise exception 'agency_invoice_invalid';end if;
  begin agency:=(p_command->>'agencyWorkspaceId')::uuid;business:=(p_command->>'businessWorkspaceId')::uuid;exception when others then raise exception 'agency_invoice_invalid';end;
  if p_command->>'kind' not in ('rebill','pay_link') or p_command->>'amountCents' !~ '^[0-9]+$' or (p_command->>'amountCents')::bigint not between 1 and 100000000
   or p_command->>'currency' !~ '^[a-z]{3}$' or char_length(p_command->>'description') not between 1 and 300 or p_command->>'idempotencyKey' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$' then raise exception 'agency_invoice_invalid';end if;
  perform 1 from public.workspace_memberships m join public.workspaces w on w.id=m.workspace_id and w.kind='agency'
   where m.workspace_id=agency and m.user_id=p_actor_id and m.role in ('owner','admin') for share of m;
  if not found then raise exception 'agency_invoice_denied';end if;
  select * into b from public.accounts where workspace_id=business and billing_home_kind='business' for share;
  if b.id is null or b.payer_kind<>'agency' or b.payer_workspace_id<>agency then raise exception 'agency_invoice_denied';end if;
  digest:=md5(p_command::text);
  perform pg_advisory_xact_lock(hashtextextended(agency::text||':'||(p_command->>'idempotencyKey'),901));
  select * into i from public.agency_billing_intents where agency_workspace_id=agency and idempotency_key=p_command->>'idempotencyKey' for update;
  if found then if i.terms_digest<>digest then raise exception 'agency_invoice_conflict';end if;return to_jsonb(i);end if;
  insert into public.agency_billing_intents(agency_workspace_id,business_workspace_id,kind,amount_cents,currency,description,idempotency_key,terms_digest,payer_kind,payer_workspace_id,proposed_by)
  values(agency,business,p_command->>'kind',(p_command->>'amountCents')::integer,p_command->>'currency',p_command->>'description',p_command->>'idempotencyKey',digest,'business',business,p_actor_id) returning * into i;
 else
  if exists(select 1 from jsonb_object_keys(p_command) k where k not in ('action','intentId','businessWorkspaceId')) or a not in ('accept','decline','revoke','read','prepare') then raise exception 'agency_invoice_invalid';end if;
  select * into i from public.agency_billing_intents where id=(p_command->>'intentId')::uuid for update;
  if not found then raise exception 'agency_invoice_missing';end if;
  if p_command ? 'businessWorkspaceId' and i.business_workspace_id<>(p_command->>'businessWorkspaceId')::uuid then raise exception 'agency_invoice_denied';end if;
  if a in ('accept','decline') then
   perform 1 from public.workspace_memberships where workspace_id=i.business_workspace_id and user_id=p_actor_id and role='owner' for share;
   if not found then raise exception 'agency_invoice_denied';end if;
   if a='accept' and i.status='accepted' then return to_jsonb(i);end if;
   if i.status<>'proposed' then raise exception 'agency_invoice_conflict';end if;
   -- An agency payer change can invalidate an outstanding retail proposal.
   perform 1 from public.accounts where workspace_id=i.business_workspace_id and payer_kind='agency' and payer_workspace_id=i.agency_workspace_id for share;
   if not found then raise exception 'agency_invoice_conflict';end if;
   update public.agency_billing_intents set status=case a when 'accept' then 'accepted' else 'declined' end,accepted_by=case a when 'accept' then p_actor_id end,accepted_at=case a when 'accept' then clock_timestamp() end,updated_at=clock_timestamp() where id=i.id returning * into i;
  elsif a='read' then
   if not exists(select 1 from public.workspace_memberships where workspace_id=i.business_workspace_id and user_id=p_actor_id and role='owner')
    and not exists(select 1 from public.workspace_memberships where workspace_id=i.agency_workspace_id and user_id=p_actor_id and role in ('owner','admin')) then raise exception 'agency_invoice_denied';end if;
  else
   perform 1 from public.workspace_memberships where workspace_id=i.agency_workspace_id and user_id=p_actor_id and role in ('owner','admin') for share;
   if not found then raise exception 'agency_invoice_denied';end if;
   if a='revoke' then
    if i.status not in ('proposed','revoked') then raise exception 'agency_invoice_conflict';end if;
    update public.agency_billing_intents set status='revoked',updated_at=clock_timestamp() where id=i.id returning * into i;
   else
    if i.status not in ('accepted','awaiting_payment') then raise exception 'agency_invoice_conflict';end if;
    perform 1 from public.workspace_memberships where workspace_id=i.business_workspace_id and user_id=i.accepted_by and role='owner' for share;
    if not found then raise exception 'agency_invoice_denied';end if;
    perform 1 from public.accounts where workspace_id=i.business_workspace_id and payer_kind='agency' and payer_workspace_id=i.agency_workspace_id for share;
    if not found then raise exception 'agency_invoice_conflict';end if;
    if i.provider_object_id is null and i.provider_attempt_started_at < clock_timestamp()-interval '23 hours' then raise exception 'agency_invoice_conflict';end if;
    if i.provider_attempt_started_at is null then update public.agency_billing_intents set provider_attempt_started_at=clock_timestamp() where id=i.id returning * into i;end if;
   end if;
  end if;
 end if;
 select email into actor_email from public.users where id=i.accepted_by;
 return to_jsonb(i)||jsonb_build_object('accepted_email',actor_email,'can_accept',exists(select 1 from public.workspace_memberships where workspace_id=i.business_workspace_id and user_id=p_actor_id and role='owner'),'can_manage',exists(select 1 from public.workspace_memberships where workspace_id=i.agency_workspace_id and user_id=p_actor_id and role in ('owner','admin')));
exception when unique_violation then raise exception 'agency_invoice_conflict';
end $$;
revoke all on function public.agency_billing_intent_command(jsonb,uuid,text) from public,anon,authenticated;
grant execute on function public.agency_billing_intent_command(jsonb,uuid,text) to service_role;

alter table public.agency_billing_intents add column last_provider_event_created bigint not null default 0;
create table public.agency_billing_provider_events (
 account_id text not null,event_id text not null,intent_id uuid references public.agency_billing_intents(id) on delete restrict,provider_object_id text not null,
 event_created bigint not null,event_status text not null check(event_status in ('active','paid','cancelled')),
 created_at timestamptz not null default clock_timestamp(),primary key(account_id,event_id)
);
alter table public.agency_billing_provider_events enable row level security;
revoke all on public.agency_billing_provider_events from public,anon,authenticated;
grant select,insert on public.agency_billing_provider_events to service_role;

-- Trusted provider receipt: scoped by immutable intent + account; never marks paid.
create function public.record_agency_billing_checkout(p_intent_id uuid,p_account_id text,p_object_id text,p_url text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.agency_billing_intents%rowtype;e record;
begin
 select * into i from public.agency_billing_intents where id=p_intent_id for update;
 if not found or (i.status not in ('accepted','awaiting_payment') and not (i.status in ('active','paid') and i.provider_object_id=p_object_id and i.provider_account_id=p_account_id)) then raise exception 'agency_invoice_conflict';end if;
 if p_account_id !~ '^acct_[A-Za-z0-9]+$' or p_object_id !~ '^(cs_|sub_)[A-Za-z0-9_]+$' or (p_url is not null and p_url !~ '^https://(checkout|invoice)\.stripe\.com/') then raise exception 'agency_invoice_invalid';end if;
 if i.provider_object_id is not null and (i.provider_object_id<>p_object_id or i.provider_account_id<>p_account_id) then raise exception 'agency_invoice_conflict';end if;
 update public.agency_billing_intents set status=case when status='accepted' then 'awaiting_payment' else status end,provider_account_id=p_account_id,provider_object_id=p_object_id,checkout_url=p_url,updated_at=clock_timestamp() where id=i.id returning * into i;
 update public.agency_billing_provider_events set intent_id=i.id where account_id=p_account_id and provider_object_id=p_object_id and intent_id is null;
 select * into e from public.agency_billing_provider_events where intent_id=i.id order by event_created desc,event_id desc limit 1;
 if found and e.event_created>i.last_provider_event_created then update public.agency_billing_intents set status=e.event_status,last_provider_event_created=e.event_created where id=i.id returning * into i;end if;
 return to_jsonb(i);
end $$;
revoke all on function public.record_agency_billing_checkout(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_agency_billing_checkout(uuid,text,text,text) to service_role;

create or replace function public.read_agency_billing(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 perform 1 from public.users u join public.workspace_memberships m on m.user_id=u.id
 join public.workspaces w on w.id=m.workspace_id and w.kind='agency'
 where u.id=p_user_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null
 and m.workspace_id=p_workspace_id and m.role in ('owner','admin');
 if not found then raise exception 'agency_billing_denied';end if;
 select jsonb_build_object('workspaceId',a.workspace_id,'accountId',a.id,'name',a.name,'paymentStatus',a.payment_status,
 'clients',coalesce((select jsonb_agg(jsonb_build_object('workspaceId',i.business_workspace_id,'name',w.name,
 'state',coalesce(i.client_billing_state,'none'),'paymentStatus',coalesce(i.client_payment_status,'none'),'lineState',i.line_state,
 'monthlyCents',i.amount_cents,'planKey',i.client_plan_key,'endedAt',i.ended_at,'invoices',coalesce((select jsonb_agg(to_jsonb(intent) order by intent.created_at desc) from public.agency_billing_intents intent where intent.agency_workspace_id=p_workspace_id and intent.business_workspace_id=i.business_workspace_id),'[]'::jsonb)) order by w.name)
 from public.subscriptions s join public.subscription_items i on i.subscription_id=s.id
 join public.workspaces w on w.id=i.business_workspace_id left join public.accounts b on b.workspace_id=w.id
 where s.account_id=a.id and s.plan='agency_wholesale'),'[]'::jsonb)) into result
 from public.accounts a where a.workspace_id=p_workspace_id and a.billing_home_kind='agency';
 return result;
end $$;
revoke all on function public.read_agency_billing(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_agency_billing(uuid,uuid,text) to service_role;

create function public.record_agency_billing_provider_event(p_account_id text,p_event_id text,p_object_id text,p_created bigint,p_status text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare i public.agency_billing_intents%rowtype;e public.agency_billing_provider_events%rowtype;
begin
 if p_created<0 or p_status not in ('active','paid','cancelled') then raise exception 'agency_invoice_invalid';end if;
 select * into i from public.agency_billing_intents where provider_account_id=p_account_id and provider_object_id=p_object_id for update;

 select * into e from public.agency_billing_provider_events where account_id=p_account_id and event_id=p_event_id;
 if found then
  if e.provider_object_id<>p_object_id or e.event_created<>p_created or e.event_status<>p_status then raise exception 'agency_invoice_conflict';end if;
  return jsonb_build_object('replayed',true);
 end if;
 if (i.kind='rebill' and p_status='paid') or (i.kind='pay_link' and p_status='active') then raise exception 'agency_invoice_invalid';end if;
 insert into public.agency_billing_provider_events(account_id,event_id,intent_id,provider_object_id,event_created,event_status) values(p_account_id,p_event_id,i.id,p_object_id,p_created,p_status);
 if i.id is null then return jsonb_build_object('pending',true);end if;
 if p_created>i.last_provider_event_created then
  update public.agency_billing_intents set status=p_status,last_provider_event_created=p_created,updated_at=clock_timestamp() where id=i.id;
 end if;
 return jsonb_build_object('applied',true);
end $$;
revoke all on function public.record_agency_billing_provider_event(text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.record_agency_billing_provider_event(text,text,text,bigint,text) to service_role;
