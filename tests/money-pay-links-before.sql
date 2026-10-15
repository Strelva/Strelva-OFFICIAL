-- Fictional agencies, a customer with an active provider, and a ready merchant for agency A.
\set ON_ERROR_STOP on
insert into public.users(id,email,verified_at) values
 ('b0000000-0000-4000-8000-000000000001','mpl-a-owner@example.test',now()),
 ('b0000000-0000-4000-8000-000000000002','mpl-b-owner@example.test',now()),
 ('b0000000-0000-4000-8000-000000000003','mpl-stranger@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('b0000000-0000-4000-8000-000000000020','agency','Agency A','b0000000-0000-4000-8000-000000000001'),
 ('b0000000-0000-4000-8000-000000000030','agency','Agency B','b0000000-0000-4000-8000-000000000002'),
 ('b0000000-0000-4000-8000-000000000040','customer','Customer One','b0000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('b0000000-0000-4000-8000-000000000020','b0000000-0000-4000-8000-000000000001','owner','b0000000-0000-4000-8000-000000000001'),
 ('b0000000-0000-4000-8000-000000000030','b0000000-0000-4000-8000-000000000002','owner','b0000000-0000-4000-8000-000000000002'),
 ('b0000000-0000-4000-8000-000000000040','b0000000-0000-4000-8000-000000000001','owner','b0000000-0000-4000-8000-000000000001');
insert into public.workspace_providers(customer_workspace_id,provider_workspace_id,source,started_by)
 values('b0000000-0000-4000-8000-000000000040','b0000000-0000-4000-8000-000000000020','operator','b0000000-0000-4000-8000-000000000001');
select public.manage_connected_account('b0000000-0000-4000-8000-000000000020','b0000000-0000-4000-8000-000000000001','mpl-a-owner@example.test','reserve');
select public.record_connected_account('b0000000-0000-4000-8000-000000000020','acct_MplAgencyA',array['merchant'],'fictional-v1','{}','{}',true);
