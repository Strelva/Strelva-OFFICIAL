-- Native bundle updates remain business-owned drafts. Version release history
-- advances only from the destination's accepted and verified native receipts.
begin;
create table public.system_bundle_native_bindings (
 version_id uuid primary key references public.system_versions(id),
 website_work_id uuid references public.saved_product_work(id),website_page_path text,
 inquiry_tenant_stable_id uuid references public.tenants(stable_id),
 created_at timestamptz not null default clock_timestamp());
create table public.system_bundle_native_preparations (
 id uuid primary key default gen_random_uuid(),version_id uuid not null references public.system_versions(id),
 row_revision bigint not null,source_revision_id uuid not null references public.system_version_source_revisions(id),
 definition jsonb not null, native_work_id uuid not null references public.saved_product_work(id),
 native_revision integer not null,native_hash text,native_request_id text,native_capability_id text,
 prepared_by uuid not null references public.users(id),created_at timestamptz not null default clock_timestamp(),unique(version_id,row_revision));
create table public.system_bundle_native_release_receipts (
 preparation_id uuid primary key references public.system_bundle_native_preparations(id),
 release_number integer not null,native_receipt_id text not null,owner_id uuid not null references public.users(id),
 verified_at timestamptz not null,created_at timestamptz not null default clock_timestamp());
