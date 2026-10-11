\set ON_ERROR_STOP on
begin;
DO $$ declare original oid; original_body text; begin
 original:=to_regprocedure('public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer)');
 original_body:=pg_get_functiondef(original);
 if original is null then raise exception 'export_rpc_fixture_missing'; end if;
 begin
  alter function public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer) rename to runtime_data_injected_failure_export;
  -- Same catalog hazard as the migration's rename/create seam; this definite
  -- failure must restore the old externally callable name and body.
  perform public.runtime_data_deliberately_missing_function();
  raise exception 'injected_failure_not_raised';
 exception when undefined_function then null;
 end;
 if to_regprocedure('public.export_workspace_v3_category(uuid,uuid,text,text,integer,integer)') is distinct from original
   or pg_get_functiondef(original) is distinct from original_body
   or to_regprocedure('public.runtime_data_injected_failure_export(uuid,uuid,text,text,integer,integer)') is not null
   then raise exception 'failed_rename_did_not_preserve_export_catalog'; end if;
end $$;
rollback;
