\set ON_ERROR_STOP on
\o /dev/null
-- Disposable local DB only: committed fixture permits actual READ ONLY requests.
begin;
\ir support/provider-seat-readonly-website-fixture.sql
commit;
create temporary table psr_final as select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl from pg_proc p where pronamespace='public'::regnamespace and prokind='f';
create temporary table psr_cases(statement text);
insert into psr_cases values
 ($$select count(*)=1 and bool_and(tenant_id='provider-reader-site' and source='reservation') from public.read_website_current_tenant('@workspace','@work','@actor','@email')$$),
 ($$select count(*)=1 and bool_and(tenant_id='provider-reader-site' and revision=1) from public.read_website_linked_publications('@workspace','@work','@actor','@email')$$),
 ($$select count(*)=1 and bool_and(hostname='provider-reader.example.test' and current) from public.read_website_domain_approvals('@workspace','@work','@actor','@email')$$);
update psr_cases set statement=replace(replace(replace(replace(statement,'@workspace','5e181300-0000-4000-8000-000000000010'),'@work',:'provider_reader_work_id'),'@actor','5e181300-0000-4000-8000-000000000003'),'@email','pw-staff@example.test');
create function pg_temp.psr_run(statement text,denied boolean default false) returns void language plpgsql as $$declare ok boolean; begin
 begin execute statement into ok;
 exception when others then if denied and sqlstate='P0001' and sqlerrm='workspace_access_denied' then return; end if; raise; end;
 if denied or ok is distinct from true then raise exception 'provider snapshot read assertion failed: %',statement; end if;
end $$;
select pg_temp.pw_assert(not exists(select 1 from public.workspace_memberships where workspace_id='5e181300-0000-4000-8000-000000000010' and user_id='5e181300-0000-4000-8000-000000000003'),'staff has no direct client membership');
select format('begin read only; set local role service_role; select pg_temp.psr_run(%L); rollback;',statement) from psr_cases \gexec
-- Exact direct owner reads remain available.
select format('begin read only; set local role service_role; select pg_temp.psr_run(%L); rollback;',replace(replace(statement,'000000000003','000000000001'),'pw-staff@example.test','pw-owner@example.test')) from psr_cases \gexec
-- Wrong email, unverified staff, unstaffed member and unrelated agency all deny.
select format('begin read only; set local role service_role; select pg_temp.psr_run(%L,true); rollback;',replace(statement,'pw-staff@example.test','wrong@example.test')) from psr_cases \gexec
select format('begin read only; set local role service_role; select pg_temp.psr_run(%L,true); rollback;',replace(replace(statement,'000000000003',actor),'pw-staff@example.test',email)) from psr_cases cross join (values ('000000000004','pw-unstaffed@example.test'),('000000000005','pw-other@example.test'),('000000000006','pw-unverified@example.test')) denied(actor,email) \gexec
select format('begin read only; set local role service_role; select pg_temp.psr_run(%L,true); rollback;',replace(statement,:'provider_reader_work_id',:'provider_reader_foreign_work_id')) from psr_cases \gexec
-- Helper write controls refuse even in READ ONLY; browser and service ACLs stay private.
begin read only;
select pg_temp.pw_expect($$select public.website_document_read_actor('5e181300-0000-4000-8000-000000000010',null,'5e181300-0000-4000-8000-000000000003','pw-staff@example.test',false,true)$$,'readonly_authority_write_refused');
select public.website_document_read_actor('5e181300-0000-4000-8000-000000000010',null,'5e181300-0000-4000-8000-000000000003','pw-staff@example.test',true,false);
rollback;
select pg_temp.pw_assert(not has_function_privilege(role,'public.website_document_read_actor(uuid,uuid,uuid,text,boolean,boolean)','execute'),'snapshot helper private to '||role) from (values ('anon'),('authenticated'),('service_role')) roles(role);
-- Rehearse the older tail underneath the new package wrapper, then restore both.
select to_regprocedure('public.system_read_scope_package_core(uuid,uuid,text,boolean)') is not null as package_reader_tail \gset
\if :package_reader_tail
\ir ../supabase/migrations/rollback-20261020090026_package_readonly_authority.sql
\endif
-- Rollback restores direct-membership-only snapshot behavior; final reapply is exact.
\ir ../supabase/migrations/rollback-20261018130000_provider_seat_readonly_website_authority.sql
select format('begin read only; set local role service_role; select pg_temp.psr_run(%L,true); rollback;',statement) from psr_cases \gexec
\ir ../supabase/migrations/20261018130000_provider_seat_readonly_website_authority.sql
\ir ../supabase/migrations/20261018130000_provider_seat_readonly_website_authority.sql
\if :package_reader_tail
\ir ../supabase/migrations/20261020090026_package_readonly_authority.sql
\endif
select pg_temp.pw_assert(not exists(
 (select * from psr_final except select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl from pg_proc p where pronamespace='public'::regnamespace and prokind='f') union all
 (select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl from pg_proc p where pronamespace='public'::regnamespace and prokind='f' except select * from psr_final)
),'tail rollback/reapply exact full function catalog, including live-effect writer bodies and ACLs');
-- Committed revocation is seen by the next request snapshot.
begin;
select public.set_agency_client_staff('5e181300-0000-4000-8000-000000000002','pw-agency@example.test','5e181300-0000-4000-8000-000000000020','5e181300-0000-4000-8000-000000000010','5e181300-0000-4000-8000-000000000003',false);
commit;
select format('begin read only; set local role service_role; select pg_temp.psr_run(%L,true); rollback;',statement) from psr_cases \gexec
begin;
select public.set_agency_client_staff('5e181300-0000-4000-8000-000000000002','pw-agency@example.test','5e181300-0000-4000-8000-000000000020','5e181300-0000-4000-8000-000000000010','5e181300-0000-4000-8000-000000000003',true);
delete from public.workspace_memberships where workspace_id='5e181300-0000-4000-8000-000000000020' and user_id='5e181300-0000-4000-8000-000000000003';
commit;
select format('begin read only; set local role service_role; select pg_temp.psr_run(%L,true); rollback;',statement) from psr_cases \gexec
begin;
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('5e181300-0000-4000-8000-000000000020','5e181300-0000-4000-8000-000000000003','member','5e181300-0000-4000-8000-000000000002');
select public.end_business_provider('5e181300-0000-4000-8000-000000000001','pw-owner@example.test','5e181300-0000-4000-8000-000000000010','Local snapshot revocation fixture');
commit;
select format('begin read only; set local role service_role; select pg_temp.psr_run(%L,true); rollback;',statement) from psr_cases \gexec
\o
\echo Provider website snapshot proof: three meaningful authorized READ ONLY RPC results, direct owner controls, identity/scope/staff/member/seat denial, private helper ACLs and exact tail rollback/reapply.
