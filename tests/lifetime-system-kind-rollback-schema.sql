\set ON_ERROR_STOP on
-- Used only in the owned schema-only clone for populated inverse refusal.
insert into public.users(id,email,verified_at) values
 ('6a000000-0000-4000-8000-000000000001','lifetime-owner@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('6a000000-0000-4000-8000-000000000010','customer','Fictional consultant','6a000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('6a000000-0000-4000-8000-000000000010','6a000000-0000-4000-8000-000000000001','owner','6a000000-0000-4000-8000-000000000001');
select public.create_business_system('6a000000-0000-4000-8000-000000000010',
 '6a000000-0000-4000-8000-000000000001','lifetime-owner@example.test','{"name":"Proposal","kind":"proposal"}',
 '6a000000-0000-4000-8000-0000000000c1',repeat('1',64));
