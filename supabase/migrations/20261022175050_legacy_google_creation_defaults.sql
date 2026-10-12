-- Prepared prerequisite for the still-unapplied legacy Google authority tail.
-- Later public objects require explicit role ACLs. Existing object ACLs remain
-- untouched. Do not apply to production without the release preflight/approval.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
set local search_path=pg_catalog,public,pg_temp;

do $legacy_google_creation_defaults$
declare baseline_owner oid;
begin
  select relowner into baseline_owner from pg_class
    where oid='public.workspace_account_bindings'::regclass;
  if baseline_owner is null or baseline_owner<>(select oid from pg_roles where rolname=current_user)
    or baseline_owner=(select oid from pg_roles where rolname='service_role') then
    raise exception 'legacy_google_creation_defaults_owner_invalid';
  end if;
  -- Only ordinary Supabase role grants are eligible for removal. Never erase
  -- grant options or a foreign grantor and thereby conceal authority drift.
  if exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole=baseline_owner and d.defaclnamespace='public'::regnamespace
      and d.defaclobjtype in ('r','f')
      and a.grantee in (select oid from pg_roles where rolname in ('anon','authenticated','service_role'))
      and (a.is_grantable or a.grantor<>baseline_owner)) then
    raise exception 'legacy_google_creation_defaults_authority_invalid';
  end if;
end $legacy_google_creation_defaults$;

-- These alter only the current creator's schema-scoped future-object defaults.
-- Built-in PUBLIC function EXECUTE, global defaults, owner privileges and all
-- unknown/custom grantees survive. The unchanged 1751 guard refuses unexpected
-- named/custom privileges. Its global owner-revoked table-default case remains
-- unqualified: PostgreSQL can represent that table ACL as NULL. No claim of
-- comprehensive creation/default-authority qualification is made here.
alter default privileges in schema public revoke all on tables from anon,authenticated,service_role;
alter default privileges in schema public revoke all on functions from anon,authenticated,service_role;
commit;
