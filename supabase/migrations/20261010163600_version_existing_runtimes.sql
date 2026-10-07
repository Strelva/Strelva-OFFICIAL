-- Attach lineage to an actual separately owned native System. An attachment
-- does not create an artifact, publish anything or claim a tracked release.
begin;
set local lock_timeout='2s';
create function public.read_version_existing_runtime(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_system_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare scope record; system public.systems; tenant public.tenants; definition jsonb; effects jsonb:='[]'; state public.application_states;
  document public.website_documents; work public.saved_product_work; inquiry public.inquiry_workspaces; capability jsonb; request jsonb; sections jsonb;
begin
  scope:=public.system_actor_scope(p_workspace_id,p_user_id,p_verified_email,false);
  if scope.access not in ('owner','admin') or scope.work_ids is not null then raise exception 'business_record_access_denied'; end if;
  system:=public.system_load(p_workspace_id,p_system_id,false,null);
  if system.origin_kind='saved_work' then
    select * into work from public.saved_product_work where id::text=system.origin_ref and workspace_id=p_workspace_id;
    if not found then raise exception 'system_version_runtime_unsupported'; end if;
    if work.product_id='applications' then
      select * into state from public.application_states where work_id=work.id and workspace_id=p_workspace_id;
      if not found then raise exception 'system_version_runtime_unsupported'; end if;
      definition:=jsonb_build_object('kind','internal_app')||(state.candidate_spec-'maintenanceOwner');
      effects:=jsonb_build_array(jsonb_build_object('id','publish-app','kind','publish','channel','internal_app','system',jsonb_build_object('systemId',system.id),
        'description','Publish this prepared app definition','request',jsonb_build_object('workId',work.id,'expectedCandidateRevision',state.candidate_design_revision,'expectedReleaseVersion',state.current_release_version),'after','[]'::jsonb));
    elsif work.product_id='websites' then
      select * into document from public.website_documents where workspace_id=p_workspace_id and website_work_id=work.id order by revision desc limit 1;
      if not found then raise exception 'system_version_runtime_unsupported'; end if;
      definition:=jsonb_build_object('kind','website','document',document.document-array['capabilities','provenance']);
      effects:=jsonb_build_array(jsonb_build_object('id','publish-website','kind','publish','channel','hosted_website','system',jsonb_build_object('systemId',system.id),
        'description','Publish this prepared website document','request',jsonb_build_object('workId',work.id,'candidateRevision',document.revision,'candidateContentHash',document.content_hash),'after','[]'::jsonb));
    end if;
  elsif system.origin_kind='tenant' then
    select t.* into tenant from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id and l.workspace_id=p_workspace_id where t.stable_id::text=system.origin_ref;
    if not found then raise exception 'business_record_access_denied'; end if;
    -- An approved hosted candidate on this tenant wins over current legacy
    -- content. It is still a draft until its ordinary publish effect runs.
    select d.* into document from public.website_documents d join public.saved_product_work w on w.id=d.website_work_id and w.workspace_id=d.workspace_id
      join public.website_document_heads h on h.website_work_id=d.website_work_id and h.revision=d.revision
      where d.workspace_id=p_workspace_id and w.payload->'rebuild'->>'tenantId'=tenant.id order by d.created_at desc limit 1;
    if found then
      definition:=jsonb_build_object('kind','website','document',document.document-array['capabilities','provenance']);
      effects:=jsonb_build_array(jsonb_build_object('id','publish-website','kind','publish','channel','hosted_website','system',jsonb_build_object('systemId',system.id),
        'description','Publish this prepared website document','request',jsonb_build_object('workId',document.website_work_id,'candidateRevision',document.revision,'candidateContentHash',document.content_hash),'after','[]'::jsonb));
    else
      select coalesce(jsonb_object_agg(section,data),'{}') into sections from public.content where tenant_id=tenant.id;
      if sections='{}'::jsonb or (select count(*) from jsonb_object_keys(sections))>20 then raise exception 'system_version_runtime_unsupported'; end if;
      definition:=jsonb_build_object('kind','website','sections',sections);
      select jsonb_agg(jsonb_build_object('id','publish-'||section,'kind','publish','channel','tenant_content','system',jsonb_build_object('systemId',system.id),
        'description','Publish the prepared '||section||' section','request',jsonb_build_object('tenantId',tenant.id,'section',section,'data',data),
        'publish',jsonb_build_object('section',section,'data',data),'after','[]'::jsonb) order by section) into effects from public.content where tenant_id=tenant.id;
    end if;
  elsif system.origin_kind='inquiry_workspace' then
    select iw.* into inquiry from public.inquiry_workspaces iw join public.tenant_workspace_links l on l.tenant_stable_id=iw.tenant_stable_id and l.workspace_id=p_workspace_id where iw.id::text=system.origin_ref;
    if not found or jsonb_array_length(inquiry.state->'capabilities')<>1 then raise exception 'system_version_runtime_unsupported'; end if;
    capability:=inquiry.state->'capabilities'->0;
    select r into request from jsonb_array_elements(inquiry.state->'requests') r where r->>'id'=capability->>'activeRequestId';
    definition:=jsonb_build_object('kind','inquiry','configuration',coalesce(request->'draft',capability->'live')-array['id','businessId','version']);
    if request->'draft' is not null and request->'draft'<>'null'::jsonb and request->>'activeChangeId' is not null then
      effects:=jsonb_build_array(jsonb_build_object('id','publish-inquiry','kind','publish','channel','inquiry_form','system',jsonb_build_object('systemId',system.id),
        'description','Publish this prepared inquiry configuration','request',jsonb_build_object('tenantId',inquiry.tenant_id,'businessId',inquiry.business_id,'requestId',request->>'id',
          'capabilityId',capability->>'id','changeId',request->>'activeChangeId','version',request->'draft'->'version'),'after','[]'::jsonb));
    end if;
  end if;
  if definition is null or definition->'configuration'='null'::jsonb then raise exception 'system_version_runtime_unsupported'; end if;
  return jsonb_build_object('workspaceId',p_workspace_id,'systemId',p_system_id,'definition',definition,'effects',effects,
    'fingerprint',public.version_json_sha(definition),'baseline',case when system.current_revision_id is null then null else jsonb_build_object('businessId',p_workspace_id,'systemId',system.id,'revisionId',system.current_revision_id,'number',system.current_revision_number) end);
end $$;

create table public.system_version_attachment_commands (
  business_workspace_id uuid not null references public.workspaces(id),command_id uuid not null,
  command_digest text not null,actor_id uuid not null references public.users(id),version_id uuid not null references public.system_versions(id),
  primary key(business_workspace_id,command_id)
);
alter table public.system_version_attachment_commands enable row level security;
revoke all on public.system_version_attachment_commands from public,anon,authenticated,service_role;
create function public.attach_version_existing_system(p_agency_workspace_id uuid,p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_system_id uuid,p_command_id uuid,p_lineage jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare runtime jsonb; digest text; command public.system_version_attachment_commands; version public.system_versions; source public.system_version_source_revisions; result jsonb;
begin
  perform public.require_agency_authoring_scope(p_agency_workspace_id,p_workspace_id,p_user_id,p_verified_email);
  if p_lineage->'source'->>'businessId' is distinct from p_agency_workspace_id::text or p_lineage->'version' is distinct from jsonb_build_object('businessId',p_workspace_id,'systemId',p_system_id) then raise exception 'business_record_access_denied'; end if;
  digest:=public.version_json_sha(jsonb_build_object('source',p_lineage->'source','baseline',p_lineage->'baseline','context',p_lineage->'context','systemId',p_system_id));
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':'||p_command_id::text,20261010));
  select * into command from public.system_version_attachment_commands where business_workspace_id=p_workspace_id and command_id=p_command_id;
  if found then
    if command.command_digest<>digest or command.actor_id<>p_user_id then raise exception 'system_command_conflict'; end if;
    select * into version from public.system_versions where id=command.version_id;
    return public.system_version_json(version,'full',p_user_id,p_verified_email);
  end if;
  runtime:=public.read_version_existing_runtime(p_workspace_id,p_user_id,p_verified_email,p_system_id);
  select * into source from public.system_version_source_revisions where source_system_id=(p_lineage->'source'->>'systemId')::uuid and number=(p_lineage->'baseline'->>'revision')::integer;
  if not found or source.definition is distinct from p_lineage->'baseline'->'definition' or source.definition->>'kind' is distinct from runtime->'definition'->>'kind' then raise exception 'system_version_runtime_unsupported'; end if;
  perform public.put_system_version_source(p_agency_workspace_id,p_user_id,p_verified_email,source.source_system_id,
    array(select distinct target from (select grantee_workspace_id target from public.system_version_source_shares where source_system_id=source.source_system_id and revoked_at is null union all select p_workspace_id) shares));
  result:=public.create_system_version(p_user_id,p_verified_email,p_lineage);
  -- Explicit attachment preserves the client runtime as its local draft;
  -- neither its content nor the donor's baseline is silently published.
  if source.definition is distinct from runtime->'definition' then
    insert into public.system_version_overrides(version_id,position,path,value,set_by,set_at) values((result->>'id')::uuid,0,'*',runtime->'definition',p_user_id,clock_timestamp());
  end if;
  insert into public.system_version_attachment_commands values(p_workspace_id,p_command_id,digest,p_user_id,(result->>'id')::uuid);
  select * into version from public.system_versions where id=(result->>'id')::uuid;
  return public.system_version_json(version,'full',p_user_id,p_verified_email);
