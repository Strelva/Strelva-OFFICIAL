\set ON_ERROR_STOP on
-- Committed local fixture: the real rollback must refuse adoption atomically.
begin;
insert into public.users(id,email,verified_at)
values('64000000-0000-4000-8000-000000000201','bp-rollback@example.test',now());
insert into public.workspaces(id,kind,name,created_by)
values('64000000-0000-4000-8000-000000000210','customer','Rollback fixture','64000000-0000-4000-8000-000000000201');
insert into public.business_pages(workspace_id,handle,published,updated_by)
values('64000000-0000-4000-8000-000000000210','rollback-fixture',false,'64000000-0000-4000-8000-000000000201');
commit;
