\set ON_ERROR_STOP on
-- Committed native export setup; each request below uses a genuine READ ONLY
-- transaction. Revocation changes are committed in separate READ WRITE setup.
create function pg_temp.mer_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'money export read-only assertion: %',label;end if;end $$;
create function pg_temp.mer_probe(q text,expected_state text default null,expected_message text default null) returns void language plpgsql as $$
declare ok boolean;
begin
 begin execute q into ok;
 exception when others then
  if sqlstate=expected_state and (expected_message is null or sqlerrm=expected_message) then return;end if;
  raise;
 end;
 if expected_state is not null then raise exception 'Expected % but request succeeded: %',expected_state,q;end if;
 perform pg_temp.mer_assert(ok,q);
end $$;
create temporary table mer_final as select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl,p.provolatile,p.prosecdef,p.proconfig,p.prokind from pg_proc p where pronamespace='public'::regnamespace and prokind in('f','p');
\ir ../supabase/migrations/rollback-20261020090030_money_export_readonly_authority.sql
create temporary table mer_baseline as select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl,p.provolatile,p.prosecdef,p.proconfig,p.prokind from pg_proc p where pronamespace='public'::regnamespace and prokind in('f','p');
begin read write;
insert into public.users(id,email,verified_at) values
 ('e4010000-0000-4000-8000-000000000001','money-export-current-owner@example.test',now()),
 ('e4010000-0000-4000-8000-000000000002','money-export-current-agency-owner@example.test',now()),
 ('e4010000-0000-4000-8000-000000000003','money-export-current-agency-staff@example.test',now()),
 ('e4010000-0000-4000-8000-000000000004','money-export-current-foreign-owner@example.test',now()),
 ('e4010000-0000-4000-8000-000000000005','money-export-current-unassigned-agency@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('e4010000-0000-4000-8000-000000000010','customer','Export owner business','e4010000-0000-4000-8000-000000000001'),
 ('e4010000-0000-4000-8000-000000000011','customer','Foreign owner business','e4010000-0000-4000-8000-000000000004'),
 ('e4010000-0000-4000-8000-000000000020','agency','Export provider agency','e4010000-0000-4000-8000-000000000002');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('e4010000-0000-4000-8000-000000000010','e4010000-0000-4000-8000-000000000001','owner','e4010000-0000-4000-8000-000000000001'),
 ('e4010000-0000-4000-8000-000000000011','e4010000-0000-4000-8000-000000000004','owner','e4010000-0000-4000-8000-000000000004'),
 ('e4010000-0000-4000-8000-000000000020','e4010000-0000-4000-8000-000000000002','owner','e4010000-0000-4000-8000-000000000002'),
 ('e4010000-0000-4000-8000-000000000020','e4010000-0000-4000-8000-000000000003','member','e4010000-0000-4000-8000-000000000002'),
 ('e4010000-0000-4000-8000-000000000020','e4010000-0000-4000-8000-000000000005','member','e4010000-0000-4000-8000-000000000002');
insert into public.tenants(id,stable_id,site_name,active) values('money-export-readonly','e4010000-0000-4000-8000-000000000030','Fictional retained client site',true);
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt) values('e4010000-0000-4000-8000-000000000030','money-export-readonly','e4010000-0000-4000-8000-000000000010','e4010000-0000-4000-8000-000000000001','e4010000-0000-4000-8000-000000000031',repeat('a',64),'{}');
select public.choose_business_provider('e4010000-0000-4000-8000-000000000001','money-export-current-owner@example.test','e4010000-0000-4000-8000-000000000010','e4010000-0000-4000-8000-000000000020');
select public.set_agency_client_staff('e4010000-0000-4000-8000-000000000002','money-export-current-agency-owner@example.test','e4010000-0000-4000-8000-000000000020','e4010000-0000-4000-8000-000000000010','e4010000-0000-4000-8000-000000000003',true);
select public.patch_business_record('e4010000-0000-4000-8000-000000000010','e4010000-0000-4000-8000-000000000001','money-export-current-owner@example.test','owner',0,'{"facts":{"owner_recipient":{"value":{"email":"money-export-current-owner@example.test"}}}}','e4010000-0000-4000-8000-000000000032',repeat('b',64));
create temporary table mer_build as select public.start_workspace_export_build('e4010000-0000-4000-8000-000000000010','e4010000-0000-4000-8000-000000000003','money-export-current-agency-staff@example.test') body;
select pg_temp.mer_assert((select body->>'requesterRole'='operator' and body->>'deliverTo'='money-export-current-owner@example.test' and not(body ?| array['downloadToken','download_token_hash','downloadUrl','body']) from mer_build),'assigned provider initiates preparation delivered to the owner only');
select public.append_workspace_export_build_part((select (body->>'buildId')::uuid from mer_build),0,'{"schemaVersion":3,"workspaceId":"e4010000-0000-4000-8000-000000000010","privateFixture":"Fictional owner archive"}');
select public.complete_workspace_export_build((select (body->>'buildId')::uuid from mer_build),'{"categories":["systems"]}',encode(sha256('fictional-owner-only-export-token'::bytea),'hex'),'{"systems":0}');
select pg_temp.mer_assert(not exists(select 1 from public.workspace_memberships where workspace_id='e4010000-0000-4000-8000-000000000010' and user_id='e4010000-0000-4000-8000-000000000003'),'operator has no direct client membership');
create temporary table mer_cases(label text,statement text,exposed boolean,owner_only boolean);
insert into mer_cases values
 ('exit plan',$q$select public.read_workspace_exit_handoff_plan('e4010000-0000-4000-8000-000000000010','@actor','@email')->>'businessRecordRetained'='true'$q$,true,false),
 ('exit core',$q$select public.read_workspace_exit_handoff_plan_before_evidence('e4010000-0000-4000-8000-000000000010','@actor','@email')->>'businessRecordRetained'='true'$q$,false,false),
 ('build status',$q$select public.read_workspace_export_build('@build','@actor','@email')->>'status'='ready'$q$,true,false),
 ('owner status',$q$select public.read_workspace_export_owner_status('@build','@actor','@email')->>'status'='ready'$q$,true,true),
 ('owner part',$q$select public.read_workspace_export_owner_part('@build','@actor','@email',0)->>'body'='{"schemaVersion":3,"workspaceId":"e4010000-0000-4000-8000-000000000010","privateFixture":"Fictional owner archive"}'$q$,true,true);
