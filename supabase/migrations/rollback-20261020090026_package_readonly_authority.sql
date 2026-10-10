-- Ordered rollback: remove this tail before the earlier snapshot-reader repair.
begin;
set local lock_timeout='3s';
do $repair$ declare target record; definition text;
begin
 for target in select * from (values
  ('public.read_website_documents(uuid,uuid,uuid,text,integer,boolean)','public.website_document_read_actor(','public.website_document_assert_actor('),
  ('public.read_website_document_receipts(uuid,uuid,uuid,text)','public.website_document_read_actor(','public.website_document_assert_actor('),
  ('public.read_business_system(uuid,uuid,text,uuid)','public.system_read_scope(','public.system_actor_scope('),
  ('public.read_business_system(uuid,uuid,text,uuid)','public.system_read_load(','public.system_load('),
  ('public.read_existing_business_systems(uuid,uuid,text)','public.system_read_scope(','public.system_actor_scope('),
  ('public.read_system_version(uuid,text,uuid)','public.system_version_read_access(','public.system_version_access('),
  ('public.read_system_version_for_system(uuid,uuid,text,uuid)','public.system_version_read_access(','public.system_version_access('),
  ('public.read_workspace_version_sources(uuid,uuid,text)','public.system_version_read_access(','public.system_version_access('),
  ('public.system_version_connection_holder(uuid,text,text)','public.system_version_read_access(','public.system_version_access('),
  ('public.read_system_package_listings(uuid,uuid,text)','public.system_read_scope(','public.system_actor_scope('),
  ('public.read_system_package_creator(uuid,uuid,text,uuid)','public.system_version_read_access(','public.system_version_access(')
 ) changes(signature,old_call,new_call) loop
  definition:=pg_get_functiondef(target.signature::regprocedure);
  if position(target.old_call in definition)=0 then raise exception 'package_reader_rollback_wrong_order: %',target.signature; end if;
  execute replace(definition,target.old_call,target.new_call);
 end loop;
end $repair$;
drop function public.website_document_read_actor(uuid,uuid,uuid,text,boolean,boolean);
alter function public.website_document_read_actor_package_core(uuid,uuid,uuid,text,boolean,boolean) rename to website_document_read_actor;
drop function public.agency_can_read_package_work(uuid,uuid,text,uuid);
drop function public.system_read_scope(uuid,uuid,text,boolean);
drop function public.system_package_read_work_ids(uuid,uuid,text);
alter function public.system_read_scope_package_core(uuid,uuid,text,boolean) rename to system_read_scope;
notify pgrst,'reload schema';
commit;
