\set ON_ERROR_STOP on
-- Prepared candidate only. Coordinator owns native reproduction/application window.
begin;
do $guard$
begin
 if (select prosrc from pg_proc where oid=to_regprocedure('public.system_version_enforce_standards()')) is distinct from $expected$
declare v public.system_versions; r public.system_version_source_revisions; o record; definition jsonb; source_definition jsonb; paths text[]; locked_path text;
begin
 if tg_table_name='system_versions' then select * into v from public.system_versions where id=new.id;
 else select * into v from public.system_versions where id=new.version_id; end if;
 if not found then return null; end if;
 select * into r from public.system_version_source_revisions where id=v.baseline_revision_id;
 if cardinality(r.locked_paths)=0 then return null; end if;
 source_definition:=public.system_bundle_component_definition(v.id,r.definition);
 paths:=r.locked_paths;
 if exists(select 1 from public.system_bundle_components where version_id=v.id) then
  paths:=case when 'systems'=any(r.locked_paths) then array['*'] else '{}'::text[] end;
 end if;
 if tg_table_name='system_version_releases' then definition:=new.definition;
 else
  definition:=v.baseline_definition;
  for o in select overrides.* from public.system_version_overrides overrides where overrides.version_id=v.id order by length(overrides.path),overrides.position loop
   if o.path='*' then definition:=o.value;
   else definition:=jsonb_set(definition,string_to_array(o.path,'.'),o.value,true); end if;
  end loop;
 end if;
 foreach locked_path in array paths loop
  if (case when locked_path='*' then definition else definition #> string_to_array(locked_path,'.') end) is distinct from (case when locked_path='*' then source_definition else source_definition #> string_to_array(locked_path,'.') end) then raise exception 'system_version_standard_locked'; end if;
 end loop;
 return null;
end;$expected$ then
  raise exception 'enterprise_standards_candidate_function_drift';
 end if;
end;
$guard$;
create or replace function public.system_version_enforce_standards() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.system_versions; r public.system_version_source_revisions; o record; definition jsonb; source_definition jsonb; paths text[]; path text;
begin
 if tg_table_name='system_versions' then select * into v from public.system_versions where id=new.id;
 else select * into v from public.system_versions where id=new.version_id; end if;
 if not found then return null; end if;
 select * into r from public.system_version_source_revisions where id=v.baseline_revision_id;
 if cardinality(r.locked_paths)=0 then return null; end if;
 source_definition:=public.system_bundle_component_definition(v.id,r.definition);
 paths:=r.locked_paths;
 if exists(select 1 from public.system_bundle_components where version_id=v.id) then
  paths:=case when 'systems'=any(r.locked_paths) then array['*'] else '{}'::text[] end;
 end if;
 if tg_table_name='system_version_releases' then definition:=new.definition;
 else
  definition:=v.baseline_definition;
  for o in select * from public.system_version_overrides where version_id=v.id order by length(path),position loop
   if o.path='*' then definition:=o.value;
   else definition:=jsonb_set(definition,string_to_array(o.path,'.'),o.value,true); end if;
  end loop;
 end if;
 foreach path in array paths loop
  if (case when path='*' then definition else definition #> string_to_array(path,'.') end) is distinct from (case when path='*' then source_definition else source_definition #> string_to_array(path,'.') end) then raise exception 'system_version_standard_locked'; end if;
 end loop;
 return null;
end;$$;
commit;