-- Native category assembly traverses every retained wrapper, including money
-- and recovery exports. Private historical wrappers remain private.
insert into mer_cases
select p.proname,format('select public.%I(''e4010000-0000-4000-8000-000000000010'',''@actor'',''@email'',''business_record'',0,10)->>''category''=''business_record''',p.proname),p.proname='export_workspace_v3_category',false
from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'export_workspace_v3_category%%';
insert into mer_cases
select 'public category '||category,format('select public.export_workspace_v3_category(''e4010000-0000-4000-8000-000000000010'',''@actor'',''@email'',%L,0,10)->>''category''=%L',category,category),true,false
from unnest(public.workspace_export_v3_categories()) category;
update mer_cases set statement=replace(statement,'@build',(select body->>'buildId' from mer_build));
grant select on mer_cases,mer_build to service_role;
commit;
-- The Connect-era locking helper reproduces 25006 even for an authorized
-- assigned provider, and before the owner-only boundary can return its denial.
select format('begin read only; %s select pg_temp.mer_probe(%L,''25006''); rollback;',case when exposed then 'set local role service_role;' else '' end,replace(replace(statement,'@actor','e4010000-0000-4000-8000-000000000003'),'@email','money-export-current-agency-staff@example.test')) from mer_cases \gexec
\ir ../supabase/migrations/20261020090030_money_export_readonly_authority.sql
select pg_temp.mer_assert(not exists((select * from mer_final except select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl,p.provolatile,p.prosecdef,p.proconfig,p.prokind from pg_proc p where pronamespace='public'::regnamespace and prokind in('f','p')) union all (select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl,p.provolatile,p.prosecdef,p.proconfig,p.prokind from pg_proc p where pronamespace='public'::regnamespace and prokind in('f','p') except select * from mer_final)),'exact full public routine catalog reapply preserves writer bodies/ACL/volatility/security');
-- All five real classes work for the current exact business owner. The private
-- core is exercised as DB owner, and indirectly by the public plan wrapper.
select format('begin read only; %s select pg_temp.mer_probe(%L); rollback;',case when exposed then 'set local role service_role;' else '' end,replace(replace(statement,'@actor','e4010000-0000-4000-8000-000000000001'),'@email','money-export-current-owner@example.test')) from mer_cases \gexec
select format('begin read only; %s select pg_temp.mer_probe(%L,%L,%L); rollback;',case when exposed then 'set local role service_role;' else '' end,replace(replace(statement,'@actor','e4010000-0000-4000-8000-000000000003'),'@email','money-export-current-agency-staff@example.test'),case when owner_only then 'P0001' end,case when owner_only then 'workspace_export_denied' end) from mer_cases \gexec
begin read only;
set local role service_role;
select pg_temp.mer_assert(not(public.read_workspace_export_build((select (body->>'buildId')::uuid from mer_build),'e4010000-0000-4000-8000-000000000003','money-export-current-agency-staff@example.test') ?| array['downloadToken','download_token_hash','downloadUrl','body']),'provider status does not disclose owner download credentials/body');
select pg_temp.mer_probe(format('select public.read_workspace_export_build_part(%L,%L,0) is not null',(select body->>'buildId' from mer_build),repeat('0',64)),'P0001','workspace_export_link_invalid');
select pg_temp.mer_assert(not has_function_privilege('service_role','public.workspace_export_v3_read_role(uuid,uuid,text)','EXECUTE') and not has_function_privilege('service_role','public.read_workspace_exit_handoff_plan_before_evidence(uuid,uuid,text)','EXECUTE'),'pure authorization and plan core remain private');
select pg_temp.mer_assert(not exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'export_workspace_v3_category_%%' and has_function_privilege('service_role',p.oid,'EXECUTE')),'historical category wrappers remain private');
rollback;
-- A foreign business owner and an unassigned member of the same agency have
-- no authority. Wrong identity never succeeds or masks a READ ONLY failure.
select format('begin read only; %s select pg_temp.mer_probe(%L,''P0001'',''workspace_export_denied''); rollback;',case when exposed then 'set local role service_role;' else '' end,replace(replace(statement,'@actor','e4010000-0000-4000-8000-000000000004'),'@email','money-export-current-foreign-owner@example.test')) from mer_cases \gexec
select format('begin read only; %s select pg_temp.mer_probe(%L,''P0001'',''workspace_export_denied''); rollback;',case when exposed then 'set local role service_role;' else '' end,replace(replace(statement,'@actor','e4010000-0000-4000-8000-000000000005'),'@email','money-export-current-unassigned-agency@example.test')) from mer_cases \gexec
select format('begin read only; %s select pg_temp.mer_probe(%L,''P0001'',''workspace_export_denied''); rollback;',case when exposed then 'set local role service_role;' else '' end,replace(replace(statement,'@actor','e4010000-0000-4000-8000-000000000003'),'@email','wrong@example.test')) from mer_cases \gexec
begin read write;
update public.users set verified_at=null where id='e4010000-0000-4000-8000-000000000003';
commit;
select format('begin read only; %s select pg_temp.mer_probe(%L,''P0001'',''workspace_export_denied''); rollback;',case when exposed then 'set local role service_role;' else '' end,replace(replace(statement,'@actor','e4010000-0000-4000-8000-000000000003'),'@email','money-export-current-agency-staff@example.test')) from mer_cases \gexec
begin read write;
update public.users set verified_at=now() where id='e4010000-0000-4000-8000-000000000003';
select public.set_agency_client_staff('e4010000-0000-4000-8000-000000000002','money-export-current-agency-owner@example.test','e4010000-0000-4000-8000-000000000020','e4010000-0000-4000-8000-000000000010','e4010000-0000-4000-8000-000000000003',false);
commit;
select format('begin read only; %s select pg_temp.mer_probe(%L,''P0001'',''workspace_export_denied''); rollback;',case when exposed then 'set local role service_role;' else '' end,replace(replace(statement,'@actor','e4010000-0000-4000-8000-000000000003'),'@email','money-export-current-agency-staff@example.test')) from mer_cases \gexec
begin read write;
select public.set_agency_client_staff('e4010000-0000-4000-8000-000000000002','money-export-current-agency-owner@example.test','e4010000-0000-4000-8000-000000000020','e4010000-0000-4000-8000-000000000010','e4010000-0000-4000-8000-000000000003',true);
commit;
-- Reinstated staff authority is current and does not restore download rights.
select format('begin read only; %s select pg_temp.mer_probe(%L,%L,%L); rollback;',case when exposed then 'set local role service_role;' else '' end,replace(replace(statement,'@actor','e4010000-0000-4000-8000-000000000003'),'@email','money-export-current-agency-staff@example.test'),case when owner_only then 'P0001' end,case when owner_only then 'workspace_export_denied' end) from mer_cases \gexec
begin read write;
select public.end_provider_seat('e4010000-0000-4000-8000-000000000001','money-export-current-owner@example.test','e4010000-0000-4000-8000-000000000010','e4010000-0000-4000-8000-000000000020','Fictional local authority proof');
commit;
select format('begin read only; %s select pg_temp.mer_probe(%L,''P0001'',''workspace_export_denied''); rollback;',case when exposed then 'set local role service_role;' else '' end,replace(replace(statement,'@actor','e4010000-0000-4000-8000-000000000003'),'@email','money-export-current-agency-staff@example.test')) from mer_cases \gexec
-- Seat/staff loss has no effect on the owner's retained archive or site.
select format('begin read only; %s select pg_temp.mer_probe(%L); rollback;',case when exposed then 'set local role service_role;' else '' end,replace(replace(statement,'@actor','e4010000-0000-4000-8000-000000000001'),'@email','money-export-current-owner@example.test')) from mer_cases \gexec
select pg_temp.mer_assert((select active from public.tenants where id='money-export-readonly'),'retained site remains active');
\ir ../supabase/migrations/rollback-20261020090030_money_export_readonly_authority.sql
select pg_temp.mer_assert(not exists((select * from mer_baseline except select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl,p.provolatile,p.prosecdef,p.proconfig,p.prokind from pg_proc p where pronamespace='public'::regnamespace and prokind in('f','p')) union all (select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl,p.provolatile,p.prosecdef,p.proconfig,p.prokind from pg_proc p where pronamespace='public'::regnamespace and prokind in('f','p') except select * from mer_baseline)),'exact baseline full routine catalog restored including writer bodies and ACL');
\ir ../supabase/migrations/20261020090030_money_export_readonly_authority.sql
\echo 'Money export/exit READ ONLY: native provider preparation/status; exact business owner archive; outsider/identity/assignment/seat denial; baseline25006 and exact catalog rollback/reapply passed.'
