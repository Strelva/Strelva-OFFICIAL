\set ON_ERROR_STOP on
begin read only;
do $contract$
declare signature text;
begin
 foreach signature in array array[
 'public.system_package_install_grant_active(public.system_package_install_grants,uuid,text)',
 'public.require_private_application_source_share(uuid,uuid,text,uuid)'] loop
  if (select provolatile from pg_proc where oid=signature::regprocedure)<>'s' then raise exception 'private_read_not_stable';end if;
  if has_function_privilege('anon',signature,'EXECUTE') or has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'private_read_exposed';end if;
 end loop;
 if exists(select 1 from public.private_definition_predecessors receipt where encode(sha256(convert_to(pg_get_functiondef(receipt.signature::regprocedure),'UTF8')),'hex')<>receipt.after_sha256)then raise exception 'private_predecessor_drift';end if;
end $contract$;
rollback;
