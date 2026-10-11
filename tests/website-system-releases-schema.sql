\set ON_ERROR_STOP on
begin;
create function pg_temp.wsr_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'website release assertion: %',message; end if; end $$;
create function pg_temp.wsr_expect(statement text,expected text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlerrm not like expected then raise exception 'expected %, got %',expected,sqlerrm; end if; return;
  end;
  raise exception 'statement unexpectedly succeeded: %',statement;
end $$;
-- The aggregate fixture deliberately omits the legacy content store.
create table if not exists public.content_versions(id text primary key,tenant_id text not null,section text not null,data jsonb not null,created_at timestamptz not null);
insert into public.users(id,email,verified_at) values
  ('7c000000-0000-4000-8000-000000000001','wsr-owner@example.test',now()),
  ('7c000000-0000-4000-8000-000000000002','wsr-member@example.test',now()),
  ('7c000000-0000-4000-8000-000000000003','wsr-other@example.test',now());
insert into public.workspaces(id,kind,name,created_by) values
  ('7c000000-0000-4000-8000-000000000010','customer','Release fictional business','7c000000-0000-4000-8000-000000000001'),
  ('7c000000-0000-4000-8000-000000000011','customer','Other release business','7c000000-0000-4000-8000-000000000003');
insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values
  ('7c000000-0000-4000-8000-000000000010','7c000000-0000-4000-8000-000000000001','owner','7c000000-0000-4000-8000-000000000001'),
  ('7c000000-0000-4000-8000-000000000010','7c000000-0000-4000-8000-000000000002','member','7c000000-0000-4000-8000-000000000001'),
  ('7c000000-0000-4000-8000-000000000011','7c000000-0000-4000-8000-000000000003','owner','7c000000-0000-4000-8000-000000000003');
insert into public.tenants(id,site_name,delivery_model,stable_id) values
  ('wsr-site','Fictional website','custom_repo','7c000000-0000-4000-8000-000000000020');
insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
  values('7c000000-0000-4000-8000-000000000020','wsr-site','7c000000-0000-4000-8000-000000000010','7c000000-0000-4000-8000-000000000001','7c000000-0000-4000-8000-000000000030',repeat('a',64),'{}');
insert into public.content_versions(id,tenant_id,section,data,created_at) values
  ('wsr-v1','wsr-site','hero','{"heading":"Fictional one"}','2026-10-01T10:00:00Z'),
  ('wsr-v2','wsr-site','hero','{"heading":"Fictional two"}','2026-10-02T10:00:00Z');

do $$
declare ws uuid:='7c000000-0000-4000-8000-000000000010'; stable uuid:='7c000000-0000-4000-8000-000000000020';
  owner_id uuid:='7c000000-0000-4000-8000-000000000001'; member_id uuid:='7c000000-0000-4000-8000-000000000002';
  v_system_id uuid; s public.systems; count_before integer; pointer uuid; req uuid; deployed uuid;
begin
  v_system_id:=public.system_origin_id(ws,'tenant',stable::text);
  perform pg_temp.wsr_assert(public.reconcile_website_system_releases(ws,member_id,'wsr-member@example.test',v_system_id,'tenant',stable::text,true)>0,'member repairs receipts without changing the site');
  select * into s from public.systems where systems.id=v_system_id;
  perform pg_temp.wsr_assert((select implementation->>'kind' from public.system_revisions where system_revisions.id=s.current_revision_id)='custom_repo_content','content kind is honest');
  perform pg_temp.wsr_assert((select implementation->>'ref' from public.system_revisions where system_revisions.id=s.current_revision_id)=stable::text||'@wsr-v2','latest content is current');
  perform pg_temp.wsr_assert(public.reconcile_website_system_releases(ws,owner_id,'wsr-owner@example.test',v_system_id,'tenant',stable::text,true)=0,'repeated repair writes no revision');
  perform pg_temp.wsr_assert(public.observe_tenant_content('wsr-site','wsr-v2')=0,'observation and repair share one source key');
  pointer:=s.current_revision_id;
  insert into public.content_versions(id,tenant_id,section,data,created_at) values('wsr-late-old','wsr-site','hero','{}','2026-09-01T10:00:00Z');
  perform public.reconcile_website_system_releases(ws,owner_id,'wsr-owner@example.test',v_system_id,'tenant',stable::text,true);
  perform pg_temp.wsr_assert((select current_revision_id from public.systems where systems.id=v_system_id)=pointer,'a late older receipt does not rewind current');
  insert into public.service_requests(business_workspace_id,status,request_text,outcome,context,scope,provider_kind,created_by)
    values(ws,'requested','A fictional menu','A fictional menu',jsonb_build_object('source','website_change','systemId',v_system_id),array['website.repo_change'],'strelva',owner_id) returning service_requests.id into req;
  insert into public.website_change_receipts(workspace_id,request_id,system_id,kind,commit_sha,deployment_url,read_back,recorded_by)
    values(ws,req,v_system_id,'deployed','abcdef0','https://fictional.vercel.app','not_confirmed',owner_id) returning website_change_receipts.id into deployed;
  perform public.reconcile_website_system_releases(ws,owner_id,'wsr-owner@example.test',v_system_id,'tenant',stable::text,true);
  select * into s from public.systems where systems.id=v_system_id;
  perform pg_temp.wsr_assert((select implementation->>'ref' from public.system_revisions where system_revisions.id=s.current_revision_id)='deploy:'||deployed::text||'@abcdef0','repo deploy points to receipt and commit');
  perform pg_temp.wsr_assert((select summary from public.system_revisions where system_revisions.id=s.current_revision_id) like '%not confirmed%','failed read-back remains explicit');
  perform pg_temp.wsr_assert(public.reconcile_website_system_releases(ws,owner_id,'wsr-owner@example.test',v_system_id,'tenant',stable::text,true)=0,'failed read-back never replays a deployment');
  perform pg_temp.wsr_assert((select id from public.tenants where stable_id=stable)='wsr-site','tenant unchanged');
  update public.tenants set id='wsr-renamed' where stable_id=stable;
  perform public.reconcile_website_system_releases(ws,owner_id,'wsr-owner@example.test',v_system_id,'tenant',stable::text,true);
  perform pg_temp.wsr_assert((select origin_ref from public.systems where systems.id=v_system_id)=stable::text,'slug rename never changes identity');
  perform pg_temp.wsr_expect(format('select public.reconcile_website_system_releases(%L,%L,%L,%L,%L,%L,true)',ws,'7c000000-0000-4000-8000-000000000003','wsr-other@example.test',v_system_id,'tenant',stable),'%business_record_access_denied%');
  perform pg_temp.wsr_expect(format('select public.reconcile_website_system_releases(%L,%L,%L,%L,%L,%L,true)',ws,owner_id,'wsr-other@example.test',v_system_id,'tenant',stable),'%business_record_access_denied%');
  perform pg_temp.wsr_expect(format('select public.reconcile_website_system_releases(%L,%L,%L,%L,%L,%L,true)',ws,owner_id,'wsr-owner@example.test',gen_random_uuid(),'tenant',stable),'%system_not_found%');
end $$;

-- A connected rebuild pins its original System identity, including after
-- disconnect. Its publication records a document revision on that same id.
do $$
declare ws uuid:='7c000000-0000-4000-8000-000000000010'; owner_id uuid:='7c000000-0000-4000-8000-000000000001';
  c uuid; w public.saved_product_work; v_connected_system_id uuid; h text:=repeat('a',64); doc jsonb:='{"version":2}'; snapshot jsonb;
begin
  insert into public.connected_sites(business_workspace_id,public_key,label,site_url,site_host,allowed_origins,verification_token,verified_at,created_by)
    values(ws,'sk_pub_'||repeat('a',24),'Connected fictional site','https://connected.example.test/','connected.example.test',array['https://connected.example.test'],repeat('a',32),now(),owner_id) returning id into c;
  select * into w from public.claim_website_rebuild(ws,owner_id,'wsr-owner@example.test','wsr-rebuild-one','connected.example.test','{"url":"https://connected.example.test/"}',jsonb_build_object('version',2,'revision',0,'title','Connected fictional rebuild','createdBy',owner_id,'history','[]'::jsonb));
  v_connected_system_id:=public.system_origin_id(ws,'connected_site',c::text);
  perform public.reconcile_website_system_releases(ws,owner_id,'wsr-owner@example.test',v_connected_system_id,'connected_site',c::text,false);
  perform pg_temp.wsr_assert(public.website_rebuild_connected_origin(ws,w.id)=c,'connected identity is pinned');
  snapshot:=public.read_existing_business_systems(ws,owner_id,'wsr-owner@example.test');
  perform pg_temp.wsr_assert((select x->>'connectedSiteId' from jsonb_array_elements(snapshot->'savedWork') x where x->>'id'=w.id::text)=c::text,'projection carries pinned connected identity');
  insert into public.website_documents(workspace_id,website_work_id,revision,content_hash,document,created_by) values(ws,w.id,1,h,doc,owner_id);
  insert into public.website_document_receipts(workspace_id,website_work_id,revision,receipt)
    values(ws,w.id,1,jsonb_build_object('status','published','artifactHash',h));
  perform public.reconcile_website_system_releases(ws,owner_id,'wsr-owner@example.test',v_connected_system_id,'connected_site',c::text,false);
  perform pg_temp.wsr_assert((select r.implementation->>'kind' from public.systems s join public.system_revisions r on r.id=s.current_revision_id where s.id=v_connected_system_id)='website_document','connected website becomes a document under same id');
  update public.connected_sites set status='revoked',revoked_at=now() where id=c;
  perform pg_temp.wsr_assert(public.website_rebuild_connected_origin(ws,w.id)=c,'disconnect does not change the published identity');
end $$;
select pg_temp.wsr_assert(not has_function_privilege('authenticated','public.reconcile_website_system_releases(uuid,uuid,text,uuid,text,text,boolean)','EXECUTE')
  and not has_function_privilege('service_role','public.append_website_system_release(uuid,uuid,text,jsonb,text,uuid,timestamptz)','EXECUTE'),'source append is private; RPC is server-only');
rollback;
\echo 'Website System release checks passed.'
