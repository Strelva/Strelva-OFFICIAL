begin;
do $$begin
 if exists(select 1 from public.custom_sandbox_runtime_qualifications) or exists(select 1 from public.sandbox_build_runtime_bindings)
 then raise exception 'sandbox_runtime_rollback_requires_data_preservation';end if;
end;$$;
drop function public.prepare_qualified_sandbox_build_attempt(uuid,integer,integer,text,text,text,text,text,uuid,text,text),public.begin_qualified_sandbox_build_attempt(uuid,uuid,text),public.qualify_custom_sandbox_runtime(uuid,integer,text,text,text,text,text,jsonb,uuid,text),public.assert_custom_sandbox_runtime(uuid,integer,integer,text,text,text,text,text,uuid,text);
drop table public.sandbox_build_runtime_bindings,public.custom_sandbox_runtime_qualifications;
commit;
