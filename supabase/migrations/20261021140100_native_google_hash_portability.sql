-- Additive correction: native grant/inverse hashes use the built-in SHA-256
-- rather than pgcrypto installation schema or function search-path visibility.
-- Pin both complete predecessor bodies and authority before any replacement.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
select pg_advisory_xact_lock(771904091);
do $portability$
declare target record; catalog pg_proc%rowtype; definition text; replacement text;
 snapshots jsonb:='[]'::jsonb; item jsonb; properties jsonb;
begin
 for target in select * from (values
   ('public.native_google_owner_lifecycle(uuid,text,uuid,text,jsonb)','b40291687687d8491e39bfee5bcb5c5b21a0d6dc1e603727f3adea2cfd6ed09f','597f3ffe25448bf40f2c82ba47828b8949ca7145920025b9e154dba5bd024bd2',array['p_user_id','p_verified_email','p_workspace_id','p_action','p_input'],'jsonb','''{}''::jsonb',2),
   ('public.verify_native_google_inverse_intent(uuid,uuid,text,jsonb,uuid,uuid,text)','6ef12d0b620ce788ea8c194617cf3150f21615d1a7e1707ade0752bf3567ad59','e586808f9cb63173a97ae54cdead6da5e0752617b2fa509389d1de0500e6e3a3',array['p_workspace_id','p_user_id','p_verified_email','p_request','p_original_id','p_inverse_id','p_service_actor'],'boolean','NULL::text',1)
 ) expected(signature,prior_hash,applied_hash,arguments,return_type,argument_default,digest_calls) loop
  select * into catalog from pg_proc where oid=to_regprocedure(target.signature);
  if not found or encode(pg_catalog.sha256(convert_to(catalog.prosrc,'UTF8')),'hex') is distinct from target.prior_hash
   then raise exception 'native_google_hash_predecessor_drift'; end if;
  if catalog.proowner is distinct from (select relowner from pg_class where oid='public.workspace_account_bindings'::regclass)
   or (select lanname from pg_language where oid=catalog.prolang) is distinct from 'plpgsql'
   or catalog.prokind<>'f' or not catalog.prosecdef or catalog.proisstrict or catalog.proleakproof or catalog.proretset
   or catalog.provolatile<>'v' or catalog.proparallel<>'u' or catalog.prosupport<>0 or catalog.provariadic<>0
   or catalog.procost<>100 or catalog.prorows<>0 or catalog.probin is not null or catalog.prosqlbody is not null
   or catalog.prorettype<>target.return_type::regtype or catalog.proargnames is distinct from target.arguments
   or catalog.proallargtypes is not null or catalog.proargmodes is not null or catalog.pronargdefaults<>1
   or pg_get_expr(catalog.proargdefaults,0) is distinct from target.argument_default
   or catalog.proconfig is distinct from array['search_path=public, pg_temp']::text[]
   or exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
    where a.grantee not in (catalog.proowner,(select oid from pg_roles where rolname='service_role'))
     or a.grantor<>catalog.proowner or a.privilege_type<>'EXECUTE' or a.is_grantable)
   or (select count(*) from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))))<>2
   or not exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
    where a.grantee=catalog.proowner and a.privilege_type='EXECUTE' and not a.is_grantable)
   or not exists(select 1 from aclexplode(coalesce(catalog.proacl,acldefault('f',catalog.proowner))) a
    where a.grantee=(select oid from pg_roles where rolname='service_role') and a.privilege_type='EXECUTE' and not a.is_grantable)
   then raise exception 'native_google_hash_authority_drift'; end if;
  definition:=pg_get_functiondef(catalog.oid);
  if (length(definition)-length(replace(definition,'digest(','')))/7<>target.digest_calls
   then raise exception 'native_google_hash_predecessor_drift'; end if;
  replacement:=replace(replace(definition,'digest(','pg_catalog.sha256('),$old$,'sha256')$old$,$new$)$new$);
  snapshots:=snapshots||jsonb_build_array(jsonb_build_object('signature',target.signature,'definition',replacement,
   'hash',target.applied_hash,'properties',to_jsonb(catalog)-array['oid','prosrc','prosqlbody']));
 end loop;
 for item in select value from jsonb_array_elements(snapshots) loop
  execute item->>'definition';
  select to_jsonb(p)-array['oid','prosrc','prosqlbody'] into properties from pg_proc p where p.oid=to_regprocedure(item->>'signature');
  if properties is distinct from item->'properties'
   or (select encode(pg_catalog.sha256(convert_to(prosrc,'UTF8')),'hex') from pg_proc where oid=to_regprocedure(item->>'signature')) is distinct from item->>'hash'
   then raise exception 'native_google_hash_replacement_drift'; end if;
 end loop;
end $portability$;
commit;
