begin;
set local lock_timeout='5s';
alter table public.system_version_source_revisions add column locked_paths text[] not null default '{}';
create function public.system_version_validate_locks(p_definition jsonb,p_paths jsonb) returns void
language plpgsql immutable set search_path=public,pg_temp as $$
declare path text;
begin
 if jsonb_typeof(p_paths) is distinct from 'array' or jsonb_array_length(p_paths)>100 then raise exception 'system_version_input_invalid'; end if;
 for path in select jsonb_array_elements_text(p_paths) loop
  if path !~ '^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$' or length(path)>300 or string_to_array(path,'.') && array['__proto__','prototype','constructor'] or p_definition #> string_to_array(path,'.') is null then raise exception 'system_version_input_invalid'; end if;
 end loop;
end;$$;
create or replace function public.system_version_revision_json(r public.system_version_source_revisions, p_workspace_id uuid)
returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'source', jsonb_build_object('businessId', p_workspace_id, 'systemId', r.source_system_id, 'revisionId', r.id, 'number', r.number),
    'lockedPaths',to_jsonb(r.locked_paths), 'summary', r.summary, 'definition', r.definition, 'creatorWorkspaceId',r.creator_workspace_id, 'qualification', public.system_revision_qualification_json(r.id),
    'requires', jsonb_build_object('bindingKinds', to_jsonb(r.requires_binding_kinds)),
    'publishedBy', r.published_by, 'publishedAt', public.system_version_ts(r.published_at))
    || case when r.declaration is null then '{}'::jsonb else jsonb_build_object('declaration',r.declaration) end
    || case when r.label is null then '{}'::jsonb else jsonb_build_object('label', r.label) end
$$;
create or replace function public.publish_system_version_source_revision(p_user_id uuid, p_verified_email text, p_revision jsonb)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare src public.system_version_sources; r public.system_version_source_revisions; n integer;
begin
  if p_revision is null or jsonb_typeof(p_revision) <> 'object' or jsonb_typeof(p_revision->'source') <> 'object'
    or jsonb_typeof(p_revision->'definition') <> 'object' or jsonb_typeof(p_revision->'summary') <> 'string'
    or jsonb_typeof(p_revision->'requires'->'bindingKinds') <> 'array'
    or (p_revision->'source'->>'number') !~ '^[1-9][0-9]{0,8}$' then
    raise exception 'system_version_input_invalid';
  end if;
  perform public.system_version_validate_locks(p_revision->'definition',coalesce(p_revision->'lockedPaths','[]'::jsonb));
  perform public.system_version_assert_source_manager((p_revision->'source'->>'businessId')::uuid, p_user_id, p_verified_email);
  select * into src from public.system_version_sources
    where system_id = (p_revision->'source'->>'systemId')::uuid and business_workspace_id = (p_revision->'source'->>'businessId')::uuid
    for update;
  if not found then raise exception 'system_not_found'; end if;
  if (p_revision->>'publishedBy') is distinct from p_user_id::text then raise exception 'system_version_input_invalid'; end if;
  select coalesce(max(number), 0) into n from public.system_version_source_revisions where source_system_id = src.system_id;
  if (p_revision->'source'->>'number')::integer <> n + 1 then raise exception 'system_version_revision_exists'; end if;
  if p_revision ? 'declaration' then perform public.system_package_assert_declaration(p_revision->'definition',p_revision->'declaration',array(select jsonb_array_elements_text(p_revision->'requires'->'bindingKinds'))); end if;
  insert into public.system_version_source_revisions(id, source_system_id, number, label, summary, definition,
      requires_binding_kinds, published_by, published_at, declaration, locked_paths)
    values ((p_revision->'source'->>'revisionId')::uuid, src.system_id, n + 1, p_revision->>'label', p_revision->>'summary',
      p_revision->'definition', array(select jsonb_array_elements_text(p_revision->'requires'->'bindingKinds')),
      p_user_id, (p_revision->>'publishedAt')::timestamptz, p_revision->'declaration', array(select jsonb_array_elements_text(coalesce(p_revision->'lockedPaths','[]'::jsonb))))
    returning * into r;
  return public.system_version_revision_json(r, src.business_workspace_id);
