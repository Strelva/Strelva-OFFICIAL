\set ON_ERROR_STOP on
begin;
insert into public.users(id,email,verified_at) values ('e9400000-0000-4000-8000-000000000001','coverage-rollback@example.test',now());
insert into public.super_admins(user_id,email) values ('e9400000-0000-4000-8000-000000000001','coverage-rollback@example.test');
insert into public.workspaces(id,kind,name,created_by) values ('e9400000-0000-4000-8000-000000000002','customer','Rollback fixture','e9400000-0000-4000-8000-000000000001');
select public.record_business_effort('e9400000-0000-4000-8000-000000000001','coverage-rollback@example.test',
 'e9400000-0000-4000-8000-000000000003','e9400000-0000-4000-8000-000000000002',0,'other',(now() at time zone 'utc')::date,null);
-- Must fail with business_effort_coverage_rollback_has_zero_logs. The client
-- exits and its whole fictional fixture transaction rolls back automatically.
\ir ../supabase/migrations/rollback-business-effort-coverage.sql
