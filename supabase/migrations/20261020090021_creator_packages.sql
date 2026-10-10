-- Exact-revision package authority. Local preparation only; no production approval.
begin;
set local lock_timeout='2s';
alter table public.system_version_sources add column creator_workspace_id uuid references public.workspaces(id), add column listing_state text not null default 'private' check(listing_state in ('private','clients','listed'));
update public.system_version_sources set creator_workspace_id=business_workspace_id;
alter table public.system_version_sources alter column creator_workspace_id set not null;
alter table public.system_version_source_revisions add column creator_workspace_id uuid references public.workspaces(id), add column declaration jsonb;
alter table public.system_versions add column creator_workspace_id uuid references public.workspaces(id), add column installed_source_revision_id uuid references public.system_version_source_revisions(id);
-- ALTER holds the affected tables until commit. Temporarily extend each existing
-- guard for exactly its new null metadata columns; no historical field, row
-- revision, receipt or native pointer may change. Restore the exact definitions
-- inside this transaction, before any other session can observe the extension.
do $backfill$ declare history_guard text; identity_guard text;
begin
 history_guard:=pg_get_functiondef('public.system_version_history_immutable()'::regprocedure);
 identity_guard:=pg_get_functiondef('public.system_version_identity_guard()'::regprocedure);
 execute replace(history_guard,E'begin\n',E'begin\n'||$exception$
  if tg_op='UPDATE' and tg_table_name='system_version_source_revisions'
    and old.creator_workspace_id is null and new.declaration is null
    and (to_jsonb(new)-array['creator_workspace_id','declaration'])=(to_jsonb(old)-array['creator_workspace_id','declaration'])
    and new.creator_workspace_id=(select business_workspace_id from public.system_version_sources where system_id=new.source_system_id)
  then return new; end if;
$exception$);
 execute replace(identity_guard,E'begin\n',E'begin\n'||$exception$
  if old.creator_workspace_id is null and old.installed_source_revision_id is null
    and (to_jsonb(new)-array['creator_workspace_id','installed_source_revision_id'])=(to_jsonb(old)-array['creator_workspace_id','installed_source_revision_id'])
    and new.creator_workspace_id=old.source_workspace_id and new.installed_source_revision_id=old.baseline_revision_id
  then return new; end if;
$exception$);
 update public.system_version_source_revisions r set creator_workspace_id=s.creator_workspace_id from public.system_version_sources s where s.system_id=r.source_system_id;
 update public.system_versions v set creator_workspace_id=v.source_workspace_id,installed_source_revision_id=v.baseline_revision_id;
 execute history_guard;
 execute identity_guard;
end $backfill$;
alter table public.system_version_source_revisions alter column creator_workspace_id set not null;
alter table public.system_versions alter column creator_workspace_id set not null, alter column installed_source_revision_id set not null;
create table public.system_revision_reviewers(user_id uuid primary key references public.users(id), policy_version text not null check(char_length(policy_version) between 1 and 120), active boolean not null default true);
-- Intentionally empty: #323 selects reviewer authority and the review standard.
create table public.system_revision_qualifications(revision_id uuid primary key references public.system_version_source_revisions(id), evidence jsonb not null, human_state text not null default 'pending' check(human_state in ('pending','approved','rejected')), reviewer_id uuid references public.users(id), reviewer_policy_version text, reviewed_at timestamptz, review_note text not null default '', checked_at timestamptz not null default clock_timestamp(), check((human_state='pending')=(reviewer_id is null and reviewed_at is null)));
alter table public.system_revision_reviewers enable row level security;
alter table public.system_revision_qualifications enable row level security;
revoke all on public.system_revision_reviewers,public.system_revision_qualifications from public,anon,authenticated,service_role;
grant select on public.system_revision_reviewers,public.system_revision_qualifications to service_role;

