\set ON_ERROR_STOP on
-- Real PostgreSQL, fictional local identities. No signup/conversion/provider proof.
begin;
create function pg_temp.ba_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'business attribution assertion: %',label;end if;end $$;
insert into public.users(id,email,verified_at) values
 ('b2840000-0000-4000-8000-000000000001','attribution-owner@example.test',now()),
 ('b2840000-0000-4000-8000-000000000002','attribution-agency@example.test',now()),
 ('b2840000-0000-4000-8000-000000000003','attribution-admin@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('b2840000-0000-4000-8000-000000000010','customer','Attribution fictional business','b2840000-0000-4000-8000-000000000001'),
 ('b2840000-0000-4000-8000-000000000020','agency','Attribution fictional agency','b2840000-0000-4000-8000-000000000002'),
 ('b2840000-0000-4000-8000-000000000021','agency','Original bringer, not current operator','b2840000-0000-4000-8000-000000000002'),
 ('b2840000-0000-4000-8000-000000000011','customer','Other business','b2840000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','owner','b2840000-0000-4000-8000-000000000001'),
 ('b2840000-0000-4000-8000-000000000020','b2840000-0000-4000-8000-000000000002','owner','b2840000-0000-4000-8000-000000000002'),
 ('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000003','admin','b2840000-0000-4000-8000-000000000001'),
 ('b2840000-0000-4000-8000-000000000011','b2840000-0000-4000-8000-000000000002','owner','b2840000-0000-4000-8000-000000000002');
create temporary table ba_provider as select public.choose_business_provider('b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000020') body;
create function pg_temp.ba_expect(q text,expected text) returns void language plpgsql as $$begin
 begin execute q;exception when others then if sqlstate='P0001' and sqlerrm=expected then return;end if;raise exception 'Expected %, got % %',expected,sqlstate,sqlerrm;end;
 raise exception 'Expected %, succeeded: %',expected,q;
end $$;
create function pg_temp.ba_record(source text default 'referral',command uuid default 'b2840000-0000-4000-8000-000000000030',agency uuid default 'b2840000-0000-4000-8000-000000000021',provider uuid default null) returns jsonb language sql as $$
 select public.record_business_attribution('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test',agency,source,'{"kind":"owner_statement","reference":"fictional referral receipt"}',command,coalesce(provider,(select (body->>'providerId')::uuid from ba_provider)))
$$;
create temporary table ba_record as select pg_temp.ba_record() body;
select pg_temp.ba_assert((select body->>'source'='referral' and body->>'agencyWorkspaceId'='b2840000-0000-4000-8000-000000000021' and body->>'financialEligibility'='not_selected' and body->>'to' is null from ba_record),'original bringer differs operating agency; no financial authority or inferred source');
select pg_temp.ba_assert(pg_temp.ba_record()=(select body from ba_record),'exact command replay');
select pg_temp.ba_expect($q$select pg_temp.ba_record('signup')$q$,'business_attribution_command_conflict');
select pg_temp.ba_expect($q$select pg_temp.ba_record('referral','b2840000-0000-4000-8000-000000000031')$q$,'business_attribution_already_active');
select pg_temp.ba_expect($q$select pg_temp.ba_record('referral','b2840000-0000-4000-8000-000000000031','b2840000-0000-4000-8000-000000000021','b2840000-0000-4000-8000-000000000099')$q$,'business_attribution_provider_stale');
select pg_temp.ba_expect($q$select public.record_business_attribution('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','b2840000-0000-4000-8000-000000000021','signup','{}','b2840000-0000-4000-8000-000000000031',(select (body->>'providerId')::uuid from ba_provider))$q$,'business_attribution_input_invalid');
select pg_temp.ba_expect($q$select public.record_business_attribution('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','b2840000-0000-4000-8000-000000000021','signup','{"kind":"conversion_receipt","reference":"x"}','b2840000-0000-4000-8000-000000000031',(select (body->>'providerId')::uuid from ba_provider))$q$,'business_attribution_input_invalid');
select pg_temp.ba_expect($q$select public.record_business_attribution('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','b2840000-0000-4000-8000-000000000021','signup','{"kind":"owner_statement","reference":" "}','b2840000-0000-4000-8000-000000000031',(select (body->>'providerId')::uuid from ba_provider))$q$,'business_attribution_input_invalid');
select pg_temp.ba_expect($q$select public.record_business_attribution('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','b2840000-0000-4000-8000-000000000021','signup','{"kind":"owner_statement","reference":" x "}','b2840000-0000-4000-8000-000000000031',(select (body->>'providerId')::uuid from ba_provider))$q$,'business_attribution_input_invalid');
select pg_temp.ba_expect($q$select public.record_business_attribution('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','b2840000-0000-4000-8000-000000000021','signup','{"kind":"owner_statement","reference":"x","rate":20}','b2840000-0000-4000-8000-000000000031',(select (body->>'providerId')::uuid from ba_provider))$q$,'business_attribution_input_invalid');
select pg_temp.ba_expect($q$select pg_temp.ba_record('operator_choice','b2840000-0000-4000-8000-000000000031')$q$,'business_attribution_input_invalid');
select pg_temp.ba_expect($q$select pg_temp.ba_record('referral','b2840000-0000-4000-8000-000000000031','b2840000-0000-4000-8000-000000000011')$q$,'business_attribution_agency_invalid');
select pg_temp.ba_expect($q$select public.record_business_attribution('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000003','attribution-admin@example.test','b2840000-0000-4000-8000-000000000021','signup','{"kind":"owner_statement","reference":"x"}','b2840000-0000-4000-8000-000000000033',(select (body->>'providerId')::uuid from ba_provider))$q$,'provider_seat_owner_required');
select pg_temp.ba_expect($q$select public.record_business_attribution('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000002','attribution-agency@example.test','b2840000-0000-4000-8000-000000000021','referral','{"kind":"owner_statement","reference":"x"}','b2840000-0000-4000-8000-000000000033',(select (body->>'providerId')::uuid from ba_provider))$q$,'provider_seat_owner_required');
select pg_temp.ba_expect($q$select public.read_business_attributions('b2840000-0000-4000-8000-000000000011','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test')$q$,'business_attribution_owner_denied');
select pg_temp.ba_expect($q$select public.read_business_attributions('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','wrong@example.test')$q$,'business_attribution_owner_denied');
update public.workspace_memberships set role='member' where workspace_id='b2840000-0000-4000-8000-000000000010' and user_id='b2840000-0000-4000-8000-000000000001';
select pg_temp.ba_expect($q$select pg_temp.ba_record()$q$,'provider_seat_owner_required');
select pg_temp.ba_expect($q$select public.read_business_attributions('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test')$q$,'business_attribution_owner_denied');
update public.workspace_memberships set role='owner' where workspace_id='b2840000-0000-4000-8000-000000000010' and user_id='b2840000-0000-4000-8000-000000000001';
update public.users set verified_at=null where id='b2840000-0000-4000-8000-000000000001';
select pg_temp.ba_expect($q$select pg_temp.ba_record()$q$,'provider_seat_owner_required');
update public.users set verified_at=now() where id='b2840000-0000-4000-8000-000000000001';
select pg_temp.ba_expect($q$update public.business_attributions set source='signup'$q$,'money_immutable');
select pg_temp.ba_expect($q$delete from public.business_attributions$q$,'money_immutable');
-- Even before any window is selected, an active attribution forbids bypass ending.
select pg_temp.ba_assert(not exists(select 1 from public.provider_change_policy),'notice policy remains undecided');
select pg_temp.ba_expect($q$select public.choose_business_provider('b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000021')$q$,'business_attribution_change_provider_required');
select pg_temp.ba_expect($q$select public.end_business_provider('b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','b2840000-0000-4000-8000-000000000010','No-policy bypass')$q$,'business_attribution_change_provider_required');
create temporary table ba_request as select public.request_provider_change('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test','b2840000-0000-4000-8000-000000000021','fictional-attribution-provider-change',null) body;
select pg_temp.ba_expect($q$select public.complete_provider_change((select (body->>'id')::uuid from ba_request),'b2840000-0000-4000-8000-000000000001','attribution-owner@example.test')$q$,'provider_response_window_open');
select pg_temp.ba_assert(not exists(select 1 from public.business_attribution_endings) and not exists(select 1 from public.business_attribution_change_permissions),'failed completion makes no ending or permission');
-- Local fixture-only zero window; never a deployed/default policy.
insert into public.provider_change_policy values('fictional-attribution-zero',0,'b2840000-0000-4000-8000-000000000001',now());
select public.acknowledge_provider_change_notice((select (body->>'id')::uuid from ba_request),'b2840000-0000-4000-8000-000000000002','attribution-agency@example.test');
create temporary table ba_completion as select public.complete_provider_change((select (body->>'id')::uuid from ba_request),'b2840000-0000-4000-8000-000000000001','attribution-owner@example.test') body;
select pg_temp.ba_assert((select body=public.complete_provider_change((select (body->>'id')::uuid from ba_request),'b2840000-0000-4000-8000-000000000001','attribution-owner@example.test') from ba_completion),'completion replay is exact');
select pg_temp.ba_assert((select count(*)=1 from public.business_attribution_endings) and (select count(*)=1 from public.business_attributions) and not exists(select 1 from public.business_attribution_change_permissions),'one immutable opening/ending, no automatic successor');
select pg_temp.ba_assert((select to_jsonb(a)->'receipt'=b.body-'ending' from public.business_attributions a cross join ba_record b),'opening body never rewritten');
select pg_temp.ba_assert((select e.to_at>=a.from_at and e.receipt->>'agencyWorkspaceId'=a.agency_workspace_id::text and e.receipt->>'source'=a.source and e.receipt->'sourceReceipt'=a.source_receipt and e.receipt->>'providerChangeRequestId'=(select body->>'id' from ba_request) from public.business_attribution_endings e join public.business_attributions a on a.id=e.attribution_id),'ending binds exact original bringer/source/from and successful MO18');
select pg_temp.ba_assert(public.read_business_attributions('b2840000-0000-4000-8000-000000000010','b2840000-0000-4000-8000-000000000001','attribution-owner@example.test')->'currentProvider'->>'agencyWorkspaceId'='b2840000-0000-4000-8000-000000000021','current operator separate from immutable prior receipt');
select pg_temp.ba_expect($q$delete from public.business_attribution_endings$q$,'money_immutable');
-- New original statement is explicit; replay old completion cannot end it.
select pg_temp.ba_record('conversion','b2840000-0000-4000-8000-000000000034','b2840000-0000-4000-8000-000000000020',(select id from public.workspace_providers where customer_workspace_id='b2840000-0000-4000-8000-000000000010' and status='active'));
select public.complete_provider_change((select (body->>'id')::uuid from ba_request),'b2840000-0000-4000-8000-000000000001','attribution-owner@example.test');
select pg_temp.ba_assert((select count(*)=1 from public.business_attribution_endings) and (select count(*)=2 from public.business_attributions),'completed replay preserves subsequent attribution');
select pg_temp.ba_assert((select pg_temp.ba_record()->'ending'->>'providerChangeRequestId'=(select body->>'id' from ba_request)),'opening replay after switch includes exact append-only ending');
select pg_temp.ba_assert(not has_table_privilege('service_role','public.business_attributions','SELECT') and not has_table_privilege('service_role','public.business_attributions','INSERT') and not has_table_privilege('service_role','public.business_attribution_endings','DELETE') and not has_table_privilege('service_role','public.business_attribution_change_permissions','INSERT') and not has_function_privilege('service_role','public.complete_provider_change_before_attribution(uuid,uuid,text)','EXECUTE') and not has_function_privilege('authenticated','public.record_business_attribution(uuid,uuid,text,uuid,text,jsonb,uuid,uuid)','EXECUTE'),'no table/helper/caller bypass; only scoped service RPC');
rollback;
\echo Business attribution native receipt, authority, replay and MO18 proof passed.
