-- Exact signed invoice provenance is frozen independently of mutable billing homes.
create table public.invoice_split_sources (
 source_account_id text not null, invoice_line_id text not null, charge_id text not null,
 business_workspace_id uuid not null references public.workspaces(id), payer_workspace_id uuid not null references public.workspaces(id),
 customer_id text not null, subscription_id text, subscription_item_id text,
 basis_cents bigint not null check(basis_cents>=0), currency text not null check(currency ~ '^[a-z]{3}$'),
 period_start timestamptz not null, period_end timestamptz not null, created_at timestamptz not null default now(),
 primary key(source_account_id,invoice_line_id),check(period_end>period_start)
);
alter table public.invoice_split_sources enable row level security;
revoke all on public.invoice_split_sources from public,anon,authenticated,service_role;
create trigger money_immutable before update or delete on public.invoice_split_sources for each row execute function public.money_immutable_guard();
create function public.record_invoice_split_source(p_account text,p_line text,p_charge text,p_business uuid,p_payer uuid,p_customer text,p_subscription text,p_item text,p_basis bigint,p_currency text,p_start timestamptz,p_end timestamptz) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$declare r public.invoice_split_sources%rowtype;begin
 perform pg_advisory_xact_lock(hashtextextended(p_account||':'||p_line,8810));
 select * into r from public.invoice_split_sources where source_account_id=p_account and invoice_line_id=p_line;
 if r.invoice_line_id is null then
 if p_charge !~ '^ch_[A-Za-z0-9]+$' or p_customer !~ '^cus_[A-Za-z0-9]+$' or not public.verify_invoice_split_source(case when p_account='platform' then p_payer else p_business end,p_account,p_customer,p_subscription) then raise exception 'invoice_payer_source_denied';end if;
 if p_account='platform' and public.resolve_invoice_business_line(p_payer,p_subscription,p_item,p_basis,p_currency) is distinct from p_business then raise exception 'invoice_payer_line_denied';end if;
 if p_account<>'platform' and p_payer<>p_business then raise exception 'invoice_payer_party_denied';end if;
 insert into public.invoice_split_sources(source_account_id,invoice_line_id,charge_id,business_workspace_id,payer_workspace_id,customer_id,subscription_id,subscription_item_id,basis_cents,currency,period_start,period_end) values(p_account,p_line,p_charge,p_business,p_payer,p_customer,p_subscription,p_item,p_basis,p_currency,p_start,p_end) returning * into r;
 end if;
 if r.charge_id<>p_charge or r.business_workspace_id<>p_business or r.payer_workspace_id<>p_payer or r.customer_id<>p_customer or r.subscription_id is distinct from p_subscription or r.subscription_item_id is distinct from p_item or r.basis_cents<>p_basis or r.currency<>p_currency or r.period_start<>p_start or r.period_end<>p_end then raise exception 'invoice_payer_source_conflict';end if;
 return to_jsonb(r);end;$$;
revoke all on function public.record_invoice_split_source(text,text,text,uuid,uuid,text,text,text,bigint,text,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.record_invoice_split_source(text,text,text,uuid,uuid,text,text,text,bigint,text,timestamptz,timestamptz) to service_role;
-- Platform collection already freezes exact owner terms and payer customer. Record
-- that same provenance before calling the common accrual function.
DO $$declare d text;begin select pg_get_functiondef('public.record_platform_collection_settlement(uuid,text,text,bigint,text,text,text)'::regprocedure) into d;
 d:=replace(d,'perform public.accrue_invoice_splits(', 'perform public.record_invoice_split_source(''platform'',c.invoice_line_id,p_charge,c.business_workspace_id,c.business_workspace_id,c.customer_id,null,null,p_amount,p_currency,period.period_start,period.period_end); perform public.accrue_invoice_splits(');execute d;end;$$;
-- Every split/reversal can recover its immutable exact payer by account+line.
DO $$declare d text;begin select pg_get_functiondef('public.export_workspace_v3_category_before_extended_money(uuid,uuid,text,text,integer,integer)'::regprocedure) into d;
 d:=replace(d,'select * from public.revenue_splits where business_workspace_id=p_workspace_id order by created_at,id offset off limit lim','select s.*,p.payer_workspace_id,p.customer_id as payer_customer_id,p.subscription_id as payer_subscription_id,p.subscription_item_id as payer_subscription_item_id from public.revenue_splits s left join public.invoice_split_sources p on p.source_account_id=s.source_account_id and p.invoice_line_id=s.invoice_line_id where s.business_workspace_id=p_workspace_id order by s.created_at,s.id offset off limit lim');execute d;end;$$;
