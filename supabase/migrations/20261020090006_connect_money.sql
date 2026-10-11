-- Prepared Connect state. No account, charge, rate, transfer, or provider write is activated.
create table public.connected_accounts (
 workspace_id uuid primary key references public.workspaces(id) on delete restrict,
 stripe_account_id text unique check(stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
 configurations text[] not null default '{}', dashboard text not null default 'full' check(dashboard='full'),
 profile_version text, requirements jsonb not null default '{}', capabilities jsonb not null default '{}',
 state text not null default 'pending' check(state in('pending','ready','restricted','disconnected')),
 generation bigint not null default 0, updated_at timestamptz not null default now()
);
create table public.business_payments (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete restrict,
 merchant_account_id text not null, idempotency_key text not null check(length(idempotency_key) between 8 and 200),
 purpose text not null check(purpose in('checkout','deposit','quote','agent','agency_rebill','pay_link')),
 amount_cents bigint not null check(amount_cents>0 and amount_cents<=100000000), currency text not null check(currency ~ '^[a-z]{3}$'),
 application_fee_cents bigint not null default 0 check(application_fee_cents=0), reference_id text,
 created_at timestamptz not null default now(), unique(workspace_id,idempotency_key)
);
create table public.business_payment_events (
 id uuid primary key default gen_random_uuid(), payment_id uuid not null references public.business_payments(id) on delete restrict,
 merchant_account_id text not null, provider_event_id text not null, provider_object_id text not null,
 kind text not null check(kind in('checkout_created','paid','failed','refund','dispute','dispute_won','refund_created')),
 amount_cents bigint not null check(amount_cents>=0), created_at timestamptz not null default now(),
 unique(merchant_account_id,provider_event_id)
);
create table public.connect_webhook_events (
 account_id text not null, event_id text not null, payload_hash text not null, event_type text not null,
 processed_at timestamptz not null default now(), primary key(account_id,event_id)
);
create table public.revenue_splits (
 id uuid primary key default gen_random_uuid(), business_workspace_id uuid not null references public.workspaces(id) on delete restrict,
 beneficiary_workspace_id uuid references public.workspaces(id) on delete restrict,
 beneficiary_kind text not null check(beneficiary_kind in('platform','agency','creator')),
 invoice_line_id text not null, period_start timestamptz not null, period_end timestamptz not null check(period_end>period_start),
 source_account_id text not null, source_charge_id text not null,
 basis_cents bigint not null check(basis_cents>=0), amount_cents bigint not null,
 agreement_version text, rate_reference text, rate_bps integer check(rate_bps between 0 and 10000),
 attribution_id uuid references public.workspace_providers(id) on delete restrict,
 source_revision_id uuid, installation_id uuid, maintainer_state text check(maintainer_state in('creator','takeover','tapered')),
 original_split_id uuid references public.revenue_splits(id) on delete restrict,
 event_key text not null, created_at timestamptz not null default now(),
 unique(source_account_id,invoice_line_id,beneficiary_kind,event_key),
 check((beneficiary_kind='platform')=(beneficiary_workspace_id is null)),
 check(original_split_id is not null or amount_cents>=0),
 check(rate_bps is not null or amount_cents=0), check(amount_cents=0 or (agreement_version is not null and rate_reference is not null))
);
create table public.split_payouts (
 id uuid primary key default gen_random_uuid(), split_id uuid not null references public.revenue_splits(id) on delete restrict,
 recipient_account_id text not null, source_account_id text not null, source_transaction text not null,
 amount_cents bigint not null check(amount_cents>0), currency text not null,
 mode text not null default 'dry_run' check(mode='dry_run'), agreement_version text not null,
 created_at timestamptz not null default now(), unique(split_id)
);
create function public.money_immutable_guard() returns trigger language plpgsql as $$ begin raise exception 'money_immutable'; end; $$;
DO $$ declare t text; begin foreach t in array array['business_payments','business_payment_events','connect_webhook_events','revenue_splits','split_payouts'] loop
 execute format('create trigger money_immutable before update or delete on public.%I for each row execute function public.money_immutable_guard()',t);
 end loop; end $$;
DO $$ declare t text; begin foreach t in array array['connected_accounts','business_payments','business_payment_events','connect_webhook_events','revenue_splits','split_payouts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop; end $$;
create function public.connect_assert_manager(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 perform 1 from public.users u join public.workspace_memberships m on m.user_id=u.id
 where u.id=p_user_id and lower(u.email)=lower(btrim(p_verified_email)) and u.verified_at is not null
 and m.workspace_id=p_workspace_id and m.role in('owner','admin') for share of m;
 if not found then raise exception 'connect_denied'; end if;
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
end; $$;
create function public.read_connected_account(p_workspace_id uuid) returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select to_jsonb(c) from public.connected_accounts c where workspace_id=p_workspace_id;
$$;
create function public.manage_connected_account(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_action text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ declare a public.connected_accounts%rowtype; begin
 perform public.connect_assert_manager(p_workspace_id,p_user_id,p_verified_email);
 if p_action not in('read','reserve','disconnect') then raise exception 'connect_invalid'; end if;
 if p_action='reserve' then insert into public.connected_accounts(workspace_id) values(p_workspace_id) on conflict do nothing; end if;
 if p_action='disconnect' then update public.connected_accounts set state='disconnected',generation=generation+1,updated_at=now() where workspace_id=p_workspace_id; end if;
 select * into a from public.connected_accounts where workspace_id=p_workspace_id;
 return to_jsonb(a);
end; $$;
create function public.record_connected_account(p_workspace_id uuid,p_account_id text,p_configurations text[],p_profile_version text,p_capabilities jsonb,p_requirements jsonb,p_ready boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ declare a public.connected_accounts%rowtype; begin
 select * into a from public.connected_accounts where workspace_id=p_workspace_id for update;
 if not found or a.state='disconnected' then raise exception 'connect_not_reserved'; end if;
 if a.stripe_account_id is not null and a.stripe_account_id<>p_account_id then raise exception 'connect_account_mismatch'; end if;
 if not p_configurations <@ array['merchant','recipient','customer']::text[] then raise exception 'connect_invalid'; end if;
 update public.connected_accounts set stripe_account_id=p_account_id,configurations=p_configurations,profile_version=p_profile_version,
 capabilities=p_capabilities,requirements=p_requirements,state=case when p_ready then 'ready' else 'restricted' end,updated_at=now()
 where workspace_id=p_workspace_id returning * into a; return to_jsonb(a);
end; $$;
create function public.reserve_business_payment(p_workspace_id uuid,p_key text,p_purpose text,p_amount bigint,p_currency text,p_reference text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ declare a public.connected_accounts%rowtype; r public.business_payments%rowtype; begin
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
 select * into a from public.connected_accounts where workspace_id=p_workspace_id and state='ready' and 'merchant'=any(configurations) for share;
 if not found then raise exception 'connect_merchant_unavailable'; end if;
 insert into public.business_payments(workspace_id,merchant_account_id,idempotency_key,purpose,amount_cents,currency,reference_id)
 values(p_workspace_id,a.stripe_account_id,p_key,p_purpose,p_amount,p_currency,p_reference) on conflict do nothing;
 select * into r from public.business_payments where workspace_id=p_workspace_id and idempotency_key=p_key;
 if r.amount_cents<>p_amount or r.currency<>p_currency or r.purpose<>p_purpose or r.reference_id is distinct from p_reference or r.merchant_account_id<>a.stripe_account_id then raise exception 'payment_idempotency_conflict'; end if;
 return to_jsonb(r);
end; $$;
create function public.record_business_payment_event(p_account_id text,p_event_id text,p_object_id text,p_payment_id uuid,p_kind text,p_amount bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ declare r public.business_payment_events%rowtype; p public.business_payments%rowtype; begin
 select * into p from public.business_payments where id=p_payment_id for update;
 if not found or p.merchant_account_id<>p_account_id then raise exception 'payment_account_mismatch'; end if;
 if p_amount<0 or p_amount>p.amount_cents then raise exception 'payment_amount_invalid'; end if;
 select * into r from public.business_payment_events where merchant_account_id=p_account_id and provider_event_id=p_event_id;
 if found then
 if r.payment_id<>p_payment_id or r.kind<>p_kind or r.provider_object_id<>p_object_id or r.amount_cents<>p_amount then raise exception 'payment_event_conflict'; end if;
 return to_jsonb(r); end if;
 if p_kind in('refund','refund_created') and p_amount+coalesce((select sum(amount_cents) from public.business_payment_events where payment_id=p_payment_id and kind='refund'),0)>p.amount_cents then raise exception 'payment_refund_overdraw'; end if;
 insert into public.business_payment_events(payment_id,merchant_account_id,provider_event_id,provider_object_id,kind,amount_cents)
 values(p_payment_id,p_account_id,p_event_id,p_object_id,p_kind,p_amount) returning * into r; return to_jsonb(r);
end; $$;
create function public.read_business_money(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 perform public.connect_assert_manager(p_workspace_id,p_user_id,p_verified_email);
 return jsonb_build_object('account',(select to_jsonb(c)-'requirements' from public.connected_accounts c where c.workspace_id=p_workspace_id),
 'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at,p.id) from public.business_payments p where p.workspace_id=p_workspace_id),'[]'),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id) from public.business_payment_events e join public.business_payments p on p.id=e.payment_id where p.workspace_id=p_workspace_id),'[]'),
 'splits',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at,s.id) from public.revenue_splits s where s.business_workspace_id=p_workspace_id),'[]'),
 'payouts',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at,o.id) from public.split_payouts o join public.revenue_splits s on s.id=o.split_id where s.business_workspace_id=p_workspace_id),'[]'));
end; $$;
DO $$ declare f record; begin for f in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('connect_assert_manager','read_connected_account','manage_connected_account','record_connected_account','reserve_business_payment','record_business_payment_event','read_business_money') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.name); execute format('grant execute on function %s to service_role',f.name); end loop; end $$;
