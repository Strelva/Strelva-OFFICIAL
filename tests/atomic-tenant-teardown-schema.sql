\set ON_ERROR_STOP on
-- Atomic hosted-tenant teardown (audit 2026-10-05, finding 1). Runs after
-- provider-website-launch-schema.sql, which leaves 'provider-launch' published
-- and 'provider-personal' reserved. Fictional local fixture only.
create or replace function pg_temp.assert_true(condition boolean,message text) returns void language plpgsql as $$ begin if condition is not true then raise exception 'assertion failed: %',message; end if; end $$;
create or replace function pg_temp.expect_error(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%'||expected||'%' then return; end if; raise; end;
  raise exception 'Expected error % for %',expected,statement;
end $$;
select pg_temp.assert_true(has_function_privilege('service_role','public.deprovision_tenant_rows(text)','execute'),'service role can run the atomic teardown');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.deprovision_tenant_rows(text)','execute') and not has_function_privilege('anon','public.deprovision_tenant_rows(text)','execute'),'clients cannot tear down tenants');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.tenant_teardown_blockers(text)','execute'),'clients cannot probe teardown blockers');
select pg_temp.assert_true(not has_function_privilege('service_role','public.tenant_teardown_tables()','execute'),'the table list is internal');

do $$
declare counts jsonb; blockers record;
begin
  -- A published workspace website blocks teardown before any row is deleted.
  insert into public.domain_claims(tenant_id,domain,role,status) values('provider-launch','teardown-blocked.example.test','production','verified');
  select * into blockers from public.tenant_teardown_blockers('provider-launch');
  perform pg_temp.assert_true(blockers.publications=1 and blockers.reservations=1,'blockers report the publication and reservation');
  perform pg_temp.expect_error($q$select public.deprovision_tenant_rows('provider-launch')$q$,'tenant_teardown_blocked_by_workspace_website');
  perform pg_temp.assert_true(exists(select 1 from public.tenants where id='provider-launch'),'blocked teardown keeps the tenant');
  perform pg_temp.assert_true(exists(select 1 from public.memberships where tenant_id='provider-launch'),'blocked teardown keeps memberships');
  perform pg_temp.assert_true(exists(select 1 from public.domain_claims where tenant_id='provider-launch'),'blocked teardown keeps domain claims');
  -- A reservation alone also blocks.
  perform pg_temp.expect_error($q$select public.deprovision_tenant_rows('provider-personal')$q$,'tenant_teardown_blocked_by_workspace_website');
  perform pg_temp.assert_true(exists(select 1 from public.memberships where tenant_id='provider-personal'),'reserved tenant keeps memberships');

  -- A tenant no workspace website holds is purged completely in one call.
  insert into public.tenants(id,site_name) values('teardown-free','Teardown fictional');
  insert into public.users(id,email,verified_at) values('61000000-0000-4000-8000-000000000201','teardown@example.test',now());
  insert into public.memberships(user_id,tenant_id,tenant_stable_id,role) select '61000000-0000-4000-8000-000000000201',id,stable_id,'owner' from public.tenants where id='teardown-free';
  insert into public.domain_claims(tenant_id,domain,role,status) values('teardown-free','teardown-free.example.test','production','verified');
  counts := public.deprovision_tenant_rows('teardown-free');
  perform pg_temp.assert_true((counts->>'memberships')::int=1 and (counts->>'domain_claims')::int=1 and (counts->>'tenants')::int=1,'teardown reports what it removed');
  perform pg_temp.assert_true(not exists(select 1 from public.tenants where id='teardown-free'),'tenant row is gone');
  perform pg_temp.assert_true(not exists(select 1 from public.memberships where tenant_id='teardown-free') and not exists(select 1 from public.domain_claims where tenant_id='teardown-free'),'child rows are gone');
  -- Rerunning an absent tenant is a harmless no-op.
  perform pg_temp.assert_true(public.deprovision_tenant_rows('teardown-free')='{}'::jsonb,'repeat teardown is a no-op');
  perform pg_temp.expect_error($q$select public.deprovision_tenant_rows('Not A Slug')$q$,'tenant_teardown_invalid');
end $$;
