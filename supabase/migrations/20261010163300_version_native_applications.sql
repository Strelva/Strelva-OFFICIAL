-- A packaged native application becomes a real, separately owned runtime.
-- Existing application RPCs retain schema/rehearsal/record checks. All writes
-- below are in the same transaction as the Version command/release.
begin;
set local lock_timeout='2s';
create table if not exists public.system_version_native_applications (
  version_id uuid primary key references public.system_versions(id),
  business_workspace_id uuid not null references public.workspaces(id),
  work_id uuid not null unique,
  synced_design_revision integer not null default 0,
  foreign key (work_id,business_workspace_id) references public.saved_product_work(id,workspace_id)
);
alter table public.system_version_native_applications enable row level security;
revoke all on public.system_version_native_applications from public,anon,authenticated,service_role;
grant select on public.system_version_native_applications to service_role;

create function public.create_version_system_command(
  p_user_id uuid,p_verified_email text,p_lineage jsonb,p_name text,p_kind text,p_command_id uuid,p_native_payload jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare business uuid; source_business uuid; scope record; source_revision public.system_version_source_revisions;
  system public.systems; version public.system_versions; work public.saved_product_work; digest text; created jsonb; lineage jsonb;
begin
  business:=(p_lineage->'version'->>'businessId')::uuid;
  source_business:=(p_lineage->'source'->>'businessId')::uuid;
  scope:=public.system_actor_scope(business,p_user_id,p_verified_email,true);
  if scope.access not in ('owner','admin') then raise exception 'business_record_access_denied'; end if;
  scope:=public.system_actor_scope(source_business,p_user_id,p_verified_email,true);
  if scope.access not in ('owner','admin') then raise exception 'business_record_access_denied'; end if;
  perform pg_advisory_xact_lock(hashtextextended(business::text||':'||p_command_id::text,20261010));
  select * into source_revision from public.system_version_source_revisions where source_system_id=(p_lineage->'source'->>'systemId')::uuid
    and number=(p_lineage->'baseline'->>'revision')::integer;
  if not found or source_revision.definition->>'kind' is distinct from 'internal_app' or p_kind is distinct from 'internal_app'
    or source_revision.definition is distinct from p_lineage->'baseline'->'definition'
    or (source_revision.definition-array['kind','title','fields','components'])<>'{}'::jsonb then raise exception 'system_version_input_invalid'; end if;
  perform public.validate_application_spec(p_native_payload->'spec');
  if p_native_payload->'spec' is distinct from (source_revision.definition-'kind')||jsonb_build_object('maintenanceOwner',p_user_id)
    or p_native_payload->>'status' is distinct from 'draft' or p_native_payload->>'createdBy' is distinct from p_user_id::text
    or p_native_payload->'records' is distinct from '[]'::jsonb or p_native_payload ?| array['installation','release','releases','candidate']
    or (p_native_payload-array['version','revision','title','createdBy','createdAt','history','spec','specVersion','status','versions','rehearsal','records'])<>'{}'::jsonb
    or p_native_payload->>'revision' is distinct from '0' or p_native_payload->>'specVersion' is distinct from '1'
    or p_native_payload->'history' is distinct from '[]'::jsonb or p_native_payload->'rehearsal' is distinct from 'null'::jsonb
    or p_native_payload->'versions' is distinct from jsonb_build_array(jsonb_build_object('version',1,'spec',p_native_payload->'spec'))
    or p_native_payload->>'version' is distinct from '1' or p_native_payload->>'title' is distinct from p_native_payload->'spec'->>'title' then
    raise exception 'system_version_input_invalid';
  end if;
  digest:=encode(sha256(convert_to(jsonb_build_object('source',p_lineage->'source','baseline',p_lineage->'baseline',
    'context',p_lineage->'context','name',p_name,'kind',p_kind)::text,'UTF8')),'hex');
  select * into system from public.systems where business_workspace_id=business and command_id=p_command_id;
  if found then
    if system.command_digest<>digest or system.created_by<>p_user_id then raise exception 'system_command_conflict'; end if;
    select * into version from public.system_versions where version_system_id=system.id;
    if not found then raise exception 'system_version_input_invalid'; end if;
    return public.system_version_json(version,'full',p_user_id,p_verified_email);
  end if;
  if source_business<>business then
    perform 1 from public.system_version_sources where system_id=source_revision.source_system_id for update;
    perform public.put_system_version_source(source_business,p_user_id,p_verified_email,source_revision.source_system_id,
      array(select distinct target from (
        select s.grantee_workspace_id target from public.system_version_source_shares s where s.source_system_id=source_revision.source_system_id and s.revoked_at is null
        union all select business) shares));
  end if;
  select * into work from public.save_system_work(business,p_user_id,p_verified_email,'applications','application',p_name,p_native_payload,null,null);
  created:=public.create_business_system(business,p_user_id,p_verified_email,jsonb_build_object('name',p_name,'kind',p_kind,
    'origin',jsonb_build_object('kind','saved_work','ref',work.id)),p_command_id,digest);
  lineage:=public.create_system_version(p_user_id,p_verified_email,jsonb_set(p_lineage,'{version,systemId}',created->'id'));
  insert into public.system_version_native_applications(version_id,business_workspace_id,work_id) values ((lineage->>'id')::uuid,business,work.id);
  return lineage;
end $$;
revoke all on function public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.create_version_system_command(uuid,text,jsonb,text,text,uuid,jsonb) to service_role;

create function public.read_version_native_runtime(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare version public.system_versions; access record; result jsonb; synced integer; current_design integer;
begin
  select * into version from public.system_versions where id=p_version_id and business_workspace_id=p_workspace_id;
  if not found then raise exception 'system_not_found'; end if;
  access:=public.system_version_access(version,p_user_id,p_verified_email,false);
  if access.access is distinct from 'full' then raise exception 'business_record_access_denied'; end if;
  select jsonb_build_object('kind','internal_app','workId',n.work_id,'releaseNumber',s.current_release_version,'designRevision',s.candidate_design_revision),n.synced_design_revision,s.candidate_design_revision
    into result,synced,current_design from public.system_version_native_applications n join public.application_states s on s.work_id=n.work_id and s.workspace_id=n.business_workspace_id
    where n.version_id=version.id;
  if result is null then return null; end if;
  if synced<>current_design then raise exception 'system_version_stale'; end if;
  return result;
end $$;
revoke all on function public.read_version_native_runtime(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_version_native_runtime(uuid,uuid,text,uuid) to service_role;

alter function public.save_system_version(uuid,text,uuid,bigint,jsonb) rename to save_system_version_native_core;
revoke all on function public.save_system_version_native_core(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
create function public.save_system_version(p_user_id uuid,p_verified_email text,p_version_id uuid,p_expected_row_revision bigint,p_lineage jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare before_version public.system_versions; native public.system_version_native_applications; state public.application_states;
  native_system public.systems;
  result jsonb; definition jsonb; spec jsonb; released boolean; release_count integer; approval public.owner_decisions;
  access record; override record; parts text[]; idx integer; stored jsonb; expected_paths text[];
begin
  select * into before_version from public.system_versions where id=p_version_id for update;
  if not found then raise exception 'system_not_found'; end if;
  access:=public.system_version_access(before_version,p_user_id,p_verified_email,true);
  if access.access is distinct from 'full' then raise exception 'business_record_access_denied'; end if;
  if before_version.row_revision<>p_expected_row_revision then raise exception 'system_version_stale'; end if;
  select count(*) into release_count from public.system_version_releases where version_id=p_version_id;
  released:=jsonb_array_length(p_lineage->'releases')>release_count;
  if not released and (p_lineage->>'currentRelease')::integer is distinct from before_version.current_release
    then raise exception 'system_version_input_invalid'; end if;
  if released then
    if jsonb_array_length(p_lineage->'releases')<>release_count+1
      or (p_lineage->>'currentRelease')::integer is distinct from release_count+1 then raise exception 'system_version_input_invalid'; end if;
    stored:=public.system_version_json(before_version,'full',p_user_id,p_verified_email);
    if (stored-array['releases','currentRelease','rowRevision','updatedAt']) is distinct from
      (p_lineage-array['releases','currentRelease','rowRevision','updatedAt']) then raise exception 'system_version_stale'; end if;
    definition:=before_version.baseline_definition;
    for override in select path,value from public.system_version_overrides where version_id=p_version_id order by char_length(path),position loop
      if override.path='*' then
        if jsonb_typeof(override.value) is distinct from 'object' then raise exception 'system_version_input_invalid'; end if;
        definition:=override.value;
      else
        parts:=string_to_array(override.path,'.');
        for idx in 1..cardinality(parts)-1 loop
          if jsonb_typeof(definition#>parts[1:idx]) is distinct from 'object' then raise exception 'system_version_input_invalid'; end if;
        end loop;
        if override.value is null then definition:=definition#-parts;
        else definition:=jsonb_set(definition,parts,override.value,true); end if;
      end if;
    end loop;
    if (p_lineage->'releases'->-1->'definition') is distinct from definition
      or (p_lineage->'releases'->-1->>'baselineRevision')::integer is distinct from before_version.baseline_revision then raise exception 'system_version_stale'; end if;
    with recursive changes(path,before,after) as (
      select ''::text,before_version.baseline_definition,definition
      union all
      select case when c.path='' then k.key else c.path||'.'||k.key end,c.before->k.key,c.after->k.key
      from changes c cross join lateral (
        select jsonb_object_keys(case when jsonb_typeof(c.before)='object' and jsonb_typeof(c.after)='object' then c.before||c.after else '{}'::jsonb end) key
      ) k where c.before is distinct from c.after
    ) select coalesce(array_agg(path order by path),'{}'::text[]) into expected_paths from changes
      where path<>'' and before is distinct from after and not (coalesce(jsonb_typeof(before),'')='object' and coalesce(jsonb_typeof(after),'')='object');
    if array(select jsonb_array_elements_text(p_lineage->'releases'->-1->'overridePaths') order by 1) is distinct from expected_paths
      then raise exception 'system_version_input_invalid'; end if;
    select * into native from public.system_version_native_applications where version_id=p_version_id for update;
    if not found then raise exception 'system_version_runtime_unsupported'; end if;
    -- The TS gate and this transaction bind the same immutable owner decision.
    -- JSON.stringify's compact array is intentional: it is the wire hash.
    select d.* into approval from public.owner_decisions d join public.system_version_preparations p on p.owner_decision_id=d.id
      where p.business_workspace_id=before_version.business_workspace_id and p.version_id=p_version_id
        and p.row_revision=p_expected_row_revision and p.source_revision=before_version.baseline_revision
        and d.workspace_id=before_version.business_workspace_id and d.system_id=before_version.version_system_id
        and d.source_lifecycle='version_release' and d.source_id=p_version_id::text and d.state='approved'
        and d.change_kind='system.change_live' and not d.admin_may_decide
        and ((d.route='owner_decides' and d.decided_by_kind in ('owner_link','owner_session'))
          or (d.route='strelva_reviews' and d.decided_by_kind='operator'))
        and d.outcome is distinct from 'failed'
        and d.revision_hash=encode(sha256(convert_to('["version_release","'||p_version_id::text||'",'||p_expected_row_revision::text||']','UTF8')),'hex')
      for update of d;
    if not found then raise exception 'system_version_release_approval_required'; end if;
  end if;
  -- The core retains actor checks, owner-only grants, immutability and CAS.
  result:=public.save_system_version_native_core(p_user_id,p_verified_email,p_version_id,p_expected_row_revision,p_lineage);
  if released then
      perform public.application_lock_work(native.business_workspace_id,native.work_id);
      select * into state from public.application_states where work_id=native.work_id for update;
      if not found then raise exception 'system_version_runtime_unsupported'; end if;
      if state.current_release_version is distinct from before_version.current_release
        or state.candidate_design_revision<>native.synced_design_revision then raise exception 'system_version_stale'; end if;
      definition:=p_lineage->'releases'->-1->'definition';
      if definition->>'kind' is distinct from 'internal_app' then raise exception 'system_version_input_invalid'; end if;
      spec:=(definition-'kind')||jsonb_build_object('maintenanceOwner',state.candidate_spec->>'maintenanceOwner');
      perform public.validate_application_spec(spec);
      if state.candidate_spec is distinct from spec then
        perform public.update_application_candidate(native.work_id,native.business_workspace_id,p_user_id,p_verified_email,state.candidate_design_revision,spec);
        select * into state from public.application_states where work_id=native.work_id;
      end if;
      perform public.rehearse_application_candidate(native.work_id,native.business_workspace_id,p_user_id,p_verified_email,state.candidate_design_revision);
      perform public.publish_application_candidate(native.work_id,native.business_workspace_id,p_user_id,p_verified_email,state.candidate_design_revision,coalesce(state.current_release_version,0));
      select * into native_system from public.systems where id=before_version.version_system_id for update;
      if native_system.lifecycle='draft' then
        perform public.transition_system_lifecycle(native.business_workspace_id,p_user_id,p_verified_email,native_system.id,native_system.change_number,'live');
      end if;
      update public.system_version_native_applications set synced_design_revision=state.candidate_design_revision where version_id=p_version_id;
  end if;
  return result;
end $$;
revoke all on function public.save_system_version(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_system_version(uuid,text,uuid,bigint,jsonb) to service_role;
commit;
