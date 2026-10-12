-- Agency authoring receipts. No live provider effects or notification sends.
begin;
set local lock_timeout = '2s';
create table public.agency_package_commands (
  command_id uuid primary key,
  agency_workspace_id uuid not null references public.workspaces(id),
  source_system_id uuid not null references public.systems(id),
  input_digest text not null,
  command_digest text not null,
  source_revision_id uuid not null references public.system_version_source_revisions(id),
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default clock_timestamp()
);
create table public.system_version_preparations (
  id uuid primary key default gen_random_uuid(),
  business_workspace_id uuid not null references public.workspaces(id),
  version_id uuid not null references public.system_versions(id),
  source_revision integer not null,
  row_revision bigint not null,
  owner_decision_id uuid not null references public.owner_decisions(id),
  prepared_by uuid not null references public.users(id),
  created_at timestamptz not null default clock_timestamp(),
  unique(version_id, source_revision, row_revision)
);
alter table public.agency_package_commands enable row level security;
alter table public.system_version_preparations enable row level security;
revoke all on public.agency_package_commands, public.system_version_preparations from public, anon, authenticated;
create trigger agency_package_commands_immutable before update or delete on public.agency_package_commands
  for each row execute function public.system_version_history_immutable();
create trigger system_version_preparations_immutable before update or delete on public.system_version_preparations
  for each row execute function public.system_version_history_immutable();