create function public.system_package_behavior(p_definition jsonb,p_bindings text[]) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare result jsonb; part jsonb; item jsonb; k text; fields jsonb; business_fields jsonb;
begin
 perform public.agency_package_assert_shareable(p_definition);
 if p_definition->>'kind'='bundle' then
  if (p_definition-array['kind','systems'])<>'{}'::jsonb or jsonb_typeof(p_definition->'systems') is distinct from 'array' or jsonb_array_length(p_definition->'systems') not between 1 and 16 then raise exception 'system_package_runtime_unsupported'; end if;
  result:=jsonb_build_object('recordsRead','[]'::jsonb,'recordsWritten','[]'::jsonb,'businessRecordFields','[]'::jsonb,'outsideEffects','[]'::jsonb,'bindingKinds',to_jsonb(p_bindings),'dataLeavingBusiness','[]'::jsonb);
  if (select count(distinct s->>'key') from jsonb_array_elements(p_definition->'systems') s)<>jsonb_array_length(p_definition->'systems') then raise exception 'system_package_input_invalid'; end if;
  for item in select value from jsonb_array_elements(p_definition->'systems') loop
   if (item-array['key','name','definition'])<>'{}'::jsonb or char_length(coalesce(item->>'key','')) not between 1 and 80 or char_length(coalesce(item->>'name','')) not between 1 and 160 or item->'definition'->>'kind'='bundle' then raise exception 'system_package_input_invalid'; end if;
   part:=public.system_package_behavior(item->'definition',p_bindings);
   for k in select jsonb_object_keys(result) loop
    result:=jsonb_set(result,array[k],(select coalesce(jsonb_agg(value order by value),'[]'::jsonb) from (select distinct value from jsonb_array_elements((result->k)||(part->k))) x));
   end loop;
  end loop;
  return result;
 end if;
 if p_definition->>'kind' is distinct from 'internal_app' or (p_definition-array['kind','title','fields','components'])<>'{}'::jsonb then raise exception 'system_package_runtime_unsupported'; end if;
 perform public.validate_application_spec((p_definition-'kind')||jsonb_build_object('maintenanceOwner','package-qualification'));
 select coalesce(jsonb_agg(x.name order by x.name),'[]'::jsonb) into business_fields from (
  select distinct name from jsonb_array_elements(p_definition->'fields') f cross join lateral unnest(case f->>'type' when 'contact' then array['contacts.id','contacts.name','contacts.email','contacts.phone'] when 'assigned_person' then array['people.id','people.name','people.email','people.active'] else '{}'::text[] end) name
 ) x;
 -- Native submit may claim an owner/assignee email notice behind destination flags.
 -- Contact resolution reads/writes the destination's contact and audited business record.
 return jsonb_build_object('recordsRead',jsonb_build_array('application.records','internal_tool.notices')||case when p_definition->'fields' @> '[{"type":"contact"}]' then jsonb_build_array('business.contacts','business.record') else '[]'::jsonb end||case when p_definition->'fields' @> '[{"type":"assigned_person"}]' then jsonb_build_array('business.people') else '[]'::jsonb end,
 'recordsWritten',jsonb_build_array('application.records','internal_tool.notices')||case when p_definition->'fields' @> '[{"type":"contact"}]' then jsonb_build_array('business.contacts','business.record','business.record.history') else '[]'::jsonb end,
 'businessRecordFields',business_fields||jsonb_build_array('owner_recipient.email','owner_recipient.name','tenant.owner_email'),'outsideEffects',jsonb_build_array('email'),'bindingKinds',to_jsonb(p_bindings),'dataLeavingBusiness',jsonb_build_array('tool name, record title, missing-item label and sign-in link to owner or assigned staff email'));
end $$;
create function public.system_package_assert_declaration(p_definition jsonb,p_declaration jsonb,p_bindings text[]) returns void
language plpgsql immutable set search_path=public,pg_temp as $$
declare actual jsonb; k text; value jsonb;
begin
 actual:=public.system_package_behavior(p_definition,p_bindings);
 if p_declaration is null or jsonb_typeof(p_declaration) is distinct from 'object' or (p_declaration-array['recordsRead','recordsWritten','businessRecordFields','outsideEffects','bindingKinds','dataLeavingBusiness'])<>'{}'::jsonb then raise exception 'system_package_declaration_required'; end if;
 for k in select jsonb_object_keys(actual) loop
  if jsonb_typeof(p_declaration->k) is distinct from 'array' or jsonb_array_length(p_declaration->k)>100 then raise exception 'system_package_declaration_invalid'; end if;
  for value in select jsonb_array_elements(actual->k) loop
   if not (p_declaration->k @> jsonb_build_array(value)) then raise exception 'system_package_declaration_exceeded'; end if;
  end loop;
 end loop;
