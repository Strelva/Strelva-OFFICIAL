-- Existing native offerings become durable source/revision/Version identities.
-- Registration is an explicit local/rollout preparation; no agency stand-in or reviewer seed.
begin;
set local lock_timeout='2s';
create table public.offering_package_sources(definition_id text not null,definition_version text not null,source_revision_id uuid not null unique references public.system_version_source_revisions(id),primary key(definition_id,definition_version));
alter table public.offering_package_sources enable row level security;
revoke all on public.offering_package_sources from public,anon,authenticated,service_role;
grant select on public.offering_package_sources to service_role;
alter table public.offering_installations add column source_revision_id uuid references public.system_version_source_revisions(id),add column version_lineage_id uuid unique references public.system_versions(id),add column creator_workspace_id uuid references public.workspaces(id);
create function public.offering_package_definition(p_id text,p_version text) returns jsonb language sql immutable set search_path=public,pg_temp as $$
 select case when p_version='1.0.0' then '{"private_staff_requests":{"kind":"offering","offeringId":"private_staff_requests","offeringVersion":"1.0.0","name":"Staff request application","description":"Give staff a private request form and review submissions in one place.","requiredResources":[{"kind":"application","minimum":1,"maximum":1,"description":"An app owned by this business. Existing apps must already be published."}],"scopes":[{"id":"submit_requests","label":"Submit requests","description":"Use the released form to add request records.","required":true},{"id":"review_requests","label":"Review requests","description":"Review the application''s records through its existing access rules.","required":true}],"surfaces":[{"id":"staff_app","label":"Staff application","description":"The released application used by permitted staff.","href":null,"required":true},{"id":"business_workspace","label":"Business workspace","description":"The existing workspace where owners manage the application.","href":null,"required":true}],"configurationFields":[{"id":"displayName","label":"Offering label (display only)","kind":"short_text","required":false,"maximumLength":80},{"id":"instructions","label":"Operator note (display only)","kind":"long_text","required":false,"maximumLength":500}]},"customer_inquiry_intake":{"kind":"offering","offeringId":"customer_inquiry_intake","offeringVersion":"1.0.0","name":"Customer inquiry intake","description":"Review customer inquiries and decide what happens next.","requiredResources":[{"kind":"inquiry_workspace","minimum":1,"maximum":1,"description":"An inquiry workspace verified through its tenant authority."}],"scopes":[{"id":"handle_inquiries","label":"Handle inquiries","description":"Use the governed inquiry handling path.","required":true}],"surfaces":[{"id":"inquiry_workspace","label":"Inquiry workspace","description":"The existing inquiry handling surface.","href":null,"required":true}],"configurationFields":[]},"managed_website_changes":{"kind":"offering","offeringId":"managed_website_changes","offeringVersion":"1.0.0","name":"Managed website changes","description":"Request changes to a website Strelva already manages.","requiredResources":[{"kind":"managed_website","minimum":1,"maximum":1,"description":"An active website binding verified against workspace and tenant ownership."}],"scopes":[{"id":"request_changes","label":"Request changes","description":"Prepare changes for the website''s existing governance path.","required":true}],"surfaces":[{"id":"managed_website","label":"Managed website","description":"The website''s existing authenticated management surface.","href":null,"required":true}],"configurationFields":[]}}'::jsonb->p_id else null end;