-- Creating a new System requires a direct customer admin/owner. An agency
-- relationship, source authorship or delegated read is never a creation grant.
create function public.require_agency_authoring_scope(p_agency_workspace_id uuid, p_workspace_id uuid, p_user_id uuid, p_verified_email text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare providers record; scope record;
begin
  if not exists(select 1 from public.workspaces where id=p_agency_workspace_id and kind='agency')
    or coalesce(public.system_version_member_role(p_agency_workspace_id,p_user_id,p_verified_email),'') not in ('owner','admin') then
    raise exception 'business_record_access_denied';
  end if;
  if p_workspace_id=p_agency_workspace_id then return true; end if;
  providers := public.agency_overview_providers(p_agency_workspace_id);
  if not (p_workspace_id=any(providers.customers)) and not exists(select 1 from public.workspace_delegations
    where agency_workspace_id=p_agency_workspace_id and customer_workspace_id=p_workspace_id and status='active')
    and not exists(select 1 from public.operational_assignments where assignee_workspace_id=p_agency_workspace_id
      and workspace_id=p_workspace_id and assignee_kind='agency' and status='accepted' and expires_at>clock_timestamp()) then
    raise exception 'business_record_access_denied';
  end if;
  scope := public.system_actor_scope(p_workspace_id,p_user_id,p_verified_email,true);
  if coalesce(scope.access,'') not in ('owner','admin') then raise exception 'business_record_access_denied'; end if;
  if public.workspace_exit_completed(p_workspace_id) then raise exception 'workspace_exit_future_work_blocked'; end if;
  return true;
end;
$$;

-- A source carries reusable shape only. Match the TypeScript shareability
-- boundary recursively so nested arrays cannot smuggle business data.
create function public.agency_package_assert_shareable(p_value jsonb) returns void
language plpgsql set search_path=public,pg_temp as $$
declare entry record; child jsonb;
begin
  if jsonb_typeof(p_value)='object' then
    for entry in select key,value from jsonb_each(p_value) loop
      if entry.key=any(array['accessToken','apiKey','bindings','connections','credentials','customerRecords',
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

create function public.agency_package_command_digest(p_workspace_id uuid,p_system_id uuid,p_command_id uuid,
  p_fingerprint text,p_expected_revision integer,p_summary text) returns text
language sql immutable set search_path=public,pg_temp as $$
  select md5(jsonb_build_object('workspace',p_workspace_id,'system',p_system_id,'command',p_command_id,
    'fingerprint',p_fingerprint,'expected',p_expected_revision,'summary',p_summary)::text);
$$;

-- Read accepted command evidence before consulting mutable System state.
-- Current agency authority and the original actor/input are still required.
create function public.read_agency_package_command(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_command_id uuid,
  p_system_id uuid,p_fingerprint text,p_expected_revision integer,p_summary text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.agency_package_commands;
begin
  perform public.require_agency_authoring_scope(p_workspace_id,p_workspace_id,p_user_id,p_verified_email);
  select * into prior from public.agency_package_commands where command_id=p_command_id;
  if not found then return null; end if;
  if prior.agency_workspace_id<>p_workspace_id or prior.source_system_id<>p_system_id or prior.created_by<>p_user_id
    or prior.command_digest<>public.agency_package_command_digest(p_workspace_id,p_system_id,p_command_id,
      p_fingerprint,p_expected_revision,p_summary) then raise exception 'system_version_stale'; end if;
  return public.system_version_revision_json((select r from public.system_version_source_revisions r where id=prior.source_revision_id),p_workspace_id);
end;
$$;

-- Same command returns the same immutable revision after an uncertain reply.
-- Content is still checked by the existing source publication function.
create function public.publish_agency_package(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_command_id uuid,
  p_expected_revision integer,p_revision jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare prior public.agency_package_commands; result jsonb; source_id uuid; digest text; command_digest text; latest integer;
begin
  perform public.require_agency_authoring_scope(p_workspace_id,p_workspace_id,p_user_id,p_verified_email);
  source_id := (p_revision->'source'->>'systemId')::uuid;
  if (p_revision->'source'->>'businessId')::uuid is distinct from p_workspace_id then raise exception 'business_record_access_denied'; end if;
  if p_expected_revision is null or p_expected_revision<0 or p_command_id is null
    or char_length(coalesce(p_revision->>'packageFingerprint','')) not between 1 and 150
    or jsonb_typeof(p_revision->'definition') is distinct from 'object' then raise exception 'system_version_input_invalid'; end if;
  perform public.agency_package_assert_shareable(p_revision->'definition');
  command_digest := public.agency_package_command_digest(p_workspace_id,source_id,p_command_id,
    p_revision->>'packageFingerprint',p_expected_revision,p_revision->>'summary');
  digest := md5(jsonb_build_object('source',source_id,'definition',p_revision->'definition','summary',p_revision->'summary',
    'label',p_revision->'label','requires',p_revision->'requires','expected',p_expected_revision)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_command_id::text,0));
  select * into prior from public.agency_package_commands where command_id=p_command_id;
  if found then
    if prior.agency_workspace_id<>p_workspace_id or prior.source_system_id<>source_id or prior.input_digest<>digest
      or prior.command_digest<>command_digest or prior.created_by<>p_user_id then
      raise exception 'system_version_stale';
    end if;
    return public.system_version_revision_json((select r from public.system_version_source_revisions r where id=prior.source_revision_id),p_workspace_id);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('agency-package:'||source_id::text,0));
  select coalesce(max(number),0) into latest from public.system_version_source_revisions where source_system_id=source_id;
  if latest<>p_expected_revision or (p_revision->'source'->>'number')::integer<>latest+1 then raise exception 'system_version_stale'; end if;
  result := public.publish_system_version_source_revision(p_user_id,p_verified_email,p_revision);
  insert into public.agency_package_commands(command_id,agency_workspace_id,source_system_id,input_digest,command_digest,source_revision_id,created_by)
    values(p_command_id,p_workspace_id,source_id,digest,command_digest,(result->'source'->>'revisionId')::uuid,p_user_id);
  return result;
end;
$$;

create function public.record_version_preparation(p_workspace_id uuid,p_user_id uuid,p_verified_email text,p_version_id uuid,
  p_row_revision bigint,p_owner_decision_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare v public.system_versions; access record; receipt public.system_version_preparations; decision public.owner_decisions;
begin
  select * into v from public.system_versions where id=p_version_id and business_workspace_id=p_workspace_id for share;
  if not found then raise exception 'business_record_access_denied'; end if;
  access := public.system_version_access(v,p_user_id,p_verified_email,true);
  if coalesce(access.access,'')<>'full' or coalesce(access.actor_role,'') not in ('owner','admin','agency') then raise exception 'business_record_access_denied'; end if;
  if v.row_revision<>p_row_revision then raise exception 'system_version_stale'; end if;
  select * into decision from public.owner_decisions where id=p_owner_decision_id and workspace_id=p_workspace_id
    and source_lifecycle='version_release' and source_id=p_version_id::text;
  if not found or decision.system_id is distinct from v.version_system_id then raise exception 'business_record_access_denied'; end if;
  insert into public.system_version_preparations(business_workspace_id,version_id,source_revision,row_revision,owner_decision_id,prepared_by)
    values(p_workspace_id,v.id,v.baseline_revision,v.row_revision,decision.id,p_user_id)
    on conflict(version_id,source_revision,row_revision) do nothing;
  select * into receipt from public.system_version_preparations where version_id=v.id and source_revision=v.baseline_revision and row_revision=v.row_revision;
  return jsonb_build_object('receiptId',receipt.id,'decisionId',receipt.owner_decision_id,'workspaceId',receipt.business_workspace_id,
    'versionId',receipt.version_id,'rowRevision',receipt.row_revision);
end;
$$;
revoke all on function public.require_agency_authoring_scope(uuid,uuid,uuid,text),
 public.agency_package_assert_shareable(jsonb),
 public.agency_package_command_digest(uuid,uuid,uuid,text,integer,text),
 public.read_agency_package_command(uuid,uuid,text,uuid,uuid,text,integer,text),
 public.publish_agency_package(uuid,uuid,text,uuid,integer,jsonb),
 public.record_version_preparation(uuid,uuid,text,uuid,bigint,uuid) from public,anon,authenticated;
grant execute on function public.require_agency_authoring_scope(uuid,uuid,uuid,text),
 public.read_agency_package_command(uuid,uuid,text,uuid,uuid,text,integer,text),
 public.publish_agency_package(uuid,uuid,text,uuid,integer,jsonb),
 public.record_version_preparation(uuid,uuid,text,uuid,bigint,uuid) to service_role;
commit;
