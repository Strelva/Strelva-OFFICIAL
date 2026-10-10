-- Legacy tenant Google callbacks and settings commits. No provider calls.
-- Complete replacement of the unintegrated 8cca packet, authorized by root;
-- every pre-8cca migration remains byte-identical. Both trusted service and
-- actor-bound operations admit and persist all authoritative records together.
-- Existing backfill writers remain intact.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
set local search_path=pg_catalog,public,pg_temp;

create table public.legacy_google_operation_watermarks (
  tenant_stable_id uuid primary key references public.tenants(stable_id) on delete cascade,
  latest_started_at timestamptz not null check (isfinite(latest_started_at))
);
alter table public.legacy_google_operation_watermarks enable row level security;
-- Inspect the created ACL before named REVOKEs can hide hostile defaults.
do $legacy_google_table_defaults$
declare baseline_owner oid;
begin
  select relowner into baseline_owner from pg_class where oid='public.workspace_account_bindings'::regclass;
  if not exists(select 1 from pg_class where oid='public.legacy_google_operation_watermarks'::regclass
    and relowner=baseline_owner and coalesce(relacl,acldefault('r',baseline_owner))=acldefault('r',baseline_owner)) then
    raise exception 'legacy_google_creation_authority_invalid'; end if;
end $legacy_google_table_defaults$;
revoke all on public.legacy_google_operation_watermarks from public,anon,authenticated,service_role;

-- Same compact, recursive key sorting as clientRecordHash. Credentials stay in
-- the existing encrypted record; this helper has no independent service ACL.
create function public.legacy_google_canonical_json(p_value jsonb) returns text
language plpgsql immutable set search_path=public,pg_temp as $$
declare result text;
begin
  if jsonb_typeof(p_value)='object' then
    select '{'||coalesce(string_agg(to_jsonb(key)::text||':'||public.legacy_google_canonical_json(value),',' order by key collate "C"),'')||'}'
      into result from jsonb_each(p_value);
  elsif jsonb_typeof(p_value)='array' then
    select '['||coalesce(string_agg(public.legacy_google_canonical_json(value),',' order by ordinality),'')||']'
      into result from jsonb_array_elements(p_value) with ordinality;
  else result:=coalesce(p_value::text,'null'); end if;
  return result;
end $$;

create function public.legacy_google_location_digest(p_binding_id uuid) returns text
language sql stable set search_path=public,pg_temp as $$
  select encode(pg_catalog.sha256(convert_to(jsonb_build_object('generation',b.location_selection_generation,
    'locations',public.native_google_location_selection(b.id))::text,'UTF8')),'hex')
  from public.workspace_account_bindings b where b.id=p_binding_id
$$;

