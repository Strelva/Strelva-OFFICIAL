-- #327 preparation only. Requires #326 / 20261019110000. This ledger cannot
-- represent a human verdict or qualified status. #323 must be decided first.
begin;
set local lock_timeout='2s';

create table if not exists public.system_revision_qualifications (
  id uuid primary key,
  source_revision_id uuid not null,
  source_system_id uuid not null,
  source_workspace_id uuid not null,
  record jsonb not null check (jsonb_typeof(record)='object' and octet_length(record::text)<=131072),
  recorded_at timestamptz not null default clock_timestamp(),
  foreign key (source_revision_id,source_system_id) references public.system_version_source_revisions(id,source_system_id) on delete cascade,
  foreign key (source_system_id,source_workspace_id) references public.system_version_sources(system_id,business_workspace_id) on delete cascade,
  check ((record->'humanReview') is not distinct from '{"status":"pending","reason":"review_policy_pending"}'::jsonb),
  check (coalesce(record->>'automatedStatus' in ('passed','failed'),false))
);
create index if not exists system_revision_qualifications_revision_idx
  on public.system_revision_qualifications(source_revision_id,recorded_at,id);
alter table public.system_revision_qualifications enable row level security;
revoke all on public.system_revision_qualifications from public,anon,authenticated,service_role;

create or replace function public.system_revision_qualification_immutable() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' and (not exists(select 1 from public.system_version_source_revisions where id=old.source_revision_id)
    or not exists(select 1 from public.system_version_sources where system_id=old.source_system_id)) then return old; end if;
  raise exception 'system_revision_qualification_immutable';
end $$;
create or replace trigger system_revision_qualification_immutable
  before update or delete on public.system_revision_qualifications
  for each row execute function public.system_revision_qualification_immutable();

-- Same whole-array/leaf-path comparison rule as system-versions/compare.ts.
-- Values are not retained in evidence, only changed paths.
create or replace function public.system_revision_qualification_paths(p_before jsonb,p_after jsonb)
returns jsonb language sql immutable set search_path=public,pg_temp as $$
  with recursive changes(path,before,after) as (
    select ''::text,p_before,p_after
    union all
    select case when c.path='' then k.key else c.path||'.'||k.key end,c.before->k.key,c.after->k.key
    from changes c cross join lateral (
      select jsonb_object_keys(case when jsonb_typeof(c.before)='object' and jsonb_typeof(c.after)='object' then c.before||c.after else '{}'::jsonb end) key
    ) k where c.before is distinct from c.after
  ) select coalesce(jsonb_agg(path order by path collate "C"),'[]'::jsonb) from changes
    where path<>'' and before is distinct from after and not (coalesce(jsonb_typeof(before),'')='object' and coalesce(jsonb_typeof(after),'')='object')
$$;

