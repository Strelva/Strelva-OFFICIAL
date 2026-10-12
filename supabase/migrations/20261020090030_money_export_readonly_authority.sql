-- Snapshot authorization for Connect-era portability readers; writer locks stay owned by the original helper.
begin;
set local lock_timeout='3s';
create function public.workspace_export_v3_read_role(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns text
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r text;
begin
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null;
 if not found then raise exception 'workspace_export_denied';end if;
 select role into r from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role in('owner','admin');
 if r='owner' then return 'owner';end if;
 if r='admin' or public.provider_seat_read_role(p_workspace_id,p_user_id,false) is not null then return 'operator';end if;
 raise exception 'workspace_export_denied';
end $$;
revoke all on function public.workspace_export_v3_read_role(uuid,uuid,text) from public,anon,authenticated,service_role;
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
 and position('public.workspace_export_v3_role(' in p.prosrc)>0 loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position('public.workspace_export_v3_role(' in definition)=0 then raise exception 'money_export_reader_drift: %',signature;end if;
  execute replace(definition,'public.workspace_export_v3_role(','public.workspace_export_v3_read_role(');
 end loop;
end $repair$;
notify pgrst,'reload schema';
commit;
