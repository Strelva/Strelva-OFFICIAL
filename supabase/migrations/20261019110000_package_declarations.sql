-- #326: immutable package declarations bound native behavior at publication and release.
-- Additive only: existing revisions are retained and must be republished/adopted
-- before another release if they do not carry a supported declaration.
begin;
set local lock_timeout = '2s';

-- Keep source shape protection in parity with the application shareability gate.
create or replace function public.agency_package_assert_shareable(p_value jsonb) returns void
language plpgsql set search_path=public,pg_temp as $$
declare entry record; child jsonb;
begin
  if jsonb_typeof(p_value)='object' then
    for entry in select key,value from jsonb_each(p_value) loop
      if entry.key=any(array['__proto__','constructor','prototype','accessToken','apiKey','bindings','connections','credentials','customerRecords',
        'grant','grants','oauth','password','records','refreshToken','secret','secrets','token']) then
        raise exception 'system_version_input_invalid';
      end if;
      perform public.agency_package_assert_shareable(entry.value);
    end loop;
  elsif jsonb_typeof(p_value)='array' then
    for child in select value from jsonb_array_elements(p_value) loop
      perform public.agency_package_assert_shareable(child);
    end loop;
  elsif jsonb_typeof(p_value)='string' and (p_value #>> '{}') ~*
    '(-----BEGIN [^-]+ KEY-----|\m(sk|pk|ghp|xox[baprs])-[-_A-Za-z0-9]+|\m(api[_-]?key|secret|password|token|authorization)[[:space:]]*[:=])' then
    raise exception 'system_version_input_invalid';
  end if;
end;
$$;


create or replace function public.system_version_declaration_strings(p_value jsonb, p_allowed text[] default null)
returns boolean language plpgsql immutable set search_path=public,pg_temp as $$
declare item jsonb; value text; seen text[] := '{}';
begin
  if jsonb_typeof(p_value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(p_value)>200 then return false; end if;
  for item in select x from jsonb_array_elements(p_value) x loop
    if jsonb_typeof(item) is distinct from 'string' then return false; end if;
    value:=item #>> '{}';
    if char_length(value) not between 1 and 160
      or value !~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'
      or value=any(seen) or (p_allowed is not null and not value=any(p_allowed)) then return false; end if;
    seen:=array_append(seen,value);
  end loop;
  return true;
end $$;

create or replace function public.system_version_assert_declaration(p_declaration jsonb,p_requires text[])
returns void language plpgsql immutable set search_path=public,pg_temp as $$
declare edge jsonb; destinations text[] := '{}';
begin
  if jsonb_typeof(p_declaration) is distinct from 'object' then raise exception 'system_version_declaration_invalid'; end if;
  if (p_declaration-array['schemaVersion','recordsRead','recordsWritten','businessFields','outsideEffects','bindingKinds','dataEgress'])<>'{}'::jsonb
    or p_declaration->'schemaVersion' is distinct from '1'::jsonb
    or not public.system_version_declaration_strings(p_declaration->'recordsRead',array['application_records','business_owner','business_contacts','business_people'])
    or not public.system_version_declaration_strings(p_declaration->'recordsWritten',array['application_records','business_owner','business_contacts','business_people'])
    or not public.system_version_declaration_strings(p_declaration->'outsideEffects',array['email','publish','google','payment'])
    or not public.system_version_declaration_strings(p_declaration->'bindingKinds')
    or jsonb_typeof(p_declaration->'businessFields') is distinct from 'object'
    or jsonb_typeof(p_declaration->'dataEgress') is distinct from 'array' then raise exception 'system_version_declaration_invalid'; end if;
  if ((p_declaration->'businessFields')-array['read','written'])<>'{}'::jsonb
    or not public.system_version_declaration_strings(p_declaration->'businessFields'->'read')
    or not public.system_version_declaration_strings(p_declaration->'businessFields'->'written')
    or jsonb_array_length(p_declaration->'dataEgress')>200
    or not public.system_version_declaration_strings(to_jsonb(p_requires)) then raise exception 'system_version_declaration_invalid'; end if;
  if array(select jsonb_array_elements_text(p_declaration->'bindingKinds') order by 1)
    is distinct from array(select unnest(p_requires) order by 1) then raise exception 'system_version_declaration_invalid'; end if;
  for edge in select x from jsonb_array_elements(p_declaration->'dataEgress') x loop
    if jsonb_typeof(edge) is distinct from 'object' then raise exception 'system_version_declaration_invalid'; end if;
    if (edge-array['destination','fields'])<>'{}'::jsonb
      or jsonb_typeof(edge->'destination') is distinct from 'string'
      or not coalesce(edge->>'destination'=any(array['email_provider','business_owner_email','assigned_person_email','shared_application_view']),false)
      or edge->>'destination'=any(destinations)
      or not public.system_version_declaration_strings(edge->'fields') then raise exception 'system_version_declaration_invalid'; end if;
    destinations:=array_append(destinations,edge->>'destination');
  end loop;
end $$;

create or replace function public.system_version_declaration_list(p_values text[])
returns jsonb language sql immutable set search_path=public,pg_temp as $$
  select to_jsonb(array(select distinct x collate "C" from unnest(p_values) x order by 1));
$$;

-- Analyze the closed native executable schema. Declared capabilities never
-- stand in for inspection; future kinds/keys need an explicit interpreter.
create or replace function public.system_version_native_behavior(p_definition jsonb)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare field jsonb; component jsonb; field_id text; referenced text[] := '{}'; assigned boolean := false;
  reads text[] := array['application_records','business_owner']; writes text[] := array['application_records'];
  read_fields text[] := array['application_records.id','business_owner.email','business_owner.name'];
  written_fields text[] := array['application_records.id'];
  email_fields text[] := array['application_records.id','application.title','application.work_id','business.workspace_id','business_owner.email'];
  shared_fields text[] := array['application_records.id','application_records.revision','application.title','application.work_id','application.release_version','business.workspace_id'];
  egress jsonb;
begin
  if jsonb_typeof(p_definition) is distinct from 'object' then raise exception 'system_version_declaration_invalid'; end if;
  if p_definition->>'kind' is distinct from 'internal_app'
    or (p_definition-array['kind','title','fields','components','declaration'])<>'{}'::jsonb
    or jsonb_typeof(p_definition->'fields') is distinct from 'array'
    or jsonb_typeof(p_definition->'components') is distinct from 'array' then raise exception 'system_version_declaration_invalid'; end if;
  -- validate_application_spec predates declarations. Close its NULL-sensitive
  -- kind/type checks before using all of its structural/reference checks.
  for field in select x from jsonb_array_elements(p_definition->'fields') x loop
    if jsonb_typeof(field) is distinct from 'object'
      or jsonb_typeof(field->'type') is distinct from 'string'
      or not coalesce(field->>'type'=any(array['text','number','boolean','date','select','contact','assigned_person']),false)
      then raise exception 'system_version_declaration_invalid'; end if;
  end loop;
  for component in select x from jsonb_array_elements(p_definition->'components') x loop
    if jsonb_typeof(component) is distinct from 'object'
      or jsonb_typeof(component->'kind') is distinct from 'string'
      or not coalesce(component->>'kind'=any(array['form','list','detail','document']),false)
      then raise exception 'system_version_declaration_invalid'; end if;
  end loop;
  begin
    perform public.validate_application_spec((p_definition-array['kind','declaration'])||jsonb_build_object('maintenanceOwner','package_declaration'));
  exception when others then raise exception 'system_version_declaration_invalid'; end;
  for component in select x from jsonb_array_elements(p_definition->'components') x loop
    referenced:=referenced||array(select jsonb_array_elements_text(component->'fields'));
  end loop;
  for field in select x from jsonb_array_elements(p_definition->'fields') x loop
    field_id:=field->>'id';
    read_fields:=array_append(read_fields,'application_records.values.'||field_id);
    written_fields:=array_append(written_fields,'application_records.values.'||field_id);
    if field->>'type'='text' then email_fields:=array_append(email_fields,'application_records.values.'||field_id); end if;
    if field->'required'='false'::jsonb and field->>'type'<>'assigned_person' then
      email_fields:=array_append(email_fields,'application.labels.'||field_id);
    end if;
    if field_id=any(referenced) then
      shared_fields:=shared_fields||array['application_records.values.'||field_id,'application.labels.'||field_id];
      if field->>'type'='select' then shared_fields:=array_append(shared_fields,'application.options.'||field_id); end if;
    end if;
    if field->>'type'='contact' then
      reads:=array_append(reads,'business_contacts'); writes:=array_append(writes,'business_contacts');
      read_fields:=read_fields||array['business_contacts.id','business_contacts.name','business_contacts.email','business_contacts.phone','business_contacts.phone_key'];
      written_fields:=written_fields||array['business_contacts.name','business_contacts.email','business_contacts.phone','business_contacts.source'];
      if field_id=any(referenced) then shared_fields:=shared_fields||array['business_contacts.name','business_contacts.email','business_contacts.phone']; end if;
    elsif field->>'type'='assigned_person' then
      assigned:=true; reads:=array_append(reads,'business_people');
      read_fields:=read_fields||array['business_people.id','business_people.name','business_people.email','business_people.active'];
      email_fields:=email_fields||array['business_people.name','business_people.email'];
      if field_id=any(referenced) then shared_fields:=shared_fields||array['business_people.name','business_people.email']; end if;
    end if;
  end loop;
  egress:=jsonb_build_array(
    jsonb_build_object('destination','business_owner_email','fields',public.system_version_declaration_list(email_fields)),
    jsonb_build_object('destination','email_provider','fields',public.system_version_declaration_list(email_fields)),
    jsonb_build_object('destination','shared_application_view','fields',public.system_version_declaration_list(shared_fields)));
  if assigned then egress:=jsonb_build_array(jsonb_build_object('destination','assigned_person_email','fields',public.system_version_declaration_list(email_fields)))||egress; end if;
  return jsonb_build_object('schemaVersion',1,'recordsRead',public.system_version_declaration_list(reads),
    'recordsWritten',public.system_version_declaration_list(writes),
    'businessFields',jsonb_build_object('read',public.system_version_declaration_list(read_fields),'written',public.system_version_declaration_list(written_fields)),
    'outsideEffects',jsonb_build_array('email'),'bindingKinds','[]'::jsonb,'dataEgress',egress);
end $$;

create or replace function public.system_version_assert_native_declaration(p_definition jsonb,p_declaration jsonb,p_requires text[])
returns void language plpgsql immutable set search_path=public,pg_temp as $$
declare actual jsonb; edge jsonb; permitted jsonb;
begin
  begin
    perform public.agency_package_assert_shareable(p_definition);
  exception when others then raise exception 'system_version_declaration_invalid'; end;
  perform public.system_version_assert_declaration(p_declaration,p_requires);
  actual:=public.system_version_native_behavior(p_definition);
  if not ((actual->'recordsRead') <@ (p_declaration->'recordsRead'))
    or not ((actual->'recordsWritten') <@ (p_declaration->'recordsWritten'))
    or not ((actual->'businessFields'->'read') <@ (p_declaration->'businessFields'->'read'))
    or not ((actual->'businessFields'->'written') <@ (p_declaration->'businessFields'->'written'))
    or not ((actual->'outsideEffects') <@ (p_declaration->'outsideEffects'))
    or not ((actual->'bindingKinds') <@ (p_declaration->'bindingKinds')) then raise exception 'system_version_declaration_invalid'; end if;
  for edge in select x from jsonb_array_elements(actual->'dataEgress') x loop
    select x into permitted from jsonb_array_elements(p_declaration->'dataEgress') x where x->>'destination'=edge->>'destination';
    if permitted is null or not ((edge->'fields') <@ (permitted->'fields')) then raise exception 'system_version_declaration_invalid'; end if;
  end loop;
end $$;

-- Covers direct source-publication SQL as well as durable agency commands.
-- Historical untyped/non-native definitions stay readable and can still be
-- drafted, but the release boundary below never executes them.
create or replace function public.system_version_source_declaration_guard() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  begin
    perform public.agency_package_assert_shareable(new.definition);
  exception when others then raise exception 'system_version_declaration_invalid'; end;
  if new.definition->>'kind'='internal_app' or new.definition ? 'declaration' then
    perform public.system_version_assert_native_declaration(new.definition,new.definition->'declaration',new.requires_binding_kinds);
  end if;
  return new;
end $$;
create or replace trigger system_version_source_declaration_guard before insert on public.system_version_source_revisions
  for each row execute function public.system_version_source_declaration_guard();

-- Check the caller's requires shape before SQL could coerce it into text.
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
  if p_revision->'definition'->>'kind'='internal_app' or p_revision->'definition' ? 'declaration' then
    if not public.system_version_declaration_strings(p_revision->'requires'->'bindingKinds') then
      raise exception 'system_version_declaration_invalid';
    end if;
    perform public.system_version_assert_native_declaration(p_revision->'definition',p_revision->'definition'->'declaration',
      array(select jsonb_array_elements_text(p_revision->'requires'->'bindingKinds')));
  end if;
  insert into public.system_version_source_revisions(id, source_system_id, number, label, summary, definition,
      requires_binding_kinds, published_by, published_at)
    values ((p_revision->'source'->>'revisionId')::uuid, src.system_id, n + 1, p_revision->>'label', p_revision->>'summary',
      p_revision->'definition', array(select jsonb_array_elements_text(p_revision->'requires'->'bindingKinds')),
      p_user_id, (p_revision->>'publishedAt')::timestamptz)
    returning * into r;
  return public.system_version_revision_json(r, src.business_workspace_id);
end;
$$;


-- Keep native creation identity/CAS/actor checks; declaration metadata is not executable spec.
create or replace function public.create_version_system_command(
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
    or (source_revision.definition-array['kind','title','fields','components','declaration'])<>'{}'::jsonb then raise exception 'system_version_input_invalid'; end if;
  perform public.validate_application_spec(p_native_payload->'spec');
  if p_native_payload->'spec' is distinct from (source_revision.definition-array['kind','declaration'])||jsonb_build_object('maintenanceOwner',p_user_id)
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


-- Keep the owner decision, stored effective-definition, history and CAS checks.
create or replace function public.save_system_version(p_user_id uuid,p_verified_email text,p_version_id uuid,p_expected_row_revision bigint,p_lineage jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare before_version public.system_versions; native public.system_version_native_applications; state public.application_states;
  native_system public.systems; source_revision public.system_version_source_revisions;
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
    -- Declaration authority comes only from the immutable adopted revision.
    -- Neither a local override nor the release payload can enlarge it.
    select * into source_revision from public.system_version_source_revisions
      where id=before_version.baseline_revision_id and source_system_id=before_version.source_system_id
        and number=before_version.baseline_revision;
    if not found or definition->'declaration' is distinct from source_revision.definition->'declaration' then
      raise exception 'system_version_declaration_invalid';
    end if;
    perform public.system_version_assert_native_declaration(definition,source_revision.definition->'declaration',source_revision.requires_binding_kinds);
    if exists (select 1 from unnest(source_revision.requires_binding_kinds) required(kind)
      where not exists (select 1 from public.system_version_bindings b where b.version_id=p_version_id
        and b.kind=required.kind and b.released_at is null and b.owner_workspace_id=before_version.business_workspace_id
        and public.system_version_connection_owner(b.connection_ref)=before_version.business_workspace_id)) then
      raise exception 'system_version_declaration_invalid';
    end if;

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
      spec:=(definition-array['kind','declaration'])||jsonb_build_object('maintenanceOwner',state.candidate_spec->>'maintenanceOwner');
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

-- Ordinary application publication is another callable SQL surface. A native
-- Version may publish only the matching immutable Version release already
-- accepted by the checked wrapper, never a free-standing candidate or an old
-- runtime pointer. Non-Version applications retain their existing behavior.
create or replace function public.system_version_native_release_declaration_guard() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare version public.system_versions; source_revision public.system_version_source_revisions; accepted public.system_version_releases;
begin
  select v.* into version from public.system_versions v join public.system_version_native_applications n on n.version_id=v.id
    where n.work_id=new.work_id and n.business_workspace_id=new.workspace_id;
  if not found then return new; end if;
  select * into source_revision from public.system_version_source_revisions where id=version.baseline_revision_id
    and source_system_id=version.source_system_id and number=version.baseline_revision;
  if not found then raise exception 'system_version_declaration_invalid'; end if;
  perform public.system_version_assert_native_declaration((new.spec-'maintenanceOwner')||jsonb_build_object('kind','internal_app'),
    source_revision.definition->'declaration',source_revision.requires_binding_kinds);
  select * into accepted from public.system_version_releases where version_id=version.id and number=new.version;
  if not found or version.current_release is distinct from new.version
    or (accepted.definition-array['kind','declaration']) is distinct from (new.spec-'maintenanceOwner')
    or accepted.baseline_revision is distinct from version.baseline_revision then raise exception 'system_version_declaration_invalid'; end if;
  return new;
end $$;
create or replace trigger system_version_native_release_declaration_guard before insert on public.application_releases
  for each row execute function public.system_version_native_release_declaration_guard();

create or replace function public.system_version_native_pointer_declaration_guard() returns trigger
language plpgsql set search_path=public,pg_temp as $$
declare version public.system_versions;
begin
  if new.current_release_version is not distinct from old.current_release_version then return new; end if;
  select v.* into version from public.system_versions v join public.system_version_native_applications n on n.version_id=v.id
    where n.work_id=new.work_id and n.business_workspace_id=new.workspace_id;
  if found and new.current_release_version is distinct from version.current_release then
    raise exception 'system_version_declaration_invalid';
  end if;
  return new;
end $$;
create or replace trigger system_version_native_pointer_declaration_guard before update of current_release_version on public.application_states
  for each row execute function public.system_version_native_pointer_declaration_guard();

-- A Version owner must be able to inspect its immutable adopted declaration
-- after the source stops sharing. This reveals only that Version's pin.
create or replace function public.read_system_version_pinned_revision(p_user_id uuid,p_verified_email text,p_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare version public.system_versions; access record; revision public.system_version_source_revisions;
begin
  select * into version from public.system_versions where id=p_version_id;
  if not found then raise exception 'system_not_found'; end if;
  access:=public.system_version_read_access(version,p_user_id,p_verified_email,false);
  if access.access is distinct from 'full' then raise exception 'business_record_access_denied'; end if;
  select * into revision from public.system_version_source_revisions where id=version.baseline_revision_id
    and source_system_id=version.source_system_id and number=version.baseline_revision;
  if not found then raise exception 'system_version_declaration_invalid'; end if;
  return public.system_version_revision_json(revision,version.source_workspace_id);
end $$;
-- Reapplying after the fail-closed rollback restores the original service-only
-- entrypoints after every declaration guard is installed in this transaction.
revoke all on function public.publish_system_version_source_revision(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.publish_system_version_source_revision(uuid,text,jsonb) to service_role;
revoke all on function public.publish_agency_package(uuid,uuid,text,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.publish_agency_package(uuid,uuid,text,uuid,integer,jsonb) to service_role;
revoke all on function public.read_system_version_pinned_revision(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.read_system_version_pinned_revision(uuid,text,uuid) to service_role;

revoke all on function public.agency_package_assert_shareable(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.system_version_declaration_strings(jsonb,text[]) from public,anon,authenticated,service_role;
revoke all on function public.system_version_assert_declaration(jsonb,text[]) from public,anon,authenticated,service_role;
revoke all on function public.system_version_declaration_list(text[]) from public,anon,authenticated,service_role;
revoke all on function public.system_version_native_behavior(jsonb) from public,anon,authenticated,service_role;
revoke all on function public.system_version_assert_native_declaration(jsonb,jsonb,text[]) from public,anon,authenticated,service_role;
revoke all on function public.system_version_source_declaration_guard() from public,anon,authenticated,service_role;
revoke all on function public.system_version_native_release_declaration_guard() from public,anon,authenticated,service_role;
revoke all on function public.system_version_native_pointer_declaration_guard() from public,anon,authenticated,service_role;
commit;
