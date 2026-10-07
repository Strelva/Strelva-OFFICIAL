-- Version history follows the existing owner-approved Make real publication.
-- No new approval or provider write. Caller receipts are insufficient: the
-- native authority must independently contain the exact accepted artifact.
begin;
set local lock_timeout='2s';
create function public.version_canonical_json(p jsonb) returns text language plpgsql immutable set search_path=public,pg_temp as $$
declare result text;
begin
  if jsonb_typeof(p)='object' then
    select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.version_canonical_json(value),',' order by key collate "C"),'')||'}' into result from jsonb_each(p);
  elsif jsonb_typeof(p)='array' then
    select '['||coalesce(string_agg(public.version_canonical_json(value),',' order by ord),'')||']' into result from jsonb_array_elements(p) with ordinality a(value,ord);
  else result:=p::text; end if;
  return result;
end $$;
create function public.version_json_sha(p jsonb) returns text language sql immutable set search_path=public,pg_temp as $$
  select encode(sha256(convert_to(public.version_canonical_json(p),'UTF8')),'hex')
$$;
create function public.version_plan_sha(p jsonb) returns text language sql immutable set search_path=public,pg_temp as $$
  select public.version_json_sha(jsonb_build_object('possibilityId',p->'id','candidateRevision',p->'candidateRevision',
    'changes',coalesce((select jsonb_agg(jsonb_build_object('systemId',c->'baseline'->'systemId','baseline',c->'baseline'->'revisionId','candidate',public.version_json_sha(c->'candidate')) order by c->'baseline'->>'systemId') from jsonb_array_elements(p->'changes') c),'[]'),
    'introduces',coalesce((select jsonb_agg(jsonb_build_object('key',i->'key','candidate',public.version_json_sha(i->'candidate'),'name',i->'name') order by ord) from jsonb_array_elements(p->'introduces') with ordinality a(i,ord)),'[]'),
    'connections',coalesce((select jsonb_agg(public.version_json_sha(c) order by ord) from jsonb_array_elements(p->'connections') with ordinality a(c,ord)),'[]'),
    'effects',coalesce((select jsonb_agg(jsonb_build_object('id',e->'id','fingerprint',public.version_json_sha(jsonb_build_object('kind',e->'kind','system',e->'system','request',e->'request','publish',coalesce(e->'publish','null'))||case when e ? 'channel' then jsonb_build_object('channel',e->'channel') else '{}' end)) order by ord) from jsonb_array_elements(p->'effects') with ordinality a(e,ord)),'[]')))
