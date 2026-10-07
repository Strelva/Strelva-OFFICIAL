-- Offering metadata uses its existing installed resource and owner decision.
-- A publication is an actual persisted configuration, never a provider job or
-- an application's design release. Package keeps local labels/notes local.
begin;
set local lock_timeout='2s';
create table public.system_version_offering_installations (
 version_id uuid primary key references public.system_versions(id),
 business_workspace_id uuid not null references public.workspaces(id),
 installation_id uuid not null unique references public.offering_installations(id),
 synced_configuration_revision bigint not null
);
alter table public.system_version_offering_installations enable row level security;
revoke all on public.system_version_offering_installations from public,anon,authenticated,service_role;
create table public.system_version_offering_publications (
 id uuid primary key default gen_random_uuid(),
 version_id uuid not null references public.system_versions(id),
 business_workspace_id uuid not null references public.workspaces(id),
 installation_id uuid not null references public.offering_installations(id),
 installation_revision bigint not null, row_revision bigint not null,
 definition jsonb not null, owner_decision_id uuid not null references public.owner_decisions(id),
 system_revision_id uuid references public.system_revisions(id),
 published_by uuid not null references public.users(id), published_at timestamptz not null default clock_timestamp(),
 unique(version_id,row_revision), unique(installation_id,installation_revision)
);
alter table public.system_version_offering_publications enable row level security;
revoke all on public.system_version_offering_publications from public,anon,authenticated,service_role;

