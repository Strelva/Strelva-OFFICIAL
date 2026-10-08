\set ON_ERROR_STOP on
-- Execute after all successor migrations plus20261022090000 in a disposable DB.
-- This file is preparation until its native receipt exists.
begin;
create or replace function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %',message; end if; end $$;
create or replace function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'Expected error % for %',expected,statement;
end $$;
select pg_temp.assert_true(has_function_privilege('service_role','public.deprovision_tenant_guarded(text,boolean,boolean,boolean)','execute'),'service role owns teardown');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.deprovision_tenant_guarded(text,boolean,boolean,boolean)','execute') and not has_function_privilege('anon','public.deprovision_tenant_guarded(text,boolean,boolean,boolean)','execute'),'public cannot tear down tenants');
insert into public.tenants(id,site_name,subscription_status) values('guarded-paid','Guard fictional','active');
select pg_temp.expect_error($q$select public.deprovision_tenant_guarded('guarded-paid',false,false,false)$q$,'tenant_teardown_active_subscription');
select pg_temp.assert_true(exists(select 1 from public.tenants where id='guarded-paid'),'fresh paid guard retains tenant');
select pg_temp.expect_error($q$select public.deprovision_tenant_guarded('*',true,false,false)$q$,'tenant_teardown_invalid');
-- Prove a later delete failure rolls back the complete transaction.
insert into public.tenants(id,site_name) values('guarded-failure','Guard failure');
insert into public.domain_claims(tenant_id,domain,role,status) values('guarded-failure','guarded-failure.example.test','production','verified');
create function pg_temp.refuse_guarded_delete() returns trigger language plpgsql as $$ begin if old.id='guarded-failure' then raise exception 'guarded_fixture_delete_failure'; end if; return old; end $$;
create trigger guarded_fixture_delete_failure before delete on public.tenants for each row execute function pg_temp.refuse_guarded_delete();
select pg_temp.expect_error($q$select public.deprovision_tenant_guarded('guarded-failure',false,false,false)$q$,'guarded_fixture_delete_failure');
select pg_temp.assert_true(exists(select 1 from public.domain_claims where tenant_id='guarded-failure'),'failure retains earlier child rows');
drop trigger guarded_fixture_delete_failure on public.tenants;
-- Compose each existing export/retention choice without replacing its RPC.
do $$ declare a boolean; b boolean; slug text; receipt jsonb;
begin
  foreach a in array array[false,true] loop
    foreach b in array array[false,true] loop
      slug:='guarded-mode-'||a::text||'-'||b::text;
      insert into public.tenants(id,site_name) values(slug,'Guard mode');
      receipt:=public.deprovision_tenant_guarded(slug,false,a,b);
      perform pg_temp.assert_true((receipt->'counts'->>'tenants')::int=1 and (receipt->>'paused')::int=0,'mode returns committed teardown receipt');
      perform pg_temp.assert_true(not exists(select 1 from public.tenants where id=slug),'mode removes tenant');
    end loop;
  end loop;
end $$;
rollback;
