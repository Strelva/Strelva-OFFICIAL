\set ON_ERROR_STOP on
-- Exact corrected recovery source/catalog/service-only ACL; no function replacement.
begin read only;
do $grouping$
declare catalog pg_proc%rowtype;
 signature constant text:='public.save_native_google_recovered_activation(uuid,uuid,text,text,integer,jsonb)';
 applied_hash constant text:='07c4df3b9c602f06b5dd9d78d3bc9f29332dbe852d19bed472c029ec7b0abedf';
begin
 select * into catalog from pg_proc where oid=to_regprocedure(signature);
 if not found or encode(pg_catalog.sha256(convert_to(catalog.prosrc,'UTF8')),'hex') is distinct from applied_hash
  then raise exception 'native_google_recovery_predecessor_drift'; end if;
 if catalog.proowner is distinct from (select relowner from pg_class where oid='public.workspace_account_bindings'::regclass)
  or (select lanname from pg_language where oid=catalog.prolang) is distinct from 'plpgsql'
  or catalog.prokind<>'f' or not catalog.prosecdef or catalog.proisstrict or catalog.proleakproof or catalog.proretset
  or catalog.provolatile<>'v' or catalog.proparallel<>'u' or catalog.prosupport<>0 or catalog.provariadic<>0
  or catalog.procost<>100 or catalog.prorows<>0 or catalog.probin is not null or catalog.prosqlbody is not null
  or catalog.prorettype<>'jsonb'::regtype
  or catalog.proargnames is distinct from array['p_workspace_id','p_user_id','p_verified_email','p_activation_id','p_expected_revision','p_activation']::text[]
  or catalog.proallargtypes is not null or catalog.proargmodes is not null or catalog.protrftypes is not null
  or catalog.pronargdefaults<>0 or catalog.proargdefaults is not null
  or catalog.proconfig is distinct from array['search_path=public, pg_temp']::text[]
  or exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
   where a.grantee not in (catalog.proowner,(select oid from pg_roles where rolname='service_role'))
    or a.grantor<>catalog.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable)
  or (select count(*) from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))))<>2
  or not exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
   where a.grantee=catalog.proowner and a.privilege_type='EXECUTE' and not a.is_grantable)
  or not exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
   where a.grantee=(select oid from pg_roles where rolname='service_role') and a.privilege_type='EXECUTE' and not a.is_grantable)
  then raise exception 'native_google_recovery_authority_drift'; end if;
end $grouping$;
rollback;
