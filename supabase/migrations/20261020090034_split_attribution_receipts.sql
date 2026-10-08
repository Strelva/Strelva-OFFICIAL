-- #285: explicit original-bringer lineage for new accruals. No provider-source
-- inference, legacy rewrite, rate, tail or crossing-period allocation is selected.
begin;
set local lock_timeout='3s';
create table public.invoice_split_attributions (
 source_account_id text not null,
 invoice_line_id text not null,
 business_workspace_id uuid not null references public.workspaces(id),
 attribution_id uuid references public.business_attributions(id),
 receipt jsonb not null,
 primary key(source_account_id,invoice_line_id),
 foreign key(source_account_id,invoice_line_id) references public.invoice_split_sources(source_account_id,invoice_line_id)
);
alter table public.invoice_split_attributions enable row level security;
revoke all on public.invoice_split_attributions from public,anon,authenticated,service_role;
create trigger split_attribution_immutable before update or delete on public.invoice_split_attributions for each row execute function public.money_immutable_guard();

-- Keep a private exact inverse of the prior implementation. Only the agency
-- branch changes; creator maintenance, source and approved-period logic stay owned.
alter function public.accrue_invoice_splits_before_loss(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid)
 rename to accrue_invoice_splits_provider_v1;
revoke all on function public.accrue_invoice_splits_provider_v1(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid) from public,anon,authenticated,service_role;
do $$ declare definition text; old_lookup text; new_lookup text; old_branch text; begin
 definition:=pg_get_functiondef('public.accrue_invoice_splits_provider_v1(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid)'::regprocedure);
 old_lookup:='select * into provider from public.workspace_providers where customer_workspace_id=p_business_id and started_at<=p_period_start and (ended_at is null or ended_at>p_period_start) order by started_at desc limit 1;';
 new_lookup:='select origin.* into agency_attribution from public.invoice_split_attributions f join public.business_attributions origin on origin.id=f.attribution_id where f.source_account_id=p_source_account and f.invoice_line_id=p_line_id;';
 old_branch:='select ''agency'',provider.provider_workspace_id where provider.id is not null';
 if position(old_lookup in definition)=0 or position(old_branch in definition)=0 or position('then provider.id end' in definition)=0 then raise exception 'split_attribution_source_drift';end if;
 definition:=replace(definition,'public.accrue_invoice_splits_provider_v1(','public.accrue_invoice_splits_before_loss(');
 definition:=replace(definition,'provider public.workspace_providers%rowtype;','agency_attribution public.business_attributions%rowtype;');
 definition:=replace(definition,old_lookup,new_lookup);
 definition:=replace(definition,old_branch,'select ''agency'',agency_attribution.agency_workspace_id where agency_attribution.id is not null');
 -- This old FK continues to mean legacy workspace-provider lineage. New immutable
 -- acquisition identity lives in the companion receipt, never in a repurposed FK.
 definition:=replace(definition,'case when b.kind=''agency'' then provider.id end','null::uuid');
 execute definition;
end $$;
revoke all on function public.accrue_invoice_splits_before_loss(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid) from public,anon,authenticated,service_role;

alter function public.accrue_invoice_splits(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid)
 rename to accrue_invoice_splits_before_attribution;
