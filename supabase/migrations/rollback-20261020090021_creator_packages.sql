-- Guarded local rollback: package records require an explicit data-preserving retirement first.
begin;
set local lock_timeout='2s';
do $$ begin if exists(select 1 from public.system_revision_qualifications) or exists(select 1 from public.system_revision_reviewers) or exists(select 1 from public.system_version_sources where listing_state<>'private') or exists(select 1 from public.system_version_source_revisions where declaration is not null) then raise exception 'rollback_creator_qualification_in_use'; end if;end $$;
drop function public.save_system_version(uuid,text,uuid,bigint,jsonb);
alter function public.save_system_version_package_core(uuid,text,uuid,bigint,jsonb) rename to save_system_version;
create or replace function public.system_version_source_json(src public.system_version_sources, p_user_id uuid, p_verified_email text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare mine uuid[]; full_view boolean;
begin
  mine := public.system_version_actor_workspaces(p_user_id, p_verified_email);
  full_view := src.business_workspace_id = any(mine);
  return jsonb_build_object(
    'source', jsonb_build_object('businessId', src.business_workspace_id, 'systemId', src.system_id),
    'hidden', src.hidden,
    'sharedWith', coalesce((select jsonb_agg(s.grantee_workspace_id order by s.shared_at, s.id)
      from public.system_version_source_shares s
      where s.source_system_id = src.system_id and s.revoked_at is null
        and (full_view or s.grantee_workspace_id = any(mine))), '[]'::jsonb),
    'createdAt', public.system_version_ts(src.created_at));
end;
$$;
create or replace function public.system_version_revision_json(r public.system_version_source_revisions, p_workspace_id uuid)
returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'source', jsonb_build_object('businessId', p_workspace_id, 'systemId', r.source_system_id, 'revisionId', r.id, 'number', r.number),
    'summary', r.summary, 'definition', r.definition,
    'requires', jsonb_build_object('bindingKinds', to_jsonb(r.requires_binding_kinds)),
    'publishedBy', r.published_by, 'publishedAt', public.system_version_ts(r.published_at))
    || case when r.label is null then '{}'::jsonb else jsonb_build_object('label', r.label) end
