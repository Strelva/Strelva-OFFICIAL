-- Roll back the application consumer first. Refuse changed same-signature
-- source, metadata, owner or grants before removing this exact additive RPC.
begin;
set local lock_timeout='2s';
set local statement_timeout='30s';
do $inverse$
declare
  target oid := to_regprocedure('public.write_tenant_booking_settings_fields(text,text,jsonb,jsonb)');
  catalog pg_proc%rowtype;
  service_owner oid := (select oid from pg_roles where rolname='service_role');
begin
  select * into catalog from pg_proc where oid=target;
  if not found or encode(sha256(convert_to(catalog.prosrc,'UTF8')),'hex') is distinct from
    '438660a6cd739eb617287ea2ab2ecbddf54d93b687ce8afba043be485d388010' then raise exception 'booking_settings_atomic_rollback_source_drift'; end if;
  if catalog.proowner is distinct from (select relowner from pg_class where oid='public.booking_settings'::regclass)
    or (select lanname from pg_language where oid=catalog.prolang) is distinct from 'plpgsql'
    or catalog.prokind<>'f' or not catalog.prosecdef or catalog.proisstrict or catalog.proleakproof or catalog.proretset
    or catalog.provolatile<>'v' or catalog.proparallel<>'u' or catalog.prosupport<>0 or catalog.provariadic<>0
    or catalog.procost<>100 or catalog.prorows<>0 or catalog.probin is not null or catalog.prosqlbody is not null
    or catalog.prorettype<>'jsonb'::regtype or catalog.proargtypes is distinct from '25 25 3802 3802'::oidvector
    or catalog.proargnames is distinct from array['p_tenant_id','p_kind','p_settings','p_initial_config']::text[]
    or catalog.proallargtypes is not null or catalog.proargmodes is not null or catalog.pronargdefaults<>0
    or catalog.proconfig is distinct from array['search_path=public, pg_temp']::text[]
    or service_owner is null
    or exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
      where a.grantee not in (catalog.proowner,service_owner) or a.grantor<>catalog.proowner
        or a.privilege_type<>'EXECUTE' or a.is_grantable)
    or (select count(*) from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))))<>2
    or not exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
      where a.grantee=catalog.proowner and a.privilege_type='EXECUTE' and not a.is_grantable)
    or not exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
      where a.grantee=service_owner and a.privilege_type='EXECUTE' and not a.is_grantable)
    then raise exception 'booking_settings_atomic_rollback_authority_drift'; end if;
  execute 'drop function public.write_tenant_booking_settings_fields(text,text,jsonb,jsonb)';
end $inverse$;
commit;