revoke all on function public.accrue_invoice_splits_before_attribution(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid) from public,anon,authenticated,service_role;
create function public.accrue_invoice_splits(p_business_id uuid,p_line_id text,p_period_start timestamptz,p_period_end timestamptz,p_source_account text,p_charge_id text,p_basis bigint,p_currency text,p_installation_id uuid default null,p_source_revision_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare source public.invoice_split_sources; attribution public.business_attributions; result jsonb; loss public.split_loss_receipts; receipt jsonb;
begin
 if p_business_id is null or p_line_id is null or p_source_account is null or p_charge_id is null or p_charge_id !~ '^ch_[A-Za-z0-9]+$'
  or p_basis is null or p_basis<0 or p_currency is null or p_currency !~ '^[a-z]{3}$' or p_period_start is null or p_period_end is null or p_period_end<=p_period_start then raise exception 'split_invalid';end if;
 -- Same charge-then-line lock order as the original loss-aware accrual path.
 perform pg_advisory_xact_lock(hashtextextended(p_source_account||':'||p_charge_id,8811));
 perform pg_advisory_xact_lock(hashtextextended(p_source_account||':'||p_line_id,8810));
 if exists(select 1 from public.revenue_splits where source_account_id=p_source_account and invoice_line_id=p_line_id and event_key='accrual') then
  -- Legacy and new replays retain every original row. Do not consult today's
  -- provider, ending, installation lifecycle or agreement to add beneficiaries.
  if exists(select 1 from public.revenue_splits s where s.source_account_id=p_source_account and s.invoice_line_id=p_line_id and s.event_key='accrual' and (
   s.business_workspace_id<>p_business_id or s.source_charge_id<>p_charge_id or s.basis_cents<>p_basis or s.currency<>p_currency
   or s.period_start<>p_period_start or s.period_end<>p_period_end or s.installation_id is distinct from p_installation_id
   or (s.beneficiary_kind='creator' and p_source_revision_id is not null and s.source_revision_id is distinct from p_source_revision_id))) then raise exception 'split_idempotency_conflict';end if;
  select jsonb_agg(to_jsonb(s) order by case s.beneficiary_kind when 'platform' then 0 when 'agency' then 1 else 2 end) into result
   from public.revenue_splits s where s.source_account_id=p_source_account and s.invoice_line_id=p_line_id and s.event_key='accrual';
  select * into loss from public.split_loss_receipts where source_account_id=p_source_account and charge_id=p_charge_id order by created_at desc,event_key desc limit 1;
  if found then perform public.reconcile_split_loss_before_receipt(p_source_account,p_charge_id,loss.event_key,loss.loss_cents,loss.charge_basis);end if;
  return result;
 end if;
 select * into source from public.invoice_split_sources where source_account_id=p_source_account and invoice_line_id=p_line_id;
 if source.invoice_line_id is null then raise exception 'split_invoice_source_required';end if;
 if source.business_workspace_id<>p_business_id or source.charge_id<>p_charge_id or source.basis_cents<>p_basis or source.currency<>p_currency
  or source.period_start<>p_period_start or source.period_end<>p_period_end then raise exception 'split_invoice_source_conflict';end if;
 -- Serialize with current-owner attribution opening and provider-change completion.
 -- The signed invoice source is already immutable; current payer changes cannot
 -- turn a wholesale line into business-paid attribution on later replay.
 perform pg_advisory_xact_lock(hashtextextended(p_business_id::text,7415));
 perform 1 from public.workspaces where id=p_business_id for share;
 if source.payer_kind='business' then
  if exists(select 1 from public.business_attributions a left join public.business_attribution_endings e on e.attribution_id=a.id
   where a.business_workspace_id=p_business_id and ((a.from_at>p_period_start and a.from_at<p_period_end) or (e.to_at>p_period_start and e.to_at<p_period_end))) then raise exception 'split_attribution_period_policy_required';end if;
  select a.* into attribution from public.business_attributions a left join public.business_attribution_endings e on e.attribution_id=a.id
   where a.business_workspace_id=p_business_id and a.from_at<=p_period_start and (e.to_at is null or e.to_at>=p_period_end) order by a.from_at desc,a.id desc limit 1;
 end if;
 receipt:=jsonb_build_object('version',1,'businessWorkspaceId',p_business_id,'sourceAccountId',p_source_account,'invoiceLineId',p_line_id,
  'chargeId',p_charge_id,'basisCents',p_basis,'currency',p_currency,'periodStart',p_period_start,'periodEnd',p_period_end,
  'payerKind',source.payer_kind,'payerWorkspaceId',source.payer_workspace_id,
  'status',case when source.payer_kind='agency' then 'wholesale_excluded' when attribution.id is null then 'no_explicit_attribution' else 'explicit_owner_confirmed_attribution' end,
  'attributionId',attribution.id,'agencyWorkspaceId',attribution.agency_workspace_id,
  'attribution',case when attribution.id is not null then public.business_attribution_receipt(attribution) else null end,
  'invoiceSourceSha256',encode(digest(to_jsonb(source)::text,'sha256'),'hex'),'capturedAt',clock_timestamp());
 insert into public.invoice_split_attributions(source_account_id,invoice_line_id,business_workspace_id,attribution_id,receipt)
 values(p_source_account,p_line_id,p_business_id,attribution.id,receipt);
 return public.accrue_invoice_splits_before_attribution(p_business_id,p_line_id,p_period_start,p_period_end,p_source_account,p_charge_id,p_basis,p_currency,p_installation_id,p_source_revision_id);
end $$;
revoke all on function public.accrue_invoice_splits(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.accrue_invoice_splits(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid) to service_role;

-- Keep the existing scoped, pure export. Original bringer references are owned
-- by the business owner (#284); operators retain their prior split projection.
alter function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) rename to export_workspace_v3_category_before_split_attribution;
revoke all on function public.export_workspace_v3_category_before_split_attribution(uuid,uuid,text,text,integer,integer) from public,anon,authenticated,service_role;
create function public.export_workspace_v3_category(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_category text,p_offset integer default 0,p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 result:=public.export_workspace_v3_category_before_split_attribution(p_workspace_id,p_user_id,p_verified_email,p_category,p_offset,p_limit);
 if p_category='revenue_splits' and public.workspace_export_v3_read_role(p_workspace_id,p_user_id,p_verified_email)='owner' then
  result:=jsonb_set(result,'{items}',coalesce((select jsonb_agg(item||jsonb_build_object('agency_attribution',
   (select f.receipt from public.invoice_split_attributions f where f.source_account_id=item->>'source_account_id' and f.invoice_line_id=item->>'invoice_line_id')) order by ordinal)
   from jsonb_array_elements(result->'items') with ordinality records(item,ordinal)),'[]'));
 end if;
 return result;
end $$;
revoke all on function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) to service_role;

-- Guard exact inverse order against later creator/export wrappers as well as
-- populated new receipts. This table is implementation metadata, not authority.
create table public.split_attribution_rollback_state(signature text primary key,body_md5 text not null);
revoke all on public.split_attribution_rollback_state from public,anon,authenticated,service_role;
alter table public.split_attribution_rollback_state enable row level security;
create trigger split_attribution_rollback_immutable before update or delete on public.split_attribution_rollback_state for each row execute function public.money_immutable_guard();
insert into public.split_attribution_rollback_state
select signature,md5(p.prosrc) from (values
 ('public.accrue_invoice_splits(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid)'),
 ('public.accrue_invoice_splits_before_loss(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid)'),
 ('public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer)')) signatures(signature) join pg_proc p on p.oid=signature::regprocedure;
notify pgrst,'reload schema';
commit;
