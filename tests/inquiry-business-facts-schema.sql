\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.if_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'inquiry fact assertion failed: %',message; end if; end; $$;
create or replace function pg_temp.if_expect(statement text,expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlerrm<>expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return; end; raise exception 'unexpected success: %',statement; end; $$;
select pg_temp.if_assert(not has_function_privilege('anon','public.confirm_inquiry_business_fact(uuid,uuid,uuid,text)','execute')
  and not has_function_privilege('authenticated','public.stage_inquiry_business_fact(uuid,uuid,text,jsonb,text)','execute')
  and has_function_privilege('service_role','public.read_inquiry_business_facts(uuid,uuid)','execute'),'service-only RPCs');
insert into public.users(id,email,verified_at) values
  ('f6300000-0000-4000-8000-000000000001','fact-operator@example.test',now()),
  ('f6300000-0000-4000-8000-000000000002','fact-outsider@example.test',now());
insert into public.super_admins(user_id,email) values ('f6300000-0000-4000-8000-000000000001','fact-operator@example.test');
insert into public.tenants(id,stable_id,site_name,active,owner_email) values
  ('fact-fixture','f6300000-0000-4000-8000-000000000003','Original Name',true,'unclaimed-owner@example.test');
create temporary table if_ws(id uuid) on commit drop;
insert into if_ws select (public.convert_tenant_to_business('fact-operator@example.test','fact-fixture',
  '{"tenantId":"fact-fixture","tenantStableId":"f6300000-0000-4000-8000-000000000003","workspaceName":"Fact Fixture","billing":null,"account":null,"patch":{},"contacts":[]}',
  'f6300000-0000-4000-8000-000000000004',repeat('f',64))->>'workspaceId')::uuid;
select pg_temp.if_expect(format($$select public.stage_inquiry_business_fact(%L,'f6300000-0000-4000-8000-000000000002','display_name','"Forged"','website')$$,id),'business_record_access_denied') from if_ws;
create temporary table if_proposal(id uuid,hash text,decision uuid) on commit drop;
insert into if_proposal(id) select public.stage_inquiry_business_fact(id,'f6300000-0000-4000-8000-000000000001','display_name','"Website Name"','https://fixture.example.test · structured metadata') from if_ws;
update if_proposal set hash=(select revision_hash from public.inquiry_business_fact_proposals p where p.id=if_proposal.id);
select pg_temp.if_assert(public.business_record_entity_state((select id from if_ws),'fact','display_name')->>'value' is distinct from 'Website Name','a scan never replaces a fact');
select pg_temp.if_assert(public.stage_inquiry_business_fact((select id from if_ws),'f6300000-0000-4000-8000-000000000001','display_name','"Website Name"','https://fixture.example.test · structured metadata')=(select id from if_proposal),'same scan reuses exact pending suggestion');
update if_proposal set decision=(public.open_owner_decision((select id from if_ws),jsonb_build_object('kind','fact.inferred','route','owner_decides','title','Use this business name?',
  'approveEffect','Save this detail.','notYetEffect','Nothing changes.','sourceLifecycle','inquiry_fact','sourceId',id::text,'revisionHash',hash,'adminMayDecide',false))->>'id')::uuid;
select pg_temp.if_expect(format('select public.confirm_inquiry_business_fact(%L,%L,%L,%L)',(select id from if_ws),id,decision,hash),'inquiry_access_denied') from if_proposal;
select public.record_owner_decision_delivery((select id from if_ws),decision,'digest','sent','unclaimed-owner@example.test','if-owner-link-fixture',null) from if_proposal;
select pg_temp.if_assert((public.claim_owner_decision((select id from if_ws),decision,hash,'approve','owner_link',null,null,'unclaimed-owner@example.test')->>'status')='claimed','signed owner without an account approves') from if_proposal;
select public.confirm_inquiry_business_fact((select id from if_ws),id,decision,hash) from if_proposal;
select pg_temp.if_assert(public.business_record_entity_state((select id from if_ws),'fact','display_name')->'verified'='true'::jsonb
  and public.business_record_entity_state((select id from if_ws),'fact','display_name')->>'value'='Website Name','exact approved fact uses shared record');
select pg_temp.if_assert(public.read_inquiry_business_facts((select id from if_ws),'f6300000-0000-4000-8000-000000000001')='[]'::jsonb,'confirmed proposal stops waiting');
select pg_temp.if_assert((public.confirm_inquiry_business_fact((select id from if_ws),id,decision,hash)->>'replayed')='true','accepted write repeats without a second history row') from if_proposal;
select pg_temp.if_assert((select count(*) from public.business_record_revisions r where r.command_id=(select id from if_proposal))=1,'one canonical fact receipt');
-- Changed business facts invalidate a pending email revision before applying it.
truncate if_proposal;
insert into if_proposal(id) select public.stage_inquiry_business_fact(id,'f6300000-0000-4000-8000-000000000001','display_name','"New Suggestion"','website') from if_ws;
update if_proposal set hash=(select revision_hash from public.inquiry_business_fact_proposals p where p.id=if_proposal.id);
update if_proposal set decision=(public.open_owner_decision((select id from if_ws),jsonb_build_object('kind','fact.inferred','route','owner_decides','title','Use changed name?',
  'approveEffect','Save.','notYetEffect','Nothing.','sourceLifecycle','inquiry_fact','sourceId',id::text,'revisionHash',hash,'adminMayDecide',false))->>'id')::uuid;
select public.record_owner_decision_delivery((select id from if_ws),decision,'digest','sent','unclaimed-owner@example.test','if-owner-link-changed-fixture',null) from if_proposal;
select public.claim_owner_decision((select id from if_ws),decision,hash,'approve','owner_link',null,null,'unclaimed-owner@example.test') from if_proposal;
update public.business_record_facts set value='"Owner corrected it"',updated_at=clock_timestamp() where workspace_id=(select id from if_ws) and fact_key='display_name';
select pg_temp.if_assert(public.inquiry_business_fact_revision((select id from if_ws),(select id from if_proposal)) is null,'old email revision is no longer current');
select pg_temp.if_expect(format('select public.confirm_inquiry_business_fact(%L,%L,%L,%L)',(select id from if_ws),id,decision,hash),'inquiry_fact_changed') from if_proposal;
-- Explicit corrections reach the same shared facts with exact actor provenance.
select pg_temp.if_expect(format($$select public.correct_inquiry_business_fact(%L,'f6300000-0000-4000-8000-000000000002','display_name','"Forged"')$$,id),'business_record_access_denied') from if_ws;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by)
  select id,'f6300000-0000-4000-8000-000000000002','admin','f6300000-0000-4000-8000-000000000001' from if_ws;
