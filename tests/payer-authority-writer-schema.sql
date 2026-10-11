\set ON_ERROR_STOP on
-- Called after the real multi-session cap/job/transition proof. No authority
-- function is mocked; committed fixture rows and real READ ONLY requests follow.
create function pg_temp.payer_assert(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'payer authority assertion: %',label;end if;end$$;
create function pg_temp.payer_probe(q text,expected_state text default null,expected_message text default null) returns void language plpgsql as $$declare ok boolean;begin
 begin execute q into ok;exception when others then
  if sqlstate=expected_state and (expected_message is null or sqlerrm=expected_message) then return;end if;raise;end;
 if expected_state is not null then raise exception 'Expected %: %',expected_state,q;end if;
 perform pg_temp.payer_assert(ok,q);
end$$;
create temporary table payer_final_catalog as select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl,p.provolatile,p.prosecdef,p.proconfig,p.prokind from pg_proc p where pronamespace='public'::regnamespace and prokind in('f','p');
create temporary table payer_terms as select to_jsonb(a) body from public.work_allowances a where award_key='payer-race-allowance';
create temporary table payer_jobs as select to_jsonb(j) body from public.job_economics j where workspace_id='a9050000-0000-4000-8000-000000000010';
create temporary table payer_transitions as select to_jsonb(t) body from public.workspace_payer_transitions t where workspace_id='a9050000-0000-4000-8000-000000000010';
\ir ../supabase/migrations/rollback-20261020090005_allowance_payer_writer_authority.sql
create temporary table payer_baseline_catalog as select p.oid::regprocedure::text signature,pg_get_functiondef(p.oid) definition,p.proacl,p.provolatile,p.prosecdef,p.proconfig,p.prokind from pg_proc p where pronamespace='public'::regnamespace and prokind in('f','p');
begin read only;
set local role service_role;
select pg_temp.payer_probe($q$select public.read_work_allowances('a9050000-0000-4000-8000-000000000001','payer-race-business@example.test',null,'a9050000-0000-4000-8000-000000000010') is not null$q$,'25006','cannot execute SELECT FOR SHARE in a read-only transaction');
commit;
\ir ../supabase/migrations/20261020090005_allowance_payer_writer_authority.sql
select pg_temp.payer_assert(not exists((select * from payer_final_catalog except select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl,p.provolatile,p.prosecdef,p.proconfig,p.prokind from pg_proc p where pronamespace='public'::regnamespace and prokind in('f','p')) union all (select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl,p.provolatile,p.prosecdef,p.proconfig,p.prokind from pg_proc p where pronamespace='public'::regnamespace and prokind in('f','p') except select * from payer_final_catalog)),'full public routine definitions, ACLs, volatility, security and configuration match after reapply');
select pg_temp.payer_assert(not exists(select * from payer_baseline_catalog where signature not in('work_allowance_accept_cap(uuid,text,uuid)','read_work_allowances(uuid,text,uuid,uuid)') except select * from payer_final_catalog),'all other existing routines unchanged, including pure payer and locking identity helpers');
\ir ../supabase/migrations/rollback-20261020090005_allowance_payer_writer_authority.sql
select pg_temp.payer_assert(not exists((select * from payer_baseline_catalog except select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl,p.provolatile,p.prosecdef,p.proconfig,p.prokind from pg_proc p where pronamespace='public'::regnamespace and prokind in('f','p')) union all (select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.proacl,p.provolatile,p.prosecdef,p.proconfig,p.prokind from pg_proc p where pronamespace='public'::regnamespace and prokind in('f','p') except select * from payer_baseline_catalog)),'exact full public catalog baseline restored');
\ir ../supabase/migrations/20261020090005_allowance_payer_writer_authority.sql
select pg_temp.payer_assert((select provolatile='s' from pg_proc where oid='public.work_payer_can_sign(text,uuid,uuid,uuid,uuid)'::regprocedure),'payer snapshot remains STABLE');
select pg_temp.payer_assert((select provolatile='v' from pg_proc where oid='public.work_payer_can_sign_writer(text,uuid,uuid,uuid,uuid)'::regprocedure),'writer predicate is VOLATILE');
select pg_temp.payer_assert(not has_function_privilege('service_role','public.work_payer_can_sign_writer(text,uuid,uuid,uuid,uuid)','execute') and not has_function_privilege('service_role','public.work_allowance_assert_read_identity(uuid,text)','execute') and not has_function_privilege('service_role','public.work_payer_can_sign(text,uuid,uuid,uuid,uuid)','execute'),'internal helpers private even from service role');
-- Demotion happened after valid serialized acceptance; its historical terms stay.
begin read only;
select pg_temp.payer_assert(not public.work_payer_can_sign('agency','a9050000-0000-4000-8000-000000000020','a9050000-0000-4000-8000-000000000010','a9050000-0000-4000-8000-000000000002','a9050000-0000-4000-8000-000000000002'),'demoted representative snapshot denies');
set local role service_role;
select pg_temp.payer_probe($q$select public.read_work_allowances('a9050000-0000-4000-8000-000000000001','payer-race-business@example.test',null,'a9050000-0000-4000-8000-000000000010')->'allowances'->0->>'status'='active'$q$);
select pg_temp.payer_probe($q$select public.read_work_allowances('a9050000-0000-4000-8000-000000000002','payer-race-agency@example.test',null,'a9050000-0000-4000-8000-000000000010') is not null$q$,'P0001','work_allowance_access_denied');
select pg_temp.payer_probe($q$select public.read_work_allowances('a9050000-0000-4000-8000-000000000001','wrong@example.test',null,'a9050000-0000-4000-8000-000000000010') is not null$q$,'P0001','work_allowance_identity_denied');
commit;
begin read write;
update public.workspace_memberships set role='admin' where workspace_id='a9050000-0000-4000-8000-000000000020' and user_id='a9050000-0000-4000-8000-000000000002';
commit;
begin read only;
select pg_temp.payer_assert(public.work_payer_can_sign('agency','a9050000-0000-4000-8000-000000000020','a9050000-0000-4000-8000-000000000010','a9050000-0000-4000-8000-000000000002','a9050000-0000-4000-8000-000000000002'),'restored admin pure snapshot');
set local role service_role;
select pg_temp.payer_probe($q$select public.read_work_allowances('a9050000-0000-4000-8000-000000000002','payer-race-agency@example.test',null,'a9050000-0000-4000-8000-000000000010')->'allowances'->0->>'canAccept'='true'$q$);
select pg_temp.payer_probe($q$select exists(select 1 from public.workspace_payer_transition_inbox('a9050000-0000-4000-8000-000000000002','payer-race-agency@example.test') where status='pending' and can_respond)$q$);
select pg_temp.payer_probe($q$select exists(select 1 from public.workspace_payer_transition_snapshot('a9050000-0000-4000-8000-000000000010','a9050000-0000-4000-8000-000000000001','payer-race-business@example.test') where status='pending')$q$);
commit;
begin read write;
update public.users set verified_at=null where id='a9050000-0000-4000-8000-000000000002';
commit;
begin read only;
set local role service_role;
select pg_temp.payer_probe($q$select public.read_work_allowances('a9050000-0000-4000-8000-000000000002','payer-race-agency@example.test',null,'a9050000-0000-4000-8000-000000000010') is not null$q$,'P0001','work_allowance_identity_denied');
commit;
begin read write;
update public.users set verified_at=now() where id='a9050000-0000-4000-8000-000000000002';
delete from public.workspace_memberships where workspace_id='a9050000-0000-4000-8000-000000000020' and user_id='a9050000-0000-4000-8000-000000000002';
commit;
begin read only;
set local role service_role;
select pg_temp.payer_probe($q$select public.read_work_allowances('a9050000-0000-4000-8000-000000000002','payer-race-agency@example.test',null,'a9050000-0000-4000-8000-000000000010') is not null$q$,'P0001','work_allowance_access_denied');
commit;
select pg_temp.payer_probe($q$select public.work_allowance_accept_cap('a9050000-0000-4000-8000-000000000002','payer-race-agency@example.test',(select id from public.work_allowances where award_key='payer-race-allowance')) is not null$q$,'P0001','work_allowance_payer_required');
select pg_temp.payer_assert((select body from payer_terms)=(select to_jsonb(a) from public.work_allowances a where award_key='payer-race-allowance'),'acceptance retained byte-for-byte after current role withdrawal and denied commands');
select pg_temp.payer_assert((select body from payer_jobs)=(select to_jsonb(j) from public.job_economics j where workspace_id='a9050000-0000-4000-8000-000000000010'),'denied job never modifies terms');
select pg_temp.payer_assert(not exists(select body from payer_transitions except select to_jsonb(t) from public.workspace_payer_transitions t where workspace_id='a9050000-0000-4000-8000-000000000010'),'denied transition never modifies terms');
\echo 'GREEN exact rollback/reapply catalog, genuine READ ONLY agency/business readers, identity/role withdrawal denials and retained terms.'
