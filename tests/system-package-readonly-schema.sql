\set ON_ERROR_STOP on
-- Rehearse the late Package repair independently before native setup. Exact
-- catalog equality includes writer bodies, ACLs, volatility and security flags.
create function pg_temp.spr_catalog_assert(ok boolean) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Package repair changed public catalog after rollback/reapply'; end if; end $$;
create temporary table spr_final_catalog as select p.oid::regprocedure::text signature,
 pg_get_functiondef(p.oid) definition,p.proacl,p.provolatile,p.prosecdef,p.proconfig
 from pg_proc p where pronamespace='public'::regnamespace and prokind='f';
\ir ../supabase/migrations/rollback-20261016120600_package_readonly_authority.sql
create temporary table spr_rollback_catalog as select p.oid::regprocedure::text signature,
 pg_get_functiondef(p.oid) definition,p.proacl,p.provolatile,p.prosecdef,p.proconfig
 from pg_proc p where pronamespace='public'::regnamespace and prokind='f';
\ir ../supabase/migrations/20261016120600_package_readonly_authority.sql
select pg_temp.spr_catalog_assert(not exists(
 (select * from spr_final_catalog except select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl,p.provolatile,p.prosecdef,p.proconfig from pg_proc p where pronamespace='public'::regnamespace and prokind='f')
 union all
 (select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl,p.provolatile,p.prosecdef,p.proconfig from pg_proc p where pronamespace='public'::regnamespace and prokind='f' except select * from spr_final_catalog)
));
-- Every request below is a genuine READ ONLY service-role transaction.
-- Native setup/revocation changes are committed separately beforehand.
begin read write;
\ir support/system-package-readonly-fixture.sql
create function pg_temp.spr_probe(q text,denied boolean default false) returns void language plpgsql as $$
declare result boolean;
begin
 begin execute q into result;
 exception when others then
  if denied and sqlstate='P0001' and sqlerrm in ('business_record_access_denied','workspace_membership_required','system_not_found') then return; end if;
  raise;
 end;
 if denied then
  if result is true then raise exception 'Package read-only authority leaked: %',q; end if;
 elsif result is distinct from true then raise exception 'Package read-only authorized read failed: %',q;
 end if;
end $$;
create function pg_temp.spr_expect_lock(q text) returns void language plpgsql as $$
begin
 begin execute q;
 exception when others then if sqlstate='25006' then return; end if; raise; end;
 raise exception 'Package baseline did not reproduce READ ONLY lock failure: %',q;