end $$;
create function public.system_revision_is_qualified(p_revision_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.system_revision_qualifications q join public.system_revision_reviewers r on r.user_id=q.reviewer_id and r.active and r.policy_version=q.reviewer_policy_version
 where q.revision_id=p_revision_id and q.human_state='approved' and jsonb_array_length(q.evidence)=4
 and (select count(distinct e->>'check') from jsonb_array_elements(q.evidence) e where e->>'check' in ('shareable_definition','declaration_match','rehearsal','prior_revision_compare'))=4
 and not exists(select 1 from jsonb_array_elements(q.evidence) e where e->>'revisionId' is distinct from p_revision_id::text or e->>'status' is distinct from 'passed'));
$$;
create function public.system_revision_qualification_json(p_revision_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('revisionId',q.revision_id,'status',case when public.system_revision_is_qualified(q.revision_id) then 'qualified' when q.human_state='rejected' then 'rejected' else 'pending' end,'evidence',q.evidence,
 'humanReview',jsonb_build_object('state',q.human_state,'reviewerId',q.reviewer_id,'reviewedAt',case when q.reviewed_at is null then null else public.system_version_ts(q.reviewed_at) end,'note',q.review_note)) from public.system_revision_qualifications q where q.revision_id=p_revision_id;
$$;
create function public.system_package_identity_guard() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and (new.creator_workspace_id is distinct from old.creator_workspace_id or (tg_table_name='system_versions' and to_jsonb(new)->'installed_source_revision_id' is distinct from to_jsonb(old)->'installed_source_revision_id')) then raise exception 'system_version_identity_immutable'; end if;
 if tg_op='INSERT' then
  if tg_table_name='system_version_sources' then new.creator_workspace_id:=new.business_workspace_id;
  elsif tg_table_name='system_version_source_revisions' then select creator_workspace_id into new.creator_workspace_id from public.system_version_sources where system_id=new.source_system_id;
  elsif tg_table_name='system_versions' then select creator_workspace_id into new.creator_workspace_id from public.system_version_sources where system_id=new.source_system_id; new.installed_source_revision_id:=new.baseline_revision_id;
  end if;
 end if;
 return new;
end $$;
create trigger package_source_identity before insert or update on public.system_version_sources for each row execute function public.system_package_identity_guard();
create trigger package_revision_identity before insert on public.system_version_source_revisions for each row execute function public.system_package_identity_guard();
create trigger package_version_identity before insert or update on public.system_versions for each row execute function public.system_package_identity_guard();

create or replace function public.system_version_source_json(src public.system_version_sources, p_user_id uuid, p_verified_email text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare mine uuid[]; full_view boolean;
begin
  mine := public.system_version_actor_workspaces(p_user_id, p_verified_email);
  full_view := src.business_workspace_id = any(mine);
  return jsonb_build_object(
    'source', jsonb_build_object('businessId', src.business_workspace_id, 'systemId', src.system_id),
    'hidden', src.hidden, 'creatorWorkspaceId', src.creator_workspace_id,'listingState',src.listing_state,
    'availableTo',case when src.listing_state='listed' then to_jsonb(mine) when src.listing_state='clients' then coalesce((select jsonb_agg(distinct d.customer_workspace_id) from public.workspace_delegations d where d.agency_workspace_id=src.creator_workspace_id and d.status='active' and d.customer_workspace_id=any(mine)), '[]'::jsonb) else '[]'::jsonb end,
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
    'summary', r.summary, 'definition', r.definition, 'creatorWorkspaceId',r.creator_workspace_id, 'qualification', public.system_revision_qualification_json(r.id),
    'requires', jsonb_build_object('bindingKinds', to_jsonb(r.requires_binding_kinds)),
    'publishedBy', r.published_by, 'publishedAt', public.system_version_ts(r.published_at))
    || case when r.declaration is null then '{}'::jsonb else jsonb_build_object('declaration',r.declaration) end
    || case when r.label is null then '{}'::jsonb else jsonb_build_object('label', r.label) end
$$;
create or replace function public.system_version_json(v public.system_versions, p_access text, p_user_id uuid, p_verified_email text)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare full_view boolean := p_access = 'full'; mine uuid[];
begin
  if not full_view then mine := public.system_version_actor_workspaces(p_user_id, p_verified_email); end if;
  return jsonb_build_object(
    'id', v.id, 'creatorWorkspaceId',v.creator_workspace_id,'sourceRevisionId',v.installed_source_revision_id,
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
  if not found or not (src.business_workspace_id = business or (src.listing_state='listed' and public.system_version_source_visible(src.system_id,p_user_id,p_verified_email)) or (src.listing_state='clients' and exists(select 1 from public.workspace_delegations d where d.agency_workspace_id=src.creator_workspace_id and d.customer_workspace_id=business and d.status='active')) or exists (select 1 from public.system_version_source_shares s
      where s.source_system_id = src.system_id and s.grantee_workspace_id = business and s.revoked_at is null)) then
    raise exception 'business_record_access_denied';
  end if;
  select * into r from public.system_version_source_revisions
    where source_system_id = src.system_id and number = (p_lineage->'baseline'->>'revision')::integer;
  if not found or r.definition <> p_lineage->'baseline'->'definition' then raise exception 'system_version_input_invalid'; end if;
  if src.business_workspace_id<>business and not public.system_revision_is_qualified(r.id) then raise exception 'system_revision_not_qualified'; end if;
  insert into public.system_versions(id, version_system_id, business_workspace_id, source_system_id, source_workspace_id,
      context_kind, context_label, baseline_revision_id, baseline_revision, baseline_definition, created_by, created_at, updated_at)
    values ((p_lineage->>'id')::uuid, v_system, business, src.system_id, src.business_workspace_id,
      p_lineage->'context'->>'kind', p_lineage->'context'->>'label', r.id, r.number, r.definition, p_user_id,
      (p_lineage->>'createdAt')::timestamptz, (p_lineage->>'updatedAt')::timestamptz)
    returning * into v;
  return public.system_version_json(v, 'full', p_user_id, p_verified_email);
end;
$$;

create function public.system_package_rehearsal(p_definition jsonb) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare spec jsonb; f jsonb; values_json jsonb:='{}'::jsonb; v jsonb; rejected boolean:=false; item jsonb; receipts jsonb:='[]'::jsonb;
begin
 if p_definition->>'kind'='bundle' then
  for item in select value from jsonb_array_elements(p_definition->'systems') loop receipts:=receipts||jsonb_build_array(public.system_package_rehearsal(item->'definition')); end loop;
  return jsonb_build_object('adapter','native_application_validators','parts',receipts,'isolated',true);
 end if;
 spec:=(p_definition-'kind')||jsonb_build_object('maintenanceOwner','package-rehearsal');
 perform public.validate_application_spec(spec);
 for f in select value from jsonb_array_elements(spec->'fields') loop
  v:=case f->>'type' when 'number' then '1'::jsonb when 'boolean' then 'true'::jsonb when 'date' then '"2026-10-07"'::jsonb when 'select' then f->'options'->0 when 'contact' then '"aaaaaaaa-0000-4000-8000-000000000001"'::jsonb when 'assigned_person' then '"aaaaaaaa-0000-4000-8000-000000000001"'::jsonb else '"Synthetic rehearsal"'::jsonb end;
  values_json:=values_json||jsonb_build_object(f->>'id',v);
 end loop;
 perform public.validate_application_record(spec,'synthetic',values_json);
 begin perform public.validate_application_record(spec,'invalid',jsonb_build_object('unknown_rehearsal_field','Rejected')); exception when others then rejected:=true; end;
 if not rejected then raise exception 'system_package_rehearsal_failed'; end if;
 rejected:=false;
 begin perform public.validate_application_spec(spec||jsonb_build_object('script','alert(1)')); exception when others then rejected:=true; end;
 if not rejected then raise exception 'system_package_rehearsal_failed'; end if;
 return jsonb_build_object('adapter','native_application_validators','checks',jsonb_build_array('synthetic record accepted','undeclared field rejected','executable rejected'),'isolated',true,'providerEffects',false);
end $$;
create function public.record_system_revision_qualification(p_user_id uuid,p_verified_email text,p_revision_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare revision public.system_version_source_revisions; source public.system_version_sources; evidence jsonb:='[]'::jsonb; k text; passed boolean; note text; previous public.system_version_source_revisions; receipt jsonb;
begin
 select * into revision from public.system_version_source_revisions where id=p_revision_id;
 if not found then raise exception 'business_record_access_denied'; end if;
 select * into source from public.system_version_sources where system_id=revision.source_system_id;
 perform public.system_version_assert_source_manager(source.business_workspace_id,p_user_id,p_verified_email);
 select * into previous from public.system_version_source_revisions where source_system_id=source.system_id and number<revision.number order by number desc limit 1;
 foreach k in array array['shareable_definition','declaration_match','rehearsal','prior_revision_compare'] loop
  passed:=true; note:='Passed';
  begin
   if k='shareable_definition' then perform public.agency_package_assert_shareable(revision.definition);
   elsif k='declaration_match' then perform public.system_package_assert_declaration(revision.definition,revision.declaration,revision.requires_binding_kinds);
   elsif k='rehearsal' then receipt:=public.system_package_rehearsal(revision.definition); note:=receipt::text;
   else note:=jsonb_build_object('priorRevision',previous.number,'changed',previous.definition is distinct from revision.definition,'behaviorEquivalence','not inferred')::text;
   end if;
  exception when others then passed:=false; note:=sqlerrm; end;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('revisionId',revision.id,'check',k,'status',case when passed then 'passed' else 'failed' end,'note',note));
 end loop;
 insert into public.system_revision_qualifications(revision_id,evidence) values(revision.id,evidence)
  on conflict(revision_id) do nothing;
 return public.system_revision_qualification_json(revision.id);
end $$;
create function public.review_system_revision_qualification(p_user_id uuid,p_verified_email text,p_revision_id uuid,p_approve boolean,p_note text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare reviewer public.system_revision_reviewers; q public.system_revision_qualifications; author uuid;
begin
 perform 1 from public.users where id=p_user_id and lower(email)=lower(btrim(p_verified_email)) and verified_at is not null;
 if not found then raise exception 'business_record_access_denied'; end if;
 select * into reviewer from public.system_revision_reviewers where user_id=p_user_id and active for share;
 if not found then raise exception 'system_revision_reviewer_policy_required'; end if;
 if char_length(btrim(coalesce(p_note,''))) not between 1 and 1000 or p_approve is null then raise exception 'system_package_input_invalid'; end if;
 select * into q from public.system_revision_qualifications where revision_id=p_revision_id for update;
 if not found then raise exception 'system_revision_checks_required'; end if;
 if q.human_state<>'pending' then
  if q.reviewer_id=p_user_id and q.human_state=(case when p_approve then 'approved' else 'rejected' end) and q.review_note=p_note then return public.system_revision_qualification_json(p_revision_id); end if;
  raise exception 'system_version_history_immutable';
 end if;
 if p_approve and exists(select 1 from jsonb_array_elements(q.evidence) e where e->>'status'<>'passed' or e->>'revisionId'<>p_revision_id::text) then raise exception 'system_revision_checks_failed'; end if;
 update public.system_revision_qualifications set human_state=case when p_approve then 'approved' else 'rejected' end,reviewer_id=p_user_id,reviewer_policy_version=reviewer.policy_version,reviewed_at=clock_timestamp(),review_note=p_note where revision_id=p_revision_id;
 return public.system_revision_qualification_json(p_revision_id);
end $$;

create or replace function public.system_version_source_visible(p_source_system_id uuid,p_user_id uuid,p_verified_email text) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare src public.system_version_sources; mine uuid[];
begin
 select * into src from public.system_version_sources where system_id=p_source_system_id;
 if not found then return false; end if;
 mine:=public.system_version_actor_workspaces(p_user_id,p_verified_email);
 return src.business_workspace_id=any(mine) or (src.listing_state='listed' and cardinality(mine)>0) or
 (src.listing_state='clients' and exists(select 1 from public.workspace_delegations d where d.agency_workspace_id=src.creator_workspace_id and d.status='active' and d.customer_workspace_id=any(mine))) or
 exists(select 1 from public.system_version_source_shares s where s.source_system_id=src.system_id and s.revoked_at is null and s.grantee_workspace_id=any(mine));
end $$;
create function public.set_system_package_listing(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_system_id uuid,p_state text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare src public.system_version_sources; revision public.system_version_source_revisions;
begin
 perform public.system_version_assert_source_manager(p_workspace_id,p_user_id,p_verified_email);
 if p_state is null or p_state not in ('private','clients','listed') then raise exception 'system_package_input_invalid'; end if;
 select * into src from public.system_version_sources where system_id=p_system_id and business_workspace_id=p_workspace_id for update;
 if not found then raise exception 'business_record_access_denied'; end if;
 if p_state='listed' then
  if not exists(select 1 from public.workspaces where id=src.creator_workspace_id and kind='agency') then raise exception 'system_package_creator_agency_required'; end if;
  select * into revision from public.system_version_source_revisions where source_system_id=src.system_id order by number desc limit 1;
  if not found or not public.system_revision_is_qualified(revision.id) then raise exception 'system_revision_not_qualified'; end if;
 end if;
 update public.system_version_sources set listing_state=p_state where system_id=src.system_id returning * into src;
 return public.system_version_source_json(src,p_user_id,p_verified_email);
end $$;
create function public.read_system_package_listings(p_workspace_id uuid,p_user_id uuid,p_verified_email text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare scope record;
begin
 scope:=public.system_actor_scope(p_workspace_id,p_user_id,p_verified_email,false);
 return coalesce((select jsonb_agg(jsonb_build_object('source',public.system_version_source_json(s,p_user_id,p_verified_email),'name',sys.name,'creatorName',creator.name,'revision',public.system_version_revision_json(r,s.business_workspace_id)) order by lower(sys.name),s.system_id)
 from public.system_version_sources s join public.systems sys on sys.id=s.system_id join public.workspaces creator on creator.id=s.creator_workspace_id
 join lateral(select * from public.system_version_source_revisions x where x.source_system_id=s.system_id and public.system_revision_is_qualified(x.id) order by x.number desc limit 1) r on true
 where s.listing_state='listed' or (s.listing_state='clients' and exists(select 1 from public.workspace_delegations d where d.agency_workspace_id=s.creator_workspace_id and d.customer_workspace_id=p_workspace_id and d.status='active'))),'[]'::jsonb);
end $$;
-- Native release/upgrade checks sit in front of the existing transaction and approval gate.
alter function public.save_system_version(uuid,text,uuid,bigint,jsonb) rename to save_system_version_package_core;
revoke all on function public.save_system_version_package_core(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated,service_role;
create function public.save_system_version(p_user_id uuid,p_verified_email text,p_version_id uuid,p_expected_row_revision bigint,p_lineage jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.system_versions; r public.system_version_source_revisions; released boolean; result jsonb;
begin
 select * into v from public.system_versions where id=p_version_id for update;
 if not found then raise exception 'system_not_found'; end if;
 select * into r from public.system_version_source_revisions where source_system_id=v.source_system_id and number=(p_lineage->'baseline'->>'revision')::integer;
 if not found then raise exception 'system_version_input_invalid'; end if;
 released:=jsonb_array_length(p_lineage->'releases')>(select count(*) from public.system_version_releases where version_id=v.id);
 if (r.number<>v.baseline_revision or released) and not public.system_revision_is_qualified(r.id) then raise exception 'system_revision_not_qualified'; end if;
 if released then perform public.system_package_assert_declaration(p_lineage->'releases'->-1->'definition',r.declaration,r.requires_binding_kinds); end if;
 if p_lineage->>'creatorWorkspaceId' is not null and (p_lineage->>'creatorWorkspaceId')::uuid<>v.creator_workspace_id or p_lineage->>'sourceRevisionId' is not null and (p_lineage->>'sourceRevisionId')::uuid<>v.installed_source_revision_id then raise exception 'system_version_identity_immutable'; end if;
 -- The native core compares stored JSON and retains both owner approval and CAS.
 result:=public.save_system_version_package_core(p_user_id,p_verified_email,p_version_id,p_expected_row_revision,p_lineage);
 return result;
end $$;
revoke all on function public.system_package_behavior(jsonb,text[]),public.system_package_assert_declaration(jsonb,jsonb,text[]),public.system_package_rehearsal(jsonb),public.system_package_identity_guard(),public.system_revision_is_qualified(uuid),public.system_revision_qualification_json(uuid) from public,anon,authenticated,service_role;
revoke all on function public.record_system_revision_qualification(uuid,text,uuid),public.review_system_revision_qualification(uuid,text,uuid,boolean,text),public.set_system_package_listing(uuid,uuid,text,uuid,text),public.read_system_package_listings(uuid,uuid,text),public.save_system_version(uuid,text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.record_system_revision_qualification(uuid,text,uuid),public.review_system_revision_qualification(uuid,text,uuid,boolean,text),public.set_system_package_listing(uuid,uuid,text,uuid,text),public.read_system_package_listings(uuid,uuid,text),public.save_system_version(uuid,text,uuid,bigint,jsonb) to service_role;
commit;
