\set ON_ERROR_STOP on
-- The native fixture was committed in this throwaway local cluster only.
do $$ declare native uuid; snapshot jsonb; begin
 select work_id into native from public.system_version_native_applications n join public.system_versions v on v.id=n.version_id
   where v.business_workspace_id='bc630000-0000-4000-8000-000000000011';
 if native is null then raise exception 'rollback lost native mapping'; end if;
 snapshot:=public.application_runtime_snapshot(native);
 if snapshot->>'release_version'<>'2' or jsonb_array_length(snapshot->'records')<>1 then raise exception 'rollback lost live interface or destination records'; end if;
 if (select count(*) from public.system_version_preparations where business_workspace_id='bc630000-0000-4000-8000-000000000011')<>3 then raise exception 'rollback lost preparation receipts'; end if;
 if to_regprocedure('public.save_system_version_native_core(uuid,text,uuid,bigint,jsonb)') is not null or to_regprocedure('public.save_system_version(uuid,text,uuid,bigint,jsonb)') is null then raise exception 'rollback did not restore stable save wrapper'; end if;
 if has_function_privilege('service_role','public.save_system_version_owner_grants_core(uuid,text,uuid,bigint,jsonb)','EXECUTE') then raise exception 'rollback exposed owner grants core'; end if;
end $$;