create function public.read_offering_package_for_work(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_work_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare matched public.offering_installations; total integer;
begin
 perform public.offering_assert_actor(p_workspace_id,p_user_id,p_verified_email,true);
 if not exists(select 1 from public.saved_product_work w where w.id=p_work_id and w.workspace_id=p_workspace_id
   and w.product_id='applications' and w.resource_kind='application') then raise exception 'business_record_access_denied'; end if;
 select count(*) into total from public.offering_installations i where i.business_workspace_id=p_workspace_id and i.status in ('draft','active')
   and i.native_resources=jsonb_build_array(jsonb_build_object('kind','application','id',p_work_id));
 if total=0 then return null; end if;
 if total<>1 then raise exception 'system_version_runtime_unsupported'; end if;
 select * into matched from public.offering_installations i where i.business_workspace_id=p_workspace_id and i.status in ('draft','active')
   and i.native_resources=jsonb_build_array(jsonb_build_object('kind','application','id',p_work_id));
 return jsonb_build_object('installationId',matched.id,'revision',matched.revision,'definitionId',matched.definition_id,
   'definitionVersion',matched.definition_version,'configuration',matched.configuration);
end $$;

-- The same existing System must point at the installation's actual resource.
create function public.version_offering_resource_matches(p_system public.systems,p_installation public.offering_installations)
returns boolean language plpgsql stable set search_path=public,pg_temp as $$
begin
 if p_system.business_workspace_id is distinct from p_installation.business_workspace_id then return false; end if;
 if p_installation.definition_id='private_staff_requests' then
  return p_system.origin_kind='saved_work' and p_installation.native_resources=jsonb_build_array(jsonb_build_object('kind','application','id',p_system.origin_ref));
 elsif p_installation.definition_id='customer_inquiry_intake' then
  return p_system.origin_kind='inquiry_workspace' and p_installation.native_resources=jsonb_build_array(jsonb_build_object('kind','inquiry_workspace','id',p_system.origin_ref));
 elsif p_installation.definition_id='managed_website_changes' then
  return p_system.origin_kind='tenant' and exists(select 1 from public.offering_website_bindings b
    where b.business_workspace_id=p_system.business_workspace_id and b.tenant_stable_id::text=p_system.origin_ref and b.status='active'
      and p_installation.native_resources=jsonb_build_array(jsonb_build_object('kind','managed_website','id',b.id)));
 end if;
 return false;
end $$;
create function public.version_offering_definition(p_installation public.offering_installations,p_definition jsonb)
returns void language plpgsql stable set search_path=public,pg_temp as $$
begin
 if p_definition->>'kind' is distinct from 'offering' or p_definition->>'definitionId' is distinct from p_installation.definition_id
  or p_definition->>'definitionVersion' is distinct from p_installation.definition_version
  or (p_definition-array['kind','definitionId','definitionVersion','configuration'])<>'{}'::jsonb
  or jsonb_typeof(p_definition->'configuration') is distinct from 'object' then raise exception 'system_version_input_invalid'; end if;
 perform public.offering_assert_install_payload(p_installation.definition_id,p_installation.definition_version,p_installation.business_workspace_id,
  p_definition->'configuration',p_installation.native_resources,p_installation.responsibility,p_installation.accepted_scope,p_installation.surface_ids);
end $$;
create function public.bind_version_offering_runtime(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_version_id uuid,p_installation_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare lineage public.system_versions; installation public.offering_installations; native_system public.systems; scope record;
begin
 perform public.offering_assert_actor(p_workspace_id,p_user_id,p_verified_email,true);
 select * into lineage from public.system_versions where id=p_version_id and business_workspace_id=p_workspace_id for update;
 if not found then raise exception 'system_not_found'; end if;
 scope:=public.system_version_access(lineage,p_user_id,p_verified_email,true);
 if scope.access is distinct from 'full' then raise exception 'business_record_access_denied'; end if;
 select * into installation from public.offering_installations where id=p_installation_id and business_workspace_id=p_workspace_id for share;
 select * into native_system from public.systems where id=lineage.version_system_id and business_workspace_id=p_workspace_id for share;
 if installation.id is null or installation.status<>'active' or not public.version_offering_resource_matches(native_system,installation)
  then raise exception 'system_version_runtime_unsupported'; end if;
 perform public.version_offering_definition(installation,public.version_working_definition(lineage.id));
 if exists(select 1 from public.system_version_releases where version_id=lineage.id)
  or exists(select 1 from public.system_version_native_applications where version_id=lineage.id) then raise exception 'system_version_runtime_unsupported'; end if;
 insert into public.system_version_offering_installations(version_id,business_workspace_id,installation_id,synced_configuration_revision)
  values(lineage.id,p_workspace_id,installation.id,installation.revision)
  on conflict(version_id) do nothing;
 if not exists(select 1 from public.system_version_offering_installations where version_id=lineage.id and installation_id=installation.id
   and business_workspace_id=p_workspace_id and synced_configuration_revision=installation.revision) then raise exception 'system_version_stale'; end if;
 return public.system_version_json(lineage,'full',p_user_id,p_verified_email);
end $$;

alter function public.read_version_native_runtime(uuid,uuid,text,uuid) rename to read_version_native_runtime_before_offering;
revoke all on function public.read_version_native_runtime_before_offering(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
create function public.read_version_native_runtime(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare lineage public.system_versions; binding public.system_version_offering_installations; installation public.offering_installations; native_system public.systems; scope record;
begin
 select * into binding from public.system_version_offering_installations where version_id=p_version_id;
 if not found then return public.read_version_native_runtime_before_offering(p_workspace_id,p_user_id,p_verified_email,p_version_id); end if;
 perform public.offering_assert_actor(p_workspace_id,p_user_id,p_verified_email,true);
 select * into lineage from public.system_versions where id=p_version_id and business_workspace_id=p_workspace_id;
 if not found then raise exception 'system_not_found'; end if;
 scope:=public.system_version_access(lineage,p_user_id,p_verified_email,false);
 if scope.access is distinct from 'full' then raise exception 'business_record_access_denied'; end if;
 select * into installation from public.offering_installations where id=binding.installation_id and business_workspace_id=p_workspace_id;
 select * into native_system from public.systems where id=lineage.version_system_id and business_workspace_id=p_workspace_id;
 if installation.id is null or installation.status<>'active' or not public.version_offering_resource_matches(native_system,installation)
  then raise exception 'system_version_runtime_unsupported'; end if;
 if installation.revision<>binding.synced_configuration_revision then raise exception 'system_version_stale'; end if;
 perform public.version_offering_definition(installation,public.version_working_definition(lineage.id));
 return jsonb_build_object('kind','offering','installationId',installation.id,'configurationRevision',installation.revision,'releaseNumber',lineage.current_release);
end $$;

alter function public.save_system_version(uuid,text,uuid,bigint,jsonb) rename to save_system_version_before_offering;
revoke all on function public.save_system_version_before_offering(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
create function public.save_system_version(p_user_id uuid,p_verified_email text,p_version_id uuid,p_expected_row_revision bigint,p_lineage jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare lineage public.system_versions; binding public.system_version_offering_installations; installation public.offering_installations;
 native_system public.systems; approval public.owner_decisions; publication public.system_version_offering_publications;
 scope record; stored jsonb; definition jsonb; spine jsonb; release_count integer; release_number integer;
begin
 select * into binding from public.system_version_offering_installations where version_id=p_version_id for update;
 if not found then return public.save_system_version_before_offering(p_user_id,p_verified_email,p_version_id,p_expected_row_revision,p_lineage); end if;
 select * into lineage from public.system_versions where id=p_version_id for update;
 if not found then raise exception 'system_not_found'; end if;
 scope:=public.system_version_access(lineage,p_user_id,p_verified_email,true);
 if scope.access is distinct from 'full' then raise exception 'business_record_access_denied'; end if;
 perform public.offering_assert_actor(lineage.business_workspace_id,p_user_id,p_verified_email,true);
 if lineage.row_revision<>p_expected_row_revision then raise exception 'system_version_stale'; end if;
 select count(*) into release_count from public.system_version_releases where version_id=lineage.id;
 if jsonb_array_length(p_lineage->'releases')=release_count then
  -- Draft edits retain the existing core's authority, identity and history rules.
  return public.save_system_version_before_offering(p_user_id,p_verified_email,p_version_id,p_expected_row_revision,p_lineage);
 end if;
 if jsonb_array_length(p_lineage->'releases') is distinct from release_count+1
  or (p_lineage->>'currentRelease')::integer is distinct from release_count+1 then raise exception 'system_version_input_invalid'; end if;
 stored:=public.system_version_json(lineage,'full',p_user_id,p_verified_email);
 if (stored-array['releases','currentRelease','rowRevision','updatedAt']) is distinct from
  (p_lineage-array['releases','currentRelease','rowRevision','updatedAt']) then raise exception 'system_version_stale'; end if;
 definition:=public.version_working_definition(lineage.id);
 if p_lineage->'releases'->-1->'definition' is distinct from definition
  or (p_lineage->'releases'->-1->>'number')::integer is distinct from release_count+1
  or (p_lineage->'releases'->-1->>'baselineRevision')::integer is distinct from lineage.baseline_revision
  or p_lineage->'releases'->-1->>'releasedBy' is distinct from p_user_id::text then raise exception 'system_version_input_invalid'; end if;
 select * into installation from public.offering_installations where id=binding.installation_id and business_workspace_id=lineage.business_workspace_id for update;
 select * into native_system from public.systems where id=lineage.version_system_id and business_workspace_id=lineage.business_workspace_id for update;
 if installation.id is null or installation.status<>'active' or not public.version_offering_resource_matches(native_system,installation)
  then raise exception 'system_version_runtime_unsupported'; end if;
 if installation.revision<>binding.synced_configuration_revision then raise exception 'system_version_stale'; end if;
 perform public.version_offering_definition(installation,definition);
 select d.* into approval from public.owner_decisions d join public.system_version_preparations p on p.owner_decision_id=d.id
  where p.business_workspace_id=lineage.business_workspace_id and p.version_id=lineage.id and p.row_revision=p_expected_row_revision
   and p.source_revision=lineage.baseline_revision and d.workspace_id=lineage.business_workspace_id and d.system_id=lineage.version_system_id
   and d.source_lifecycle='version_release' and d.source_id=lineage.id::text and d.state='approved' and d.change_kind='system.change_live'
   and not d.admin_may_decide and d.outcome is distinct from 'failed'
   and ((d.route='owner_decides' and d.decided_by_kind in ('owner_link','owner_session')) or (d.route='strelva_reviews' and d.decided_by_kind='operator'))
   and d.revision_hash=encode(sha256(convert_to('["version_release","'||lineage.id::text||'",'||p_expected_row_revision::text||']','UTF8')),'hex') for update of d;
 if not found then raise exception 'system_version_release_approval_required'; end if;
 -- Existing native mutation checks its own revision/resources. Read its actual
 -- returned row, then one immutable receipt and one current System revision.
 select * into installation from public.update_offering_configuration(lineage.business_workspace_id,installation.id,p_user_id,p_verified_email,
  binding.synced_configuration_revision,definition->'configuration');
 if installation.configuration is distinct from definition->'configuration' then raise exception 'system_version_stale'; end if;
 insert into public.system_version_offering_publications(version_id,business_workspace_id,installation_id,installation_revision,row_revision,
  definition,owner_decision_id,published_by) values(lineage.id,lineage.business_workspace_id,installation.id,installation.revision,p_expected_row_revision,
  definition,approval.id,p_user_id) returning * into publication;
 spine:=public.record_system_revision(lineage.business_workspace_id,p_user_id,p_verified_email,lineage.version_system_id,native_system.change_number,
  jsonb_build_object('implementation',jsonb_build_object('kind','offering_configuration','ref',publication.id,'contentHash',public.version_json_sha(definition)),
   'summary','Offering configuration recorded'),public.system_version_uuid('offering-publication:'||lineage.id::text||':'||p_expected_row_revision::text),
   public.version_json_sha(definition),true);
 update public.system_version_offering_publications set system_revision_id=(spine->'revision'->>'id')::uuid where id=publication.id;
 release_number:=public.record_version_publication(lineage.id,p_expected_row_revision,lineage.baseline_revision_id,definition,(spine->'revision'->>'id')::uuid,p_user_id);
 update public.system_version_offering_installations set synced_configuration_revision=installation.revision where version_id=lineage.id;
 select * into lineage from public.system_versions where id=lineage.id;
 return public.system_version_json(lineage,'full',p_user_id,p_verified_email);
end $$;
revoke all on function public.version_offering_resource_matches(public.systems,public.offering_installations),public.version_offering_definition(public.offering_installations,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.read_offering_package_for_work(uuid,uuid,text,uuid),public.bind_version_offering_runtime(uuid,uuid,text,uuid,uuid),
 public.read_version_native_runtime(uuid,uuid,text,uuid),public.save_system_version(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.read_offering_package_for_work(uuid,uuid,text,uuid),public.bind_version_offering_runtime(uuid,uuid,text,uuid,uuid),
 public.read_version_native_runtime(uuid,uuid,text,uuid),public.save_system_version(uuid,text,uuid,bigint,jsonb) to service_role;
commit;