alter table public.system_bundle_native_bindings enable row level security;
alter table public.system_bundle_native_preparations enable row level security;
alter table public.system_bundle_native_release_receipts enable row level security;
revoke all on public.system_bundle_native_bindings,public.system_bundle_native_preparations,public.system_bundle_native_release_receipts from public,anon,authenticated,service_role;
create function public.system_bundle_native_history_immutable() returns trigger language plpgsql set search_path=public,pg_temp as $$ begin raise exception 'system_bundle_receipt_immutable';end $$;
revoke all on function public.system_bundle_native_history_immutable() from public,anon,authenticated,service_role;
create trigger system_bundle_native_bindings_immutable before update or delete on public.system_bundle_native_bindings for each row execute function public.system_bundle_native_history_immutable();
create trigger system_bundle_native_preparations_immutable before update or delete on public.system_bundle_native_preparations for each row execute function public.system_bundle_native_history_immutable();
create trigger system_bundle_native_release_receipts_immutable before update or delete on public.system_bundle_native_release_receipts for each row execute function public.system_bundle_native_history_immutable();
alter function public.install_system_bundle(uuid,uuid,text,uuid,uuid,uuid,integer,uuid,text,jsonb,bigint,integer,integer,jsonb,jsonb) rename to install_system_bundle_native_binding_core;
create function public.install_system_bundle(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_source_revision_id uuid,p_source_system_id uuid,p_source_workspace_id uuid,p_source_number integer,p_command_id uuid,p_name text,p_targets jsonb,p_expected_inquiry_revision bigint,p_expected_website_work_revision integer,p_expected_website_document_revision integer,p_parts jsonb,p_inquiry_state jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 result:=public.install_system_bundle_native_binding_core(p_workspace_id,p_user_id,p_verified_email,p_source_revision_id,p_source_system_id,p_source_workspace_id,p_source_number,p_command_id,p_name,p_targets,p_expected_inquiry_revision,p_expected_website_work_revision,p_expected_website_document_revision,p_parts,p_inquiry_state);
 insert into public.system_bundle_native_bindings(version_id,website_work_id,website_page_path,inquiry_tenant_stable_id)
 select c.version_id,case when v.baseline_definition->>'kind'='website_section' then (p_targets->>'websiteWorkId')::uuid end,case when v.baseline_definition->>'kind'='website_section' then coalesce(p_targets->>'websitePagePath','/') end,
 case when v.baseline_definition->>'kind'='inquiry_pattern' then (select stable_id from public.tenants where id=p_targets->>'inquiryTenantId') end
 from public.system_bundle_components c join public.system_versions v on v.id=c.version_id where c.bundle_id=(result->>'bundleId')::uuid and v.baseline_definition->>'kind' in ('website_section','inquiry_pattern') on conflict(version_id) do nothing;
 return result;
end $$;
revoke all on function public.install_system_bundle_native_binding_core(uuid,uuid,text,uuid,uuid,uuid,integer,uuid,text,jsonb,bigint,integer,integer,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.install_system_bundle(uuid,uuid,text,uuid,uuid,uuid,integer,uuid,text,jsonb,bigint,integer,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.install_system_bundle(uuid,uuid,text,uuid,uuid,uuid,integer,uuid,text,jsonb,bigint,integer,integer,jsonb,jsonb) to service_role;
create function public.system_bundle_working_definition(v public.system_versions) returns jsonb
language plpgsql stable set search_path=public,pg_temp as $$
declare result jsonb:=v.baseline_definition;o record;parts text[];
begin
 for o in select path,value from public.system_version_overrides where version_id=v.id order by case when path='*' then 0 else 1 end,path loop
 if o.path='*' then result:=o.value;else parts:=string_to_array(o.path,'.');if o.value is null then result:=result#-parts;else result:=jsonb_set(result,parts,o.value,true);end if;end if;
 end loop;return result;
end $$;
create function public.system_bundle_native_receipt(p public.system_bundle_native_preparations) returns jsonb
language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('kind','native','receiptId',p.id,'workspaceId',v.business_workspace_id,'versionId',p.version_id,'rowRevision',p.row_revision,'workId',p.native_work_id,'reviewHref','/workspace?view=needs-you&workspaceId='||v.business_workspace_id::text,'status',case when exists(select 1 from public.system_bundle_native_release_receipts where preparation_id=p.id) then 'verified' else 'awaiting_native_review' end)
 from public.system_versions v where v.id=p.version_id;
$$;
create function public.read_bundle_native_preparation(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_version_id uuid,p_row_revision bigint) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v public.system_versions;c public.system_bundle_components;b public.system_bundle_native_bindings;p public.system_bundle_native_preparations;w public.saved_product_work;h public.website_document_heads;t public.tenants;i public.inquiry_workspaces;previous jsonb;
begin
 if coalesce(public.system_version_member_role(p_workspace_id,p_user_id,p_verified_email),'') not in ('owner','admin') then raise exception 'business_record_access_denied';end if;
 select * into v from public.system_versions where id=p_version_id and business_workspace_id=p_workspace_id;
 if not found or v.row_revision<>p_row_revision then raise exception 'system_version_stale';end if;
 select * into c from public.system_bundle_components where version_id=v.id and v.baseline_definition->>'kind' in ('inquiry_pattern','website_section');if not found then return null;end if;
 if not public.system_revision_is_qualified(v.baseline_revision_id) then raise exception 'system_revision_not_qualified';end if;
 select * into b from public.system_bundle_native_bindings where version_id=v.id;if not found then raise exception 'system_bundle_native_binding_required';end if;
 select * into p from public.system_bundle_native_preparations where version_id=v.id and row_revision=v.row_revision;
 if found then return jsonb_build_object('existing',public.system_bundle_native_receipt(p));end if;
 select definition into previous from public.system_bundle_native_preparations where version_id=v.id order by row_revision desc limit 1;
 if v.baseline_definition->>'kind'='website_section' then
 select * into w from public.saved_product_work where id=b.website_work_id and workspace_id=p_workspace_id and product_id='websites';if not found then raise exception 'business_record_access_denied';end if;
 select * into h from public.website_document_heads where website_work_id=w.id;
 return jsonb_build_object('kind',v.baseline_definition->>'kind','workId',w.id,'payload',w.payload,'workRevision',coalesce((w.payload->>'revision')::integer,0),'documentRevision',h.revision,'sectionId','bundle_'||replace(c.work_id::text,'-',''),'pagePath',b.website_page_path,'previousDefinition',previous);
 end if;
 select * into t from public.tenants where stable_id=b.inquiry_tenant_stable_id and active;
 if not found or not exists(select 1 from public.tenant_workspace_links where workspace_id=p_workspace_id and tenant_stable_id=t.stable_id) or not exists(select 1 from public.memberships where tenant_stable_id=t.stable_id and user_id=p_user_id and role in ('owner','admin')) then raise exception 'business_record_access_denied';end if;
 select * into i from public.inquiry_workspaces where tenant_stable_id=t.stable_id and business_id=p_workspace_id::text;
 select * into w from public.saved_product_work where id=c.work_id;
 return jsonb_build_object('kind',v.baseline_definition->>'kind','workId',c.work_id,'tenantId',t.id,'revision',i.revision,'state',i.state,'capabilityId',w.payload->>'capabilityId','sourceBusinessId',v.source_workspace_id,'sourceVersion',v.baseline_revision);
end $$;
create function public.commit_bundle_native_preparation(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_version_id uuid,p_row_revision bigint,p_expected_revision integer,p_expected_work_revision integer,p_artifact jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.system_versions;c public.system_bundle_components;b public.system_bundle_native_bindings;p public.system_bundle_native_preparations;r public.system_version_source_revisions;w public.saved_product_work;h public.website_document_heads;d public.website_documents;t public.tenants;i public.inquiry_workspaces;working jsonb;original_working jsonb;doc jsonb;sid text;root text;fid text;native_state jsonb;work jsonb;cap jsonb;oldcap jsonb;capid text;oldwork jsonb;native_work uuid;native_version integer;
begin
 perform 1 from public.workspaces where id=p_workspace_id for update;
 if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked';end if;
 if coalesce(public.system_version_member_role(p_workspace_id,p_user_id,p_verified_email),'') not in ('owner','admin') then raise exception 'business_record_access_denied';end if;
 perform 1 from public.workspace_memberships where workspace_id=p_workspace_id and user_id=p_user_id and role in ('owner','admin') for share;if not found then raise exception 'business_record_access_denied';end if;
 select * into v from public.system_versions where id=p_version_id and business_workspace_id=p_workspace_id for update;
 if not found or v.row_revision<>p_row_revision then raise exception 'system_version_stale';end if;
 if not public.lock_system_revision_qualification(v.baseline_revision_id) then raise exception 'system_revision_not_qualified';end if;
 select * into r from public.system_version_source_revisions where id=v.baseline_revision_id;
 original_working:=public.system_bundle_working_definition(v);working:=coalesce(p_artifact->'effectiveDefinition',original_working);
 if working->>'kind' is distinct from v.baseline_definition->>'kind' then raise exception 'system_bundle_native_artifact_invalid';end if;
 perform public.system_package_assert_declaration(working,r.declaration,r.requires_binding_kinds);
 select * into c from public.system_bundle_components where version_id=v.id and v.baseline_definition->>'kind' in ('inquiry_pattern','website_section');if not found then raise exception 'system_bundle_native_binding_required';end if;
 select * into b from public.system_bundle_native_bindings where version_id=v.id;if not found then raise exception 'system_bundle_native_binding_required';end if;
 select * into p from public.system_bundle_native_preparations where version_id=v.id and row_revision=v.row_revision;
 if found then if p.definition<>original_working then raise exception 'system_version_stale';end if;return public.system_bundle_native_receipt(p);end if;
 if v.baseline_definition->>'kind'='website_section' then
 native_work:=b.website_work_id;
 select * into w from public.saved_product_work where id=native_work and workspace_id=p_workspace_id for update;
 select * into h from public.website_document_heads where website_work_id=w.id for update;
 select * into d from public.website_documents where website_work_id=w.id and revision=h.revision;
 if coalesce((w.payload->>'revision')::integer,0)<>p_expected_work_revision or h.revision<>p_expected_revision then raise exception 'system_version_stale';end if;
 doc:=p_artifact->'document';sid:='bundle_'||replace(c.work_id::text,'-','');fid:=sid||'_review';
 select value->>'root' into root from jsonb_array_elements(d.document->'pages') where value->>'path'=b.website_page_path;
 if root is null or doc->'nodes'->sid->>'type'<>'Faq' or doc->'nodes'->sid->'props' is distinct from (working-array['kind'])
 or (doc-array['nodes','facts']) is distinct from (d.document-array['nodes','facts'])
 or ((doc->'nodes')-array[sid,root]) is distinct from ((d.document->'nodes')-array[sid,root])
 or ((doc->'nodes'->root)-array['children']) is distinct from ((d.document->'nodes'->root)-array['children'])
 or (doc->'nodes'->root->'children') is distinct from (case when (d.document->'nodes'->root->'children') @> jsonb_build_array(sid) then (select jsonb_agg(value order by position) from jsonb_array_elements(d.document->'nodes'->root->'children') with ordinality x(value,position) where value<>to_jsonb(sid) or position=(select min(position) from jsonb_array_elements(d.document->'nodes'->root->'children') with ordinality y(value,position) where value=to_jsonb(sid))) else (d.document->'nodes'->root->'children')||jsonb_build_array(sid) end)
 or ((doc->'facts')-fid) is distinct from ((d.document->'facts')-fid)
 or doc->'nodes'->sid->'verification'->'needsReview' is distinct from 'true'::jsonb
 or doc->'facts'->fid->'highRisk' is distinct from 'true'::jsonb then raise exception 'system_bundle_native_artifact_invalid';end if;
 perform public.commit_website_document_candidate(p_workspace_id,native_work,p_user_id,p_verified_email,p_expected_revision,p_expected_work_revision,p_artifact->>'contentHash',doc,p_artifact->'payload');
 native_version:=p_expected_revision+1;
 if working is distinct from original_working then
 delete from public.system_version_overrides where version_id=v.id;
 insert into public.system_version_overrides(version_id,path,value,set_by,set_at) values(v.id,'*',working,p_user_id,clock_timestamp());
 update public.system_versions set row_revision=row_revision+1,updated_at=clock_timestamp() where id=v.id returning * into v;
 end if;
 insert into public.system_bundle_native_preparations(version_id,row_revision,source_revision_id,definition,native_work_id,native_revision,native_hash,prepared_by) values(v.id,v.row_revision,v.baseline_revision_id,working,native_work,native_version,p_artifact->>'contentHash',p_user_id) returning * into p;
 else
 select * into t from public.tenants where stable_id=b.inquiry_tenant_stable_id and active for share;
 perform 1 from public.tenant_workspace_links where workspace_id=p_workspace_id and tenant_stable_id=t.stable_id for share;if not found then raise exception 'business_record_access_denied';end if;
 perform 1 from public.memberships where tenant_stable_id=t.stable_id and user_id=p_user_id and role in ('owner','admin') for share;if not found then raise exception 'business_record_access_denied';end if;
 select * into i from public.inquiry_workspaces where tenant_stable_id=t.stable_id and business_id=p_workspace_id::text for update;
 if not found or i.revision<>p_expected_revision then raise exception 'system_version_stale';end if;
 select * into w from public.saved_product_work where id=c.work_id;capid:=w.payload->>'capabilityId';
 native_state:=p_artifact->'state';work:=p_artifact->'work';
 select value into oldcap from jsonb_array_elements(i.state->'capabilities') where value->>'id'=capid;
 select value into cap from jsonb_array_elements(native_state->'capabilities') where value->>'id'=capid;
 select value into oldwork from jsonb_array_elements(i.state->'requests') where value->>'id'=oldcap->>'activeRequestId';
 if work->>'businessId'<>p_workspace_id::text or work->>'capabilityId'<>capid or (work is distinct from oldwork and work->>'actorId'<>p_user_id::text) or work->'publishApproval' is distinct from 'null'::jsonb
 or work->'draft'->'form'->>'title' is distinct from working->>'title' or work->'draft'->'form'->>'intro' is distinct from working->>'intro'
 or work->'draft'->'form'->'fields' is distinct from (select jsonb_agg(value||jsonb_build_object('component',(value->>'kind')||'_field')) from jsonb_array_elements(working->'fields'))
 or work->'draft'->'record'->'fields' is distinct from work->'draft'->'form'->'fields'
 or work->'draft'->'routing'->>'withinMinutes' is distinct from working->>'routingWithinMinutes'
 or work->'draft'->'connections' is distinct from coalesce(oldwork->'draft'->'connections',oldcap->'live'->'connections')
 or work->'draft'->'routing'->>'destination' is distinct from coalesce(oldwork->'draft'->'routing'->>'destination',oldcap->'live'->'routing'->>'destination')
 or (cap-array['activeRequestId','status','updatedAt']) is distinct from (oldcap-array['activeRequestId','status','updatedAt'])
 or cap->>'activeRequestId' is distinct from work->>'id'
 or (native_state-array['requests','capabilities','changes','patternInstallations','actionReceipts']) is distinct from (i.state-array['requests','capabilities','changes','patternInstallations','actionReceipts'])
 or (select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) from jsonb_array_elements(native_state->'capabilities') where value->>'id'<>capid) is distinct from (select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) from jsonb_array_elements(i.state->'capabilities') where value->>'id'<>capid)
 or (select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) from jsonb_array_elements(native_state->'requests') where value->>'capabilityId'<>capid) is distinct from (select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) from jsonb_array_elements(i.state->'requests') where value->>'capabilityId'<>capid)
 or not ((native_state->'changes') @> (i.state->'changes'))
 or not ((native_state->'actionReceipts') @> (i.state->'actionReceipts'))
 or exists(select 1 from jsonb_array_elements(native_state->'changes') x where not ((i.state->'changes') @> jsonb_build_array(x)) and x->>'capabilityId' is distinct from capid)
 or exists(select 1 from jsonb_array_elements(native_state->'actionReceipts') x where not ((i.state->'actionReceipts') @> jsonb_build_array(x)) and x->>'capabilityId' is distinct from capid)
 or (select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) from jsonb_array_elements(native_state->'patternInstallations') where value->>'capabilityId'<>capid) is distinct from (select coalesce(jsonb_agg(value order by value->>'id'),'[]'::jsonb) from jsonb_array_elements(i.state->'patternInstallations') where value->>'capabilityId'<>capid)

 then raise exception 'system_bundle_native_artifact_invalid';end if;
 update public.inquiry_workspaces set state=native_state,revision=i.revision+1,updated_at=clock_timestamp() where tenant_stable_id=t.stable_id and business_id=p_workspace_id::text;
 native_work:=c.work_id;native_version:=(work->'draft'->>'version')::integer;
 if working is distinct from original_working then
 delete from public.system_version_overrides where version_id=v.id;
 insert into public.system_version_overrides(version_id,path,value,set_by,set_at) values(v.id,'*',working,p_user_id,clock_timestamp());
 update public.system_versions set row_revision=row_revision+1,updated_at=clock_timestamp() where id=v.id returning * into v;
 end if;
 insert into public.system_bundle_native_preparations(version_id,row_revision,source_revision_id,definition,native_work_id,native_revision,native_request_id,native_capability_id,prepared_by) values(v.id,v.row_revision,v.baseline_revision_id,working,native_work,native_version,work->>'id',capid,p_user_id) returning * into p;
 end if;
 return public.system_bundle_native_receipt(p);