$$;
create function public.version_working_definition(p_version_id uuid) returns jsonb language plpgsql stable set search_path=public,pg_temp as $$
declare definition jsonb; item record; parts text[]; idx integer;
begin
  select baseline_definition into definition from public.system_versions where id=p_version_id;
  if not found then raise exception 'system_not_found'; end if;
  for item in select path,value from public.system_version_overrides where version_id=p_version_id order by char_length(path),position loop
    if item.path='*' then definition:=item.value;
    else
      parts:=string_to_array(item.path,'.');
      for idx in 1..cardinality(parts)-1 loop
        if jsonb_typeof(definition#>parts[1:idx]) is distinct from 'object' then raise exception 'system_version_input_invalid'; end if;
      end loop;
      if item.value is null then definition:=definition#-parts; else definition:=jsonb_set(definition,parts,item.value,true); end if;
    end if;
  end loop;
  return definition;
end $$;
-- PRIVATE settlement primitive. Each calling bridge proves its own immutable
-- approved provider artifact; this primitive only owns lineage CAS and spine.
create function public.record_version_publication(p_version_id uuid,p_expected_row_revision bigint,p_source_revision_id uuid,p_definition jsonb,p_system_revision_id uuid,p_actor_id uuid)
returns integer language plpgsql set search_path=public,pg_temp as $$
declare v public.system_versions; s public.systems; next_number integer; paths text[];
begin
  select * into v from public.system_versions where id=p_version_id for update;
  if not found or v.row_revision<>p_expected_row_revision or v.baseline_revision_id<>p_source_revision_id
    or public.version_working_definition(v.id) is distinct from p_definition then raise exception 'system_version_stale'; end if;
  select * into s from public.systems where id=v.version_system_id and business_workspace_id=v.business_workspace_id for update;
  if not found or s.current_revision_id is distinct from p_system_revision_id
    or not exists(select 1 from public.system_revisions r where r.id=p_system_revision_id and r.system_id=s.id and r.business_workspace_id=s.business_workspace_id) then raise exception 'system_version_stale'; end if;
  select coalesce(max(number),0)+1 into next_number from public.system_version_releases where version_id=v.id;
  with recursive changes(path,before,after) as (
    select ''::text,v.baseline_definition,p_definition union all
    select case when c.path='' then k.key else c.path||'.'||k.key end,c.before->k.key,c.after->k.key from changes c
    cross join lateral (select jsonb_object_keys(case when jsonb_typeof(c.before)='object' and jsonb_typeof(c.after)='object' then c.before||c.after else '{}' end) key) k
    where c.before is distinct from c.after
  ) select coalesce(array_agg(path order by path),'{}'::text[]) into paths from changes where path<>'' and before is distinct from after
    and not (coalesce(jsonb_typeof(before),'')='object' and coalesce(jsonb_typeof(after),'')='object');
  insert into public.system_version_releases(version_id,number,definition,baseline_revision,override_paths,system_revision_id,released_by,released_at)
    values(v.id,next_number,p_definition,v.baseline_revision,paths,p_system_revision_id,p_actor_id,clock_timestamp());
  update public.system_versions set current_release=next_number,row_revision=row_revision+1,updated_at=clock_timestamp() where id=v.id;
  return next_number;
end $$;

create table public.system_version_publication_bindings (
  business_workspace_id uuid not null references public.workspaces(id), activation_id text not null,
  version_id uuid not null references public.system_versions(id), possibility_id uuid not null references public.system_possibilities(id),
  candidate_revision integer not null, row_revision bigint not null, source_revision_id uuid not null,
  definition jsonb not null, candidate jsonb not null, effects jsonb not null,
  owner_decision_id uuid not null references public.owner_decisions(id),
  state text not null default 'pending' check(state in ('pending','recorded','attention')),
  reason text, release_number integer, system_revision_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  primary key(business_workspace_id,activation_id,version_id), unique(version_id,owner_decision_id)
);
alter table public.system_version_publication_bindings enable row level security;
revoke all on public.system_version_publication_bindings from public,anon,authenticated,service_role;

-- A native receipt must belong to this System and the exact approved request.
create function public.version_effect_artifact_matches(p_binding public.system_version_publication_bindings,p_effect jsonb,p_step jsonb)
returns boolean language plpgsql stable set search_path=public,pg_temp as $$
declare v public.system_versions; s public.systems; tenant public.tenants; request jsonb:=p_effect->'request'; document jsonb; claim public.inquiry_publication_claims; live jsonb; spec jsonb;
begin
  if p_step->>'kind' is distinct from 'effect' or p_step->>'target' is distinct from p_effect->>'id'
    or p_step->>'status' is distinct from 'completed' or p_step->>'effect' is distinct from 'accepted'
    or p_step->'receipt'->>'adapterMode' is distinct from 'live' then return false; end if;
  select * into v from public.system_versions where id=p_binding.version_id;
  select * into s from public.systems where id=v.version_system_id and business_workspace_id=p_binding.business_workspace_id;
  if p_effect->'system'->>'systemId' is distinct from s.id::text then return false; end if;
  if p_effect->>'channel'='internal_app' then
    if s.origin_kind<>'saved_work' or s.origin_ref is distinct from request->>'workId' or p_binding.definition->>'kind'<>'internal_app' then return false; end if;
    select r.spec into spec from public.application_releases r join public.application_states a on a.work_id=r.work_id and a.workspace_id=r.workspace_id
      where r.workspace_id=p_binding.business_workspace_id and r.work_id=(request->>'workId')::uuid
        and r.version>coalesce((request->>'expectedReleaseVersion')::integer,0) and a.current_release_version=r.version
        and a.candidate_design_revision=(request->>'expectedCandidateRevision')::integer and r.publication_source='published'
        and r.published_at>=p_binding.created_at and p_step->'receipt'->>'providerRef'=r.work_id::text||'@v'||r.version;
    return spec is not null and jsonb_build_object('kind','internal_app')||(spec-'maintenanceOwner')=p_binding.definition;
  end if;
  select t.* into tenant from public.tenants t join public.tenant_workspace_links l on l.tenant_stable_id=t.stable_id and l.workspace_id=p_binding.business_workspace_id
    where (s.origin_kind='tenant' and s.origin_ref=t.stable_id::text)
      or (s.origin_kind='inquiry_workspace' and exists(select 1 from public.inquiry_workspaces iw where iw.id::text=s.origin_ref and iw.tenant_stable_id=t.stable_id));
  if not found then return false; end if;
  if p_effect->>'channel'='tenant_content' then
    if request->>'tenantId' is distinct from tenant.id or request->>'section' is distinct from p_effect->'publish'->>'section'
      or request->'data' is distinct from p_effect->'publish'->'data' or p_binding.definition->>'kind'<>'website'
      or p_binding.definition->'sections'->(request->>'section') is distinct from request->'data' then return false; end if;
    return exists(select 1 from public.content_versions cv join public.content c on c.tenant_id=cv.tenant_id and c.section=cv.section
      where cv.tenant_id=tenant.id and cv.section=request->>'section' and cv.request_id=p_step->>'idempotencyKey'
        and cv.created_at>=p_binding.created_at and cv.data=request->'data' and c.data=cv.data
        and p_step->'receipt'->>'providerRef'=tenant.id||'|'||cv.section||'|'||cv.id)
      and not exists(select 1 from jsonb_each(p_binding.definition->'sections') section where not exists(select 1 from public.content c where c.tenant_id=tenant.id and c.section=section.key and c.data=section.value));
  elsif p_effect->>'channel'='hosted_website' then
    select d.document into document from public.website_document_publications p join public.website_documents d on d.website_work_id=p.website_work_id and d.revision=p.revision
      join public.website_document_receipts r on r.website_work_id=p.website_work_id and r.workspace_id=p.workspace_id and r.revision=p.revision and r.receipt=p.receipt
      where p.workspace_id=p_binding.business_workspace_id and p.tenant_id=tenant.id and p.website_work_id=(request->>'workId')::uuid
        and p.revision=(request->>'candidateRevision')::integer and p.content_hash=request->>'candidateContentHash'
        and r.created_at>=p_binding.created_at and r.receipt->>'candidateRevision'=p.revision::text
        and p_step->'receipt'->>'providerRef'=p.website_work_id::text||':'||(r.receipt->>'receiptId');
    return document is not null and p_binding.definition=jsonb_build_object('kind','website','document',document-array['capabilities','provenance']);
  elsif p_effect->>'channel'='inquiry_form' then
    select * into claim from public.inquiry_publication_claims c where c.tenant_stable_id=tenant.stable_id and c.tenant_id=request->>'tenantId'
      and c.business_id=request->>'businessId' and c.request_id=request->>'requestId' and c.capability_id=request->>'capabilityId'
      and c.change_id=request->>'changeId' and c.version=(request->>'version')::integer and c.idempotency_key=p_step->>'idempotencyKey'
      and c.action='make_live' and c.status in ('accepted','verification_failed') and c.accepted_at>=p_binding.created_at
      and p_step->'receipt'->>'providerRef'=tenant.id||'|'||c.id::text;
    if not found then return false; end if;
    select capability->'live' into live from public.inquiry_workspaces iw cross join lateral jsonb_array_elements(iw.state->'capabilities') capability
      where iw.id::text=s.origin_ref and iw.tenant_stable_id=tenant.stable_id and iw.business_id=claim.business_id
        and capability->>'id'=claim.capability_id and capability->'live'->>'version'=claim.version::text
        and exists(select 1 from jsonb_array_elements(iw.state->'changes') c where c->>'id'=claim.change_id and c->>'providerAcceptanceId'=claim.acceptance_id);
    return live is not null and p_binding.definition=jsonb_build_object('kind','inquiry','configuration',live-array['id','businessId','version']);
  end if;
  return false;
exception when invalid_text_representation or numeric_value_out_of_range then return false;
end $$;

alter function public.create_make_real_activation(uuid,uuid,text,jsonb) rename to create_make_real_activation_version_core;
revoke all on function public.create_make_real_activation_version_core(uuid,uuid,text,jsonb) from public,anon,authenticated,service_role;
create function public.create_make_real_activation(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_activation jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb; possibility public.system_possibilities; v public.system_versions; change jsonb; effects jsonb; approval public.owner_decisions; definition jsonb;
begin
  perform public.make_real_activation_actor(p_workspace_id,p_user_id,p_verified_email,true);
  select * into possibility from public.system_possibilities where id::text=p_activation->>'possibilityId' and business_workspace_id=p_workspace_id for update;
  for v in select sv.* from public.system_versions sv join jsonb_array_elements(possibility.body->'changes') c on c->'baseline'->>'systemId'=sv.version_system_id::text
    where sv.business_workspace_id=p_workspace_id order by sv.id for update of sv loop
    if exists(select 1 from public.system_version_native_applications where version_id=v.id) then raise exception 'system_version_runtime_unsupported'; end if;
    if possibility.status<>'ready' or possibility.candidate_revision<>(p_activation->>'candidateRevision')::integer then raise exception 'system_version_stale'; end if;
    select c into change from jsonb_array_elements(possibility.body->'changes') c where c->'baseline'->>'systemId'=v.version_system_id::text;
    if not exists(select 1 from jsonb_array_elements(p_activation->'pinned') pin join public.systems s on s.id=v.version_system_id
      where pin->>'systemId'=s.id::text and pin->>'baselineRevisionId'=s.current_revision_id::text and pin->>'baselineRevisionId'=change->'baseline'->>'revisionId') then raise exception 'system_version_stale'; end if;
    select coalesce(jsonb_agg(e order by ord),'[]') into effects from jsonb_array_elements(possibility.body->'effects') with ordinality a(e,ord) where e->'system'->>'systemId'=v.version_system_id::text;
    if jsonb_array_length(effects)=0 or exists(select 1 from jsonb_array_elements(effects) e where e->>'channel' not in ('tenant_content','hosted_website','inquiry_form','internal_app') or e->>'kind'<>'publish') then raise exception 'system_version_runtime_unsupported'; end if;
    select d.* into approval from public.owner_decisions d where d.workspace_id=p_workspace_id and d.source_lifecycle='make_real'
      and d.source_id=possibility.id::text||'@'||possibility.candidate_revision and d.revision_hash=public.version_plan_sha(possibility.body)
      and d.system_id::text=possibility.body->'changes'->0->'baseline'->>'systemId'
      and d.state='approved' and d.change_kind='system.change_live' and not d.admin_may_decide and d.outcome is distinct from 'failed'
      and ((d.route='owner_decides' and d.decided_by_kind in ('owner_link','owner_session')) or (d.route='strelva_reviews' and d.decided_by_kind='operator'))
      and not exists(select 1 from jsonb_array_elements(effects) e where not exists(select 1 from jsonb_array_elements(p_activation->'approvals') a where a->>'effectId'=e->>'id' and a->>'approvalId'=d.id::text)) for update;
    if not found then raise exception 'system_version_release_approval_required'; end if;
    definition:=public.version_working_definition(v.id);
    if change->'candidate'->'content' is distinct from definition then raise exception 'system_version_stale'; end if;
    insert into public.system_version_publication_bindings(business_workspace_id,activation_id,version_id,possibility_id,candidate_revision,row_revision,source_revision_id,definition,candidate,effects,owner_decision_id)
      values(p_workspace_id,p_activation->>'id',v.id,possibility.id,possibility.candidate_revision,v.row_revision,v.baseline_revision_id,definition,change->'candidate',effects,approval.id);
  end loop;
  result:=public.create_make_real_activation_version_core(p_workspace_id,p_user_id,p_verified_email,p_activation);
  return result;
end $$;

alter function public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb) rename to save_make_real_activation_version_core;
revoke all on function public.save_make_real_activation_version_core(uuid,uuid,text,text,integer,jsonb) from public,anon,authenticated,service_role;
create function public.save_make_real_activation(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_activation_id text,p_expected_revision integer,p_activation jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare saved jsonb; binding public.system_version_publication_bindings; effect jsonb; step jsonb; pin jsonb; revision public.system_revisions; content jsonb; release integer; valid boolean; why text;
begin
  saved:=public.save_make_real_activation_version_core(p_workspace_id,p_user_id,p_verified_email,p_activation_id,p_expected_revision,p_activation);
  for binding in select * from public.system_version_publication_bindings where business_workspace_id=p_workspace_id and activation_id=p_activation_id and state<>'recorded' order by version_id for update loop
    if not exists(select 1 from jsonb_array_elements(saved->'steps') s join public.system_versions v on v.id=binding.version_id
      where s->>'kind'='activate' and s->>'target'=v.version_system_id::text and s->>'status'='completed') then continue; end if;
    valid:=true;
    for effect in select e from jsonb_array_elements(binding.effects) e loop
      select s into step from jsonb_array_elements(saved->'steps') s where s->>'kind'='effect' and s->>'target'=effect->>'id';
      if not coalesce(public.version_effect_artifact_matches(binding,effect,step),false) then valid:=false; exit; end if;
    end loop;
    select p into pin from jsonb_array_elements(saved->'pinned') p join public.system_versions v on v.id=binding.version_id where p->>'systemId'=v.version_system_id::text;
    select r.* into revision from public.system_revisions r join public.system_versions v on v.id=binding.version_id
      where r.id::text=pin->>'stagedRevisionId' and r.system_id=v.version_system_id and r.business_workspace_id=p_workspace_id;
    select c.content into content from public.system_revision_contents c where c.business_workspace_id=p_workspace_id and c.content_hash=revision.implementation->>'contentHash';
    if revision.implementation->>'kind' is distinct from 'make_real_content' or content is distinct from binding.candidate->'content' then valid:=false; end if;
    if valid then
      begin
        release:=public.record_version_publication(binding.version_id,binding.row_revision,binding.source_revision_id,binding.definition,revision.id,p_user_id);
        update public.system_version_publication_bindings set state='recorded',reason=null,release_number=release,system_revision_id=revision.id
          where business_workspace_id=p_workspace_id and activation_id=p_activation_id and version_id=binding.version_id;
      exception when raise_exception then
        why:='The accepted publication is saved. Version or System changed before history could be recorded; reconcile this receipt without publishing again.'; valid:=false;
      end;
    else why:='The publication receipt needs verification against its exact native artifact. Nothing was added to Version history; do not publish again.'; end if;
    if not valid then
      update public.system_version_publication_bindings set state='attention',reason=why where business_workspace_id=p_workspace_id and activation_id=p_activation_id and version_id=binding.version_id;
      -- Persist acceptance even when the ledger cannot settle. The same run
      -- can reconcile local history from evidence; no outside write is retried.
      saved:=jsonb_set(saved,'{status}','"needs_attention"');
      perform public.make_real_activation_set_writer(true);
      update public.saved_product_work set payload=saved where workspace_id=p_workspace_id and product_id='operations' and resource_kind='activation' and payload->>'id'=p_activation_id;
      perform public.make_real_activation_set_writer(false);
    end if;
  end loop;
  return saved;
end $$;

create function public.read_version_publication_status(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare v public.system_versions; scope record;
begin
  select * into v from public.system_versions where id=p_version_id and business_workspace_id=p_workspace_id;
  if not found then raise exception 'system_not_found'; end if;
  scope:=public.system_version_access(v,p_user_id,p_verified_email,false);
  if scope.access is distinct from 'full' then raise exception 'business_record_access_denied'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('activationId',activation_id,'state',state,'reason',reason,'releaseNumber',release_number) order by created_at)
    from public.system_version_publication_bindings where version_id=p_version_id and business_workspace_id=p_workspace_id),'[]');
end $$;
revoke all on function public.version_canonical_json(jsonb),public.version_json_sha(jsonb),public.version_plan_sha(jsonb),public.version_working_definition(uuid),
  public.record_version_publication(uuid,bigint,uuid,jsonb,uuid,uuid),public.version_effect_artifact_matches(public.system_version_publication_bindings,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.create_make_real_activation(uuid,uuid,text,jsonb),public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb),public.read_version_publication_status(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.create_make_real_activation(uuid,uuid,text,jsonb),public.save_make_real_activation(uuid,uuid,text,text,integer,jsonb),public.read_version_publication_status(uuid,uuid,text,uuid) to service_role;
commit;
