\set ON_ERROR_STOP on
-- Real website RPCs on fictional data; callers have no direct client membership.
-- Caller owns the transaction; fictional active provider staff have no direct client membership.
create function pg_temp.pw_assert(value boolean, label text) returns void language plpgsql as $$begin if value is not true then raise exception 'provider website assertion failed: %',label; end if; end$$;
create function pg_temp.pw_expect(statement text, expected text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlerrm not like expected then raise exception 'expected % got %',expected,sqlerrm; end if; return; end; raise exception 'expected failure: %',statement; end$$;
insert into public.users(id,email,verified_at) values
 ('5e181300-0000-4000-8000-000000000001','pw-owner@example.test',now()),
 ('5e181300-0000-4000-8000-000000000002','pw-agency@example.test',now()),
 ('5e181300-0000-4000-8000-000000000003','pw-staff@example.test',now()),
 ('5e181300-0000-4000-8000-000000000004','pw-unstaffed@example.test',now()),
 ('5e181300-0000-4000-8000-000000000005','pw-other@example.test',now()),
 ('5e181300-0000-4000-8000-000000000006','pw-unverified@example.test',null);
insert into public.workspaces(id,kind,name,created_by) values
 ('5e181300-0000-4000-8000-000000000010','customer','Website client','5e181300-0000-4000-8000-000000000001'),
 ('5e181300-0000-4000-8000-000000000020','agency','Website agency','5e181300-0000-4000-8000-000000000002'),
 ('5e181300-0000-4000-8000-000000000030','agency','Other agency','5e181300-0000-4000-8000-000000000005');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('5e181300-0000-4000-8000-000000000010','5e181300-0000-4000-8000-000000000001','owner','5e181300-0000-4000-8000-000000000001'),
 ('5e181300-0000-4000-8000-000000000020','5e181300-0000-4000-8000-000000000002','owner','5e181300-0000-4000-8000-000000000002'),
 ('5e181300-0000-4000-8000-000000000020','5e181300-0000-4000-8000-000000000003','member','5e181300-0000-4000-8000-000000000002'),
 ('5e181300-0000-4000-8000-000000000020','5e181300-0000-4000-8000-000000000004','member','5e181300-0000-4000-8000-000000000002'),
 ('5e181300-0000-4000-8000-000000000020','5e181300-0000-4000-8000-000000000006','member','5e181300-0000-4000-8000-000000000002'),
 ('5e181300-0000-4000-8000-000000000030','5e181300-0000-4000-8000-000000000005','owner','5e181300-0000-4000-8000-000000000005');
select public.choose_business_provider('5e181300-0000-4000-8000-000000000001','pw-owner@example.test','5e181300-0000-4000-8000-000000000010','5e181300-0000-4000-8000-000000000020');
select public.set_agency_client_staff('5e181300-0000-4000-8000-000000000002','pw-agency@example.test','5e181300-0000-4000-8000-000000000020','5e181300-0000-4000-8000-000000000010','5e181300-0000-4000-8000-000000000003',true);
select public.set_agency_client_staff('5e181300-0000-4000-8000-000000000002','pw-agency@example.test','5e181300-0000-4000-8000-000000000020','5e181300-0000-4000-8000-000000000010','5e181300-0000-4000-8000-000000000006',true);
-- Create as the direct owner in both modes, then test exact website update as staff.
create temp table pw_work as select * from public.claim_website_rebuild('5e181300-0000-4000-8000-000000000010','5e181300-0000-4000-8000-000000000001','pw-owner@example.test','provider-website-owner-fixture','owner-description','{}',
 '{"version":2,"revision":0,"title":"Owner website","createdBy":"5e181300-0000-4000-8000-000000000001","createdAt":"2026-10-07T00:00:00Z","history":[]}');
insert into public.tenants(id,stable_id,site_name,active) values ('provider-reader-site','5e181300-0000-4000-8000-000000000050','Provider read-only website',true);
insert into public.website_hosted_tenant_reservations(website_work_id,workspace_id,tenant_id,tenant_stable_id,created_by)
select id,workspace_id,'provider-reader-site','5e181300-0000-4000-8000-000000000050','5e181300-0000-4000-8000-000000000001' from pw_work;
insert into public.website_documents(workspace_id,website_work_id,revision,content_hash,document,created_by)
select workspace_id,id,1,repeat('a',64),'{"version":2}','5e181300-0000-4000-8000-000000000001' from pw_work;
insert into public.website_linked_publications(workspace_id,website_work_id,tenant_stable_id,tenant_slug_at_publication,prior_delivery_model,revision,content_hash,published_by,fallback_until)
select workspace_id,id,'5e181300-0000-4000-8000-000000000050','provider-reader-site','custom_repo',1,repeat('a',64),'5e181300-0000-4000-8000-000000000001',now()+interval '30 days' from pw_work;
insert into public.website_domain_approvals(workspace_id,website_work_id,tenant_stable_id,hostname,approved_by,expires_at)
select workspace_id,id,'5e181300-0000-4000-8000-000000000050','provider-reader.example.test','5e181300-0000-4000-8000-000000000001',now()+interval '1 day' from pw_work;
select id as provider_reader_work_id from pw_work \gset
-- A real website from a different business proves exact workspace/resource scope.
insert into public.workspaces(id,kind,name,created_by) values('5e181300-0000-4000-8000-000000000040','customer','Unrelated website client','5e181300-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('5e181300-0000-4000-8000-000000000040','5e181300-0000-4000-8000-000000000001','owner','5e181300-0000-4000-8000-000000000001');
select id as provider_reader_foreign_work_id from public.claim_website_rebuild('5e181300-0000-4000-8000-000000000040','5e181300-0000-4000-8000-000000000001','pw-owner@example.test','provider-reader-foreign','foreign-description','{}',
 '{"version":2,"revision":0,"title":"Unrelated website","createdBy":"5e181300-0000-4000-8000-000000000001","createdAt":"2026-10-07T00:00:00Z","history":[]}') \gset
