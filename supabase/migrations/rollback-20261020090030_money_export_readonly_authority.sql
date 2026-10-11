begin;
set local lock_timeout='3s';
do $repair$ declare signature text; definition text;
begin
 for signature in select readers.signature from (values
  ('public.read_workspace_exit_handoff_plan(uuid,uuid,text)'),
  ('public.read_workspace_exit_handoff_plan_before_evidence(uuid,uuid,text)'),
  ('public.read_workspace_export_build(uuid,uuid,text)'),
  ('public.read_workspace_export_owner_part(uuid,uuid,text,integer)'),
  ('public.read_workspace_export_owner_status(uuid,uuid,text)')
 ) readers(signature)
 union all
 select p.oid::regprocedure::text from pg_proc p where p.pronamespace='public'::regnamespace
 and p.proname like 'export_workspace_v3_category%%'
 and position('public.workspace_export_v3_read_role(' in p.prosrc)>0 loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('public.workspace_export_v3_read_role(' in definition)=0 then raise exception 'money_export_reader_drift: %',signature;end if;
  execute replace(definition,'public.workspace_export_v3_read_role(','public.workspace_export_v3_role(');
 end loop;
end $repair$;
drop function public.workspace_export_v3_read_role(uuid,uuid,text);
notify pgrst,'reload schema';
commit;