end;
$$;
create function public.system_version_source_locks_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin perform public.system_version_validate_locks(new.definition,to_jsonb(new.locked_paths)); return new; end;$$;
create trigger enterprise_source_locks before insert on public.system_version_source_revisions for each row execute function public.system_version_source_locks_guard();
revoke all on function public.system_version_source_locks_guard() from public,anon,authenticated,service_role;
-- Deferred check observes the complete transaction after native override rewrites.
-- Published source revisions and historical releases keep their existing guards.
create function public.system_version_enforce_standards() returns trigger
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
create constraint trigger enterprise_version_standard after insert or update on public.system_versions deferrable initially deferred for each row execute function public.system_version_enforce_standards();
create constraint trigger enterprise_override_standard after insert or update on public.system_version_overrides deferrable initially deferred for each row execute function public.system_version_enforce_standards();
create constraint trigger enterprise_release_standard after insert on public.system_version_releases deferrable initially deferred for each row execute function public.system_version_enforce_standards();
revoke all on function public.system_version_validate_locks(jsonb,jsonb),public.system_version_enforce_standards() from public,anon,authenticated,service_role;
create or replace function public.publish_agency_package(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_command_id uuid,
  p_expected_revision integer,p_revision jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.agency_package_commands; result jsonb; source_id uuid; digest text; command_digest text; latest integer;
begin
  perform public.require_agency_authoring_scope(p_workspace_id,p_workspace_id,p_user_id,p_verified_email);
  source_id := (p_revision->'source'->>'systemId')::uuid;
  if (p_revision->'source'->>'businessId')::uuid is distinct from p_workspace_id then raise exception 'business_record_access_denied'; end if;
  if p_expected_revision is null or p_expected_revision<0 or p_command_id is null
    or char_length(coalesce(p_revision->>'packageFingerprint','')) not between 1 and 150
    or jsonb_typeof(p_revision->'definition') is distinct from 'object' then raise exception 'system_version_input_invalid'; end if;
  perform public.agency_package_assert_shareable(p_revision->'definition');
  command_digest := public.agency_package_command_digest(p_workspace_id,source_id,p_command_id,
    p_revision->>'packageFingerprint',p_expected_revision,p_revision->>'summary');
  digest := md5((jsonb_build_object('source',source_id,'definition',p_revision->'definition','summary',p_revision->'summary',
    'label',p_revision->'label','requires',p_revision->'requires','expected',p_expected_revision) || case when p_revision ? 'lockedPaths' then jsonb_build_object('lockedPaths',p_revision->'lockedPaths') else '{}'::jsonb end)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select * into prior from public.agency_package_commands where command_id=p_command_id;
  if found then
    if prior.agency_workspace_id<>p_workspace_id or prior.source_system_id<>source_id or prior.input_digest<>digest
      or prior.command_digest<>command_digest or prior.created_by<>p_user_id then
      raise exception 'system_version_stale';
    end if;
    return public.system_version_revision_json((select r from public.system_version_source_revisions r where id=prior.source_revision_id),p_workspace_id);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('agency-package:'||source_id::text,0));
  select coalesce(max(number),0) into latest from public.system_version_source_revisions where source_system_id=source_id;
  if latest<>p_expected_revision or (p_revision->'source'->>'number')::integer<>latest+1 then raise exception 'system_version_stale'; end if;
  result := public.publish_system_version_source_revision(p_user_id,p_verified_email,p_revision);
  insert into public.agency_package_commands(command_id,agency_workspace_id,source_system_id,input_digest,command_digest,source_revision_id,created_by)
    values(p_command_id,p_workspace_id,source_id,digest,command_digest,(result->'source'->>'revisionId')::uuid,p_user_id);
  return result;
end;
$$;
notify pgrst,'reload schema';
commit;