$$;
create function public.offering_package_behavior(p_definition jsonb) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare expected jsonb; id text; resource text;
begin
 id:=p_definition->>'offeringId'; expected:=public.offering_package_definition(id,p_definition->>'offeringVersion');
 if expected is null or expected<>p_definition then raise exception 'system_package_runtime_unsupported'; end if;
 resource:=expected->'requiredResources'->0->>'kind';
 if id='private_staff_requests' then
  return public.system_package_behavior_native_core('{"kind":"internal_app","title":"Native staff resource","fields":[{"id":"contact","label":"Contact","type":"contact","required":false},{"id":"person","label":"Person","type":"assigned_person","required":false}],"components":[{"kind":"form","fields":["contact","person"]}]}'::jsonb,array[resource]);
 end if;
 return jsonb_build_object('recordsRead',case when id='private_staff_requests' then jsonb_build_array('application.records') when id='customer_inquiry_intake' then jsonb_build_array('inquiries') else jsonb_build_array('website.content','website.requests') end,
 'recordsWritten',case when id='private_staff_requests' then jsonb_build_array('application.records') when id='customer_inquiry_intake' then jsonb_build_array('inquiries','inquiry.actions') else jsonb_build_array('website.requests') end,
 'businessRecordFields',case when id='private_staff_requests' then jsonb_build_array('contacts.id','contacts.name','people.id','people.name') else '[]'::jsonb end,
 'outsideEffects',case when id='customer_inquiry_intake' then jsonb_build_array('email') when id='managed_website_changes' then jsonb_build_array('publish') else '[]'::jsonb end,
 'bindingKinds',jsonb_build_array(resource),'dataLeavingBusiness',case when id='customer_inquiry_intake' then jsonb_build_array('approved email recipients') when id='managed_website_changes' then jsonb_build_array('approved public website content') else '[]'::jsonb end);
end $$;
alter function public.system_package_behavior(jsonb,text[]) rename to system_package_behavior_native_core;
revoke all on function public.system_package_behavior_native_core(jsonb,text[]) from public,anon,authenticated,service_role;
create function public.system_package_behavior(p_definition jsonb,p_bindings text[]) returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
begin
 if p_definition->>'kind'='offering' then return public.offering_package_behavior(p_definition); end if;
 return public.system_package_behavior_native_core(p_definition,p_bindings);
end $$;
alter function public.system_package_rehearsal(jsonb) rename to system_package_rehearsal_native_core;
-- Recursive bundles dispatch to native offering validators that acquire locks.
alter function public.system_package_rehearsal_native_core(jsonb) volatile;
revoke all on function public.system_package_rehearsal_native_core(jsonb) from public,anon,authenticated,service_role;
create function public.system_package_rehearsal(p_definition jsonb) returns jsonb language plpgsql volatile set search_path=public,pg_temp as $$
declare behavior jsonb; rejected boolean:=false; scopes text[]; surfaces text[]; id text; empty_business uuid:=gen_random_uuid(); responsibility jsonb:='{"kind":"customer_operated","providerName":"Synthetic business"}';
begin
 if p_definition->>'kind'='offering' then
  behavior:=public.offering_package_behavior(p_definition); id:=p_definition->>'offeringId';
  -- Exercise the existing native validator; provider calls are never made by these commands.
  perform public.offering_assert_metadata('{}',responsibility,array['submit_requests','review_requests'],array['staff_app','business_workspace']);
  begin perform public.offering_assert_metadata('{"unexpected":"Rejected"}',responsibility,array['submit_requests','review_requests'],array['staff_app','business_workspace']);
  exception when others then if sqlerrm='offering_configuration_invalid' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'system_package_rehearsal_failed'; end if;
  rejected:=false;
  begin perform public.offering_assert_metadata('{}',responsibility,array['submit_requests'],array['staff_app','business_workspace']);
  exception when others then if sqlerrm='offering_scope_invalid' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'system_package_rehearsal_failed'; end if;
  scopes:=array(select item->>'id' from jsonb_array_elements(p_definition->'scopes') item); surfaces:=array(select item->>'id' from jsonb_array_elements(p_definition->'surfaces') item);
  rejected:=false;
  begin perform public.offering_assert_install_payload(id,p_definition->>'offeringVersion',empty_business,'{}',jsonb_build_array(jsonb_build_object('kind',behavior->'bindingKinds'->>0,'id',gen_random_uuid())),responsibility,scopes,surfaces);
  exception when others then if sqlerrm='offering_native_resource_outside_business' then rejected:=true; else raise; end if; end;
  if not rejected then raise exception 'system_package_rehearsal_failed'; end if;
  return jsonb_build_object('adapter','native_offering_command_validators','definitionId',id,'definitionVersion',p_definition->>'offeringVersion','checks',jsonb_build_array('native metadata accepts synthetic customer responsibility','native configuration rejects unknown fields','native scope rejects missing acceptance','native installer rejects unowned resource'),'scope','offering wrapper commands; underlying app/inquiry/site release remains a separate native approval','isolated',true,'providerEffects',false);
 end if;
 return public.system_package_rehearsal_native_core(p_definition);
