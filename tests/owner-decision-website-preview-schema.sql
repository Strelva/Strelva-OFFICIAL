\set ON_ERROR_STOP on
begin;
create function pg_temp.op_assert(condition boolean,message text) returns void language plpgsql as $$
begin if condition is not true then raise exception 'owner preview assertion failed: %',message; end if; end $$;
create function pg_temp.op_refuse(statement text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then if sqlerrm like '%owner_preview_unavailable%' then return; end if; raise; end;
  raise exception 'Expected owner_preview_unavailable for %',statement;
end $$;
select pg_temp.op_assert(has_function_privilege('service_role','public.read_owner_decision_website_preview(uuid,uuid,text,text)','execute')
  and not has_function_privilege('authenticated','public.read_owner_decision_website_preview(uuid,uuid,text,text)','execute')
  and not has_function_privilege('anon','public.read_owner_decision_website_preview(uuid,uuid,text,text)','execute'),'service-only reader');
do $$
declare ws uuid:='b6000000-0000-4000-8000-000000000001'; actor uuid:='b6000000-0000-4000-8000-000000000002';
  work public.saved_product_work; item jsonb; result jsonb; id uuid; count_before bigint;
  h text:=repeat('c',64); revision_hash text:=repeat('a',64);
  doc jsonb:='{"version":2,"siteName":"Fictional Preview","pages":[],"nodes":{"hero":{"props":{"body":"Complete private copy"}}},"facts":{}}';
begin
  insert into public.users(id,email,verified_at) values(actor,'op-operator@example.test',now());
  insert into public.workspaces(id,kind,name,created_by) values(ws,'customer','Fictional preview business',actor);
  insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values(ws,actor,'admin',actor);
  insert into public.tenants(id,site_name,owner_email,template,industry) values('op-existing-fixture','Fictional Preview','op-owner@example.test','professional','consulting');
  insert into public.tenant_workspace_links(tenant_stable_id,tenant_slug_at_link,workspace_id,linked_by,command_id,command_digest,receipt)
    select t.stable_id,t.id,ws,actor,gen_random_uuid(),h,'{}'::jsonb from public.tenants t where t.id='op-existing-fixture';
  select * into work from public.claim_website_rebuild(ws,actor,'op-operator@example.test','op-request-one','op-example.test','{"url":"https://op-example.test"}',
    jsonb_build_object('version',2,'revision',0,'title','Fictional Preview','status','building','createdBy',actor,'createdAt','2026-10-08T10:00:00Z','history','[]'::jsonb));
  perform public.append_website_document(ws,work.id,actor,'op-operator@example.test',0,h,doc);
  update public.saved_product_work s set payload=s.payload||jsonb_build_object('revision',4,'status','review_ready','candidate',jsonb_build_object('revision',1,'contentHash',h,'document',doc)) where s.id=work.id;
  item:=public.open_owner_decision(ws,jsonb_build_object('kind','fact.inferred','route','owner_decides','title','Review complete copy',
    'approveEffect','Confirm copy.','notYetEffect','Nothing changes.','sourceLifecycle','website_document','sourceId',work.id::text||':copy.hero','revisionHash',revision_hash,'adminMayDecide',false));
  id:=(item->>'id')::uuid;
  select count(*) into count_before from public.strelva_service_actions;
  result:=public.read_owner_decision_website_preview(ws,id,revision_hash,' OP-Owner@Example.test ');
  perform pg_temp.op_assert(result->'item'->>'state'='open' and result->'record'->>'workId'=work.id::text
    and result->'record'->'rebuild'->'candidate'->'document'=doc,'exact document read without account');
  perform public.read_owner_decision_website_preview(ws,id,revision_hash,'op-owner@example.test');
  perform pg_temp.op_assert((select count(*) from public.strelva_service_actions)=count_before,'GET creates no service action or session');
  perform pg_temp.op_assert((select d.state='open' and d.decided_at is null from public.owner_decisions d where d.id=(item->>'id')::uuid and d.workspace_id=ws),'GET does not claim');
  perform pg_temp.op_assert(not exists(select 1 from public.workspace_memberships where workspace_id=ws and role='owner'),'GET grants no membership');
  perform pg_temp.op_refuse(format('select public.read_owner_decision_website_preview(%L,%L,%L,%L)',ws,id,revision_hash,'intruder@example.test'));
  perform pg_temp.op_refuse(format('select public.read_owner_decision_website_preview(%L,%L,%L,%L)',gen_random_uuid(),id,revision_hash,'op-owner@example.test'));
  perform pg_temp.op_refuse(format('select public.read_owner_decision_website_preview(%L,%L,%L,%L)',ws,id,h,'op-owner@example.test'));
  update public.tenants set owner_email='changed@example.test' where tenants.id='op-existing-fixture';
  perform pg_temp.op_refuse(format('select public.read_owner_decision_website_preview(%L,%L,%L,%L)',ws,id,revision_hash,'op-owner@example.test'));
  update public.tenants set owner_email='op-owner@example.test' where tenants.id='op-existing-fixture';
  -- A changed immutable head cannot disclose a document beyond the signed source.
  perform public.append_website_document(ws,work.id,actor,'op-operator@example.test',1,repeat('d',64),doc||'{"siteName":"Changed private preview"}');
  perform pg_temp.op_refuse(format('select public.read_owner_decision_website_preview(%L,%L,%L,%L)',ws,id,revision_hash,'op-owner@example.test'));
  -- Claims are also refused after a decision is handled, independent of source state.
  perform public.claim_owner_decision(ws,id,revision_hash,'not_yet','owner_link',null,null,'op-owner@example.test');
  perform pg_temp.op_refuse(format('select public.read_owner_decision_website_preview(%L,%L,%L,%L)',ws,id,revision_hash,'op-owner@example.test'));
end $$;
rollback;
\echo 'Owner decision website preview SQL checks passed.'