end $$;
create temporary table spr_readers(label text,statement text);
insert into spr_readers values
 ('actor scope',$q$select public.read_version_actor('@actor','@email')->'delegatedSystems' @> '[{"systemId":"@system"}]'::jsonb$q$),
 ('creator',$q$select public.read_system_package_creator('d7100000-0000-4000-8000-000000000011','@actor','@email','@system')->>'sourceRevisionId'='d7100000-0000-4000-8000-000000000021'$q$),
 ('system',$q$select public.read_business_system('d7100000-0000-4000-8000-000000000011','@actor','@email','@system')#>>'{system,id}'='@system'$q$),
 ('systems',$q$select public.read_business_systems('d7100000-0000-4000-8000-000000000011','@actor','@email')->'systems' @> '[{"id":"@system"}]'::jsonb$q$),
 ('version',$q$select public.read_system_version('@actor','@email','@version')->>'id'='@version'$q$),
 ('version by system',$q$select public.read_system_version_for_system('d7100000-0000-4000-8000-000000000011','@actor','@email','@system')->>'id'='@version'$q$),
 ('versions',$q$select public.read_business_versions('d7100000-0000-4000-8000-000000000011','@actor','@email')->'versions' @> '[{"id":"@version"}]'::jsonb$q$),
 ('native runtime',$q$select public.read_version_native_runtime('d7100000-0000-4000-8000-000000000011','@actor','@email','@version')->>'kind'='internal_app'$q$);
update spr_readers set statement=replace(replace(statement,'@system',:'spr_agency_system'),'@version',:'spr_agency_version');
create function pg_temp.spr_agency_probes(denied boolean default false) returns void language plpgsql as $$
declare r record;
begin
 for r in select * from spr_readers loop
  perform pg_temp.spr_probe(replace(replace(r.statement,'@actor','d7100000-0000-4000-8000-000000000001'),'@email','readonly-package-creator@example.test'),denied);
 end loop;
end $$;
grant select on spr_readers to service_role;
select pg_temp.spr_assert(not exists(select 1 from public.workspace_memberships where workspace_id='d7100000-0000-4000-8000-000000000011' and user_id='d7100000-0000-4000-8000-000000000001'),'agency has no target business membership');
commit;

-- Real committed native data reproduces both late-reader failures before the
-- repair. The probe accepts only PostgreSQL read-only SQLSTATE, never denial.
\ir ../supabase/migrations/rollback-20261016120600_package_readonly_authority.sql
select pg_temp.spr_catalog_assert(not exists(
 (select * from spr_rollback_catalog except select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl,p.provolatile,p.prosecdef,p.proconfig from pg_proc p where pronamespace='public'::regnamespace and prokind='f')
 union all
 (select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl,p.provolatile,p.prosecdef,p.proconfig from pg_proc p where pronamespace='public'::regnamespace and prokind='f' except select * from spr_rollback_catalog)
));
begin read only;
set local role service_role;
select pg_temp.spr_expect_lock($q$select public.read_system_package_listings('d7100000-0000-4000-8000-000000000011','d7100000-0000-4000-8000-000000000002','readonly-package-owner@example.test')$q$);
select pg_temp.spr_expect_lock(format($q$select public.read_system_package_creator('d7100000-0000-4000-8000-000000000011','d7100000-0000-4000-8000-000000000002','readonly-package-owner@example.test',%L)$q$,:'spr_agency_system'));
rollback;
\ir ../supabase/migrations/20261016120600_package_readonly_authority.sql
select pg_temp.spr_catalog_assert(not exists(
 (select * from spr_final_catalog except select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl,p.provolatile,p.prosecdef,p.proconfig from pg_proc p where pronamespace='public'::regnamespace and prokind='f')
 union all
 (select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl,p.provolatile,p.prosecdef,p.proconfig from pg_proc p where pronamespace='public'::regnamespace and prokind='f' except select * from spr_final_catalog)
));
-- Owner and exact-granted agency use the real public System and Version APIs.
begin read only;
set local role service_role;
select pg_temp.spr_probe(replace(replace(statement,'@actor','d7100000-0000-4000-8000-000000000002'),'@email','readonly-package-owner@example.test')) from spr_readers where label<>'actor scope';
select pg_temp.spr_agency_probes();
select pg_temp.spr_assert(jsonb_array_length(public.read_system_package_listings('d7100000-0000-4000-8000-000000000011','d7100000-0000-4000-8000-000000000002','readonly-package-owner@example.test'))=1,'owner lists qualified native Package');
select pg_temp.spr_assert(jsonb_array_length(public.read_system_package_listings('d7100000-0000-4000-8000-000000000011','d7100000-0000-4000-8000-000000000001','readonly-package-creator@example.test'))=1,'scoped agency lists qualified native Package');
select pg_temp.spr_assert(public.read_version_actor('d7100000-0000-4000-8000-000000000001','readonly-package-creator@example.test')->'delegatedSystems' @> jsonb_build_array(jsonb_build_object('systemId',:'spr_agency_system')),'actor snapshot carries exact installed System');
select pg_temp.spr_probe(format($q$select public.read_system_version('d7100000-0000-4000-8000-000000000001','readonly-package-creator@example.test',%L)->>'id'=%L$q$,:'spr_owner_version',:'spr_owner_version'),true);
select pg_temp.spr_probe(format($q$select public.read_business_system('d7100000-0000-4000-8000-000000000011','d7100000-0000-4000-8000-000000000001','readonly-package-creator@example.test',%L)#>>'{system,id}'=%L$q$,:'spr_owner_system',:'spr_owner_system'),true);
-- The actual native saved work behind the unrelated owner installation never
-- appears in the exact agency System/Version scope.
select pg_temp.spr_assert(not (public.read_business_systems('d7100000-0000-4000-8000-000000000011','d7100000-0000-4000-8000-000000000001','readonly-package-creator@example.test')->'systems' @> jsonb_build_array(jsonb_build_object('origin',jsonb_build_object('kind','saved_work','ref',:'spr_unrelated_work')))),'unrelated saved work is excluded');
select pg_temp.spr_assert(not has_function_privilege('service_role','public.system_package_read_work_ids(uuid,uuid,text)','EXECUTE'),'new snapshot grant helper is private');
select pg_temp.spr_assert(not has_function_privilege('service_role','public.system_read_scope_package_core(uuid,uuid,text,boolean)','EXECUTE'),'renamed snapshot core is private');
select pg_temp.spr_assert(not has_function_privilege('service_role','public.system_actor_scope_package_core(uuid,uuid,text,boolean)','EXECUTE'),'locking writer core remains private');
select pg_temp.spr_assert(not has_function_privilege('service_role','public.save_system_version_package_core(uuid,text,uuid,bigint,jsonb)','EXECUTE'),'qualification writer bypass remains private');
rollback;

begin read only;
set local role service_role;
select pg_temp.spr_probe(replace(replace(statement,'@actor','d7100000-0000-4000-8000-000000000004'),'@email','readonly-package-outsider@example.test'),true) from spr_readers;
select pg_temp.spr_probe(replace(replace(statement,'@actor','d7100000-0000-4000-8000-000000000001'),'@email','wrong@example.test'),true) from spr_readers;
select pg_temp.spr_probe($q$select jsonb_array_length(public.read_system_package_listings('d7100000-0000-4000-8000-000000000011','d7100000-0000-4000-8000-000000000001','wrong@example.test'))>0$q$,true);
rollback;

begin read write;
update public.users set verified_at=null where id='d7100000-0000-4000-8000-000000000001';
commit;
begin read only;
set local role service_role;
select pg_temp.spr_agency_probes(true);
select pg_temp.spr_assert(jsonb_array_length(public.read_version_actor('d7100000-0000-4000-8000-000000000001','readonly-package-creator@example.test')->'delegatedSystems')=0,'unverified actor has no exact-granted Systems');
rollback;
begin read write;
update public.users set verified_at=now() where id='d7100000-0000-4000-8000-000000000001';
update public.system_package_install_grants set expires_at=now()-interval '1 second' where id=:'spr_grant';
commit;
begin read only;
set local role service_role;
select pg_temp.spr_agency_probes(true);
rollback;
begin read write;
update public.system_package_install_grants set expires_at=:'spr_grant_expiry' where id=:'spr_grant';
select public.revoke_system_package_install('d7100000-0000-4000-8000-000000000011','d7100000-0000-4000-8000-000000000002','readonly-package-owner@example.test',:'spr_grant');
commit;
begin read only;
set local role service_role;
select pg_temp.spr_agency_probes(true);
rollback;
-- Restore fixture-only state to isolate independent authority-loss cases.
begin read write;
update public.system_package_install_grants set status='active' where id=:'spr_grant';
delete from public.workspace_memberships where workspace_id='d7100000-0000-4000-8000-000000000011' and user_id='d7100000-0000-4000-8000-000000000002';
commit;
begin read only;
set local role service_role;
select pg_temp.spr_agency_probes(true);
rollback;
begin read write;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('d7100000-0000-4000-8000-000000000011','d7100000-0000-4000-8000-000000000002','owner','d7100000-0000-4000-8000-000000000005');
update public.workspace_memberships set role='member' where workspace_id='d7100000-0000-4000-8000-000000000010' and user_id='d7100000-0000-4000-8000-000000000001';
commit;
begin read only;
set local role service_role;
select pg_temp.spr_agency_probes(true);
rollback;
begin read write;
update public.workspace_memberships set role='owner' where workspace_id='d7100000-0000-4000-8000-000000000010' and user_id='d7100000-0000-4000-8000-000000000001';
update public.workspace_delegations set status='revoked' where customer_workspace_id='d7100000-0000-4000-8000-000000000011' and agency_workspace_id='d7100000-0000-4000-8000-000000000010';
commit;
begin read only;
set local role service_role;
select pg_temp.spr_agency_probes(true);
rollback;
\echo 'Native creator Package grant/read APIs passed genuine READ ONLY authority probes.'