$$;
create or replace function public.system_version_json(v public.system_versions, p_access text, p_user_id uuid, p_verified_email text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare full_view boolean := p_access = 'full'; mine uuid[];
begin
  if not full_view then mine := public.system_version_actor_workspaces(p_user_id, p_verified_email); end if;
  return jsonb_build_object(
    'id', v.id,
    'version', jsonb_build_object('businessId', v.business_workspace_id, 'systemId', v.version_system_id),
    'source', jsonb_build_object('businessId', v.source_workspace_id, 'systemId', v.source_system_id),
    'context', jsonb_build_object('kind', v.context_kind, 'label', v.context_label),
    'baseline', jsonb_build_object('revision', v.baseline_revision, 'definition', v.baseline_definition),
    'overrides', coalesce((select jsonb_agg(jsonb_build_object('path', o.path, 'value', o.value, 'setBy', o.set_by,
      'setAt', public.system_version_ts(o.set_at)) order by o.position) from public.system_version_overrides o where o.version_id = v.id), '[]'::jsonb),
    'bindings', case when full_view then coalesce((select jsonb_agg(jsonb_build_object('kind', b.kind, 'connectionId', b.connection_ref,
      'ownerBusinessId', b.owner_workspace_id, 'boundBy', b.bound_by, 'boundAt', public.system_version_ts(b.bound_at)) order by b.bound_at, b.id)
      from public.system_version_bindings b where b.version_id = v.id and b.released_at is null), '[]'::jsonb) else '[]'::jsonb end,
    'localData', case when full_view or p_access = 'lineage_and_data' then v.local_data else '{}'::jsonb end,
    'releases', coalesce((select jsonb_agg(jsonb_build_object('number', r.number, 'definition', r.definition,
      'baselineRevision', r.baseline_revision, 'overridePaths', to_jsonb(r.override_paths), 'releasedBy', r.released_by,
      'releasedAt', public.system_version_ts(r.released_at)) order by r.number) from public.system_version_releases r where r.version_id = v.id), '[]'::jsonb),
    'currentRelease', v.current_release,
    'decisions', coalesce((select jsonb_agg(case when d.choice = 'adopted'
      then jsonb_build_object('sourceRevision', d.source_revision, 'choice', d.choice, 'resolutions', d.resolutions,
        'by', d.decided_by, 'at', public.system_version_ts(d.decided_at))
      else jsonb_build_object('sourceRevision', d.source_revision, 'choice', d.choice, 'reason', d.reason,
        'by', d.decided_by, 'at', public.system_version_ts(d.decided_at)) end order by d.position)
      from public.system_version_decisions d where d.version_id = v.id), '[]'::jsonb),
    'grants', coalesce((select jsonb_agg(jsonb_build_object('granteeBusinessId', g.grantee_workspace_id, 'scope', g.scope,
      'grantedBy', g.granted_by, 'grantedAt', public.system_version_ts(g.granted_at))
      || case when g.revoked_at is null then '{}'::jsonb else jsonb_build_object('revokedAt', public.system_version_ts(g.revoked_at)) end
      order by g.position) from public.system_version_grants g
      where g.version_id = v.id and (full_view or (g.revoked_at is null and g.grantee_workspace_id = any(mine)))), '[]'::jsonb),
    'rowRevision', v.row_revision,
    'createdBy', v.created_by,
    'createdAt', public.system_version_ts(v.created_at),
    'updatedAt', public.system_version_ts(v.updated_at));
end;
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
  insert into public.system_version_source_revisions(id, source_system_id, number, label, summary, definition,
      requires_binding_kinds, published_by, published_at)
    values ((p_revision->'source'->>'revisionId')::uuid, src.system_id, n + 1, p_revision->>'label', p_revision->>'summary',
      p_revision->'definition', array(select jsonb_array_elements_text(p_revision->'requires'->'bindingKinds')),
      p_user_id, (p_revision->>'publishedAt')::timestamptz)
    returning * into r;
  return public.system_version_revision_json(r, src.business_workspace_id);
end;
$$;
create or replace function public.create_system_version(p_user_id uuid, p_verified_email text, p_lineage jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.system_versions; r public.system_version_source_revisions; src public.system_version_sources;
  business uuid; v_system uuid; scope record;
begin
  if p_lineage is null or jsonb_typeof(p_lineage) <> 'object'
    or jsonb_typeof(p_lineage->'version') <> 'object' or jsonb_typeof(p_lineage->'source') <> 'object'
    or jsonb_typeof(p_lineage->'baseline') <> 'object' or jsonb_typeof(p_lineage->'context') <> 'object'
    or p_lineage->'overrides' <> '[]'::jsonb or p_lineage->'bindings' <> '[]'::jsonb or p_lineage->'releases' <> '[]'::jsonb
    or p_lineage->'decisions' <> '[]'::jsonb or p_lineage->'grants' <> '[]'::jsonb or p_lineage->'localData' <> '{}'::jsonb
    or p_lineage->'currentRelease' <> 'null'::jsonb or p_lineage->'rowRevision' <> '1'::jsonb
    or (p_lineage->>'createdBy') is distinct from p_user_id::text then
    raise exception 'system_version_input_invalid';
  end if;
  business := (p_lineage->'version'->>'businessId')::uuid;
  v_system := (p_lineage->'version'->>'systemId')::uuid;
  scope := public.system_actor_scope(business, p_user_id, p_verified_email, true);
  if scope.access not in ('owner','admin','agency') then raise exception 'business_record_access_denied'; end if;
  perform public.system_load(business, v_system, true, scope.work_ids);
  if exists (select 1 from public.system_versions where id = (p_lineage->>'id')::uuid) then raise exception 'system_version_exists'; end if;
  if exists (select 1 from public.system_versions sv where sv.version_system_id = v_system)
    or exists (select 1 from public.system_version_sources vs where vs.system_id = v_system) then
    raise exception 'system_version_input_invalid';
  end if;
  select * into src from public.system_version_sources
    where system_version_sources.system_id = (p_lineage->'source'->>'systemId')::uuid
      and system_version_sources.business_workspace_id = (p_lineage->'source'->>'businessId')::uuid;
  if not found or not (src.business_workspace_id = business or exists (select 1 from public.system_version_source_shares s
      where s.source_system_id = src.system_id and s.grantee_workspace_id = business and s.revoked_at is null)) then
    raise exception 'business_record_access_denied';
  end if;
  select * into r from public.system_version_source_revisions
    where source_system_id = src.system_id and number = (p_lineage->'baseline'->>'revision')::integer;
  if not found or r.definition <> p_lineage->'baseline'->'definition' then raise exception 'system_version_input_invalid'; end if;
  insert into public.system_versions(id, version_system_id, business_workspace_id, source_system_id, source_workspace_id,
      context_kind, context_label, baseline_revision_id, baseline_revision, baseline_definition, created_by, created_at, updated_at)
    values ((p_lineage->>'id')::uuid, v_system, business, src.system_id, src.business_workspace_id,
      p_lineage->'context'->>'kind', p_lineage->'context'->>'label', r.id, r.number, r.definition, p_user_id,
      (p_lineage->>'createdAt')::timestamptz, (p_lineage->>'updatedAt')::timestamptz)
    returning * into v;
  return public.system_version_json(v, 'full', p_user_id, p_verified_email);
end;
$$;
drop trigger package_source_identity on public.system_version_sources;
drop trigger package_revision_identity on public.system_version_source_revisions;
drop trigger package_version_identity on public.system_versions;
drop function public.record_system_revision_qualification(uuid,text,uuid),public.review_system_revision_qualification(uuid,text,uuid,boolean,text),public.set_system_package_listing(uuid,uuid,text,uuid,text),public.read_system_package_listings(uuid,uuid,text),public.system_package_behavior(jsonb,text[]),public.system_package_assert_declaration(jsonb,jsonb,text[]),public.system_package_rehearsal(jsonb),public.system_package_identity_guard(),public.system_revision_is_qualified(uuid),public.system_revision_qualification_json(uuid);
create or replace function public.system_version_source_visible(p_source_system_id uuid, p_user_id uuid, p_verified_email text)
returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare src public.system_version_sources; mine uuid[];
begin
  select * into src from public.system_version_sources where system_id = p_source_system_id;
  if not found then return false; end if;
  mine := public.system_version_actor_workspaces(p_user_id, p_verified_email);
  return src.business_workspace_id = any(mine) or exists (select 1 from public.system_version_source_shares s
    where s.source_system_id = src.system_id and s.revoked_at is null and s.grantee_workspace_id = any(mine));
end;
$$;
drop table public.system_revision_qualifications,public.system_revision_reviewers;
alter table public.system_versions drop column creator_workspace_id,drop column installed_source_revision_id;
alter table public.system_version_source_revisions drop column creator_workspace_id,drop column declaration;
alter table public.system_version_sources drop column creator_workspace_id,drop column listing_state;
grant execute on function public.save_system_version(uuid,text,uuid,bigint,jsonb) to service_role;
commit;
