-- Agency wholesale accounts and client lines. Null amount means unpriced;
-- a converted business's legacy retail amount is never copied to wholesale.
alter table public.accounts add column billing_home_kind text not null default 'business' check(billing_home_kind in ('business','agency'));
alter table public.accounts drop constraint accounts_created_via_check;
alter table public.accounts add constraint accounts_created_via_check check(created_via is null or created_via in ('tenant_conversion','operator','agency'));
alter table public.subscription_items alter column tenant_id drop not null;
alter table public.subscription_items add column business_workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.subscription_items add column line_state text not null default 'active' check(line_state in ('active','ended'));
alter table public.subscription_items add column ended_at timestamptz;
alter table public.subscription_items add column client_billing_state text;
alter table public.subscription_items add column client_payment_status text;
alter table public.subscription_items add column client_plan_key text;
alter table public.subscription_items add constraint subscription_items_target check(tenant_id is not null or business_workspace_id is not null);
create unique index subscription_items_business_once on public.subscription_items(subscription_id,business_workspace_id) where business_workspace_id is not null;
create unique index subscriptions_agency_wholesale_once on public.subscriptions(account_id) where plan='agency_wholesale';

create or replace function public.accounts_payer_party_stamp() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare party record;
begin
 if new.workspace_id is null then new.payer_kind:='business';new.payer_workspace_id:=null;
 elsif new.billing_home_kind='agency' then new.payer_kind:='agency';new.payer_workspace_id:=new.workspace_id;
 elsif tg_op='INSERT' or new.workspace_id is distinct from old.workspace_id then
  select * into party from public.business_payer_party(new.workspace_id);
  new.payer_kind:=party.kind;new.payer_workspace_id:=party.workspace_id;
 end if;
 return new;
end $$;

create function public.agency_billing_ensure(p_agency_id uuid) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare a uuid;
begin
 perform 1 from public.workspaces where id=p_agency_id and kind='agency';
 if not found then raise exception 'agency_billing_denied'; end if;
 insert into public.accounts(workspace_id,name,billing_type,payment_status,billing_home_kind,created_via)
 select id,name,'none','none','agency','agency' from public.workspaces where id=p_agency_id
 on conflict(workspace_id) do nothing;
 select id into a from public.accounts where workspace_id=p_agency_id and billing_home_kind='agency';
 if a is null then raise exception 'agency_billing_account_conflict';end if;
 insert into public.subscriptions(account_id,plan,status,currency) values(a,'agency_wholesale','unpriced','usd')
 on conflict(account_id) where plan='agency_wholesale' do nothing;
 return a;
end $$;
revoke all on function public.agency_billing_ensure(uuid) from public,anon,authenticated,service_role;
create function public.agency_billing_on_workspace() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin if new.kind='agency' then perform public.agency_billing_ensure(new.id);end if;return new;end $$;
revoke all on function public.agency_billing_on_workspace() from public,anon,authenticated,service_role;
create trigger workspaces_agency_billing after insert on public.workspaces for each row execute function public.agency_billing_on_workspace();
select public.agency_billing_ensure(id) from public.workspaces where kind='agency';

create function public.agency_billing_sync_client(p_business_id uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.accounts%rowtype;a uuid;s uuid;
begin
 select * into b from public.accounts where workspace_id=p_business_id and billing_home_kind='business';
 update public.subscription_items i set line_state='ended',ended_at=coalesce(i.ended_at,clock_timestamp())
 from public.subscriptions sub join public.accounts home on home.id=sub.account_id and home.billing_home_kind='agency'
 where i.subscription_id=sub.id and i.business_workspace_id=p_business_id and i.line_state='active'
 and (b.id is null or b.payer_kind<>'agency' or home.workspace_id is distinct from b.payer_workspace_id);
 if b.id is not null and b.payer_kind='agency' then
  a:=public.agency_billing_ensure(b.payer_workspace_id);
  select id into s from public.subscriptions where account_id=a and plan='agency_wholesale';
  insert into public.subscription_items(subscription_id,business_workspace_id,line_state,client_billing_state,client_payment_status,client_plan_key) values(s,p_business_id,'active',b.billing_type,b.payment_status,b.plan_key)
  on conflict(subscription_id,business_workspace_id) where business_workspace_id is not null
  do update set line_state='active',ended_at=null,client_billing_state=excluded.client_billing_state,client_payment_status=excluded.client_payment_status,client_plan_key=excluded.client_plan_key;
 end if;
end $$;
revoke all on function public.agency_billing_sync_client(uuid) from public,anon,authenticated,service_role;
create function public.agency_billing_on_account() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' then
  if old.billing_home_kind='business' and old.workspace_id is not null then perform public.agency_billing_sync_client(old.workspace_id);end if;return old;
 end if;
 if new.billing_home_kind='business' and new.workspace_id is not null then perform public.agency_billing_sync_client(new.workspace_id);end if;
 if tg_op='UPDATE' and old.workspace_id is distinct from new.workspace_id and old.workspace_id is not null then perform public.agency_billing_sync_client(old.workspace_id);end if;
 return new;
end $$;
revoke all on function public.agency_billing_on_account() from public,anon,authenticated,service_role;
create trigger accounts_agency_billing after insert or update of payer_kind,payer_workspace_id,workspace_id,billing_type,payment_status,plan_key or delete on public.accounts for each row execute function public.agency_billing_on_account();
select public.agency_billing_sync_client(workspace_id) from public.accounts where billing_home_kind='business' and workspace_id is not null;

create function public.read_agency_billing(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
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
 'monthlyCents',i.amount_cents,'planKey',i.client_plan_key,'endedAt',i.ended_at) order by w.name)
 from public.subscriptions s join public.subscription_items i on i.subscription_id=s.id
 join public.workspaces w on w.id=i.business_workspace_id left join public.accounts b on b.workspace_id=w.id
 where s.account_id=a.id and s.plan='agency_wholesale'),'[]'::jsonb)) into result
 from public.accounts a where a.workspace_id=p_workspace_id and a.billing_home_kind='agency';
 return result;
end $$;
revoke all on function public.read_agency_billing(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_agency_billing(uuid,uuid,text) to service_role;
