begin;
set local lock_timeout='5s';
do $$ begin if exists(select 1 from public.system_version_source_revisions where cardinality(locked_paths)>0) then raise exception 'enterprise_standards_rollback_retained_history'; end if; end; $$;
drop trigger enterprise_source_locks on public.system_version_source_revisions;
drop trigger enterprise_version_standard on public.system_versions;
drop trigger enterprise_override_standard on public.system_version_overrides;
drop trigger enterprise_release_standard on public.system_version_releases;
drop function public.system_version_source_locks_guard();
drop function public.system_version_enforce_standards();
drop function public.system_version_validate_locks(jsonb,jsonb);
create or replace function public.system_version_revision_json(r public.system_version_source_revisions, p_workspace_id uuid)
returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'source', jsonb_build_object('businessId', p_workspace_id, 'systemId', r.source_system_id, 'revisionId', r.id, 'number', r.number),
    'summary', r.summary, 'definition', r.definition, 'creatorWorkspaceId',r.creator_workspace_id, 'qualification', public.system_revision_qualification_json(r.id),
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
      requires_binding_kinds, published_by, published_at, declaration)
    values ((p_revision->'source'->>'revisionId')::uuid, src.system_id, n + 1, p_revision->>'label', p_revision->>'summary',
      p_revision->'definition', array(select jsonb_array_elements_text(p_revision->'requires'->'bindingKinds')),
      p_user_id, (p_revision->>'publishedAt')::timestamptz, p_revision->'declaration')
    returning * into r;
  return public.system_version_revision_json(r, src.business_workspace_id);
end;
$$;
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
  digest := md5(jsonb_build_object('source',source_id,'definition',p_revision->'definition','summary',p_revision->'summary',
    'label',p_revision->'label','requires',p_revision->'requires','expected',p_expected_revision)::text);
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
alter table public.system_version_source_revisions drop column locked_paths;
notify pgrst,'reload schema';
commit;
