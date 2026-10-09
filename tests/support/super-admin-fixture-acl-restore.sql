\set ON_ERROR_STOP on
-- Run BEFORE the rehearsal grants. Emit a transaction that removes only new
-- SELECT entries for the fixture's two roles and verifies the complete table
-- ACLs afterward. Existing grants (including grant options) remain intact.
select 'begin;';
select format('revoke select on %s from %I;', c.oid::regclass, r.rolname)
from pg_class c cross join pg_roles r
where c.oid in ('public.users'::regclass, 'public.audit_logs'::regclass)
  and r.rolname in ('authenticated', 'service_role')
  and not exists (
    select 1 from aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where a.grantee = r.oid and a.privilege_type = 'SELECT'
  )
order by c.oid::regclass::text, r.rolname;
with expected as (
  select md5(coalesce(string_agg(format('%s|%s|%s|%s|%s', c.oid::regclass, a.grantor, a.grantee, a.privilege_type, a.is_grantable), ','
    order by c.oid::regclass::text, a.grantor, a.grantee, a.privilege_type, a.is_grantable), '')) fingerprint
  from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  where c.oid in ('public.users'::regclass, 'public.audit_logs'::regclass)
)
select format($restore$
do $fixture_acl$
begin
  if %L is distinct from (
    select md5(coalesce(string_agg(format('%%s|%%s|%%s|%%s|%%s', c.oid::regclass, a.grantor, a.grantee, a.privilege_type, a.is_grantable), ','
      order by c.oid::regclass::text, a.grantor, a.grantee, a.privilege_type, a.is_grantable), ''))
    from pg_class c cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
    where c.oid in ('public.users'::regclass, 'public.audit_logs'::regclass)
  ) then raise exception 'super_admin_fixture_acl_restore_failed'; end if;
end;
$fixture_acl$;
$restore$, fingerprint) from expected;
select 'commit;';