-- Server-only writer. Request handlers must call the evaluator, never accept
-- raw evidence. Storage rechecks the actual pinned definition/requirements,
-- source authority, prior revision and independently verifiable pass claims.
create or replace function public.record_system_revision_qualification(
  p_user_id uuid,p_verified_email text,p_revision_id uuid,p_definition jsonb,p_requires text[],p_record jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare revision public.system_version_source_revisions; source public.system_version_sources;
  prior public.system_version_source_revisions; expected_ref jsonb; paths jsonb;
  item jsonb; checks text[]:='{}'; all_passed boolean:=true; shareable boolean:=true; declared boolean:=true;
  check_name text; existing public.system_revision_qualifications; record_id uuid;
begin
  select * into revision from public.system_version_source_revisions where id=p_revision_id;
  if not found then raise exception 'business_record_access_denied'; end if;
  select * into source from public.system_version_sources where system_id=revision.source_system_id;
  -- Automated assessment is limited to a direct source owner/admin. The
  -- inherited helper also recognizes provider seats for normal Version work;
  -- that standing client access must not become evidence-authoring authority.
  perform 1 from public.workspace_memberships m join public.users u on u.id=m.user_id
    where m.workspace_id=source.business_workspace_id and m.user_id=p_user_id and m.role in ('owner','admin')
      and u.verified_at is not null and lower(u.email)=lower(btrim(p_verified_email)) for share of m,u;
  if not found then raise exception 'business_record_access_denied'; end if;
  perform public.system_version_assert_source_manager(source.business_workspace_id,p_user_id,p_verified_email);
  if revision.definition is distinct from p_definition or revision.requires_binding_kinds is distinct from p_requires then
    raise exception 'system_revision_qualification_stale';
  end if;
  expected_ref:=jsonb_build_object('businessId',source.business_workspace_id,'systemId',source.system_id,'revisionId',revision.id,'number',revision.number);
  if jsonb_typeof(p_record) is distinct from 'object' then raise exception 'system_revision_qualification_invalid'; end if;
  if (p_record-array['id','schemaVersion','source','previousRevisionId','comparedPaths','automatedStatus','humanReview','evidence','evaluatedBy','evaluatedAt'])<>'{}'::jsonb
    or not (p_record ?& array['id','schemaVersion','source','previousRevisionId','comparedPaths','automatedStatus','humanReview','evidence','evaluatedBy','evaluatedAt'])
    or p_record->'schemaVersion' is distinct from '1'::jsonb
    or p_record->'source' is distinct from expected_ref
    or p_record->>'evaluatedBy' is distinct from p_user_id::text
    or p_record->'humanReview' is distinct from '{"status":"pending","reason":"review_policy_pending"}'::jsonb
    or not coalesce(p_record->>'automatedStatus' in ('passed','failed'),false)
    or jsonb_typeof(p_record->'evidence') is distinct from 'array'
    or jsonb_typeof(p_record->'comparedPaths') is distinct from 'array'
    or jsonb_typeof(p_record->'evaluatedAt') is distinct from 'string' then raise exception 'system_revision_qualification_invalid'; end if;
  record_id:=(p_record->>'id')::uuid;
  if record_id is null or p_record->>'evaluatedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$'
    or not isfinite((p_record->>'evaluatedAt')::timestamptz) then raise exception 'system_revision_qualification_invalid'; end if;
  if revision.number>1 then
    select * into prior from public.system_version_source_revisions where source_system_id=source.system_id and number=revision.number-1;
    if not found or p_record->>'previousRevisionId' is distinct from prior.id::text then raise exception 'system_revision_qualification_stale'; end if;
    paths:=public.system_revision_qualification_paths(prior.definition,revision.definition);
    if prior.requires_binding_kinds is distinct from revision.requires_binding_kinds then paths:=paths||jsonb_build_array('$requires.bindingKinds'); end if;
  else
    if p_record->'previousRevisionId' is distinct from 'null'::jsonb then raise exception 'system_revision_qualification_stale'; end if;
    paths:='[]'::jsonb;
  end if;
  if p_record->'comparedPaths' is distinct from paths then raise exception 'system_revision_qualification_stale'; end if;
  begin perform public.agency_package_assert_shareable(revision.definition); exception when others then shareable:=false; end;
  begin perform public.system_version_assert_native_declaration(revision.definition,revision.definition->'declaration',revision.requires_binding_kinds);
    exception when others then declared:=false; end;
  if jsonb_array_length(p_record->'evidence')<>4 then raise exception 'system_revision_qualification_invalid'; end if;
  for item in select x from jsonb_array_elements(p_record->'evidence') x loop
    check_name:=item->>'check';
    if jsonb_typeof(item) is distinct from 'object' then raise exception 'system_revision_qualification_invalid'; end if;
    if (item-array['id','source','check','kind','environment','status','reference','checkedAt','summary'])<>'{}'::jsonb
      or not (item ?& array['id','source','check','kind','environment','status','reference','checkedAt','summary'])
      or not coalesce(check_name=any(array['shareable_definition','declaration_match','rehearsal','prior_revision_compare']),false)
      or check_name=any(checks) or item->'source' is distinct from expected_ref
      or item->>'id' is distinct from 'source_revision.'||check_name
      or item->>'kind' is distinct from (case when check_name='rehearsal' then 'integration_test' else 'focused_test' end)
      or item->>'environment' is distinct from 'local'
      or item->'checkedAt' is distinct from p_record->'evaluatedAt'
      or not coalesce(item->>'status' in ('passed','failed'),false)
      or jsonb_typeof(item->'reference') is distinct from 'string' or char_length(item->>'reference') not between 1 and 500
      or jsonb_typeof(item->'summary') is distinct from 'string' or char_length(item->>'summary') not between 1 and 1000 then
      raise exception 'system_revision_qualification_invalid';
    end if;
    checks:=array_append(checks,check_name);
    if check_name='shareable_definition' and (item->>'status'='passed') is distinct from shareable then raise exception 'system_revision_qualification_stale'; end if;
    if check_name='declaration_match' and (item->>'status'='passed') is distinct from declared then raise exception 'system_revision_qualification_stale'; end if;
    if check_name='prior_revision_compare' and item->>'status'<>'passed' then raise exception 'system_revision_qualification_stale'; end if;
    if check_name='rehearsal' and item->>'status'='passed' then
      if not (shareable and declared) then raise exception 'system_revision_qualification_stale'; end if;
      -- Independent native-contract recheck. The TypeScript adapter uses the
      -- native rehearsal with empty synthetic records; no client data claim.
      perform public.validate_application_spec((revision.definition-array['kind','declaration'])||jsonb_build_object('maintenanceOwner','qualification-rehearsal'));
    end if;
    all_passed:=all_passed and item->>'status'='passed';
  end loop;
  if p_record->>'automatedStatus' is distinct from (case when all_passed then 'passed' else 'failed' end) then raise exception 'system_revision_qualification_invalid'; end if;
  insert into public.system_revision_qualifications(id,source_revision_id,source_system_id,source_workspace_id,record)
    values(record_id,revision.id,source.system_id,source.business_workspace_id,p_record) on conflict(id) do nothing;
  select * into existing from public.system_revision_qualifications where id=record_id;
  if existing.record is distinct from p_record or existing.source_revision_id<>revision.id then raise exception 'system_revision_qualification_stale'; end if;
  return existing.record;
end $$;

create or replace function public.read_system_revision_qualifications(p_user_id uuid,p_verified_email text,p_revision_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare revision public.system_version_source_revisions;
begin
  select * into revision from public.system_version_source_revisions where id=p_revision_id;
  if not found or not public.system_version_source_visible(revision.source_system_id,p_user_id,p_verified_email) then raise exception 'business_record_access_denied'; end if;
  return coalesce((select jsonb_agg(record order by recorded_at,id) from public.system_revision_qualifications where source_revision_id=p_revision_id),'[]'::jsonb);
end $$;

revoke all on function public.system_revision_qualification_immutable() from public,anon,authenticated,service_role;
revoke all on function public.system_revision_qualification_paths(jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.record_system_revision_qualification(uuid,text,uuid,jsonb,text[],jsonb) from public,anon,authenticated,service_role;
revoke all on function public.read_system_revision_qualifications(uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.record_system_revision_qualification(uuid,text,uuid,jsonb,text[],jsonb) to service_role;
grant execute on function public.read_system_revision_qualifications(uuid,text,uuid) to service_role;
commit;
