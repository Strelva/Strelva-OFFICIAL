-- Ordered rollback: remove this tail before the earlier snapshot-reader repair.
begin;
set local lock_timeout='3s';
do $repair$ declare target record; definition text;
begin
 for target in select * from (values
  ('public.read_system_package_listings(uuid,uuid,text)','public.system_read_scope(','public.system_actor_scope('),
  ('public.read_system_package_creator(uuid,uuid,text,uuid)','public.system_version_read_access(','public.system_version_access(')
 ) changes(signature,old_call,new_call) loop
  definition:=pg_get_functiondef(target.signature::regprocedure);
  if position(target.old_call in definition)=0 then raise exception 'package_reader_rollback_wrong_order: %',target.signature; end if;
  execute replace(definition,target.old_call,target.new_call);
 end loop;
end $repair$;
drop function public.system_read_scope(uuid,uuid,text,boolean);
drop function public.system_package_read_work_ids(uuid,uuid,text);
alter function public.system_read_scope_package_core(uuid,uuid,text,boolean) rename to system_read_scope;
notify pgrst,'reload schema';
commit;
