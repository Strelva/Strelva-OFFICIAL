-- Commercial policies remain empty. A missing approved rate produces zero eligible rows.
alter table public.revenue_splits add column currency text not null check(currency ~ '^[a-z]{3}$');
create table public.money_agreements (
 id uuid primary key default gen_random_uuid(), beneficiary_workspace_id uuid not null references public.workspaces(id) on delete restrict,
 kind text not null check(kind in('agency','creator')), version text not null, rate_reference text not null,
 rate_bps integer not null check(rate_bps between 0 and 10000), effective_from timestamptz not null,
 effective_until timestamptz, approved_by uuid not null references public.users(id) on delete restrict,
 approved_at timestamptz not null, check(effective_until is null or effective_until>effective_from), unique(beneficiary_workspace_id,kind,version)
);
create table public.creator_listings (
 id uuid primary key default gen_random_uuid(), definition_id text not null,
 creator_workspace_id uuid not null references public.workspaces(id) on delete restrict,
 source_revision_id uuid not null, agreement_version text,
 maintainer_state text not null check(maintainer_state in('creator','takeover','tapered')),
 rate_reference text, created_at timestamptz not null default now(), unique(definition_id,source_revision_id)
);
alter table public.money_agreements enable row level security;
alter table public.creator_listings enable row level security;
revoke all on public.money_agreements,public.creator_listings from public,anon,authenticated,service_role;
create trigger money_immutable before update or delete on public.money_agreements for each row execute function public.money_immutable_guard();
create trigger money_immutable before update or delete on public.creator_listings for each row execute function public.money_immutable_guard();
create function public.accrue_invoice_splits(p_business_id uuid,p_line_id text,p_period_start timestamptz,p_period_end timestamptz,p_source_account text,p_charge_id text,p_basis bigint,p_currency text,p_installation_id uuid default null,p_source_revision_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare installed public.offering_installations%rowtype;provider public.workspace_providers%rowtype; listing public.creator_listings%rowtype; a public.money_agreements%rowtype; b record; existing public.revenue_splits%rowtype; result jsonb='[]';
begin
 if p_basis<0 or p_period_end<=p_period_start or p_line_id is null or p_charge_id !~ '^ch_[A-Za-z0-9]+$' then raise exception 'split_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_source_account||':'||p_line_id,8810));
 select * into provider from public.workspace_providers where customer_workspace_id=p_business_id and started_at<=p_period_start and (ended_at is null or ended_at>p_period_start) order by started_at desc limit 1;
 if p_installation_id is not null then
 select * into installed from public.offering_installations where id=p_installation_id and business_workspace_id=p_business_id and status='active';
 if not found then raise exception 'split_installation_invalid'; end if;
 select l.* into listing from public.creator_listings l join public.offering_installations i on i.definition_id=l.definition_id
 where i.id=p_installation_id and l.source_revision_id=(to_jsonb(installed)->>'source_revision_id')::uuid;
 if listing.id is not null and to_regclass('public.creator_royalty_terms') is not null then
 select maintainer_state,agreement_version,rate_reference into listing.maintainer_state,listing.agreement_version,listing.rate_reference from public.creator_royalty_terms where listing_id=listing.id and effective_from<=p_period_start order by effective_from desc,id desc limit 1;
 if not found then select * into listing from public.creator_listings where id=listing.id;end if;
 end if;
 if listing.id is not null and (to_jsonb(installed)->>'creator_workspace_id') is distinct from listing.creator_workspace_id::text then raise exception 'split_creator_identity_mismatch';end if;
 end if;
 for b in select 'platform'::text as kind,null::uuid as workspace_id union all select 'agency',provider.provider_workspace_id where provider.id is not null union all select 'creator',listing.creator_workspace_id where listing.id is not null loop
 a:=null;
 if b.workspace_id is not null then
 select * into a from public.money_agreements where beneficiary_workspace_id=b.workspace_id and kind=b.kind and effective_from<=p_period_start and (effective_until is null or effective_until>=p_period_end)
 and (b.kind<>'creator' or (version=listing.agreement_version and rate_reference=listing.rate_reference and listing.maintainer_state in('creator','tapered'))) order by effective_from desc limit 1;
 end if;
 select * into existing from public.revenue_splits where source_account_id=p_source_account and invoice_line_id=p_line_id and beneficiary_kind=b.kind and event_key='accrual';
 if found then
 if existing.business_workspace_id<>p_business_id or existing.basis_cents<>p_basis or existing.source_charge_id<>p_charge_id or existing.period_start<>p_period_start or existing.period_end<>p_period_end or existing.currency<>p_currency or existing.beneficiary_workspace_id is distinct from b.workspace_id then raise exception 'split_idempotency_conflict'; end if;
 else
 insert into public.revenue_splits(business_workspace_id,beneficiary_workspace_id,beneficiary_kind,invoice_line_id,period_start,period_end,source_account_id,source_charge_id,basis_cents,amount_cents,agreement_version,rate_reference,rate_bps,attribution_id,source_revision_id,installation_id,maintainer_state,event_key,currency)
 values(p_business_id,b.workspace_id,b.kind,p_line_id,p_period_start,p_period_end,p_source_account,p_charge_id,p_basis,case when a.id is null then 0 else floor(p_basis::numeric*a.rate_bps/10000)::bigint end,a.version,a.rate_reference,a.rate_bps,case when b.kind='agency' then provider.id end,case when b.kind='creator' then listing.source_revision_id end,p_installation_id,case when b.kind='creator' then listing.maintainer_state end,'accrual',p_currency) returning * into existing;
 end if;
 result:=result||jsonb_build_array(to_jsonb(existing));
 end loop;
 if (select coalesce(sum(amount_cents),0) from public.revenue_splits where source_account_id=p_source_account and invoice_line_id=p_line_id and event_key='accrual')>p_basis then raise exception 'split_basis_overallocated'; end if;
 return result;
end; $$;
-- Reversals use cumulative provider loss, so duplicates/out-of-order refunds and
-- dispute losses cannot debit more than the original share. Every delta has its source.
create function public.reconcile_split_loss(p_source_account text,p_charge_id text,p_event_key text,p_cumulative_loss bigint,p_charge_basis bigint) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.revenue_splits%rowtype; r public.revenue_splits%rowtype; target bigint; reversed bigint; delta bigint; result jsonb='[]'; begin
 if p_charge_basis<=0 or p_cumulative_loss<0 or p_cumulative_loss>p_charge_basis or length(p_event_key)<8 then raise exception 'split_reversal_invalid'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_source_account||':'||p_charge_id,8811));
 for s in select * from public.revenue_splits where source_account_id=p_source_account and source_charge_id=p_charge_id and original_split_id is null order by id for update loop
 select * into r from public.revenue_splits where source_account_id=p_source_account and invoice_line_id=s.invoice_line_id and beneficiary_kind=s.beneficiary_kind and event_key=p_event_key;
 if found then result:=result||jsonb_build_array(to_jsonb(r));continue;end if;
 target:=floor(s.amount_cents::numeric*p_cumulative_loss/p_charge_basis)::bigint;
 select -coalesce(sum(amount_cents),0) into reversed from public.revenue_splits where original_split_id=s.id;
 delta:=target-reversed;
 insert into public.revenue_splits(business_workspace_id,beneficiary_workspace_id,beneficiary_kind,invoice_line_id,period_start,period_end,source_account_id,source_charge_id,basis_cents,amount_cents,agreement_version,rate_reference,rate_bps,attribution_id,source_revision_id,installation_id,maintainer_state,event_key,original_split_id,currency)
 values(s.business_workspace_id,s.beneficiary_workspace_id,s.beneficiary_kind,s.invoice_line_id,s.period_start,s.period_end,s.source_account_id,s.source_charge_id,s.basis_cents,-delta,s.agreement_version,s.rate_reference,s.rate_bps,s.attribution_id,s.source_revision_id,s.installation_id,s.maintainer_state,p_event_key,s.id,s.currency) returning * into r;
 result:=result||jsonb_build_array(to_jsonb(r)); end loop; return result;
