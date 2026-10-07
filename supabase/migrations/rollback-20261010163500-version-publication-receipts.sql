-- Leaves native publication receipts and existing System history untouched.
begin;
drop function if exists public.read_version_publication_status(uuid,uuid,text,uuid);
drop function public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb);
drop function public.create_make_real_activation(uuid,uuid,text,jsonb);
alter function public.save_make_real_activation_version_core(uuid,uuid,text,text,integer,jsonb) rename to save_make_real_activation;
alter function public.create_make_real_activation_version_core(uuid,uuid,text,jsonb) rename to create_make_real_activation;
grant execute on function public.create_make_real_activation(uuid,uuid,text,jsonb),public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb) to service_role;
drop function public.version_effect_artifact_matches(public.system_version_publication_bindings,jsonb,jsonb);
drop table public.system_version_publication_bindings;
drop function public.record_version_publication(uuid,bigint,uuid,jsonb,uuid,uuid);
drop function public.version_working_definition(uuid);
drop function public.version_plan_sha(jsonb);
drop function public.version_json_sha(jsonb);
drop function public.version_canonical_json(jsonb);
commit;
