\set ON_ERROR_STOP on
-- Fictional immutable attribution and signed-source mirror in real disposable PostgreSQL.
begin;
insert into public.users(id,email,verified_at) values
 ('b2850000-0000-4000-8000-000000000001','attribution-owner@example.test',now()),
 ('b2850000-0000-4000-8000-000000000002','attribution-agency@example.test',now()),
 ('b2850000-0000-4000-8000-000000000003','attribution-admin@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('b2850000-0000-4000-8000-000000000010','customer','Attribution fictional business','b2850000-0000-4000-8000-000000000001'),
 ('b2850000-0000-4000-8000-000000000020','agency','Attribution fictional agency','b2850000-0000-4000-8000-000000000002'),
 ('b2850000-0000-4000-8000-000000000021','agency','Original bringer, not current operator','b2850000-0000-4000-8000-000000000002'),
 ('b2850000-0000-4000-8000-000000000011','customer','Other business','b2850000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000001','owner','b2850000-0000-4000-8000-000000000001'),
 ('b2850000-0000-4000-8000-000000000020','b2850000-0000-4000-8000-000000000002','owner','b2850000-0000-4000-8000-000000000002'),
 ('b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000003','admin','b2850000-0000-4000-8000-000000000001'),
 ('b2850000-0000-4000-8000-000000000011','b2850000-0000-4000-8000-000000000002','owner','b2850000-0000-4000-8000-000000000002');
create temporary table la_provider as select public.choose_business_provider('b2850000-0000-4000-8000-000000000001','attribution-owner@example.test','b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000020') body;
create function pg_temp.la_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'ledger attribution assertion: %',label;end if;end $$;
create temp table la_attribution as select public.record_business_attribution(
 'b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000001','attribution-owner@example.test',
 'b2850000-0000-4000-8000-000000000021','referral','{"kind":"owner_statement","reference":"Fictional original bringer, independent operator"}',
 'b2850000-0000-4000-8000-000000000040',(select id from public.workspace_providers where customer_workspace_id='b2850000-0000-4000-8000-000000000010' and status='active')) body;
insert into public.invoice_split_sources(source_account_id,invoice_line_id,charge_id,business_workspace_id,payer_workspace_id,payer_kind,customer_id,basis_cents,currency,period_start,period_end)
values('platform','il_AttributionZero','ch_AttributionZero','b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000010','business','cus_FictionalAttribution',1000,'cad',now()+interval '1 minute',now()+interval '1 day');
select public.accrue_invoice_splits('b2850000-0000-4000-8000-000000000010','il_AttributionZero',now()+interval '1 minute',now()+interval '1 day','platform','ch_AttributionZero',1000,'cad');
select pg_temp.la_assert((select beneficiary_workspace_id='b2850000-0000-4000-8000-000000000021' and amount_cents=0 and agreement_version is null from public.revenue_splits where invoice_line_id='il_AttributionZero' and beneficiary_kind='agency'),'eligible zero row uses immutable original bringer, not current operator');
-- Helpers create only fictional immutable invoice provenance in this owned cluster.
create function pg_temp.la_source(line text,charge text,business uuid,payer uuid,payer_kind text,start_at timestamptz,end_at timestamptz) returns void language sql as $$
 insert into public.invoice_split_sources(source_account_id,invoice_line_id,charge_id,business_workspace_id,payer_workspace_id,payer_kind,customer_id,basis_cents,currency,period_start,period_end)
 values('platform',line,charge,business,payer,payer_kind,'cus_FictionalAttribution',1000,'cad',start_at,end_at)
$$;
create function pg_temp.la_accrue(line text) returns jsonb language sql as $$
 select public.accrue_invoice_splits(s.business_workspace_id,s.invoice_line_id,s.period_start,s.period_end,s.source_account_id,s.charge_id,s.basis_cents,s.currency) from public.invoice_split_sources s where s.invoice_line_id=line
$$;
create function pg_temp.la_expect(q text,expected text) returns void language plpgsql as $$begin
 begin execute q;exception when others then if sqlstate='P0001' and sqlerrm=expected then return;end if;raise;end;
 raise exception 'expected ledger rejection %',expected;
end $$;
select pg_temp.la_assert((select attribution_id is null from public.revenue_splits where invoice_line_id='il_AttributionZero' and beneficiary_kind='agency'),'legacy provider FK is not repurposed');
select pg_temp.la_assert((select receipt->>'attributionId'=a.body->>'attributionId' and receipt->'attribution'->'sourceReceipt'=a.body->'sourceReceipt' from public.invoice_split_attributions f cross join la_attribution a where invoice_line_id='il_AttributionZero'),'zero row has explicit immutable original-bringer lineage');
-- No immutable source means no new financial admission, even with explicit attribution.
select pg_temp.la_expect($q$select public.accrue_invoice_splits('b2850000-0000-4000-8000-000000000010','il_MissingSource',now(),now()+interval '1 day','platform','ch_MissingSource',1000,'cad')$q$,'split_invoice_source_required');
select pg_temp.la_source('il_SourceConflict','ch_SourceConflict','b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000010','business',now()+interval '1 minute',now()+interval '1 day');
select pg_temp.la_expect($q$select public.accrue_invoice_splits('b2850000-0000-4000-8000-000000000010','il_SourceConflict',now()+interval '1 minute',now()+interval '1 day','platform','ch_SourceConflict',999,'cad')$q$,'split_invoice_source_conflict');
select pg_temp.la_assert(not exists(select 1 from public.invoice_split_attributions where invoice_line_id='il_SourceConflict'),'failed source validation freezes no receipt');
-- Agreement values are fictional test-only terms, not an adopted rate.
insert into public.money_agreements(beneficiary_workspace_id,kind,version,rate_reference,rate_bps,effective_from,approved_by,approved_at)
 values('b2850000-0000-4000-8000-000000000021','agency','fictional-bringer-agreement','fictional-bringer-rate',1000,'2020-01-01','b2850000-0000-4000-8000-000000000001',now());
select pg_temp.la_source('il_AttributionPaid','ch_AttributionPaid','b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000010','business',now()+interval '1 minute',now()+interval '1 day');
create temp table la_paid as select pg_temp.la_accrue('il_AttributionPaid') body;
select pg_temp.la_assert((select amount_cents=100 and beneficiary_workspace_id='b2850000-0000-4000-8000-000000000021' and agreement_version='fictional-bringer-agreement' from public.revenue_splits where invoice_line_id='il_AttributionPaid' and beneficiary_kind='agency'),'explicit approved agreement supplies bounded original-bringer amount');
-- Frozen wholesale never accrues an agency reward, even for the same bringer.
select pg_temp.la_source('il_AttributionWholesale','ch_AttributionWholesale','b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000021','agency',now()+interval '1 minute',now()+interval '1 day');
select pg_temp.la_accrue('il_AttributionWholesale');
select pg_temp.la_assert(not exists(select 1 from public.revenue_splits where invoice_line_id='il_AttributionWholesale' and beneficiary_kind='agency') and (select receipt->>'status'='wholesale_excluded' and attribution_id is null from public.invoice_split_attributions where invoice_line_id='il_AttributionWholesale'),'wholesale exclusion frozen before attribution');
-- Opening inside a paid interval refuses to invent a partial-period split.
select pg_temp.la_source('il_OpeningBoundary','ch_OpeningBoundary','b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000010','business',(select (body->>'from')::timestamptz-interval '1 second' from la_attribution),(select (body->>'from')::timestamptz+interval '1 second' from la_attribution));
select pg_temp.la_expect($q$select pg_temp.la_accrue('il_OpeningBoundary')$q$,'split_attribution_period_policy_required');
-- Operator alone proves no acquisition identity. Later explicit opening must
-- not attach an extra beneficiary to the same already admitted invoice.
select public.choose_business_provider('b2850000-0000-4000-8000-000000000002','attribution-agency@example.test','b2850000-0000-4000-8000-000000000011','b2850000-0000-4000-8000-000000000020');
select pg_temp.la_source('il_NoOriginal','ch_NoOriginal','b2850000-0000-4000-8000-000000000011','b2850000-0000-4000-8000-000000000011','business',now()+interval '2 minutes',now()+interval '1 day');
create temp table la_none as select pg_temp.la_accrue('il_NoOriginal') body;
select pg_temp.la_assert(not exists(select 1 from public.revenue_splits where invoice_line_id='il_NoOriginal' and beneficiary_kind='agency'),'operator is not guessed as original bringer');
select public.record_business_attribution('b2850000-0000-4000-8000-000000000011','b2850000-0000-4000-8000-000000000002','attribution-agency@example.test','b2850000-0000-4000-8000-000000000021','signup','{"kind":"owner_statement","reference":"Fictional later statement, never retroactive"}','b2850000-0000-4000-8000-000000000041',(select id from public.workspace_providers where customer_workspace_id='b2850000-0000-4000-8000-000000000011' and status='active'));
select pg_temp.la_assert((select body=pg_temp.la_accrue('il_NoOriginal') from la_none) and (select receipt->>'status'='no_explicit_attribution' from public.invoice_split_attributions where invoice_line_id='il_NoOriginal'),'late attribution cannot add agency to prior source');
-- Completion ends explicit bringer eligibility, without rewriting paid periods.
insert into public.provider_change_policy values('fictional-ledger-zero-window',0,'b2850000-0000-4000-8000-000000000001',now());
create temp table la_change as select public.request_provider_change('b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000001','attribution-owner@example.test','b2850000-0000-4000-8000-000000000021','fictional-ledger-switch',null) body;
select public.acknowledge_provider_change_notice((select (body->>'id')::uuid from la_change),'b2850000-0000-4000-8000-000000000002','attribution-agency@example.test');
select public.complete_provider_change((select (body->>'id')::uuid from la_change),'b2850000-0000-4000-8000-000000000001','attribution-owner@example.test');
select pg_temp.la_assert((select body=pg_temp.la_accrue('il_AttributionPaid') from la_paid),'provider switch keeps exact originally accepted paid-period rows');
select pg_temp.la_source('il_EndingBoundary','ch_EndingBoundary','b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000010','business',(select to_at-interval '1 second' from public.business_attribution_endings e join la_attribution a on e.attribution_id=(a.body->>'attributionId')::uuid),(select to_at+interval '1 second' from public.business_attribution_endings e join la_attribution a on e.attribution_id=(a.body->>'attributionId')::uuid));
select pg_temp.la_expect($q$select pg_temp.la_accrue('il_EndingBoundary')$q$,'split_attribution_period_policy_required');
select pg_temp.la_source('il_AfterEnding','ch_AfterEnding','b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000010','business',now()+interval '1 minute',now()+interval '1 day');
select pg_temp.la_accrue('il_AfterEnding');
select pg_temp.la_assert(not exists(select 1 from public.revenue_splits where invoice_line_id='il_AfterEnding' and beneficiary_kind='agency'),'later periods stop at explicit immutable ending despite current agency operator');
select public.reconcile_split_loss('platform','ch_AttributionPaid','fictional-refund-half',500,1000);
select public.reconcile_split_loss('platform','ch_AttributionPaid','fictional-refund-half',500,1000);
select public.reconcile_split_loss('platform','ch_AttributionPaid','fictional-dispute-all',1000,1000);
select public.reconcile_split_loss('platform','ch_AttributionPaid','fictional-restored',250,1000);
select pg_temp.la_assert((select sum(amount_cents)=75 and bool_and(beneficiary_workspace_id='b2850000-0000-4000-8000-000000000021') from public.revenue_splits where invoice_line_id='il_AttributionPaid' and beneficiary_kind='agency'),'refund/dispute/restoration bounded to original beneficiary and source');
select pg_temp.la_assert((select body=pg_temp.la_accrue('il_AttributionPaid') from la_paid),'replay after losses preserves original accrual rows');
select pg_temp.la_assert((select count(*)=1 from public.invoice_split_attributions where invoice_line_id='il_AttributionPaid'),'losses/replay preserve one original acquisition receipt');
select pg_temp.la_expect($q$select public.accrue_invoice_splits('b2850000-0000-4000-8000-000000000011','il_AttributionPaid',now()+interval '1 minute',now()+interval '1 day','platform','ch_AttributionPaid',1000,'cad')$q$,'split_idempotency_conflict');
select pg_temp.la_expect($q$update public.invoice_split_attributions set receipt='{}'$q$,'money_immutable');
select pg_temp.la_expect($q$delete from public.invoice_split_attributions$q$,'money_immutable');
select pg_temp.la_assert(not has_table_privilege('service_role','public.invoice_split_attributions','SELECT') and not has_table_privilege('service_role','public.invoice_split_attributions','INSERT')
 and not has_function_privilege('service_role','public.accrue_invoice_splits_provider_v1(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid)','EXECUTE')
 and not has_function_privilege('authenticated','public.accrue_invoice_splits(uuid,text,timestamptz,timestamptz,text,text,bigint,text,uuid,uuid)','EXECUTE'),'service RPC only; no legacy helper/table bypass');
select pg_temp.la_assert(exists(select 1 from jsonb_array_elements(public.export_workspace_v3_category('b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000001','attribution-owner@example.test','revenue_splits',0,1000)->'items') i where i->>'invoice_line_id'='il_AttributionPaid' and i->'agency_attribution'->>'agencyWorkspaceId'='b2850000-0000-4000-8000-000000000021'),'owner portability includes exact frozen attribution after switch and losses');
select pg_temp.la_assert(not exists(select 1 from jsonb_array_elements(public.export_workspace_v3_category('b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000003','attribution-admin@example.test','revenue_splits',0,1000)->'items') i where i ? 'agency_attribution'),'operators retain prior projection without owner-only bringer reference disclosure');
select pg_temp.la_expect($q$select public.export_workspace_v3_category('b2850000-0000-4000-8000-000000000010','b2850000-0000-4000-8000-000000000002','attribution-agency@example.test','revenue_splits',0,1000)$q$,'workspace_export_denied');
\if :{?ledger_attribution_retain}
commit;
\else
rollback;
\endif

