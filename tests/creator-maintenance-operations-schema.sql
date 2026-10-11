\set creator_maintenance_retain on
\ir money-apps-creator-quote-ledger-schema.sql
-- Previous fixture commits ONLY with the explicit retained-fixture switch above.
-- All identities/rates are fictional local native policy. Run once on a fresh
-- disposable schema with both operations forwards already applied.
begin read only;
set local role service_role;
select pg_temp.mcq_assert((public.read_creator_maintenance_operations('cd161600-0000-4000-8000-000000000020','cd161600-0000-4000-8000-000000000003','mcq-operator@example.test')->>'workspaceId')='cd161600-0000-4000-8000-000000000020','genuine READ ONLY own creator graph');
select pg_temp.mcq_denied($q$select public.read_creator_maintenance_operations('cd161600-0000-4000-8000-000000000020','cd161600-0000-4000-8000-000000000004','mcq-stranger@example.test')$q$,'connect_denied');
rollback;
begin;
create temporary table maintenance_operations_receipt as
select public.record_creator_maintenance_from_workspace(l.creator_workspace_id,l.id,l.source_revision_id,'cd161600-0000-4000-8000-000000000003','mcq-operator@example.test','takeover',null,null,now()+interval '6 months') as body from public.creator_listings l where l.creator_workspace_id='cd161600-0000-4000-8000-000000000020';
select pg_temp.mcq_assert((select count(*)=1 and bool_and(body->>'recorded_by'='cd161600-0000-4000-8000-000000000003' and body->>'maintainer_state'='takeover') from maintenance_operations_receipt),'exact current actor maintenance receipt');
select pg_temp.mcq_denied(format('select public.record_creator_maintenance_from_workspace(%L,%L,%L,%L,%L,%L,null,null,now()+interval ''6 months'')','cd161600-0000-4000-8000-000000000010',l.id,l.source_revision_id,'cd161600-0000-4000-8000-000000000003','mcq-operator@example.test','takeover'),'creator_maintenance_scope_denied') from public.creator_listings l where l.creator_workspace_id='cd161600-0000-4000-8000-000000000020';
select pg_temp.mcq_denied(format('select public.record_creator_maintenance_from_workspace(%L,%L,%L,%L,%L,%L,null,null,now()+interval ''6 months'')',l.creator_workspace_id,l.id,'cd161600-0000-4000-8000-000000000099','cd161600-0000-4000-8000-000000000003','mcq-operator@example.test','takeover'),'creator_maintenance_scope_denied') from public.creator_listings l where l.creator_workspace_id='cd161600-0000-4000-8000-000000000020';
select pg_temp.mcq_assert(not has_function_privilege('anon','public.read_creator_maintenance_operations(uuid,uuid,text)','EXECUTE') and not has_function_privilege('authenticated','public.record_creator_maintenance_from_workspace(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz)','EXECUTE') and has_function_privilege('service_role','public.read_creator_maintenance_operations(uuid,uuid,text)','EXECUTE'),'service-only supplied actor ports');
rollback;
