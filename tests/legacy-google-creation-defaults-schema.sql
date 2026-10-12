\set ON_ERROR_STOP on
-- The maintained schema owners verify the ordinary prepared creation policy.
-- The scratch qualification additionally supplies explicit custom canaries.
begin read only;
do $policy_contract$
declare owner_oid oid;
begin
  select relowner into owner_oid from pg_class where oid='public.workspace_account_bindings'::regclass;
  if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole=owner_oid and d.defaclnamespace='public'::regnamespace and d.defaclobjtype in ('r','f')
      and a.grantee in (select oid from pg_roles where rolname in ('anon','authenticated','service_role'))) then
    raise exception 'known_implicit_creation_grant_survived';
  end if;
  if owner_oid<>(select oid from pg_roles where rolname=current_user) then
    raise exception 'creation_policy_creator_owner_mismatch';
  end if;
end $policy_contract$;
\if :{?creation_policy_custom_canary}
do $custom_canaries$
declare owner_oid oid;
begin
  select relowner into owner_oid from pg_class where oid='public.workspace_account_bindings'::regclass;
  if not exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole=owner_oid and d.defaclnamespace='public'::regnamespace and d.defaclobjtype='r'
      and a.grantee=(select oid from pg_roles where rolname='lg_policy_custom')
      and a.grantor=owner_oid and a.privilege_type='UPDATE' and not a.is_grantable)
    or not exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole=owner_oid and d.defaclnamespace=0 and d.defaclobjtype='f'
      and a.grantee=(select oid from pg_roles where rolname='lg_policy_global')
      and a.grantor=owner_oid and a.privilege_type='EXECUTE' and not a.is_grantable)
    or not exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole=owner_oid and d.defaclnamespace=0 and d.defaclobjtype='f'
      and a.grantee=0 and a.privilege_type='EXECUTE' and not a.is_grantable) then
    raise exception 'custom_global_or_builtin_creation_grant_erased';
  end if;
end $custom_canaries$;
\endif
rollback;
