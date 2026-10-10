\set ON_ERROR_STOP on
-- Catalog contract on the historical composed tail. Actual creator operations,
-- retained-history inverse/reapply and drift probes use the isolated native31.
begin read only;
do $$
declare r regprocedure:=to_regprocedure('public.read_creator_maintenance_operations(uuid,uuid,text)');w regprocedure:=to_regprocedure('public.record_creator_maintenance_from_workspace(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz)');
begin
 if r is null or w is null or (select count(*) from release_rollback_baseline.creator_maintenance_operations_catalog)<>2 then raise exception 'creator operations exact migration/catalog required';end if;
 if not exists(select 1 from pg_proc where oid=r and provolatile='s' and md5(prosrc)='b9d1f652439acf69f4b1c5db8e1674f8') or not exists(select 1 from pg_proc where oid=w and provolatile='v' and md5(prosrc)='e78ad511867bceea67f3b98603661611') then raise exception 'creator operations reader/writer source differs';end if;
 if not has_function_privilege('service_role',r,'EXECUTE') or not has_function_privilege('service_role',w,'EXECUTE') or has_function_privilege('anon',r,'EXECUTE') or has_function_privilege('authenticated',w,'EXECUTE') or has_function_privilege('service_role','public.record_creator_royalty_maintenance_before_identity(uuid,uuid,text,text,text,text,timestamptz)','EXECUTE') then raise exception 'creator operations supplied actor or hidden helper exposure';end if;
end $$;
rollback;
