-- Run only on the owned disposable current database after the forward migration.
-- This file is a contract draft; authoring it does not prove execution.
\set ON_ERROR_STOP on
begin read only;
do $contract$
declare signature text;
begin
 foreach signature in array array['public.agency_can_author_created_application(uuid,uuid,text,uuid)','public.agency_created_application_work_ids(uuid,uuid,text)','public.read_agency_created_application(uuid,uuid,text,uuid)'] loop
  if (select provolatile from pg_proc where oid=signature::regprocedure)<>'s' then raise exception 'creator_read_not_stable'; end if;
  if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'creator_actor_rpc_exposed'; end if;
  if not has_function_privilege('service_role',signature,'EXECUTE') then raise exception 'creator_server_rpc_missing'; end if;
 end loop;
 if has_function_privilege('authenticated','public.lock_agency_created_application(uuid,uuid,text,uuid)','EXECUTE') then raise exception 'creator_mutator_exposed'; end if;
 if exists(select 1 from public.agency_created_application_predecessors p where
   encode(sha256(convert_to(pg_get_functiondef(p.signature::regprocedure),'UTF8')),'hex')<>p.after_sha256) then raise exception 'creator_patch_predecessor_receipt_drift'; end if;
end $contract$;
rollback;