create function public.read_legacy_google_operation(p_tenant_id text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare stable uuid; workspace uuid; b public.workspace_account_bindings%rowtype;
begin
  if p_tenant_id is null or p_tenant_id like 'workspace-%' or char_length(p_tenant_id) not between 1 and 120 then
    raise exception 'legacy_google_operation_invalid'; end if;
  perform pg_advisory_xact_lock(771904091);
  select t.stable_id into stable from public.tenants t where t.id=p_tenant_id for share nowait;
  if stable is null then raise exception 'legacy_google_operation_invalid'; end if;
  select l.workspace_id into workspace from public.tenant_workspace_links l where l.tenant_stable_id=stable for share nowait;
  if workspace is not null then
    perform 1 from public.workspaces w where w.id=workspace and w.kind='customer' for share nowait;
    if not found then raise exception 'legacy_google_operation_invalid'; end if;
    select * into b from public.workspace_account_bindings where workspace_id=workspace and provider='google'
      and origin_tenant_stable_id=stable for share nowait;
  end if;
  return jsonb_build_object('tenantId',p_tenant_id,'tenantStableId',stable,'workspaceId',workspace,
    'bindingId',b.id,'bindingUpdatedAt',b.updated_at::text,'locationDigest',public.legacy_google_location_digest(b.id));
exception when lock_not_available then raise exception 'legacy_google_operation_superseded';
end $$;

-- Private shared implementation. A NULL kind is the pre-existing trusted
-- service authority, never an actor-facing permission bypass.
create function public.legacy_google_commit(
  p_user_id uuid,p_verified_email text,p_kind text,p_pin jsonb,p_input jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare stable uuid; actual_stable uuid; workspace uuid; pin_workspace uuid; pin_binding uuid;
  pin_updated timestamptz; started timestamptz; latest timestamptz; actor_email text;
  b public.workspace_account_bindings%rowtype; grant_input jsonb; location_input jsonb;
  connection jsonb; metadata jsonb; prior public.tenant_client_records%rowtype; result jsonb; binding uuid;
begin
  if p_pin is null or jsonb_typeof(p_pin) is distinct from 'object'
    or not (p_pin ?& array['tenantId','tenantStableId','workspaceId','bindingId','bindingUpdatedAt','locationDigest','startedAt'])
    or (p_pin-array['tenantId','tenantStableId','workspaceId','bindingId','bindingUpdatedAt','locationDigest','startedAt'])<>'{}'::jsonb
    or jsonb_typeof(p_pin->'tenantId') is distinct from 'string' or p_pin->>'tenantId' like 'workspace-%'
    or char_length(p_pin->>'tenantId') not between 1 and 120
    or jsonb_typeof(p_pin->'tenantStableId') is distinct from 'string'
    or jsonb_typeof(p_pin->'startedAt') is distinct from 'string'
    or jsonb_typeof(p_pin->'workspaceId') not in ('string','null')
    or jsonb_typeof(p_pin->'bindingId') not in ('string','null')
    or jsonb_typeof(p_pin->'bindingUpdatedAt') not in ('string','null')
    or jsonb_typeof(p_pin->'locationDigest') not in ('string','null')
    or p_input is null or jsonb_typeof(p_input) is distinct from 'object'
    or (p_input-array['grant','location'])<>'{}'::jsonb or p_input='{}'::jsonb
    or (p_kind is not null and p_kind not in ('oauth','location')) then raise exception 'legacy_google_operation_invalid'; end if;
  begin
    stable:=(p_pin->>'tenantStableId')::uuid; pin_workspace:=(p_pin->>'workspaceId')::uuid;
    pin_binding:=(p_pin->>'bindingId')::uuid; pin_updated:=(p_pin->>'bindingUpdatedAt')::timestamptz;
    started:=(p_pin->>'startedAt')::timestamptz;
  exception when others then raise exception 'legacy_google_operation_invalid'; end;
  if stable is null or started is null or not isfinite(started) or started>clock_timestamp()+interval '1 minute'
    or (pin_binding is null) is distinct from (pin_updated is null)
    or (pin_binding is null) is distinct from ((p_pin->>'locationDigest') is null)
    or (pin_binding is not null and ((p_pin->>'locationDigest') !~ '^[0-9a-f]{64}$' or pin_workspace is null)) then
    raise exception 'legacy_google_operation_invalid'; end if;

  -- Historical client-record writers acquire their per-record advisory before
  -- their statement trigger acquires the common Google admission lock. Keep
  -- that order: holding global first then requesting a record lock deadlocks.
  perform pg_advisory_xact_lock(hashtextextended(stable::text||':provider_connections:google',9106));
  perform pg_advisory_xact_lock(hashtextextended(stable::text||':provider_metadata:google',9106));
  perform pg_advisory_xact_lock(771904091);
  -- Old unlink/teardown transactions hold their parent row before entering the
  -- global trigger. Never wait for those rows while holding global admission.
  -- Contention refuses the whole operation; admitted rows stay locked to commit.
  select t.stable_id into actual_stable from public.tenants t where t.id=p_pin->>'tenantId' for share nowait;
  if actual_stable is distinct from stable then raise exception 'legacy_google_operation_superseded'; end if;
  select l.workspace_id into workspace from public.tenant_workspace_links l where l.tenant_stable_id=stable for share nowait;
  if workspace is distinct from pin_workspace then raise exception 'legacy_google_operation_superseded'; end if;
  if workspace is not null then
    perform 1 from public.workspaces w where w.id=workspace and w.kind='customer' for share nowait;
    if not found then raise exception 'legacy_google_operation_superseded'; end if;
  end if;

  if p_kind is not null then
    if p_user_id is null or p_verified_email is null or char_length(btrim(p_verified_email)) not between 3 and 320 then
      raise exception 'google_settings_permission_denied'; end if;
    select u.email into actor_email from public.users u where u.id=p_user_id and u.verified_at is not null
      and lower(u.email)=lower(btrim(p_verified_email)) for share nowait;
    if actor_email is null then raise exception 'google_settings_permission_denied'; end if;
    perform 1 from public.super_admins a where a.user_id=p_user_id and a.revoked_at is null
      and lower(a.email)=lower(actor_email) for share nowait;
    if not found then
      perform 1 from public.memberships m where m.user_id=p_user_id and m.tenant_id=p_pin->>'tenantId'
        and m.tenant_stable_id=stable and m.role in ('editor','admin','owner') for share nowait;
      if not found then raise exception 'google_settings_permission_denied'; end if;
    end if;
  end if;
  select * into b from public.workspace_account_bindings where workspace_id=workspace and provider='google'
    and origin_tenant_stable_id=stable for update nowait;
  if b.id is distinct from pin_binding or b.updated_at is distinct from pin_updated
    or public.legacy_google_location_digest(b.id) is distinct from (p_pin->>'locationDigest') then
    raise exception 'legacy_google_operation_superseded'; end if;
  -- A governed reconnect can exchange its token before reading this snapshot.
  -- Its original start still precedes a later completed binding operation.
  if b.updated_at is not null and started<=b.updated_at then raise exception 'legacy_google_operation_superseded'; end if;
  perform 1 from public.workspace_google_locations where binding_id=b.id for update nowait;
  select w.latest_started_at into latest from public.legacy_google_operation_watermarks w where w.tenant_stable_id=stable for update nowait;
  if latest is not null and started<=latest then raise exception 'legacy_google_operation_superseded'; end if;
  perform 1 from public.tenant_client_records r where r.tenant_stable_id=stable and r.record_id='google'
    and r.store in ('provider_connections','provider_metadata') for update nowait;
  -- Also fence removals/newer legacy repairs which predate this API. Ties are
  -- refused rather than letting two independently started operations win.
  if exists(select 1 from public.tenant_client_records r where r.tenant_stable_id=stable and r.record_id='google'
    and r.store in ('provider_connections','provider_metadata') and r.captured_at>=started) then
    raise exception 'legacy_google_operation_superseded'; end if;

  grant_input:=p_input->'grant'; location_input:=p_input->'location';
  if p_kind='oauth' and grant_input is null or p_kind='location' and (grant_input is not null or location_input is null) then
    raise exception 'legacy_google_operation_invalid'; end if;
  if grant_input is not null then
    if jsonb_typeof(grant_input) is distinct from 'object'
      or not(grant_input ?& array['workspaceId','originTenantStableId','scopes','subject','refreshTokenCiphertext','accessTokenCiphertext','tokenExpiresAt','status'])
      or (grant_input-array['workspaceId','originTenantStableId','scopes','subject','refreshTokenCiphertext','accessTokenCiphertext','tokenExpiresAt','status'])<>'{}'::jsonb
      or grant_input->>'status' is distinct from 'connected'
      or grant_input->>'workspaceId' is distinct from coalesce(workspace::text,'')
      or grant_input->>'originTenantStableId' is distinct from stable::text
      or jsonb_typeof(grant_input->'accessTokenCiphertext') is distinct from 'string'
      or nullif(grant_input->>'accessTokenCiphertext','') is null
      or jsonb_typeof(grant_input->'refreshTokenCiphertext') not in ('string','null')
      or jsonb_typeof(grant_input->'subject') not in ('string','null')
      or jsonb_typeof(grant_input->'scopes') not in ('array','null')
      or jsonb_typeof(grant_input->'tokenExpiresAt') is distinct from 'string'
      or not public.account_binding_ciphertext_valid(grant_input->>'accessTokenCiphertext')
      or not public.account_binding_ciphertext_valid(grant_input->>'refreshTokenCiphertext') then
      raise exception 'legacy_google_operation_invalid'; end if;
    if jsonb_typeof(grant_input->'scopes')='array' then
      if jsonb_array_length(grant_input->'scopes')>40 or exists(select 1 from jsonb_array_elements(grant_input->'scopes') x
        where jsonb_typeof(x.value) is distinct from 'string' or char_length(x.value#>>'{}') not between 1 and 300) then
        raise exception 'legacy_google_operation_invalid'; end if;
    end if;
    begin
      if not isfinite((grant_input->>'tokenExpiresAt')::timestamptz) or (grant_input->>'tokenExpiresAt')::timestamptz<=clock_timestamp() then
        raise exception 'legacy_google_operation_invalid'; end if;
    exception when others then raise exception 'legacy_google_operation_invalid'; end;
    if grant_input->>'subject' is not null and char_length(btrim(grant_input->>'subject')) not between 1 and 255 then
      raise exception 'legacy_google_operation_invalid'; end if;
  end if;
  if location_input is not null then
    if jsonb_typeof(location_input) is distinct from 'object'
      or not(location_input ?& array['accountId','locationId','title'])
      or (location_input-array['accountId','locationId','title'])<>'{}'::jsonb
      or jsonb_typeof(location_input->'accountId') is distinct from 'string'
      or jsonb_typeof(location_input->'locationId') is distinct from 'string'
      or location_input->>'accountId' !~ '^accounts/[A-Za-z0-9_-]{1,64}$'
      or location_input->>'locationId' !~ '^[A-Za-z0-9_-]{1,64}$'
      or jsonb_typeof(location_input->'title') not in ('string','null')
      or (location_input->>'title' is not null and char_length(btrim(location_input->>'title')) not between 1 and 200) then
      raise exception 'legacy_google_operation_invalid'; end if;
    if grant_input is null then
      if workspace is not null then
        if b.id is null or b.status is distinct from 'connected' or (b.scopes is not null and not('https://www.googleapis.com/auth/business.manage'=any(b.scopes))) then
          raise exception 'legacy_google_operation_invalid'; end if;
      else
        select * into prior from public.tenant_client_records where tenant_stable_id=stable and store='provider_connections'
          and record_id='google' and removed_at is null for update nowait;
        if prior.id is null or prior.payload->>'status' is distinct from 'connected'
          or (prior.payload ? 'scopes' and prior.payload->'scopes'<>'null'::jsonb and
            not(prior.payload->'scopes' @> '["https://www.googleapis.com/auth/business.manage"]'::jsonb)) then
          raise exception 'legacy_google_operation_invalid'; end if;
      end if;
    elsif grant_input->'scopes'<>'null'::jsonb and not(grant_input->'scopes' @> '["https://www.googleapis.com/auth/business.manage"]'::jsonb) then
      raise exception 'legacy_google_operation_invalid';
    end if;
  end if;

  -- A governed service caller keeps its existing authority, but must use this
  -- same transaction for credential/metadata writes and canonical admission.
  if grant_input is not null then
    select * into prior from public.tenant_client_records where tenant_stable_id=stable and store='provider_connections'
      and record_id='google' and removed_at is null for update nowait;
    connection:=jsonb_build_object('provider','google','tenantId',p_pin->>'tenantId','accessToken',grant_input->>'accessTokenCiphertext',
      'expiresAt',grant_input->>'tokenExpiresAt','status','connected','lastSyncedAt',p_pin->>'startedAt');
    if grant_input->>'refreshTokenCiphertext' is not null then connection:=connection||jsonb_build_object('refreshToken',grant_input->>'refreshTokenCiphertext');
    elsif prior.payload->>'refreshToken' is not null then connection:=connection||jsonb_build_object('refreshToken',prior.payload->>'refreshToken'); end if;
    if grant_input->'scopes'<>'null'::jsonb then connection:=connection||jsonb_build_object('scopes',grant_input->'scopes'); end if;
    result:=public.record_tenant_client_record(p_pin->>'tenantId','provider_connections','google',connection,
      encode(pg_catalog.sha256(convert_to(public.legacy_google_canonical_json(connection),'UTF8')),'hex'),started,'dual_write','replace');
    if result->>'status' is null or result->>'status' not in ('recorded','updated','unchanged') then raise exception 'legacy_google_operation_superseded'; end if;
  end if;
  if location_input is not null then
    metadata:=jsonb_build_object('value',jsonb_build_object('accountId',location_input->>'accountId','locationId',location_input->>'locationId'));
    result:=public.record_tenant_client_record(p_pin->>'tenantId','provider_metadata','google',metadata,
      encode(pg_catalog.sha256(convert_to(public.legacy_google_canonical_json(metadata),'UTF8')),'hex'),started,'dual_write','replace');
    if result->>'status' is null or result->>'status' not in ('recorded','updated','unchanged') then raise exception 'legacy_google_operation_superseded'; end if;
  end if;
  binding:=b.id;
  if workspace is not null then
    if grant_input is not null then
      result:=public.upsert_workspace_account_binding(grant_input||jsonb_build_object('provider','google'),'oauth');
      binding:=(result->>'id')::uuid;
      if binding is null then raise exception 'legacy_google_operation_invalid'; end if;
    end if;
    if location_input is not null then
      perform public.upsert_workspace_google_location(binding,location_input->>'accountId',location_input->>'locationId',location_input->>'title');
      update public.workspace_account_bindings set updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=binding;
    end if;
  end if;
  insert into public.legacy_google_operation_watermarks(tenant_stable_id,latest_started_at) values(stable,started)
    on conflict(tenant_stable_id) do update set latest_started_at=excluded.latest_started_at;
  return jsonb_build_object('status','applied','bindingId',binding);
exception when lock_not_available then raise exception 'legacy_google_operation_superseded';
end $$;

create function public.commit_legacy_google_binding_operation(p_pin jsonb,p_input jsonb) returns jsonb
language sql security definer set search_path=public,pg_temp as $$
  select public.legacy_google_commit(null,null,null,p_pin,p_input)
$$;
create function public.apply_legacy_google_operation(p_user_id uuid,p_verified_email text,p_pin jsonb,p_kind text,p_input jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_kind is null or p_kind not in ('oauth','location') then raise exception 'legacy_google_operation_invalid'; end if;
  return public.legacy_google_commit(p_user_id,p_verified_email,p_kind,p_pin,p_input);
end $$;
-- Built-in PUBLIC EXECUTE may be removed by the deliberate REVOKE below.
-- Every other inherited grant, grant option or missing owner entry is refused
-- before a named-role REVOKE could erase the evidence of hostile defaults.
do $legacy_google_function_defaults$
declare fn record; baseline_owner oid;
begin
  select relowner into baseline_owner from pg_class where oid='public.workspace_account_bindings'::regclass;
  for fn in select * from pg_proc where pronamespace='public'::regnamespace and proname in
    ('legacy_google_canonical_json','legacy_google_location_digest','read_legacy_google_operation','legacy_google_commit',
     'commit_legacy_google_binding_operation','apply_legacy_google_operation') loop
    if fn.proowner<>baseline_owner or not exists(select 1 from aclexplode(coalesce(fn.proacl,acldefault('f',baseline_owner))) a
      where a.grantee=baseline_owner and a.grantor=baseline_owner and a.privilege_type='EXECUTE' and not a.is_grantable)
      or exists(select 1 from aclexplode(coalesce(fn.proacl,acldefault('f',baseline_owner))) a where a.grantor<>baseline_owner
        or a.privilege_type<>'EXECUTE' or a.is_grantable or a.grantee not in (0,baseline_owner)) then
      raise exception 'legacy_google_creation_authority_invalid'; end if;
  end loop;
end $legacy_google_function_defaults$;
revoke all on function public.legacy_google_canonical_json(jsonb),public.legacy_google_location_digest(uuid),
  public.legacy_google_commit(uuid,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.read_legacy_google_operation(text),public.commit_legacy_google_binding_operation(jsonb,jsonb),
  public.apply_legacy_google_operation(uuid,text,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.read_legacy_google_operation(text),public.commit_legacy_google_binding_operation(jsonb,jsonb),
  public.apply_legacy_google_operation(uuid,text,jsonb,text,jsonb) to service_role;

-- Creation is not admitted until the complete source/authority surface is
-- verified. Named REVOKEs cannot remove grants to unknown default-ACL roles;
-- refuse those defaults atomically instead of committing exposed helpers.
-- The baseline owner is the existing canonical binding table owner, never a
-- mutable newly-created helper, journal, or role supplied by the caller.
do $legacy_google_creation_guard$
declare expected record; fn record; baseline_owner oid; service_oid oid; table_oid oid; column_drift boolean;
  expected_not_null_count integer:=case when current_setting('server_version_num')::integer>=180000 then 2 else 0 end;
  expected_statistics_target integer:=case when current_setting('server_version_num')::integer>=170000 then null else -1 end;
begin
  select relowner into baseline_owner from pg_class where oid='public.workspace_account_bindings'::regclass;
  select oid into service_oid from pg_roles where rolname='service_role';
  if baseline_owner is null or service_oid is null or baseline_owner=service_oid then
    raise exception 'legacy_google_creation_authority_invalid'; end if;
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in
    ('legacy_google_canonical_json','legacy_google_location_digest','read_legacy_google_operation','legacy_google_commit',
     'commit_legacy_google_binding_operation','apply_legacy_google_operation'))<>6 then
    raise exception 'legacy_google_creation_authority_invalid'; end if;
  for expected in select * from (values
    ('public.legacy_google_canonical_json(jsonb)','plpgsql',false,'i','text',array['p_value'],false,'e1688cbf1136d86311a218e80a6be147f77c611c1662794b4fcc04cfad9bc44f'),
    ('public.legacy_google_location_digest(uuid)','sql',false,'s','text',array['p_binding_id'],false,'2944eb93ece8c36b44aeefc6a7d00aec34986ead6413ad104dc9780d326db154'),
    ('public.read_legacy_google_operation(text)','plpgsql',true,'v','jsonb',array['p_tenant_id'],true,'2d3ea5e815cc79208cd423a18663a93ba65d14c66f3fbe94794e399de95e0f71'),
    ('public.legacy_google_commit(uuid,text,text,jsonb,jsonb)','plpgsql',true,'v','jsonb',array['p_user_id','p_verified_email','p_kind','p_pin','p_input'],false,'25af30419d432a82f1a4b16bb3f30e23e0c0cfd0c19c7b16258719518594f70f'),
    ('public.commit_legacy_google_binding_operation(jsonb,jsonb)','sql',true,'v','jsonb',array['p_pin','p_input'],true,'b157d8d9d05a85a9e57acd8c1bcb67eef39f38aadf1d5979811f37094bdebfda'),
    ('public.apply_legacy_google_operation(uuid,text,jsonb,text,jsonb)','plpgsql',true,'v','jsonb',array['p_user_id','p_verified_email','p_pin','p_kind','p_input'],true,'78ee4c285ca949b0ddb7ca6f5293f97373983ddee8f97b8a0a6691697e0cfe91')
  ) as v(signature,language_name,security_definer,volatility,return_type,argument_names,service_execute,source_hash) loop
    select p.*,l.lanname into fn from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(expected.signature);
    if not found or fn.proowner<>baseline_owner or fn.lanname<>expected.language_name
      or fn.prokind<>'f' or fn.prosecdef is distinct from expected.security_definer
      or fn.provolatile::text<>expected.volatility or fn.prorettype<>to_regtype(expected.return_type)
      or fn.proargnames is distinct from expected.argument_names or fn.pronargs<>cardinality(expected.argument_names)
      or fn.proargmodes is not null or fn.proallargtypes is not null or fn.pronargdefaults<>0 or fn.proargdefaults is not null
      or fn.provariadic<>0 or fn.proretset or fn.proisstrict or fn.proleakproof or fn.proparallel<>'u'
      or fn.procost<>100 or fn.prorows<>0 or fn.prosupport<>0 or fn.probin is not null or fn.prosqlbody is not null
      or fn.protrftypes is not null or fn.proconfig is distinct from array['search_path=public, pg_temp']
      or encode(pg_catalog.sha256(convert_to(fn.prosrc,'UTF8')),'hex')<>expected.source_hash then
      raise exception 'legacy_google_creation_authority_invalid'; end if;
    -- Explicit owner EXECUTE is required even though ownership carries implicit
    -- administrative powers. A revoked owner ACL is drift, not a new baseline.
    if (select count(*) from aclexplode(coalesce(fn.proacl,acldefault('f',baseline_owner))))<>(case when expected.service_execute then 2 else 1 end)
      or not exists(select 1 from aclexplode(coalesce(fn.proacl,acldefault('f',baseline_owner))) a where a.grantee=baseline_owner
        and a.grantor=baseline_owner and a.privilege_type='EXECUTE' and not a.is_grantable)
      or (expected.service_execute and not exists(select 1 from aclexplode(coalesce(fn.proacl,acldefault('f',baseline_owner))) a
        where a.grantee=service_oid and a.grantor=baseline_owner and a.privilege_type='EXECUTE' and not a.is_grantable))
      or exists(select 1 from aclexplode(coalesce(fn.proacl,acldefault('f',baseline_owner))) a where a.grantor<>baseline_owner
        or a.privilege_type<>'EXECUTE' or a.is_grantable or (a.grantee<>baseline_owner and (not expected.service_execute or a.grantee<>service_oid))) then
      raise exception 'legacy_google_creation_authority_invalid'; end if;
  end loop;

  table_oid:=to_regclass('public.legacy_google_operation_watermarks');
  if not exists(select 1 from pg_class c join pg_am am on am.oid=c.relam where c.oid=table_oid
    and c.relowner=baseline_owner and c.relkind='r' and c.relpersistence='p' and not c.relispartition and am.amname='heap'
    and c.relrowsecurity and not c.relforcerowsecurity and c.reloptions is null and c.reltablespace=0 and c.relnatts=2 and c.relchecks=1
    and c.relreplident='d' and c.reltoastrelid=0
    and coalesce(c.relacl,acldefault('r',baseline_owner))=acldefault('r',baseline_owner))
    or exists(select 1 from pg_policy where polrelid=table_oid)
    or exists(select 1 from pg_trigger where tgrelid=table_oid and not tgisinternal)
    or exists(select 1 from pg_rewrite where ev_class=table_oid)
    or exists(select 1 from pg_inherits where inhrelid=table_oid or inhparent=table_oid)
    or exists(select 1 from pg_attribute where attrelid=table_oid and attnum>0 and (attisdropped or attacl is not null)) then
    raise exception 'legacy_google_creation_authority_invalid'; end if;
  select exists(select 1 from
    (values(1,'tenant_stable_id','uuid'::regtype),(2,'latest_started_at','timestamptz'::regtype)) e(position,name,type_oid)
    full join (select * from pg_attribute where attrelid=table_oid and attnum>0) a on a.attnum=e.position
    where e.position is null or a.attnum is null or a.attname<>e.name or a.atttypid<>e.type_oid or a.attisdropped or not a.attnotnull
      or a.atttypmod<>-1 or a.attndims<>0 or a.attcollation<>0 or not a.attislocal or a.attinhcount<>0
      or a.atthasdef or a.attidentity<>'' or a.attgenerated<>'' or a.attacl is not null
      or a.attstorage<>'p' or a.attcompression<>'' or a.attstattarget is distinct from expected_statistics_target
      or a.atthasmissing or a.attmissingval is not null or a.attoptions is not null or a.attfdwoptions is not null) into column_drift;
  if column_drift or exists(select 1 from pg_attrdef where adrelid=table_oid)
    or (select count(*) from pg_constraint where conrelid=table_oid and contype<>'n')<>3
    or (select count(*) from pg_constraint where conrelid=table_oid and contype='n')<>expected_not_null_count
    or (expected_not_null_count=2 and (not exists(select 1 from pg_constraint where conrelid=table_oid and contype='n' and conkey=array[1]::smallint[])
      or not exists(select 1 from pg_constraint where conrelid=table_oid and contype='n' and conkey=array[2]::smallint[])))
    or not exists(select 1 from pg_constraint where conrelid=table_oid and contype='p' and conkey=array[1]::smallint[])
    or not exists(select 1 from pg_constraint where conrelid=table_oid and contype='f' and conkey=array[1]::smallint[]
      and confrelid='public.tenants'::regclass and confkey=array[(select attnum from pg_attribute where attrelid='public.tenants'::regclass and attname='stable_id')]::smallint[]
      and confupdtype='a' and confdeltype='c' and confmatchtype='s')
    or not exists(select 1 from pg_constraint where conrelid=table_oid and contype='c' and conkey=array[2]::smallint[]
      and pg_get_constraintdef(oid)='CHECK (isfinite(latest_started_at))')
    or exists(select 1 from pg_constraint c where conrelid=table_oid and (condeferrable or condeferred or not convalidated or not conislocal or coninhcount<>0
      or coalesce((to_jsonb(c)->>'conenforced')::boolean,true) is not true))
    or (select count(*) from pg_index where indrelid=table_oid)<>1
    or not exists(select 1 from pg_index i join pg_class c on c.oid=i.indexrelid join pg_am am on am.oid=c.relam
      where i.indrelid=table_oid and c.relowner=baseline_owner and c.relkind='i' and am.amname='btree'
      and i.indisprimary and i.indisunique and i.indisvalid and i.indisready and i.indislive
      and not i.indisexclusion and not i.indcheckxmin and not i.indisreplident and i.indimmediate and i.indnatts=1 and i.indnkeyatts=1 and i.indkey::text='1'
      and i.indpred is null and i.indexprs is null and i.indcollation::text='0' and i.indoption::text='0') then
    raise exception 'legacy_google_creation_authority_invalid'; end if;
end $legacy_google_creation_guard$;
commit;
