-- #332: qualified multi-System sources install native drafts atomically.
-- No approval, provider call, message or publication is performed here.
begin;
set local lock_timeout='2s';
create table public.system_bundle_installations(
 id uuid primary key default gen_random_uuid(),business_workspace_id uuid not null references public.workspaces(id),source_revision_id uuid not null references public.system_version_source_revisions(id),command_id uuid not null,command_digest text not null,created_by uuid not null references public.users(id),receipt jsonb,created_at timestamptz not null default clock_timestamp(),unique(business_workspace_id,command_id));
create table public.system_bundle_components(
 bundle_id uuid not null references public.system_bundle_installations(id),component_key text not null,version_id uuid not null unique references public.system_versions(id),work_id uuid references public.saved_product_work(id),capability_id text,request_id text,primary key(bundle_id,component_key));
create table public.system_bundle_target_scopes(grant_id uuid primary key references public.system_package_install_grants(id),targets jsonb not null,granted_by uuid not null references public.users(id),created_at timestamptz not null default clock_timestamp());
create table public.system_bundle_draft_permissions(grant_id uuid not null references public.system_package_install_grants(id),work_id uuid primary key references public.saved_product_work(id));
alter table public.system_bundle_installations enable row level security;
alter table public.system_bundle_components enable row level security;
alter table public.system_bundle_target_scopes enable row level security;
alter table public.system_bundle_draft_permissions enable row level security;
revoke all on public.system_bundle_installations,public.system_bundle_components,public.system_bundle_target_scopes,public.system_bundle_draft_permissions from public,anon,authenticated,service_role;

alter function public.system_package_behavior(jsonb,text[]) rename to system_package_behavior_bundle_core;
create function public.system_package_behavior(p_definition jsonb,p_bindings text[]) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare f jsonb; x jsonb; result jsonb; part jsonb; k text;
begin
 perform public.agency_package_assert_shareable(p_definition);
 if p_definition->>'kind'='bundle' then
  -- Core validates the closed container; explicit parentheses preserve array union.
  perform public.system_package_behavior_bundle_core(p_definition,p_bindings);
  result:=jsonb_build_object('recordsRead','[]'::jsonb,'recordsWritten','[]'::jsonb,'businessRecordFields','[]'::jsonb,'outsideEffects','[]'::jsonb,'bindingKinds',to_jsonb(p_bindings),'dataLeavingBusiness','[]'::jsonb);
  for x in select value from jsonb_array_elements(p_definition->'systems') loop
   if jsonb_typeof(x->'key') is distinct from 'string' or jsonb_typeof(x->'name') is distinct from 'string' then raise exception 'system_package_input_invalid'; end if;
   part:=public.system_package_behavior(x->'definition',p_bindings);
   for k in select jsonb_object_keys(result) loop
    result:=jsonb_set(result,array[k],(select coalesce(jsonb_agg(value order by value),'[]'::jsonb) from (select distinct value from jsonb_array_elements((result->k)||(part->k))) a));
   end loop;
  end loop;
  return result;
 end if;
 if p_definition->>'kind'='inquiry_pattern'  then
  if jsonb_typeof(p_definition->'name') is distinct from 'string' or jsonb_typeof(p_definition->'title') is distinct from 'string' or (p_definition-array['kind','name','title','intro','fields','routingWithinMinutes'])<>'{}'::jsonb or char_length(coalesce(p_definition->>'name','')) not between 1 and 200 or char_length(coalesce(p_definition->>'title','')) not between 1 and 300 or jsonb_typeof(p_definition->'intro') is distinct from 'string' or char_length(p_definition->>'intro')>5000 or jsonb_typeof(p_definition->'fields') is distinct from 'array' or jsonb_array_length(p_definition->'fields') not between 1 and 30 or jsonb_typeof(p_definition->'routingWithinMinutes') is distinct from 'number' or coalesce(p_definition->>'routingWithinMinutes','') !~ '^[0-9]+$' or (p_definition->>'routingWithinMinutes')::integer not between 1 and 10080 then raise exception 'system_package_input_invalid'; end if;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_definition->'fields'))<>jsonb_array_length(p_definition->'fields') then raise exception 'system_package_input_invalid'; end if;
  for f in select value from jsonb_array_elements(p_definition->'fields') loop
   if (f-array['id','label','kind','required'])<>'{}'::jsonb or coalesce(f->>'id','') !~ '^[a-z][a-z0-9_]{0,79}$' or char_length(coalesce(f->>'label','')) not between 1 and 200 or jsonb_typeof(f->'id') is distinct from 'string' or jsonb_typeof(f->'label') is distinct from 'string' or jsonb_typeof(f->'kind') is distinct from 'string' or f->>'kind' not in ('text','email','phone','date','textarea') or jsonb_typeof(f->'required') is distinct from 'boolean' then raise exception 'system_package_input_invalid'; end if;
  end loop;
  return jsonb_build_object('recordsRead',jsonb_build_array('inquiries'),'recordsWritten',jsonb_build_array('inquiries'),'businessRecordFields','[]'::jsonb,'outsideEffects',jsonb_build_array('email'),'bindingKinds',(select jsonb_agg(distinct b order by b) from unnest(p_bindings||array['email']) b),'dataLeavingBusiness',jsonb_build_array('Inquiry routing messages to this business''s chosen team'));
 elsif p_definition->>'kind'='website_section' then
  if jsonb_typeof(p_definition->'title') is distinct from 'string' or (p_definition-array['kind','title','items'])<>'{}'::jsonb or char_length(coalesce(p_definition->>'title','')) not between 1 and 500 or jsonb_typeof(p_definition->'items') is distinct from 'array' or jsonb_array_length(p_definition->'items') not between 1 and 40 then raise exception 'system_package_input_invalid'; end if;
  for x in select value from jsonb_array_elements(p_definition->'items') loop if jsonb_typeof(x->'question') is distinct from 'string' or jsonb_typeof(x->'answer') is distinct from 'string' or (x-array['question','answer'])<>'{}'::jsonb or char_length(coalesce(x->>'question','')) not between 1 and 500 or char_length(coalesce(x->>'answer','')) not between 1 and 4000 then raise exception 'system_package_input_invalid'; end if; end loop;
  return jsonb_build_object('recordsRead',jsonb_build_array('website.document'),'recordsWritten',jsonb_build_array('website.document'),'businessRecordFields','[]'::jsonb,'outsideEffects',jsonb_build_array('publish'),'bindingKinds',(select jsonb_agg(distinct b order by b) from unnest(p_bindings||array['website']) b),'dataLeavingBusiness',jsonb_build_array('Owner-approved website content published publicly'));
 end if;
 -- Core bundle recursion calls the current public function for each component.
 return public.system_package_behavior_bundle_core(p_definition,p_bindings);