end $$;
create function public.register_offering_package_source(p_operator_email text,p_definition_id text,p_definition_version text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare operator_id uuid; agency uuid; definition jsonb; source jsonb; revision jsonb; existing public.offering_package_sources; command uuid;
begin
 operator_id:=public.tenant_conversion_assert_operator(p_operator_email);
 agency:=public.read_platform_workspace('strelva_agency');
 if agency is null then raise exception 'platform_workspace_required'; end if;
 perform public.system_version_assert_source_manager(agency,operator_id,p_operator_email);
 definition:=public.offering_package_definition(p_definition_id,p_definition_version);
 if definition is null then raise exception 'system_package_runtime_unsupported'; end if;
 select * into existing from public.offering_package_sources where definition_id=p_definition_id and definition_version=p_definition_version;
 if found then return public.system_version_revision_json((select r from public.system_version_source_revisions r where r.id=existing.source_revision_id),agency); end if;
 command:=public.system_origin_id(agency,'offering_source',p_definition_id||':'||p_definition_version);
 source:=public.create_system_version_source(agency,operator_id,p_operator_email,jsonb_build_object('name',definition->>'name','kind','offering','hidden',true),command,encode(sha256(convert_to(definition::text,'UTF8')),'hex'));
 revision:=public.publish_system_version_source_revision(operator_id,p_operator_email,jsonb_build_object('source',jsonb_build_object('businessId',agency,'systemId',source->'source'->'source'->>'systemId','revisionId',gen_random_uuid(),'number',1),'definition',definition,'declaration',public.offering_package_behavior(definition),'requires',jsonb_build_object('bindingKinds',public.offering_package_behavior(definition)->'bindingKinds'),'summary','Existing native offering; local resources and accepted responsibilities stay with each business','label',p_definition_version,'publishedBy',operator_id,'publishedAt',clock_timestamp()));
 insert into public.offering_package_sources(definition_id,definition_version,source_revision_id) values(p_definition_id,p_definition_version,(revision->'source'->>'revisionId')::uuid);
 perform public.record_system_revision_qualification(operator_id,p_operator_email,(revision->'source'->>'revisionId')::uuid);
 return revision;
end $$;
-- A lineage System represents the installed package; native resources remain separate local bindings.
create function public.link_offering_installation_version(i public.offering_installations,p_migrating boolean) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare registry public.offering_package_sources; r public.system_version_source_revisions; src public.system_version_sources; system_id uuid; version_id uuid; binding jsonb; definition jsonb;
begin
 if i.version_lineage_id is not null then return i.version_lineage_id; end if;
 select * into registry from public.offering_package_sources where definition_id=i.definition_id and definition_version=i.definition_version;
 if not found then raise exception 'offering_source_registration_required'; end if;
 select * into r from public.system_version_source_revisions where id=registry.source_revision_id;
 select * into src from public.system_version_sources ss where ss.system_id=r.source_system_id;
 if not p_migrating and not public.lock_system_revision_qualification(r.id) then raise exception 'system_revision_not_qualified'; end if;
 system_id:=public.system_origin_id(i.business_workspace_id,'offering_version',i.id::text); version_id:=gen_random_uuid();
 insert into public.systems(id,business_workspace_id,name,purpose,kind,command_id,command_digest,created_by,updated_by)
 values(system_id,i.business_workspace_id,r.definition->>'name','Installed native package','offering',i.id,encode(sha256(convert_to(i.command_digest,'UTF8')),'hex'),i.installed_by,i.updated_by);
 insert into public.system_versions(id,version_system_id,business_workspace_id,source_system_id,source_workspace_id,context_kind,context_label,baseline_revision_id,baseline_revision,baseline_definition,created_by,created_at,updated_at)
 values(version_id,system_id,i.business_workspace_id,src.system_id,src.business_workspace_id,'agency_client',r.definition->>'name',r.id,r.number,r.definition,i.installed_by,i.installed_at,i.updated_at);
 insert into public.system_version_source_shares(source_system_id,grantee_workspace_id,shared_by,shared_at) values(src.system_id,i.business_workspace_id,r.published_by,i.installed_at) on conflict do nothing;
 insert into public.system_version_overrides(version_id,position,path,value,set_by,set_at) values(version_id,0,'configuration',i.configuration,i.updated_by,i.updated_at);
 for binding in select value from jsonb_array_elements(i.native_resources) loop
  insert into public.system_version_bindings(version_id,kind,connection_ref,owner_workspace_id,bound_by,bound_at) values(version_id,binding->>'kind',(binding->>'kind')||':'||(binding->>'id'),i.business_workspace_id,i.installed_by,i.installed_at);
 end loop;
 return version_id;
end $$;
create function public.offering_installation_source_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.system_version_source_revisions; registry public.offering_package_sources;
begin
 if tg_op='UPDATE' then
  if current_setting('strelva.offering_lineage_adoption',true)=old.id::text and old.version_lineage_id is null and old.source_revision_id is null and old.creator_workspace_id is null and new.version_lineage_id is not null then return new; end if;
  if (new.source_revision_id,new.version_lineage_id,new.creator_workspace_id) is distinct from (old.source_revision_id,old.version_lineage_id,old.creator_workspace_id) then raise exception 'offering_installation_identity_immutable'; end if;
  return new;
 end if;
 select * into registry from public.offering_package_sources where definition_id=new.definition_id and definition_version=new.definition_version;
 if not found then
  -- Existing fixed native offerings keep operating until the explicit source rollout is registered.
  -- No creator identity may be asserted, and money accrual remains ineligible without lineage.
  if new.source_revision_id is not null or new.version_lineage_id is not null or new.creator_workspace_id is not null then raise exception 'offering_installation_identity_immutable'; end if;
  return new;
 end if;
 select * into r from public.system_version_source_revisions where id=registry.source_revision_id;
 if not public.lock_system_revision_qualification(r.id) then raise exception 'system_revision_not_qualified'; end if;
 new.source_revision_id:=r.id;new.creator_workspace_id:=r.creator_workspace_id;
 new.version_lineage_id:=public.link_offering_installation_version(new,false);
 return new;
end $$;
create trigger offering_installation_source_guard before insert or update on public.offering_installations for each row execute function public.offering_installation_source_guard();
create function public.sync_offering_installation_version() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.system_versions; definition jsonb; release integer; released jsonb; system public.systems; revision public.system_revisions;
begin
 if new.version_lineage_id is null then return new; end if;
 select * into v from public.system_versions where id=new.version_lineage_id for update;
 if tg_op='UPDATE' then
  update public.system_version_overrides set value=new.configuration,set_by=new.updated_by,set_at=new.updated_at where version_id=v.id and path='configuration';
 end if;
 if new.status='active' and (tg_op='INSERT' or old.status<>'active' or old.configuration<>new.configuration or v.current_release is null) then
  if coalesce(current_setting('strelva.offering_lineage_adoption',true),'')<>new.id::text and not public.lock_system_revision_qualification(new.source_revision_id) then raise exception 'system_revision_not_qualified'; end if;
  -- The existing activate/update RPC has already checked the destination's native resource and accepted scope.
  release:=coalesce((select max(number) from public.system_version_releases where version_id=v.id),0)+1;
  definition:=v.baseline_definition||jsonb_build_object('configuration',new.configuration);
  select * into system from public.systems where id=v.version_system_id for update;
  insert into public.system_revisions(system_id,business_workspace_id,number,implementation,summary,command_id,command_digest,created_by)
   values(system.id,system.business_workspace_id,release,jsonb_build_object('kind','system_version','ref',v.id::text||':release:'||release::text,'contentHash',encode(sha256(convert_to(definition::text,'UTF8')),'hex')),'Native offering activated under its existing resource checks',gen_random_uuid(),encode(sha256(convert_to(definition::text,'UTF8')),'hex'),new.updated_by) returning * into revision;
  insert into public.system_version_releases(version_id,number,definition,baseline_revision,override_paths,system_revision_id,released_by,released_at) values(v.id,release,definition,v.baseline_revision,array['configuration'],revision.id,new.updated_by,new.updated_at);
  update public.system_versions set current_release=release,row_revision=row_revision+1,updated_at=new.updated_at where id=v.id;
  update public.systems set current_revision_id=revision.id,current_revision_number=revision.number,change_number=change_number+1,lifecycle='live',updated_by=new.updated_by,updated_at=new.updated_at where id=system.id;
 elsif new.status='retired' then
  update public.system_versions set row_revision=row_revision+1,updated_at=new.updated_at where id=v.id;
  update public.systems set lifecycle=case when current_revision_id is null then 'draft' else 'paused' end,change_number=change_number+1,updated_by=new.updated_by,updated_at=new.updated_at where id=v.version_system_id;
 elsif tg_op='UPDATE' then
  update public.system_versions set row_revision=row_revision+1,updated_at=new.updated_at where id=v.id;
 end if;
 return new;
end $$;
create trigger sync_offering_installation_version after insert or update on public.offering_installations for each row execute function public.sync_offering_installation_version();
-- The privileged adoption changes only newly added metadata and preserves native concurrency.
alter function public.guard_offering_installation_change() rename to guard_offering_installation_change_native_core;
create function public.guard_offering_installation_change() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if current_setting('strelva.offering_lineage_adoption',true)=old.id::text and old.version_lineage_id is null and old.source_revision_id is null and old.creator_workspace_id is null
  and (to_jsonb(new)-array['source_revision_id','version_lineage_id','creator_workspace_id'])=(to_jsonb(old)-array['source_revision_id','version_lineage_id','creator_workspace_id']) then return new; end if;
 if (new.id,new.business_workspace_id,new.definition_id,new.definition_version,new.native_resources,new.responsibility,new.accepted_scope,new.surface_ids,new.idempotency_key,new.command_digest,new.installed_by,new.installed_at) is distinct from (old.id,old.business_workspace_id,old.definition_id,old.definition_version,old.native_resources,old.responsibility,old.accepted_scope,old.surface_ids,old.idempotency_key,old.command_digest,old.installed_by,old.installed_at) then raise exception 'offering_installation_identity_immutable'; end if;
 if old.status='retired' then raise exception 'offering_installation_retired'; end if;
 if new.revision<>old.revision+1 then raise exception 'offering_revision_invalid'; end if;
 if new.status not in ('draft','active','retired') or (old.status='active' and new.status='draft') then raise exception 'offering_status_invalid'; end if;
 return new;
end $$;
drop trigger offering_installation_change_trg on public.offering_installations;
create trigger offering_installation_change_trg before update on public.offering_installations for each row execute function public.guard_offering_installation_change();
create function public.migrate_offering_installation_versions(p_operator_email text) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; i public.offering_installations; v uuid; r public.system_version_source_revisions; count integer:=0;
begin
 actor:=public.tenant_conversion_assert_operator(p_operator_email);
 -- Migration changes lineage only; accepted responsibility, records and current native releases stay intact.
 for i in select * from public.offering_installations where version_lineage_id is null for update loop
  v:=public.link_offering_installation_version(i,true);
  select * into r from public.system_version_source_revisions where id=(select source_revision_id from public.offering_package_sources where definition_id=i.definition_id and definition_version=i.definition_version);
  -- Bounded metadata adoption uses a transaction-local capability, never disables a table trigger.
  perform set_config('strelva.offering_lineage_adoption',i.id::text,true);
  update public.offering_installations set version_lineage_id=v,source_revision_id=r.id,creator_workspace_id=r.creator_workspace_id where id=i.id;
  perform set_config('strelva.offering_lineage_adoption','',true);
  count:=count+1;
 end loop;
 return count;
end $$;
revoke all on function public.offering_package_definition(text,text),public.offering_package_behavior(jsonb),public.system_package_behavior(jsonb,text[]),public.system_package_rehearsal(jsonb),public.link_offering_installation_version(public.offering_installations,boolean),public.offering_installation_source_guard(),public.sync_offering_installation_version() from public,anon,authenticated,service_role;
revoke all on function public.register_offering_package_source(text,text,text),public.migrate_offering_installation_versions(text) from public,anon,authenticated;
grant execute on function public.register_offering_package_source(text,text,text),public.migrate_offering_installation_versions(text) to service_role;
commit;
