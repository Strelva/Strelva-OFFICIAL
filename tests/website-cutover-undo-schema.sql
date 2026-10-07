\set ON_ERROR_STOP on
-- Fictional linked-site fixture created by website-linked-publication-schema.sql.
select pg_temp.assert_true(not has_function_privilege('authenticated','public.undo_website_linked_cutover(uuid,uuid,uuid,text,text,integer,text,uuid,boolean,boolean)','execute'),'undo RPC is service-role only');
select pg_temp.assert_true(not has_table_privilege('service_role','public.website_cutover_undos','insert'),'undo receipts require authority RPC');
do $$
declare
  ws uuid := '62000000-0000-4000-8000-000000000110';
  owner_id uuid := '62000000-0000-4000-8000-000000000101';
  admin_id uuid := '62000000-0000-4000-8000-000000000103';
  cmd uuid := '62000000-0000-4000-8000-0000000001ff';
  p public.website_document_publications;
  r jsonb; count_before integer;
begin
  select * into p from public.website_document_publications where tenant_id='linked-client-renamed';
  perform pg_temp.assert_true(p.website_work_id is not null,'linked publication exists for undo proof');
  select count(*) into count_before from public.website_document_receipts where website_work_id=p.website_work_id;
  perform pg_temp.expect_error(format('select public.undo_website_linked_cutover(%L,%L,%L,%L,%L,%s,%L,%L,true,true)',ws,p.website_work_id,admin_id,'lp-admin@example.test',p.tenant_id,p.revision,p.content_hash,cmd),'workspace_access_denied');
  perform pg_temp.expect_error(format('select public.undo_website_linked_cutover(%L,%L,%L,%L,%L,%s,%L,%L,false,true)',ws,p.website_work_id,owner_id,'lp-owner@example.test',p.tenant_id,p.revision,p.content_hash,cmd),'website_fallback_confirmation_required');
  perform pg_temp.expect_error(format('select public.undo_website_linked_cutover(%L,%L,%L,%L,%L,%s,%L,%L,true,false)',ws,p.website_work_id,owner_id,'lp-owner@example.test',p.tenant_id,p.revision,p.content_hash,cmd),'website_fallback_confirmation_required');
  perform pg_temp.expect_error(format('select public.undo_website_linked_cutover(%L,%L,%L,%L,%L,%s,%L,%L,true,true)',ws,p.website_work_id,owner_id,'lp-owner@example.test',p.tenant_id,p.revision,repeat('b',64),cmd),'website_revision_conflict');
  perform pg_temp.assert_true((select delivery_model from public.tenants where id=p.tenant_id)='platform_template','refusals leave live state unchanged');
  r := public.undo_website_linked_cutover(ws,p.website_work_id,owner_id,'lp-owner@example.test',p.tenant_id,p.revision,p.content_hash,cmd,true,true);
  perform pg_temp.assert_true(r->>'kind'='rebuild_cutover_undone','undo issued receipt');
  perform pg_temp.assert_true((select delivery_model from public.tenants where id=p.tenant_id)='custom_repo','old delivery restored');
  perform pg_temp.assert_true(not exists(select 1 from public.website_document_publications where tenant_id=p.tenant_id),'hosted pointer removed');
  perform pg_temp.assert_true((select count(*) from public.website_document_receipts where website_work_id=p.website_work_id)=count_before,'issued publication receipts preserved');
  perform pg_temp.assert_true(exists(select 1 from public.website_documents where website_work_id=p.website_work_id),'documents preserved');
  perform pg_temp.assert_true(public.undo_website_linked_cutover(ws,p.website_work_id,owner_id,'lp-owner@example.test',p.tenant_id,p.revision,p.content_hash,cmd,true,true)=r,'retry returns same receipt without writing');
  perform pg_temp.expect_error(format('select public.undo_website_linked_cutover(%L,%L,%L,%L,%L,%s,%L,%L,true,true)',ws,p.website_work_id,owner_id,'lp-owner@example.test',p.tenant_id,p.revision,repeat('b',64),cmd),'website_revision_conflict');
  perform pg_temp.expect_error(format('delete from public.website_cutover_undos where command_id=%L',cmd),'website_document_immutable');
end $$;