end $$;
alter function public.system_package_rehearsal(jsonb) rename to system_package_rehearsal_bundle_core;
create function public.system_package_rehearsal(p_definition jsonb) returns jsonb
language plpgsql volatile set search_path=public,pg_temp as $$
begin
 if p_definition->>'kind' in ('inquiry_pattern','website_section') then
  perform public.system_package_behavior(p_definition,'{}');
  raise exception 'system_bundle_native_rehearsal_required';
 end if;
 return public.system_package_rehearsal_bundle_core(p_definition);
end $$;

create table public.system_bundle_native_rehearsals(revision_id uuid primary key references public.system_version_source_revisions(id),artifacts jsonb not null,created_by uuid not null references public.users(id),created_at timestamptz not null default clock_timestamp());
alter table public.system_bundle_native_rehearsals enable row level security;
revoke all on public.system_bundle_native_rehearsals from public,anon,authenticated,service_role;
create function public.read_system_bundle_qualification_source(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_revision_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.system_version_source_revisions;
begin
 perform public.require_system_package_revision_scope(p_workspace_id,p_revision_id,p_user_id,p_verified_email,false);
 select * into r from public.system_version_source_revisions where id=p_revision_id;
 return jsonb_build_object('revisionId',r.id,'definition',r.definition);
end $$;
create function public.record_system_bundle_qualification(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_revision_id uuid,p_artifacts jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.system_version_source_revisions; previous public.system_version_source_revisions; item jsonb; artifact jsonb; shape jsonb; draft jsonb; fields jsonb; node jsonb; evidence jsonb:='[]'; checks jsonb:='[]'; receipt jsonb; k text; passed boolean; note text;
begin
 perform public.require_system_package_revision_scope(p_workspace_id,p_revision_id,p_user_id,p_verified_email,false);
 select * into r from public.system_version_source_revisions where id=p_revision_id for share;
 perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role in ('owner','admin') for share;
 if not found or r.definition->>'kind'<>'bundle' or jsonb_typeof(p_artifacts) is distinct from 'array' or jsonb_array_length(p_artifacts)<>jsonb_array_length(r.definition->'systems') then raise exception 'system_bundle_rehearsal_invalid'; end if;
 -- Trusted server invokes the real isolated native adapters. Store their exact
 -- native artifacts, then independently bind each artifact to the source shape.
 for item in select value from jsonb_array_elements(r.definition->'systems') loop
  shape:=item->'definition'; perform public.system_package_behavior(shape,'{}');
  select value into artifact from jsonb_array_elements(p_artifacts) where value->>'key'=item->>'key';
  if artifact is null or artifact->>'kind' is distinct from shape->>'kind' then raise exception 'system_bundle_rehearsal_invalid'; end if;
  if shape->>'kind'='internal_app' then
   receipt:=public.system_package_rehearsal(shape);
   if jsonb_typeof(artifact->'checks') is distinct from 'array' or jsonb_array_length(artifact->'checks')=0 or exists(select 1 from jsonb_array_elements(artifact->'checks') c where c->'passed' is distinct from 'true'::jsonb) then raise exception 'system_bundle_rehearsal_invalid'; end if;
  elsif shape->>'kind'='inquiry_pattern' then
   draft:=artifact->'work';
   select jsonb_agg(f||jsonb_build_object('component',(f->>'kind')||'_field')) into fields from jsonb_array_elements(shape->'fields') f;
   if artifact->'state'->'inquiries' is distinct from '[]'::jsonb or jsonb_array_length(artifact->'state'->'capabilities') is distinct from 1 or jsonb_array_length(artifact->'state'->'requests') is distinct from 1 or artifact->'state'->'requests'->0 is distinct from draft or artifact->'state'->'capabilities'->0->>'status' is distinct from 'draft' or artifact->'state'->'capabilities'->0->'live' is distinct from 'null'::jsonb or draft->'publishApproval' is distinct from 'null'::jsonb or draft->>'state' is distinct from 'planned' or draft->'draft'->>'name' is distinct from shape->>'name' or draft->'draft'->'form'->>'title' is distinct from shape->>'title' or draft->'draft'->'form'->>'intro' is distinct from shape->>'intro' or draft->'draft'->'form'->'fields' is distinct from fields or draft->'draft'->'routing'->>'withinMinutes' is distinct from shape->>'routingWithinMinutes' or draft->'draft'->'connections' is distinct from '[{"id":"email","provider":"email","status":"missing","consent":"missing","lastCheckedAt":null}]'::jsonb then raise exception 'system_bundle_rehearsal_invalid'; end if;
   receipt:=jsonb_build_object('adapter','InquiryEngine.copyPattern','isolated',true,'providerEffects',false);
  elsif shape->>'kind'='website_section' then
   node:=artifact->'document'->'nodes'->(artifact->>'sectionId');
   if node->>'type' is distinct from 'Faq' or node->'props' is distinct from jsonb_build_object('title',shape->>'title','items',shape->'items') or node->'verification'->>'needsReview' is distinct from 'true' or artifact->'payload'->'candidate'->'document' is distinct from artifact->'document' or artifact->'payload'->'approvedCandidateRevision' is distinct from 'null'::jsonb or artifact->'payload'->'launch' is distinct from '{"receipt":null,"readBack":null}'::jsonb then raise exception 'system_bundle_rehearsal_invalid'; end if;
   receipt:=jsonb_build_object('adapter','native SiteDocument FAQ candidate','isolated',true,'providerEffects',false);
  else raise exception 'system_package_runtime_unsupported'; end if;
  checks:=checks||jsonb_build_array(jsonb_build_object('key',item->>'key','receipt',receipt));
 end loop;
 insert into public.system_bundle_native_rehearsals(revision_id,artifacts,created_by) values(r.id,p_artifacts,p_user_id) on conflict(revision_id) do nothing;
 -- Replays return the first immutable receipt even though synthetic IDs differ.
 select * into previous from public.system_version_source_revisions where source_system_id=r.source_system_id and number<r.number order by number desc limit 1;
 foreach k in array array['shareable_definition','declaration_match','rehearsal','prior_revision_compare'] loop
  passed:=true;note:='Passed';
  begin
   if k='shareable_definition' then perform public.agency_package_assert_shareable(r.definition);
   elsif k='declaration_match' then perform public.system_package_assert_declaration(r.definition,r.declaration,r.requires_binding_kinds);
   elsif k='rehearsal' then note:=jsonb_build_object('nativeReceiptRevision',r.id,'parts',checks,'noProviderEffects',true)::text;
   else note:=jsonb_build_object('priorRevision',previous.number,'changed',previous.definition is distinct from r.definition,'behaviorEquivalence','not inferred')::text; end if;
  exception when others then passed:=false;note:=sqlerrm; end;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('revisionId',r.id,'check',k,'status',case when passed then 'passed' else 'failed' end,'note',note));
 end loop;
 insert into public.system_revision_qualifications(revision_id,evidence) values(r.id,evidence) on conflict(revision_id) do nothing;
 return public.system_revision_qualification_json(r.id);
end $$;
revoke all on function public.read_system_bundle_qualification_source(uuid,uuid,text,uuid),public.record_system_bundle_qualification(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.read_system_bundle_qualification_source(uuid,uuid,text,uuid),public.record_system_bundle_qualification(uuid,uuid,text,uuid,jsonb) to service_role;

create function public.grant_system_bundle_targets(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_grant_id uuid,p_targets jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare g public.system_package_install_grants; stored jsonb;
begin
 if public.system_version_member_role(p_workspace_id,p_user_id,p_verified_email) is distinct from 'owner' then raise exception 'business_record_access_denied'; end if;
 perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role='owner' for share;
 select * into g from public.system_package_install_grants where id=p_grant_id and business_workspace_id=p_workspace_id and granted_by=p_user_id and status='active' and expires_at>clock_timestamp() for update;
 if not found or public.workspace_exit_completed(p_workspace_id) or p_targets is null or (p_targets-array['inquiryTenantId','websiteWorkId','websitePagePath'])<>'{}'::jsonb then raise exception 'business_record_access_denied'; end if;
 perform 1 from public.workspace_delegations where customer_workspace_id=p_workspace_id and agency_workspace_id=g.agency_workspace_id and status='active' for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 if p_targets ? 'inquiryTenantId' and not exists(select 1 from public.tenant_workspace_links l join public.tenants t on t.stable_id=l.tenant_stable_id join public.memberships m on m.tenant_stable_id=t.stable_id and m.user_id=p_user_id and m.role='owner' where l.workspace_id=p_workspace_id and t.id=p_targets->>'inquiryTenantId') then raise exception 'business_record_access_denied'; end if;
 if p_targets ? 'websiteWorkId' then perform public.website_document_assert_actor(p_workspace_id,(p_targets->>'websiteWorkId')::uuid,p_user_id,p_verified_email,true,false); end if;
 insert into public.system_bundle_target_scopes values(g.id,p_targets,p_user_id,clock_timestamp()) on conflict(grant_id) do nothing;
 select targets into stored from public.system_bundle_target_scopes where grant_id=g.id;
 if stored is distinct from p_targets then raise exception 'system_command_conflict'; end if;
 return jsonb_build_object('grantId',g.id,'targets',stored);
end $$;

create function public.system_bundle_assert_scope(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_revision_id uuid,p_command_id uuid,p_targets jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.system_version_source_revisions; g public.system_package_install_grants;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text,7415));
 perform 1 from public.workspaces where id=p_workspace_id for update;
 if not found or public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
 select * into r from public.system_version_source_revisions where id=p_revision_id;
 if not found then raise exception 'business_record_access_denied'; end if;
 perform public.require_system_package_install_scope(p_workspace_id,p_user_id,p_verified_email,r.source_system_id,r.number,p_command_id);
 if public.system_version_member_role(p_workspace_id,p_user_id,p_verified_email) in ('owner','admin') then
  perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role in ('owner','admin') for share;
  if found then return null; end if;
 end if;
 select g0.* into g from public.system_package_install_grants g0 join public.system_bundle_target_scopes t on t.grant_id=g0.id and t.targets=p_targets where g0.business_workspace_id=p_workspace_id and g0.command_id=p_command_id and g0.source_revision_id=p_revision_id and public.system_package_install_grant_active(g0,p_user_id,p_verified_email) for update of g0;
 if not found then raise exception 'business_record_access_denied'; end if;
 perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=g.granted_by and role='owner' for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 perform 1 from public.workspace_memberships where workspace_id=g.agency_workspace_id and user_id=p_user_id and role in ('owner','admin') for share;
 if not found then raise exception 'business_record_access_denied'; end if;
 perform 1 from public.workspace_delegations where customer_workspace_id=p_workspace_id and agency_workspace_id=g.agency_workspace_id and status='active' for share;
 if not found or not public.system_package_install_grant_active(g,p_user_id,p_verified_email) then raise exception 'business_record_access_denied'; end if;
 return g.id;
end $$;
create function public.system_bundle_read_scope(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_revision_id uuid,p_command_id uuid,p_targets jsonb) returns uuid
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r public.system_version_source_revisions; s public.system_version_sources; g public.system_package_install_grants;
begin
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
 select * into r from public.system_version_source_revisions where id=p_revision_id;
 select * into s from public.system_version_sources where system_id=r.source_system_id;
 if r.id is null or not public.system_revision_is_qualified(r.id) then raise exception 'system_revision_not_qualified'; end if;
 if not(s.business_workspace_id=p_workspace_id or s.listing_state='listed' or (s.listing_state='clients' and exists(select 1 from public.workspace_delegations where customer_workspace_id=p_workspace_id and agency_workspace_id=s.business_workspace_id and status='active')) or exists(select 1 from public.system_version_source_shares where source_system_id=s.system_id and grantee_workspace_id=p_workspace_id and revoked_at is null)) then raise exception 'business_record_access_denied'; end if;
 if public.system_version_member_role(p_workspace_id,p_user_id,p_verified_email) in ('owner','admin') then return null; end if;
 select g0.* into g from public.system_package_install_grants g0 join public.system_bundle_target_scopes t on t.grant_id=g0.id where g0.business_workspace_id=p_workspace_id and g0.command_id=p_command_id and g0.source_revision_id=p_revision_id and (p_targets is null or t.targets=p_targets) and public.system_package_install_grant_active(g0,p_user_id,p_verified_email);
 if not found then raise exception 'business_record_access_denied'; end if;
 return g.id;
end $$;
revoke all on function public.system_bundle_read_scope(uuid,uuid,text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.read_system_bundle_install_receipt(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_revision_id uuid,p_command_id uuid,p_name text,p_targets jsonb) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare installed public.system_bundle_installations; expected text;
begin
 perform public.system_bundle_read_scope(p_workspace_id,p_user_id,p_verified_email,p_revision_id,p_command_id,p_targets);
 select * into installed from public.system_bundle_installations where business_workspace_id=p_workspace_id and command_id=p_command_id;
 if not found then return null; end if;
 expected:=encode(sha256(convert_to(jsonb_build_object('revision',p_revision_id,'name',p_name,'targets',p_targets)::text,'UTF8')),'hex');
 if installed.created_by<>p_user_id or installed.source_revision_id<>p_revision_id or installed.command_digest<>expected or installed.receipt is null then raise exception 'system_command_conflict'; end if;
 return installed.receipt;
end $$;
revoke all on function public.read_system_bundle_install_receipt(uuid,uuid,text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.read_system_bundle_install_receipt(uuid,uuid,text,uuid,uuid,text,jsonb) to service_role;

create function public.read_system_bundle_targets(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_revision_id uuid,p_command_id uuid,p_targets jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare permission uuid; inquiry jsonb:='null'; website jsonb:='null'; t public.tenants; w public.saved_product_work; h public.website_document_heads;
begin
 permission:=public.system_bundle_read_scope(p_workspace_id,p_user_id,p_verified_email,p_revision_id,p_command_id,p_targets);
 if permission is not null and exists(select 1 from public.system_bundle_installations where business_workspace_id=p_workspace_id and command_id=p_command_id and receipt is not null) then raise exception 'business_record_access_denied'; end if;
 if p_targets ? 'inquiryTenantId' then
  select t0.* into t from public.tenants t0 join public.tenant_workspace_links l on l.tenant_stable_id=t0.stable_id where l.workspace_id=p_workspace_id and t0.id=p_targets->>'inquiryTenantId' and t0.active;
  if not found then raise exception 'business_record_access_denied'; end if;
  if permission is null and not exists(select 1 from public.memberships where tenant_stable_id=t.stable_id and user_id=p_user_id and role in ('owner','admin')) then raise exception 'business_record_access_denied'; end if;
  select jsonb_build_object('tenantId',t.id,'revision',i.revision,'state',i.state) into inquiry from public.inquiry_workspaces i where i.tenant_stable_id=t.stable_id and i.business_id=p_workspace_id::text;
  if inquiry is null then inquiry:=jsonb_build_object('tenantId',t.id,'revision',null,'state',null); end if;
 end if;
 if p_targets ? 'websiteWorkId' then
  select * into w from public.saved_product_work where id=(p_targets->>'websiteWorkId')::uuid and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website';
  select * into h from public.website_document_heads where website_work_id=w.id;
  if w.id is null or h.website_work_id is null or w.payload->'candidate'->>'revision' is distinct from h.revision::text then raise exception 'system_bundle_binding_unavailable'; end if;
  website:=jsonb_build_object('workId',w.id,'workRevision',(w.payload->>'revision')::integer,'documentRevision',h.revision,'payload',w.payload);
 end if;
 return jsonb_build_object('inquiry',inquiry,'website',website);
end $$;
-- These exact new artifacts are available only during this installation's
-- transaction. The grant never becomes general website authoring authority.
create function public.system_bundle_native_draft_active(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.system_bundle_draft_permissions p join public.system_package_install_grants g on g.id=p.grant_id join public.system_bundle_installations i on i.business_workspace_id=g.business_workspace_id and i.command_id=g.command_id where p.work_id=p_work_id and g.business_workspace_id=p_workspace_id and i.receipt is null and i.created_by=p_user_id and public.system_package_install_grant_active(g,p_user_id,p_verified_email));
$$;
alter function public.website_document_assert_actor(uuid,uuid,uuid,text,boolean,boolean) rename to website_document_assert_actor_bundle_core;
create function public.website_document_assert_actor(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_manage boolean,p_write boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not p_manage and public.system_bundle_native_draft_active(p_workspace_id,p_work_id,p_user_id,p_verified_email) then
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  if not exists(select 1 from public.saved_product_work where id=p_work_id and workspace_id=p_workspace_id and product_id='websites' and created_by=p_user_id) then raise exception 'workspace_access_denied'; end if;
  return;
 end if;
 perform public.website_document_assert_actor_bundle_core(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_manage,p_write);
end $$;
-- Reuse the native bounded-work CAS/body guard with one explicit, transient
-- named-work authority branch. Version2 website and history validation stay intact.
do $$ declare definition text; before_clause text; after_clause text;
begin
 select pg_get_functiondef('public.update_bounded_product_work(uuid,uuid,uuid,text,text,integer,jsonb)'::regprocedure) into definition;
 before_clause:='perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;'||chr(10)||'  if not found then raise exception ''workspace_access_denied''; end if;';
 after_clause:='perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id for share;'||chr(10)||'  if not found and not (p_product_id=''websites'' and p_expected_revision=0 and public.system_bundle_native_draft_active(p_workspace_id,p_work_id,p_user_id,p_verified_email)) then raise exception ''workspace_access_denied''; end if;';
 if position(before_clause in definition)=0 then raise exception 'system_bundle_native_authority_migration_invalid'; end if;
 execute replace(definition,before_clause,after_clause);
end $$;
alter function public.system_actor_scope(uuid,uuid,text,boolean) rename to system_actor_scope_bundle_core;
create function public.system_actor_scope(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_write boolean,out access text,out work_ids uuid[])
language plpgsql security definer set search_path=public,pg_temp as $$
declare existing record; granted uuid[];
begin
 existing:=public.system_actor_scope_bundle_core(p_workspace_id,p_user_id,p_verified_email,p_write);access:=existing.access;work_ids:=existing.work_ids;
 if access='agency' then
  select coalesce(array_agg(p.work_id),'{}'::uuid[]) into granted from public.system_bundle_draft_permissions p join public.system_package_install_grants g on g.id=p.grant_id where g.business_workspace_id=p_workspace_id and public.system_package_install_grant_active(g,p_user_id,p_verified_email) and (not p_write or public.system_bundle_native_draft_active(p_workspace_id,p.work_id,p_user_id,p_verified_email));
  work_ids:=array(select distinct unnest(coalesce(work_ids,'{}'::uuid[])||granted));
 end if;
end $$;

create function public.install_system_bundle(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_source_revision_id uuid,p_source_system_id uuid,p_source_workspace_id uuid,p_source_number integer,p_command_id uuid,p_name text,p_targets jsonb,p_expected_inquiry_revision bigint,p_expected_website_work_revision integer,p_expected_website_document_revision integer,p_parts jsonb,p_inquiry_state jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare permission uuid; source public.system_version_source_revisions; src public.system_version_sources; bundle public.system_bundle_installations; digest text; item jsonb; part jsonb; shape jsonb; payload jsonb; doc jsonb; key text; kind text; w public.saved_product_work; base public.saved_product_work; base_doc public.website_documents; t public.tenants; inquiry public.inquiry_workspaces; capability jsonb; draft jsonb; fields jsonb; created jsonb; lineage public.system_versions; parts_receipt jsonb:='[]'; website_id uuid; root_id text; expected_nodes jsonb; open_href text; inquiry_count integer:=0; at_time timestamptz:=clock_timestamp();
begin
 permission:=public.system_bundle_assert_scope(p_workspace_id,p_user_id,p_verified_email,p_source_revision_id,p_command_id,p_targets);
 perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text||':bundle:'||p_command_id::text,20261016));
 select * into source from public.system_version_source_revisions where id=p_source_revision_id and source_system_id=p_source_system_id and number=p_source_number;
 select * into src from public.system_version_sources where system_id=p_source_system_id and business_workspace_id=p_source_workspace_id;
 if source.id is null or src.system_id is null or source.definition->>'kind'<>'bundle' or not public.system_revision_is_qualified(source.id) then raise exception 'system_revision_not_qualified'; end if;
 perform public.system_package_assert_declaration(source.definition,source.declaration,source.requires_binding_kinds);
 digest:=encode(sha256(convert_to(jsonb_build_object('revision',source.id,'name',p_name,'targets',p_targets)::text,'UTF8')),'hex');
 select * into bundle from public.system_bundle_installations where business_workspace_id=p_workspace_id and command_id=p_command_id;
 if found then if bundle.command_digest<>digest or bundle.created_by<>p_user_id or bundle.receipt is null then raise exception 'system_command_conflict'; end if; return bundle.receipt; end if;
 if char_length(coalesce(p_name,'')) not between 1 and 160 or jsonb_typeof(p_parts) is distinct from 'array' or jsonb_array_length(p_parts)<>jsonb_array_length(source.definition->'systems') or (select count(distinct value->>'key') from jsonb_array_elements(p_parts))<>jsonb_array_length(p_parts) then raise exception 'system_bundle_input_invalid'; end if;
 -- Lock and compare the target identities before creating any native work.
 if exists(select 1 from jsonb_array_elements(source.definition->'systems') s where s->'definition'->>'kind'='inquiry_pattern') then
  select t0.* into t from public.tenants t0 join public.tenant_workspace_links l on l.tenant_stable_id=t0.stable_id where l.workspace_id=p_workspace_id and t0.id=p_targets->>'inquiryTenantId' and t0.active for share of t0,l;
  if not found or (permission is null and not exists(select 1 from public.memberships where tenant_stable_id=t.stable_id and user_id=p_user_id and role in ('owner','admin'))) then raise exception 'system_bundle_binding_unavailable'; end if;
  select * into inquiry from public.inquiry_workspaces where tenant_stable_id=t.stable_id and business_id=p_workspace_id::text for update;
  if inquiry.revision is distinct from p_expected_inquiry_revision then raise exception 'system_version_stale'; end if;
  if p_inquiry_state is null or p_inquiry_state->'inquiries' is distinct from coalesce(inquiry.state->'inquiries','[]'::jsonb) or (inquiry.id is not null and not(p_inquiry_state @> inquiry.state)) then raise exception 'system_bundle_inquiry_invalid'; end if;
 end if;
 if exists(select 1 from jsonb_array_elements(source.definition->'systems') s where s->'definition'->>'kind'='website_section') then
  if permission is null then perform public.website_document_assert_actor(p_workspace_id,(p_targets->>'websiteWorkId')::uuid,p_user_id,p_verified_email,true,false); end if;
  select * into base from public.saved_product_work where id=(p_targets->>'websiteWorkId')::uuid and workspace_id=p_workspace_id and product_id='websites' and resource_kind='website' for update;
  select d.* into base_doc from public.website_documents d join public.website_document_heads h on h.website_work_id=d.website_work_id and h.revision=d.revision where d.website_work_id=base.id for update of h;
  if base.id is null or base.payload->>'revision' is distinct from p_expected_website_work_revision::text or base_doc.revision is distinct from p_expected_website_document_revision then raise exception 'system_version_stale'; end if;
 end if;
 insert into public.system_bundle_installations(business_workspace_id,source_revision_id,command_id,command_digest,created_by) values(p_workspace_id,source.id,p_command_id,digest,p_user_id) returning * into bundle;
 for item in select value from jsonb_array_elements(source.definition->'systems') loop
  key:=item->>'key';shape:=item->'definition';kind:=shape->>'kind';
  select value into part from jsonb_array_elements(p_parts) where value->>'key'=key;
  if part is null then raise exception 'system_bundle_input_invalid'; end if;
  if kind='internal_app' then
   payload:=part->'payload';
   perform public.validate_application_spec(payload->'spec');
   if payload->'spec' is distinct from (shape-'kind')||jsonb_build_object('maintenanceOwner',p_user_id) or payload->>'status'<>'draft' or payload->'records' is distinct from '[]'::jsonb or payload->>'createdBy' is distinct from p_user_id::text or payload ?| array['installation','release','releases','candidate'] or payload->>'revision' is distinct from '0' or (payload-array['version','revision','title','createdBy','createdAt','history','spec','specVersion','status','versions','rehearsal','records'])<>'{}'::jsonb or payload->'history' is distinct from '[]'::jsonb or payload->'rehearsal' is distinct from 'null'::jsonb or payload->'versions' is distinct from jsonb_build_array(jsonb_build_object('version',1,'spec',payload->'spec')) then raise exception 'system_bundle_app_invalid'; end if;
   insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values((part->>'workId')::uuid,p_workspace_id,'applications','application',item->>'name',payload,p_user_id) returning * into w;
   open_href:='/workspace?workspaceId='||p_workspace_id::text||'&work='||w.id::text;
  elsif kind='inquiry_pattern' then
   inquiry_count:=inquiry_count+1;
   select value into capability from jsonb_array_elements(p_inquiry_state->'capabilities') where value->>'id'=part->>'capabilityId';
   select value into draft from jsonb_array_elements(p_inquiry_state->'requests') where value->>'id'=part->>'requestId';
   select coalesce(jsonb_agg(f||jsonb_build_object('component',(f->>'kind')||'_field')),'[]') into fields from jsonb_array_elements(shape->'fields') f;
   if capability is null or capability->>'status'<>'draft' or capability->'live' is distinct from 'null'::jsonb or capability->>'businessId' is distinct from p_workspace_id::text or draft->>'businessId' is distinct from p_workspace_id::text or draft->>'capabilityId' is distinct from capability->>'id' or draft->>'actorId' is distinct from p_user_id::text or draft->'publishApproval' is distinct from 'null'::jsonb or draft->>'state'<>'planned' or draft->'draft'->>'name' is distinct from shape->>'name' or draft->'draft'->'form'->'fields' is distinct from fields or draft->'draft'->'form'->>'title' is distinct from shape->>'title' or draft->'draft'->'form'->>'intro' is distinct from shape->>'intro' or draft->'draft'->'routing'->>'destination' is distinct from 'your team' or draft->'draft'->'routing'->>'withinMinutes' is distinct from shape->>'routingWithinMinutes' or draft->'draft'->'connections' is distinct from '[{"id":"email","provider":"email","status":"missing","consent":"missing","lastCheckedAt":null}]'::jsonb then raise exception 'system_bundle_inquiry_invalid'; end if;
   insert into public.saved_product_work(workspace_id,product_id,resource_kind,title,payload,created_by) values(p_workspace_id,'inquiry','inquiry_capability',item->>'name',draft,p_user_id) returning * into w;
   open_href:='/workspace?workspaceId='||p_workspace_id::text||'&view=inquiries&request='||(part->>'requestId');
  elsif kind='website_section' then
   payload:=part->'payload';doc:=part->'document';website_id:=(part->>'workId')::uuid;
   select value->>'root' into root_id from jsonb_array_elements(base_doc.document->'pages') where value->>'path'=coalesce(p_targets->>'websitePagePath','/');
   if root_id is null then raise exception 'system_bundle_website_invalid'; end if;
   expected_nodes:=jsonb_set(base_doc.document->'nodes',array[root_id,'children'],(base_doc.document->'nodes'->root_id->'children')||jsonb_build_array(part->>'sectionId'));
   if (doc-array['nodes','facts']) is distinct from (base_doc.document-array['nodes','facts']) or ((doc->'nodes')-(part->>'sectionId')) is distinct from expected_nodes or ((doc->'facts')-((part->>'sectionId')||'_review')) is distinct from base_doc.document->'facts' then raise exception 'system_bundle_website_invalid'; end if;
   if doc->'facts' is null or not((doc->'facts') @> (base_doc.document->'facts')) or doc->'assets' is distinct from base_doc.document->'assets' or doc->'businessRecord' is distinct from base_doc.document->'businessRecord' or payload->>'status'<>'review_ready' or payload->'approvedCandidateRevision' is distinct from 'null'::jsonb or payload->'launch' is distinct from '{"receipt":null,"readBack":null}'::jsonb or payload->'candidate'->'document' is distinct from doc or payload->>'createdBy' is distinct from p_user_id::text or doc->'nodes'->(part->>'sectionId')->>'type' is distinct from 'Faq' or doc->'nodes'->(part->>'sectionId')->'props' is distinct from jsonb_build_object('title',shape->>'title','items',shape->'items') or doc->'nodes'->(part->>'sectionId')->'verification'->>'needsReview' is distinct from 'true' then raise exception 'system_bundle_website_invalid'; end if;
   -- New isolated native website, never a write to the target's live artifact.
   insert into public.saved_product_work(id,workspace_id,product_id,resource_kind,title,payload,created_by) values(website_id,p_workspace_id,'websites','website',item->>'name',payload||jsonb_build_object('candidate',null,'status','building'),p_user_id) returning * into w;
   if permission is not null then insert into public.system_bundle_draft_permissions values(permission,w.id); end if;
   payload:=payload||jsonb_build_object('revision',1,'history',jsonb_build_array(jsonb_build_object('revision',1,'kind','bundle_section_draft','actorId',p_user_id,'at',public.system_version_ts(at_time))));
   perform public.commit_website_document_candidate(p_workspace_id,w.id,p_user_id,p_verified_email,0,0,part->>'contentHash',doc,payload);
   open_href:='/workspace?workspaceId='||p_workspace_id::text||'&work='||w.id::text;
  else raise exception 'system_package_runtime_unsupported'; end if;
  if permission is not null then insert into public.system_bundle_draft_permissions values(permission,w.id) on conflict(work_id) do nothing; end if;
  created:=public.create_business_system(p_workspace_id,p_user_id,p_verified_email,jsonb_build_object('name',item->>'name','kind',case kind when 'inquiry_pattern' then 'inquiry' when 'website_section' then 'website' else kind end,'origin',jsonb_build_object('kind','saved_work','ref',w.id)),gen_random_uuid(),digest);
  insert into public.system_versions(id,version_system_id,business_workspace_id,source_system_id,source_workspace_id,context_kind,context_label,baseline_revision_id,baseline_revision,baseline_definition,created_by,created_at,updated_at) values(gen_random_uuid(),(created->>'id')::uuid,p_workspace_id,src.system_id,src.business_workspace_id,'agency_client',p_name,source.id,source.number,shape,p_user_id,at_time,at_time) returning * into lineage;
  insert into public.system_bundle_components values(bundle.id,key,lineage.id,w.id,part->>'capabilityId',part->>'requestId');
  if kind='internal_app' then insert into public.system_version_native_applications(version_id,business_workspace_id,work_id) values(lineage.id,p_workspace_id,w.id); end if;
  open_href:='/workspace?view=system&workspaceId='||p_workspace_id::text||'&system='||(created->>'id');
  parts_receipt:=parts_receipt||jsonb_build_array(jsonb_build_object('key',key,'name',item->>'name','kind',kind,'systemId',created->'id','versionId',lineage.id,'openHref',open_href,'status','draft'));
 end loop;
 if inquiry_count>0 then
  if inquiry.id is null then insert into public.inquiry_workspaces(tenant_id,tenant_stable_id,business_id,state_version,revision,state,updated_by) values(t.id,t.stable_id,p_workspace_id::text,1,1,p_inquiry_state,p_user_id::text);
  else update public.inquiry_workspaces set revision=revision+1,state=p_inquiry_state,updated_by=p_user_id::text,updated_at=at_time where id=inquiry.id and revision=p_expected_inquiry_revision; if not found then raise exception 'system_version_stale'; end if; end if;
 end if;
 update public.system_bundle_installations set receipt=jsonb_build_object('workspaceId',p_workspace_id,'bundleId',bundle.id,'sourceRevisionId',source.id,'outcome','drafts_created','components',parts_receipt) where id=bundle.id returning * into bundle;
 return bundle.receipt;
end $$;

create function public.system_bundle_component_definition(p_version_id uuid,p_definition jsonb) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select case when exists(select 1 from public.system_bundle_components c where c.version_id=p_version_id) then (select item->'definition' from jsonb_array_elements(p_definition->'systems') item join public.system_bundle_components c on c.version_id=p_version_id and c.component_key=item->>'key') else p_definition end;
$$;
alter function public.system_version_json(public.system_versions,text,uuid,text) rename to system_version_json_bundle_core;
create function public.system_version_json(v public.system_versions,p_access text,p_user_id uuid,p_verified_email text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select public.system_version_json_bundle_core(v,p_access,p_user_id,p_verified_email)||coalesce((select jsonb_build_object('sourceComponentKey',c.component_key,'bundleId',c.bundle_id) from public.system_bundle_components c where c.version_id=v.id),'{}'::jsonb);
$$;
-- Existing Version CAS, override/account ownership and history validation apply
-- separately to each component; its baseline is the exact component projection.
do $$ declare definition text;
begin
 select pg_get_functiondef('public.save_system_version_owner_grants_core(uuid,text,uuid,bigint,jsonb)'::regprocedure) into definition;
 if position('r.definition' in definition)=0 then raise exception 'system_bundle_version_migration_invalid'; end if;
 execute replace(definition,'r.definition','public.system_bundle_component_definition(v.id,r.definition)');
end $$;
create function public.system_bundle_receipt_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='DELETE' or tg_table_name<>'system_bundle_installations' or old.receipt is not null or (to_jsonb(new)-'receipt') is distinct from (to_jsonb(old)-'receipt') or new.receipt is null then raise exception 'system_bundle_receipt_immutable'; end if;
 return new;
end $$;
create trigger bundle_installation_immutable before update or delete on public.system_bundle_installations for each row execute function public.system_bundle_receipt_immutable();
create trigger bundle_rehearsal_immutable before update or delete on public.system_bundle_native_rehearsals for each row execute function public.system_bundle_receipt_immutable();
create trigger bundle_component_immutable before update or delete on public.system_bundle_components for each row execute function public.system_bundle_receipt_immutable();
create trigger bundle_target_scope_immutable before update or delete on public.system_bundle_target_scopes for each row execute function public.system_bundle_receipt_immutable();
revoke all on function public.system_bundle_receipt_immutable() from public,anon,authenticated,service_role;
create function public.system_bundle_read_work_ids(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns uuid[]
language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(array_agg(distinct p.work_id),'{}'::uuid[]) from public.system_bundle_draft_permissions p join public.system_package_install_grants g on g.id=p.grant_id join public.system_bundle_target_scopes t on t.grant_id=g.id join public.system_bundle_installations i on i.business_workspace_id=g.business_workspace_id and i.command_id=g.command_id and i.source_revision_id=g.source_revision_id and i.receipt is not null where g.business_workspace_id=p_workspace_id and public.system_package_install_grant_active(g,p_user_id,p_verified_email);
$$;
revoke all on function public.system_actor_scope(uuid,uuid,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.system_bundle_read_work_ids(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.system_package_behavior_bundle_core(jsonb,text[]),public.system_package_rehearsal_bundle_core(jsonb),public.website_document_assert_actor_bundle_core(uuid,uuid,uuid,text,boolean,boolean),public.system_actor_scope_bundle_core(uuid,uuid,text,boolean),public.system_version_json_bundle_core(public.system_versions,text,uuid,text),public.system_bundle_native_draft_active(uuid,uuid,uuid,text),public.system_bundle_component_definition(uuid,jsonb),public.system_bundle_assert_scope(uuid,uuid,text,uuid,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.system_package_behavior(jsonb,text[]),public.system_package_rehearsal(jsonb),public.website_document_assert_actor(uuid,uuid,uuid,text,boolean,boolean),public.system_version_json(public.system_versions,text,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.read_system_bundle_targets(uuid,uuid,text,uuid,uuid,jsonb),public.grant_system_bundle_targets(uuid,uuid,text,uuid,jsonb),public.install_system_bundle(uuid,uuid,text,uuid,uuid,uuid,integer,uuid,text,jsonb,bigint,integer,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.read_system_bundle_targets(uuid,uuid,text,uuid,uuid,jsonb),public.grant_system_bundle_targets(uuid,uuid,text,uuid,jsonb),public.install_system_bundle(uuid,uuid,text,uuid,uuid,uuid,integer,uuid,text,jsonb,bigint,integer,integer,jsonb,jsonb) to service_role;
create function public.read_system_bundle_target_choices(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_revision_id uuid,p_command_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare allowed jsonb; role text; source public.system_version_source_revisions; result jsonb;
begin
 select * into source from public.system_version_source_revisions where id=p_revision_id;
 if not found or source.definition->>'kind'<>'bundle' then raise exception 'system_bundle_input_invalid'; end if;
 perform public.system_bundle_read_scope(p_workspace_id,p_user_id,p_verified_email,p_revision_id,p_command_id,null);
 role:=public.system_version_member_role(p_workspace_id,p_user_id,p_verified_email);
 if coalesce(role,'') not in ('owner','admin') then
  select s.targets into allowed from public.system_bundle_target_scopes s join public.system_package_install_grants g on g.id=s.grant_id where g.business_workspace_id=p_workspace_id and g.source_revision_id=p_revision_id and g.command_id=p_command_id and public.system_package_install_grant_active(g,p_user_id,p_verified_email);
  if allowed is null then raise exception 'business_record_access_denied'; end if;
 end if;
 result:=jsonb_build_object('workspaceId',p_workspace_id,'revisionId',p_revision_id,'commandId',p_command_id,'boundTargets',allowed,'inquiry',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'label',t.site_name) order by t.site_name) from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id where l.workspace_id=p_workspace_id and t.active and ((allowed is not null and t.id=allowed->>'inquiryTenantId') or (allowed is null and exists(select 1 from public.memberships m where m.tenant_stable_id=t.stable_id and m.user_id=p_user_id and m.role in ('owner','admin'))))),'[]'::jsonb),'websites',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'label',w.title,'pages',d.document->'pages') order by w.title) from public.saved_product_work w join public.website_document_heads h on h.website_work_id=w.id join public.website_documents d on d.website_work_id=w.id and d.revision=h.revision where w.workspace_id=p_workspace_id and w.product_id='websites' and w.resource_kind='website' and (allowed is null or w.id::text=allowed->>'websiteWorkId')),'[]'::jsonb));
 return result;
end $$;
alter function public.read_version_actor(uuid,text) rename to read_version_actor_bundle_core;
create function public.read_version_actor(p_user_id uuid,p_verified_email text) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select base||jsonb_build_object('delegatedSystems',coalesce(base->'delegatedSystems','[]'::jsonb)||coalesce((select jsonb_agg(jsonb_build_object('businessId',i.business_workspace_id,'systemId',v.version_system_id,'canWrite',false)) from public.system_bundle_installations i join public.system_bundle_components c on c.bundle_id=i.id join public.system_versions v on v.id=c.version_id where i.receipt is not null and c.work_id=any(public.system_bundle_read_work_ids(i.business_workspace_id,p_user_id,p_verified_email))),'[]'::jsonb)) from (select public.read_version_actor_bundle_core(p_user_id,p_verified_email) base) x;
$$;
revoke all on function public.read_version_actor_bundle_core(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.read_system_bundle_target_choices(uuid,uuid,text,uuid,uuid),public.read_version_actor(uuid,text) from public,anon,authenticated;
grant execute on function public.read_system_bundle_target_choices(uuid,uuid,text,uuid,uuid),public.read_version_actor(uuid,text) to service_role;

commit;
