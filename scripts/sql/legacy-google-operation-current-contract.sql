\set ON_ERROR_STOP on
-- Exact final1751 six-function/private-table guard; readback never creates or repairs authority.
begin read only;
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
    if (select count(*) from aclexplode(coalesce(fn.proacl,acldefault('f',baseline_owner))))<>case when expected.service_execute then 2 else 1 end
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
rollback;