select pg_temp.if_expect(format($$select public.correct_inquiry_business_fact(%L,'f6300000-0000-4000-8000-000000000002','display_name','"Admin cannot confirm"')$$,id),'inquiry_access_denied') from if_ws;
select public.correct_inquiry_business_fact(id,'f6300000-0000-4000-8000-000000000001','display_name','"Operator correction"') from if_ws;
select pg_temp.if_assert((select verified and source='operator' and value='"Operator correction"'::jsonb from public.business_record_facts where workspace_id=(select id from if_ws) and fact_key='display_name'),'operator correction is verified with canonical provenance');
update public.workspace_memberships set role='owner' where workspace_id=(select id from if_ws) and user_id='f6300000-0000-4000-8000-000000000002';
select public.patch_business_record(id,'f6300000-0000-4000-8000-000000000002','fact-outsider@example.test','owner',
  (select revision from public.business_records where workspace_id=if_ws.id),
  '{"facts":{"links":{"value":[{"kind":"instagram","url":"https://instagram.com/fixture"},{"kind":"website","url":"https://old.example.test"}],"verified":true}}}',
  'f6300000-0000-4000-8000-000000000005',repeat('a',64)) from if_ws;
select public.correct_inquiry_business_fact(id,'f6300000-0000-4000-8000-000000000002','links','[{"kind":"website","url":"https://new.example.test"}]') from if_ws;
select pg_temp.if_assert(public.business_record_entity_state((select id from if_ws),'fact','links')->'value'=
  '[{"kind":"instagram","url":"https://instagram.com/fixture"},{"kind":"website","url":"https://new.example.test"}]'::jsonb,'website correction preserves other shared links');
select pg_temp.if_assert((select source='owner' and verified from public.business_record_facts where workspace_id=(select id from if_ws) and fact_key='links'),'owner correction records owner provenance');
select pg_temp.if_expect(format($$select public.correct_inquiry_business_fact(%L,'f6300000-0000-4000-8000-000000000002','hours','{}')$$,id),'inquiry_fact_invalid') from if_ws;
rollback;
