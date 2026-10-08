\set ON_ERROR_STOP on
-- Fictional local contracts. No provider is called; delivery is a recorded fixture only.
begin;
create function pg_temp.e_assert(ok boolean, message text) returns void language plpgsql as $$begin if ok is not true then raise exception 'enterprise assertion failed: %',message; end if; end;$$;
create function pg_temp.e_expect(statement text, expected text) returns void language plpgsql as $$begin begin execute statement; exception when others then if sqlerrm<>expected then raise exception 'expected % got %',expected,sqlerrm; end if; return; end; raise exception 'expected % but succeeded',expected;end;$$;
insert into public.users(id,email,verified_at) select ('27400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'enterprise-'||n||'@example.test',now() from generate_series(1,3) n;
insert into public.workspaces(id,kind,name,created_by) select ('27400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n=45 then 'agency' else 'customer' end,'Enterprise fixture '||n,'27400000-0000-4000-8000-000000000001' from generate_series(41,45) n;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) select id,'27400000-0000-4000-8000-000000000001','owner','27400000-0000-4000-8000-000000000001' from public.workspaces where id in('27400000-0000-4000-8000-000000000041','27400000-0000-4000-8000-000000000042','27400000-0000-4000-8000-000000000045');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('27400000-0000-4000-8000-000000000041','27400000-0000-4000-8000-000000000002','member','27400000-0000-4000-8000-000000000001');
create function pg_temp.e_put(id integer,business integer,parent integer default null,expected integer default 0) returns jsonb language sql as $$
select public.change_enterprise_unit('27400000-0000-4000-8000-000000000001','enterprise-1@example.test',jsonb_build_object('action','put','organizationId','27400000-0000-4000-8000-000000000041','id',('27400000-0000-4000-8000-'||lpad(id::text,12,'0'))::uuid,'businessId',('27400000-0000-4000-8000-'||lpad(business::text,12,'0'))::uuid,'parentId',case when parent is null then null else ('27400000-0000-4000-8000-'||lpad(parent::text,12,'0'))::uuid end,'name','Unit '||id,'kind','location','expectedRevision',expected));$$;
select pg_temp.e_assert(pg_temp.e_put(61,41)->>'revision'='1','create explicit Unit');
select pg_temp.e_assert(pg_temp.e_put(61,41)->>'revision'='1','exact create retry');
select pg_temp.e_assert(pg_temp.e_put(62,42,61)->>'revision'='1','cross-business organization hierarchy with direct access');
select pg_temp.e_expect('select pg_temp.e_put(61,41,62,1)','enterprise_cycle');
select pg_temp.e_expect('select pg_temp.e_put(61,42,null,1)','enterprise_identity');
select pg_temp.e_expect('select pg_temp.e_put(61,41,null,8)','enterprise_stale');
select pg_temp.e_expect('select pg_temp.e_put(63,43)','enterprise_denied');
select pg_temp.e_expect($q$select public.change_enterprise_unit('27400000-0000-4000-8000-000000000002','enterprise-2@example.test','{"action":"archive","organizationId":"27400000-0000-4000-8000-000000000041","id":"27400000-0000-4000-8000-000000000061","expectedRevision":1}')$q$,'enterprise_denied');
select pg_temp.e_assert(not has_table_privilege('service_role','public.enterprise_units','select') and not has_function_privilege('anon','public.change_enterprise_unit(uuid,text,jsonb)','execute'),'private native authority boundary');
select public.system_version_validate_locks('{"policy":{"required":true}}','["policy.required"]');
select pg_temp.e_expect($q$select public.system_version_validate_locks('{"policy":{}}','["policy.missing"]')$q$,'system_version_input_invalid');
select pg_temp.e_expect($q$select public.system_version_validate_locks('{"policy":{}}','["__proto__.x"]')$q$,'system_version_input_invalid');
insert into public.workspace_providers(id,customer_workspace_id,provider_workspace_id,source,started_by) values('27400000-0000-4000-8000-000000000063','27400000-0000-4000-8000-000000000041','27400000-0000-4000-8000-000000000045','business_choice','27400000-0000-4000-8000-000000000001');
insert into public.provider_seats(id,customer_workspace_id,agency_workspace_id,granted_by_kind,granted_by) values('27400000-0000-4000-8000-000000000065','27400000-0000-4000-8000-000000000041','27400000-0000-4000-8000-000000000045','owner','27400000-0000-4000-8000-000000000001');
insert into public.agency_verifications(agency_workspace_id,effect,status,evidence,verified_by,verifier_is_agency_member) select '27400000-0000-4000-8000-000000000045',effect,'verified','{"fixture":"not-commercial-evidence"}','27400000-0000-4000-8000-000000000001',true from unnest(array['email','publish']) effect;
create temporary table e_hf_result(result jsonb);
insert into e_hf_result select public.install_home_finder('27400000-0000-4000-8000-000000000001','enterprise-1@example.test',jsonb_build_object('workspaceId','27400000-0000-4000-8000-000000000041','agencyId','27400000-0000-4000-8000-000000000045','commandId','27400000-0000-4000-8000-000000000064','name','Fictional search','externalInstallationId','fictional-enterprise-idx','brokerageName','Fictional Brokerage','approvedOrigin','https://brokerage.example.test','licenseReference','fictional-license','licenseExpiresAt',now()+interval '1 day','sourceName','Fictional Source'),repeat('a',64));
select pg_temp.e_assert((select result->>'lifecycle'='draft' and result->>'runtimeAllowed'='false' from e_hf_result),'install never claims live qualification');
select pg_temp.e_expect($q$select public.read_home_finder_public('27400000-0000-4000-8000-000000000064')$q$,'home_finder_unavailable');
select public.observe_home_finder('27400000-0000-4000-8000-000000000041','27400000-0000-4000-8000-000000000001','enterprise-1@example.test','27400000-0000-4000-8000-000000000064',1,(select jsonb_agg(jsonb_build_object('requirement','Fixture '||n,'state','confirmed','source','fixture only','observedAt',now(),'responsibleParty','fixture only')) from generate_series(1,9)n),true);
select public.transition_system_lifecycle('27400000-0000-4000-8000-000000000041','27400000-0000-4000-8000-000000000001','enterprise-1@example.test',(select (result->>'systemId')::uuid from e_hf_result),(select s.change_number from public.systems s join e_hf_result r on s.id=(r.result->>'systemId')::uuid),'live');
select pg_temp.e_assert(public.read_home_finder_public('27400000-0000-4000-8000-000000000064')->>'runtimeAllowed'='true','live native qualification gate fixture');
select public.begin_home_finder_intake('27400000-0000-4000-8000-000000000064','27400000-0000-4000-8000-000000000071',1,repeat('b',64));
select pg_temp.e_expect($q$select public.begin_home_finder_intake('27400000-0000-4000-8000-000000000064','27400000-0000-4000-8000-000000000071',1,repeat('b',64))$q$,'home_finder_inflight');
select public.finish_home_finder_intake('27400000-0000-4000-8000-000000000064','27400000-0000-4000-8000-000000000071',repeat('b',64),'pending','fictional-signed-receipt');
select pg_temp.e_assert(public.begin_home_finder_intake('27400000-0000-4000-8000-000000000064','27400000-0000-4000-8000-000000000071',1,repeat('b',64))->>'status'='pending','accepted replay does not start duplicate');
create temporary table e_hf_config(input jsonb);
insert into e_hf_config select jsonb_build_object('workspaceId','27400000-0000-4000-8000-000000000041','bindingId','27400000-0000-4000-8000-000000000064','commandId','27400000-0000-4000-8000-000000000072','expectedRevision',1,'expectedChange',s.change_number,'brokerageName','Fictional Brokerage','approvedOrigin','https://updated.example.test','licenseReference','fictional-renewed-license','licenseExpiresAt',now()+interval '2 days','sourceName','Fictional Source') from public.systems s join e_hf_result r on s.id=(r.result->>'systemId')::uuid;
select pg_temp.e_assert(public.configure_home_finder('27400000-0000-4000-8000-000000000001','enterprise-1@example.test',(select input from e_hf_config),repeat('c',64))->>'revision'='2','configuration CAS records new generation');
select pg_temp.e_assert(public.configure_home_finder('27400000-0000-4000-8000-000000000001','enterprise-1@example.test',(select input from e_hf_config),repeat('c',64))->>'revision'='2','exact configuration retry');
select pg_temp.e_assert((select status='active' and qualified_at is null and readiness is null from public.home_finder_bindings where id='27400000-0000-4000-8000-000000000064') and (select s.lifecycle='paused' from public.systems s join e_hf_result r on s.id=(r.result->>'systemId')::uuid),'renewal pauses new intake and clears qualification');
select pg_temp.e_assert(public.read_home_finder_receipt_scope('27400000-0000-4000-8000-000000000064','27400000-0000-4000-8000-000000000071')->>'status'='pending','prior accepted receipt survives configuration');
select pg_temp.e_assert(public.export_workspace_v3_category('27400000-0000-4000-8000-000000000041','27400000-0000-4000-8000-000000000001','enterprise-1@example.test','home_finder_receipts',0,200)#>>'{items,0,status}'='pending','business exports accepted outcomes');
select pg_temp.e_assert(not ((public.export_workspace_v3_category('27400000-0000-4000-8000-000000000041','27400000-0000-4000-8000-000000000001','enterprise-1@example.test','home_finder_receipts',0,200)#>'{items,0}') ?| array['provider_reference','input_digest','buyer','email','reference']),'export excludes receipt capability and buyer content');
select public.revoke_home_finder('27400000-0000-4000-8000-000000000041','27400000-0000-4000-8000-000000000001','enterprise-1@example.test','27400000-0000-4000-8000-000000000064',2);
select pg_temp.e_expect($q$select public.read_home_finder_probe('27400000-0000-4000-8000-000000000064')$q$,'home_finder_unavailable');
select pg_temp.e_assert(public.read_home_finder_receipt_scope('27400000-0000-4000-8000-000000000064','27400000-0000-4000-8000-000000000071')->>'status'='pending','accepted obligation survives revocation');
\if :{?keep_fixture}
commit;
begin read only;
\endif
select public.read_enterprise_units('27400000-0000-4000-8000-000000000041','27400000-0000-4000-8000-000000000001','enterprise-1@example.test');
select public.read_home_finder_bindings('27400000-0000-4000-8000-000000000041','27400000-0000-4000-8000-000000000001','enterprise-1@example.test');
select public.export_workspace_v3_category('27400000-0000-4000-8000-000000000041','27400000-0000-4000-8000-000000000001','enterprise-1@example.test','enterprise_units',0,200);
select public.read_workspace_exit_handoff_plan('27400000-0000-4000-8000-000000000041','27400000-0000-4000-8000-000000000001','enterprise-1@example.test');
rollback;