end; $$;
create function public.read_split_payout_candidates(p_limit integer default 100) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select s.id as split_id,s.source_account_id,s.source_charge_id,s.currency,s.agreement_version,c.stripe_account_id as recipient_account_id,
 s.amount_cents+coalesce((select sum(r.amount_cents) from public.revenue_splits r where r.original_split_id=s.id),0) as amount_cents,
 c.state,c.configurations,c.capabilities from public.revenue_splits s join public.connected_accounts c on c.workspace_id=s.beneficiary_workspace_id
 where s.original_split_id is null and s.amount_cents>0 and s.agreement_version is not null and s.beneficiary_kind<>'platform'
 order by s.created_at,s.id limit least(greatest(p_limit,1),100)) x;
$$;
DO $$ declare f record; begin for f in select p.oid::regprocedure as name from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('accrue_invoice_splits','reconcile_split_loss','read_split_payout_candidates') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.name);execute format('grant execute on function %s to service_role',f.name);end loop;end $$;
-- Qualifications/source identity are owned by the creator package lane.
create function public.register_creator_listing(p_definition_id text,p_source_revision_id uuid,p_creator_workspace_id uuid,p_user_id uuid,p_verified_email text,p_agreement_version text default null,p_rate_reference text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$declare r public.creator_listings%rowtype;qualified boolean;begin
 perform public.connect_assert_manager(p_creator_workspace_id,p_user_id,p_verified_email);
 if not exists(select 1 from public.system_version_source_revisions s where s.id=p_source_revision_id and to_jsonb(s)->>'creator_workspace_id'=p_creator_workspace_id::text) then raise exception 'creator_listing_identity_invalid';end if;
 if to_regprocedure('public.system_revision_is_qualified(uuid)') is null then raise exception 'creator_qualification_unavailable';end if;
 execute 'select public.system_revision_is_qualified($1)' into qualified using p_source_revision_id;
 if not qualified then raise exception 'creator_listing_unqualified';end if;
 insert into public.creator_listings(definition_id,creator_workspace_id,source_revision_id,agreement_version,maintainer_state,rate_reference)
 values(p_definition_id,p_creator_workspace_id,p_source_revision_id,p_agreement_version,'creator',p_rate_reference) on conflict do nothing;
 select * into r from public.creator_listings where definition_id=p_definition_id and source_revision_id=p_source_revision_id;
 if r.creator_workspace_id<>p_creator_workspace_id or r.agreement_version is distinct from p_agreement_version or r.rate_reference is distinct from p_rate_reference then raise exception 'creator_listing_conflict';end if;
 return to_jsonb(r);
end;$$;
revoke all on function public.register_creator_listing(text,uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.register_creator_listing(text,uuid,uuid,uuid,text,text,text) to service_role;
