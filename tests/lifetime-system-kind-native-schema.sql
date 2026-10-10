\set ON_ERROR_STOP on
-- Current native row writers on fully ordered schema, without historical fixture
-- assumptions about sparse Version qualification or implicit content authors.
begin;
create function pg_temp.lkn_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'lifetime native writer: %',label; end if; end $$;
insert into public.users(id,email,verified_at) values
 ('6b000000-0000-4000-8000-000000000001','kind-native-owner@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
 ('6b000000-0000-4000-8000-000000000010','customer','Fictional native business','6b000000-0000-4000-8000-000000000001'),
 ('6b000000-0000-4000-8000-000000000011','agency','Fictional creator','6b000000-0000-4000-8000-000000000001');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
 ('6b000000-0000-4000-8000-000000000010','6b000000-0000-4000-8000-000000000001','owner','6b000000-0000-4000-8000-000000000001'),
 ('6b000000-0000-4000-8000-000000000011','6b000000-0000-4000-8000-000000000001','owner','6b000000-0000-4000-8000-000000000001');
-- Native Version source creation (07150000 writer) retains its creation kind.
select public.create_system_version_source('6b000000-0000-4000-8000-000000000011',
 '6b000000-0000-4000-8000-000000000001','kind-native-owner@example.test',
 '{"name":"Reusable onboarding","kind":"internal_app"}',
 '6b000000-0000-4000-8000-000000000020',repeat('a',64));

-- Schedule-side trigger and generic native observation are also System writers.
insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values
 ('6b000000-0000-4000-8000-000000000050','6b000000-0000-4000-8000-000000000010','scheduling','schedule','Consultations',
 '{"version":1,"revision":0,"title":"Consultations","history":[],"availability":[],"reservations":[]}',
 '6b000000-0000-4000-8000-000000000001');
select public.adopt_system_with_revision('6b000000-0000-4000-8000-000000000010','saved_work',
 '6b000000-0000-4000-8000-000000000050','Consultations','booking',
 '{"kind":"schedule","ref":"fictional:schedule-1"}',true,'6b000000-0000-4000-8000-000000000001');
update public.saved_product_work set payload=payload || jsonb_build_object('revision',1,
 'pause',jsonb_build_object('pausedBy','6b000000-0000-4000-8000-000000000001','reason','Fictional pause'))
 where id='6b000000-0000-4000-8000-000000000050';
do $$ declare booking public.systems; begin
 select * into booking from public.systems where origin_kind='saved_work' and origin_ref='6b000000-0000-4000-8000-000000000050';
 perform pg_temp.lkn_assert(booking.lifecycle='paused' and booking.kind='booking','schedule-side pause keeps booking kind');
 perform public.observe_system_revision(booking.business_workspace_id,booking.id,
  '{"kind":"schedule","ref":"fictional:schedule-2"}','Updated schedule');
 select * into booking from public.systems where id=booking.id;
 perform public.transition_system_lifecycle(booking.business_workspace_id,'6b000000-0000-4000-8000-000000000001',
  'kind-native-owner@example.test',booking.id,booking.change_number,'live');
 perform pg_temp.lkn_assert((select kind='booking' and lifecycle='live' from public.systems where id=booking.id)
  and (select not(payload ? 'pause') from public.saved_product_work where id='6b000000-0000-4000-8000-000000000050'),
  'System-side resume and generic observation retain kind and native pause agreement');
end $$;

insert into public.tenants(id,site_name,delivery_model,stable_id) values
 ('kind-native-site','Fictional site','custom_repo','6b000000-0000-4000-8000-000000000030');
insert into public.memberships(user_id,tenant_id,role,tenant_stable_id) values
 ('6b000000-0000-4000-8000-000000000001','kind-native-site','owner','6b000000-0000-4000-8000-000000000030');
insert into public.content_versions(id,tenant_id,section,data,created_at,author,status) values
 ('kind-content-1','kind-native-site','hero','{"heading":"First"}',clock_timestamp(),'user','live');
-- Conversion invokes actual 08130000 adoption writers and website successors.
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
 values('6b000000-0000-4000-8000-000000000030','kind-native-site','6b000000-0000-4000-8000-000000000010',
 '6b000000-0000-4000-8000-000000000001','6b000000-0000-4000-8000-000000000040',repeat('b',64),'{}');
create temp table lkn_kinds as select id,kind from public.systems where business_workspace_id in
 ('6b000000-0000-4000-8000-000000000010','6b000000-0000-4000-8000-000000000011');
select pg_temp.lkn_assert(exists(select 1 from lkn_kinds where kind='website')
 and exists(select 1 from lkn_kinds where kind='internal_app'),'native source and website creation preserve their kinds');
do $$ declare site public.systems; n integer; before_revision uuid; begin
 select * into site from public.systems where business_workspace_id='6b000000-0000-4000-8000-000000000010' and kind='website';
 perform public.reconcile_website_system_releases(site.business_workspace_id,'6b000000-0000-4000-8000-000000000001',
  'kind-native-owner@example.test',site.id,'tenant','6b000000-0000-4000-8000-000000000030',true);
 select current_revision_id into before_revision from public.systems where id=site.id;
 insert into public.content_versions(id,tenant_id,section,data,created_at,author,status) values
  ('kind-content-2','kind-native-site','hero','{"heading":"Onboarding"}',clock_timestamp(),'user','live');
 -- Observation and reconciliation operate on a real persisted content receipt.
 perform public.observe_tenant_content('kind-native-site','kind-content-2');
 perform public.reconcile_website_system_releases(site.business_workspace_id,'6b000000-0000-4000-8000-000000000001',
  'kind-native-owner@example.test',site.id,'tenant','6b000000-0000-4000-8000-000000000030',true);
 perform pg_temp.lkn_assert((select current_revision_id<>before_revision and kind='website' from public.systems where id=site.id),
  'current native website release moves the revision and retains kind');
 perform pg_temp.lkn_assert(public.reconcile_website_system_releases(site.business_workspace_id,'6b000000-0000-4000-8000-000000000001',
  'kind-native-owner@example.test',site.id,'tenant','6b000000-0000-4000-8000-000000000030',true)=0,'repeat website reconciliation is a no-op');
 n:=public.pause_tenant_systems('kind-native-site');
 perform pg_temp.lkn_assert(n>0 and (select lifecycle='paused' from public.systems where id=site.id),'native pause preserves the existing System');
 perform pg_temp.lkn_assert(public.pause_tenant_systems('kind-native-site')=0,'repeat native pause is a no-op');
end $$;
select pg_temp.lkn_assert(not exists(select 1 from lkn_kinds k join public.systems s on s.id=k.id where s.kind<>k.kind),
 'all observed native updates retain lifetime kind');
rollback;