end $$;
revoke all on function public.system_bundle_working_definition(public.system_versions),public.system_bundle_native_receipt(public.system_bundle_native_preparations) from public,anon,authenticated,service_role;
revoke all on function public.read_bundle_native_preparation(uuid,uuid,text,uuid,bigint),public.commit_bundle_native_preparation(uuid,uuid,text,uuid,bigint,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.read_bundle_native_preparation(uuid,uuid,text,uuid,bigint),public.commit_bundle_native_preparation(uuid,uuid,text,uuid,bigint,integer,integer,jsonb) to service_role;

create function public.reconcile_bundle_native_releases(p_workspace_id uuid,p_work_id uuid) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.system_bundle_native_preparations;v public.system_versions;c public.system_bundle_components;b public.system_bundle_native_bindings;h public.website_document_heads;d public.website_documents;native_receipt public.website_document_receipts;health public.website_document_health;claim public.inquiry_publication_claims;i public.inquiry_workspaces;change jsonb;cap jsonb;native_owner uuid;email text;proof text;verified timestamptz;definition jsonb;number integer;s public.systems;spine jsonb;impl jsonb;counted integer:=0;
begin
 for p in select * from public.system_bundle_native_preparations where native_work_id=p_work_id order by created_at loop
 if exists(select 1 from public.system_bundle_native_release_receipts where preparation_id=p.id) then continue;end if;
 select * into v from public.system_versions where id=p.version_id and business_workspace_id=p_workspace_id for update;
 if not found or v.row_revision<>p.row_revision or v.baseline_revision_id<>p.source_revision_id or public.system_bundle_working_definition(v)<>p.definition then continue;end if;
 select * into c from public.system_bundle_components where version_id=v.id;
 select * into b from public.system_bundle_native_bindings where version_id=v.id;
 native_owner:=null;proof:=null;verified:=null;
 if v.baseline_definition->>'kind'='website_section' then
 select * into h from public.website_document_heads where website_work_id=p.native_work_id;
 select * into native_receipt from public.website_document_receipts wr where wr.website_work_id=p.native_work_id and wr.revision>=p.native_revision and wr.receipt->>'status'='published' and wr.receipt->>'provider'='strelva-hosted' order by wr.revision desc limit 1;
 if not found or h.approved_revision<>native_receipt.revision then continue;end if;
 select * into d from public.website_documents where website_work_id=p.native_work_id and revision=native_receipt.revision;
 select * into health from public.website_document_health where website_work_id=p.native_work_id and revision=native_receipt.revision and content_hash=d.content_hash order by checked_at desc limit 1;
 if not found or health.status<>'healthy' or health.observed_hash is distinct from d.content_hash or health.checked_at<native_receipt.created_at
 or d.document->'nodes'->('bundle_'||replace(c.work_id::text,'-',''))->'props' is distinct from (p.definition-array['kind']) then continue;end if;
 native_owner:=h.approved_by;proof:=native_receipt.id::text;verified:=health.checked_at;
 else
 select * into i from public.inquiry_workspaces where tenant_stable_id=b.inquiry_tenant_stable_id and business_id=p_workspace_id::text;
 select value into cap from jsonb_array_elements(i.state->'capabilities') where value->>'id'=p.native_capability_id;
 select value into change from jsonb_array_elements(i.state->'changes') where value->>'requestId'=p.native_request_id and value->>'capabilityId'=p.native_capability_id and value->>'targetVersion'=cap->'live'->>'version' and value->'verification'->'verified'='true'::jsonb;
 select * into claim from public.inquiry_publication_claims where tenant_stable_id=b.inquiry_tenant_stable_id and business_id=p_workspace_id::text and request_id=p.native_request_id and capability_id=p.native_capability_id and change_id=change->>'id' and version=(cap->'live'->>'version')::integer and status='accepted' and acceptance_id=change->>'providerAcceptanceId';
 if not found or coalesce((cap->'live'->>'version')::integer,0)<p.native_revision or cap->'live'->>'name' is distinct from p.definition->>'name' or cap->'live'->'form'->>'title' is distinct from p.definition->>'title' or cap->'live'->'form'->>'intro' is distinct from p.definition->>'intro'
 or cap->'live'->'form'->'fields' is distinct from (select jsonb_agg(value||jsonb_build_object('component',(value->>'kind')||'_field')) from jsonb_array_elements(p.definition->'fields'))
 or cap->'live'->'routing'->>'withinMinutes' is distinct from p.definition->>'routingWithinMinutes' or claim.actor_id !~ '^[0-9a-f-]{36}$' then continue;end if;
 native_owner:=claim.actor_id::uuid;proof:=claim.id::text;verified:=(change->'verification'->>'checkedAt')::timestamptz;
 if verified is null or claim.accepted_at is null or claim.accepted_at<p.created_at or verified<claim.accepted_at or verified>clock_timestamp() then continue;end if;
 end if;
 select u.email into email from public.users u join public.workspace_memberships m on m.user_id=u.id and m.workspace_id=p_workspace_id and m.role='owner' where u.id=native_owner and u.verified_at is not null for share of m;
 if not found then continue;end if;
 -- Repair only from accepted receipts. No provider write or retry occurs here.
 select coalesce(max(r.number),0)+1 into number from public.system_version_releases r where version_id=v.id;
 select * into s from public.systems where id=v.version_system_id;
 impl:=jsonb_build_object('kind','system_version_release','ref','system_version_release:'||v.id::text||':'||number::text,'contentHash',encode(sha256(convert_to(p.definition::text,'UTF8')),'hex'));
 spine:=public.record_system_revision(p_workspace_id,native_owner,email,v.version_system_id,s.change_number,jsonb_build_object('implementation',impl,'summary','Verified native Version release '||number::text),public.system_version_uuid('release:'||v.id::text||':'||number::text),encode(sha256(convert_to(impl::text,'UTF8')),'hex'),true);
 insert into public.system_version_releases(version_id,number,definition,baseline_revision,override_paths,system_revision_id,released_by,released_at) values(v.id,number,p.definition,v.baseline_revision,array(select path from public.system_version_overrides where version_id=v.id),(spine->'revision'->>'id')::uuid,native_owner,verified);
 update public.system_versions set current_release=number,row_revision=row_revision+1,updated_at=clock_timestamp() where id=v.id;
 insert into public.system_bundle_native_release_receipts values(p.id,number,proof,native_owner,verified,clock_timestamp());
 if s.lifecycle='draft' then perform public.transition_system_lifecycle(p_workspace_id,native_owner,email,s.id,(select change_number from public.systems where id=s.id),'live');end if;
 counted:=counted+1;
 end loop;return counted;
end $$;
revoke all on function public.reconcile_bundle_native_releases(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reconcile_bundle_native_releases(uuid,uuid) to service_role;

-- Final destination publication locks qualification for the exact preparation;
-- source withdrawal between staging and owner approval cannot cross this gate.
create function public.system_bundle_assert_native_publication(p_workspace_id uuid,p_work_id uuid,p_document jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.system_bundle_native_preparations;v public.system_versions;c public.system_bundle_components;
begin
 for p in select q.* from public.system_bundle_native_preparations q where q.native_work_id=p_work_id and not exists(select 1 from public.system_bundle_native_release_receipts where preparation_id=q.id) order by q.row_revision desc loop
 select * into v from public.system_versions where id=p.version_id and business_workspace_id=p_workspace_id for update;
 select * into c from public.system_bundle_components where version_id=v.id;
 if p_document->'nodes'->('bundle_'||replace(c.work_id::text,'-',''))->'props' is distinct from (p.definition-array['kind']) then continue;end if;
 if v.row_revision<>p.row_revision or public.system_bundle_working_definition(v)<>p.definition then raise exception 'system_version_stale';end if;
 if not public.lock_system_revision_qualification(p.source_revision_id) then raise exception 'system_revision_not_qualified';end if;
 end loop;
end $$;
alter function public.publish_website_document(uuid,uuid,uuid,text,integer,text,text,jsonb) rename to publish_website_document_bundle_core;
create function public.publish_website_document(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_revision integer,p_content_hash text,p_tenant_id text,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
 perform public.system_bundle_assert_native_publication(p_workspace_id,p_work_id,(select document from public.website_documents where website_work_id=p_work_id and revision=p_revision));
 return public.publish_website_document_bundle_core(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_revision,p_content_hash,p_tenant_id,p_receipt);
end $$;
create function public.system_bundle_inquiry_live_gate() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.system_bundle_native_preparations;v public.system_versions;cap jsonb;prior jsonb;
begin
 for p in select q.* from public.system_bundle_native_preparations q join public.system_bundle_native_bindings b on b.version_id=q.version_id where b.inquiry_tenant_stable_id=new.tenant_stable_id and q.native_capability_id is not null and not exists(select 1 from public.system_bundle_native_release_receipts where preparation_id=q.id) order by q.row_revision desc loop
 select value into cap from jsonb_array_elements(new.state->'capabilities') where value->>'id'=p.native_capability_id;
 select value into prior from jsonb_array_elements(old.state->'capabilities') where value->>'id'=p.native_capability_id;
 if cap->'live' is not distinct from prior->'live' or coalesce((cap->'live'->>'version')::integer,0)<p.native_revision then continue;end if;
 select * into v from public.system_versions where id=p.version_id for update;
 if v.row_revision<>p.row_revision or public.system_bundle_working_definition(v)<>p.definition then raise exception 'system_version_stale';end if;
 if not public.lock_system_revision_qualification(p.source_revision_id) then raise exception 'system_revision_not_qualified';end if;
 end loop;return new;
end $$;
create trigger system_bundle_inquiry_live_gate before update on public.inquiry_workspaces for each row execute function public.system_bundle_inquiry_live_gate();
revoke all on function public.system_bundle_assert_native_publication(uuid,uuid,jsonb),public.system_bundle_inquiry_live_gate(),public.publish_website_document_bundle_core(uuid,uuid,uuid,text,integer,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.publish_website_document(uuid,uuid,uuid,text,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.publish_website_document(uuid,uuid,uuid,text,integer,text,text,jsonb) to service_role;

create function public.reconcile_bundle_inquiry_releases(p_workspace_id uuid,p_capability_id text) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid;total integer:=0;begin
 for target in select c.work_id from public.system_bundle_components c join public.system_versions v on v.id=c.version_id where v.business_workspace_id=p_workspace_id and c.capability_id=p_capability_id loop total:=total+public.reconcile_bundle_native_releases(p_workspace_id,target);end loop;return total;
end $$;
revoke all on function public.reconcile_bundle_inquiry_releases(uuid,text) from public,anon,authenticated;
grant execute on function public.reconcile_bundle_inquiry_releases(uuid,text) to service_role;

alter function public.publish_website_document_to_linked_tenant(uuid,uuid,uuid,text,integer,text,text,jsonb) rename to publish_website_document_to_linked_tenant_bundle_core;
create function public.publish_website_document_to_linked_tenant(p_workspace_id uuid,p_work_id uuid,p_user_id uuid,p_verified_email text,p_revision integer,p_content_hash text,p_tenant_id text,p_receipt jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.website_document_assert_actor(p_workspace_id,p_work_id,p_user_id,p_verified_email,true,true);
 perform public.system_bundle_assert_native_publication(p_workspace_id,p_work_id,(select document from public.website_documents where website_work_id=p_work_id and revision=p_revision));
 return public.publish_website_document_to_linked_tenant_bundle_core(p_workspace_id,p_work_id,p_user_id,p_verified_email,p_revision,p_content_hash,p_tenant_id,p_receipt);
end $$;
revoke all on function public.publish_website_document_to_linked_tenant_bundle_core(uuid,uuid,uuid,text,integer,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.publish_website_document_to_linked_tenant(uuid,uuid,uuid,text,integer,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.publish_website_document_to_linked_tenant(uuid,uuid,uuid,text,integer,text,text,jsonb) to service_role;

alter function public.read_version_native_runtime(uuid,uuid,text,uuid) rename to read_version_native_runtime_bundle_core;
create function public.read_version_native_runtime(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_version_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v public.system_versions;c public.system_bundle_components;b public.system_bundle_native_bindings;access record;native_revision integer;prepared public.system_bundle_native_preparations;verified boolean:=false;
begin
 select * into v from public.system_versions where id=p_version_id and business_workspace_id=p_workspace_id;
 if not found then raise exception 'system_not_found';end if;
 access:=public.system_version_read_access(v,p_user_id,p_verified_email,false);if access.access is distinct from 'full' then raise exception 'business_record_access_denied';end if;
 select * into c from public.system_bundle_components where version_id=v.id;
 if not found or v.baseline_definition->>'kind' not in ('inquiry_pattern','website_section') then return public.read_version_native_runtime_bundle_core(p_workspace_id,p_user_id,p_verified_email,p_version_id);end if;
 select * into b from public.system_bundle_native_bindings where version_id=v.id;if not found then return null;end if;
 select p.* into prepared from public.system_bundle_native_preparations p join public.system_bundle_native_release_receipts r on r.preparation_id=p.id where p.version_id=v.id and r.release_number=v.current_release;
 if v.baseline_definition->>'kind'='website_section' then
 select h.revision into native_revision from public.website_document_heads h where h.website_work_id=b.website_work_id;
 verified:=exists(select 1 from public.website_document_publications publication join public.website_documents document on document.website_work_id=publication.website_work_id and document.revision=publication.revision where publication.website_work_id=b.website_work_id and document.document->'nodes'->('bundle_'||replace(c.work_id::text,'-',''))->'props'=(prepared.definition-array['kind']) and exists(select 1 from (select health.* from public.website_document_health health where health.website_work_id=publication.website_work_id and health.revision=publication.revision order by checked_at desc limit 1) latest where latest.status='healthy' and latest.observed_hash=publication.content_hash and latest.checked_at>=publication.published_at));
 else
 select (cap->'live'->>'version')::integer,cap->'live'->>'name'=prepared.definition->>'name' and cap->'live'->'form'->>'title'=prepared.definition->>'title' and cap->'live'->'form'->>'intro'=prepared.definition->>'intro' and cap->'live'->'form'->'fields'=(select jsonb_agg(value||jsonb_build_object('component',(value->>'kind')||'_field')) from jsonb_array_elements(prepared.definition->'fields')) and cap->'live'->'routing'->>'withinMinutes'=prepared.definition->>'routingWithinMinutes' and exists(select 1 from public.system_bundle_native_release_receipts proof join public.inquiry_publication_claims accepted on accepted.id::text=proof.native_receipt_id where proof.preparation_id=prepared.id and accepted.status='accepted' and accepted.version=(cap->'live'->>'version')::integer) into native_revision,verified from public.inquiry_workspaces w cross join lateral jsonb_array_elements(w.state->'capabilities') cap where w.tenant_stable_id=b.inquiry_tenant_stable_id and w.business_id=p_workspace_id::text and cap->>'id'=c.capability_id;
 end if;
 return jsonb_build_object('kind',v.baseline_definition->>'kind','workId',c.work_id,'releaseNumber',v.current_release,'designRevision',coalesce(native_revision,0),'status',case when coalesce(verified,false) and v.current_release is not null then 'verified' when v.current_release is not null then 'unverified' else 'draft' end,'reviewHref','/workspace?view=needs-you&workspaceId='||p_workspace_id::text);
end $$;
revoke all on function public.read_version_native_runtime_bundle_core(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.read_version_native_runtime(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_version_native_runtime(uuid,uuid,text,uuid) to service_role;
commit;