end $$;

create function public.read_version_attachment_choices(p_agency_workspace_id uuid,p_workspace_id uuid,p_user_id uuid,p_verified_email text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare system public.systems; runtime jsonb; choices jsonb:='[]';
begin
  perform public.require_agency_authoring_scope(p_agency_workspace_id,p_workspace_id,p_user_id,p_verified_email);
  for system in select s.* from public.systems s where s.business_workspace_id=p_workspace_id
    and not exists(select 1 from public.system_versions v where v.version_system_id=s.id)
    and not exists(select 1 from public.system_version_sources source where source.system_id=s.id) order by s.name,s.id loop
    begin
      runtime:=public.read_version_existing_runtime(p_workspace_id,p_user_id,p_verified_email,system.id);
      choices:=choices||jsonb_build_array(jsonb_build_object('systemId',system.id,'name',system.name,'kind',runtime->'definition'->>'kind'));
    exception when raise_exception then if SQLERRM<>'system_version_runtime_unsupported' then raise; end if; end;
  end loop;
  return jsonb_build_object('workspaceId',p_workspace_id,'systems',choices);
end $$;
revoke all on function public.read_version_existing_runtime(uuid,uuid,text,uuid),public.attach_version_existing_system(uuid,uuid,uuid,text,uuid,uuid,jsonb),public.read_version_attachment_choices(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.read_version_existing_runtime(uuid,uuid,text,uuid),public.attach_version_existing_system(uuid,uuid,uuid,text,uuid,uuid,jsonb),public.read_version_attachment_choices(uuid,uuid,uuid,text) to service_role;
commit;
